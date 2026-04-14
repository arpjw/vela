use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, error};
use types::Response;
use state::MptStore;

pub struct BatchEntry {
    pub responses: Vec<Response>,
    pub timestamp: u64,
}

pub struct Committer {
    rx: mpsc::Receiver<BatchEntry>,
    mpt: MptStore,
    batch_interval: Duration,
    disk_path: std::path::PathBuf,
}

impl Committer {
    pub fn new(
        rx: mpsc::Receiver<BatchEntry>,
        disk_path: std::path::PathBuf,
        batch_interval: Duration,
    ) -> Self {
        Committer {
            rx,
            mpt: MptStore::new(),
            batch_interval,
            disk_path,
        }
    }

    pub async fn run(mut self) {
        let mut batch: Vec<BatchEntry> = Vec::new();
        let mut interval = tokio::time::interval(self.batch_interval);

        loop {
            tokio::select! {
                Some(entry) = self.rx.recv() => {
                    batch.push(entry);
                }
                _ = interval.tick() => {
                    if !batch.is_empty() {
                        let count = batch.len();
                        if let Err(e) = self.commit_batch(std::mem::take(&mut batch)).await {
                            error!("commit failed: {}", e);
                        } else {
                            info!("committed batch of {} entries, root: {:?}", count, self.mpt.root());
                        }
                    }
                }
            }
        }
    }

    async fn commit_batch(&mut self, batch: Vec<BatchEntry>) -> anyhow::Result<()> {
        let serialized = serde_json::to_vec(&batch.len())?;
        let ts = batch.last().map(|e| e.timestamp).unwrap_or(0);
        self.mpt.insert(&ts.to_be_bytes(), serialized);
        self.persist_to_disk().await?;
        Ok(())
    }

    async fn persist_to_disk(&self) -> anyhow::Result<()> {
        if let Some(root) = self.mpt.root() {
            let path = self.disk_path.join("mpt_root");
            tokio::fs::write(path, root).await?;
        }
        Ok(())
    }
}
