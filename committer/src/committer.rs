use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, warn};
use state::StateManager;
use state::mpt::Hash;
use crate::batch::CommitBatch;

pub struct CommitResult {
    pub sequence: u64,
    pub root: Hash,
    pub batch_size: usize,
    pub timestamp: u64,
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

pub struct Committer {
    rx: mpsc::Receiver<CommitBatch>,
    result_tx: Option<mpsc::Sender<CommitResult>>,
    state_manager: StateManager,
    config: CommitterConfig,
    pending_requests: Vec<types::Request>,
    total_committed: u64,
}

impl Committer {
    pub fn new(
        rx: mpsc::Receiver<CommitBatch>,
        result_tx: Option<mpsc::Sender<CommitResult>>,
        config: CommitterConfig,
    ) -> Self {
        let disk_path = config.disk_path.clone();
        Committer {
            rx,
            result_tx,
            state_manager: StateManager::new(disk_path),
            config,
            pending_requests: vec![],
            total_committed: 0,
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
        for (user, meta) in &batch.metadata {
            self.state_manager.observe_metadata_change(meta);
        }
    }

    async fn commit_pending(&mut self) {
        let batch_size = self.pending_requests.len();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_micros() as u64;

        let snapshot = self.state_manager.take_snapshot();
        let root = self.state_manager.commit_full(snapshot);

        self.total_committed += batch_size as u64;
        let sequence = self.state_manager.batch_sequence;

        info!(
            sequence = sequence,
            batch_size = batch_size,
            root = hex::encode(root),
            "committed batch"
        );

        self.pending_requests.clear();

        if let Some(tx) = &self.result_tx {
            let result = CommitResult { sequence, root, batch_size, timestamp: ts };
            if tx.send(result).await.is_err() {
                warn!("commit result receiver dropped");
            }
        }
    }
}
