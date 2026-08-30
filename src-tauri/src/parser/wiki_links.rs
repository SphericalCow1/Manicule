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

    while let Some(open_offset) = text[search_start..].find("[[") {
        let open = search_start + open_offset;
        let content_start = open + 2;

        let Some(close_offset) = text[content_start..].find("]]") else {
            break;
        };

        let close = content_start + close_offset;
        let content = &text[content_start..close];

        if let Some(link) = parse_wiki_link_content(content, &text[open..close + 2]) {
            links.push(link);
        }

        search_start = close + 2;
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

    while let Some(open_offset) = text[search_start..].find("[[") {
        let open = search_start + open_offset;
        let content_start = open + 2;

        let Some(close_offset) = text[content_start..].find("]]") else {
            break;
        };

        let close = content_start + close_offset;
        let content = &text[content_start..close];
        rewritten.push_str(&text[search_start..open]);

        if let Some((target, alias)) = split_wiki_link_content(content) {
            if target_matches(target) {
                if let Some(replacement_target) = replacement_target(target) {
                    rewritten.push_str("[[");
                    rewritten.push_str(&replacement_target);
                    if let Some(alias) = alias {
                        rewritten.push('|');
                        rewritten.push_str(alias);
                    }
                    rewritten.push_str("]]");
                    replacements += 1;
                } else {
                    rewritten.push_str(&text[open..close + 2]);
                }
            } else {
                rewritten.push_str(&text[open..close + 2]);
            }
        } else {
            rewritten.push_str(&text[open..close + 2]);
        }

        search_start = close + 2;
    }

    rewritten.push_str(&text[search_start..]);
    (rewritten, replacements)
}

fn parse_wiki_link_content(content: &str, raw: &str) -> Option<WikiLink> {
    let (target, alias) = split_wiki_link_content(content)?;
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
