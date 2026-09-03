use std::fs;

use crate::app_state::WorkspaceState;
use crate::dto::{
    SearchResultDto, TaskItemDto, TaskLinkDto, ToggleCheckboxResultDto, UpdateTaskStatusResultDto,
};
use crate::index::page_index::Page;
use crate::parser::blocks::{parse_blocks_with_task_states, ParsedBlock};
use crate::parser::wiki_links::{parse_wiki_links, WikiLink};
use crate::workspace::paths::resolve_workspace_relative_path;

pub fn search_pages_in_workspace(
    workspace: &WorkspaceState,
    query: &str,
) -> Result<Vec<SearchResultDto>, String> {
    let normalized_query = query.trim().to_lowercase();

    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();

    for page in workspace.pages.pages() {
        if page_matches_filename(&page, &normalized_query) {
            results.push(RankedSearchResult {
                rank: SearchRank::Filename,
                result: SearchResultDto {
                    path: page.path.clone(),
                    title: page.title.clone(),
                    line: 1,
                    excerpt: page.path.clone(),
                },
            });
        }

        let content = workspace
            .contents
            .get_or_read(&workspace.root, &page.path)?;

        for (index, line) in content.lines().enumerate() {
            if let Some(rank) = classify_search_line(line, &normalized_query) {
                results.push(RankedSearchResult {
                    rank,
                    result: SearchResultDto {
                        path: page.path.clone(),
                        title: page.title.clone(),
                        line: index + 1,
                        excerpt: line.trim().to_string(),
                    },
                });
            }
        }
    }

    results.sort_by(|left, right| {
        left.rank
            .cmp(&right.rank)
            .then_with(|| left.result.path.cmp(&right.result.path))
            .then_with(|| left.result.line.cmp(&right.result.line))
            .then_with(|| left.result.excerpt.cmp(&right.result.excerpt))
    });

    Ok(results.into_iter().map(|result| result.result).collect())
}

#[derive(Debug, Clone)]
struct RankedSearchResult {
    rank: SearchRank,
    result: SearchResultDto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum SearchRank {
    Filename,
    Heading,
    Text,
    Link,
}

fn page_matches_filename(page: &Page, normalized_query: &str) -> bool {
    let filename = page.path.rsplit('/').next().unwrap_or(&page.path);
    let page_name = filename.strip_suffix(".md").unwrap_or(filename);
    page_name.to_lowercase().contains(normalized_query)
}

fn classify_search_line(line: &str, normalized_query: &str) -> Option<SearchRank> {
    if let Some((_, heading)) = parse_heading(line) {
        if heading.to_lowercase().contains(normalized_query) {
            return Some(SearchRank::Heading);
        }
    }

    let links = parse_wiki_links(line);
    let text_without_links = strip_wiki_links(line, &links).to_lowercase();
    if text_without_links.contains(normalized_query) {
        return Some(SearchRank::Text);
    }

    if links
        .iter()
        .any(|link| wiki_link_matches(link, normalized_query))
    {
        return Some(SearchRank::Link);
    }

    None
}

fn strip_wiki_links(line: &str, links: &[WikiLink]) -> String {
    links.iter().fold(line.to_string(), |text, link| {
        text.replacen(&link.raw, "", 1)
    })
}

fn wiki_link_matches(link: &WikiLink, normalized_query: &str) -> bool {
    link.target.to_lowercase().contains(normalized_query)
        || link
            .alias
            .as_deref()
            .is_some_and(|alias| alias.to_lowercase().contains(normalized_query))
}

pub fn list_tasks_in_workspace(workspace: &WorkspaceState) -> Result<Vec<TaskItemDto>, String> {
    let mut tasks = Vec::new();

    for page in workspace.pages.pages() {
        let content = workspace
            .contents
            .get_or_read(&workspace.root, &page.path)?;
        let blocks = parse_blocks_with_task_states(&content, &workspace.config.task_states);
        let heading_contexts = heading_contexts_by_line(&content);

        collect_task_items(&blocks, &page, workspace, &heading_contexts, &mut tasks);
    }

    Ok(tasks)
}

pub(crate) fn update_task_status_in_workspace(
    workspace: &mut WorkspaceState,
    path: &str,
    line: usize,
    expected_status: &str,
    new_status: &str,
) -> Result<UpdateTaskStatusResultDto, String> {
    if line == 0 {
        return Err("Task line must be greater than 0".to_string());
    }

    if !workspace
        .config
        .task_states
        .iter()
        .any(|state| state == new_status)
    {
        return Err(format!("Unknown task status '{new_status}'"));
    }

    let resolved_path = workspace
        .pages
        .resolve_path(path)?
        .ok_or_else(|| "Page is not indexed".to_string())?;
    let page = workspace
        .pages
        .get_by_path(&resolved_path)
        .cloned()
        .ok_or_else(|| "Page is not indexed".to_string())?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| format!("Invalid page path '{resolved_path}'"))?;
    let content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read page '{}': {error}", resolved_path))?;
    let line_range = line_content_range(&content, line)
        .ok_or_else(|| format!("Task line {line} does not exist"))?;
    let line_text = &content[line_range.clone()];
    let status_span = task_status_span(line_text, &workspace.config.task_states)
        .ok_or_else(|| format!("Line {line} is not a recognized task"))?;
    let current_status = &line_text[status_span.clone()];

