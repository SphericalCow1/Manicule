use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceScan {
    pub markdown_files: Vec<String>,
    pub folders: Vec<String>,
}

pub fn scan_markdown_files(root: &Path) -> Result<Vec<String>, String> {
    Ok(scan_workspace(root)?.markdown_files)
}

pub fn scan_workspace(root: &Path) -> Result<WorkspaceScan, String> {
    let mut files = Vec::new();
    let mut folders = Vec::new();
    scan_dir(root, root, &mut files, &mut folders)?;
    files.sort();
    folders.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));
    folders.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    Ok(WorkspaceScan {
        markdown_files: files,
        folders,
    })
}

fn scan_dir(
    root: &Path,
    current: &Path,
    files: &mut Vec<String>,
    folders: &mut Vec<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(current)
        .map_err(|error| format!("Failed to read directory '{}': {error}", current.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read directory entry in '{}': {error}",
                current.display()
            )
        })?;
        let path = entry.path();

        if should_skip(&path) {
            continue;
        }

        if path.is_dir() {
            folders.push(relative_path(root, &path)?);
            scan_dir(root, &path, files, folders)?;
        } else if is_markdown_file(&path) {
            files.push(relative_path(root, &path)?);
        }
    }

    Ok(())
}

fn should_skip(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == ".git" || name == "node_modules" || name == "target")
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|error| format!("Failed to make path workspace-relative: {error}"))?;

    Ok(components_to_slash_path(relative))
}

fn components_to_slash_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[test]
    fn scans_markdown_files_recursively() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("Projekte")).unwrap();
        fs::write(root.join("Inbox.md"), "# Inbox").unwrap();
        fs::write(root.join("Projekte").join("Alpha.md"), "# Alpha").unwrap();
        fs::write(root.join("notes.txt"), "ignore").unwrap();

        let files = scan_markdown_files(&root).unwrap();

        assert_eq!(
            files,
            vec!["Inbox.md".to_string(), "Projekte/Alpha.md".to_string()]
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn scans_empty_folders_recursively() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("Projekte").join("Archiv")).unwrap();
        fs::create_dir_all(root.join("Leer")).unwrap();
        fs::write(root.join("Projekte").join("Alpha.md"), "# Alpha").unwrap();

        let scan = scan_workspace(&root).unwrap();

        assert_eq!(scan.markdown_files, vec!["Projekte/Alpha.md".to_string()]);
        assert_eq!(
            scan.folders,
            vec![
                "Leer".to_string(),
                "Projekte".to_string(),
                "Projekte/Archiv".to_string()
            ]
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn skips_build_and_git_directories() {
        let root = temp_workspace();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("target")).unwrap();
        fs::write(root.join(".git").join("Hidden.md"), "# Hidden").unwrap();
        fs::write(root.join("target").join("Hidden.md"), "# Hidden").unwrap();
        fs::write(root.join("Visible.md"), "# Visible").unwrap();

        let files = scan_markdown_files(&root).unwrap();

        assert_eq!(files, vec!["Visible.md".to_string()]);

        fs::remove_dir_all(root).unwrap();
    }

    fn temp_workspace() -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("semtags-scanner-test-{now}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
}
