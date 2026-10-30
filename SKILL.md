---
name: conversation-to-long-image
version: 1.0.0
author: dhfx
license: MIT
description: >-
  Render a conversation into a polished PNG long image and a standalone HTML
  document. Use when a user asks to export, archive, or share the current
  conversation, or a Markdown/TXT/JSON chat transcript, as a long image.
  Supports full or summary modes, light or dark themes, and automatic
  splitting of long conversations into multiple PNG parts. Triggers include
  对话转长图, 聊天记录导出长图, 会话生成 PNG, 导出长图, long image, screenshot,
  and chat transcript export.
metadata:
  allowed-tools:
    - Bash(node:*)
---

# Conversation to Long Image（对话转长图）

Convert visible conversation content or a transcript file into a safely rendered
PNG long image and a standalone HTML document. Preserve a normalized JSON copy and
a manifest for reproducibility.

This Skill follows the open **Agent Skills** specification and works with any
agent that supports it — for example Claude Code, OpenAI Codex, WorkBuddy, and
other compatible runtimes — as well as with direct command-line use.

## Defaults and boundaries

- Default to `full` mode and `light` theme when unspecified.
- Include only `user` and `assistant` conversational messages.
- Exclude system and developer instructions, internal reminders, reasoning, tool calls, tool outputs, and hidden context.
- Treat the model-visible context as the only current-conversation data source. Never read private agent databases, claim access to invisible history, or invent missing messages.
- Record source completeness and filtering warnings in `manifest.json`; do not render completeness fields or warning banners in the image. Mark summary mode with a subtle non-verbatim note.
- Set `exporter.tool` to `conversation-to-long-image` and `exporter.model` to the exact model identifier available in the current runtime. Never guess a model name; use `未指定模型` only when no reliable identifier is available.
- Keep full-mode included messages verbatim. Generate faithful summaries without adding facts in summary mode.
- Let the renderer hide only a final user message that requests producing a long image, screenshot, or shareable image of the conversation, in any phrasing (e.g. `把对话导出成长图`, `生成一张长图`, `截图这张对话`, `转图`, `保存为图片`). Detection is broad but preserves questions, how-tos, and discussions (with `怎么`, `为什么`, `？`, `吗`, `教我`, etc.). Do not hide the last user message manually when it is a genuine question.
- Do not fetch remote images or expose local files beyond explicitly supplied conversation content.

## Prepare the runtime

All commands below run from the Skill installation directory (for example
`~/.claude/skills/conversation-to-long-image`,
`~/.workbuddy/skills/conversation-to-long-image`, or any agent's skills directory).
Use any available Node.js 18+ runtime.

Read `references/runtime-setup.md` when dependencies or Chrome are unavailable. Run
the dependency check before the first render:

```bash
node scripts/ensure_deps.cjs
```

If dependencies are missing and installation is authorized, run the same command
with `--install`. Dependencies are installed into an isolated `.runtime` directory
inside the Skill folder by default; override with `CONVERSATION_TO_LONG_IMAGE_RUNTIME`
or `--runtime`. Never install them into the Skill root or a shared Node workspace.

## Convert the current visible conversation

1. Read `references/input-schema.md`.
2. Create a new output directory in the current workspace or at the user-requested location.
3. Write `conversation.normalized.json` there using the normalized schema.
4. Set `source.type` to `current_context` and `source.completeness` to `unknown`, or `partial` when truncation is visible.
5. Set `exporter.tool` to `conversation-to-long-image` and `exporter.model` to the exact current model identifier when reliably known.
6. Copy visible user requests and assistant formal replies in order. Assign stable IDs such as `m001`, `m002`.
7. Use `format: markdown` for normal messages and `format: text` only when literal plain-text rendering is required.
8. In summary mode, place the faithful summary in `content` and set `mode` to `summary`.
9. Run `scripts/render.cjs` with the normalized JSON.

## Convert a transcript file

1. For JSON, Markdown, or TXT in full mode, run `scripts/normalize.cjs` with `--input`, `--output`, and optional `--title`, `--theme`, `--model` overrides. Use the exact current model identifier when known.
2. Use documented `User`, `Assistant`, `用户`, or `助手` headings/prefixes for Markdown and TXT. Ask for clarification when role boundaries are ambiguous; do not guess alternating roles.
3. For summary mode, read the source and create normalized JSON with faithfully summarized `content` instead of asking the deterministic scripts to summarize.
4. Ensure `source.type` is `file`; use `complete` only when the entire source was processed.
5. Render the resulting normalized JSON with `scripts/render.cjs`.

## Render

```bash
node scripts/render.cjs \
  --input "/absolute/path/conversation.normalized.json" \
  --output-dir "/absolute/path/output"
```

Use `--chrome "/path/to/Chrome"` to override browser discovery, `--scale 2` for higher pixel density, or `--max-height 12000` to tune splitting. Prefer a new empty output directory for each run.

## Validate and deliver

1. Read `manifest.json` and confirm that rendering succeeded.
2. Verify that all message IDs or split block IDs occur exactly once across PNG parts.
3. Inspect HTML and PNG for Chinese wrapping, code blocks, tables, long URLs, image placeholders, header metadata, and split labels; inspect `manifest.json` for source and filtering warnings.
4. Deliver the complete HTML, every PNG part, and `manifest.json` to the user (for example via the agent's file-delivery mechanism, such as WorkBuddy's `present_files`, or by writing them to the requested output directory).
5. State any source-completeness limitation and unresolved rendering warnings succinctly.
