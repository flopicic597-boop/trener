// Прави PNG иконе апликације без спољних алата: npm run icons
// Футуристички изглед (верзија 1.2): тамна позадина са дубинским сјајем, неон хексагон
// (цијан → љубичаста) и тег у средини. Садржај је у безбједној зони за „maskable“ иконе
// (Android их исијеца у круг/заобљени квадрат).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, shade) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 4; // 4×4 узорака по пикселу (заобљене ивице)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, 1 / size);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4, n = SS * SS;
      raw[o] = clamp(r / n); raw[o + 1] = clamp(g / n); raw[o + 2] = clamp(b / n); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* ---------- геометрија (удаљености, у јединицама слике 0..1) ---------- */
// правилни шестоугао (Inigo Quilez): r = удаљеност од центра до странице.
// Позива се са замијењеним осама (y, x) да би врх био горе, као у логу.
function hexDist(px, py, r) {
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269;
  px = Math.abs(px); py = Math.abs(py);
  const d = 2 * Math.min(kx * px + ky * py, 0);
  px -= d * kx; py -= d * ky;
  px -= Math.max(-kz * r, Math.min(kz * r, px)); py -= r;
  return Math.hypot(px, py) * Math.sign(py);
}
// дуж (капсула) од (ax,ay) до (bx,by)
function sdSeg(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

const CYAN = [34, 211, 238], VIOLET = [167, 139, 250], BG0 = [14, 24, 44], BG1 = [4, 7, 15];

function shade(u, v, px) {
  const x = u - 0.5, y = v - 0.5;
  // позадина: радијални сјај из центра + лагана мрежа
  const rr = Math.hypot(x, y);
  let col = mix(BG0, BG1, Math.min(1, rr / 0.72));
  const grid = (a) => { const f = Math.abs(((a * 16) % 1) - 0.5); return f > 0.47 ? 1 : 0; };
  col = mix(col, [40, 70, 120], 0.10 * Math.max(grid(u), grid(v)) * Math.max(0, 1 - rr / 0.6));
  const gcol = (t) => mix(CYAN, VIOLET, Math.max(0, Math.min(1, t)));
  const g = gcol((u + v - 0.55) / 0.9);

  // хексагон: обрис дебљине w, полупречник R (у безбједној зони: R + сјај < 0.40)
  const R = 0.27, w = 0.018;
  const dh = Math.abs(hexDist(y, x, R)) - w;
  // испуна хексагона (благо)
  if (hexDist(y, x, R) < 0) col = mix(col, [20, 60, 90], 0.22);
  // сјај око обриса
  col = mix(col, g, Math.max(0, Math.exp(-Math.max(dh, 0) / 0.035) * 0.55));
  col = mix(col, g, smooth(dh, px));

  // тег: шипка + четири плоче
  const segs = [
    [-0.215, 0, 0.215, 0, 0.016],           // шипка (танка, вири преко тегова)
    [-0.105, -0.115, -0.105, 0.115, 0.042], // унутрашњи тегови (велики)
    [0.105, -0.115, 0.105, 0.115, 0.042],
    [-0.178, -0.068, -0.178, 0.068, 0.026], // спољни тегови (мањи)
    [0.178, -0.068, 0.178, 0.068, 0.026],
  ];
  let ds = Infinity;
  for (const [ax, ay, bx, by, rad] of segs) ds = Math.min(ds, sdSeg(x, y, ax, ay, bx, by) - rad);
  col = mix(col, g, Math.max(0, Math.exp(-Math.max(ds, 0) / 0.03) * 0.45));
  col = mix(col, mix(g, [255, 255, 255], 0.18), smooth(ds, px));
  return col;
}
// 1 унутар облика, 0 ван, глатко на ивици
const smooth = (d, px) => Math.max(0, Math.min(1, 0.5 - d / px));

mkdirSync('public', { recursive: true });
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s, shade));
console.log('Иконе су направљене у public/.');
