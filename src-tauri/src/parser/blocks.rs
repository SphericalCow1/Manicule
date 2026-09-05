use crate::parser::wiki_links::{markdown_fence_marker, parse_wiki_links, WikiLink};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedBlock {
    pub line_start: usize,
    pub line_end: usize,
    pub indent: usize,
    pub text: String,
    pub task_status: Option<String>,
    pub task_priority: Option<String>,
    pub markdown: String,
    pub links: Vec<WikiLink>,
    pub children: Vec<ParsedBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FlatBlock {
    line_start: usize,
    line_end: usize,
    indent: usize,
    text: String,
    task_status: Option<String>,
    task_priority: Option<String>,
    markdown_lines: Vec<String>,
    links: Vec<WikiLink>,
}

pub fn parse_blocks(markdown: &str) -> Vec<ParsedBlock> {
    parse_blocks_with_task_states(
        markdown,
        &crate::workspace_config::WorkspaceConfig::default().task_states,
    )
}

pub fn parse_blocks_with_task_states(markdown: &str, task_states: &[String]) -> Vec<ParsedBlock> {
    let lines: Vec<String> = markdown.lines().map(expand_tabs).collect();
    let flat = parse_flat_blocks(&lines, task_states);
    build_tree(&flat, 0, None).0
}

fn parse_flat_blocks(lines: &[String], task_states: &[String]) -> Vec<FlatBlock> {
    let mut blocks = Vec::new();
    let mut current: Option<FlatBlock> = None;
    let mut active_fence: Option<(char, usize)> = None;

    for (index, line) in lines.iter().enumerate() {
        let line_number = index + 1;
        let fence_marker = markdown_fence_marker(line);
        let is_code_line = active_fence.is_some() || fence_marker.is_some();
        if let Some((marker, length)) = fence_marker {
            match active_fence {
                Some((open_marker, open_length))
                    if marker == open_marker && length >= open_length =>
                {
                    active_fence = None;
                }
                None => active_fence = Some((marker, length)),
                _ => {}
            }
        }
        let line_links = if is_code_line {
            Vec::new()
        } else {
            parse_wiki_links(line)
        };

        if let Some(item) = parse_list_item(line) {
            if let Some(block) = current.take() {
                blocks.push(block);
            }

            let task_marker = parse_task_marker(item.text, task_states);
            current = Some(FlatBlock {
                line_start: line_number,
                line_end: line_number,
                indent: item.indent,
                text: item.text.to_string(),
                task_status: task_marker.status,
                task_priority: task_marker.priority,
                markdown_lines: vec![line.to_string()],
                links: line_links,
            });
            continue;
        }

        if let Some(block) = current.as_mut() {
            if line.trim().is_empty() || count_indent(line) > block.indent {
                block.line_end = line_number;
                block.markdown_lines.push(line.to_string());
                block.links.extend(line_links);
                continue;
            }
        }

        if let Some(block) = current.take() {
            blocks.push(block);
        }

        if !line.trim().is_empty() {
            let indent = count_indent(line);
            let task_marker = parse_task_marker(&line[indent..], task_states);
            current = Some(FlatBlock {
                line_start: line_number,
                line_end: line_number,
                indent,
                text: line[indent..].to_string(),
                task_status: task_marker.status,
                task_priority: task_marker.priority,
                markdown_lines: vec![line.to_string()],
                links: line_links,
            });
        }
    }

    if let Some(block) = current {
        blocks.push(block);
    }

    blocks
}

fn build_tree(
    flat: &[FlatBlock],
    start: usize,
    parent_indent: Option<usize>,
) -> (Vec<ParsedBlock>, usize) {
    let mut blocks = Vec::new();
    let mut index = start;

    while index < flat.len() {
        let block = &flat[index];

        if parent_indent.is_some_and(|indent| block.indent <= indent) {
            break;
        }

        let (children, next_index) = build_tree(flat, index + 1, Some(block.indent));
        let mut markdown_lines = block.markdown_lines.clone();

        for child in &children {
            markdown_lines.extend(child.markdown.lines().map(str::to_string));
        }

        let line_end = children
            .last()
            .map(|child| child.line_end)
            .unwrap_or(block.line_end);

        blocks.push(ParsedBlock {
            line_start: block.line_start,
            line_end,
            indent: block.indent,
            text: block.text.clone(),
            task_status: block.task_status.clone(),
            task_priority: block.task_priority.clone(),
            markdown: markdown_lines.join("\n"),
            links: block.links.clone(),
            children,
        });

        index = next_index;
    }

    (blocks, index)
}

#[derive(Debug, Clone, Copy)]
struct ListItem<'a> {
    indent: usize,
    text: &'a str,
}

