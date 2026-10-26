import { type G, type SpriteDef, TAU, line } from '../draw';

// Claude Code: la mascotte in pixel art (camminata, riposo, attacco) e il simbolo di Claude per i colpi.

const CLAUDE = '#d97757';

interface CrabPose {
  bob?: number; // sollevamento del corpo, in "pixel" della mascotte
  liftA?: number; // zampe 1 e 3 sollevate
  liftB?: number; // zampe 2 e 4 sollevate
  armL?: number; // spostamento verticale delle braccia (negativo = in alto)
  armR?: number;
  squash?: number; // <1 schiacciato, >1 allungato
  eyes?: 'open' | 'blink' | 'squint';
}

/** La mascotte di Claude Code: corpo 9×6 "pixel", due braccia, quattro zampe, piedi a y=122. */
function crab(g: G, o: CrabPose) {
  const p = 10;
  const sq = o.squash ?? 1;
  const bw = 9 * p * (1 + (1 - sq) * 0.6);
  const bh = 6 * p * sq;
  const u = bw / 9; // larghezza di un pixel del corpo
  const ground = 122;
  const bottom = ground - 2 * p - (o.bob ?? 0) * p;
  const top = bottom - bh;
  const left = 64 - bw / 2;
  g.fillStyle = CLAUDE;
  // zampe sotto le colonne 0, 2, 6, 8; coppie diagonali: A = 0 e 6, B = 2 e 8
  [0, 2, 6, 8].forEach((col, k) => {
    const lift = (k % 2 === 0 ? o.liftA : o.liftB) ?? 0;
    const lx = left + col * u + (lift > 0 ? 0.35 * p : 0);
    g.fillRect(lx, bottom - 1, u, ground - lift * p - bottom + 1);
  });
  g.fillRect(left, top, bw, bh);
  const armY = top + bh / 3;
  g.fillRect(left - p, armY + (o.armL ?? 0) * p, p + 1, 2 * p);
  g.fillRect(left + bw - 1, armY + (o.armR ?? 0) * p, p + 1, 2 * p);
  const ey = top + bh / 3;
  for (const col of [1, 7]) {
    const ex = left + col * u;
    g.fillStyle = '#000';
    if (o.eyes === 'blink') g.fillRect(ex, ey + p * 0.4, u, p * 0.25);
    else if (o.eyes === 'squint') {
      // > <  (concentrato)
      const pts = col === 1 ? [ex, ey, ex + u, ey + p / 2, ex, ey + p] : [ex + u, ey, ex, ey + p / 2, ex + u, ey + p];
      line(g, pts, '#000', 3.2);
    } else g.fillRect(ex, ey, u, p);
  }
}

const CRAB_WALK: CrabPose[] = [
  {},
  { bob: 0.5, liftA: 1, armL: -0.5, armR: 0.3 },
  { bob: 0.15 },
  { bob: 0.5, liftB: 1, armL: 0.3, armR: -0.5 },
];
const CRAB_HIT: CrabPose[] = [
  { squash: 0.86, armL: 0.6, armR: 0.6, eyes: 'squint' }, // carica
  { squash: 1.08, bob: 1.2, liftA: 0.6, liftB: 0.6, armL: -2.4, armR: -2.4, eyes: 'squint' }, // colpo
  { squash: 0.94, armL: -1, armR: -1 }, // atterraggio
];

/** Il simbolo di Claude: raggi irregolari attorno al centro (effetto dei colpi). */
function claudeSpark(g: G) {
  const rays = [1, 0.74, 0.94, 0.68, 0.98, 0.8, 0.9, 0.7, 1, 0.78, 0.88, 0.72];
  g.strokeStyle = CLAUDE;
  g.lineCap = 'round';
  rays.forEach((k, i) => {
    const a = (i / rays.length) * TAU + 0.12;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + c * 30 * k, 64 + s * 30 * k);
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(64 + c * 28 * k, 64 + s * 28 * k);
    g.lineTo(64 + c * 56 * k, 64 + s * 56 * k);
    g.stroke();
  });
}

export const CLAUDE_SPRITES: SpriteDef[] = [
  { id: 'claude', cw: 1, ch: 1, frames: CRAB_WALK.length, draw: (g, _w, _h, i) => crab(g, CRAB_WALK[i]) },
  { id: 'claude_idle', cw: 1, ch: 1, frames: 2, draw: (g, _w, _h, i) => crab(g, { eyes: i ? 'blink' : 'open' }) },
  { id: 'claude_hit', cw: 1, ch: 1, frames: CRAB_HIT.length, draw: (g, _w, _h, i) => crab(g, CRAB_HIT[i]) },
  { id: 'claude_spark', cw: 1, ch: 1, draw: claudeSpark, sticker: false },
];
