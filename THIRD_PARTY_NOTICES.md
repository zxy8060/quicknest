# Third-Party Notices

QuickNest source code is licensed under the [MIT License](LICENSE). The project also depends on third-party packages under their own licenses.

This file is a practical inventory, not a replacement for the license files distributed by each dependency.

## Direct JavaScript dependencies

| Package | Resolved version | License |
| --- | ---: | --- |
| `@tauri-apps/api` | 2.11.1 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-autostart` | 2.5.1 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-dialog` | 2.7.2 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-global-shortcut` | 2.3.2 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-opener` | 2.5.4 | MIT OR Apache-2.0 |
| `lucide-vue-next` | 0.468.0 | ISC |
| `vue` | 3.5.40 | MIT |

Development dependencies are recorded in `pnpm-lock.yaml`; their declared licenses are predominantly MIT, Apache-2.0, ISC, BSD-2-Clause, and BSD-3-Clause.

Direct test tooling includes:

| Package | Resolved version | License |
| --- | ---: | --- |
| `vitest` | 3.2.7 | MIT |

## Direct Rust dependencies

| Crate | Resolved version | License |
| --- | ---: | --- |
| `base64` | 0.22.1 | MIT OR Apache-2.0 |
| `opener` | 0.8.5 | MIT OR Apache-2.0 |
| `serde` | 1.0.229 | MIT OR Apache-2.0 |
| `serde_json` | 1.0.151 | MIT OR Apache-2.0 |
| `systemicons` | 0.9.13 | MIT |
| `tauri` | 2.11.5 | Apache-2.0 OR MIT |
| `tauri-build` | 2.6.3 | Apache-2.0 OR MIT |
| `tauri-plugin-autostart` | 2.5.1 | Apache-2.0 OR MIT |
| `tauri-plugin-dialog` | 2.7.2 | Apache-2.0 OR MIT |
| `tauri-plugin-global-shortcut` | 2.3.2 | Apache-2.0 OR MIT |
| `tauri-plugin-opener` | 2.5.4 | Apache-2.0 OR MIT |
| `tauri-plugin-single-instance` | 2.4.3 | Apache-2.0 OR MIT |
| `windows-sys` | 0.61.2 | MIT OR Apache-2.0 |
| `winreg` | 0.55.0 | MIT |

The Rust dependency graph also contains permissively licensed transitive crates and several unmodified MPL-2.0 crates, including `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, and `selectors`. QuickNest does not vendor or modify their source files.

## Reproducing the inventory

Use the lockfiles as the authoritative version record:

```powershell
pnpm licenses list --json
cargo metadata --format-version 1 --manifest-path .\src-tauri\Cargo.toml
```

Before distributing binaries, review the complete transitive dependency set and include any license texts or notices required by the versions actually shipped.
