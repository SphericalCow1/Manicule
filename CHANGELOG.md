# Changelog

## 0.7.0

Changes since `v0.6.7`.

### Added

- Added compact `#page` links as a whitespace-free alternative to `[[page]]`,
  including completion, rendering, navigation, backlinks, search, and link
  rewriting during page or folder moves and renames.

### Changed

- Renamed the application, desktop bundle, executable, menus, dialogs, internal
  namespaces, and documentation from Semtags to Manicule.
- User-level startup configuration is now stored in `~/.manicule`; configuration
  files from earlier product names are intentionally not imported.
- Repository metadata now points to `SphericalCow1/Manicule`.

## 0.6.7

Changes since `v0.6.5`.

### Changed

- The application icon now uses the selected blue octopus-and-manicule design
  across macOS, Windows, PNG assets, and local Tauri development builds.
- Workspace scanning now ignores symbolic links and Windows reparse points so
  linked files outside the selected workspace are not indexed or modified.
- Full workspace reindexing now reads each Markdown file once while building the
  page and backlink indexes together.
- Frontend error handling now uses one conversion path for JavaScript, Tauri,
  and structured application errors.
- Rust and TypeScript Markdown parsers now share fixtures for links, normalized
  targets, task priorities, custom task states, list markers, tabs, and checkboxes.
- Folder scanning now preserves physical folders whose names differ only by case
  while sorting them deterministically with the same lowercase model as page keys.
- File moves and renames validate readable content before changing its physical
  path, with additional regression coverage for watcher events, partial link
  rewrites, external task changes, and non-ASCII paths.
- Frontend Markdown consumers now share one parser for list and checkbox
  prefixes across editing, rendering, wrapping, tasks, and undo validation.
- Shared parser contracts now cover CRLF, mixed indentation, conflicting
  priority cookies, nested emphasis, and large deeply nested blocks.
- Native theme and task-overview menu actions now describe the view or mode they
  will switch to.
- Live preview and plain Markdown editing now share one state-aware menu action
  and keyboard shortcut.
- Block-level collapse shortcuts now use layout-independent `Cmd/Ctrl+1`
  through `Cmd/Ctrl+4` handling, including on Windows.
- Page files can now be renamed when only the filename capitalization changes.
- The editor context menu now limits actions to the clicked link, selected text,
  task, or ordinary source line, with direct status and priority menus for tasks.
- The task-overview button now switches back to the editor when the overview is
  already open.
- Favorites and Recents now use the same right-pane action emphasis as the file
  browser.
- Checkbox, task-status, and task-priority changes from rendered views and Task
  Overview now use one shared mutation policy for editor routing, saving, undo,
  refresh, and completion sound.
- Direct native and infrastructure actions now use one app-wide popup error
  path, while store-owned errors remain on their existing component paths.
- Wiki-link navigation and missing-page creation now share one operation layer
  across the editor, rendered panes, backlinks, and Task Overview, with the
  destination pane passed explicitly.
- Middle- and right-pane navigation now share one back/forward history helper
  while retaining pane-specific loading, editor safeguards, and line targeting.
- A reproducible release-profile benchmark now measures full reindexing,
  workspace search, Task Overview loading, and one-file save recovery against
  documented interaction budgets and generated workspace profiles.
- Workspace search and Task Overview now read from a coherent, disposable
  in-memory content snapshot instead of reopening every Markdown file.
- External Markdown changes now update affected page metadata, backlinks, and
  cached content incrementally after debounce, with full reindex recovery for
  ambiguous or failed batches.

### Fixed

- Right-pane content refreshes no longer replay an existing source-line
  highlight or scroll the highlighted line back into view.
- Rendered-view checkbox and task changes now enter global undo history, and
  trigger completion sound where applicable, only after an editor-backed save
  succeeds.
- Rendered-view mutations now consistently reject an in-progress save or an
  unresolved editor conflict, while preserving unsaved editor text through the
  shared editor-backed mutation path.
- Checkbox changes now refresh the task list as well as the rendered right pane.
- Native workspace dialogs, workspace closing, undo/redo warnings, event setup,
  and window-title failures no longer disappear as unhandled promise
  rejections.
- Failed right-pane navigation now keeps the previously rendered page and no
  longer consumes a back/forward history entry.
- Mixed editor and rendered-view actions now keep the global stack aligned with
  CodeMirror's actual undo groups, including actions targeting another file.
- Global mutation undo now waits for an active editor save or conflict instead
  of attempting to modify the same page concurrently.
- External checkbox and task updates to the open editor now apply a localized
  text change, preserving earlier CodeMirror undo and redo entries.
- The editor Task context menu now groups available states and priorities into
  separate nested submenus.
- Watcher updates from a previously closed workspace no longer mutate the
  currently open workspace, and failed incremental updates no longer emit a
  successful index event.

### Tests

- Added behavioral coverage for mixed editor and rendered-view undo ordering,
  open-editor and disk-backed task mutations, save conflicts, and completion
  sound gating.
- Added direct coverage for CodeMirror undo grouping, cross-file history
  isolation, and undo attempts during an active editor save.
- Added a real CodeMirror regression sequence for mixed editor and same-file
  rendered mutations, plus focused minimal-text-change tests.
- Added direct coverage for shared mutation routing, canonical backend task
  locations, editor conflict guards, and rejected backend operations.
- Added coverage that rejected direct actions are reported once with context
  and store-handled outcomes do not produce duplicate popups.
- Added coverage for shared link path normalization, pane routing, navigation
  options, and create-refresh-open ordering.
- Added coverage for shared navigation transitions and failed editor/right-pane
  back navigation.
- Added coverage that the benchmarked workspace-save path updates file content,
  page titles, and backlinks together.
- Added coverage for content snapshot fallback and mutation consistency,
  path-aware watcher batches, scanner exclusions, and incremental/full index
  equivalence across create, modify, and remove changes.

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
