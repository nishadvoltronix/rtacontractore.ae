import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localArtifacts } from './qa-local-safety.mjs';

// One reproducible local-only run. Public audit:discovery is deliberately absent.
// Existing dependencies and executables are required; nothing is installed.
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--nginx', '--openssl', '--chrome', '--output'].includes(key) || !process.argv[i + 1] || options[key.slice(2)]) {
    throw Error('Usage: node website/scripts/qa-local.mjs --nginx PATH --openssl PATH [--chrome PATH] [--output artifacts/NEW-DIRECTORY]');
  }
  options[key.slice(2)] = process.argv[i + 1];
}
if (!options.nginx || !options.openssl) throw Error('Existing --nginx and --openssl executables are required for the complete suite. Nothing is downloaded.');
const nginx = path.resolve(root, options.nginx);
const openssl = path.resolve(root, options.openssl);
const chrome = options.chrome || process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await Promise.all([nginx, openssl, chrome].map(file => access(file)));
const output = await localArtifacts(root, options.output, `artifacts/local-verification/${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${process.pid}`);
await mkdir(path.dirname(output), { recursive: true });
// Exclusive creation prevents overwriting previous evidence.
await mkdir(output);
const summary = {
  startedAt: new Date().toISOString(), status: 'RUNNING', steps: [],
  scope: 'Local build, syntax, unit, static, HTTP, browser, scroll, interaction and real Nginx tests. No public diagnostic or production connection.',
  unavailableChecks: { lint: 'NOT CONFIGURED: no lint command or configuration', types: 'NOT CONFIGURED: plain JavaScript project, no TypeScript configuration' },
};
let preview;
let previewClosed;
let previewLog = '';

async function run(name, args, env = {}) {
  const entry = { name, command: [process.execPath, ...args], startedAt: new Date().toISOString(), log: `${name}.log` };
  summary.steps.push(entry);
  console.log(`Running ${name}...`);
  let outputText = '';
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const capture = chunk => { outputText += chunk.toString(); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  try {
    entry.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => { entry.signal = signal; resolve(code); });
    });
  } catch (error) {
    entry.error = error.message;
    entry.exitCode = null;
  } finally {
    entry.finishedAt = new Date().toISOString();
    entry.status = entry.exitCode === 0 ? 'PASS' : 'FAIL';
    await writeFile(path.join(output, entry.log), outputText);
    await writeFile(path.join(output, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  }
  console.log(`${entry.status}: ${name}`);
  if (entry.status !== 'PASS') throw Error(`${name} failed; inspect ${path.join(output, entry.log)}`);
}

async function modules(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['dist', 'reports'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await modules(file));
    else if (/\.(?:mjs|js)$/.test(file)) files.push(file);
  }
  return files.sort();
}

async function startPreview() {
  preview = spawn(process.execPath, ['website/scripts/serve.mjs'], {
    cwd: root, env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  previewClosed = new Promise(resolve => preview.once('close', resolve));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Isolated preview startup timed out')), 15000);
    preview.once('error', error => { clearTimeout(timer); reject(error); });
    preview.once('exit', code => { clearTimeout(timer); reject(Error(`Isolated preview exited ${code}`)); });
    preview.stderr.on('data', chunk => { previewLog += chunk.toString(); });
    preview.stdout.on('data', chunk => {
      previewLog += chunk.toString();
      const match = previewLog.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
}

try {
  await run('build', ['website/scripts/build.mjs']);
  await run('static', ['website/scripts/check.mjs']);
  const sourceModules = await modules(path.join(root, 'website'));
  const clients = (await readdir(path.join(root, 'website/dist/assets'))).filter(file => file.endsWith('.js')).map(file => path.join(root, 'website/dist/assets', file));
  for (const [index, file] of [...sourceModules, ...clients].entries()) await run(`syntax-${index + 1}`, ['--check', path.relative(root, file)]);
  summary.syntaxModules = [...sourceModules, ...clients].map(file => path.relative(root, file));
  const unitTests = (await readdir(path.join(root, 'website/scripts'))).filter(file => file.endsWith('.test.mjs')).sort().map(file => `website/scripts/${file}`);
  if (!unitTests.length) throw Error('No unit tests discovered');
  await run('unit', ['--test', ...unitTests], { QA_CHROME_PATH: chrome });
  await run('http', ['website/scripts/qa-http.mjs']);
  const baseURL = await startPreview();
  summary.previewOrigin = baseURL;
  for (const [name, file] of [['browser', 'qa.mjs'], ['scroll', 'qa-works-scroll.mjs'], ['interaction', 'qa-primary.mjs']]) {
    await run(name, [`website/scripts/${file}`], { QA_BASE_URL: baseURL, QA_CHROME_PATH: chrome, QA_ARTIFACTS_DIR: path.join(output, name) });
  }
  await run('nginx', ['website/scripts/qa-redirects.mjs', '--nginx', nginx, '--openssl', openssl, '--output', path.join(output, 'nginx')]);
  summary.nginxCounts = JSON.parse(await readFile(path.join(output, 'nginx/results.json'), 'utf8')).counts;
  summary.status = 'PASS';
} catch (error) {
  summary.status = 'FAIL';
  summary.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (preview && preview.exitCode === null && !preview.killed) preview.kill();
  if (previewClosed) await previewClosed;
  summary.previewStopped = !preview || preview.exitCode !== null || preview.signalCode !== null;
  summary.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'preview.log'), previewLog);
  await writeFile(path.join(output, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`${summary.status}: local verification report ${path.join(output, 'results.json')}`);
}
