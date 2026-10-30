#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { fileURLToPath, pathToFileURL } = require('node:url');

const SKILL_ROOT = path.resolve(__dirname, '..');
const VIEWPORT_WIDTH = 1080;
const MAX_PIXEL_HEIGHT = 24000;
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

// Cross-platform Chrome/Chromium/Edge discovery. The renderer intentionally
// never downloads a browser; it reuses an already installed one.
function chromeCandidates() {
  const localApp = process.env.LOCALAPPDATA;
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
  }
  if (process.platform === 'win32') {
    const bases = [];
    if (localApp) {
      bases.push(
        path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localApp, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(localApp, 'Chromium', 'Application', 'chrome.exe')
      );
    }
    return [
      ...bases,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
  }
  // Linux and other POSIX systems.
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/lib/chromium/chromium',
    '/opt/google/chrome/chrome'
  ];
}

function parseArgs(argv) {
  const result = { scale: 1, maxHeight: 12000, maxImageBytes: 5 * 1024 * 1024, maxTotalImageBytes: 20 * 1024 * 1024 };
  const valueArgs = new Set(['--input', '--output-dir', '--chrome', '--runtime', '--scale', '--max-height', '--max-image-bytes', '--max-total-image-bytes']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!valueArgs.has(arg)) throw new Error(`Unknown argument: ${arg}`);
    if (!argv[i + 1]) throw new Error(`${arg} requires a value`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    result[key] = argv[++i];
  }
  if (!result.input || !result.outputDir) throw new Error('Usage: render.cjs --input <normalized.json> --output-dir <directory> [--chrome <path>] [--scale 1|2] [--max-height 12000]');
  result.input = path.resolve(result.input);
  result.outputDir = path.resolve(result.outputDir);
  result.scale = Number(result.scale);
  result.maxHeight = Number(result.maxHeight);
  result.maxImageBytes = Number(result.maxImageBytes);
  result.maxTotalImageBytes = Number(result.maxTotalImageBytes);
  if (!Number.isFinite(result.scale) || result.scale < 1 || result.scale > 3) throw new Error('--scale must be between 1 and 3.');
  if (!Number.isInteger(result.maxHeight) || result.maxHeight < 2000 || result.maxHeight > 30000) throw new Error('--max-height must be an integer between 2000 and 30000.');
  if (!Number.isInteger(result.maxImageBytes) || result.maxImageBytes < 1) throw new Error('--max-image-bytes must be a positive integer.');
  if (!Number.isInteger(result.maxTotalImageBytes) || result.maxTotalImageBytes < 1) throw new Error('--max-total-image-bytes must be a positive integer.');
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Normalized input must be a JSON object.');
  if (data.schema_version !== 1) throw new Error('schema_version must be exactly 1.');
  if (!data.source || !['current_context', 'file'].includes(data.source.type)) throw new Error('source.type must be current_context or file.');
  if (!['complete', 'partial', 'unknown'].includes(data.source.completeness)) throw new Error('source.completeness must be complete, partial, or unknown.');
  if (data.source.type === 'current_context' && data.source.completeness === 'complete') throw new Error('Current-context input cannot claim complete history.');
  if (!['full', 'summary'].includes(data.mode)) throw new Error('mode must be full or summary.');
  if (!['light', 'dark'].includes(data.theme)) throw new Error('theme must be light or dark.');
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 200) throw new Error('title must contain 1–200 characters.');
  if (data.generated_at !== undefined && (typeof data.generated_at !== 'string' || Number.isNaN(Date.parse(data.generated_at)))) throw new Error('generated_at must be an ISO 8601 string.');
  if (data.exporter !== undefined) {
    if (!data.exporter || typeof data.exporter !== 'object' || Array.isArray(data.exporter)) throw new Error('exporter must be an object.');
    for (const key of ['tool', 'model']) {
      if (data.exporter[key] !== undefined && (typeof data.exporter[key] !== 'string' || !data.exporter[key].trim() || data.exporter[key].length > 120)) throw new Error(`exporter.${key} must contain 1–120 characters.`);
    }
  }
  if (data.normalizationWarnings !== undefined && (!Array.isArray(data.normalizationWarnings) || data.normalizationWarnings.some((warning) => typeof warning !== 'string' || warning.length > 1000))) throw new Error('normalizationWarnings must be an array of short strings.');
  if (!Array.isArray(data.messages) || data.messages.length < 1 || data.messages.length > 5000) throw new Error('messages must contain 1–5000 items.');
  const ids = new Set();
  for (const [index, message] of data.messages.entries()) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error(`Message ${index + 1} must be an object.`);
    if (typeof message.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(message.id)) throw new Error(`Message ${index + 1} has an invalid ID.`);
    if (ids.has(message.id)) throw new Error(`Duplicate message ID: ${message.id}`);
    ids.add(message.id);
    if (!['user', 'assistant'].includes(message.role)) throw new Error(`Message ${message.id} has an unsupported role.`);
    if (!['markdown', 'text'].includes(message.format)) throw new Error(`Message ${message.id} has an unsupported format.`);
    if (typeof message.content !== 'string' || !message.content.trim() || message.content.length > 500000) throw new Error(`Message ${message.id} content must contain 1–500000 characters.`);
    if (message.timestamp !== undefined && (typeof message.timestamp !== 'string' || message.timestamp.length > 100)) throw new Error(`Message ${message.id} timestamp must contain at most 100 characters.`);
  }
}

