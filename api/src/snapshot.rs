use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use engine::MatchingEngine;
use types::{AssetId, Balance, Market, Order, UserId, UserMetadata};
use crate::types::{Decision, Incident, RegisteredMM};

const SNAPSHOT_INTERVAL_SECS: u64 = 60;

fn snapshot_path() -> String {
    let dir = std::env::var("SNAPSHOT_DIR").unwrap_or_else(|_| "/data".to_string());
    format!("{dir}/engine_snapshot.json")
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SerializedBalance {
    pub available: u64,
    pub locked: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EngineSnapshot {
    pub version: u32,
    pub timestamp: u64,
    pub balances: HashMap<String, HashMap<String, SerializedBalance>>,
    pub orders: HashMap<String, Vec<Order>>,
    pub markets: Vec<Market>,
    pub sequence: u64,
    pub metadata: HashMap<String, UserMetadata>,
    #[serde(default)]
    pub fee_balances: HashMap<String, u64>,
    #[serde(default)]
    pub clean_shutdown: bool,
    #[serde(default)]
    pub incidents: Vec<Incident>,
    #[serde(default)]
    pub decisions: Vec<Decision>,
    #[serde(default)]
    pub registered_mms: Vec<RegisteredMM>,
}

pub async fn save_snapshot(state: Arc<crate::AppState>) -> Result<()> {
    let (timestamp, balances, orders, markets, sequence, metadata, fee_balances) = {
        let engine = state.engine.lock().await;

        let mut balances: HashMap<String, HashMap<String, SerializedBalance>> = HashMap::new();
        for ((user, asset), balance) in &engine.balances {
            balances
                .entry(user.to_hex())
                .or_default()
                .insert(asset.0.clone(), SerializedBalance { available: balance.available, locked: balance.locked });
        }

        let mut orders: HashMap<String, Vec<Order>> = HashMap::new();
        for (market_id, book) in &engine.order_books {
            orders.insert(market_id.0.clone(), book.all_orders());
        }

        let markets: Vec<Market> = engine.markets.values().cloned().collect();

        let mut metadata: HashMap<String, UserMetadata> = HashMap::new();
        for (user, meta) in &engine.metadata {
            metadata.insert(user.to_hex(), meta.clone());
        }

        let fee_balances = engine.fee_balances.clone();
        let timestamp = engine.timestamp;
        let sequence = engine.next_order_id();

        (timestamp, balances, orders, markets, sequence, metadata, fee_balances)
    };

    let n_orders: usize = orders.values().map(|v| v.len()).sum();
    let n_users = balances.len();

    let incidents = state.incidents.lock().await.clone();
    let decisions = state.decisions.lock().await.clone();
    let registered_mms = state.registered_mms.lock().await.clone();

    let snapshot = EngineSnapshot {
        version: 1,
        timestamp,
        balances,
        orders,
        markets,
        sequence,
        metadata,
        fee_balances,
        clean_shutdown: false,
        incidents,
        decisions,
        registered_mms,
    };

    let json = serde_json::to_vec(&snapshot)?;

    let path = snapshot_path();
    let dir = std::path::Path::new(&path)
        .parent()
        .unwrap_or(std::path::Path::new("/data"));
    tokio::fs::create_dir_all(dir).await?;

    let tmp_path = format!("{path}.tmp");
    tokio::fs::write(&tmp_path, &json).await?;
    tokio::fs::rename(&tmp_path, &path).await?;

    tracing::info!("Snapshot saved: {n_orders} orders, {n_users} users");

    Ok(())
}

pub async fn load_snapshot() -> Result<Option<EngineSnapshot>> {
    let path = snapshot_path();
    match tokio::fs::try_exists(&path).await {
        Ok(true) => {}
        _ => return Ok(None),
    }
    let data = tokio::fs::read(&path).await?;
    let snapshot = serde_json::from_slice(&data)?;
    Ok(Some(snapshot))
}

pub async fn run_snapshot_task(state: Arc<crate::AppState>) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(SNAPSHOT_INTERVAL_SECS)).await;
        if let Err(e) = save_snapshot(Arc::clone(&state)).await {
            tracing::error!("Snapshot error: {e}");
        } else {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            state.last_snapshot_ts.store(ts, std::sync::atomic::Ordering::Relaxed);
        }
    }
}

pub fn restore_engine_from_snapshot(
    engine: &mut MatchingEngine,
    snapshot: EngineSnapshot,
) -> Result<()> {
    for market in snapshot.markets {
        engine.add_market(market);
    }

    for (user_hex, asset_balances) in snapshot.balances {
        let user = UserId::from_hex(&user_hex)?;
        for (asset_str, bal) in asset_balances {
            let asset = AssetId(asset_str);
            engine.balances.insert(
                (user.clone(), asset.clone()),
                Balance { user: user.clone(), asset, available: bal.available, locked: bal.locked },
            );
        }
    }

    for (user_hex, meta) in snapshot.metadata {
        let user = UserId::from_hex(&user_hex)?;
        engine.metadata.insert(user, meta);
    }

    for (market_id_str, orders) in snapshot.orders {
        let market_id = types::MarketId(market_id_str);
        if let Some(book) = engine.order_books.get_mut(&market_id) {
            for order in orders {
                let _ = book.insert_resting(order);
            }
        }
    }

    engine.set_next_order_id(snapshot.sequence);

    engine.fee_balances = snapshot.fee_balances;

    tracing::info!("Engine restored from snapshot: {}", snapshot.timestamp);

    Ok(())
}
