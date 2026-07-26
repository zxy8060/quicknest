# AGENTS.md

This file is the primary repository guide for coding agents and automation.

## Project intent

QuickNest is a local-first Windows launcher built with Tauri 2, Vue 3, TypeScript, and Rust. Preserve these product invariants:

- The app works without an account or network service.
- User launcher data stays outside the repository.
- The visible hierarchy has exactly two levels: root groups and child groups.
- Registry-discovered apps are transient and read-only.
- Removing a launcher item never deletes its target file.
- Global shortcuts must work while the WebView is hidden.
- Existing `launcher.json` files must remain loadable after upgrades.

## Source of truth

- `src/types.ts`: persisted schema and defaults.
- `src/migrations.ts`: schema validation, normalization, and versioned migrations.
- `src/launcher.ts`: state loading, saving, item/group CRUD, icon hydration.
- `src/App.vue`: navigation, visible-page semantics, health checks, cleanup flow.
- `src/components/SettingsPanel.vue`: hotkey recording and settings UI.
- `src/components/ItemEditor.vue`: launcher item editing.
- `src-tauri/src/lib.rs`: filesystem, process launch, registry scan, tray, native hotkey handler.
- `src-tauri/capabilities/default.json`: allowed Tauri capabilities.
- `src-tauri/tauri.conf.json`: app identity, window behavior, bundle metadata.

Read the relevant file before modifying behavior. Do not duplicate state ownership across Vue and Rust without documenting the boundary.

## Safe working rules

1. Never read, modify, copy, or commit the user's real file at:

   ```text
   %APPDATA%\com.quicknest.launcher\launcher.json
   ```

   unless the user explicitly asks for a data operation.

   For desktop regression tests, set `QUICKNEST_DATA_DIR` to a dedicated
   workspace-owned directory before launching QuickNest.

2. Never commit:

   - `node_modules/`
   - `dist/`
   - `src-tauri/target/`
   - installers or portable executables
   - migration backups
   - real launcher data, local paths, tokens, or credentials

   CI and community files under `.github/` are source-controlled and must keep least-privilege permissions.

3. Treat deletion as launcher-record deletion only. Do not add target-file deletion to a cleanup flow.

4. Do not make registry entries editable or persistent unless the data model and UX are intentionally redesigned.

5. Preserve user settings when adding schema fields. New settings should be optional at load boundaries or have migration fallbacks.

6. Avoid destructive Git commands. Keep unrelated worktree changes intact.

## Architecture notes

- Vue registers the configured shortcut through `tauri-plugin-global-shortcut`.
- Rust owns the shortcut event handler so the window can be shown while the WebView is hidden.
- The frontend invokes Rust commands for native operations.
- `check_targets` runs filesystem checks inside `spawn_blocking`; do not move blocking path checks onto the UI thread.
- URL/protocol targets are treated as launchable without a filesystem existence check.
- Registry items use IDs beginning with `registry-` and are regenerated on every scan.
- `visibleEntries` defines "current page." Features scoped to the current page, including bulk cleanup, must derive candidates from it so search filters are respected.

See `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` for more detail.

## Implementation conventions

- Use Vue Composition API and TypeScript.
- Keep persisted interfaces in `src/types.ts`.
- Keep native OS access behind Tauri commands.
- Prefer computed state over duplicated mutable state.
- Use `scheduleSave()` for normal UI mutations and `saveLauncher()` only when an immediate durable save is required.
- Keep saves serialized through the launcher save queue and call `flushLauncher()` before an intentional process exit.
- Keep modal destructive actions explicit and reversible at the target-file level.
- Keep Chinese user-facing copy concise. Code identifiers and developer documentation may be English.
- Add permissions to `src-tauri/capabilities/default.json` only when a feature requires them.

## Required validation

Run the checks relevant to a change:

```powershell
pnpm build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

For native integration or release changes, also run:

```powershell
pnpm tauri build
```

When changing registry scanning on Windows:

```powershell
cargo test --manifest-path .\src-tauri\Cargo.toml
```

The registry test depends on the host having at least one launchable registered application.

## Release checklist

The following versions must match:

- `package.json`
- `src-tauri/Cargo.toml`
- the `quicknest` package entry in `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`

Update `CHANGELOG.md`, run production checks, and never commit generated binaries.
When dependency versions change, also review `THIRD_PARTY_NOTICES.md`.

## Documentation maintenance

Update documentation in the same change when modifying:

- persisted fields or migration behavior;
- native command names or frontend/native boundaries;
- permissions;
- build requirements;
- navigation semantics;
- destructive or privacy-sensitive workflows.
