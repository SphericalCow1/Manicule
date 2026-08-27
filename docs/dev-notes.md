# Semtags Developer Notes

This document describes the technical architecture and test concept of Semtags.
It intentionally does not define product or functional requirements.

## Architectural Overview

Semtags is a local desktop application built with Tauri, Rust, Svelte, and
CodeMirror.

The central architectural decision is that Markdown files in the selected
workspace are the source of truth. Runtime indexes and UI state may be derived
from these files, but user content must remain recoverable from the Markdown
files alone.

At a high level the application is split into these layers:

- Tauri shell: desktop window, native menu, file dialogs, and command bridge
- Rust backend: workspace access, parsing, indexing, file operations, and config
  persistence
- Svelte frontend: three-pane UI, editor state, rendered views, context menus,
  task overview, and undo orchestration
- CodeMirror editor: Markdown editing surface and editor-local undo history

## Runtime Boundary

The frontend never accesses workspace files directly. All filesystem operations
go through Tauri commands exposed by the Rust backend.

The command boundary is defined in:

- `src/lib/api.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/config_commands.rs`

Frontend code calls typed helper functions in `src/lib/api.ts`, which forward
to Tauri `invoke` commands. Backend commands return DTOs from
`src-tauri/src/dto.rs` so the UI can update its local stores without knowing
Rust-internal data structures.

## Workspace State

The backend holds the currently opened workspace in `AppState`.

Important backend structures:

- `AppState`: process-wide application state guarded for Tauri command access
- `WorkspaceState`: opened workspace root, workspace config, folders, page
  index, and backlink index
- `PageIndex`: in-memory index of Markdown pages by relative path and
  case-insensitive page key
- `BacklinkIndex`: in-memory index of wiki-link backlinks by target page key

Workspace state is rebuilt from disk when opening a workspace and after larger
file operations that can affect many paths.

## Workspace Scanning And Indexing

Workspace indexing starts in `src-tauri/src/workspace_index.rs`.

The scanner recursively finds Markdown files and folders below the workspace
root. The page index reads each Markdown file, extracts the first H1 heading as
the page title, and creates a case-insensitive page key from the relative path.

The backlink index parses each page into blocks and collects wiki links from
those blocks. For every link, it stores:

- the target page key
- the source page path and source page title
- the heading context at the source line
- the linking block including relevant parent and child context
- source line numbers for later navigation and highlighting

Indexes are intentionally in memory. They are derived data and can be rebuilt
from the workspace files.

## Markdown Parsing

Markdown-specific parsing is split by concern:

- `src-tauri/src/parser/wiki_links.rs`: wiki-link parsing and link target
  rewriting
- `src-tauri/src/parser/blocks.rs`: block parsing, indentation hierarchy, task
  recognition, checkbox context, and child relationships
- `src-tauri/src/index/page_index.rs`: page title extraction and default H1
  generation
- `src-tauri/src/index/backlink_index.rs`: backlink collection from parsed
  blocks

The parser is intentionally lightweight and focused on the Markdown constructs
Semtags needs for indexing and editing operations. Full Markdown rendering is
handled in the frontend.

## File Operations

Page and folder operations are implemented in `src-tauri/src/page_ops.rs`.

These operations are responsible for:

- validating workspace-relative paths
- preventing path traversal outside the workspace
- creating pages and folders
- deleting pages and empty folders
- moving and renaming pages or folders
- updating wiki links when pages or folders move
- refreshing indexes and folder lists after structural changes

The path helper functions in `src-tauri/src/workspace/paths.rs` are the
boundary for normalizing workspace-relative paths and resolving them safely
against the workspace root.

## Saving And Conflict Detection

Page content is read and written through `src-tauri/src/page_io.rs` and the
save command in `src-tauri/src/commands.rs`.

The frontend sends the expected file modification timestamp and content hash
when saving. The backend compares those values with the current disk state. If
the file changed externally, the backend returns a conflict instead of silently
overwriting the file.

After a successful save, the affected page is reindexed so backlinks, titles,
tasks, and rendered views can reflect the new content.

## Configuration Files

Semtags uses two configuration scopes.

User-level config:

- Stored in the user's home directory as `.semtags`
- Managed by `src-tauri/src/user_config.rs`
- Currently stores the last opened workspace path

Workspace-level config:

- Stored in the workspace root as `.config`
- Managed by `src-tauri/src/workspace_config.rs`
- Stores derived UI and workspace preferences such as task states, task colors,
  folder colors, expanded folders, favorites, recent pages, task overview
  filters, backlink view options, sort configuration, pane session state, and
  navigation layout values

The workspace config is normalized when loaded. Invalid or unknown values are
discarded or replaced with defaults where practical.

## Frontend Structure

The Svelte frontend is organized around components and stores.

Main application shell:

- `src/App.svelte`: three-pane layout, native menu event wiring, workspace
  session restore, column resizing, zoom handling, dialogs

Primary components:

- `FileTree.svelte`: left navigation pane
- `EditorPane.svelte`: middle editor pane
- `RightPane.svelte`: right rendered context pane
- `TaskOverview.svelte`: task overview surface
- `LinkedReferences.svelte`: backlink rendering
- `MarkdownView.svelte`: rendered Markdown blocks, task controls, links, and
  checkboxes
- `CodeMirrorEditor.svelte`: CodeMirror integration

Stores:

- `workspace.ts`: opened workspace metadata and workspace config mirrors
- `editorSession.ts`: middle-pane editor file, content, save state, and
  navigation history
