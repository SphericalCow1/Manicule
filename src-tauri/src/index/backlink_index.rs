use std::collections::{HashMap, HashSet};

use crate::index::page_index::title_from_markdown_or_path;
use crate::parser::blocks::{parse_blocks, ParsedBlock};
use crate::workspace::paths::page_key_from_link_target;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedPage {
    pub path: String,
    pub blocks: Vec<ParsedBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Backlink {
    pub target_key: String,
    pub source_path: String,
    pub source_title: String,
    pub source_headings: Vec<String>,
    pub block_markdown: String,
    pub line_numbers: Vec<usize>,
    pub line_start: usize,
}

#[derive(Debug, Clone, Default)]
pub struct BacklinkIndex {
    backlinks_by_target_key: HashMap<String, Vec<Backlink>>,
    source_targets_by_path: HashMap<String, HashSet<String>>,
    source_backlinks_by_path: HashMap<String, Vec<Backlink>>,
}

impl BacklinkIndex {
    pub fn index_page(&mut self, source_path: String, markdown: &str) -> HashSet<String> {
        self.remove_page(&source_path);

        let source_title = title_from_markdown_or_path(markdown, &source_path);
        let blocks = parse_blocks(markdown);
        let heading_contexts = heading_contexts_by_line(markdown);
        let source_lines: Vec<&str> = markdown.lines().collect();
        let mut backlinks = Vec::new();
        let mut ancestors = Vec::new();
        collect_backlinks(
            &blocks,
            &source_path,
            &source_title,
            &heading_contexts,
            &source_lines,
            &mut ancestors,
            &mut backlinks,
        );

        let mut targets = HashSet::new();

        for backlink in backlinks.iter().cloned() {
            targets.insert(backlink.target_key.clone());
            self.backlinks_by_target_key
                .entry(backlink.target_key.clone())
                .or_default()
                .push(backlink);
        }

        for target_backlinks in self.backlinks_by_target_key.values_mut() {
            target_backlinks.sort_by(|left, right| {
                right
                    .source_path
                    .cmp(&left.source_path)
                    .then(left.line_start.cmp(&right.line_start))
            });
        }

        self.source_targets_by_path
            .insert(source_path.clone(), targets.clone());
        self.source_backlinks_by_path.insert(source_path, backlinks);

        targets
    }

    pub fn remove_page(&mut self, source_path: &str) -> HashSet<String> {
        let old_targets = self
            .source_targets_by_path
            .remove(source_path)
            .unwrap_or_default();

        if let Some(old_backlinks) = self.source_backlinks_by_path.remove(source_path) {
            for backlink in old_backlinks {
                if let Some(target_backlinks) =
                    self.backlinks_by_target_key.get_mut(&backlink.target_key)
                {
                    target_backlinks.retain(|entry| {
                        entry.source_path != backlink.source_path
                            || entry.line_start != backlink.line_start
                    });
                }
            }
        }

        old_targets
    }

    pub fn backlinks_for_target_key(&self, key: &str) -> Vec<Backlink> {
        self.backlinks_by_target_key
            .get(key)
            .cloned()
            .unwrap_or_default()
    }
}

fn collect_backlinks<'a>(
    blocks: &'a [ParsedBlock],
    source_path: &str,
    source_title: &str,
    heading_contexts: &[Vec<String>],
    source_lines: &[&str],
    ancestors: &mut Vec<&'a ParsedBlock>,
    backlinks: &mut Vec<Backlink>,
) {
    for block in blocks {
        for link in &block.links {
            if let Some(target_key) = page_key_from_link_target(&link.target) {
                let context = backlink_context_markdown(source_lines, ancestors, block);
                backlinks.push(Backlink {
                    target_key,
                    source_path: source_path.to_string(),
                    source_title: source_title.to_string(),
                    source_headings: heading_contexts
                        .get(block.line_start.saturating_sub(1))
                        .cloned()
                        .unwrap_or_default(),
                    block_markdown: context.markdown,
                    line_numbers: context.line_numbers,
                    line_start: block.line_start,
                });
            }
        }

        ancestors.push(block);
        collect_backlinks(
            &block.children,
            source_path,
            source_title,
            heading_contexts,
            source_lines,
            ancestors,
            backlinks,
        );
        ancestors.pop();
    }
}

