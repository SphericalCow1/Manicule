use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::workspace::paths::resolve_workspace_relative_path;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ContentSnapshot {
    content_by_path: HashMap<String, String>,
}

impl ContentSnapshot {
    pub fn insert(&mut self, path: String, content: String) {
        self.content_by_path.insert(path, content);
    }

    pub fn remove(&mut self, path: &str) {
        self.content_by_path.remove(path);
    }

    pub fn get(&self, path: &str) -> Option<&str> {
        self.content_by_path.get(path).map(String::as_str)
    }

    pub fn get_or_read<'a>(&'a self, root: &Path, path: &str) -> Result<Cow<'a, str>, String> {
        if let Some(content) = self.get(path) {
            return Ok(Cow::Borrowed(content));
        }

        let absolute_path = resolve_workspace_relative_path(root, path)
            .ok_or_else(|| format!("Invalid page path '{path}'"))?;
        fs::read_to_string(&absolute_path)
            .map(Cow::Owned)
            .map_err(|error| format!("Failed to read page '{path}': {error}"))
    }

    pub fn len(&self) -> usize {
        self.content_by_path.len()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    #[test]
    fn returns_cached_content_without_reading_the_file_again() {
        let root = temp_workspace();
        fs::write(root.join("Page.md"), "disk").unwrap();
        let mut snapshot = ContentSnapshot::default();
        snapshot.insert("Page.md".to_string(), "cached".to_string());
        fs::remove_file(root.join("Page.md")).unwrap();

        assert_eq!(snapshot.get_or_read(&root, "Page.md").unwrap(), "cached");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn falls_back_to_disk_when_an_entry_is_missing() {
        let root = temp_workspace();
        fs::write(root.join("Page.md"), "disk").unwrap();

        assert_eq!(
            ContentSnapshot::default()
                .get_or_read(&root, "Page.md")
                .unwrap(),
            "disk"
        );

        fs::remove_dir_all(root).unwrap();
    }

    fn temp_workspace() -> std::path::PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "manicule-content-snapshot-test-{}-{nanos}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
