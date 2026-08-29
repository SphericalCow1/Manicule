# Changelog

## 0.6.5

Changes since `v0.6.0`.

### Added

- Added a context-menu Format submenu for selected single-line editor text.
- Added an example workspace under `docs/example_workspace`.

### Changed

- Combined editor block, link, and task actions into one context menu.
- Made the `Save`, `Open Right`, and `Open Editor` buttons compact and visually
  consistent across both themes.
- Updated the README with the example workspace and a simpler introduction.

## 0.6.0

Changes since `v0.5.0`.

### Added

- Added opening global search results in the right pane.
- Added favorite reordering from the navigation context menu.
- Added source-line navigation between the editor and right pane.
- Added editor block folding, including block collapse and expand actions.
- Added dark mode with workspace-specific persistence.

### Changed

- Moved the workspace path from the left pane into the window title.
- Added a `JOURNAL` heading to the left navigation.
- Hid quick-access row actions until hover in favorites and recent files.
- Aligned the `Open Right` and `Open Editor` pane transfer button styles.
- Tokenized core UI, live preview, folder colors, and task colors for
  theme-aware rendering.

### Fixed

- Fixed ordered-list renumbering after inserting new list items.
- Fixed rendered Markdown checkbox alignment and checkmark styling.

## 0.5.0

Changes since `v0.4.0`.

### Added

- Added substring matching for wiki-link autocomplete.
- Increased wiki-link autocomplete suggestions and made the suggestion list
  scrollable.
- Added application popup error dialogs for user-facing errors.
- Added confirmation dialog behavior for folder deletion.
- Added developer notes under `docs/dev-notes.md` with architecture and test
  concept.

### Changed

- Live preview now switches only the active editor line into source mode instead
  of rendering following blocks as source as well.
- Page filter results now show matching pages before matching blocks.
- Page toolbar actions were moved into the workspace root context menu.
- Task overview metadata now renders inline with the task text, matching the
  rendered document style more closely.
- Architecture notes, backlog, and older product/requirements documents were
  moved out of the repository into the project-level documentation area.

### Fixed

- Fixed nested folder color menu state handling.
- Fixed editor wrapping behavior for long lines.
- Fixed folder delete availability in the navigation context menu.
- Fixed nested list continuation so new list blocks are inserted before child
  blocks.
- Folder deletion is now restricted to empty folders to avoid accidental
  recursive data loss.
