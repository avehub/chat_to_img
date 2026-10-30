#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!['--input', '--output', '--title', '--theme', '--mode', '--model'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
    if (!argv[i + 1]) throw new Error(`${arg} requires a value`);
    result[arg.slice(2)] = argv[++i];
  }
  if (!result.input || !result.output) throw new Error('Usage: normalize.cjs --input <file> --output <normalized.json> [--title <title>] [--theme light|dark] [--mode full] [--model <model-id>]');
  if (result.theme && !['light', 'dark'].includes(result.theme)) throw new Error('--theme must be light or dark');
  if (result.mode && result.mode !== 'full') throw new Error('Deterministic normalization supports only --mode full; create summarized normalized JSON through the model workflow.');
  return result;
}

function roleName(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'user' || role === '用户') return 'user';
  if (role === 'assistant' || role === '助手') return 'assistant';
  return null;
}

function normalizeMessages(rawMessages, warnings) {
  if (!Array.isArray(rawMessages)) throw new Error('JSON must be a message array or an object containing messages.');
  const messages = [];
  for (const [index, raw] of rawMessages.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      warnings.push(`Omitted item ${index + 1}: not an object.`);
      continue;
    }
    const role = roleName(raw.role);
    if (!role) {
      warnings.push(`Omitted item ${index + 1}: unsupported role ${JSON.stringify(raw.role)}.`);
      continue;
    }
    if (typeof raw.content !== 'string' || !raw.content.trim()) {
      warnings.push(`Omitted item ${index + 1}: empty or non-string content.`);
      continue;
    }
    const format = raw.format === undefined ? 'markdown' : raw.format;
    if (!['markdown', 'text'].includes(format)) throw new Error(`Message ${index + 1} has invalid format.`);
    messages.push({
      id: raw.id === undefined ? `m${String(messages.length + 1).padStart(3, '0')}` : String(raw.id),
      role,
      format,
      content: raw.content.replace(/^\s*\n|\n\s*$/g, ''),
      ...(raw.timestamp === undefined ? {} : { timestamp: String(raw.timestamp) })
    });
  }
  if (!messages.length) throw new Error('No user or assistant messages remain after normalization.');
  return messages;
}

function parseTranscript(text, format, warnings) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const labels = 'User|Assistant|System|Developer|Tool|用户|助手|系统|开发者|工具';
  const heading = new RegExp(`^\\s{0,3}#{1,6}\\s+(${labels})\\s*#*\\s*$`, 'i');
  const prefix = new RegExp(`^\\s*(${labels})\\s*[:：]\\s*(.*)$`, 'i');
  const messages = [];
  let current = null;
  let sawMarker = false;
  let skippingExcluded = false;
  let fence = null;

  function flush() {
    if (!current) return;
    const content = current.lines.join('\n').replace(/^\s*\n|\n\s*$/g, '');
    if (content) messages.push({ role: current.role, format, content });
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (current) current.lines.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length && /^\s{0,3}(`{3,}|~{3,})\s*$/.test(line)) fence = null;
      continue;
    }
    if (fenceMatch && (current || skippingExcluded)) {
      if (current) current.lines.push(line);
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }

    const match = line.match(heading) || line.match(prefix);
    if (match) {
      sawMarker = true;
      flush();
      const role = roleName(match[1]);
      skippingExcluded = !role;
      current = role ? { role, lines: [] } : null;
      if (!role) warnings.push(`Omitted ${match[1]} transcript block.`);
      if (current && match[2] && match[2].trim()) current.lines.push(match[2]);
    } else if (current) current.lines.push(line);
    else if (skippingExcluded) continue;
    else if (line.trim()) throw new Error('Transcript contains content before the first role marker; clarify the role structure.');
  }
  flush();
  if (!sawMarker) throw new Error('No User/Assistant/用户/助手 role markers found; clarify the transcript format.');
  if (!messages.length) throw new Error('Role markers were found but all messages are empty.');
  return messages;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.input);
  const output = path.resolve(args.output);
  const extension = path.extname(input).toLowerCase();
  const text = fs.readFileSync(input, 'utf8');
  const warnings = [];
  let data;

  if (extension === '.json') {
    const parsed = JSON.parse(text);
    const source = Array.isArray(parsed) ? { messages: parsed } : parsed;
    if (!source || typeof source !== 'object') throw new Error('JSON root must be an object or array.');
    data = {
      schema_version: 1,
      source: {
        type: 'file',
        name: source.source && typeof source.source.name === 'string' ? source.source.name : path.basename(input),
        completeness: source.source && ['complete', 'partial', 'unknown'].includes(source.source.completeness) ? source.source.completeness : 'complete'
      },
      mode: source.mode || 'full',
      theme: args.theme || source.theme || 'light',
      title: args.title || source.title || path.basename(input),
      generated_at: source.generated_at || new Date().toISOString(),
      exporter: {
        tool: source.exporter && typeof source.exporter.tool === 'string' ? source.exporter.tool : 'conversation-to-long-image',
        model: args.model || (source.exporter && typeof source.exporter.model === 'string' ? source.exporter.model : process.env.CONVERSATION_TO_LONG_IMAGE_MODEL || '未指定模型')
      },
      messages: normalizeMessages(source.messages, warnings)
    };
  } else if (['.md', '.markdown', '.txt'].includes(extension)) {
    const format = extension === '.txt' ? 'text' : 'markdown';
    data = {
      schema_version: 1,
      source: { type: 'file', name: path.basename(input), completeness: 'complete' },
      mode: 'full',
      theme: args.theme || 'light',
      title: args.title || path.basename(input),
      generated_at: new Date().toISOString(),
      exporter: {
        tool: 'conversation-to-long-image',
        model: args.model || process.env.CONVERSATION_TO_LONG_IMAGE_MODEL || '未指定模型'
      },
      messages: normalizeMessages(parseTranscript(text, format, warnings), warnings)
    };
  } else throw new Error('Unsupported input extension. Use .json, .md, .markdown, or .txt.');

  data.normalizationWarnings = warnings;
  if (!['full', 'summary'].includes(data.mode)) throw new Error('mode must be full or summary.');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, output, messages: data.messages.length, warnings }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`Normalization failed: ${error.message}`);
  process.exitCode = 1;
}
