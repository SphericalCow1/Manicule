# Semtags

<table>
  <tr>
    <td width="62%" valign="middle">
      <p>
        Semtags is a local Markdown-first knowledge workspace for notes, and tasks using
        backlinks as semantic tags.
      </p>
      <p>
        The app is inspired by OrgMode and Logseq, but Markdown files remain the source of truth.
        Semtags scans a local workspace folder, renders wiki links and backlinks, and
        adds project-oriented task workflows on top of plain <code>.md</code> files.
      </p>
      <p>
        Repository: <a href="https://github.com/SphericalCow1/Semtags">SphericalCow1/Semtags</a>
      </p>
    </td>
    <td width="38%">
      <img src="assets/branding/semtags-readme-hero-square.png" alt="Semtags Markdown document connected to semantic tags" />
    </td>
  </tr>
</table>

## Product Vision

Semtags is built for personal knowledge management in project and task management contexts. It follows a simple product promise:

> Capture first. Structure later. Files forever.

The app is meant to be the fastest place to write down project thoughts,
meeting notes, decisions, risks, follow-ups, and open questions without deciding
up front where each fragment belongs.

The default workflow is:

1. Start in today's journal and write in blocks.
2. Add context while writing with wiki links such as `[[projects/Rollout]]` or
   `[[people/Katja]]`.
3. Let linked references collect all mentions of a page across days and files.
4. Add more structure only when it becomes useful, for example task states,
   priorities, folder namespaces, semantic tags, or later block attributes.
5. Retrieve information through backlinks, task overview, search, and the
   Markdown files themselves.


## Core Workflow

When a workspace opens, Semtags opens or creates today's journal in the middle
editor pane:

```md
- Meeting with [[people/Katja]]
  - [[projects/Rollout]] may be delayed
  - TODO agree new rollout date
```

The user does not need to create a project page first. The link is enough.
Opening `[[projects/Rollout]]` later shows the linked references from journals,
project notes, and other pages with parent and child context.

This keeps capture cheap:

```text
Capture -> Connect -> Structure -> Retrieve
```

instead of:

```text
Create database -> define schema -> create document -> fill fields
```

## Main Concepts

### Workspace

Open a workspace with `File > Open Workspace Folder...`. Semtags scans all
Markdown files below that folder recursively.

On startup Semtags reads `~/.semtags` from the user home directory. If that file
contains a `lastWorkspace` entry, the workspace is opened automatically. When a
workspace is opened, the path is stored there again for the next start.

After the workspace is loaded, the middle pane always opens today's journal at
`journal/YYYY-MM-DD.md`. If the file does not exist, Semtags creates it. The
right pane keeps its previous context page from the last session.

Each workspace can also contain a `.config` file. Semtags creates it if needed
and stores workspace-specific settings there, for example task states, task
colors, expanded folders, task filters, page sorting, session metadata, and the
right pane page restored on the next start.

### Three-Pane Layout

Semtags uses three resizable panes:

- left pane: workspace navigation, favorites, recent pages, task overview entry
  and global search
- middle pane: current editor page or task overview
- right pane: an independent rendered context page

The middle and right pane can show different files. This is useful when editing
one note while keeping another page, a project overview, or a backlink target
open for context.

### Pages and Wiki Links

New pages are created with a first-level Markdown heading based on the file
name:

```md
# Project Alpha
```

Semtags uses the first `# Heading` as the page title in navigation, task
overview, backlinks, and search results. Existing files without a first-level
heading fall back to the file name without `.md` until opened; when such a file
is opened, Semtags adds the default first-level heading at the top.

Internal links use wiki-link syntax:

```md
[[Project Alpha]]
[[projects/Project Alpha]]
[[projects/Project Alpha|Alpha]]
```

Link targets are resolved case-insensitively. The actual spelling of file and
folder names is not changed. `.md` in a link target is tolerated, but normal
links should be written without it.

After typing `[[` in the editor, Semtags offers matching page suggestions based
on the current input. Selecting a suggestion inserts the target and closes the
link with `]]`. Suggestions show the full relative page path so the inserted
target is unambiguous.

Rendered wiki links without an alias use a compact display label. If the page
name is unique, only the page name is shown; if multiple pages share that name,
Semtags shows enough path context to distinguish them.

Missing target pages are marked in rendered views and can be created explicitly.

### Backlinks

When a block contains a link to another page, that block becomes a linked
reference on the target page. Backlinks are calculated dynamically and are not
written into Markdown files.

Backlinks show:

- source path and page name
- surrounding heading context, such as `Chapter / Section / Subsection`
- the linking block with relevant parent and child blocks

The backlink section can be shown in the right pane and at the end of the middle
pane. In the middle pane it is expanded by default. `Open Tasks only` filters
linked references to backlinks where the block or one of its child blocks
contains an open task.

Backlinks are sorted by source path in reverse alphabetical order, then by their
order inside the source file. This keeps newer journal pages near the top when
they use date-based names.


### Tasks

Tasks are plain Markdown list items with a task keyword:

```md
- TODO Prepare project review
- INPROGRESS [#A] Write decision note
- WAITING[#B] Feedback from stakeholder
- DONE Close release checklist
```

Default task states are:

- `TODO`
- `INPROGRESS`
- `WAITING`
- `DONE`

