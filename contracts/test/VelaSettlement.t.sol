// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/VelaSettlement.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock", "MCK") {
        _mint(msg.sender, 1_000_000e18);
    }
}

contract VelaSettlementTest is Test {
    VelaSettlement settlement;
    MockERC20 token;

    uint256 operatorKey = 0xA11CE;
    address operator;
    address user = address(0xBEEF);

    function setUp() public {
        operator = vm.addr(operatorKey);
        settlement = new VelaSettlement(operator);
        token = new MockERC20();

        vm.deal(user, 10 ether);
        token.transfer(user, 1000e18);
    }

    function test_depositETH() public {
        vm.prank(user);
        settlement.depositETH{value: 1 ether}();
        assertEq(settlement.getBalance(user, address(0)), 1 ether);
    }

    function test_initiateAndExecuteEmergencyExit() public {
        vm.prank(user);
        settlement.depositETH{value: 1 ether}();

        vm.prank(user);
        settlement.initiateEmergencyExit(address(0));

        vm.warp(block.timestamp + 7 days);

        uint256 balBefore = user.balance;
        vm.prank(user);
        settlement.executeEmergencyExit(address(0));

        assertEq(settlement.getBalance(user, address(0)), 0);
        assertEq(user.balance, balBefore + 1 ether);
    }

    function test_emergencyExitRevertsBeforeTimelock() public {
        vm.prank(user);
        settlement.depositETH{value: 1 ether}();

        vm.prank(user);
        settlement.initiateEmergencyExit(address(0));

        vm.warp(block.timestamp + 6 days);

        vm.prank(user);
        vm.expectRevert("Timelock active");
        settlement.executeEmergencyExit(address(0));
    }

    function _operatorSig(address _user, address asset, uint256 amount, uint256 nonce) internal view returns (bytes memory) {
        bytes32 inner = keccak256(abi.encodePacked(_user, asset, amount, nonce, block.chainid));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, hash);
        return abi.encodePacked(r, s, v);
    }

    function test_withdrawWithValidSignature() public {
        vm.prank(user);
        settlement.depositETH{value: 1 ether}();

        bytes memory sig = _operatorSig(user, address(0), 0.5 ether, 1);

        uint256 balBefore = user.balance;
        vm.prank(user);
        settlement.withdraw(address(0), 0.5 ether, 1, sig);

        assertEq(settlement.getBalance(user, address(0)), 0.5 ether);
        assertEq(user.balance, balBefore + 0.5 ether);
    }

    function test_withdrawRevertsInvalidSignature() public {
        vm.prank(user);
        settlement.depositETH{value: 1 ether}();

        uint256 wrongKey = 0xBAD;
        bytes32 inner = keccak256(abi.encodePacked(user, address(0), uint256(0.5 ether), uint256(1), block.chainid));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, hash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(user);
        vm.expectRevert("Invalid signature");
        settlement.withdraw(address(0), 0.5 ether, 1, badSig);
    }

    function test_withdrawRevertsInsufficientBalance() public {
        vm.prank(user);
        settlement.depositETH{value: 0.1 ether}();

        bytes memory sig = _operatorSig(user, address(0), 1 ether, 1);

        vm.prank(user);
        vm.expectRevert("Insufficient balance");
        settlement.withdraw(address(0), 1 ether, 1, sig);
    }
}