struct BacklinkContext {
    markdown: String,
    line_numbers: Vec<usize>,
}

fn backlink_context_markdown(
    source_lines: &[&str],
    ancestors: &[&ParsedBlock],
    block: &ParsedBlock,
) -> BacklinkContext {
    let root_indent = ancestors
        .first()
        .map(|ancestor| ancestor.indent)
        .unwrap_or(block.indent);
    let mut lines = Vec::new();

    for ancestor in ancestors {
        lines.extend(block_own_lines(source_lines, ancestor));
    }

    lines.extend(block_subtree_lines(source_lines, block));
    BacklinkContext {
        markdown: deindent_markdown(
            &lines
                .iter()
                .map(|line| line.content.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
            root_indent,
        ),
        line_numbers: lines.iter().map(|line| line.number).collect(),
    }
}

struct SourceLine {
    number: usize,
    content: String,
}

fn block_own_lines(source_lines: &[&str], block: &ParsedBlock) -> Vec<SourceLine> {
    let child_start = block
        .children
        .first()
        .map(|child| child.line_start.saturating_sub(1))
        .unwrap_or(block.line_end);

    source_lines_for_range(source_lines, block.line_start, child_start)
}

fn block_subtree_lines(source_lines: &[&str], block: &ParsedBlock) -> Vec<SourceLine> {
    source_lines_for_range(source_lines, block.line_start, block.line_end)
}

fn source_lines_for_range(source_lines: &[&str], start: usize, end: usize) -> Vec<SourceLine> {
    if start == 0 || end < start {
        return Vec::new();
    }

    source_lines
        .iter()
        .enumerate()
        .skip(start - 1)
        .take(end - start + 1)
        .map(|(index, line)| SourceLine {
            number: index + 1,
            content: (*line).to_string(),
        })
        .collect()
}

fn heading_contexts_by_line(markdown: &str) -> Vec<Vec<String>> {
    let mut contexts = Vec::new();
    let mut current_headings: Vec<String> = Vec::new();

    for line in markdown.lines() {
        if let Some((level, heading)) = parse_heading(line) {
            current_headings.truncate(level.saturating_sub(1));
            current_headings.push(heading.to_string());
        }

        contexts.push(current_headings.clone());
    }

    contexts
}

fn parse_heading(line: &str) -> Option<(usize, &str)> {
    let trimmed = line.trim_start();
    let level = trimmed.bytes().take_while(|byte| *byte == b'#').count();

    if level == 0 || level > 6 || !matches!(trimmed.as_bytes().get(level), Some(b' ')) {
        return None;
    }

    let heading = trimmed[level + 1..].trim().trim_end_matches('#').trim();

    (!heading.is_empty()).then_some((level, heading))
}

fn deindent_markdown(markdown: &str, indent: usize) -> String {
    if indent == 0 {
        return markdown.to_string();
    }

    markdown
        .lines()
        .map(|line| {
            if line.trim().is_empty() {
                String::new()
            } else if line.chars().take_while(|char| *char == ' ').count() >= indent {
                line[indent..].to_string()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_backlink_for_block_with_page_link() {
        let mut index = BacklinkIndex::default();
        index.index_page(
            "Meetings/Teamrunde.md".to_string(),
            "# Team Sync\n\n- Wir priorisieren [[Projekte/Projekt Alpha]]\n  - Budget offen",
        );

        let backlinks = index.backlinks_for_target_key("projekte/projekt alpha");
        assert_eq!(backlinks.len(), 1);
        assert_eq!(backlinks[0].source_path, "Meetings/Teamrunde.md");
        assert_eq!(backlinks[0].source_title, "Team Sync");
        assert_eq!(
            backlinks[0].block_markdown,
            "- Wir priorisieren [[Projekte/Projekt Alpha]]\n  - Budget offen"
        );
    }

    #[test]
    fn resolves_alias_links_case_insensitively() {
        let mut index = BacklinkIndex::default();
        index.index_page(
            "Meetings/Teamrunde.md".to_string(),
            "- Check [[projekte/projekt alpha|Alpha]]",
        );

        let backlinks = index.backlinks_for_target_key("projekte/projekt alpha");
        assert_eq!(backlinks.len(), 1);
    }

    #[test]
    fn resolves_links_with_markdown_extension() {
        let mut index = BacklinkIndex::default();
        index.index_page(
            "Team/Nadine.md".to_string(),
            "- Bearbeitet Projekt [[projects/forecasts.md]]",
        );

        let backlinks = index.backlinks_for_target_key("projects/forecasts");
        assert_eq!(backlinks.len(), 1);
    }

    #[test]
    fn creates_backlinks_for_compact_links() {
        let mut index = BacklinkIndex::default();
        index.index_page(
            "Journal.md".to_string(),
            "- Discuss #projects/forecasts\n  - Follow up",
        );

        let backlinks = index.backlinks_for_target_key("projects/forecasts");
        assert_eq!(backlinks.len(), 1);
        assert_eq!(
            backlinks[0].block_markdown,
            "- Discuss #projects/forecasts\n  - Follow up"
        );
    }

    #[test]
    fn removes_old_page_contributions_on_reindex() {
        let mut index = BacklinkIndex::default();
        index.index_page("A.md".to_string(), "- Link [[Alpha]]");
        index.index_page("A.md".to_string(), "- Link [[Beta]]");

        assert!(index.backlinks_for_target_key("alpha").is_empty());
        assert_eq!(index.backlinks_for_target_key("beta").len(), 1);
    }

    #[test]
    fn sorts_backlinks_by_reverse_source_path_and_line() {
        let mut index = BacklinkIndex::default();
        index.index_page("B.md".to_string(), "\n- Later [[Alpha]]");
        index.index_page("A.md".to_string(), "- First [[Alpha]]\n- Second [[Alpha]]");

        let backlinks = index.backlinks_for_target_key("alpha");
        assert_eq!(backlinks[0].source_path, "B.md");
        assert_eq!(backlinks[0].line_start, 2);
        assert_eq!(backlinks[1].source_path, "A.md");
        assert_eq!(backlinks[1].line_start, 1);
        assert_eq!(backlinks[2].source_path, "A.md");
        assert_eq!(backlinks[2].line_start, 2);
    }

    #[test]
    fn deindents_nested_link_blocks_for_standalone_rendering() {
        let mut index = BacklinkIndex::default();
        index.index_page(
            "Journal.md".to_string(),
            "- Parent\n    - Child [[Alpha]]\n        - Detail",
        );

        let backlinks = index.backlinks_for_target_key("alpha");
        assert_eq!(
            backlinks[0].block_markdown,
            "- Parent\n    - Child [[Alpha]]\n        - Detail"
        );
    }

    #[test]
    fn includes_ancestor_path_without_sibling_branches() {
        let mut index = BacklinkIndex::default();
        index.index_page(
            "Journal.md".to_string(),
            "- Parent\n    - Sibling\n    - Child [[Alpha]]\n        - Detail\n- Other",
        );

        let backlinks = index.backlinks_for_target_key("alpha");
        assert_eq!(
            backlinks[0].block_markdown,
            "- Parent\n    - Child [[Alpha]]\n        - Detail"
        );
        assert_eq!(backlinks[0].line_numbers, vec![1, 3, 4]);
    }

    #[test]
    fn includes_heading_context_for_backlinks() {
        let mut index = BacklinkIndex::default();
        index.index_page(
            "projects/forecasts.md".to_string(),
            "# Kapitel 1\nIntro\n## Abschnitt 2\n- Link [[Alpha]]\n### Unterabschnitt 3\nText [[Beta]]",
        );

        let alpha = index.backlinks_for_target_key("alpha");
        assert_eq!(
            alpha[0].source_headings,
            vec!["Kapitel 1".to_string(), "Abschnitt 2".to_string()]
        );

        let beta = index.backlinks_for_target_key("beta");
        assert_eq!(
            beta[0].source_headings,
            vec![
                "Kapitel 1".to_string(),
                "Abschnitt 2".to_string(),
                "Unterabschnitt 3".to_string()
            ]
        );
    }

    #[test]
    fn omits_heading_context_before_first_heading() {
        let mut index = BacklinkIndex::default();
        index.index_page("Inbox.md".to_string(), "Plain [[Alpha]]\n# Later");

        let backlinks = index.backlinks_for_target_key("alpha");

        assert!(backlinks[0].source_headings.is_empty());
    }
}
