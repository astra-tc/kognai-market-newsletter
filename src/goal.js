// Pure rules: turn a user's input into the engine goal text. No I/O.
export const SECTIONS = ['Headline', 'What moved', 'Why it matters', 'What to watch', 'Sources'];

export function validateInput(input) {
  if (!input || typeof input !== 'object') throw new TypeError('input must be an object with a brief');
  if (typeof input.brief !== 'string' || !input.brief.trim()) throw new TypeError('input.brief must be a non empty string');
  if (input.brief.length > 2000) throw new RangeError('input.brief is longer than 2000 characters');
  if (input.sovereign !== undefined && typeof input.sovereign !== 'boolean') throw new TypeError('input.sovereign must be true or false');
  if (input.assets !== undefined && !(Array.isArray(input.assets) && input.assets.every((a) => typeof a === 'string'))) throw new TypeError('input.assets must be a list of names');
  if (input.horizon !== undefined && !['day', 'week', 'month'].includes(input.horizon)) throw new RangeError('input.horizon must be day, week or month');
}

const clean = (s) => s.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();

export function buildGoal(input) {
  validateInput(input);
  const horizon = input.horizon ?? 'week';
  const tone = clean(input.tone ?? 'plain and neutral');
  const assets = (input.assets ?? []).map(clean).filter(Boolean);
  return [
    `Write a market newsletter for the last ${horizon}.`,
    `Brief from the reader: ${clean(input.brief)}`,
    assets.length ? `Cover these assets: ${assets.join(', ')}.` : 'Pick the 3 to 5 assets that moved most.',
    `Tone: ${tone}. Length: 400 to 700 words. Write newsletter.md in Markdown with the sections ${SECTIONS.join(', ')}.`,
    'Every number must come with its source in the Sources section. No investment advice. Latin digits only, no long dashes.',
  ].join(' ');
}
