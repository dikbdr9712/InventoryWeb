// Draws the DP DrukBazaars pictures (SVG) into public/Images/art. Run from the project folder: node scripts/draw-art.js
const fs = require('fs');
const OUT = require('path').join(__dirname, '..', 'public', 'Images', 'art') + '/';
fs.mkdirSync(OUT, { recursive: true });

const C = {
  green: '#0b6b4f', deep: '#084f3a', mid: '#2f8f6b', light: '#7fbf9f', soft: '#e3f1ec',
  saffron: '#e2a012', gold: '#f5c451', cream: '#fdf3d7', orange: '#e8642c', red: '#c8462b', maroon: '#7a2f1b',
  blue: '#1d5fa8', sky: '#e6f0fa', ink: '#17211f', wall: '#fffaf0', wood: '#8a4b2a', sand: '#efe6d2', skin: '#c98b5e'
};
const FLAG_COLORS = [C.blue, '#ffffff', C.red, C.mid, C.gold];

const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">\n<title>${title}</title>\n${body}\n</svg>\n`;

// ---------- pieces ----------

function sky(w, h, top = '#dcefe6', bottom = '#fbf4e2') {
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
}

function sun(x, y, r) {
  return `<circle cx="${x}" cy="${y}" r="${r * 1.55}" fill="${C.cream}" opacity="0.9"/><circle cx="${x}" cy="${y}" r="${r}" fill="${C.gold}"/>`;
}

// Snowy mountains: peaks [[x, y], ...] between left and right, base at y = base
function mountains(peaks, base, w, fill = '#bcd3d1') {
  let d = `M0 ${base}`;
  for (const [x, y] of peaks) d += ` L${x} ${y}`;
  d += ` L${w} ${base} L${w} ${base + 200} L0 ${base + 200} Z`;
  let s = `<path d="${d}" fill="${fill}"/>`;
  // snow on the higher peaks
  for (const [x, y] of peaks) {
    if (y > base - 140) continue;
    const k = 0.32 * (base - y) / 2.2;
    s += `<path d="M${x} ${y} L${x - k} ${y + k * 1.15} L${x - k * 0.45} ${y + k * 0.95} L${x} ${y + k * 1.3} L${x + k * 0.5} ${y + k * 0.9} L${x + k} ${y + k * 1.2} Z" fill="#ffffff"/>`;
  }
  return s;
}

// Prayer flags hanging from a quadratic curve
function prayerFlags(x0, y0, cx, cy, x1, y1, n, size = 36) {
  let s = `<path d="M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}" fill="none" stroke="#6b5a48" stroke-width="3"/>`;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    const color = FLAG_COLORS[i % FLAG_COLORS.length];
    const sway = (i % 2 ? 1 : -1) * size * 0.08;
    s += `<path d="M${x - size / 2} ${y} L${x + size / 2} ${y} L${x + size / 2 + sway} ${y + size * 1.25} L${x - size / 2 + sway} ${y + size * 1.25} Z" fill="${color}" stroke="#d8d2c4" stroke-width="1.5"/>`;
  }
  return s;
}

function cypress(x, base, h) {
  return `<rect x="${x - 5}" y="${base - h * 0.18}" width="10" height="${h * 0.18}" fill="#6b4a32"/>
<path d="M${x} ${base - h} C${x + h * 0.22} ${base - h * 0.7} ${x + h * 0.2} ${base - h * 0.3} ${x} ${base - h * 0.14} C${x - h * 0.2} ${base - h * 0.3} ${x - h * 0.22} ${base - h * 0.7} ${x} ${base - h} Z" fill="${C.deep}"/>`;
}

