# Backlog

## Planned

- [ ] Add experimental Markdown block attributes using `key:: value` inline or
  on a block continuation line. First make `((page))` an alias for `[[page]]`
  across parsing, navigation, backlinks, rendering, completion, and link
  rewriting; it is not a block-reference syntax.

## Implemented

- [x] Align right-pane hierarchy guides with list markers through a shared,
  scalable marker axis. Use CSS-drawn unordered markers, fixed-width ordered
  markers, and the same axis for task checkboxes instead of native browser
  marker metrics.
- [x] Support compact `#page` links for whitespace-free page targets across
  completion, rendering, navigation, backlinks, search, and link rewriting.
- [x] Remove the branded illustration from the application startup screen.
- [x] Make Shift+Enter add an indented, visibly rendered continuation line
  within the current list block instead of creating a new block, and render
  Markdown softbreaks as visible line breaks in the right pane.
- [x] Rename the application and its build metadata from Manicule to Logtext,
  including native window and menu labels, dialogs, package metadata, and the
  desktop bundle identifier.
- [x] Generate six elegant Manicule application-icon concepts, with and without
  the octopus mascot.
- [x] Use the selected octopus-and-manicule application icon and rebuild local
  Tauri binaries when icon assets change.
- [x] Show the palette-aligned workflow illustration on its own while the initial
  workspace and editor session are loading, and use it as a subtle README graphic.
- [x] Keep the native theme menu label synchronized with the active light or dark mode.
- [x] Keep the task overview menu label synchronized with the active main view.
- [x] Make the task overview button label and action follow the active main view.
- [x] Align quick-access right-pane actions with the file browser hover treatment.
- [x] Prevent right-pane content refreshes from replaying line highlights.
- [x] Combine live preview and plain Markdown editing into one menu toggle.
- [x] Scope editor context-menu actions to the clicked content type, with direct
  task status and priority menus.
- [x] Make block-level collapse shortcuts work across keyboard layouts using
  Cmd/Ctrl+1 through 4.
- [x] Allow page and folder renames that only change capitalization.
- [x] Increase the editor block-fold marker size for easier scanning and clicking.
