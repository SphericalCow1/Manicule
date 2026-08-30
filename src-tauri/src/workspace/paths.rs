use std::path::{Component, Path, PathBuf};

pub fn page_key_from_link_target(target: &str) -> Option<String> {
    let without_extension = target.strip_suffix(".md").unwrap_or(target);
    normalize_relative_page_key(without_extension)
}

pub fn page_key_from_relative_path(path: &str) -> Option<String> {
    let without_extension = path.strip_suffix(".md").unwrap_or(path);
    normalize_relative_page_key(without_extension)
}

pub fn markdown_path_from_page_target(target: &str) -> Option<String> {
    let without_extension = target.strip_suffix(".md").unwrap_or(target);
    normalize_relative_page_path(without_extension).map(|path| format!("{path}.md"))
}

pub fn folder_path_from_target(target: &str) -> Option<String> {
    normalize_relative_page_path(target)
}

pub fn resolve_workspace_relative_path(root: &Path, relative_path: &str) -> Option<PathBuf> {
    let normalized = normalize_relative_file_path(relative_path)?;
    Some(root.join(normalized))
}

fn normalize_relative_page_key(value: &str) -> Option<String> {
    normalize_relative_page_path(value).map(|path| case_insensitive_key(&path))
}

pub(crate) fn case_insensitive_key(value: &str) -> String {
    value.to_lowercase()
}

fn normalize_relative_page_path(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if trimmed.is_empty() || trimmed.starts_with('/') {
        return None;
    }

    let path = Path::new(trimmed);
    let mut segments = Vec::new();

    for component in path.components() {
        match component {
            Component::Normal(segment) => {
                let segment = segment.to_string_lossy();
                if segment.is_empty() {
                    return None;
                }
                segments.push(segment.to_string());
            }
            _ => return None,
        }
    }

    if segments.is_empty() {
        None
    } else {
        Some(segments.join("/"))
    }
}

fn normalize_relative_file_path(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if trimmed.is_empty() || trimmed.starts_with('/') {
        return None;
    }

    let path = Path::new(trimmed);
    let mut segments = Vec::new();

    for component in path.components() {
        match component {
            Component::Normal(segment) => {
                let segment = segment.to_string_lossy();
                if segment.is_empty() {
                    return None;
                }
                segments.push(segment.to_string());
            }
            _ => return None,
        }
    }

    if segments.is_empty() {
        None
    } else {
        Some(segments.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct MarkdownRulesFixture {
        shared: SharedRulesFixture,
    }

    #[derive(Deserialize)]
    struct SharedRulesFixture {
        #[serde(rename = "wikiTargetKeys")]
        wiki_target_keys: Vec<WikiTargetKeyFixture>,
    }

    #[derive(Deserialize)]
    struct WikiTargetKeyFixture {
        name: String,
        target: String,
        key: Option<String>,
    }

    #[test]
    fn normalizes_link_targets_case_insensitively() {
        assert_eq!(
            page_key_from_link_target("Projekte/Projekt Alpha"),
            Some("projekte/projekt alpha".to_string())
        );
    }

    #[test]
    fn normalizes_shared_wiki_target_key_fixtures() {
        let fixtures: MarkdownRulesFixture =
            serde_json::from_str(include_str!("../../../tests/fixtures/markdown-rules.json"))
                .unwrap();

        for fixture in fixtures.shared.wiki_target_keys {
            assert_eq!(
                page_key_from_link_target(&fixture.target),
                fixture.key,
                "{}",
                fixture.name
            );
        }
    }

    #[test]
    fn accepts_markdown_extension_in_link_targets() {
        assert_eq!(
            page_key_from_link_target("Projekte/Projekt Alpha.md"),
            Some("projekte/projekt alpha".to_string())
        );
        assert_eq!(
            markdown_path_from_page_target("Projekte/Projekt Alpha.md"),
            Some("Projekte/Projekt Alpha.md".to_string())
        );
    }

    #[test]
    fn removes_markdown_extension_from_paths() {
        assert_eq!(
            page_key_from_relative_path("Projekte/Projekt Alpha.md"),
            Some("projekte/projekt alpha".to_string())
        );
    }

    #[test]
    fn rejects_paths_outside_workspace() {
        assert_eq!(page_key_from_link_target("/Alpha"), None);
        assert_eq!(page_key_from_link_target("../Alpha"), None);
        assert_eq!(page_key_from_link_target("Alpha/../Beta"), None);
        assert_eq!(page_key_from_link_target("./Alpha"), None);
    }

    #[test]
    fn converts_target_to_markdown_path() {
        assert_eq!(
            markdown_path_from_page_target("Projekte/Projekt Alpha"),
            Some("Projekte/Projekt Alpha.md".to_string())
        );
    }

    #[test]
    fn converts_target_to_folder_path() {
        assert_eq!(
            folder_path_from_target("Projekte/Alpha"),
            Some("Projekte/Alpha".to_string())
        );
        assert_eq!(folder_path_from_target("../Alpha"), None);
        assert_eq!(folder_path_from_target(""), None);
    }

    #[test]
    fn resolves_workspace_relative_file_paths() {
        let root = Path::new("/workspace");

        assert_eq!(
            resolve_workspace_relative_path(root, "Projekte/Alpha.md"),
            Some(PathBuf::from("/workspace/Projekte/Alpha.md"))
        );
        assert_eq!(resolve_workspace_relative_path(root, "../Alpha.md"), None);
        assert_eq!(resolve_workspace_relative_path(root, "/Alpha.md"), None);
    }
}