// Bhutanese-style building: white walls, a wooden window band, painted eaves, a wide roof with a little top roof
function building(x, base, w, h, roof, opts = {}) {
  const top = base - h;
  const band = Math.round(h * (opts.band ?? 0.3));
  const roofDark = opts.roofDark ?? '#00000033';
  let s = `<rect x="${x + 10}" y="${top + 10}" width="${w}" height="${h}" fill="#000" opacity="0.06"/>`;
  s += `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${C.wall}"/>`;
  s += `<rect x="${x}" y="${top}" width="${w}" height="${band}" fill="${C.maroon}"/>`;
  const n = opts.windows ?? 3;
  const slot = (w - 40) / n;
  for (let i = 0; i < n; i++) {
    const wx = x + 20 + i * slot + 10;
    const ww = slot - 20;
    const wy = top + 14;
    const wh = band - 28;
    s += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="${C.gold}"/>`;
    s += `<rect x="${wx + 7}" y="${wy + 7}" width="${ww - 14}" height="${wh - 14}" fill="${C.wall}"/>`;
    s += `<path d="M${wx + ww / 2} ${wy + 7} V${wy + wh - 7} M${wx + 7} ${wy + wh / 2} H${wx + ww - 7}" stroke="${C.maroon}" stroke-width="5"/>`;
  }
  // painted eave blocks
  const eaveY = top - 16;
  const colors = [C.red, C.gold, C.mid, C.blue];
  for (let bx = x - 24, i = 0; bx < x + w + 24; bx += 16, i++) {
    s += `<rect x="${bx}" y="${eaveY}" width="14" height="16" fill="${colors[i % 4]}"/>`;
  }
  // roof
  s += `<path d="M${x - 56} ${eaveY} L${x + w + 56} ${eaveY} L${x + w - 6} ${eaveY - 58} L${x + 6} ${eaveY - 58} Z" fill="${roof}"/>`;
  s += `<rect x="${x - 56}" y="${eaveY - 6}" width="${w + 112}" height="6" fill="${roofDark}"/>`;
  s += `<rect x="${x + w / 2 - 70}" y="${eaveY - 84}" width="140" height="26" fill="${C.wall}"/>`;
  s += `<path d="M${x + w / 2 - 96} ${eaveY - 84} L${x + w / 2 + 96} ${eaveY - 84} L${x + w / 2 + 64} ${eaveY - 118} L${x + w / 2 - 64} ${eaveY - 118} Z" fill="${roof}"/>`;
  s += `<path d="M${x + w / 2} ${eaveY - 150} L${x + w / 2 + 12} ${eaveY - 118} L${x + w / 2 - 12} ${eaveY - 118} Z" fill="${C.gold}"/><circle cx="${x + w / 2}" cy="${eaveY - 152}" r="7" fill="${C.gold}"/>`;
  return s;
}

// A shop counter inside a building's ground floor
function shopFront(x, base, w, h, awning, goods) {
  const top = base - h;
  let s = `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${C.cream}"/>`;
  // shelves with goods
  for (const sy of [top + 58, top + 112].filter(y => y < base - 66)) {
    s += `<rect x="${x + 10}" y="${sy}" width="${w - 20}" height="7" fill="${C.wood}"/>`;
    let gx = x + 20;
    let i = 0;
    while (gx < x + w - 40) {
      const g = goods[(i + (sy > top + 60 ? 2 : 0)) % goods.length];
      const gw = 22 + (i * 7) % 12;
      const gh = 26 + (i * 11) % 18;
      s += g === 'jar'
        ? `<rect x="${gx}" y="${sy - gh}" width="${gw}" height="${gh}" rx="6" fill="${C.saffron}"/><rect x="${gx - 2}" y="${sy - gh - 6}" width="${gw + 4}" height="8" rx="2" fill="${C.maroon}"/>`
        : `<rect x="${gx}" y="${sy - gh}" width="${gw}" height="${gh}" rx="3" fill="${g}"/>`;
      gx += gw + 8;
      i++;
    }
  }
  // awning with stripes and scallops
  const stripes = 8;
  const sw = (w + 30) / stripes;
  for (let i = 0; i < stripes; i++) {
    const line = i % 2 ? ' stroke="#e2d6bd" stroke-width="2"' : '';
    s += `<circle cx="${x - 15 + i * sw + sw / 2}" cy="${top}" r="${sw / 2}" fill="${i % 2 ? '#ffffff' : awning}"${line}/>`;
    s += `<rect x="${x - 15 + i * sw}" y="${top - 34}" width="${sw}" height="34" fill="${i % 2 ? '#ffffff' : awning}"${line}/>`;
  }
  // counter
  s += `<rect x="${x - 10}" y="${base - 54}" width="${w + 20}" height="54" fill="${C.wood}"/>`;
  s += `<rect x="${x - 16}" y="${base - 60}" width="${w + 32}" height="10" rx="3" fill="#a8643c"/>`;
  return s;
}

function basket(x, y, fruit) {
  let s = '';
  for (let i = 0; i < 4; i++) s += `<circle cx="${x - 24 + i * 16}" cy="${y - 14 - (i % 2) * 6}" r="11" fill="${fruit}"/>`;
  s += `<path d="M${x - 40} ${y - 12} L${x + 40} ${y - 12} L${x + 30} ${y + 18} L${x - 30} ${y + 18} Z" fill="#c9954f"/>`;
  s += `<path d="M${x - 36} ${y - 2} H${x + 36} M${x - 32} ${y + 8} H${x + 32}" stroke="#a87632" stroke-width="3"/>`;
  return s;
}

// A person in gho or kira: x = middle, feet = ground
function person(x, feet, o) {
  const robe = o.robe;
  const headY = feet - 166;
  let s = `<ellipse cx="${x}" cy="${feet + 2}" rx="38" ry="7" fill="#000" opacity="0.08"/>`;
  if (o.kira) {
    s += `<path d="M${x - 30} ${feet - 100} L${x + 30} ${feet - 100} L${x + 36} ${feet - 4} L${x - 36} ${feet - 4} Z" fill="${o.skirt}"/>`;
    s += `<path d="M${x - 30} ${feet - 80} H${x + 32} M${x - 33} ${feet - 50} H${x + 34} M${x - 35} ${feet - 22} H${x + 35}" stroke="${o.skirtLine}" stroke-width="5"/>`;
    s += `<path d="M${x - 32} ${feet - 136} Q${x} ${feet - 148} ${x + 32} ${feet - 136} L${x + 34} ${feet - 96} L${x - 34} ${feet - 96} Z" fill="${robe}"/>`;
  } else {
    s += `<rect x="${x - 17}" y="${feet - 48}" width="12" height="44" rx="5" fill="#2f2620"/><rect x="${x + 5}" y="${feet - 48}" width="12" height="44" rx="5" fill="#2f2620"/>`;
    s += `<path d="M${x - 32} ${feet - 136} Q${x} ${feet - 148} ${x + 32} ${feet - 136} L${x + 38} ${feet - 48} Q${x} ${feet - 40} ${x - 38} ${feet - 48} Z" fill="${robe}"/>`;
    s += `<path d="M${x - 18} ${feet - 134} V${feet - 50} M${x + 18} ${feet - 134} V${feet - 50}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="4"/>`;
    s += `<rect x="${x - 35}" y="${feet - 96}" width="70" height="8" fill="${o.belt ?? C.gold}"/>`;
  }
  s += `<ellipse cx="${x - 12}" cy="${feet - 2}" rx="12" ry="6" fill="#1e1915"/><ellipse cx="${x + 12}" cy="${feet - 2}" rx="12" ry="6" fill="#1e1915"/>`;
  s += `<path d="M${x - 13} ${feet - 141} L${x} ${feet - 118} L${x + 13} ${feet - 141}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round"/>`;
  // arms with white cuffs
  s += `<rect x="${x - 47}" y="${feet - 134}" width="16" height="66" rx="8" fill="${robe}"/><rect x="${x - 47}" y="${feet - 80}" width="16" height="12" fill="#ffffff"/><circle cx="${x - 39}" cy="${feet - 62}" r="8" fill="${C.skin}"/>`;
  s += `<rect x="${x + 31}" y="${feet - 134}" width="16" height="66" rx="8" fill="${robe}"/><rect x="${x + 31}" y="${feet - 80}" width="16" height="12" fill="#ffffff"/><circle cx="${x + 39}" cy="${feet - 62}" r="8" fill="${C.skin}"/>`;
  // head
  s += `<rect x="${x - 7}" y="${headY + 18}" width="14" height="14" fill="${C.skin}"/>`;
  s += `<circle cx="${x}" cy="${headY}" r="23" fill="${C.skin}"/>`;
  s += o.kira
    ? `<path d="M${x - 25} ${headY + 10} C${x - 30} ${headY - 30} ${x + 30} ${headY - 30} ${x + 25} ${headY + 10} C${x + 18} ${headY - 8} ${x - 18} ${headY - 8} ${x - 25} ${headY + 10} Z" fill="#241913"/>`
    : `<path d="M${x - 23} ${headY - 2} C${x - 22} ${headY - 30} ${x + 22} ${headY - 30} ${x + 23} ${headY - 2} C${x + 10} ${headY - 12} ${x - 10} ${headY - 12} ${x - 23} ${headY - 2} Z" fill="#241913"/>`;
  if (o.bag) {
    const bx = x + 39;
    const by = feet - 62;
    s += `<path d="M${bx - 10} ${by + 4} Q${bx} ${by - 16} ${bx + 10} ${by + 4}" fill="none" stroke="${C.deep}" stroke-width="4"/>`;
    s += `<rect x="${bx - 18}" y="${by + 2}" width="36" height="42" rx="5" fill="${o.bag}"/><path d="M${bx - 8} ${by + 14} Q${bx} ${by + 22} ${bx + 8} ${by + 14}" fill="none" stroke="#ffffff" stroke-width="3"/>`;
  }
  return s;
}

// Scooter with a delivery rider, facing right. (x, y) = ground under the middle, scale k
function rider(x, y, k = 1) {
  return `<g transform="translate(${x} ${y}) scale(${k})">
<ellipse cx="0" cy="2" rx="140" ry="12" fill="#000" opacity="0.1"/>
<circle cx="-78" cy="-36" r="36" fill="${C.ink}"/><circle cx="-78" cy="-36" r="13" fill="#d8dcdb"/>
<circle cx="88" cy="-36" r="36" fill="${C.ink}"/><circle cx="88" cy="-36" r="13" fill="#d8dcdb"/>
<path d="M48 -50 A40 40 0 0 1 128 -50" fill="none" stroke="${C.green}" stroke-width="12" stroke-linecap="round"/>
<path d="M-124 -52 Q-126 -112 -56 -114 L-12 -114 Q0 -114 0 -102 L0 -64 L-40 -64 Q-62 -40 -104 -40 Q-122 -40 -124 -52 Z" fill="${C.green}"/>
<rect x="-44" y="-66" width="98" height="18" rx="9" fill="${C.green}"/>
<path d="M48 -60 L80 -156 L96 -151 L66 -54 Z" fill="${C.deep}"/>
<circle cx="99" cy="-134" r="10" fill="${C.gold}"/>
<path d="M74 -160 L110 -168" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
<rect x="-104" y="-128" width="92" height="17" rx="8" fill="${C.ink}"/>
<rect x="-160" y="-222" width="112" height="96" rx="10" fill="${C.saffron}"/>
<rect x="-160" y="-222" width="112" height="18" rx="9" fill="#c98a0c"/>
<path d="M-116 -170 Q-104 -190 -92 -170" fill="none" stroke="#ffffff" stroke-width="5"/><rect x="-124" y="-172" width="40" height="34" rx="5" fill="#ffffff"/>
<path d="M-42 -132 L2 -112 L16 -70" fill="none" stroke="#33475a" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
<ellipse cx="24" cy="-66" rx="18" ry="8" fill="${C.ink}"/>
<path d="M-48 -136 L-26 -214" stroke="${C.deep}" stroke-width="46" stroke-linecap="round"/>
<path d="M-22 -206 L40 -178 L80 -160" fill="none" stroke="${C.deep}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="84" cy="-160" r="9" fill="${C.skin}"/>
<circle cx="-14" cy="-256" r="25" fill="${C.skin}"/>
<path d="M-46 -252 C-48 -296 18 -300 14 -258 L-8 -258 Q-22 -262 -46 -252 Z" fill="${C.gold}"/>
<rect x="-2" y="-266" width="22" height="13" rx="6" fill="${C.ink}" opacity="0.8"/>
</g>`;
}

function pin(x, y, color, k = 1) {
  return `<g transform="translate(${x} ${y}) scale(${k})"><ellipse cx="0" cy="4" rx="22" ry="7" fill="#000" opacity="0.12"/>
<path d="M0 0 C-10 -20 -42 -42 -42 -66 A42 42 0 1 1 42 -66 C42 -42 10 -20 0 0 Z" fill="${color}"/><circle cx="0" cy="-66" r="17" fill="#ffffff"/></g>`;
}

function check(x, y, r, bg = C.green) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${bg}"/><path d="M${x - r * 0.42} ${y + r * 0.02} L${x - r * 0.1} ${y + r * 0.34} L${x + r * 0.45} ${y - r * 0.3}" fill="none" stroke="#ffffff" stroke-width="${r * 0.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function bar(x, y, w, h = 14, color = '#dfe5e3') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
}

