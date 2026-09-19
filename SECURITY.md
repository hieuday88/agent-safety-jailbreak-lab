# Security Policy

## Supported versions

Security fixes are applied to the latest release.

## Reporting a vulnerability

Please use the repository's private security-advisory feature when available. Do not publish exploit details, credentials, tokens, private prompts, or sensitive local paths in a public issue.

Include:

- A concise description of the issue.
- Affected version and operating system.
- Reproduction steps using non-sensitive test data.
- Expected and observed behavior.
- Suggested mitigation, if known.

## Security boundaries

The extension makes no network requests. It reads instruction profiles bundled in the package under `resources/rules/` and writes user-level configuration files: `~/.gemini/GEMINI.md`, `~/.kiro/steering/agents.md`, and the Claude Code output style plus the `outputStyle` key in the Claude configuration directory (`~/.claude` unless `CLAUDE_CONFIG_DIR` overrides it). Before overwriting a file it does not recognise as its own, it saves the previous contents to a `<file>.lunabak` sidecar and restores them on removal. Treat profile content as untrusted input, review changes before distribution, and use the extension only in environments where you are authorized to modify agent configuration.
