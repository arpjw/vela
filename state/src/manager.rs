use std::collections::HashMap;
use std::path::PathBuf;
use types::{AssetId, Balance, MarketId, Request, Response, UserId, UserMetadata};
use crate::cache::StateCache;
use crate::keys::StateKey;
use crate::mpt::{Hash, MptStore};

pub struct StateManager {
    pub cache: StateCache,
    pub mpt: MptStore,
    pub batch_sequence: u64,
    disk_path: Option<PathBuf>,
    pending_batch: Vec<(Request, Vec<Response>)>,
}

impl StateManager {
    pub fn new(disk_path: Option<PathBuf>) -> Self {
        StateManager {
            cache: StateCache::new(),
            mpt: MptStore::new(),
            batch_sequence: 0,
            disk_path,
            pending_batch: vec![],
        }
    }

    pub fn load_from_disk(&mut self) -> anyhow::Result<()> {
        let path = match &self.disk_path {
            Some(p) => p.join("snapshot.json"),
            None => return Ok(()),
        };
        if !path.exists() {
            return Ok(());
        }
        let bytes = std::fs::read(&path)?;
        let snapshot: Vec<(Vec<u8>, Vec<u8>)> = serde_json::from_slice(&bytes)?;
        self.mpt.load_snapshot(snapshot);
        self.cache.load_from_mpt(&self.mpt);
        Ok(())
    }

    pub fn observe_balance_change(&mut self, user: &UserId, asset: &AssetId, balance: &Balance) {
        self.cache.set_balance(balance);
    }

    pub fn observe_metadata_change(&mut self, meta: &UserMetadata) {
        self.cache.set_metadata(meta);
    }

    pub fn record_request_response(&mut self, request: Request, responses: Vec<Response>) {
        self.pending_batch.push((request, responses));
    }

    pub fn commit_batch(
        &mut self,
        balances: &HashMap<(UserId, AssetId), Balance>,
        metadata: &HashMap<UserId, UserMetadata>,
    ) -> Hash {
        for ((user, asset), balance) in balances {
            self.cache.set_balance(balance);
        }
        for (user, meta) in metadata {
            self.cache.set_metadata(meta);
        }

        self.batch_sequence += 1;
        self.cache.set_sequence(self.batch_sequence);

        let root = self.cache.commit_to_mpt(&mut self.mpt);

        if let Err(e) = self.persist_snapshot() {
            eprintln!("snapshot persist failed: {}", e);
        }

        self.pending_batch.clear();
        root
    }

    fn persist_snapshot(&self) -> anyhow::Result<()> {
        let path = match &self.disk_path {
            Some(p) => p.join("snapshot.json"),
            None => return Ok(()),
        };
        std::fs::create_dir_all(path.parent().unwrap())?;
        let snapshot = self.mpt.snapshot_all();
        let bytes = serde_json::to_vec(&snapshot)?;
        std::fs::write(path, bytes)?;
        Ok(())
    }

    pub fn current_root(&self) -> Option<Hash> {
        self.mpt.root()
    }

    pub fn dirty_count(&self) -> usize {
        self.cache.dirty_count()
    }

    pub fn snapshot_for_batch(&self, keys: &[StateKey]) -> Vec<(Vec<u8>, Vec<u8>)> {
        let encoded_keys: Vec<Vec<u8>> = keys.iter().map(|k| k.encode()).collect();
        self.mpt.snapshot_for_keys(&encoded_keys)
    }
}
