// ---------------------------------------------------------------------------
// File Watcher — watches .butterfly/ directory for changes, emits WS events
// ---------------------------------------------------------------------------

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::ws::{WsBroadcast, WsEvent};

/// Start watching a directory for .md file changes.
/// Returns the watcher (must be kept alive) and spawns a task to process events.
pub fn start_file_watcher(
    watch_dir: PathBuf,
    broadcast: Arc<WsBroadcast>,
) -> Option<RecommendedWatcher> {
    let (tx, mut rx) = mpsc::channel::<Event>(100);

    // Create the watcher
    let mut watcher = match RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        },
        Config::default(),
    ) {
        Ok(w) => w,
        Err(e) => {
            tracing::warn!("Failed to create file watcher: {e}");
            return None;
        }
    };

    // Ensure directory exists
    if !watch_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&watch_dir) {
            tracing::warn!("Failed to create watch directory {:?}: {e}", watch_dir);
            return None;
        }
    }

    if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::Recursive) {
        tracing::warn!("Failed to watch {:?}: {e}", watch_dir);
        return None;
    }

    tracing::info!("File watcher started on {:?}", watch_dir);

    let watch_dir_clone = watch_dir.clone();

    // Spawn debounced event processor
    tokio::spawn(async move {
        use std::collections::HashMap;
        use tokio::time::{sleep, Duration};

        let mut pending: HashMap<PathBuf, String> = HashMap::new();
        let debounce = Duration::from_millis(500);

        loop {
            tokio::select! {
                Some(event) = rx.recv() => {
                    let action = match event.kind {
                        EventKind::Create(_) => "created",
                        EventKind::Modify(_) => "modified",
                        EventKind::Remove(_) => "deleted",
                        _ => continue,
                    };

                    for path in event.paths {
                        if path.extension().and_then(|e| e.to_str()) == Some("md") {
                            pending.insert(path, action.to_string());
                        }
                    }
                }
                _ = sleep(debounce), if !pending.is_empty() => {
                    for (path, action) in pending.drain() {
                        // Derive project_id from path relative to watch_dir
                        let project_id = path
                            .strip_prefix(&watch_dir_clone)
                            .ok()
                            .and_then(|rel| rel.components().next())
                            .and_then(|c| c.as_os_str().to_str())
                            .unwrap_or("unknown")
                            .to_string();

                        let rel_path = path
                            .strip_prefix(&watch_dir_clone)
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|_| path.to_string_lossy().to_string());

                        broadcast.publish(WsEvent::FileChanged {
                            path: rel_path,
                            action,
                            project_id,
                        });
                    }
                }
                else => break,
            }
        }
    });

    Some(watcher)
}