function bankIcon(x, y, k, color) {
  return `<g transform="translate(${x} ${y}) scale(${k})"><path d="M-60 -10 L0 -48 L60 -10 Z" fill="${color}"/><rect x="-56" y="-8" width="112" height="10" fill="${color}"/>
${[-42, -14, 14, 42].map(cx => `<rect x="${cx - 7}" y="4" width="14" height="44" fill="${color}"/>`).join('')}<rect x="-62" y="50" width="124" height="12" fill="${color}"/></g>`;
}

function star(x, y, r, fill) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)} `;
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
}

function drop(cx, cy, s, fill) {
  return `<path d="M${cx} ${cy - s} C${cx + 0.15 * s} ${cy - 0.55 * s} ${cx + 0.6 * s} ${cy - 0.15 * s} ${cx + 0.6 * s} ${cy + 0.25 * s} A${0.6 * s} ${0.6 * s} 0 1 1 ${cx - 0.6 * s} ${cy + 0.25 * s} C${cx - 0.6 * s} ${cy - 0.15 * s} ${cx - 0.15 * s} ${cy - 0.55 * s} ${cx} ${cy - s} Z" fill="${fill}"/>`;
}

function shoppingBag(x, y, w, h, color, handle = C.deep) {
  return `<path d="M${x + w * 0.3} ${y} Q${x + w * 0.3} ${y - h * 0.32} ${x + w / 2} ${y - h * 0.32} Q${x + w * 0.7} ${y - h * 0.32} ${x + w * 0.7} ${y}" fill="none" stroke="${handle}" stroke-width="${w * 0.07}" stroke-linecap="round"/>
