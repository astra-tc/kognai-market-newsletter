// Market newsletter template on @kognai/build: planRun builds the engine arguments,
// runTemplate runs the engine (through an injected exec) and shapes its output.
import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildGoal, validateInput } from './goal.js';
import { pickMarkdown, extractSources, toHtml, parseCost } from './shape.js';

export const ENGINE_DIR = 'engine';

export function planRun(input, outDir) {
  validateInput(input);
  if (typeof outDir !== 'string' || !outDir) throw new TypeError('outDir must be a path');
  const args = ['--goal', buildGoal(input), '--out-dir', path.join(outDir, ENGINE_DIR)];
  if (input.sovereign === true) args.push('--sovereign');
  return { args };
}

export function defaultExec(args) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['--yes', '@kognai/build@^0.7', ...args], { env: process.env });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', (e) => resolve({ code: 127, stdout, stderr: stderr + String(e.message) }));
    p.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function walk(dir, base = dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else if ((await stat(full)).size < 2_000_000) out.push({ name: path.relative(base, full), text: await readFile(full, 'utf8') });
  }
  return out;
}

export async function runTemplate(input, { outDir, exec = defaultExec } = {}) {
  const { args } = planRun(input, outDir);
  const engineDir = args[args.indexOf('--out-dir') + 1];
  await mkdir(engineDir, { recursive: true });
  let r;
  try { r = await exec(args); } catch (e) { throw new Error(`the engine could not start: ${e?.message ?? e}`); }
  if (!r || r.code !== 0) {
    const why = String(r?.stderr || r?.stdout || '').trim().split('\n').pop()?.slice(0, 200) || 'no output';
    throw new Error(`the engine failed (exit code ${r?.code ?? 'unknown'}): ${why}`);
  }
  const written = await walk(engineDir);
  const md = pickMarkdown(written);
  if (!md) throw new Error('the engine wrote nothing into its output directory');
  const sources = extractSources(md);
  const title = (md.match(/^# (.+)$/m) || [])[1]?.trim() || 'Market newsletter';
  const files = [path.join(outDir, 'newsletter.md'), path.join(outDir, 'newsletter.html'), path.join(outDir, 'sources.json')];
  await writeFile(files[0], md.endsWith('\n') ? md : md + '\n');
  await writeFile(files[1], toHtml(md, title));
  await writeFile(files[2], JSON.stringify({ title, sources }, null, 2) + '\n');
  const cost = input.sovereign === true ? 0 : (parseCost(r.stdout) ?? 0);
  return { outDir, files, cost_usd: cost };
}
