[中文](README.md)

# conversation-to-long-image

Render a conversation (or a Markdown / TXT / JSON transcript) into a polished PNG long image and a standalone HTML document. Supports full / summary modes, light / dark themes, and automatic splitting of long conversations.

## Install

Just tell your agent to install the skill from this repository:

```
git@github.com:avehub/chat_to_img.git
```

This skill follows the open **Agent Skills** specification. Any compatible agent harness can use it after cloning, for example:

| Agent | Install command |
| --- | --- |
| Claude Code | `git clone git@github.com:avehub/chat_to_img.git ~/.claude/skills/conversation-to-long-image` |
| Codex | `git clone git@github.com:avehub/chat_to_img.git ~/.codex/skills/conversation-to-long-image` |
| WorkBuddy | `git clone git@github.com:avehub/chat_to_img.git ~/.workbuddy/skills/conversation-to-long-image` |
| DeepSeek-Harness | `git clone git@github.com:avehub/chat_to_img.git <skills-dir>/conversation-to-long-image` |

> Tip: in most cases, just say to your agent "install the skill git@github.com:avehub/chat_to_img.git" and it will clone and load it automatically.

## Usage

1. (Optional) Normalize a transcript file:
   ```bash
   node scripts/normalize.cjs --input chat.md --output out/conversation.normalized.json
   ```
2. Render to a long image and HTML:
   ```bash
   node scripts/render.cjs --input out/conversation.normalized.json --output-dir out
   ```

To render the **current conversation**, first write a normalized JSON following [`references/input-schema.md`](references/input-schema.md), then run the render command above.

Outputs (`out/`):
- `conversation.html` — standalone styled HTML
- `conversation.png` (or `conversation-part-001.png`, `002.png`… when split) — the long image
- `conversation.normalized.json` — copy of the normalized input
- `manifest.json` — metadata, split manifest, and warnings

## Runtime setup

The skill keeps Node dependencies in an isolated `.runtime/` directory and **never downloads a browser**.

```bash
node scripts/ensure_deps.cjs            # check dependencies and browser
node scripts/ensure_deps.cjs --install # install dependencies (requires npm + network)
```

A Chromium-based browser (Chrome / Chromium / Edge) must be installed. Pass `--chrome <path>` if it is not on a default location.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `CONVERSATION_TO_LONG_IMAGE_RUNTIME` | Override the isolated runtime directory |
| `CONVERSATION_TO_LONG_IMAGE_CHROME` | Override the browser executable path |
| `CONVERSATION_TO_LONG_IMAGE_NPM` | Override the `npm` executable |
| `CONVERSATION_TO_LONG_IMAGE_MODEL` | Default model label |
| `CONVERSATION_TO_LONG_IMAGE_TOOL` | Default exporter tool name |
| `CONVERSATION_TO_LONG_IMAGE_DEBUG` | Print full error stacks |

## License

[MIT](LICENSE)