fn parse_list_item(line: &str) -> Option<ListItem<'_>> {
    let indent = count_indent(line);
    let trimmed = &line[indent..];
    let marker_end = if matches!(trimmed.as_bytes().first(), Some(b'-' | b'*' | b'+')) {
        1
    } else {
        let digit_count = trimmed
            .bytes()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        if digit_count == 0 || !matches!(trimmed.as_bytes().get(digit_count), Some(b'.' | b')')) {
            return None;
        }
        digit_count + 1
    };

    if !matches!(trimmed.as_bytes().get(marker_end), Some(b' ')) {
        return None;
    }

    Some(ListItem {
        indent,
        text: &trimmed[marker_end + 1..],
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TaskMarker {
    status: Option<String>,
    priority: Option<String>,
}

fn parse_task_marker(text: &str, task_states: &[String]) -> TaskMarker {
    let trimmed = strip_checkbox_marker(text.trim_start());
    let status = task_status_prefix(trimmed, task_states).map(str::to_string);
    let priority = status
        .as_ref()
        .and_then(|status| parse_priority_cookie(trimmed[status.len()..].trim_start()));

    TaskMarker { status, priority }
}

fn task_status_prefix<'a>(text: &str, task_states: &'a [String]) -> Option<&'a str> {
    task_states
        .iter()
        .filter(|state| is_task_status_boundary(text, state))
        .max_by_key(|state| state.len())
        .map(String::as_str)
}

fn is_task_status_boundary(text: &str, state: &str) -> bool {
    let Some(remaining) = text.strip_prefix(state) else {
        return false;
    };

    remaining.is_empty()
        || remaining.starts_with("[#")
        || remaining.chars().next().is_some_and(char::is_whitespace)
}

fn parse_priority_cookie(text: &str) -> Option<String> {
    let rest = text.strip_prefix("[#")?;
    let (priority, remaining) = rest.split_once(']')?;

    if priority.is_empty()
        || !priority
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '-')
        || !remaining
            .chars()
            .next()
            .is_none_or(|char| char.is_whitespace())
    {
        return None;
    }

    Some(priority.to_string())
}

fn strip_checkbox_marker(text: &str) -> &str {
    for marker in ["[ ] ", "[x] ", "[X] "] {
        if let Some(rest) = text.strip_prefix(marker) {
            return rest.trim_start();
        }
    }

    text
}

fn count_indent(line: &str) -> usize {
    line.chars().take_while(|char| *char == ' ').count()
}

