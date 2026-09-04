# Backlog

## Planned

- [ ] Make right-pane hierarchy guides align consistently with parent list
  markers on macOS, Windows, and Linux. Replace font-metric-dependent bullet
  positioning with a shared fixed marker column, use a CSS-drawn marker for
  unordered lists, and keep ordered markers in a fixed-width field. Verify the
  alignment at every supported zoom level on all three platforms.

## Implemented

- [x] Make Shift+Enter add an indented, visibly rendered continuation line
  within the current list block instead of creating a new block.
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
