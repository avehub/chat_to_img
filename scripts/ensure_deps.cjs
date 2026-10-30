#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REQUIRED = ['playwright-core', 'markdown-it', 'sanitize-html', 'highlight.js'];

// Cross-platform Chrome/Chromium/Edge discovery. No browser is downloaded.
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
  const result = { install: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--install') result.install = true;
    else if (arg === '--json') result.json = true;
    else if (['--runtime', '--npm', '--chrome'].includes(arg)) {
      if (!argv[i + 1]) throw new Error(`${arg} requires a value`);
      result[arg.slice(2)] = path.resolve(argv[++i]);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function executable(file) {
  if (!file) return false;
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findChrome(explicit) {
  const candidates = [explicit, process.env.CONVERSATION_TO_LONG_IMAGE_CHROME, ...chromeCandidates()].filter(Boolean);
  return candidates.find(executable) || null;
}

function defaultRuntime() {
  if (process.env.CONVERSATION_TO_LONG_IMAGE_RUNTIME) return process.env.CONVERSATION_TO_LONG_IMAGE_RUNTIME;
  // Self-contained runtime inside the skill folder keeps the skill portable
  // across agents and operating systems without depending on a host-specific path.
  return path.join(SKILL_ROOT, '.runtime');
}

function getStatus(runtime, chrome) {
  const runtimePackage = path.join(runtime, 'package.json');
  let modules = {};
  if (fs.existsSync(runtimePackage)) {
    const runtimeRequire = createRequire(runtimePackage);
    for (const name of REQUIRED) {
      try {
        runtimeRequire.resolve(name);
        modules[name] = true;
      } catch {
        modules[name] = false;
      }
    }
  } else {
    modules = Object.fromEntries(REQUIRED.map((name) => [name, false]));
  }
  return {
    ok: Object.values(modules).every(Boolean) && Boolean(chrome),
    runtime,
    runtimeLockfile: fs.existsSync(path.join(runtime, 'package-lock.json')),
    modules,
    chrome: chrome || null
  };
}

function install(runtime, npm) {
  if (npm !== 'npm' && !executable(npm)) throw new Error(`npm is not executable: ${npm}. Override with --npm.`);
  for (const name of ['package.json', 'package-lock.json']) {
    const source = path.join(SKILL_ROOT, name);
    if (!fs.existsSync(source)) throw new Error(`Missing ${source}; reinstall or repair the Skill package.`);
  }
  fs.mkdirSync(runtime, { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(SKILL_ROOT, name), path.join(runtime, name));
  }
  const result = spawnSync(npm, ['--prefix', runtime, 'ci', '--no-audit', '--no-fund'], {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ci failed with exit code ${result.status}`);
}

function resolveNpm(explicit) {
  if (explicit) return explicit;
  if (process.env.CONVERSATION_TO_LONG_IMAGE_NPM) return process.env.CONVERSATION_TO_LONG_IMAGE_NPM;
  // Prefer the npm shipped next to the Node runtime executing this script,
  // so the Skill stays portable across machines and managed runtimes.
  const dir = path.dirname(process.execPath);
  const candidates = process.platform === 'win32'
    ? [path.join(dir, 'npm.cmd'), path.join(dir, 'npm')]
    : [path.join(dir, 'npm')];
  return candidates.find(executable) || 'npm';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = path.resolve(args.runtime || defaultRuntime());
  const npm = resolveNpm(args.npm);
  if (args.install) install(runtime, npm);
  const status = getStatus(runtime, findChrome(args.chrome));
  if (args.json) console.log(JSON.stringify(status, null, 2));
  else {
    console.log(`Runtime: ${status.runtime}`);
    for (const [name, ok] of Object.entries(status.modules)) console.log(`${ok ? 'OK' : 'MISSING'} ${name}`);
    console.log(`Chrome: ${status.chrome || 'NOT FOUND'}`);
    if (!status.ok) console.log('Run ensure_deps.cjs --install after authorizing dependency installation; set --chrome if needed.');
  }
  process.exitCode = status.ok ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(`Dependency setup failed: ${error.message}`);
  process.exitCode = 2;
}