<path d="M${x} ${y} H${x + w} L${x + w * 0.94} ${y + h} H${x + w * 0.06} Z" fill="${color}"/>
<path d="M${x + w * 0.36} ${y + h * 0.3} Q${x + w / 2} ${y + h * 0.48} ${x + w * 0.64} ${y + h * 0.3}" fill="none" stroke="#ffffff" stroke-width="${w * 0.05}" stroke-linecap="round"/>`;
}

// ---------- 1. the market ----------
{
  const W = 1600, H = 1000;
  let b = sky(W, H);
  b += sun(1330, 190, 80);
  b += mountains([[160, 380], [300, 470], [470, 250], [640, 470], [790, 330], [960, 510], [1130, 290], [1290, 470], [1430, 370], [1600, 470]], 600, W);
  b += `<path d="M0 640 C220 570 420 600 620 640 C860 690 1060 590 1300 612 C1440 624 1530 648 1600 660 L1600 1000 L0 1000 Z" fill="#8cc4a8"/>`;
  b += cypress(70, 700, 190) + cypress(130, 712, 150) + cypress(1530, 690, 200);
  b += prayerFlags(-10, 120, 400, 240, 820, 96, 15, 34);
  b += `<rect x="0" y="830" width="${W}" height="170" fill="${C.sand}"/><rect x="0" y="826" width="${W}" height="8" fill="#d9ccb0"/>`;
  const shops = [
    { x: 150, roof: C.green, awning: C.green, goods: [C.red, C.blue, 'jar', C.mid, C.gold] },
    { x: 620, roof: C.red, awning: C.saffron, goods: ['jar', C.mid, C.blue, C.red, '#9b6bb5'] },
    { x: 1090, roof: C.green, awning: C.blue, goods: [C.gold, C.red, C.mid, 'jar', C.blue] }
  ];
  for (const s of shops) {
    b += building(s.x, 836, 360, 340, s.roof);
    b += shopFront(s.x + 45, 836, 270, 170, s.awning, s.goods);
  }
  b += basket(260, 768, C.red) + basket(760, 768, C.gold) + basket(1240, 768, '#e8642c');
  b += shoppingBag(1150, 740, 56, 36, C.green);
  b += person(560, 935, { robe: '#7a2f1b', bag: C.green });
  b += person(1010, 925, { kira: true, robe: '#1d5fa8', skirt: '#c8462b', skirtLine: C.gold, bag: C.saffron });
  b += person(1480, 950, { robe: C.deep, belt: C.gold });
  fs.writeFileSync(OUT + 'banner-market.svg', svg(W, H, b, 'A market street with Bhutanese-style shops and shoppers carrying bags'));
}

// ---------- 2. paying from the bank ----------
{
  const W = 1600, H = 1000;
  let b = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.sky}"/><stop offset="1" stop-color="${C.soft}"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#17211f" flood-opacity="0.18"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<circle cx="250" cy="820" r="260" fill="#ffffff" opacity="0.45"/><circle cx="1400" cy="160" r="220" fill="#ffffff" opacity="0.45"/>`;
  // the phone
  b += `<g filter="url(#sh)"><rect x="560" y="110" width="400" height="800" rx="52" fill="${C.ink}"/></g>
<rect x="578" y="128" width="364" height="764" rx="38" fill="#ffffff"/>
<path d="M578 166 A38 38 0 0 1 616 128 H904 A38 38 0 0 1 942 166 V250 H578 Z" fill="${C.green}"/>
<rect x="710" y="140" width="100" height="14" rx="7" fill="${C.ink}" opacity="0.6"/>
<circle cx="626" cy="206" r="22" fill="#ffffff" opacity="0.9"/>${shoppingBag(613, 200, 26, 18, C.green, C.green)}
${bar(664, 192, 150, 14, '#ffffff')}${bar(664, 214, 96, 10, '#ffffff99')}
<rect x="604" y="280" width="312" height="132" rx="18" fill="${C.soft}"/>
${bar(628, 304, 120)}${bar(628, 336, 210, 26, C.ink)}${bar(628, 378, 160)}
<rect x="604" y="432" width="312" height="96" rx="18" fill="#ffffff" stroke="#dfe5e3" stroke-width="3"/>
${bankIcon(656, 482, 0.42, C.blue)}${bar(700, 462, 150, 14, '#c8d3cf')}${bar(700, 490, 96, 12, '#dfe5e3')}
${check(884, 480, 16)}`;
  for (let i = 0; i < 6; i++) {
    const bx = 604 + i * 53;
    b += `<rect x="${bx}" y="556" width="44" height="58" rx="10" fill="#ffffff" stroke="${i < 4 ? C.green : '#dfe5e3'}" stroke-width="3"/>`;
    if (i < 4) b += `<circle cx="${bx + 22}" cy="585" r="7" fill="${C.ink}"/>`;
  }
  b += `${bar(604, 640, 200)}
<rect x="604" y="700" width="312" height="70" rx="35" fill="${C.green}"/>${check(660, 735, 18, '#ffffff33')}${bar(692, 728, 150, 14, '#ffffff')}
${bar(684, 806, 152, 10, '#dfe5e3')}`;
  // the bank
  b += `<g filter="url(#sh)"><rect x="1110" y="420" width="330" height="330" rx="28" fill="#ffffff"/></g>
${bankIcon(1275, 590, 1.65, C.blue)}
<rect x="1268" y="350" width="6" height="74" fill="${C.ink}"/><path d="M1274 352 H1340 V398 H1274 Z" fill="${C.gold}"/><path d="M1340 352 V398 H1274 Z" fill="${C.orange}"/>`;
  // money moving from the phone to the bank
  b += `<path d="M970 520 C1030 430 1070 420 1104 470" fill="none" stroke="${C.green}" stroke-width="7" stroke-dasharray="4 16" stroke-linecap="round"/>
<path d="M1088 468 L1110 476 L1102 452" fill="none" stroke="${C.green}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (let i = 0; i < 4; i++) b += `<ellipse cx="1180" cy="${820 - i * 18}" rx="56" ry="18" fill="${i % 2 ? C.gold : C.saffron}" stroke="#c98a0c" stroke-width="3"/>`;
  b += `<circle cx="1180" cy="766" r="0"/>`;
  // safety: a shield and a lock
  b += `<g filter="url(#sh)"><path d="M330 300 L450 340 V450 C450 540 390 600 330 630 C270 600 210 540 210 450 V340 Z" fill="${C.green}"/></g>
