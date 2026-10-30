[English](README.en.md)

# 对话转长图（conversation-to-long-image）

将当前对话或一份聊天记录（Markdown / TXT / JSON）安全渲染为一张美观的 PNG 长图与一份独立 HTML。支持完整 / 摘要两种模式、浅色 / 深色两套主题，超长对话自动分页拆分。

## 安装

直接告诉你的智能体，安装这个技能即可：

```
git@github.com:avehub/chat_to_img.git
```

本技能遵循开放的 **Agent Skills** 规范，主流智能体框架克隆后即可使用，例如：

| 智能体 | 安装命令 |
| --- | --- |
| Claude Code | `git clone git@github.com:avehub/chat_to_img.git ~/.claude/skills/conversation-to-long-image` |
| Codex | `git clone git@github.com:avehub/chat_to_img.git ~/.codex/skills/conversation-to-long-image` |
| WorkBuddy | `git clone git@github.com:avehub/chat_to_img.git ~/.workbuddy/skills/conversation-to-long-image` |
| DeepSeek-Harness | `git clone git@github.com:avehub/chat_to_img.git <skills 目录>/conversation-to-long-image` |

> 提示：多数情况下，只需对智能体说「安装 git@github.com:avehub/chat_to_img.git 这个技能」，它会自动完成克隆与加载。

## 使用

1. （可选）归一化一份聊天记录文件：
   ```bash
   node scripts/normalize.cjs --input chat.md --output out/conversation.normalized.json
   ```
2. 渲染为长图与 HTML：
   ```bash
   node scripts/render.cjs --input out/conversation.normalized.json --output-dir out
   ```

要渲染「当前对话」，请先按 [`references/input-schema.md`](references/input-schema.md) 写出归一化 JSON，再执行上面的渲染命令。

输出（`out/`）：
- `conversation.html` —— 独立样式 HTML
- `conversation.png`（或 `conversation-part-001.png`、`002.png`… 分页时） —— 长图
- `conversation.normalized.json` —— 归一化输入副本
- `manifest.json` —— 元数据、分页清单与警告

## 运行时准备

技能把 Node 依赖隔离安装在 `.runtime/` 目录，**不会下载浏览器**。

```bash
node scripts/ensure_deps.cjs            # 检查依赖与浏览器
node scripts/ensure_deps.cjs --install # 安装依赖（需要 npm 与网络）
```

需本机已安装基于 Chromium 的浏览器（Chrome / Chromium / Edge）。若不在默认路径，用 `--chrome <path>` 指定。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `CONVERSATION_TO_LONG_IMAGE_RUNTIME` | 覆盖隔离运行时目录 |
| `CONVERSATION_TO_LONG_IMAGE_CHROME` | 覆盖浏览器可执行文件路径 |
| `CONVERSATION_TO_LONG_IMAGE_NPM` | 覆盖 `npm` 可执行文件 |
| `CONVERSATION_TO_LONG_IMAGE_MODEL` | 默认模型标签 |
| `CONVERSATION_TO_LONG_IMAGE_TOOL` | 默认导出工具名 |
| `CONVERSATION_TO_LONG_IMAGE_DEBUG` | 打印完整错误栈 |

## 许可证

[MIT](LICENSE)
