#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiLink {
    pub raw: String,
    pub target: String,
    pub alias: Option<String>,
}

impl WikiLink {
    pub fn label(&self) -> &str {
        self.alias.as_deref().unwrap_or(&self.target)
    }
}

pub fn parse_wiki_links(text: &str) -> Vec<WikiLink> {
    let mut links = Vec::new();
    let mut search_start = 0;

    while let Some(link_range) = next_wiki_link_range(text, search_start) {
        let content = &text[link_range.content_start..link_range.close];

        if let Some(link) = parse_wiki_link_content(
            content,
            &text[link_range.open..link_range.end],
            link_range.syntax,
        ) {
            links.push(link);
        }

        search_start = link_range.end;
    }

    links
}

pub fn rewrite_wiki_link_targets(
    text: &str,
    target_matches: impl Fn(&str) -> bool,
    replacement_target: impl Fn(&str) -> Option<String>,
) -> (String, usize) {
    let mut rewritten = String::with_capacity(text.len());
    let mut search_start = 0;
    let mut replacements = 0;

    while let Some(link_range) = next_wiki_link_range(text, search_start) {
        let content = &text[link_range.content_start..link_range.close];
        rewritten.push_str(&text[search_start..link_range.open]);

        if let Some((target, alias)) = split_link_content(content, link_range.syntax) {
            if target_matches(target) {
                if let Some(replacement_target) = replacement_target(target) {
                    if link_range.syntax == WikiLinkSyntax::Compact
                        && is_valid_compact_target(&replacement_target)
                    {
                        rewritten.push('#');
                        rewritten.push_str(&replacement_target);
                    } else {
                        let (open_delimiter, close_delimiter) = match link_range.syntax {
                            WikiLinkSyntax::Square => ("[[", "]]"),
                            WikiLinkSyntax::Round => ("((", "))"),
                            WikiLinkSyntax::Compact => ("[[", "]]"),
                        };
                        rewritten.push_str(open_delimiter);
                        rewritten.push_str(&replacement_target);
                        if let Some(alias) = alias {
                            rewritten.push('|');
                            rewritten.push_str(alias);
                        }
                        rewritten.push_str(close_delimiter);
                    }
                    replacements += 1;
                } else {
                    rewritten.push_str(&text[link_range.open..link_range.end]);
                }
            } else {
                rewritten.push_str(&text[link_range.open..link_range.end]);
            }
        } else {
            rewritten.push_str(&text[link_range.open..link_range.end]);
        }

        search_start = link_range.end;
    }

    rewritten.push_str(&text[search_start..]);
    (rewritten, replacements)
}

