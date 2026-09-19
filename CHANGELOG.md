# Changelog

All notable changes to this project are documented in this file.

## [1.3.0] - 2026-09-19

### Changed

- Renamed the project's brand identifiers to Luna: extension publisher `lazyluna`, Claude Code output style `Luna` (`output-styles/luna.md`), the icon gradient id, the LICENSE copyright holder, and the repository/homepage/bug URLs.
- Renamed the research persona in `resources/rules/bypass_v1.md` to Luna.

### Fixed

- Restored four words in `resources/rules/bypass_v1.md` that an earlier persona rename had corrupted by replacing the `lo` substring: `ALLOWED`, `MONOLOGUE`, `LOOK` and `LOVE`.
- Removing the profile now also cleans up the output style installed by pre-rename releases and restores the previously selected output style, so `settings.json` can no longer be left pointing at a style file that no longer exists.
- Deactivating the extension no longer deletes `~/.gemini/GEMINI.md` or `~/.kiro/steering/agents.md`. Deactivation also runs on every window reload and on editor shutdown, so it removed the files the target assistant needs, and it deleted files the user owned whenever the extension was disabled or uninstalled. The explicit **Gỡ bỏ** action owns cleanup for every environment, which is how the Claude Code output style already behaved.
- Synchronization now preserves what it overwrites. Before the first write to a file the extension does not recognise as its own, the previous contents are saved to a `<file>.lunabak` sidecar, and removal restores that copy instead of deleting the file. A file the extension neither owns nor has a backup for is left untouched, so removal can no longer delete content it did not write.
- The panel banner and the editor notification now share one wording produced by the host. They previously carried two independently written messages for the same action, which drifted apart: a sync reported "Đã đồng bộ: …" in the panel and "Đồng bộ thành công cho: …" as a notification, with a different Claude Code sentence in each.
- The session card now shows the real extension version, read from the packaged manifest, and the MIT license, replacing a `Free Active` badge that had no supporting logic anywhere in the extension.
- Removed the unused `syncStatus` message. Its payload was named `download`, a leftover from the remote-fetch design removed in 1.2.0, and handling it overwrote the panel's "Đang đồng bộ N môi trường…" progress text with a less specific string.

### Documentation

- Corrected the README and `SECURITY.md`, which both claimed the profile is downloaded from a remote endpoint. The extension makes no network requests; it reads the profiles bundled under `resources/rules/`.
- Corrected the README's profile count (three variants, not two) and rewrote its usage steps to name the actual controls, including the environment selection step.
- Documented the file locations the extension writes, the overwrite-without-backup behavior, and the upgrade path from the pre-rename release.

## [1.2.2] - 2026-09-19

### Fixed

- The three environment toggles in step 2 now actually control the scope of the actions: `Đồng bộ` and `Gỡ bỏ` only touch the environments that are switched on, instead of always writing or deleting Antigravity, Kiro and Claude Code.
- Claude Code `settings.json` and output style backup handling now run only when Claude Code is one of the selected environments.
- Result messages list the environments that were actually affected, and success banners no longer tell you to open a new Claude Code session when Claude Code was not synced.
- Initial environment badges used the text `Chưa đồng bộ` while the rendered state used `Chưa kích hoạt`; both now read `Chưa kích hoạt`.

### Added

- The environment selection is persisted in the extension's global state, so it is restored when the webview is recreated.

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