function isExportCommand(content) {
  const text = content.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text || text.length > 300) return false;

  // Questions, how-tos, and discussions must stay visible in the image.
  const isDiscussion = /优点|缺点|原理|什么是|是什么|为什么|如何|怎么|有哪些|区别|是否可行|能不能|可以吗|可行吗|有必要|值得|对比|比较|\?|？|吗$|呢$|吧$|教我|教程|示例|例子|什么意思|告诉我|解释/i.test(text);
  if (isDiscussion) return false;

  // Unambiguous long-image / screenshot product nouns need no explicit action verb.
  if (/长图|long\s*image|截图|截屏|screenshot|screen\s*shot/i.test(text)) return true;

  // Image nouns that still require an explicit export / create action.
  const hasImage = /图片|海报|卡片图|poster|picture|image|图/i.test(text);
  const hasAction = /导出|生成|转换|转成|转为|做成|制作|输出|保存为|保存成|发给|发我|给(我)?\s*(一)?\s*(张|份|个)?|要(一)?(张|份|个)?|出|生|做|弄|来\s*(一)?\s*(张|份|个)?|produce|render|capture|export|generate|convert|create|make|save/i.test(text);
  if (hasImage && hasAction) return true;

  // Verb-glued image requests: 转图 / 出图 / 生图 / 做图 / 画图 / 来张图 ...
  if (/转图|出图|生图|做图|要图|作图|画图|成图|来[一]?张图|给图|截[一]?张图|导出图|生成图/i.test(text)) return true;

  return false;
}

function hideTrailingExportCommand(data) {
  const last = data.messages[data.messages.length - 1];
  if (!last || last.role !== 'user' || !isExportCommand(last.content)) return false;
  if (data.messages.length === 1) throw new Error('No conversation content remains after hiding the export command.');
  data.messages = data.messages.slice(0, -1);
  data.normalizationWarnings = [...(data.normalizationWarnings || []), '已自动隐藏最后一条导出长图指令。'];
  return true;
}

function executable(file) {
  if (!file) return false;
  try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
}

function findChrome(explicit) {
  const chrome = [explicit, process.env.CONVERSATION_TO_LONG_IMAGE_CHROME, ...chromeCandidates()].filter(Boolean).find(executable);
  if (!chrome) throw new Error('Chrome/Chromium/Edge was not found. Pass --chrome or set CONVERSATION_TO_LONG_IMAGE_CHROME.');
  return chrome;
}

function loadRuntime(runtimeRoot) {
  try {
    const runtimeRequire = createRequire(path.join(runtimeRoot, 'package.json'));
    return {
      chromium: runtimeRequire('playwright-core').chromium,
      MarkdownIt: runtimeRequire('markdown-it'),
      sanitizeHtml: runtimeRequire('sanitize-html'),
      hljs: runtimeRequire('highlight.js')
    };
  } catch (error) {
    throw new Error(`Rendering dependencies are unavailable at ${runtimeRoot}. Run ensure_deps.cjs --install. ${error.message}`);
  }
}

function sourceWarnings(data) {
  const warnings = [];
  if (data.source.type === 'current_context') warnings.push('来源为当前可见上下文，可能不完整，不代表完整历史对话。');
  if (data.source.completeness === 'partial') warnings.push('来源仅包含部分内容，未处理的消息不会出现在长图中。');
  if (data.source.type === 'file' && data.source.completeness === 'unknown') warnings.push('文件来源完整性未知，请核对原始记录。');
  if (data.mode === 'summary') warnings.push('摘要版：内容经压缩整理，非逐字原文。');
  return warnings;
}

