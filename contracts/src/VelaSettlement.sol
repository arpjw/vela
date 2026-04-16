// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VelaSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public operator;
    uint256 public constant EMERGENCY_DELAY = 7 days;

    struct Balance {
        uint256 amount;
        uint256 emergencyUnlockAt;
    }

    // user => asset => Balance
    mapping(address => mapping(address => Balance)) public balances;

    // ETH represented as address(0)
    address public constant ETH = address(0);

    event Deposited(address indexed user, address indexed asset, uint256 amount);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount);
    event EmergencyExitInitiated(address indexed user, address indexed asset, uint256 unlockAt);
    event EmergencyExitExecuted(address indexed user, address indexed asset, uint256 amount);

    constructor(address _operator) {
        operator = _operator;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    function depositETH() external payable nonReentrant {
        require(msg.value > 0, "Zero amount");
        balances[msg.sender][ETH].amount += msg.value;
        emit Deposited(msg.sender, ETH, msg.value);
    }

    function depositToken(address asset, uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(asset != ETH, "Use depositETH for ETH");
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][asset].amount += amount;
        emit Deposited(msg.sender, asset, amount);
    }

    function withdraw(
        address asset,
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(balances[msg.sender][asset].amount >= amount, "Insufficient balance");

        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(msg.sender, asset, amount, nonce, block.chainid))
        ));
        address signer = recoverSigner(hash, signature);
        require(signer == operator, "Invalid signature");

        balances[msg.sender][asset].amount -= amount;

        if (asset == ETH) {
            (bool ok,) = msg.sender.call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(asset).safeTransfer(msg.sender, amount);
        }

        emit Withdrawn(msg.sender, asset, amount);
    }

    function initiateEmergencyExit(address asset) external {
        require(balances[msg.sender][asset].amount > 0, "No balance");
        uint256 unlockAt = block.timestamp + EMERGENCY_DELAY;
        balances[msg.sender][asset].emergencyUnlockAt = unlockAt;
        emit EmergencyExitInitiated(msg.sender, asset, unlockAt);
    }

    function executeEmergencyExit(address asset) external nonReentrant {
        Balance storage bal = balances[msg.sender][asset];
        require(bal.amount > 0, "No balance");
        require(bal.emergencyUnlockAt > 0, "Not initiated");
        require(block.timestamp >= bal.emergencyUnlockAt, "Timelock active");

        uint256 amount = bal.amount;
        bal.amount = 0;
        bal.emergencyUnlockAt = 0;

        if (asset == ETH) {
            (bool ok,) = msg.sender.call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(asset).safeTransfer(msg.sender, amount);
        }

        emit EmergencyExitExecuted(msg.sender, asset, amount);
    }

    function getBalance(address user, address asset) external view returns (uint256) {
        return balances[user][asset].amount;
    }

    function recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Bad signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return ecrecover(hash, v, r, s);
    }
}