<path d="M276 456 L318 498 L392 418" fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
<g filter="url(#sh)"><rect x="300" y="720" width="150" height="120" rx="18" fill="${C.saffron}"/></g>
<path d="M330 720 V690 A45 45 0 0 1 420 690 V720" fill="none" stroke="${C.saffron}" stroke-width="18"/>
<circle cx="375" cy="772" r="14" fill="#ffffff"/><rect x="369" y="776" width="12" height="32" rx="6" fill="#ffffff"/>
${check(950, 140, 40, C.saffron)}`;
  fs.writeFileSync(OUT + 'banner-pay.svg', svg(W, H, b, 'A phone paying from a bank account, with a shield and a lock for safety'));
}

// ---------- 3. delivery ----------
{
  const W = 1600, H = 1000;
  let b = sky(W, H, '#d9ece4', '#fbf4e2');
  b += sun(260, 200, 70);
  b += mountains([[120, 420], [330, 260], [520, 430], [700, 300], [880, 470], [1060, 230], [1260, 430], [1420, 320], [1600, 440]], 560, W);
  b += `<path d="M0 600 C260 540 520 580 760 620 C1000 660 1260 560 1600 590 L1600 1000 L0 1000 Z" fill="#8cc4a8"/>`;
  b += `<path d="M0 760 C300 700 600 760 900 740 C1180 722 1400 680 1600 700 L1600 1000 L0 1000 Z" fill="#6aae8e"/>`;
  // the road, from bottom left up to the house
  b += `<path d="M-60 1010 C260 930 520 840 820 850 C1060 858 1160 790 1290 712" fill="none" stroke="#e9dcc0" stroke-width="130" stroke-linecap="round"/>