    if current_status != expected_status {
        return Err(format!(
            "Task status changed from '{expected_status}' to '{current_status}'. Refresh tasks."
        ));
    }

    let mut updated_content = content.clone();
    updated_content.replace_range(
        line_range.start + status_span.start..line_range.start + status_span.end,
        new_status,
    );

    fs::write(&absolute_path, &updated_content)
        .map_err(|error| format!("Failed to write page '{}': {error}", resolved_path))?;
    workspace.index_page_content(resolved_path.clone(), updated_content.clone());

    let blocks = parse_blocks_with_task_states(&updated_content, &workspace.config.task_states);
    let heading_contexts = heading_contexts_by_line(&updated_content);
    let mut tasks = Vec::new();
    collect_task_items(&blocks, &page, workspace, &heading_contexts, &mut tasks);
    let task = tasks
        .into_iter()
        .find(|task| task.line == line)
        .ok_or_else(|| "Updated task could not be read back".to_string())?;

    Ok(UpdateTaskStatusResultDto { task })
}

pub(crate) fn update_task_priority_in_workspace(
    workspace: &mut WorkspaceState,
    path: &str,
    line: usize,
    priority: Option<String>,
) -> Result<UpdateTaskStatusResultDto, String> {
    if line == 0 {
        return Err("Task line must be greater than 0".to_string());
    }

    if let Some(priority) = &priority {
        validate_task_priority(priority)?;
    }

    let resolved_path = workspace
        .pages
        .resolve_path(path)?
        .ok_or_else(|| "Page is not indexed".to_string())?;
    let page = workspace
        .pages
        .get_by_path(&resolved_path)
        .cloned()
        .ok_or_else(|| "Page is not indexed".to_string())?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| format!("Invalid page path '{resolved_path}'"))?;
    let content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read page '{}': {error}", resolved_path))?;
    let line_range = line_content_range(&content, line)
        .ok_or_else(|| format!("Task line {line} does not exist"))?;
    let line_text = &content[line_range.clone()];
    let status_span = task_status_span(line_text, &workspace.config.task_states)
        .ok_or_else(|| format!("Line {line} is not a recognized task"))?;
    let priority_span = task_priority_span(line_text, status_span.end);

    let mut updated_content = content.clone();
    match (priority, priority_span.as_ref()) {
        (Some(priority), Some(span)) => {
            updated_content.replace_range(
                line_range.start + span.cookie.start..line_range.start + span.cookie.end,
                &format!("[#{priority}]"),
            );
        }
        (Some(priority), None) => {
            updated_content.insert_str(
                line_range.start + status_span.end,
                &format!(" [#{priority}]"),
            );
        }
        (None, Some(span)) => {
            updated_content.replace_range(
                line_range.start + span.removal.start..line_range.start + span.removal.end,
                "",
            );
        }
        (None, None) => {}
    }

    fs::write(&absolute_path, &updated_content)
        .map_err(|error| format!("Failed to write page '{}': {error}", resolved_path))?;
    workspace.index_page_content(resolved_path.clone(), updated_content.clone());

    let blocks = parse_blocks_with_task_states(&updated_content, &workspace.config.task_states);
    let heading_contexts = heading_contexts_by_line(&updated_content);
    let mut tasks = Vec::new();
    collect_task_items(&blocks, &page, workspace, &heading_contexts, &mut tasks);
    let task = tasks
        .into_iter()
        .find(|task| task.line == line)
        .ok_or_else(|| "Updated task could not be read back".to_string())?;

    Ok(UpdateTaskStatusResultDto { task })
}