Task states are configurable in the workspace `.config`. Task state colors are
also configurable and currently support `red`, `yellow`, `green`, `blue`,
`grey`, `orange`, and `pink`.

Priorities use org-mode style priority cookies:

```md
- TODO [#A] High priority task
- TODO[#B] Compact priority syntax
```

Supported priorities are currently `[#A]`, `[#B]`, and `[#C]`.

Right-click a rendered task keyword or priority in the editor, right pane,
backlinks, or task overview to change status or priority through the context
menu.

When a task is set to `DONE`, Semtags can play a short completion sound. This is
controlled by `taskDoneSoundEnabled` in `.config`.

### Checkboxes

Markdown checkboxes are rendered and clickable in the middle and right pane:

```md
- [ ] Open item
- [x] Completed item
```

Clicking a checkbox updates the underlying Markdown file.

### Task Overview

Open the task overview from the left pane with `Show Task Overview`, or toggle
it from the native menu with `View > Toggle Task Overview`.

The task overview can filter and group tasks by status, priority, source, text,
and linked pages. Link-based grouping also considers links in parent blocks, so
tasks inherit semantic context from their surrounding outline.

Clicking a task opens its source page in the right pane. The `Edit` action opens
the task in the middle editor and jumps to the task line.

Task overview filter settings are stored in the workspace `.config`.

### Navigation and File Operations

The left pane shows a compact folder tree. Files are sorted descending by
default. Per-folder sorting can be configured in `.config`; the `journal` folder
is descending by default so newer daily notes appear first.

Useful navigation and file actions:

- click a file to open it in the middle editor
- use `R` next to a file to open it in the right pane
- use the star next to a file to mark it as favorite
- right-click files or folders for context actions
- rename pages and folders from the context menu
- move pages by drag and drop or from the context menu
- assign colors to folders from the folder context menu
- open yesterday, today, or tomorrow from the journal shortcuts

When pages or folders are renamed or moved, Semtags updates matching wiki links
to the affected pages.

Folder colors are stored in `.config`. They color the folder icon and wiki-link
chips that point to pages in that folder. The default wiki-link style remains a
light blue background with dark blue text.

### Search

Use `Cmd/Ctrl+F` in the editor to search inside the current file. The search box
can be expanded to show a replace field. Replacements are normal editor changes,
so dirty state, save, and editor undo apply.

The left pane also provides workspace search across indexed Markdown files.
Search results show file, line, and context and can be opened in the editor.

### Keyboard Shortcuts

Use `Help > Keyboard Shortcuts` to show this list inside the app.

Important editor shortcuts:

- `Enter`: create a new block/list item
- `Tab`: indent current or selected block
- `Shift+Tab`: outdent current or selected block
- `Cmd/Ctrl+ArrowUp`: move current block including child blocks up
- `Cmd/Ctrl+ArrowDown`: move current block including child blocks down
- `Cmd/Ctrl+Enter`: add or cycle task state
- `Cmd/Ctrl+Shift+E`: expand all folded blocks
- `Cmd/Ctrl+Shift+T`: toggle task overview
- `Cmd/Ctrl+1` to `Cmd/Ctrl+4`: collapse all blocks below that level
- `Cmd/Ctrl+F`: search in current file
- `Cmd/Ctrl+S`: save current file
- `Cmd/Ctrl+Z`: undo
- `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y`: redo
- `Cmd/Ctrl + mouse wheel`: change UI zoom

Editor text changes use CodeMirror undo. Task changes and checkbox changes made
outside direct text editing are tracked by Semtags' app-level undo stack. The
Edit menu shows the next undo or redo action when available.

## Configuration

Workspace settings live in `.config` inside the workspace folder. The file is
intended to remain small and human-readable.

Example:

```json
{
  "taskStates": ["TODO", "INPROGRESS", "WAITING", "DONE"],
  "taskStateColors": {
    "TODO": "red",
    "INPROGRESS": "blue",
    "WAITING": "orange",
    "DONE": "green"
  },
  "taskDoneSoundEnabled": true,
  "defaultPageSort": "name-desc",
  "folderPageSort": {
    "journal": "name-desc"
  },
  "folderColors": {
    "projects": "blue"
  }
}
```

Semtags may add more fields to `.config` as features evolve.

## Development

Requirements:

- Node.js and npm
- Rust and Cargo
- platform requirements for Tauri 2

Install dependencies:

```bash
npm install
```

Run the frontend dev server:

```bash
npm run dev
```

Run the Tauri desktop app in development mode:

```bash
npm run tauri dev
```

Run checks and tests:

```bash
npm run check
npm run test:frontend
cd src-tauri
cargo test
```

Build the frontend:

```bash
npm run build
```

Build a desktop release locally:

```bash
npm run tauri build
```

## Release Builds

Release builds are created by GitHub Actions when a version tag matching
`v*` is pushed. The workflow creates a draft GitHub release and uploads
Windows, macOS, and Linux desktop artifacts.

The current app version is `0.5.0`.

## License

Semtags is licensed under the GNU Affero General Public License v3.0. See
[LICENSE](LICENSE) for the full license text.

Semtags is provided without warranty. Use it with appropriate backups,
especially while the project is still in early development.

## Additional Documentation

- [Change log](CHANGELOG.md)
- [Developer notes](docs/dev-notes.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