function makeMarkdownRenderer(MarkdownIt, sanitizeHtml, hljs, options) {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    highlight(code, language) {
      if (language && hljs.getLanguage(language)) {
        try { return `<pre class="hljs"><code>${hljs.highlight(code, { language }).value}</code></pre>`; } catch { /* fall through */ }
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
    }
  });
  const defaultImage = md.renderer.rules.image || ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));

  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const originalSrc = String(token.attrGet('src') || '').trim();
    const label = token.content || '图片';
    const placeholder = (reason) => {
      options.warnings.push(`${options.messageId}: ${reason} (${originalSrc || 'empty URL'})`);
      return `<p class="image-placeholder">${escapeHtml(reason)}：${escapeHtml(originalSrc || label)}</p>`;
    };
    if (/^https?:\/\//i.test(originalSrc)) return placeholder('远程图片未加载');
    let localPath;
    try {
      if (/^file:/i.test(originalSrc)) localPath = fileURLToPath(originalSrc);
      else if (/^[a-z][a-z0-9+.-]*:/i.test(originalSrc)) return placeholder('不支持的图片协议');
      else localPath = path.resolve(options.baseDir, decodeURIComponent(originalSrc));
    } catch {
      return placeholder('图片路径无效');
    }
    const extension = path.extname(localPath).toLowerCase();
    if (!IMAGE_MIME[extension]) return placeholder('不支持的本地图片格式');
    try {
      const stat = fs.statSync(localPath);
      if (!stat.isFile()) return placeholder('本地图片不是普通文件');
      if (stat.size > options.maxImageBytes) return placeholder('本地图片超过单文件大小限制');
      if (options.totalImageBytes + stat.size > options.maxTotalImageBytes) return placeholder('本地图片超过总大小限制');
      const bytes = fs.readFileSync(localPath);
      options.totalImageBytes += stat.size;
      token.attrSet('src', `data:${IMAGE_MIME[extension]};base64,${bytes.toString('base64')}`);
      return defaultImage(tokens, idx, opts, env, self);
    } catch {
      return placeholder('本地图片读取失败');
    }
  };

  return (content) => sanitizeHtml(md.render(content), {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'del', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'span'],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      th: ['style'], td: ['style'],
      code: ['class'], pre: ['class'], span: ['class'], p: ['class']
    },
    allowedClasses: {
      code: [/^language-[A-Za-z0-9_-]+$/, 'hljs'],
      pre: ['hljs'],
      span: [/^hljs-[A-Za-z0-9_-]+$/],
      p: ['image-placeholder']
    },
    allowedStyles: {
      '*': { 'text-align': [/^(left|right|center)$/] }
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: { a: ['http', 'https', 'mailto'], img: ['data'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard'
  });
}

function buildHtml(data, css, template, runtime, args) {
  const imageWarnings = [];
  const imageState = { totalImageBytes: 0 };
  const messagesHtml = data.messages.map((message) => {
    let body;
    if (message.format === 'text') body = `<p>${escapeHtml(message.content).replace(/\r?\n/g, '<br>')}</p>`;
    else {
      const renderMarkdown = makeMarkdownRenderer(runtime.MarkdownIt, runtime.sanitizeHtml, runtime.hljs, {
        baseDir: path.dirname(args.input),
        messageId: message.id,
        warnings: imageWarnings,
        maxImageBytes: args.maxImageBytes,
        maxTotalImageBytes: args.maxTotalImageBytes,
        get totalImageBytes() { return imageState.totalImageBytes; },
        set totalImageBytes(value) { imageState.totalImageBytes = value; }
      });
      body = renderMarkdown(message.content);
    }
    const role = message.role === 'user' ? '用户' : 'AI 助手';
    const badge = message.role === 'assistant' ? '<span class="ai-badge">AI</span>' : '';
    const timestamp = message.timestamp ? `<span class="message-time">${escapeHtml(message.timestamp)}</span>` : '';
    return `<article class="message ${message.role}" data-message-id="${message.id}"><header class="message-header">${badge}<span class="message-role">${role}</span>${timestamp}</header><div class="message-content">${body}</div></article>`;
  }).join('\n');

  const warnings = [...sourceWarnings(data), ...(data.normalizationWarnings || [])];
  const tool = data.exporter && data.exporter.tool ? data.exporter.tool : (process.env.CONVERSATION_TO_LONG_IMAGE_TOOL || 'conversation-to-long-image');
  const model = data.exporter && data.exporter.model ? data.exporter.model : (process.env.CONVERSATION_TO_LONG_IMAGE_MODEL || '未指定模型');
  const sourceLabel = data.source.type === 'current_context'
    ? '当前可见对话'
    : (data.source.name || '聊天记录文件');
  const sourceHtml = `<span><strong>来源：</strong>${escapeHtml(sourceLabel)}</span><span><strong>导出工具：</strong>${escapeHtml(tool)}　<strong>模型：</strong>${escapeHtml(model)}</span>`;
  const replacements = {
    TITLE: escapeHtml(data.title),
    CSS: css,
    THEME_CLASS: data.theme === 'dark' ? 'dark' : 'light',
    SOURCE: sourceHtml,
    SUMMARY_NOTE: data.mode === 'summary' ? '摘要版 · 内容经压缩整理，非逐字原文' : '',
    PART_LABEL: '',
    MESSAGES: messagesHtml
  };
  let html = template;
  for (const [key, value] of Object.entries(replacements)) html = html.replaceAll(`{{${key}}}`, value);
  return { html, warnings: [...warnings, ...imageWarnings] };
}

