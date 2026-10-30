# Normalized conversation input

Use UTF-8 JSON with this structure:

```json
{
  "schema_version": 1,
  "source": {
    "type": "current_context",
    "name": "当前对话",
    "completeness": "unknown"
  },
  "mode": "full",
  "theme": "light",
  "title": "对话记录",
  "generated_at": "2026-10-29T23:00:00-04:00",
  "exporter": {
    "tool": "conversation-to-long-image",
    "model": "Kimi-K3.1-Pro-Highspeed"
  },
  "messages": [
    {
      "id": "m001",
      "role": "user",
      "format": "markdown",
      "content": "请整理这段对话。",
      "timestamp": "可选"
    },
    {
      "id": "m002",
      "role": "assistant",
      "format": "markdown",
      "content": "可以，以下是整理结果。"
    }
  ]
}
```

## Field rules

- `schema_version`: exactly `1`.
- `source.type`: `current_context` or `file`.
- `source.name`: short display name; defaults to `当前对话` or the source filename.
- `source.completeness`: `complete`, `partial`, or `unknown`.
  - Current context may only use `partial` or `unknown`.
  - Use `complete` for a file only when the entire file was processed.
- `mode`: `full` or `summary`; default `full`.
- `theme`: `light` or `dark`; default `light`.
- `title`: non-empty plain text, maximum 200 characters.
- `generated_at`: optional ISO 8601 string.
- `exporter`: optional object with `tool` and `model` strings, each up to 120 characters. Use the exact known model identifier; defaults are `conversation-to-long-image` and `未指定模型`.
- `normalizationWarnings`: optional array of strings produced during input filtering; the renderer includes them in the manifest, not as image warning banners.
- `messages`: non-empty array, maximum 5,000 messages.
- `messages[].id`: unique non-empty string matching `^[A-Za-z0-9_-]{1,80}$`.
- `messages[].role`: only `user` or `assistant`.
- `messages[].format`: `markdown` or `text`; default `markdown`.
- `messages[].content`: non-empty string after trimming surrounding blank lines, maximum 500,000 characters per message.
- `messages[].timestamp`: optional plain text, maximum 100 characters.

The renderer validates these constraints. Filter `system`, `developer`, `tool`, and unknown roles during normalization rather than sending them to the renderer.

## Simple JSON accepted by normalize.cjs

The normalizer also accepts an array of messages or an object containing `messages`. Each message requires `role` and `content`; optional `id`, `format`, and `timestamp` are preserved. Unsupported roles are omitted and reported in normalization warnings. Input metadata is mapped when present; otherwise file-based defaults are used.

## Markdown and TXT role syntax

Start each message with a role heading or a role prefix on its own line:

```markdown
## User
请生成一份摘要。

## Assistant
以下是摘要。
```

or:

```text
用户：
请生成一份摘要。

助手：
以下是摘要。
```

Accepted English labels are `User` and `Assistant`, case-insensitive. Accepted Chinese labels are `用户` and `助手`. Headings may use one to six `#` characters. Prefixes may end in ASCII `:` or Chinese `：`.

`System`, `Developer`, `Tool`, `系统`, `开发者`, and `工具` blocks are recognized and omitted with a persistent warning; they are never merged into adjacent visible messages. Role-like lines inside backtick or tilde fenced code blocks remain message content and do not split messages.

Do not place unassigned prose before the first role marker. Do not omit role markers between adjacent messages. The normalizer rejects ambiguous content rather than guessing roles.

## Final export-command hiding

The renderer hides the last message when it is a user message that requests producing a long image, screenshot, or shareable image of the conversation, in any phrasing. Detection is intentionally broad: an unambiguous long-image/screenshot noun (`长图`, `PNG`, `long image`, `截图`, `截屏`, `screenshot`) is sufficient, and image nouns (`图片`, `图`, `海报`, `poster`, `image`) combined with an export/create action (`导出`, `生成`, `转换`, `保存为`, `转图`, `出图`, `生图`, etc.) also qualify. Questions, how-tos, and discussions about export concepts (containing `怎么`, `为什么`, `？`, `吗`, `教我`, `示例`, etc.) are preserved. The manifest records `originalMessageCount`, `hiddenExportCommand`, and a filtering warning. A single-message input that contains only an export command is rejected because no conversation remains.

## Summary inputs

Deterministic scripts do not summarize. For summary mode, create normalized JSON whose `content` already contains the faithful summary and whose `mode` is `summary`. The output always displays a non-verbatim warning.

## Images

Markdown image syntax is supported subject to renderer policy. Remote HTTP(S) images become URL placeholders. Local PNG, JPEG, GIF, and WebP paths resolve relative to the normalized JSON file; absolute paths are accepted. Unsupported, missing, oversized, or non-file paths become placeholders.
