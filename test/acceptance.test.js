import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRun, runTemplate, ENGINE_DIR } from '../src/index.js';
import { parseCost } from '../src/shape.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const tmp = () => mkdtempSync(path.join(tmpdir(), 'newsletter-'));
const ENGINE_STDOUT = '\u001b[90m   Total: 41s · 12 model calls · $0.0213\u001b[0m\n';
const SAMPLE = '# Markets this week\n\n## What moved\n- **BTC** up 4 percent ([CoinGecko](https://www.coingecko.com/en/coins/bitcoin))\n\n## Sources\n- https://www.coingecko.com/en/coins/bitcoin\n';
// a fake engine: writes into the --out-dir it was given, like npx @kognai/build does
const fakeEngine = (files = { 'newsletter.md': SAMPLE }, result = { code: 0, stdout: ENGINE_STDOUT, stderr: '' }) => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    const dir = args[args.indexOf('--out-dir') + 1];
    for (const [n, t] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, n)), { recursive: true }); writeFileSync(path.join(dir, n), t); }
    return result;
  };
  return { exec, calls };
};

test("A1 kognai-template.json has the engine template fields and a cost per run", async () => {
  const t = JSON.parse(read('kognai-template.json'));
  assert.match(t.id, /^[a-z0-9-]+$/);
  assert.equal(typeof t.name, 'string');
  assert.ok(Array.isArray(t.intent) && t.intent.length && t.intent.every((x) => typeof x === 'string'));
  assert.equal(typeof t.default_profile.primary, 'string');
  assert.ok(Array.isArray(t.default_profile.secondary));
  assert.ok(Array.isArray(t.composition.roles) && t.composition.roles.length);
  for (const r of t.composition.roles) { assert.equal(typeof r.role, 'string'); assert.ok(Number.isInteger(r.count) && r.count > 0); }
  assert.equal(typeof t.workflow, 'string');
  for (const k of ['skills', 'tools']) assert.ok(Array.isArray(t[k]) && t[k].every((x) => typeof x === 'string'));
  for (const k of ['cloud_usd', 'sovereign_usd', 'measured_on', 'runs']) assert.ok(k in t.cost_per_run, `cost_per_run.${k}`);
  assert.equal(t.cost_per_run.sovereign_usd, 0);
  // same keys as the engine's STARTER_TEMPLATES when the engine is installed
  const engine = path.join(ROOT, 'node_modules/@kognai/build/dist/templates/index.js');
  if (existsSync(engine)) {
    const { createRequire } = await import('node:module');
    const st = createRequire(import.meta.url)(engine).STARTER_TEMPLATES[0];
    for (const k of Object.keys(st)) assert.ok(k in t, `engine field ${k}`);
  }
});

test('A1 cost per run measured on a real cloud and sovereign run', { todo: 'M2: measured on a real run' }, () => {
  const c = JSON.parse(read('kognai-template.json')).cost_per_run;
  assert.ok(c.runs >= 1 && typeof c.cloud_usd === 'number' && c.measured_on);
});

test('A2 planRun turns an input into @kognai/build arguments with the output directory, sovereign when asked, and no secret', () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-should-never-appear';
  const { args } = planRun({ brief: 'BTC and ETH this week for beginners', assets: ['BTC', 'ETH'], horizon: 'week' }, '/tmp/out');
  assert.equal(args[0], '--goal');
  assert.match(args[1], /BTC and ETH this week for beginners/);
  assert.match(args[1], /Cover these assets: BTC, ETH/);
  assert.equal(args[args.indexOf('--out-dir') + 1], path.join('/tmp/out', ENGINE_DIR));
  assert.ok(!args.includes('--sovereign'));
  assert.ok(planRun({ brief: 'x', sovereign: true }, '/o').args.includes('--sovereign'));
  assert.ok(!planRun({ brief: 'x', sovereign: false }, '/o').args.includes('--sovereign'));
  const all = JSON.stringify([args, planRun({ brief: 'x', sovereign: true }, '/o').args]);
  assert.doesNotMatch(all, /sk-test|api[_-]?key|token|secret/i);
  assert.doesNotMatch(all, /--key|--api/);
  for (const bad of [null, {}, { brief: '' }, { brief: 'x', sovereign: 'yes' }, { brief: 'x', horizon: 'year' }]) assert.throws(() => planRun(bad, '/o'));
  assert.throws(() => planRun({ brief: 'x' }, ''));
  delete process.env.ANTHROPIC_API_KEY;
});