async function measure(page) {
  return page.evaluate(() => {
    const articles = [...document.querySelectorAll('.message')].map((article, articleIndex) => {
      const content = article.querySelector('.message-content');
      const blocks = [...content.children].map((block, blockIndex) => {
        const id = `b${String(blockIndex + 1).padStart(3, '0')}`;
        block.dataset.blockId = id;
        const style = getComputedStyle(block);
        const outerHeight = block.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        return { id, height: Math.ceil(outerHeight) };
      });
      return {
        id: article.dataset.messageId || `m${articleIndex + 1}`,
        height: Math.ceil(article.getBoundingClientRect().height),
        extraHeight: Math.ceil(article.getBoundingClientRect().height - content.getBoundingClientRect().height),
        blocks
      };
    });
    const messages = document.querySelector('.messages');
    return {
      totalHeight: Math.ceil(document.documentElement.scrollHeight),
      fixedHeight: Math.ceil(document.documentElement.scrollHeight - messages.getBoundingClientRect().height + 90),
      articles
    };
  });
}

function createUnits(layout, maxHeight) {
  const budget = maxHeight - layout.fixedHeight;
  if (budget < 500) throw new Error('The configured height leaves insufficient space for message content.');
  const units = [];
  for (const article of layout.articles) {
    if (article.height <= budget) {
      units.push({ id: article.id, messageId: article.id, blockId: null, height: article.height });
      continue;
    }
    if (!article.blocks.length) throw new Error(`Message ${article.id} is too tall and has no splittable blocks.`);
    for (const block of article.blocks) {
      const height = article.extraHeight + block.height;
      if (height > budget) throw new Error(`Message ${article.id}, block ${block.id} exceeds the safe height even alone. Use summary mode or a larger --max-height.`);
      units.push({ id: `${article.id}::${block.id}`, messageId: article.id, blockId: block.id, height });
    }
  }
  return units;
}

function groupUnits(units, layout, maxHeight) {
  const available = maxHeight - layout.fixedHeight;
  const gap = 28;
  const groups = [];
  let current = [];
  let height = 0;
  for (const unit of units) {
    const addition = current.length ? gap + unit.height : unit.height;
    if (current.length && height + addition > available) {
      groups.push({ units: current, estimatedHeight: height });
      current = [];
      height = 0;
    }
    const nextAddition = current.length ? gap + unit.height : unit.height;
    current.push(unit);
    height += nextAddition;
  }
  if (current.length) groups.push({ units: current, estimatedHeight: height });
  return groups;
}

function verifyCoverage(units, groups) {
  const expected = units.map((unit) => unit.id);
  const actual = groups.flatMap((group) => group.units.map((unit) => unit.id));
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) throw new Error('Internal split coverage check failed: message blocks are missing, duplicated, or reordered.');
}