<path d="M-60 1010 C260 930 520 840 820 850 C1060 858 1160 790 1290 712" fill="none" stroke="#ffffff" stroke-width="7" stroke-dasharray="34 30"/>`;
  b += cypress(1000, 690, 170) + cypress(1060, 700, 130) + cypress(1540, 700, 190) + cypress(180, 790, 160);
  b += building(1190, 700, 280, 250, C.green, { windows: 2 });
  b += `<rect x="1300" y="610" width="60" height="90" fill="${C.wood}"/><circle cx="1348" cy="658" r="5" fill="${C.gold}"/>`;
  b += prayerFlags(1500, 300, 1560, 470, 1590, 640, 6, 30);
  b += `<rect x="1495" y="292" width="8" height="420" fill="#6b5a48"/>`;
  b += pin(1330, 320, C.red, 1.1);
  // motion lines and the rider
  b += `<path d="M380 800 H520 M420 840 H540 M360 760 H480" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.9"/>`;
  b += `<g transform="rotate(-6 760 860)">${rider(760, 872, 1.15)}</g>`;
  fs.writeFileSync(OUT + 'banner-delivery.svg', svg(W, H, b, 'A rider on a scooter taking a package up a mountain road to a house'));
}

// ---------- 4. following the order ----------
{
  const W = 1600, H = 1000;
  let b = `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#17211f" flood-opacity="0.16"/></filter></defs>
<rect width="${W}" height="${H}" fill="#eef5f1"/>`;
  // a simple map: blocks, roads, a river
  const blocks = [[60, 60, 220, 160], [320, 40, 180, 200], [60, 280, 160, 220], [260, 300, 260, 140], [560, 60, 240, 150], [560, 250, 120, 240],
    [720, 260, 140, 120], [60, 560, 260, 160], [360, 500, 160, 240], [560, 540, 300, 140], [60, 780, 200, 180], [300, 800, 280, 160], [620, 740, 220, 220]];
  for (const [x, y, w, h] of blocks) b += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#dcebe3"/>`;
  b += `<path d="M-20 520 C200 470 300 640 520 600 C720 560 760 420 920 400" fill="none" stroke="#c9e0f2" stroke-width="44" stroke-linecap="round"/>`;
  b += `<path d="M180 860 C240 720 300 650 420 610 C560 562 600 470 640 380 C670 312 720 260 780 230" fill="none" stroke="${C.green}" stroke-width="12" stroke-dasharray="2 22" stroke-linecap="round"/>`;
  b += pin(180, 870, C.green, 1) + pin(790, 236, C.red, 1);
  b += `<circle cx="470" cy="594" r="38" fill="${C.saffron}" stroke="#ffffff" stroke-width="8"/>${shoppingBag(452, 586, 36, 24, '#ffffff', '#ffffff')}`;
  // the order card
  b += `<g filter="url(#sh)"><rect x="930" y="130" width="560" height="740" rx="32" fill="#ffffff"/></g>
${bar(980, 186, 220, 22, C.ink)}${bar(980, 226, 150, 14)}
<rect x="980" y="270" width="460" height="10" rx="5" fill="#dfe5e3"/><rect x="980" y="270" width="345" height="10" rx="5" fill="${C.green}"/>`;
  const steps = [
    { done: true, icon: 'shop' }, { done: true, icon: 'box' }, { done: true, icon: 'scooter' }, { done: false, icon: 'home' }
  ];
  steps.forEach((st, i) => {
    const y = 360 + i * 130;
    if (i < steps.length - 1) b += `<rect x="1006" y="${y + 30}" width="8" height="100" fill="${i < 2 ? C.green : '#dfe5e3'}"/>`;
    b += st.done ? check(1010, y, 30) : `<circle cx="1010" cy="${y}" r="42" fill="${C.cream}"/><circle cx="1010" cy="${y}" r="28" fill="#ffffff" stroke="${C.saffron}" stroke-width="7"/><circle cx="1010" cy="${y}" r="10" fill="${C.saffron}"/>`;
    // little picture of the step
    const ix = 1100, iy = y;
    if (st.icon === 'shop') b += `<rect x="${ix - 30}" y="${iy - 14}" width="60" height="40" fill="${C.soft}"/><path d="M${ix - 38} ${iy - 14} L${ix + 38} ${iy - 14} L${ix + 28} ${iy - 36} L${ix - 28} ${iy - 36} Z" fill="${C.green}"/><rect x="${ix - 10}" y="${iy + 2}" width="20" height="24" fill="${C.green}"/>`;
    if (st.icon === 'box') b += `<rect x="${ix - 30}" y="${iy - 26}" width="60" height="52" rx="4" fill="#c9954f"/><rect x="${ix - 30}" y="${iy - 26}" width="60" height="14" fill="#b07f3c"/><rect x="${ix - 6}" y="${iy - 26}" width="12" height="52" fill="${C.cream}"/>`;
    if (st.icon === 'scooter') b += `<circle cx="${ix - 24}" cy="${iy + 18}" r="11" fill="${C.ink}"/><circle cx="${ix + 26}" cy="${iy + 18}" r="11" fill="${C.ink}"/><path d="M${ix - 36} ${iy + 10} Q${ix - 36} ${iy - 10} ${ix - 10} ${iy - 10} L${ix + 6} ${iy - 10} L${ix + 6} ${iy + 10} Z" fill="${C.green}"/><path d="M${ix + 6} ${iy + 10} L${ix + 22} ${iy - 26}" stroke="${C.deep}" stroke-width="7" stroke-linecap="round"/><rect x="${ix - 40}" y="${iy - 34}" width="28" height="24" rx="3" fill="${C.saffron}"/>`;
    if (st.icon === 'home') b += `<path d="M${ix - 36} ${iy - 4} L${ix} ${iy - 34} L${ix + 36} ${iy - 4} Z" fill="${C.red}"/><rect x="${ix - 26}" y="${iy - 6}" width="52" height="34" fill="${C.wall}" stroke="#dfe5e3" stroke-width="3"/><rect x="${ix - 8}" y="${iy + 6}" width="16" height="22" fill="${C.wood}"/>`;
    b += bar(1160, y - 18, i === 3 ? 170 : 210, 18, i === 3 ? C.saffron : C.ink) + bar(1160, y + 12, 140);
  });
  fs.writeFileSync(OUT + 'banner-track.svg', svg(W, H, b, 'A map with the route of an order and a card showing it packed and on the way'));
}

