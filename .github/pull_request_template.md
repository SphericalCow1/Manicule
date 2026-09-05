## Summary

- Describe the complete logical change that will become one commit on `main`.

## Verification

- [ ] `npm run check`
- [ ] `npm run test:frontend`
- [ ] `npm run build`
- [ ] `cargo fmt --check` in `src-tauri`
- [ ] `cargo test --locked` in `src-tauri`
- [ ] Relevant manual checks completed or documented as not applicable

## User Data And Risks

Describe filesystem, Markdown, configuration, migration, or compatibility risks.
Write `None` when the change cannot affect user data.

## Squash Commit

Confirm that the pull-request title is a meaningful conventional commit summary.
The final squash commit body must end with the following sentence:

The code in this commit was written with ai-assistance.