async function applyGroup(page, group, index, total) {
  await page.evaluate(({ units, partIndex, partTotal }) => {
    const selected = new Map();
    for (const unit of units) {
      if (!selected.has(unit.messageId)) selected.set(unit.messageId, []);
      selected.get(unit.messageId).push(unit.blockId);
    }
    for (const article of document.querySelectorAll('.message')) {
      const blocks = selected.get(article.dataset.messageId);
      article.hidden = !blocks;
      if (!blocks) continue;
      const selectsWholeMessage = blocks.includes(null);
      for (const [blockIndex, block] of [...article.querySelector('.message-content').children].entries()) {
        const id = `b${String(blockIndex + 1).padStart(3, '0')}`;
        block.hidden = !selectsWholeMessage && !blocks.includes(id);
      }
    }
    const label = document.getElementById('part-label');
    label.hidden = false;
    label.textContent = `第 ${partIndex}/${partTotal} 部分`;
  }, { units: group.units, partIndex: index + 1, partTotal: total });
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('Screenshot is not a valid PNG.');
  return { pixelWidth: buffer.readUInt32BE(16), pixelHeight: buffer.readUInt32BE(20) };
}

async function render() {
  const args = parseArgs(process.argv.slice(2));
  const data = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  validate(data);
  const originalMessageCount = data.messages.length;
  const hiddenExportCommand = hideTrailingExportCommand(data);
  const manifestPath = path.join(args.outputDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) throw new Error(`Output directory already contains manifest.json: ${args.outputDir}. Use a new output directory.`);
  fs.mkdirSync(args.outputDir, { recursive: true });

  const runtimeRoot = path.resolve(args.runtime || process.env.CONVERSATION_TO_LONG_IMAGE_RUNTIME || path.join(SKILL_ROOT, '.runtime'));
  const runtime = loadRuntime(runtimeRoot);
  const chrome = findChrome(args.chrome);
  const effectiveMaxHeight = Math.min(args.maxHeight, Math.floor(MAX_PIXEL_HEIGHT / args.scale));
  const template = fs.readFileSync(path.join(SKILL_ROOT, 'assets', 'template.html'), 'utf8');
  const css = fs.readFileSync(path.join(SKILL_ROOT, 'assets', 'conversation.css'), 'utf8');
  const { html, warnings } = buildHtml(data, css, template, runtime, args);
  const htmlPath = path.join(args.outputDir, 'conversation.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  const normalizedPath = path.join(args.outputDir, 'conversation.normalized.json');
  if (normalizedPath !== args.input) fs.writeFileSync(normalizedPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  let browser;
  try {
    browser = await runtime.chromium.launch({ executablePath: chrome, headless: true, args: ['--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: VIEWPORT_WIDTH, height: 900 }, deviceScaleFactor: args.scale });
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })));
    });
    const layout = await measure(page);
    let groups;
    if (layout.totalHeight <= effectiveMaxHeight) {
      groups = [{ units: layout.articles.map((article) => ({ id: article.id, messageId: article.id, blockId: null })) }];
    } else {
      const units = createUnits(layout, effectiveMaxHeight);
      groups = groupUnits(units, layout, effectiveMaxHeight);
      verifyCoverage(units, groups);
    }

    const parts = [];
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      if (groups.length > 1) await applyGroup(page, group, index, groups.length);
      const cssHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      if (cssHeight > effectiveMaxHeight + 2) throw new Error(`Rendered part ${index + 1} is ${cssHeight}px high, above the ${effectiveMaxHeight}px safety threshold. Use a lower --scale or summary mode.`);
      const filename = groups.length === 1 ? 'conversation.png' : `conversation-part-${String(index + 1).padStart(3, '0')}.png`;
      const outputPath = path.join(args.outputDir, filename);
      const buffer = await page.screenshot({ path: outputPath, type: 'png', fullPage: true });
      parts.push({ file: filename, cssHeight, ...pngSize(buffer), units: group.units.map((unit) => unit.id) });
    }

    const manifest = {
      ok: true,
      schema_version: 1,
      title: data.title,
      source: data.source,
      mode: data.mode,
      theme: data.theme,
      scale: args.scale,
      maxHeight: effectiveMaxHeight,
      html: 'conversation.html',
      normalizedJson: 'conversation.normalized.json',
      originalMessageCount,
      hiddenExportCommand,
      messageCount: data.messages.length,
      partCount: parts.length,
      parts,
      warnings
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    if (browser) await browser.close();
  }
}

render().catch((error) => {
  console.error(`Rendering failed: ${error.message}`);
  if (process.env.CONVERSATION_TO_LONG_IMAGE_DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
