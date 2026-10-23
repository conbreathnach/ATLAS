//! Atomic, self-healing JSON persistence for ATLAS application data.
//!
//! Writes go to a uniquely-named sibling temp file, are flushed to disk, then
//! atomically replaced over the destination (`MoveFileExW` on Windows). A
//! process-wide lock serializes read-modify-write cycles.

use crate::error::{AtlasError, AtlasResult};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};
use tauri::{AppHandle, Manager};

static STORE_LOCK: Mutex<()> = Mutex::new(());

/// Serialize all store mutations in this process. Survives mutex poisoning.
pub fn lock_store() -> MutexGuard<'static, ()> {
    STORE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn app_data_directory(app: &AppHandle) -> AtlasResult<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AtlasError::context("Could not locate the ATLAS data directory", error))?;
    fs::create_dir_all(&directory)
        .map_err(|error| AtlasError::context("Could not create the ATLAS data directory", error))?;
    Ok(directory)
}

pub fn data_file(app: &AppHandle, name: &str) -> AtlasResult<PathBuf> {
    Ok(app_data_directory(app)?.join(name))
}

pub fn models_directory(app: &AppHandle) -> AtlasResult<PathBuf> {
    let directory = app_data_directory(app)?.join("models");
    fs::create_dir_all(&directory).map_err(|error| {
        AtlasError::context("Could not create the ATLAS model directory", error)
    })?;
    Ok(directory)
}

/// Read a JSON file, tolerating absence and recovering from corruption by
/// moving the unreadable file aside to `<name>.bak` and starting fresh.
pub fn read_json<T: DeserializeOwned>(path: &PathBuf) -> AtlasResult<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| AtlasError::context("Could not read data file", error))?;
    match serde_json::from_str(&contents) {
        Ok(value) => Ok(Some(value)),
        Err(_) => {
            let backup = path.with_extension("json.bak");
            replace_file(path, &backup)?;
            Ok(None)
        }
    }
}

/// Serialize and atomically replace a JSON file.
pub fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> AtlasResult<()> {
    let serialized = serde_json::to_string_pretty(value)
        .map_err(|error| AtlasError::context("Could not serialize data", error))?;
    let temp = path.with_extension(format!("json.{}.tmp", unique_id("w")?));
    {
        use std::io::Write;
        let mut file = fs::File::create(&temp)
            .map_err(|error| AtlasError::context("Could not create temporary data file", error))?;
        file.write_all(serialized.as_bytes())
            .and_then(|()| file.sync_all())
            .map_err(|error| AtlasError::context("Could not write data file", error))?;
    }
    if let Err(error) = replace_file(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    Ok(())
}

/// Atomically move `from` over `to` without a delete-then-rename gap.
#[cfg(windows)]
fn replace_file(from: &PathBuf, to: &PathBuf) -> AtlasResult<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };
    let wide = |path: &PathBuf| -> Vec<u16> {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    };
    let ok = unsafe {
        MoveFileExW(
            wide(from).as_ptr(),
            wide(to).as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        return Err(AtlasError::context(
            "Could not replace data file",
            std::io::Error::last_os_error(),
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(from: &PathBuf, to: &PathBuf) -> AtlasResult<()> {
    fs::rename(from, to).map_err(|error| AtlasError::context("Could not replace data file", error))
}

pub fn now_seconds() -> AtlasResult<u64> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| AtlasError::context("System clock is unavailable", error))
}

pub fn unique_id(prefix: &str) -> AtlasResult<String> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .map_err(|error| AtlasError::context("System clock is unavailable", error))?;
    Ok(format!("{prefix}-{nanos}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("atlas-test-{name}-{}", std::process::id()))
    }

    #[test]
    fn roundtrip_json() {
        let path = temp_path("roundtrip.json");
        write_json(&path, &vec!["a", "b"]).unwrap();
        let loaded: Option<Vec<String>> = read_json(&path).unwrap();
        assert_eq!(loaded, Some(vec!["a".to_string(), "b".to_string()]));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn missing_file_returns_none() {
        let path = temp_path("missing.json");
        let loaded: Option<Vec<String>> = read_json(&path).unwrap();
        assert_eq!(loaded, None);
    }

    #[test]
    fn corrupted_file_is_quarantined() {
        let path = temp_path("corrupt.json");
        fs::write(&path, "{not json").unwrap();
        let loaded: Option<Vec<String>> = read_json(&path).unwrap();
        assert_eq!(loaded, None);
        assert!(!path.exists());
        assert!(path.with_extension("json.bak").exists());
        let _ = fs::remove_file(path.with_extension("json.bak"));
    }

    #[test]
    fn write_replaces_existing_destination() {
        let path = temp_path("replace.json");
        write_json(&path, &1_u32).unwrap();
        write_json(&path, &2_u32).unwrap();
        let loaded: Option<u32> = read_json(&path).unwrap();
        assert_eq!(loaded, Some(2));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn concurrent_writers_do_not_corrupt() {
        use std::sync::Arc;
        let path = Arc::new(temp_path("concurrent.json"));
        let handles: Vec<_> = (0..8)
            .map(|index| {
                let path = Arc::clone(&path);
                std::thread::spawn(move || {
                    let _guard = lock_store();
                    let current: Option<Vec<u32>> = read_json(&path).unwrap();
                    let mut values = current.unwrap_or_default();
                    values.push(index);
                    write_json(&path, &values).unwrap();
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        let loaded: Option<Vec<u32>> = read_json(&path).unwrap();
        assert_eq!(loaded.map(|values| values.len()), Some(8));
        let _ = fs::remove_file(path.as_ref());
    }
}