fn expand_tabs(line: &str) -> String {
    line.replace('\t', "    ")
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
        #[serde(rename = "defaultTaskStates")]
        default_task_states: Vec<String>,
        #[serde(rename = "taskLines")]
        task_lines: Vec<TaskLineFixture>,
        #[serde(rename = "blockLines")]
        block_lines: Vec<BlockLineFixture>,
        #[serde(rename = "blockDocuments")]
        block_documents: Vec<BlockDocumentFixture>,
        #[serde(rename = "generatedBlockDocuments")]
        generated_block_documents: Vec<GeneratedBlockDocumentFixture>,
    }

    #[derive(Deserialize)]
    struct TaskLineFixture {
        name: String,
        source: String,
        #[serde(rename = "taskStates")]
        task_states: Option<Vec<String>>,
        status: Option<String>,
        priority: Option<String>,
    }

    #[derive(Deserialize)]
    struct BlockLineFixture {
        name: String,
        source: String,
        prefix: Option<String>,
        indent: usize,
        checked: Option<bool>,
    }

    #[derive(Deserialize)]
    struct BlockDocumentFixture {
        name: String,
        source: String,
        #[serde(rename = "topLevelBlocks")]
        top_level_blocks: usize,
        #[serde(rename = "firstBlockEnd")]
        first_block_end: usize,
        #[serde(rename = "firstBlockChildren")]
        first_block_children: usize,
    }

    #[derive(Deserialize)]
    struct GeneratedBlockDocumentFixture {
        name: String,
        depth: usize,
        #[serde(rename = "continuationLines")]
        continuation_lines: usize,
    }

    #[test]
    fn parses_simple_list_blocks() {
        let blocks = parse_blocks("- One\n- Two");

        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].text, "One");
        assert_eq!(blocks[1].text, "Two");
    }

    #[test]
    fn parses_nested_blocks() {
        let blocks = parse_blocks("- Parent\n  - Child\n    - Grandchild\n- Sibling");

        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].children.len(), 1);
        assert_eq!(blocks[0].children[0].children.len(), 1);
        assert_eq!(blocks[0].line_end, 3);
        assert_eq!(blocks[1].line_start, 4);
    }

    #[test]
    fn includes_children_in_parent_markdown() {
        let blocks = parse_blocks("- Parent [[Alpha]]\n  - Child\n    Continued");

        assert_eq!(
            blocks[0].markdown,
            "- Parent [[Alpha]]\n  - Child\n    Continued"
        );
    }

    #[test]
    fn treats_continuation_lines_as_part_of_block() {
        let blocks = parse_blocks("- Decision [[Alpha]]\n  Reason\n  - Child");

        assert_eq!(
            blocks[0].markdown,
            "- Decision [[Alpha]]\n  Reason\n  - Child"
        );
        assert_eq!(blocks[0].children.len(), 1);
    }

    #[test]
    fn treats_plain_markdown_lines_as_blocks() {
        let blocks = parse_blocks("# Title\nPlain paragraph [[Alpha]]\n\n- List [[Beta]]");

        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].text, "# Title");
        assert_eq!(blocks[1].text, "Plain paragraph [[Alpha]]");
        assert_eq!(blocks[1].links.len(), 1);
        assert_eq!(blocks[2].text, "List [[Beta]]");
    }

    #[test]
    fn recognizes_mixed_markers_and_checkboxes() {
        let blocks = parse_blocks("* [ ] Task [[Alpha]]\n+ Other");

        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].text, "[ ] Task [[Alpha]]");
        assert_eq!(blocks[0].links.len(), 1);
    }

    #[test]
    fn recognizes_compact_links_but_not_links_inside_fenced_code() {
        let blocks = parse_blocks("- See #Alpha\n```md\n#Beta\n```\n- See #Gamma");

        let targets: Vec<&str> = blocks
            .iter()
            .flat_map(|block| block.links.iter().map(|link| link.target.as_str()))
            .collect();
        assert_eq!(targets, vec!["Alpha", "Gamma"]);
    }

    #[test]
    fn recognizes_ordered_list_markers() {
        let blocks = parse_blocks("1. TODO First\n  2) DONE Second");

        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].text, "TODO First");
        assert_eq!(blocks[0].task_status.as_deref(), Some("TODO"));
        assert_eq!(blocks[0].children[0].text, "DONE Second");
        assert_eq!(blocks[0].children[0].task_status.as_deref(), Some("DONE"));
    }

    #[test]
    fn recognizes_task_status_keywords_at_block_start() {
        let blocks =
            parse_blocks("- TODO Prepare [[Meeting]]\n- DONE Follow up\n- INPROGRESS Draft");

        assert_eq!(blocks[0].task_status.as_deref(), Some("TODO"));
        assert_eq!(blocks[1].task_status.as_deref(), Some("DONE"));
        assert_eq!(blocks[2].task_status.as_deref(), Some("INPROGRESS"));
    }

    #[test]
    fn recognizes_task_status_after_checkbox_marker() {
        let blocks = parse_blocks("- [ ] WAITING Input\n- [x] DONE Duplicate");

        assert_eq!(blocks[0].task_status.as_deref(), Some("WAITING"));
        assert_eq!(blocks[1].task_status.as_deref(), Some("DONE"));
    }

    #[test]
    fn recognizes_priority_cookie_after_task_status() {
        let blocks = parse_blocks("- TODO [#A] Prepare\n- DONE [#B] Close\n- WAITING[#C] Attached");

        assert_eq!(blocks[0].task_status.as_deref(), Some("TODO"));
        assert_eq!(blocks[0].task_priority.as_deref(), Some("A"));
        assert_eq!(blocks[1].task_status.as_deref(), Some("DONE"));
        assert_eq!(blocks[1].task_priority.as_deref(), Some("B"));
        assert_eq!(blocks[2].task_status.as_deref(), Some("WAITING"));
        assert_eq!(blocks[2].task_priority.as_deref(), Some("C"));
    }

    #[test]
    fn ignores_priority_cookie_without_task_status() {
        let blocks = parse_blocks("- Discuss [#A] Priority");

        assert_eq!(blocks[0].task_status, None);
        assert_eq!(blocks[0].task_priority, None);
    }

    #[test]
    fn recognizes_configured_task_statuses() {
        let states = vec![
            "TODO".to_string(),
            "BLOCKED".to_string(),
            "DONE".to_string(),
        ];
        let blocks = parse_blocks_with_task_states("- BLOCKED Input\n- WAITING Ignored", &states);

        assert_eq!(blocks[0].task_status.as_deref(), Some("BLOCKED"));
        assert_eq!(blocks[1].task_status, None);
    }

    #[test]
    fn ignores_task_keywords_inside_block_text() {
        let blocks = parse_blocks("- Discuss TODO handling");

        assert_eq!(blocks[0].task_status, None);
    }

    #[test]
    fn parses_shared_task_keyword_fixtures() {
        let fixtures: MarkdownRulesFixture =
            serde_json::from_str(include_str!("../../../tests/fixtures/markdown-rules.json"))
                .unwrap();
        let defaults = crate::workspace_config::WorkspaceConfig::default().task_states;

        assert_eq!(defaults, fixtures.shared.default_task_states);

        for fixture in fixtures.shared.task_lines {
            let task_states = fixture.task_states.as_ref().unwrap_or(&defaults);
            let blocks = parse_blocks_with_task_states(&fixture.source, task_states);
            let block = &blocks[0];

            assert_eq!(
                block.task_status.as_deref(),
                fixture.status.as_deref(),
                "{} status",
                fixture.name
            );
            assert_eq!(
                block.task_priority.as_deref(),
                fixture.priority.as_deref(),
                "{} priority",
                fixture.name
            );
        }
    }

    #[test]
    fn parses_shared_block_line_fixtures() {
        let fixtures: MarkdownRulesFixture =
            serde_json::from_str(include_str!("../../../tests/fixtures/markdown-rules.json"))
                .unwrap();

        for fixture in fixtures.shared.block_lines {
            let expanded = expand_tabs(&fixture.source);
            let item = parse_list_item(&expanded);

            assert_eq!(
                item.is_some(),
                fixture.prefix.is_some(),
                "{} list marker",
                fixture.name
            );
            assert_eq!(
                count_indent(&expanded),
                fixture.indent,
                "{} indent",
                fixture.name
            );
            assert_eq!(
                item.and_then(|item| checkbox_state(item.text)),
                fixture.checked,
                "{} checkbox",
                fixture.name
            );
        }
    }

    #[test]
    fn parses_shared_nested_block_fixtures() {
        let fixtures: MarkdownRulesFixture =
            serde_json::from_str(include_str!("../../../tests/fixtures/markdown-rules.json"))
                .unwrap();

        for fixture in fixtures.shared.block_documents {
            let blocks = parse_blocks(&fixture.source);

            assert_eq!(
                blocks.len(),
                fixture.top_level_blocks,
                "{} roots",
                fixture.name
            );
            assert_eq!(
                blocks[0].line_end, fixture.first_block_end,
                "{} first block end",
                fixture.name
            );
            assert_eq!(
                blocks[0].children.len(),
                fixture.first_block_children,
                "{} first block children",
                fixture.name
            );
        }
    }

    #[test]
    fn parses_generated_large_and_deeply_nested_block_documents() {
        let fixtures: MarkdownRulesFixture =
            serde_json::from_str(include_str!("../../../tests/fixtures/markdown-rules.json"))
                .unwrap();

        for fixture in fixtures.shared.generated_block_documents {
            let source = generated_block_document(fixture.depth, fixture.continuation_lines);
            let blocks = parse_blocks(&source);
            let mut current = &blocks[0];

            assert_eq!(blocks.len(), 1, "{} roots", fixture.name);
            assert_eq!(
                current.line_end,
                fixture.depth + fixture.continuation_lines,
                "{} root end",
                fixture.name
            );
            for level in 1..fixture.depth {
                assert_eq!(current.children.len(), 1, "{} level {level}", fixture.name);
                current = &current.children[0];
            }
            assert_eq!(
                current.line_end,
                fixture.depth + fixture.continuation_lines,
                "{} deepest end",
                fixture.name
            );
        }
    }

    fn generated_block_document(depth: usize, continuation_lines: usize) -> String {
        let mut lines: Vec<String> = (0..depth)
            .map(|level| format!("{}- Level {}", "  ".repeat(level), level + 1))
            .collect();
        let continuation_indent = "  ".repeat(depth);
        lines.extend(
            (1..=continuation_lines)
                .map(|index| format!("{continuation_indent}Continuation {index}")),
        );
        lines.join("\n")
    }

    fn checkbox_state(text: &str) -> Option<bool> {
        if text.starts_with("[ ] ") {
            Some(false)
        } else if text.starts_with("[x] ") || text.starts_with("[X] ") {
            Some(true)
        } else {
            None
        }
    }

    #[test]
    fn expands_tabs_to_four_spaces() {
        let blocks = parse_blocks("- Parent\n\t- Child");

        assert_eq!(blocks[0].children.len(), 1);
        assert_eq!(blocks[0].children[0].indent, 4);
    }
}