pub(crate) fn toggle_checkbox_in_workspace(
    workspace: &mut WorkspaceState,
    path: &str,
    line: usize,
) -> Result<ToggleCheckboxResultDto, String> {
    if line == 0 {
        return Err("Checkbox line must be greater than 0".to_string());
    }

    let resolved_path = workspace
        .pages
        .resolve_path(path)?
        .ok_or_else(|| "Page is not indexed".to_string())?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| format!("Invalid page path '{resolved_path}'"))?;
    let content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read page '{}': {error}", resolved_path))?;
    let line_range = line_content_range(&content, line)
        .ok_or_else(|| format!("Checkbox line {line} does not exist"))?;
    let line_text = &content[line_range.clone()];
    let marker_span = checkbox_marker_span(line_text)
        .ok_or_else(|| format!("Line {line} is not a recognized checkbox item"))?;
    let current_marker = &line_text[marker_span.clone()];
    let checked = !current_marker.eq_ignore_ascii_case("[x]");
    let next_marker = if checked { "[x]" } else { "[ ]" };

    let mut updated_content = content.clone();
    updated_content.replace_range(
        line_range.start + marker_span.start..line_range.start + marker_span.end,
        next_marker,
    );

    fs::write(&absolute_path, &updated_content)
        .map_err(|error| format!("Failed to write page '{}': {error}", resolved_path))?;
    workspace.index_page_content(resolved_path.clone(), updated_content);

    Ok(ToggleCheckboxResultDto {
        path: resolved_path,
        line,
        checked,
    })
}

fn collect_task_items(
    blocks: &[ParsedBlock],
    page: &Page,
    workspace: &WorkspaceState,
    heading_contexts: &[Vec<String>],
    tasks: &mut Vec<TaskItemDto>,
) {
    collect_task_items_with_context(blocks, page, workspace, heading_contexts, tasks, &[], &[]);
}

fn collect_task_items_with_context(
    blocks: &[ParsedBlock],
    page: &Page,
    workspace: &WorkspaceState,
    heading_contexts: &[Vec<String>],
    tasks: &mut Vec<TaskItemDto>,
    parent_links: &[WikiLink],
    parent_blocks: &[String],
) {
    for block in blocks {
        if let Some(status) = &block.task_status {
            tasks.push(TaskItemDto {
                path: page.path.clone(),
                title: page.title.clone(),
                line: block.line_start,
                status: status.clone(),
                priority: block.task_priority.clone(),
                source_headings: heading_contexts
                    .get(block.line_start.saturating_sub(1))
                    .cloned()
                    .unwrap_or_default(),
                parent_blocks: parent_blocks.to_vec(),
                linked_pages: task_links(&block.markdown, parent_links, workspace),
                text: block.text.clone(),
                markdown: block.markdown.clone(),
            });
        }

        let mut child_parent_links = parent_links.to_vec();
        child_parent_links.extend(block.links.iter().cloned());
        let mut child_parent_blocks = parent_blocks.to_vec();
        child_parent_blocks.push(block_context_text(block));

        collect_task_items_with_context(
            &block.children,
            page,
            workspace,
            heading_contexts,
            tasks,
            &child_parent_links,
            &child_parent_blocks,
        );
    }
}

