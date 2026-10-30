# Isolated runtime setup

The Skill uses Node dependencies from an isolated runtime directory outside the
package files so that the Skill folder stays read-only-friendly and the host
environment is never polluted.

By default the runtime lives inside the Skill folder at:

`<skill-root>/.runtime`

Override it with `CONVERSATION_TO_LONG_IMAGE_RUNTIME` or `--runtime`. A writable
directory anywhere is accepted (for example a per-user cache directory).

Do not install packages into the Skill directory root or any shared Node workspace.

## Check

Run from the Skill installation directory (e.g. `~/.claude/skills/conversation-to-long-image`,
`~/.workbuddy/skills/conversation-to-long-image`, or any agent's skills directory),
with any available Node.js 18+ runtime:

```bash
node scripts/ensure_deps.cjs
```

Add `--json` for machine-readable status.

## Install or repair

With installation authorized, run:

```bash
node scripts/ensure_deps.cjs --install
```

The installer copies only `package.json` and `package-lock.json` into the isolated
runtime, runs `npm ci` there, and verifies `playwright-core`, `markdown-it`,
`sanitize-html`, and `highlight.js`. No browser is downloaded.

The installer resolves `npm` next to the running Node executable and falls back to
`npm` from `PATH`. Override the runtime with `CONVERSATION_TO_LONG_IMAGE_RUNTIME`
or `--runtime`. Override npm with `CONVERSATION_TO_LONG_IMAGE_NPM` or `--npm`.

## Chrome / Chromium / Edge

The renderer reuses an already installed browser; it never downloads one. It checks
`CONVERSATION_TO_LONG_IMAGE_CHROME`, `--chrome`, and platform-specific default paths:

- **macOS**: `/Applications/Google Chrome.app`, `/Applications/Chromium.app`, `/Applications/Microsoft Edge.app`
- **Windows**: `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`, `%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe`, `C:\Program Files\Google\Chrome\Application\chrome.exe`, and common variants
- **Linux**: `/usr/bin/google-chrome`, `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/snap/bin/chromium`, `/usr/bin/microsoft-edge`, and common variants

Install one of these browsers or pass an explicit executable path with `--chrome`.

## Common failures

- **Missing runtime modules**: run `ensure_deps.cjs --install`, then repeat the check.
- **Chrome not found**: install Chrome/Chromium/Edge or pass `--chrome`.
- **EACCES or EPERM**: select a user-writable runtime/output directory; do not use sudo.
- **Screenshot too large**: keep automatic splitting, reduce `--scale`, or use summary mode.
