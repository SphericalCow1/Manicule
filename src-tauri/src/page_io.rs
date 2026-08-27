use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::dto::SavePageResultDto;

pub(crate) fn content_hash(content: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;

    for byte in content.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    format!("{hash:016x}")
}

pub(crate) fn save_page_to_disk(
    relative_path: String,
    absolute_path: PathBuf,
    content: String,
    _expected_modified_at: String,
    expected_content_hash: String,
) -> Result<SavePageResultDto, String> {
    if !absolute_path.is_file() {
        return Err("Page does not exist".to_string());
    }

    let disk_content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read page '{}': {error}", relative_path))?;
    let current_modified_at = modified_at_millis(&absolute_path)?;
    let current_content_hash = content_hash(&disk_content);

    if current_content_hash != expected_content_hash {
        return Ok(SavePageResultDto::Conflict {
            path: relative_path,
            current_modified_at,
            current_content_hash,
            disk_content,
        });
    }

    fs::write(&absolute_path, &content)
        .map_err(|error| format!("Failed to write page '{}': {error}", relative_path))?;

    let modified_at = modified_at_millis(&absolute_path)
        .unwrap_or_else(|_| system_time_millis(SystemTime::now()));

    Ok(SavePageResultDto::Saved {
        path: relative_path,
        modified_at,
        content_hash: content_hash(&content),
    })
}

pub(crate) fn modified_at_millis(path: &PathBuf) -> Result<String, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to read page metadata '{}': {error}", path.display()))?;
    let modified = metadata
        .modified()
        .map_err(|error| format!("Failed to read modified time '{}': {error}", path.display()))?;

    Ok(system_time_millis(modified))
}

fn system_time_millis(time: SystemTime) -> String {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