fn block_context_text(block: &ParsedBlock) -> String {
    block.text.trim().to_string()
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

fn task_links(
    markdown: &str,
    parent_links: &[WikiLink],
    workspace: &WorkspaceState,
) -> Vec<TaskLinkDto> {
    parent_links
        .iter()
        .cloned()
        .chain(parse_wiki_links(markdown))
        .into_iter()
        .map(|link| match workspace.pages.resolve_path(&link.target) {
            Ok(Some(resolved_path)) => {
                let label = workspace
                    .pages
                    .get_by_path(&resolved_path)
                    .map(|page| page.title.clone())
                    .unwrap_or_else(|| link.label().to_string());

                TaskLinkDto {
                    target: link.target,
                    label,
                    resolved_path: Some(resolved_path),
                    exists: true,
                }
            }
            Ok(None) | Err(_) => TaskLinkDto {
                label: link.label().to_string(),
                target: link.target,
                resolved_path: None,
                exists: false,
            },
        })
        .collect()
}

fn line_content_range(content: &str, target_line: usize) -> Option<std::ops::Range<usize>> {
    let mut current_line = 1;
    let mut line_start = 0;

    for (index, character) in content.char_indices() {
        if character != '\n' {
            continue;
        }

        if current_line == target_line {
            let line_end = if index > line_start && content.as_bytes()[index - 1] == b'\r' {
                index - 1
            } else {
                index
            };
            return Some(line_start..line_end);
        }

        current_line += 1;
        line_start = index + 1;
    }

    (current_line == target_line).then_some(line_start..content.len())
}

fn task_status_span(line_text: &str, task_states: &[String]) -> Option<std::ops::Range<usize>> {
    let marker_end = list_marker_end(line_text).unwrap_or_else(|| leading_indent_end(line_text));
    let after_checkbox = checkbox_end(&line_text[marker_end..])
        .map(|offset| marker_end + offset)
        .unwrap_or(marker_end);
    let status_start = after_checkbox
        + line_text[after_checkbox..]
            .bytes()
            .take_while(|byte| *byte == b' ' || *byte == b'\t')
            .count();
    task_states
        .iter()
        .filter(|state| is_task_status_boundary(&line_text[status_start..], state))
        .max_by_key(|state| state.len())
        .map(|state| status_start..status_start + state.len())
}

struct TaskPrioritySpan {
    cookie: std::ops::Range<usize>,
    removal: std::ops::Range<usize>,
}

fn task_priority_span(line_text: &str, status_end: usize) -> Option<TaskPrioritySpan> {
    let rest = &line_text[status_end..];
    let whitespace_len = rest
        .bytes()
        .take_while(|byte| *byte == b' ' || *byte == b'\t')
        .count();
    let priority_start = status_end + whitespace_len;
    let priority_text = &line_text[priority_start..];
    let rest = priority_text.strip_prefix("[#")?;
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

    let cookie_end = priority_start + priority.len() + 3;
    let remove_start = if line_text[status_end..priority_start].trim().is_empty() {
        status_end
    } else {
        priority_start
    };
    Some(TaskPrioritySpan {
        cookie: priority_start..cookie_end,
        removal: remove_start..cookie_end,
    })
}

fn validate_task_priority(priority: &str) -> Result<(), String> {
    if priority.is_empty()
        || !priority
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '-')
    {
        return Err("Task priority must use letters, digits, underscores or dashes".to_string());
    }

    Ok(())
}

fn is_task_status_boundary(text: &str, state: &str) -> bool {
    let Some(remaining) = text.strip_prefix(state) else {
        return false;
    };

    remaining.is_empty()
        || remaining.starts_with("[#")
        || remaining.chars().next().is_some_and(char::is_whitespace)
}

fn leading_indent_end(line_text: &str) -> usize {
    line_text
        .bytes()
        .take_while(|byte| *byte == b' ' || *byte == b'\t')
        .count()
}

fn list_marker_end(line_text: &str) -> Option<usize> {
    let trimmed_start = leading_indent_end(line_text);
    let trimmed = &line_text[trimmed_start..];
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

    Some(trimmed_start + marker_end + 1)
}

fn checkbox_end(line_text: &str) -> Option<usize> {
    for marker in ["[ ] ", "[x] ", "[X] "] {
        if line_text.starts_with(marker) {
            return Some(marker.len());
        }
    }

    None
}

fn checkbox_marker_span(line_text: &str) -> Option<std::ops::Range<usize>> {
    let marker_start = list_marker_end(line_text)?;
    for marker in ["[ ]", "[x]", "[X]"] {
        if line_text[marker_start..].starts_with(marker) {
            return Some(marker_start..marker_start + marker.len());
        }
    }

    None
}
