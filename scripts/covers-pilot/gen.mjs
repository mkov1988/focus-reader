// Cover lab: code-drawn cozy covers, one per mood, using Focus Reader's palette + fonts.
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const W = 530, H = 795;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const FONTS = ['Fraunces-400.ttf', 'Fraunces-600.ttf', 'Fraunces-Italic.ttf', 'Inter-600.ttf']
  .map(f => path.join(DIR, 'fonts', f));

// App palette
const P = {
  espresso: '#3A2A1E', mocha: '#6B5544', cream: '#FBF5EA', beige: '#EADBC4',
  mustard: '#D49A3F', sage: '#7E8F6E', terracotta: '#C2674B',
  paper: '#FCFAF4', page: '#FBF7EE', deep: '#241812', deepwarm: '#2B1C12',
  // wider (still muted + cozy) range
  night: '#232B36', dustblue: '#6E86A8', slate: '#44576B',
  plum: '#4A2B38', berry: '#94464F', rose: '#E3AC94', blush: '#F5E4D7',
  pine: '#3E5243', fern: '#5F7A5A',
};

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- text fitting ----------
function charW(c, size) {
  if ('iljt.,;:\'’!|'.includes(c)) return 0.30 * size;
  if ('frs'.includes(c)) return 0.42 * size;
  if ('mwMW'.includes(c)) return 0.88 * size;
  if (c === ' ') return 0.26 * size;
  if (c >= 'A' && c <= 'Z') return 0.70 * size;
  return 0.54 * size;
}
const textW = (s, size) => [...s].reduce((a, c) => a + charW(c, size), 0);