test('A3 runTemplate runs the engine through exec, shapes its output into the product files and returns them with the cost', async () => {
  const outDir = tmp();
  const { exec, calls } = fakeEngine();
  const r = await runTemplate({ brief: 'crypto this week' }, { outDir, exec });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], planRun({ brief: 'crypto this week' }, outDir).args);
  assert.equal(r.outDir, outDir);
  assert.deepEqual(r.files.map((f) => path.basename(f)), ['newsletter.md', 'newsletter.html', 'sources.json']);
  for (const f of r.files) assert.ok(existsSync(f));
  assert.equal(readFileSync(r.files[0], 'utf8'), SAMPLE);
  const html = readFileSync(r.files[1], 'utf8');
  assert.match(html, /<h1>Markets this week<\/h1>/);
  assert.match(html, /<strong>BTC<\/strong>/);
  assert.deepEqual(JSON.parse(readFileSync(r.files[2], 'utf8')), { title: 'Markets this week', sources: ['https://www.coingecko.com/en/coins/bitcoin'] });
  assert.equal(r.cost_usd, 0.0213);
  // sovereign: cost 0 even if the engine prints one; a differently named file is still picked up
  const s = await runTemplate({ brief: 'x', sovereign: true }, { outDir: tmp(), exec: fakeEngine({ 'docs/brief.md': SAMPLE }).exec });
  assert.equal(s.cost_usd, 0);
  assert.equal(parseCost('no footer'), null);
});

test('A4 an engine failure or an empty output is rejected with a plain reason', async () => {
  await assert.rejects(runTemplate({ brief: 'x' }, { outDir: tmp(), exec: fakeEngine({}, { code: 1, stdout: '', stderr: 'router: no model available' }).exec }), /the engine failed \(exit code 1\): router: no model available/);
  await assert.rejects(runTemplate({ brief: 'x' }, { outDir: tmp(), exec: fakeEngine({}).exec }), /the engine wrote nothing/);
  await assert.rejects(runTemplate({ brief: 'x' }, { outDir: tmp(), exec: fakeEngine({ 'newsletter.md': '   \n' }).exec }), /the engine wrote nothing/);
  await assert.rejects(runTemplate({ brief: 'x' }, { outDir: tmp(), exec: async () => { throw new Error('spawn npx ENOENT'); } }), /could not start: spawn npx ENOENT/);
  await assert.rejects(runTemplate({ brief: 'x' }, { outDir: tmp(), exec: async () => undefined }), /the engine failed/);
});

test('A5 builds and runs from a clean machine: a lockfile, no install script, tests need no network', () => {
  assert.ok(existsSync(path.join(ROOT, 'package-lock.json')), 'lockfile committed');
  const pkg = JSON.parse(read('package.json'));
  for (const k of ['preinstall', 'install', 'postinstall', 'prepare']) assert.ok(!pkg.scripts?.[k], `no ${k} script`);
  assert.equal(pkg.scripts.test, 'node --test test/*.test.js');
  assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'no runtime dependency to install');
  assert.match(pkg.engines.node, />=20/);
});

test('A6 the README states what it makes, how to run it on the cloud and sovereign, and the cost per run', () => {
  const r = read('README.md');
  for (const s of ['What it makes', 'Install', 'Run on the cloud', 'Run sovereign', 'Cost per run']) assert.match(r, new RegExp(`## ${s}`));
  assert.match(r, /--sovereign/);
  assert.doesNotMatch(r, /[\u2012-\u2015]/, 'no long dashes');
});

test('A6 a sample output from a real run is committed under examples/', { todo: 'M2: real run sample' }, () => {
  assert.ok(readdirSync(path.join(ROOT, 'examples')).some((f) => f.endsWith('.md')));
});
