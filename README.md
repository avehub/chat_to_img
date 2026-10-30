# conversation-to-long-image

将当前对话或聊天记录文件（Markdown / TXT / JSON）渲染为美观的 PNG 长图与独立 HTML，支持完整 / 摘要模式、浅色 / 深色主题，超长对话自动分页拆分。

> Render a conversation (or a Markdown/TXT/JSON transcript) into a polished PNG
> long image and a standalone HTML document.

This skill follows the open **Agent Skills** specification and is designed to be
installed and used by any compatible agent — Claude Code, OpenAI Codex, WorkBuddy,
and others — as well as directly from the command line.

## Features

- **Cross-agent**: no WorkBuddy-specific dependencies. Works anywhere Node.js 18+ and a Chromium-based browser are available.
- **Cross-platform**: Chrome/Chromium/Edge discovery on macOS, Windows, and Linux.
- **Inputs**: current conversation context, or a transcript file (`.json`, `.md`, `.markdown`, `.txt`).
- **Themes**: light and dark.
- **Modes**: full (verbatim) and summary.
- **Auto-splitting**: long conversations are split into multiple PNG parts that never lose or duplicate content.
- **Safe rendering**: Markdown is sanitized; remote images become placeholders; local images are inlined as data URIs.

## Repository layout

```
conversation-to-long-image/
├── SKILL.md                  # Agent Skills entry point (Anthropic-compatible frontmatter)
├── README.md
├── LICENSE                   # MIT
├── package.json              # Isolated runtime dependency manifest
├── package-lock.json         # Pinned dependency tree for reproducible installs
├── scripts/
│   ├── render.cjs            # Render normalized JSON -> HTML + PNG(s) + manifest
│   ├── normalize.cjs         # Convert transcript files -> normalized JSON
│   └── ensure_deps.cjs       # Check / install isolated runtime
├── assets/
│   ├── template.html         # HTML template (CSP-hardened)
│   ├── conversation.css      # Light/dark styles
│   └── icon.png              # Skill icon
└── references/
    ├── input-schema.md       # Normalized JSON schema
    └── runtime-setup.md      # Runtime and browser setup
```

## Installation

Clone or download this folder, then place it into your agent's skills directory.

### Claude Code (Anthropic Agent Skills)

```bash
git clone <your-repo-url> conversation-to-long-image
mkdir -p ~/.claude/skills
cp -r conversation-to-long-image ~/.claude/skills/
```

Claude Code will then load it automatically based on the `description` trigger.

### OpenAI Codex / generic Agent Skills runtime

Copy the folder into the skills directory your runtime expects, e.g.:

```bash
cp -r conversation-to-long-image ~/.codex/skills/
```

### WorkBuddy

Copy into the user-level skills directory:

```bash
cp -r conversation-to-long-image ~/.workbuddy/skills/
```

or install it through the in-product skill manager.

### Command-line only

No agent required — the scripts run standalone:

```bash
node scripts/ensure_deps.cjs --install   # installs Node deps into .runtime/
node scripts/normalize.cjs --input chat.md --output out/conversation.normalized.json
node scripts/render.cjs --input out/conversation.normalized.json --output-dir out
```

## Runtime setup

The skill keeps its Node dependencies in an isolated `.runtime/` directory inside
the skill folder so the host environment is never modified. No browser is
downloaded.

```bash
# Check dependencies and browser availability
node scripts/ensure_deps.cjs

# Install dependencies (requires network + npm)
node scripts/ensure_deps.cjs --install
```

A Chromium-based browser (Chrome, Chromium, or Edge) must already be installed.
If it is not on a default path, pass it explicitly:

```bash
node scripts/render.cjs --input out/conversation.normalized.json --output-dir out \
  --chrome "/path/to/chrome"
```

Override the runtime location with `CONVERSATION_TO_LONG_IMAGE_RUNTIME` or `--runtime`.

## Usage

### 1. Normalize a transcript file (optional)

```bash
node scripts/normalize.cjs \
  --input transcript.md \
  --output out/conversation.normalized.json \
  --title "我的对话" \
  --theme dark
```

### 2. Render

```bash
node scripts/render.cjs \
  --input out/conversation.normalized.json \
  --output-dir out
```

Outputs (`out/`):

- `conversation.html` — standalone styled HTML
- `conversation.png` — single image, or `conversation-part-001.png`, `conversation-part-002.png`, … when split
- `conversation.normalized.json` — copy of the normalized input
- `manifest.json` — metadata, part list, and warnings

### Environment variables

| Variable | Purpose |
| --- | --- |
| `CONVERSATION_TO_LONG_IMAGE_RUNTIME` | Override the isolated runtime directory |
| `CONVERSATION_TO_LONG_IMAGE_CHROME` | Override the browser executable path |
| `CONVERSATION_TO_LONG_IMAGE_NPM` | Override the `npm` executable used by `--install` |
| `CONVERSATION_TO_LONG_IMAGE_MODEL` | Default model label when not set in the input |
| `CONVERSATION_TO_LONG_IMAGE_TOOL` | Default exporter tool name shown in the image header |
| `CONVERSATION_TO_LONG_IMAGE_DEBUG` | Print full error stacks |

## Input schema

See [`references/input-schema.md`](references/input-schema.md) for the normalized
JSON contract (roles, formats, summary mode, image handling, and export-command hiding).

## License

MIT — see [`LICENSE`](LICENSE).