// ---------- the home page: drops that become an ocean ----------
{
  const W = 1200, H = 800;
  let b = `<rect width="${W}" height="${H}" fill="#fbf7ee"/><circle cx="980" cy="160" r="150" fill="${C.cream}"/>`;
  const colors = [C.blue, C.red, C.mid, C.gold, C.saffron, C.green];
  let i = 0;
  for (let row = 0; row < 5; row++) {
    const count = 9 - row;
    for (let j = 0; j < count; j++) {
      const span = 980 - row * 140;
      const x = 600 - span / 2 + (span / Math.max(1, count - 1)) * j + ((row * 37 + j * 53) % 40) - 20;
      const y = 90 + row * 78 + ((j * 29) % 30);
      b += drop(x, y, 22 - row * 1.5, colors[i++ % colors.length]);
    }
  }
  b += `<path d="M0 600 C150 560 300 640 450 600 C600 560 750 640 900 600 C1020 568 1110 610 1200 596 L1200 800 L0 800 Z" fill="${C.light}"/>
<path d="M0 650 C170 610 330 690 500 650 C670 610 830 690 1000 650 C1080 632 1150 650 1200 646 L1200 800 L0 800 Z" fill="${C.mid}"/>
<path d="M0 710 C200 676 400 744 600 708 C800 672 1000 744 1200 704 L1200 800 L0 800 Z" fill="${C.green}"/>`;
  // a shopping bag riding the wave
  b += `<g transform="rotate(-6 600 560)">${shoppingBag(540, 520, 120, 92, C.saffron)}</g>`;
  b += `<path d="M470 622 Q520 600 560 616 M650 612 Q690 596 730 614" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`;
  fs.writeFileSync(OUT + 'together.svg', svg(W, H, b, 'Many colourful drops falling together into a wave that carries a shopping bag'));
}

