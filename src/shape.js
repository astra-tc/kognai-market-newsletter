// Pure rules: shape what the engine wrote into the product files.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function pickMarkdown(files) {
  // files: [{ name, text }], the engine output. Prefer newsletter.md, else the largest .md, else the largest text file.
  const md = files.filter((f) => f.name.toLowerCase().endsWith('.md') && f.text.trim());
  const exact = md.find((f) => f.name.split('/').pop().toLowerCase() === 'newsletter.md');
  if (exact) return exact.text;
  const pool = md.length ? md : files.filter((f) => f.text.trim());
  return pool.sort((a, b) => b.text.length - a.text.length)[0]?.text ?? null;
}

export function extractSources(md) {
  const urls = [...md.matchAll(/https?:\/\/[^\s)\]>"']+/g)].map((m) => m[0].replace(/[.,;]+$/, ''));
  return [...new Set(urls)];
}

export function toHtml(md, title = 'Market newsletter') {
  const lines = md.split('\n');
  const out = [];
  let list = false;
  for (const raw of lines) {
    const l = raw.trimEnd();
    const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
    if (/^[-*] /.test(l)) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(l.slice(2))}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    const h = l.match(/^(#{1,3}) (.*)$/);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  if (list) out.push('</ul>');
  return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>\n<body>\n${out.join('\n')}\n</body>\n</html>\n`;
}

export function parseCost(stdout) {
  // the engine footer: "Total: 41s · 12 model calls · $0.0123"
  const plain = String(stdout ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  const m = plain.match(/Total:[^\n]*\$(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
