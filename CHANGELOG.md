# Changelog

## 0.6.0

Changes since `v0.5.0`.

### Added

- Added opening global search results in the right pane.
- Added favorite reordering from the navigation context menu.
- Added source-line navigation between the editor and right pane.
- Added editor block folding, including block collapse and expand actions.
- Added dark mode with workspace-specific persistence.

### Changed

- Updated the README hero image layout and repository preview image.
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

- Renamed visible product spelling from `SemTags` to `Semtags`.
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

### Notes

- The Markdown workspace remains the source of truth. Runtime indexes and UI
  configuration are still rebuildable or persisted separately from note content.
