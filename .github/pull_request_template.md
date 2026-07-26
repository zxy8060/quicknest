## What changed

<!-- Describe the user-visible and implementation changes. -->

## Why

<!-- Explain the problem or motivation. -->

## Safety and compatibility

- [ ] Existing `launcher.json` files remain compatible.
- [ ] No real launcher data, personal paths, credentials, or build artifacts are included.
- [ ] Delete/cleanup behavior only removes QuickNest records, never target files.
- [ ] Documentation was updated when behavior, permissions, or data fields changed.

## Validation

- [ ] `pnpm build`
- [ ] `cargo check --manifest-path .\src-tauri\Cargo.toml`
- [ ] `pnpm tauri build` when native integration or release packaging changed

## UI evidence

<!-- Add screenshots for visible UI changes, or write "Not applicable". -->
