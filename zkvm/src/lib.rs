pub mod prover;
pub mod optimistic;

pub use prover::{ZkvmInput, ZkvmOutput, execute_stf, verify_execution};
pub use optimistic::{
    ChallengeStatus, OptimisticProver, ProofStatus, CHALLENGE_WINDOW_SECS,
};
