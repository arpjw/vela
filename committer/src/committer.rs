use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, warn};
use state::StateManager;
use state::mpt::Hash;
use types::Request;
use crate::batch::CommitBatch;
use crate::da::{DaRecord, DataAvailabilityClient};

// ---------------------------------------------------------------------------
// Payload serialized to the DA layer for each committed batch.
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct DaBatch<'a> {
    sequence: u64,
    root: Hash,
    snapshot: &'a [(Vec<u8>, Vec<u8>)],
    requests: &'a [Request],
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

pub struct CommitResult {
    pub sequence: u64,
    pub root: Hash,
    pub batch_size: usize,
    pub timestamp: u64,
    /// Populated when the committer has a DA client wired in.
    pub da_record: Option<DaRecord>,
}

pub struct CommitterConfig {
    pub batch_interval: Duration,
    pub disk_path: Option<PathBuf>,
    pub max_batch_size: usize,
}

impl Default for CommitterConfig {
    fn default() -> Self {
        CommitterConfig {
            batch_interval: Duration::from_millis(500),
            disk_path: None,
            max_batch_size: 10_000,
        }
    }
}

// ---------------------------------------------------------------------------
// Committer
// ---------------------------------------------------------------------------

pub struct Committer {
    rx: mpsc::Receiver<CommitBatch>,
    result_tx: Option<mpsc::Sender<CommitResult>>,
    state_manager: StateManager,
    config: CommitterConfig,
    pending_requests: Vec<Request>,
    total_committed: u64,
    da_client: Option<Box<dyn DataAvailabilityClient>>,
}

impl Committer {
    pub fn new(
        rx: mpsc::Receiver<CommitBatch>,
        result_tx: Option<mpsc::Sender<CommitResult>>,
        config: CommitterConfig,
        da_client: Option<Box<dyn DataAvailabilityClient>>,
    ) -> Self {
        let disk_path = config.disk_path.clone();
        Committer {
            rx,
            result_tx,
            state_manager: StateManager::new(disk_path),
            config,
            pending_requests: vec![],
            total_committed: 0,
            da_client,
        }
    }

    pub fn load_from_disk(&mut self) -> anyhow::Result<()> {
        self.state_manager.load_from_disk()
    }

    pub fn current_root(&self) -> Option<Hash> {
        self.state_manager.current_root()
    }

    pub fn total_committed(&self) -> u64 {
        self.total_committed
    }

    pub async fn run(mut self) {
        let mut interval = tokio::time::interval(self.config.batch_interval);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                Some(batch) = self.rx.recv() => {
                    self.accumulate_batch(batch);

                    if self.pending_requests.len() >= self.config.max_batch_size {
                        self.commit_pending().await;
                    }
                }

                _ = interval.tick() => {
                    if !self.pending_requests.is_empty() || self.state_manager.dirty_count() > 0 {
                        self.commit_pending().await;
                    }
                }
            }
        }
    }

    fn accumulate_batch(&mut self, batch: CommitBatch) {
        for request in batch.requests {
            self.pending_requests.push(request);
        }
        for ((user, asset), balance) in &batch.balances {
            self.state_manager.observe_balance_change(user, asset, balance);
        }
        for (_user, meta) in &batch.metadata {
            self.state_manager.observe_metadata_change(meta);
        }
    }

    async fn commit_pending(&mut self) {
        let batch_size = self.pending_requests.len();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_micros() as u64;

        // Take the pre-commit snapshot for DA submission before mutating state.
        let snapshot = self.state_manager.take_snapshot();
        let requests_for_da = self.pending_requests.clone();

        let root = self.state_manager.commit_full(snapshot.clone());
        self.total_committed += batch_size as u64;
        let sequence = self.state_manager.batch_sequence;

        info!(
            sequence = sequence,
            batch_size = batch_size,
            root = hex::encode(root),
            "committed batch"
        );

        // Publish the batch (snapshot + requests) to the DA layer so anyone
        // can reconstruct state and generate independent ZK proofs.
        let da_record = self.submit_to_da(sequence, root, &snapshot, &requests_for_da);

        self.pending_requests.clear();

        if let Some(tx) = &self.result_tx {
            let result = CommitResult { sequence, root, batch_size, timestamp: ts, da_record };
            if tx.send(result).await.is_err() {
                warn!("commit result receiver dropped");
            }
        }
    }

    /// Serialize and submit the batch to the DA client.  Failures are logged
    /// but never propagate — DA unavailability must not block state commits.
    fn submit_to_da(
        &self,
        sequence: u64,
        root: Hash,
        snapshot: &[(Vec<u8>, Vec<u8>)],
        requests: &[Request],
    ) -> Option<DaRecord> {
        let client = self.da_client.as_ref()?;

        let payload = DaBatch { sequence, root, snapshot, requests };
        let data = match serde_json::to_vec(&payload) {
            Ok(b) => b,
            Err(e) => {
                warn!(sequence = sequence, error = %e, "DA serialization failed");
                return None;
            }
        };

        match client.submit(sequence, &data) {
            Ok(receipt) => {
                info!(
                    sequence = sequence,
                    backend = client.name(),
                    hash = hex::encode(receipt.content_hash),
                    "batch posted to DA"
                );
                Some(DaRecord { receipt, backend: client.name().to_string() })
            }
            Err(e) => {
                warn!(sequence = sequence, backend = client.name(), error = %e, "DA submission failed");
                None
            }
        }
    }
}
