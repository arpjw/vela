use sha3::{Digest, Keccak256};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

pub type Hash = [u8; 32];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MptNode {
    pub key: Vec<u8>,
    pub value: Vec<u8>,
}

pub fn keccak256(data: &[u8]) -> Hash {
    let mut h = Keccak256::new();
    h.update(data);
    h.finalize().into()
}

pub struct MptStore {
    nodes: HashMap<Vec<u8>, Vec<u8>>,
    root: Option<Hash>,
}

impl MptStore {
    pub fn new() -> Self {
        MptStore { nodes: HashMap::new(), root: None }
    }

    pub fn root(&self) -> Option<Hash> {
        self.root
    }

    pub fn insert(&mut self, key: &[u8], value: Vec<u8>) {
        self.nodes.insert(key.to_vec(), value);
        self.root = Some(self.compute_root());
    }

    pub fn get(&self, key: &[u8]) -> Option<&[u8]> {
        self.nodes.get(key).map(|v| v.as_slice())
    }

    fn compute_root(&self) -> Hash {
        let mut hasher = Keccak256::new();
        let mut keys: Vec<_> = self.nodes.keys().collect();
        keys.sort();
        for k in &keys {
            hasher.update(k);
            hasher.update(self.nodes.get(*k).unwrap());
        }
        hasher.finalize().into()
    }

    pub fn snapshot_for_keys(&self, keys: &[Vec<u8>]) -> Vec<(Vec<u8>, Vec<u8>)> {
        keys.iter()
            .filter_map(|k| self.nodes.get(k).map(|v| (k.clone(), v.clone())))
            .collect()
    }
}

impl Default for MptStore {
    fn default() -> Self {
        Self::new()
    }
}
