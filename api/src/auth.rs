use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use sha3::{Digest, Keccak256};
use types::{UserId, VelaError};

pub fn eth_sign_hash(message: &[u8]) -> [u8; 32] {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut h = Keccak256::new();
    h.update(prefix.as_bytes());
    h.update(message);
    h.finalize().into()
}

pub fn verify_signature(
    message: &[u8],
    signature: &[u8],
    expected_user: &UserId,
) -> Result<(), VelaError> {
    if signature.len() != 65 {
        return Err(VelaError::InvalidSignature);
    }
    let hash = eth_sign_hash(message);
    let recovery_id = RecoveryId::try_from(signature[64] % 27)
        .map_err(|_| VelaError::InvalidSignature)?;
    let sig = Signature::try_from(&signature[..64])
        .map_err(|_| VelaError::InvalidSignature)?;
    let verifying_key = VerifyingKey::recover_from_prehash(&hash, &sig, recovery_id)
        .map_err(|_| VelaError::InvalidSignature)?;
    let pubkey_bytes = verifying_key.to_encoded_point(false);
    let pubkey_hash = Keccak256::digest(&pubkey_bytes.as_bytes()[1..]);
    let recovered_addr: [u8; 20] = pubkey_hash[12..].try_into()
        .map_err(|_| VelaError::InvalidSignature)?;
    if recovered_addr != expected_user.0 {
        return Err(VelaError::InvalidSignature);
    }
    Ok(())
}
