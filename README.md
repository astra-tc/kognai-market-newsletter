# kognai-market-newsletter

A product template on the Kognai engine (`npx @kognai/build`): it turns a reader's brief into a market newsletter.

Built by an AI agent (Astra Trading Co, LAX offer `lax-ext-87b6301d83cf`) for the LAX job "A product template on @kognai/build" (9db27a4d). MIT licensed.

## What it makes

From a brief such as "BTC and ETH this week for beginners" it asks the engine for a 400 to 700 word newsletter with the sections Headline, What moved, Why it matters, What to watch and Sources, then shapes what the engine wrote into three product files: `newsletter.md`, `newsletter.html` (a clean, phone friendly page) and `sources.json` (title and every source link). No investment advice, every number sourced.

## Install

Node 20 or later. No runtime dependency: the engine runs through `npx @kognai/build` (0.7 or later).

```sh
git clone https://github.com/astra-tc/kognai-market-newsletter && cd kognai-market-newsletter
npm ci && npm test
```

## Use

```js
import { planRun, runTemplate } from 'kognai-market-newsletter';

planRun({ brief: 'BTC and ETH this week', assets: ['BTC', 'ETH'] }, './out');
// { args: ['--goal', 'Write a market newsletter for the last week. ...', '--out-dir', 'out/engine'] }

const r = await runTemplate({ brief: 'BTC and ETH this week', horizon: 'week' }, { outDir: './out' });
// { outDir: './out', files: ['out/newsletter.md', 'out/newsletter.html', 'out/sources.json'], cost_usd: 0.0213 }
```

Input: `brief` (required), `sovereign` (true or false), and the optional `assets` (list of names), `horizon` (day, week or month) and `tone`. `exec(args)` can be injected (the tests pass a fake engine); by default it runs `npx @kognai/build`. The engine writes into `outDir/engine`; `runTemplate` takes `newsletter.md` from there (else the largest Markdown file), reads the cost from the engine's `Total: ... $0.0000` footer, and rejects with a plain reason when the engine exits non zero, cannot start or writes nothing. Keys are never passed as arguments: the engine reads its own from the environment.

## Run on the cloud

```sh
npx @kognai/build --goal "$(node -e "import('./src/goal.js').then(m=>console.log(m.buildGoal({brief:'BTC and ETH this week'})))")" --out-dir out/engine
```

or call `runTemplate(input, { outDir })` as above.

## Run sovereign

Pass `sovereign: true` (the engine gets `--sovereign` and runs on local models); `cost_usd` is then 0.

## Cost per run

`kognai-template.json` holds `cost_per_run` `{cloud_usd, sovereign_usd, measured_on, runs}`. Sovereign is 0. The cloud figure is filled from a real measured run in M2, with the sample output committed under `examples/`.

## Tests

`npm test`, node:test, no network. A1 template fields (and the engine's own fields when installed), A2 arguments and no secret, A3 engine run through exec shaped into the 3 product files with the cost, A4 failures and empty output rejected with plain reasons, A5 lockfile and no install script, A6 README. The measured cost and the real run sample are todo until M2.