struct WikiLinkRange {
    open: usize,
    content_start: usize,
    close: usize,
    end: usize,
    syntax: WikiLinkSyntax,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WikiLinkSyntax {
    Square,
    Round,
    Compact,
}

fn next_wiki_link_range(text: &str, search_start: usize) -> Option<WikiLinkRange> {
    let mut cursor = search_start;

    loop {
        let delimited = next_delimited_wiki_link_range(text, cursor);
        let compact = next_compact_wiki_link_range(text, cursor);
        let candidate = match (delimited, compact) {
            (Some(delimited), Some(compact)) if delimited.open <= compact.open => delimited,
            (Some(_), Some(compact)) => compact,
            (Some(delimited), None) => delimited,
            (None, Some(compact)) => compact,
            (None, None) => return None,
        };

        if !is_markdown_code_position(text, candidate.open)
            && (candidate.syntax != WikiLinkSyntax::Compact
                || !is_markdown_link_label_position(text, candidate.open))
        {
            return Some(candidate);
        }

        cursor = candidate.end;
    }
}

fn next_delimited_wiki_link_range(text: &str, search_start: usize) -> Option<WikiLinkRange> {
    let remaining = &text[search_start..];
    let square_open = remaining.find("[[");
    let round_open = remaining.find("((");
    let (open_offset, open_delimiter, close_delimiter, syntax) = match (square_open, round_open) {
        (Some(square), Some(round)) if square <= round => {
            (square, "[[", "]]", WikiLinkSyntax::Square)
        }
        (Some(_), Some(round)) => (round, "((", "))", WikiLinkSyntax::Round),
        (Some(square), None) => (square, "[[", "]]", WikiLinkSyntax::Square),
        (None, Some(round)) => (round, "((", "))", WikiLinkSyntax::Round),
        (None, None) => return None,
    };
    let open = search_start + open_offset;
    let content_start = open + open_delimiter.len();
    let close_offset = text[content_start..].find(close_delimiter)?;
    let close = content_start + close_offset;

    Some(WikiLinkRange {
        open,
        content_start,
        close,
        end: close + close_delimiter.len(),
        syntax,
    })
}

fn next_compact_wiki_link_range(text: &str, search_start: usize) -> Option<WikiLinkRange> {
    for (offset, character) in text[search_start..].char_indices() {
        if character != '#' {
            continue;
        }

        let open = search_start + offset;
        if !is_compact_link_boundary(text, open) {
            continue;
        }

        let content_start = open + '#'.len_utf8();
        let Some(end) = compact_target_end(text, content_start) else {
            continue;
        };

        return Some(WikiLinkRange {
            open,
            content_start,
            close: end,
            end,
            syntax: WikiLinkSyntax::Compact,
        });
    }

    None
}

fn parse_wiki_link_content(content: &str, raw: &str, syntax: WikiLinkSyntax) -> Option<WikiLink> {
    let (target, alias) = split_link_content(content, syntax)?;
    let alias = alias.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    Some(WikiLink {
        raw: raw.to_string(),
        target: target.to_string(),
        alias,
    })
}

fn split_link_content(content: &str, syntax: WikiLinkSyntax) -> Option<(&str, Option<&str>)> {
    if syntax == WikiLinkSyntax::Compact {
        return is_valid_compact_target(content).then_some((content, None));
    }

    split_wiki_link_content(content)
}

fn split_wiki_link_content(content: &str) -> Option<(&str, Option<&str>)> {
    let mut parts = content.splitn(2, '|');
    let target = parts.next()?.trim();

    if !is_valid_target(target) {
        return None;
    }

    Some((target, parts.next()))
}

pub fn is_valid_target(target: &str) -> bool {
    if target.is_empty() || target.starts_with('/') {
        return false;
    }

    target
        .split('/')
        .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

pub fn is_valid_compact_target(target: &str) -> bool {
    compact_target_end(target, 0).is_some_and(|end| end == target.len()) && is_valid_target(target)
}

fn compact_target_end(text: &str, start: usize) -> Option<usize> {
    let mut cursor = start;

    loop {
        let first = text[cursor..].chars().next()?;
        if !is_compact_segment_start(first) {
            return None;
        }
        cursor += first.len_utf8();

        loop {
            let Some(character) = text[cursor..].chars().next() else {
                return Some(cursor);
            };

            if is_compact_segment_continue(character) {
                cursor += character.len_utf8();
                continue;
            }

            if character == '.'
                && text[cursor + character.len_utf8()..]
                    .chars()
                    .next()
                    .is_some_and(is_compact_segment_start)
            {
                cursor += character.len_utf8();
                continue;
            }

            break;
        }

        if text[cursor..].starts_with('/')
            && text[cursor + 1..]
                .chars()
                .next()
                .is_some_and(is_compact_segment_start)
        {
            cursor += 1;
            continue;
        }

        return Some(cursor);
    }
}

fn is_compact_segment_start(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

fn is_compact_segment_continue(character: char) -> bool {
    is_compact_segment_start(character) || character == '-'
}

fn is_compact_link_boundary(text: &str, open: usize) -> bool {
    let Some(previous) = text[..open].chars().next_back() else {
        return true;
    };

    !is_compact_segment_continue(previous)
        && !matches!(previous, '#' | '[' | '/' | '\\' | ':' | '@' | '=')
}

fn is_markdown_code_position(text: &str, position: usize) -> bool {
    let line_start = text[..position].rfind('\n').map_or(0, |index| index + 1);
    let mut fence: Option<(char, usize)> = None;

    for line in text[..line_start].lines() {
        if let Some((marker, length)) = markdown_fence_marker(line) {
            match fence {
                Some((open_marker, open_length))
                    if marker == open_marker && length >= open_length =>
                {
                    fence = None;
                }
                None => fence = Some((marker, length)),
                _ => {}
            }
        }
    }

    if fence.is_some() || markdown_fence_marker(&text[line_start..position]).is_some() {
        return true;
    }

    has_unclosed_inline_code(&text[line_start..position])
}

fn is_markdown_link_label_position(text: &str, position: usize) -> bool {
    let line_start = text[..position].rfind('\n').map_or(0, |index| index + 1);
    let line_end = text[position..]
        .find('\n')
        .map_or(text.len(), |index| position + index);
    let line = &text[line_start..line_end];
    let relative_position = position - line_start;
    let Some(open_bracket) = line[..relative_position].rfind('[') else {
        return false;
    };
    let Some(close_offset) = line[relative_position..].find(']') else {
        return false;
    };
    let close_bracket = relative_position + close_offset;

    open_bracket < relative_position
        && matches!(line[close_bracket + 1..].chars().next(), Some('(' | '['))
}

pub(crate) fn markdown_fence_marker(line: &str) -> Option<(char, usize)> {
    let trimmed = line.trim_start();
    let marker = trimmed.chars().next()?;
    if marker != '`' && marker != '~' {
        return None;
    }

    let length = trimmed
        .chars()
        .take_while(|character| *character == marker)
        .count();
    (length >= 3).then_some((marker, length))
}

fn has_unclosed_inline_code(line_prefix: &str) -> bool {
    let mut open_run: Option<usize> = None;
    let mut characters = line_prefix.char_indices().peekable();

    while let Some((index, character)) = characters.next() {
        if character != '`' || line_prefix[..index].ends_with('\\') {
            continue;
        }

        let mut run_length = 1;
        while characters
            .peek()
            .is_some_and(|(_, next_character)| *next_character == '`')
        {
            characters.next();
            run_length += 1;
        }

        match open_run {
            Some(open_length) if open_length == run_length => open_run = None,
            None => open_run = Some(run_length),
            _ => {}
        }
    }

    open_run.is_some()
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
        #[serde(rename = "wikiLinks")]
        wiki_links: Vec<WikiLinkFixture>,
    }

    #[derive(Deserialize)]
    struct WikiLinkFixture {
        name: String,
        source: String,
        links: Vec<ExpectedWikiLink>,
    }

    #[derive(Deserialize)]
    struct ExpectedWikiLink {
        target: String,
        alias: Option<String>,
        label: String,
    }

    #[test]
    fn parses_plain_wiki_link() {
        let links = parse_wiki_links("See [[Projekte/Alpha]] today");

        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Projekte/Alpha");
        assert_eq!(links[0].alias, None);
        assert_eq!(links[0].label(), "Projekte/Alpha");
    }

    #[test]
    fn parses_alias_wiki_link() {
        let links = parse_wiki_links("[[Projekte/Alpha|Alpha]]");

        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Projekte/Alpha");
        assert_eq!(links[0].alias.as_deref(), Some("Alpha"));
        assert_eq!(links[0].label(), "Alpha");
    }

    #[test]
    fn parses_round_delimited_wiki_links_like_square_delimited_links() {
        let links = parse_wiki_links("See ((Projekte/Alpha|Alpha)) and [[Beta]]");

        assert_eq!(links.len(), 2);
        assert_eq!(links[0].raw, "((Projekte/Alpha|Alpha))");
        assert_eq!(links[0].target, "Projekte/Alpha");
        assert_eq!(links[0].alias.as_deref(), Some("Alpha"));
        assert_eq!(links[1].target, "Beta");
    }

    #[test]
    fn parses_compact_links_with_paths_and_unicode() {
        let links = parse_wiki_links("See #Projects/Alpha and #Projekte/Übersicht.");

        assert_eq!(links.len(), 2);
        assert_eq!(links[0].raw, "#Projects/Alpha");
        assert_eq!(links[0].target, "Projects/Alpha");
        assert_eq!(links[0].alias, None);
        assert_eq!(links[1].target, "Projekte/Übersicht");
    }

    #[test]
    fn ignores_compact_link_lookalikes_and_markdown_code() {
        let links = parse_wiki_links(
            "# Heading [#A] word#Alpha https://example.test/#Alpha \\#Beta `#Gamma` [Label #Epsilon](https://example.test)\n```md\n#Delta\n```",
        );

        assert!(links.is_empty());
    }

    #[test]
    fn treats_empty_alias_as_target_label() {
        let links = parse_wiki_links("[[Projekte/Alpha| ]]");

        assert_eq!(links.len(), 1);
        assert_eq!(links[0].alias, None);
        assert_eq!(links[0].label(), "Projekte/Alpha");
    }

    #[test]
    fn ignores_invalid_targets() {
        let links = parse_wiki_links("[[]] [[/Alpha]] [[../Alpha]] [[Alpha/./Beta]]");

        assert!(links.is_empty());
    }

    #[test]
    fn rewrites_matching_targets_and_preserves_aliases() {
        let (rewritten, replacements) = rewrite_wiki_link_targets(
            "See [[Projects/Alpha]] and [[Projects/Alpha.md| Alpha ]]",
            |target| target.eq_ignore_ascii_case("projects/alpha") || target == "Projects/Alpha.md",
            |_| Some("archive/Alpha".to_string()),
        );

        assert_eq!(
            rewritten,
            "See [[archive/Alpha]] and [[archive/Alpha| Alpha ]]"
        );
        assert_eq!(replacements, 2);
    }

    #[test]
    fn rewrites_round_delimited_links_and_preserves_their_delimiters() {
        let (rewritten, replacements) = rewrite_wiki_link_targets(
            "See ((Projects/Alpha)) and ((Projects/Alpha| Alpha ))",
            |target| target == "Projects/Alpha",
            |_| Some("archive/Alpha".to_string()),
        );

        assert_eq!(
            rewritten,
            "See ((archive/Alpha)) and ((archive/Alpha| Alpha ))"
        );
        assert_eq!(replacements, 2);
    }

    #[test]
    fn rewrites_compact_links_and_falls_back_for_targets_with_spaces() {
        let (rewritten, replacements) = rewrite_wiki_link_targets(
            "See #Projects/Alpha and #Beta",
            |target| target == "Projects/Alpha" || target == "Beta",
            |target| match target {
                "Projects/Alpha" => Some("Archive/Alpha".to_string()),
                "Beta" => Some("New Beta".to_string()),
                _ => None,
            },
        );

        assert_eq!(rewritten, "See #Archive/Alpha and [[New Beta]]");
        assert_eq!(replacements, 2);
    }

    #[test]
    fn keeps_non_matching_and_invalid_links_unchanged() {
        let (rewritten, replacements) = rewrite_wiki_link_targets(
            "[[Beta]] [[../Alpha]] [[Alpha]]",
            |target| target == "Alpha",
            |_| Some("Archive/Alpha".to_string()),
        );

        assert_eq!(rewritten, "[[Beta]] [[../Alpha]] [[Archive/Alpha]]");
        assert_eq!(replacements, 1);
    }

    #[test]
    fn parses_shared_wiki_link_fixtures() {
        let fixtures: MarkdownRulesFixture =
            serde_json::from_str(include_str!("../../../tests/fixtures/markdown-rules.json"))
                .unwrap();

        for fixture in fixtures.shared.wiki_links {
            let links = parse_wiki_links(&fixture.source);

            assert_eq!(links.len(), fixture.links.len(), "{}", fixture.name);
            for (actual, expected) in links.iter().zip(fixture.links.iter()) {
                assert_eq!(actual.target, expected.target, "{}", fixture.name);
                assert_eq!(actual.alias, expected.alias, "{}", fixture.name);
                assert_eq!(actual.label(), expected.label, "{}", fixture.name);
            }
        }
    }
}
