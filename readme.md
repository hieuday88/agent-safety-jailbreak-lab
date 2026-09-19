# Agent Safety Jailbreak Lab

Agent Safety Jailbreak Lab is a VS Code-compatible extension for cross-model instruction and guardrail evaluation. It synchronizes a selected research profile to supported AI coding environments from one sidebar.

Extension identifier: `lazyluna.agent-safety-jailbreak-lab`.

> [!IMPORTANT]
> This project is intended for authorized research, prompt-behavior evaluation, and local experimentation. It does not disable provider-enforced safeguards, access controls, or platform policies.

## Features

- Synchronizes research profiles across supported AI coding assistants.
- Provides one-click activation and reset controls.
- Includes three profile variants (V1, V2, V3) for comparative testing.
- Targets only the environments you switch on; environments left off are never read, written, or removed.
- Shows the extension version, its MIT license, and a locally generated device ID for support reference. The device ID is never transmitted.
- Supports Windows, macOS, and Linux.
- Displays file size, line count, and last synchronization time.

## Supported environments

- **Antigravity:** Gemini 3.1 Pro and Claude.
- **Kiro:** Claude.
- **Claude Code:** including installations configured to use compatible third-party API providers.

## Installation

### Install a prebuilt VSIX

1. Download `agent-safety-jailbreak-lab-<version>.vsix` from the project release.
2. Open the Extensions view in VS Code or a compatible editor.
3. Choose **Install from VSIX...** from the overflow menu.
4. Reload the editor when prompted.

### Build from source

Requirements:

- Node.js 20 or newer
- npm

```bash
npm ci
npm run check
npm test
npm run package:release
```

The release artifact is written to `agent-safety-jailbreak-lab-<version>.vsix`, with the
version read from `package.json`.

## Usage

The sidebar is a three-step flow:

1. Open **Agent Safety Lab** from the activity bar.
2. **Chọn hồ sơ nghiên cứu** (select profile): pick the research profile, `V1`, `V2`, or `V3`.
3. **Chọn môi trường áp dụng** (select environments): switch on the environments to target. An environment left off is never read, written, or removed.
4. **Đồng bộ & quản lý** (sync and manage): the sync button names how many environments it will touch, and only those are written. Changing the profile takes effect after the next sync.
5. Open a **new session** in each target assistant. An assistant composes the profile into its instructions when a session starts, so a session that is already open keeps the profile it began with — until you start a new one, a sync looks like it did nothing.
6. Use **Gỡ bỏ** (remove) to take the profile back out of the selected environments. It acts on the same selection as step 3, puts back any original file contents saved during the first sync, and restores the Claude Code output style that was in use before the first sync. Removal is immediate on disk, but a session that is already open keeps the previous profile until you start a new one.

## Upgrading from earlier versions

Earlier releases published this extension under a different publisher and installed the Claude Code profile under a different output-style name. Because the publisher identifier changed, the editor treats the new package as a separate extension: uninstall the older one rather than installing alongside it.

The first sync after upgrading writes `output-styles/luna.md`, removes the profile left behind by the older release, and reports the current state in step 3.

## Privacy and network behavior

The extension makes **no network requests**. Every profile is bundled inside the package under `resources/rules/`, and nothing is transmitted anywhere.

Synchronization writes these user-level files:

| Environment | File |
| --- | --- |
| Antigravity | `~/.gemini/GEMINI.md` |
| Kiro | `~/.kiro/steering/agents.md` |
| Claude Code | the `outputStyle` key in `~/.claude/settings.json`, pointing at `~/.claude/output-styles/luna.md` |

Set `CLAUDE_CONFIG_DIR` to relocate the Claude Code configuration directory.

Synchronization **overwrites** the target file. Before the first overwrite of a file this extension does not own, the previous contents are saved alongside it as a sidecar with a `.lunabak` suffix — for example `~/.gemini/GEMINI.md.lunabak`. Removal puts that copy back and deletes the sidecar, or removes the profile when there was nothing to save. A file the extension neither recognises as its own nor holds a backup for is left untouched.

Review the profile content before using the extension in a sensitive environment.

## Development

```bash
npm install
npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host.

## Responsible use

Only evaluate systems and accounts you own or have permission to test. Do not use this project to evade access controls, obtain unauthorized data, or misrepresent system capabilities. The full policy is provided in `RESPONSIBLE_USE.md`.

## Contributing

See `CONTRIBUTING.md` for the development workflow and `SECURITY.md` for reporting vulnerabilities. Those two live in the repository; only `RESPONSIBLE_USE.md` ships inside the package.

## License

Released under the MIT License in `LICENSE`.
