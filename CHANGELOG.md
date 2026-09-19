# Changelog

All notable changes to this project are documented in this file.

## [1.3.0] - 2026-09-19

Everything here landed after 1.2.0. Versions 1.2.1 and 1.2.2 were built locally
during development but were never published, so their changes are included below.

### Added

- `npm test` runs three verification suites committed under `test/`: host behaviour, cross-file consistency, and the panel script driven in a DOM shim.
- `.vscode/launch.json` and `.vscode/tasks.json`, so pressing F5 launches an Extension Development Host as the documentation describes.
- Synchronization saves what it is about to overwrite. The previous contents of a file the extension does not own are written to a `<file>.lunabak` sidecar, and removal restores that copy.
- The environment selection from step 2 is persisted, so it is restored when the panel is recreated.
- `docs/1.3.0-hardening-plan.md` records the design, assumptions and decisions behind this release.

### Changed

- The panel is fully offline. It no longer loads Google Fonts, it uses the editor's own font variables, and its content policy is now `default-src 'none'`.
- The session card shows the real extension version, read from the packaged manifest, and the MIT license, replacing a `Free Active` badge that nothing in the extension supported.
- The panel banner and the editor notification share one wording produced by the host; previously each wrote its own sentence for the same action.
- Result messages name the environments actually affected, and a success banner no longer tells you to open a new Claude Code session when Claude Code was not synced.
- Release artifacts are named `agent-safety-jailbreak-lab-<version>.vsix`, and `npm run package:release` produces that name from `package.json`.
- Repository, homepage and bug URLs point at the extension's actual location, `hieuday88/agent-safety-jailbreak-lab`.
- The extension is published as `lazyluna`, the Claude Code output style is `Luna` (`output-styles/luna.md`), and the research persona in `resources/rules/bypass_v1.md` is Luna.
- `.gitattributes` pins LF, matching what `.editorconfig` already specified, so a checkout no longer depends on a global `core.autocrlf` setting.

### Fixed

- Synchronization and removal now say that the profile only takes effect in a new session. The notice previously told only Claude Code users to open a new one, so a sync from Antigravity or Kiro appeared to have done nothing while the session already open kept the profile it began with. The README says the same thing plainly, instead of advising a restart "when necessary".
- The environment toggles in step 2 now control the scope of the action: `Đồng bộ` and `Gỡ bỏ` only touch the environments that are switched on, instead of always writing or deleting Antigravity, Kiro and Claude Code.
- Deactivating the extension no longer deletes `~/.gemini/GEMINI.md` or `~/.kiro/steering/agents.md`. Deactivation also runs on every window reload and on editor shutdown, so it removed the files the target assistant needs and deleted files the user owned whenever the extension was disabled or uninstalled. Cleanup now belongs to **Gỡ bỏ** alone.
- Removing the profile also cleans up the output style installed by pre-rename releases and restores the output style that was in use before the first sync, so `settings.json` can no longer be left pointing at a style file that no longer exists.
- Claude Code `settings.json` and output style backup handling now run only when Claude Code is one of the selected environments.
- Restored four words in `resources/rules/bypass_v1.md` that an earlier persona rename had corrupted by replacing the `lo` substring: `ALLOWED`, `MONOLOGUE`, `LOOK` and `LOVE`.
- Initial environment badges read `Chưa kích hoạt` in both the static markup and the rendered state; the markup previously said `Chưa đồng bộ`.
- Removed the unused `syncStatus` message. Its payload was named `download`, left over from the remote-fetch design removed in 1.2.0, and handling it overwrote the panel's "Đang đồng bộ N môi trường…" progress text with a less specific string.
- Removed six dead fallback profile filenames from the loader; each profile now resolves through its single real filename.

### Documentation

- Corrected the README and `SECURITY.md`, which both claimed the profile is downloaded from a remote endpoint. The extension reads the profiles bundled under `resources/rules/` and makes no network requests.
- Corrected the README's profile count (three variants, not two) and rewrote its usage steps to name the actual controls, including the environment selection step.
- Documented the file locations the extension writes, the `.lunabak` sidecar that protects the previous contents, and the upgrade path from the pre-rename release.

## [1.2.0] - 2026-08-20

### Added

- Bundled local rule profiles in `resources/rules/` (`bypass_v1.md` and `bypass_v2.md`).
- Offline activation support without requiring remote URL fetching.

### Changed

- Updated rule loader in `src/extension.ts` to read directly from local extension package.
- Cleaned up repository structure and standardized rule file naming conventions.
- Removed remote network fetch and obfuscated URL decoding logic.

## [1.1.0] - 2026-08-11

### Added

- Global Claude Code Output Style integration.
- Documented support for Antigravity (Gemini 3.1 Pro and Claude), Kiro (Claude), and Claude Code with compatible third-party APIs.
- Cross-platform Claude configuration discovery through the user home directory.
- Support for `CLAUDE_CONFIG_DIR`.
- Preservation and restoration of the previously selected Claude output style.
- Public repository documentation and reproducible packaging scripts.

### Changed

- Rebranded the extension as Agent Safety Jailbreak Lab.
- Updated the extension identifier to `lazyluna.agent-safety-jailbreak-lab` and added public repository metadata.
- Isolated Claude configuration in `output-styles/luna.md`.

### Removed

- Direct writes to the user's global `CLAUDE.md`.
- Unsupported writes to `~/.config/claude/config.json`.

## [1.0.0] - 2026-08-11

- Initial local release.
