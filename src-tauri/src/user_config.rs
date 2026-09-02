use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserConfig {
    #[serde(rename = "lastWorkspace", skip_serializing_if = "Option::is_none")]
    pub last_workspace: Option<String>,
}

pub fn load_or_create_user_config(home_dir: &Path) -> Result<UserConfig, String> {
    load_or_create_user_config_at(&user_config_path(home_dir))
}

pub fn save_last_workspace(home_dir: &Path, path: &Path) -> Result<(), String> {
    let mut config = load_or_create_user_config(home_dir)?;
    config.last_workspace = Some(path.to_string_lossy().to_string());
    write_user_config(&user_config_path(home_dir), &config)
}

fn user_config_path(home_dir: &Path) -> PathBuf {
    home_dir.join(".mentinote")
}

fn load_or_create_user_config_at(path: &Path) -> Result<UserConfig, String> {
    if !path.exists() {
        let config = UserConfig::default();
        write_user_config(path, &config)?;
        return Ok(config);
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read user .mentinote: {error}"))?;

    if content.trim().is_empty() {
        let config = UserConfig::default();
        write_user_config(path, &config)?;
        return Ok(config);
    }

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse user .mentinote: {error}"))
}

fn write_user_config(path: &Path, config: &UserConfig) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize user .mentinote: {error}"))?;
    fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("Failed to write user .mentinote: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{
        load_or_create_user_config, load_or_create_user_config_at, write_user_config, UserConfig,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn creates_missing_user_config() {
        let root = temp_dir();

        let config = load_or_create_user_config(&root).unwrap();

        assert_eq!(config, UserConfig::default());
        assert!(root.join(".mentinote").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_last_workspace_from_user_config() {
        let root = temp_dir();
        let path = root.join(".mentinote");
        write_user_config(
            &path,
            &UserConfig {
                last_workspace: Some("/tmp/workspace".to_string()),
            },
        )
        .unwrap();

        let config = load_or_create_user_config_at(&path).unwrap();

        assert_eq!(config.last_workspace, Some("/tmp/workspace".to_string()));
        fs::remove_dir_all(root).unwrap();
    }

    fn temp_dir() -> PathBuf {
        let mut path = std::env::temp_dir();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("mentinote-user-config-test-{nanos}"));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