// ---------- the About page: the marketplace on a phone ----------
{
  const W = 1000, H = 700;
  let b = `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#17211f" flood-opacity="0.16"/></filter></defs>
<circle cx="500" cy="380" r="300" fill="${C.soft}"/>${prayerFlags(150, 120, 500, 200, 850, 110, 11, 28)}`;
  b += `<g filter="url(#sh)"><rect x="380" y="150" width="240" height="480" rx="34" fill="${C.ink}"/></g>
<rect x="392" y="162" width="216" height="456" rx="24" fill="#ffffff"/>
<rect x="392" y="162" width="216" height="70" rx="24" fill="${C.green}"/><rect x="392" y="200" width="216" height="32" fill="${C.green}"/>
${bar(412, 186, 110, 12, '#ffffff')}`;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const x = 410 + c * 98, y = 252 + r * 150;
    b += `<rect x="${x}" y="${y}" width="84" height="132" rx="12" fill="${C.soft}"/><rect x="${x + 10}" y="${y + 10}" width="64" height="62" rx="8" fill="${[C.gold, C.red, C.blue, C.mid][r * 2 + c]}"/>${bar(x + 10, y + 84, 56, 10)}${bar(x + 10, y + 104, 38, 10, C.green)}`;
  }
  b += `<rect x="410" y="560" width="180" height="40" rx="20" fill="${C.green}"/>${bar(450, 574, 100, 12, '#ffffff')}`;
  b += building(110, 600, 200, 210, C.red, { windows: 2 }) + shopFront(140, 600, 140, 96, C.green, [C.red, 'jar', C.blue, C.gold]);
  b += rider(810, 620, 0.85);
  b += shoppingBag(300, 560, 70, 56, C.saffron) + star(700, 220, 24, C.gold) + star(760, 290, 16, C.saffron) + star(250, 250, 18, C.gold);
  fs.writeFileSync(OUT + 'about.svg', svg(W, H, b, 'A phone showing the online shop, with a local shop and a delivery rider around it'));
}

for (const f of fs.readdirSync(OUT)) console.log(f, fs.statSync(OUT + f).size, 'bytes');
