use std::collections::HashMap;

use crate::workspace::paths::page_key_from_relative_path;
use crate::{Diagnostic, DiagnosticSeverity};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page {
    pub path: String,
    pub title: String,
    pub key: String,
}

#[derive(Debug, Clone, Default)]
pub struct PageIndex {
    pages_by_path: HashMap<String, Page>,
    pages_by_key: HashMap<String, Vec<String>>,
}

impl PageIndex {
    pub fn from_paths(paths: impl IntoIterator<Item = String>) -> Self {
        let mut index = Self::default();

        for path in paths {
            index.insert_path(path);
        }

        index
    }

    pub fn insert_path(&mut self, path: String) -> Option<Page> {
        self.insert_page(path, "")
    }

    pub fn insert_page(&mut self, path: String, markdown: &str) -> Option<Page> {
        let key = page_key_from_relative_path(&path)?;
        let title = title_from_markdown_or_path(markdown, &path);
        let page = Page {
            path: path.clone(),
            title,
            key: key.clone(),
        };

        self.pages_by_path.insert(path.clone(), page.clone());
        self.pages_by_key.entry(key).or_default().push(path);

        Some(page)
    }

    pub fn update_title(&mut self, path: &str, markdown: &str) {
        if let Some(page) = self.pages_by_path.get_mut(path) {
            page.title = title_from_markdown_or_path(markdown, path);
        }
    }

    pub fn get_by_path(&self, path: &str) -> Option<&Page> {
        self.pages_by_path.get(path)
    }

    pub fn remove_path(&mut self, path: &str) -> Option<Page> {
        let page = self.pages_by_path.remove(path)?;

        if let Some(paths) = self.pages_by_key.get_mut(&page.key) {
            paths.retain(|candidate| candidate != path);
            if paths.is_empty() {
                self.pages_by_key.remove(&page.key);
            }
        }

        Some(page)
    }

    pub fn paths_for_key(&self, key: &str) -> &[String] {
        self.pages_by_key.get(key).map(Vec::as_slice).unwrap_or(&[])
    }

    pub fn resolve_path(&self, path: &str) -> Result<Option<String>, String> {
        if self.pages_by_path.contains_key(path) {
            return Ok(Some(path.to_string()));
        }

        let Some(key) = page_key_from_relative_path(path) else {
            return Ok(None);
        };
        let paths = self.paths_for_key(&key);

        match paths {
            [] => Ok(None),
            [path] => Ok(Some(path.clone())),
            _ => Err(format!(
                "Multiple pages resolve to case-insensitive key '{key}'"
            )),
        }
    }

    pub fn pages(&self) -> Vec<Page> {
        let mut pages: Vec<_> = self.pages_by_path.values().cloned().collect();
        pages.sort_by(|left, right| left.path.cmp(&right.path));
        pages
    }

    pub fn collision_diagnostics(&self) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();

        for (key, paths) in &self.pages_by_key {
            if paths.len() > 1 {
                diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    code: "page_key_collision".to_string(),
                    message: format!("Multiple pages resolve to case-insensitive key '{key}'"),
                    path: Some(paths.join(", ")),
                });
            }
        }

        diagnostics
    }
}

pub(crate) fn title_from_markdown_or_path(markdown: &str, path: &str) -> String {
    first_h1(markdown).unwrap_or_else(|| title_from_path(path))
}

pub(crate) fn markdown_with_default_h1(markdown: &str, path: &str) -> Option<String> {
    if first_h1(markdown).is_some() {
        return None;
    }

    Some(format!(
        "{}{}",
        default_h1_for_path(path),
        markdown.trim_start_matches(['\r', '\n'])
    ))
}

pub(crate) fn default_h1_for_path(path: &str) -> String {
    format!("# {}\n\n", title_from_path(path))
}

pub(crate) fn title_from_path(path: &str) -> String {
    capitalize_first(
        path.rsplit('/')
            .next()
            .unwrap_or(path)
            .strip_suffix(".md")
            .unwrap_or(path),
    )
}

fn capitalize_first(value: &str) -> String {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };

    format!("{}{}", first.to_uppercase(), chars.as_str())
}