- `rightPane.ts`: right-pane file, rendered view, and navigation history
- `mainView.ts`: editor versus task overview mode
- `tasks.ts`: task overview data and updates
- `appUndo.ts`: global undo/redo actions outside CodeMirror-local editing
- `zoom.ts`: UI zoom factor

## Rendering Model

The middle editor is CodeMirror-based.

In source mode, CodeMirror shows plain Markdown text. In live mode, inactive
lines are visually rendered while the active line remains editable Markdown
source. This hybrid behavior is implemented mostly in:

- `src/lib/editorLivePreview.ts`
- `src/lib/markdownRendering.ts`
- `src/lib/editorBlockCommands.ts`
- `src/lib/editorLineWrapping.ts`

The right pane and backlink sections use rendered Markdown components rather
than CodeMirror.

Markdown rendering and editing behavior are intentionally separate from backend
indexing. The backend parses only the structures needed for file operations and
derived indexes.

## Undo And Redo

CodeMirror owns editor-local text undo and redo while a file is open in the
middle pane.

Application-level changes outside direct editor typing are recorded in
`src/lib/stores/appUndo.ts`. Examples include checkbox toggles, task state
changes, and task priority changes made from rendered views or the task
overview.

The native Edit menu is synchronized from the frontend so menu labels and
enabled states reflect the current undo/redo action.

## Watcher And External Changes

The backend starts a workspace watcher from `src-tauri/src/watcher.rs` when a
workspace opens. It emits frontend events when Markdown files or workspace
configuration change on disk.

The frontend responds by refreshing workspace data or warning about changed
files depending on the active editing state.

## Navigation And Ordering

The left pane builds its tree from the page and folder lists returned by the
backend. Ordering combines default sort mode, per-folder sort mode, manual order
configuration, and recent/favorite metadata.

Navigation helper logic lives mostly in:

- `src/lib/navigationTree.ts`
- `src/lib/components/NavigationTree.svelte`
- `src-tauri/src/navigation_order.rs`

Backlink display can use page order information so linked references follow the
same navigational structure as the left pane.

## Build And Test Structure

Frontend build tooling:

- Vite
- Svelte
- TypeScript
- `npm run test:frontend` for TypeScript unit tests
- `npm run check` for Svelte and TypeScript validation
- `npm run build` for production frontend build validation

Backend build tooling:

- Rust
- Cargo
- Tauri
- `cargo test` inside `src-tauri`

The repository also contains a Rust benchmark binary:

- `src-tauri/examples/reindex_benchmark.rs`

Because there is more than one Rust binary target, plain `cargo run` inside
`src-tauri` is ambiguous. Use the Tauri dev command for application development
or specify a binary explicitly when running Cargo directly.

## Test Concept

The test strategy follows the architecture boundary. Pure parsing, indexing,
ordering, rendering, and editor-helper behavior should be tested with fast unit
tests. Native shell behavior and complete user workflows are validated manually
or with higher-level integration checks when needed.

Frontend tests:

- TypeScript unit tests live in `tests/*.test.ts`.
- Tests focus on deterministic UI helper logic rather than browser rendering.
- Covered areas include wiki-link completion, Markdown rendering helpers,
  backlink grouping, navigation tree building, folder colors, task keyword
  parsing, checkboxes, journal path handling, editor block commands, editor
  live preview behavior, editor sessions, line wrapping, and version metadata.
- Run frontend tests with `npm run test:frontend`.
- Run static Svelte and TypeScript checks with `npm run check`.

Backend tests:

- Rust tests live next to the modules they validate.
- Tests should cover path normalization, page-key resolution, page indexing,
  default H1 generation, backlink parsing, block parsing, task recognition,
  link rewriting, file operations, config normalization, and query behavior.
- Run backend tests with `cargo test` from `src-tauri`.

Build validation:

- `npm run build` validates the frontend production bundle.
- `npm run tauri build` validates the packaged desktop app and Rust release
  build.
- Platform-specific package behavior should be checked on the target operating
  system before release.

Manual acceptance checks:

- Workspace open, close, and restore behavior
- Daily journal creation on startup
- Middle-pane editing, autosave, manual save, and conflict handling
- Right-pane rendering and independent navigation
- Backlinks in middle and right panes
- Task status and priority changes from rendered views and task overview
- Checkbox toggles from middle and right panes
- File and folder create, rename, move, delete, and link rewrite behavior
- Native menu shortcuts on macOS, Windows, and Linux

Regression rule:

- Every fixed bug should get the narrowest practical automated test unless the
  behavior depends on native menus, OS dialogs, or visual layout that is not
  currently covered by the test stack.

## Dependency Direction

The intended dependency direction is:

1. UI components call frontend stores or typed API helpers.
2. Frontend stores call `src/lib/api.ts`.
3. API helpers invoke Tauri commands.
4. Commands delegate to focused backend modules.
5. Backend modules read or write Markdown files and update derived indexes.

Rendering code should not perform filesystem work. Backend parsing should not
depend on frontend rendering behavior.

## Design Constraints

Technical changes should preserve these constraints:

- Markdown files remain the durable source of truth.
- Indexes are rebuildable derived state.
- Paths passed from the UI are workspace-relative and must be normalized before
  filesystem access.
- Case-insensitive page resolution is part of the link model.
- File operations that move or rename pages must update existing wiki links.
- Frontend state should be synchronized from backend DTOs after file operations.
- CodeMirror editor history and global application undo history are related but
  separate mechanisms.