function wrap(title, maxW, size) {
  const words = title.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textW(t, size) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fitTitle(title, maxW, startSize, maxLines) {
  for (let size = startSize; size >= 30; size -= 2) {
    const lines = wrap(title, maxW, size);
    if (lines.length <= maxLines && lines.every(l => textW(l, size) <= maxW)) return { lines, size };
  }
  const size = 30;
  return { lines: wrap(title, maxW, size).slice(0, maxLines), size };
}

// title cleanup: drop subtitles, tidy
function displayTitle(t) {
  let s = t.split(';')[0].split(':')[0].split('—')[0].replace(/,\s*Volume \d+\s*$/i, '').trim();
  s = s.replace(/^The strange case of/i, 'The Strange Case of');
  // title-case-ish: capitalize significant words if the source is sentence case
  const minor = new Set(['a','an','the','and','or','of','in','on','to','with','for','at','by','from']);
  s = s.split(' ').map((w, i) => {
    if (w.length === 0) return w;
    if (i > 0 && minor.has(w.toLowerCase())) return w.toLowerCase();
    return w[0].toUpperCase() + w.slice(1);
  }).join(' ');
  return s;
}
const displayAuthor = a => a.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

// ---------- shared furniture ----------
function frame(ink, opacity = 0.55) {
  return `
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none" stroke="${ink}" stroke-opacity="${opacity * 0.8}" stroke-width="1.4"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${ink}" stroke-opacity="${opacity * 0.55}" stroke-width="1" stroke-dasharray="1 5" stroke-linecap="round"/>`;
}
function grain() {
  return `
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.23 0 0 0 0 0.16 0 0 0 0 0.12 0 0 0 0.5 0"/></filter>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.08"/>`;
}
function typeBlock({ title, author, ink, accent, y, maxLines = 4, startSize = 54 }) {
  const { lines, size } = fitTitle(title, W - 120, startSize, maxLines);
  const lh = size * 1.12;
  let out = '';
  let ty = y + 46;
  for (const l of lines) {
    out += `<text x="${W / 2}" y="${ty}" text-anchor="middle" font-family="Fraunces" font-weight="600" font-size="${size}" fill="${ink}">${esc(l)}</text>`;
    ty += lh;
  }
  ty += 8;
  out += `<rect x="${W / 2 - 26}" y="${ty - 6}" width="52" height="2" rx="1" fill="${accent}"/>`;
  ty += 30;
  out += `<text x="${W / 2}" y="${ty}" text-anchor="middle" font-family="Fraunces" font-style="italic" font-size="24" fill="${ink}" fill-opacity="0.88">${esc(author)}</text>`;
  return out;
}

// ---------- mood scenes (drawn into full canvas behind type) ----------
const scenes = {
  cozy(b) { // lamplit window, evening hills, rising steam
    return { bg: '#F2E3C8', ink: P.espresso, accent: P.terracotta, textY: 120, art: `
    <radialGradient id="glow" cx="50%" cy="78%" r="55%">
      <stop offset="0%" stop-color="${P.mustard}" stop-opacity="0.55"/><stop offset="100%" stop-color="${P.mustard}" stop-opacity="0"/>
    </radialGradient>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <path d="M0 ${H - 190} Q ${W * 0.3} ${H - 260} ${W * 0.62} ${H - 200} T ${W} ${H - 230} V ${H} H 0 Z" fill="${P.sage}" opacity="0.55"/>
    <path d="M0 ${H - 130} Q ${W * 0.35} ${H - 185} ${W * 0.7} ${H - 140} T ${W} ${H - 160} V ${H} H 0 Z" fill="${P.mocha}" opacity="0.85"/>
    <path d="M0 ${H - 80} Q ${W * 0.4} ${H - 118} ${W} ${H - 95} V ${H} H 0 Z" fill="${P.espresso}"/>
    <g transform="translate(${W / 2 - 34}, ${H - 252})">
      <rect x="0" y="26" width="68" height="52" rx="4" fill="${P.espresso}"/>
      <path d="M-6 30 L34 0 L74 30 Z" fill="${P.espresso}"/>
      <rect x="26" y="42" width="16" height="20" rx="2" fill="${P.mustard}"/>
      <rect x="48" y="8" width="9" height="16" fill="${P.espresso}"/>
      <path d="M52 4 q 8 -12 2 -22 q 12 6 6 22 Z" fill="${P.cream}" opacity="0.8"/>
    </g>` };
  },
  eerie(b) { // moon, fog, bare branches — cold night blue
    return { bg: P.night, ink: '#EFE9DC', accent: P.dustblue, textY: H - 300, art: `
    <circle cx="${W * 0.68}" cy="180" r="86" fill="#EFE9DC" opacity="0.94"/>
    <circle cx="${W * 0.68}" cy="180" r="110" fill="none" stroke="#EFE9DC" stroke-opacity="0.14" stroke-width="18"/>
    <g stroke="#151B23" stroke-width="6" stroke-linecap="round" fill="none">
      <path d="M-10 30 q 90 30 150 110 m-70 -76 q 10 40 -8 66 m34 -34 q 34 10 62 2"/>
      <path d="M${W + 10} 60 q -80 6 -128 70 m62 -44 q -4 34 12 52 m-40 -22 q -30 8 -52 0"/>
    </g>
    <g fill="${P.dustblue}" opacity="0.26">
      <ellipse cx="${W * 0.3}" cy="360" rx="240" ry="26"/>
      <ellipse cx="${W * 0.75}" cy="410" rx="260" ry="30"/>
      <ellipse cx="${W * 0.4}" cy="455" rx="300" ry="34"/>
    </g>` };
  },
  adventurous(b) { // waves and a whale-road horizon (Moby Dick) / layered peaks
    return { bg: '#E7D5B5', ink: P.espresso, accent: P.terracotta, textY: 120, art: `
    <circle cx="${W * 0.72}" cy="${H - 450}" r="64" fill="${P.mustard}" opacity="0.9"/>
    <g transform="translate(${W * 0.38}, ${H - 305})" fill="${P.espresso}">
      <path d="M0 0 C -14 -60 -52 -96 -96 -110 C -60 -104 -30 -86 -12 -60 C -16 -96 -34 -128 -66 -150 C -22 -134 6 -100 12 -56 C 18 -100 46 -134 90 -150 C 58 -128 40 -96 36 -60 C 54 -86 84 -104 120 -110 C 76 -96 38 -60 24 0 Z" transform="scale(1.05)"/>
    </g>
    <g fill="none" stroke="${P.slate}" stroke-width="10" stroke-linecap="round">
      <path d="M-20 ${H - 250} q 45 -50 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0"/>
      <path d="M-60 ${H - 180} q 45 -50 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0" opacity="0.75"/>
      <path d="M-30 ${H - 110} q 45 -50 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0" opacity="0.5"/>
    </g>` };
  },
  romantic(b) { // low garden arch beneath the type — blush + berry
    const top = 330; // arch peak sits safely below the text block
    return { bg: P.blush, ink: P.espresso, accent: P.berry, textY: 104, art: `
    <g fill="none" stroke="${P.sage}" stroke-width="5" stroke-linecap="round">
      <path d="M78 ${H - 80} Q 52 ${H / 2 + 120} ${W / 2 - 46} ${top + 26}"/>
      <path d="M${W - 78} ${H - 80} Q ${W - 52} ${H / 2 + 120} ${W / 2 + 46} ${top + 26}"/>
    </g>
    <g fill="${P.sage}">
      ${[0.18, 0.36, 0.55, 0.74, 0.9].map((t) => {
        const x = 78 + (W / 2 - 126) * t, y = (H - 80) - ((H - 80) - (top + 30)) * t;
        return `<ellipse cx="${x - 16}" cy="${y}" rx="17" ry="8" transform="rotate(-38 ${x - 16} ${y})"/>`;
      }).join('')}
      ${[0.18, 0.36, 0.55, 0.74, 0.9].map((t) => {
        const x = (W - 78) - (W / 2 - 126) * t, y = (H - 80) - ((H - 80) - (top + 30)) * t;
        return `<ellipse cx="${x + 16}" cy="${y}" rx="17" ry="8" transform="rotate(38 ${x + 16} ${y})"/>`;
      }).join('')}
    </g>
    <g fill="${P.berry}">
      <circle cx="${W / 2}" cy="${top}" r="17"/>
      <circle cx="${W / 2 - 30}" cy="${top + 18}" r="10" opacity="0.75"/>
      <circle cx="${W / 2 + 30}" cy="${top + 18}" r="10" opacity="0.75"/>
      <circle cx="120" cy="${H - 190}" r="9" opacity="0.6"/>
      <circle cx="${W - 120}" cy="${H - 190}" r="9" opacity="0.6"/>
    </g>` };
  },
  pastoral(b) { // sun over striped fields
    return { bg: '#F4EED8', ink: P.espresso, accent: P.mustard, textY: 120, art: `
    <circle cx="${W * 0.5}" cy="${H - 400}" r="64" fill="${P.mustard}"/>
    <g stroke="${P.mustard}" stroke-width="5" stroke-linecap="round" opacity="0.8">
      ${Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI; const x = W * 0.5 + Math.cos(a + Math.PI) * 92, y = (H - 400) + Math.sin(a + Math.PI) * 92; const x2 = W * 0.5 + Math.cos(a + Math.PI) * 116, y2 = (H - 400) + Math.sin(a + Math.PI) * 116; return `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/>`; }).join('')}
    </g>
    <path d="M0 ${H - 330} Q ${W / 2} ${H - 390} ${W} ${H - 330} V ${H} H 0 Z" fill="${P.sage}" opacity="0.75"/>
    <path d="M0 ${H - 240} Q ${W / 2} ${H - 300} ${W} ${H - 240} V ${H} H 0 Z" fill="${P.mustard}" opacity="0.8"/>
    <path d="M0 ${H - 150} Q ${W / 2} ${H - 205} ${W} ${H - 150} V ${H} H 0 Z" fill="${P.mocha}" opacity="0.9"/>
    <g stroke="${P.espresso}" stroke-width="3.4" stroke-linecap="round" opacity="0.85" fill="none">
      ${Array.from({ length: 5 }, (_, i) => { const x = 120 + i * 72; return `<path d="M${x} ${H - 96} v -74 m0 14 l -15 -20 m15 6 l 15 -20 m-15 34 l -14 -18 m14 4 l 14 -18"/>`; }).join('')}
    </g>` };
  },
  contemplative(b) { // quiet rings + candle
    return { bg: P.paper, ink: P.espresso, accent: P.mustard, textY: 150, art: `
    <g fill="none" stroke="${P.mocha}" stroke-width="1.6">
      <circle cx="${W / 2}" cy="${H - 265}" r="150" stroke-opacity="0.35"/>
      <circle cx="${W / 2}" cy="${H - 265}" r="112" stroke-opacity="0.5"/>
      <circle cx="${W / 2}" cy="${H - 265}" r="76" stroke-opacity="0.65"/>
    </g>
    <rect x="${W / 2 - 13}" y="${H - 270}" width="26" height="76" rx="6" fill="${P.cream}" stroke="${P.mocha}" stroke-width="2"/>
    <path d="M${W / 2} ${H - 288} q 13 -22 0 -38 q -13 16 0 38 Z" fill="${P.mustard}"/>
    <circle cx="${W / 2}" cy="${H - 322}" r="3.4" fill="${P.terracotta}"/>` };
  },
  thrilling(b) { // gaslit alley: beam + silhouette skyline
    return { bg: P.deepwarm, ink: P.cream, accent: P.mustard, textY: 130, art: `
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${P.mustard}" stop-opacity="0.55"/><stop offset="100%" stop-color="${P.mustard}" stop-opacity="0"/>
    </linearGradient>
    <path d="M${W * 0.6} 0 L ${W} 0 L ${W * 0.62} ${H} L ${W * 0.2} ${H} Z" fill="url(#beam)"/>
    <g fill="#1A100A">
      <rect x="0" y="${H - 210}" width="120" height="210"/>
      <rect x="120" y="${H - 160}" width="90" height="160"/>
      <rect x="210" y="${H - 250}" width="70" height="250"/>
      <rect x="280" y="${H - 140}" width="110" height="140"/>
      <rect x="390" y="${H - 200}" width="140" height="200"/>
      <rect x="238" y="${H - 300}" width="14" height="60"/>
    </g>
    <g fill="${P.mustard}">
      <rect x="30" y="${H - 180}" width="14" height="18" opacity="0.9"/>
      <rect x="316" y="${H - 112}" width="13" height="16" opacity="0.8"/>
      <rect x="430" y="${H - 168}" width="14" height="18" opacity="0.85"/>
    </g>
    <circle cx="${W * 0.24}" cy="${H - 330}" r="10" fill="${P.mustard}"/>
    <rect x="${W * 0.24 - 2.4}" y="${H - 322}" width="4.8" height="112" fill="#1A100A"/>` };
  },
  whimsical(b) { // tumbling teacups-and-stars confetti
    const bits = [[80, 150, P.terracotta, 13], [430, 120, P.dustblue, 10], [470, 300, P.mustard, 15], [70, 330, P.mustard, 9],
    [120, 560, P.fern, 12], [430, 540, P.terracotta, 10], [250, 90, P.dustblue, 8], [350, 620, P.mustard, 11],
    [180, 650, P.berry, 8], [460, 680, P.fern, 9], [60, 460, P.terracotta, 7], [390, 200, P.berry, 7]];
    return { bg: P.cream, ink: P.espresso, accent: P.terracotta, textY: 110, art: `
    <g>${bits.map(([x, y, c, r], i) => i % 3 === 0
      ? `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.4}" fill="${c}" opacity="0.85" transform="rotate(${(i * 37) % 60 - 30} ${x} ${y})"/>`
      : i % 3 === 1 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="0.85"/>`
        : `<path d="M${x} ${y - r} L ${x + r * 0.32} ${y - r * 0.32} L ${x + r} ${y} L ${x + r * 0.32} ${y + r * 0.32} L ${x} ${y + r} L ${x - r * 0.32} ${y + r * 0.32} L ${x - r} ${y} L ${x - r * 0.32} ${y - r * 0.32} Z" fill="${c}" opacity="0.85"/>`).join('')}
    </g>
    <g transform="translate(${W / 2 - 40}, ${H - 250}) rotate(-8)">
      <path d="M0 0 h80 a8 8 0 0 1 8 8 v10 a26 26 0 0 1 0 52 l -4 0 a 40 40 0 0 1 -38 30 h -12 a40 40 0 0 1 -40 -40 V 8 a8 8 0 0 1 8 -8 Z" fill="none" stroke="${P.espresso}" stroke-width="6"/>
      <path d="M14 -14 q 6 -12 0 -22 m26 22 q 6 -12 0 -22 m26 22 q 6 -12 0 -22" stroke="${P.mocha}" stroke-width="4" fill="none" stroke-linecap="round"/>
    </g>` };
  },
  funny(b) { // stacked wobbly hats / bouncing balls on mustard
    return { bg: '#EFCF93', ink: P.espresso, accent: P.terracotta, textY: 130, art: `
    <g fill="${P.espresso}">
      <ellipse cx="${W / 2}" cy="${H - 150}" rx="150" ry="16" opacity="0.25"/>
    </g>
    <g transform="translate(${W / 2}, ${H - 160})">
      <g transform="rotate(-6)"><rect x="-95" y="-46" width="190" height="46" rx="10" fill="${P.terracotta}"/></g>
      <g transform="rotate(5) translate(0,-52)"><rect x="-72" y="-44" width="144" height="44" rx="10" fill="${P.sage}"/></g>
      <g transform="rotate(-9) translate(0,-104)"><rect x="-52" y="-40" width="104" height="40" rx="9" fill="${P.espresso}"/></g>
      <g transform="rotate(7) translate(0,-150)"><circle cx="0" cy="-24" r="24" fill="${P.mustard}" stroke="${P.espresso}" stroke-width="5"/></g>
    </g>` };
  },
  grim(b) { // cold ridge, low pale sky band, lone spark
    return { bg: '#2A1E15', ink: P.cream, accent: P.terracotta, textY: 130, art: `
    <rect x="0" y="${H - 400}" width="${W}" height="120" fill="${P.sage}" opacity="0.22"/>
    <path d="M0 ${H - 300} L 110 ${H - 420} L 210 ${H - 310} L 330 ${H - 470} L 430 ${H - 330} L ${W} ${H - 400} V ${H} H 0 Z" fill="#1B120B"/>
    <path d="M0 ${H - 210} L 150 ${H - 300} L 300 ${H - 220} L 440 ${H - 290} L ${W} ${H - 230} V ${H} H 0 Z" fill="#150E08"/>
    <circle cx="330" cy="${H - 470}" r="6" fill="${P.terracotta}"/>
    <circle cx="330" cy="${H - 470}" r="14" fill="${P.terracotta}" opacity="0.28"/>` };
  },
  tragic(b) { // falling petals on plum dusk
    const petals = [[120, 240, -20], [380, 180, 30], [300, 330, -40], [180, 430, 15], [420, 420, -25], [90, 560, 35], [350, 560, -10], [250, 640, 25], [450, 620, 40]];
    return { bg: P.plum, ink: '#F4E7E2', accent: P.rose, textY: 130, art: `
    <g transform="translate(${W / 2}, ${H - 190})">
      <path d="M0 0 q -8 -60 0 -110" stroke="${P.sage}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.85"/>
      <ellipse cx="-16" cy="-64" rx="16" ry="7" fill="${P.sage}" transform="rotate(-30 -16 -64)" opacity="0.85"/>
      <g fill="${P.rose}"><circle cx="0" cy="-122" r="15"/><circle cx="-13" cy="-110" r="9" opacity="0.8"/><circle cx="13" cy="-110" r="9" opacity="0.8"/></g>
    </g>
    <g fill="${P.rose}">${petals.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="5.5" opacity="0.72" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>` };
  },
  philosophical(b) { // horizon disc + laurel arc
    return { bg: P.beige, ink: P.espresso, accent: P.mustard, textY: 140, art: `
    <circle cx="${W / 2}" cy="${H - 280}" r="120" fill="${P.mustard}" opacity="0.85"/>
    <rect x="0" y="${H - 280}" width="${W}" height="280" fill="${P.beige}"/>
    <line x1="60" y1="${H - 280}" x2="${W - 60}" y2="${H - 280}" stroke="${P.espresso}" stroke-width="3"/>
    <g fill="none" stroke="${P.sage}" stroke-width="4.4" stroke-linecap="round">
      <path d="M110 ${H - 130} q ${W / 2 - 110} -110 ${W - 220} 0"/>
    </g>
    <g fill="${P.sage}">
      ${Array.from({ length: 6 }, (_, i) => { const t = 0.12 + i * 0.15; const x = 110 + (W - 220) * t; const y = (H - 130) - Math.sin(t * Math.PI) * 55; return `<ellipse cx="${x}" cy="${y - 12}" rx="13" ry="6" transform="rotate(${-30 + t * 60} ${x} ${y - 12})"/>`; }).join('')}
    </g>` };
  },
};

// ---------- render ----------
function coverSVG(book) {
  const scene = scenes[book.mood](book);
  const title = displayTitle(book.title);
  const author = displayAuthor(book.author);
  let era = (book.era || '').split(',')[0].trim();
  if (era.length > 30) era = era.slice(0, 30).replace(/\s+\S*$/, '');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${scene.bg}"/>
  ${scene.art}
  ${grain()}
  ${frame(scene.ink)}
  ${typeBlock({ era, title, author, ink: scene.ink, accent: scene.accent, y: scene.textY })}
</svg>`;
}

const picks = JSON.parse(fs.readFileSync(path.join(DIR, 'picks.json'), 'utf8'));
const chosen = process.argv[2] ? picks.filter(p => process.argv.slice(2).includes(p.id)) : picks;
for (const b of chosen) {
  const svg = coverSVG(b);
  const r = new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Fraunces' } });
  fs.writeFileSync(path.join(DIR, 'out', `${b.mood}-${b.id}.png`), r.render().asPng());
  console.log('rendered', b.mood, b.id, displayTitle(b.title));
}