fn first_h1(markdown: &str) -> Option<String> {
    markdown.lines().find_map(|line| {
        let trimmed = line.trim();
        let title = trimmed.strip_prefix("# ")?;
        let title = title.trim();
        (!title.is_empty()).then(|| title.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_pages_by_path_and_key() {
        let index = PageIndex::from_paths(vec![
            "Projekte/Projekt Alpha.md".to_string(),
            "Inbox.md".to_string(),
        ]);

        assert_eq!(
            index.get_by_path("Projekte/Projekt Alpha.md").unwrap().key,
            "projekte/projekt alpha"
        );
        assert_eq!(index.paths_for_key("inbox"), &["Inbox.md".to_string()]);
    }

    #[test]
    fn uses_first_h1_as_page_title() {
        let mut index = PageIndex::default();
        let page = index
            .insert_page(
                "Projekte/Projekt Alpha.md".to_string(),
                "\n# Rollout Alpha\n\n- Notes",
            )
            .unwrap();

        assert_eq!(page.title, "Rollout Alpha");
        assert_eq!(
            index
                .get_by_path("Projekte/Projekt Alpha.md")
                .unwrap()
                .title,
            "Rollout Alpha"
        );
    }

    #[test]
    fn ignores_later_h1_headings_for_page_title() {
        let mut index = PageIndex::default();
        let page = index
            .insert_page(
                "Projekte/Projekt Alpha.md".to_string(),
                "# Primary Title\n\n- Note\n\n# Later Heading",
            )
            .unwrap();

        assert_eq!(page.title, "Primary Title");
    }

    #[test]
    fn falls_back_to_file_name_when_h1_is_missing() {
        let mut index = PageIndex::default();
        let page = index
            .insert_page("Projekte/Projekt Alpha.md".to_string(), "## Section")
            .unwrap();

        assert_eq!(page.title, "Projekt Alpha");
    }

    #[test]
    fn updates_page_title_from_content() {
        let mut index = PageIndex::from_paths(vec!["Projekte/Projekt Alpha.md".to_string()]);

        index.update_title("Projekte/Projekt Alpha.md", "# Neuer Titel");

        assert_eq!(
            index
                .get_by_path("Projekte/Projekt Alpha.md")
                .unwrap()
                .title,
            "Neuer Titel"
        );
    }

    #[test]
    fn adds_default_h1_when_markdown_has_no_h1() {
        assert_eq!(
            markdown_with_default_h1("- First note", "Projekte/Projekt Alpha.md").as_deref(),
            Some("# Projekt Alpha\n\n- First note")
        );
    }

    #[test]
    fn capitalizes_default_h1_from_lowercase_file_name() {
        assert_eq!(
            markdown_with_default_h1("- First note", "Projekte/projekt alpha.md").as_deref(),
            Some("# Projekt alpha\n\n- First note")
        );
    }

    #[test]
    fn keeps_markdown_unchanged_when_h1_exists() {
        assert_eq!(
            markdown_with_default_h1("# Existing\n\n- Note", "Projekte/Projekt Alpha.md"),
            None
        );
    }

    #[test]
    fn detects_case_insensitive_collisions() {
        let index = PageIndex::from_paths(vec![
            "Projekte/Projekt Alpha.md".to_string(),
            "projekte/projekt alpha.md".to_string(),
        ]);

        let diagnostics = index.collision_diagnostics();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, "page_key_collision");
    }

    #[test]
    fn detects_unicode_lowercase_collisions() {
        let index = PageIndex::from_paths(vec![
            "Projekte/Übersicht.md".to_string(),
            "projekte/übersicht.md".to_string(),
        ]);

        let diagnostics = index.collision_diagnostics();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, "page_key_collision");
        assert_eq!(
            diagnostics[0].path.as_deref(),
            Some("Projekte/Übersicht.md, projekte/übersicht.md")
        );
    }

    #[test]
    fn resolves_paths_case_insensitively() {
        let index = PageIndex::from_paths(vec!["Projekte/Projekt Alpha.md".to_string()]);

        assert_eq!(
            index
                .resolve_path("projekte/projekt alpha.md")
                .unwrap()
                .as_deref(),
            Some("Projekte/Projekt Alpha.md")
        );
    }

    #[test]
    fn removes_pages_from_path_and_key_indexes() {
        let mut index = PageIndex::from_paths(vec!["Projekte/Projekt Alpha.md".to_string()]);

        let removed = index.remove_path("Projekte/Projekt Alpha.md");

        assert!(removed.is_some());
        assert!(index.get_by_path("Projekte/Projekt Alpha.md").is_none());
        assert!(index.paths_for_key("projekte/projekt alpha").is_empty());
    }
}
