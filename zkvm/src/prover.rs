use serde::{Deserialize, Serialize};
use types::{Request, Response};
use state::mpt::Hash;

#[derive(Debug, Serialize, Deserialize)]
pub struct ZkvmInput {
    pub snapshot: Vec<(Vec<u8>, Vec<u8>)>,
    pub requests: Vec<Request>,
    pub pre_root: Option<Hash>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ZkvmOutput {
    pub post_root: Hash,
    pub responses: Vec<Vec<Response>>,
}

pub fn execute_stf(input: ZkvmInput) -> anyhow::Result<ZkvmOutput> {
    let mut mpt = state::MptStore::new();
    for (k, v) in &input.snapshot {
        mpt.insert(k.to_vec(), v.clone());
    }

    let fee_config = types::FeeConfig::default();
    let mut engine = engine::MatchingEngine::new(fee_config, 1.0);

    let mut all_responses = Vec::new();
    for (i, request) in input.requests.into_iter().enumerate() {
        let responses = engine.process(request, i as u64);
        all_responses.push(responses);
    }

    let post_root = mpt.root().unwrap_or([0u8; 32]);

    Ok(ZkvmOutput {
        post_root,
        responses: all_responses,
    })
}
