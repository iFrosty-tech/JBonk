import { type G, type SpriteDef, TAU, makeCanvas, txt } from '../draw';
import { images } from './images';

// JOscar, la statuetta del premio aziendale (assets/joscar.webp: parte dorata e base nera separate).
// La luce scorre solo sull'oro; sulla base c'è la targhetta col nome del premio.
// Intorno: fasci di luce da palco, scintille e coriandoli per la premiazione.

interface Part {
  dx: number; // posizione nella statuetta intera (185×480)
  dy: number;
  w: number;
  h: number;
  sx: number; // posizione nel foglio (tutte le parti hanno sy = 3)
}
const SY = 3;
const GOLD: Part = { dx: 31.8, dy: 1.9, w: 108, h: 371, sx: 3 };
const BASE: Part = { dx: 2.3, dy: 353.8, w: 167, h: 125, sx: 114 };
const AXIS_X = 85.8; // asse verticale della statuetta
const BOTTOM = 478.8;

let work: { gold: HTMLCanvasElement; base: HTMLCanvasElement } | null = null;

function layers() {
  const im = images.get('joscar');
  if (!im) return null;
  if (!work) {
    const base = makeCanvas(BASE.w, BASE.h);
    const b = base.getContext('2d')!;
    b.drawImage(im, BASE.sx, SY, BASE.w, BASE.h, 0, 0, BASE.w, BASE.h);
    // targhetta dorata sul cilindro della base
    const px = AXIS_X - BASE.dx;
    const plate = b.createLinearGradient(0, 28, 0, 48);
    plate.addColorStop(0, '#fbe08a');
    plate.addColorStop(0.5, '#e2b145');
    plate.addColorStop(1, '#a8761f');
    b.beginPath();
    b.roundRect(px - 44, 28, 88, 21, 4);
    b.fillStyle = plate;
    b.fill();
    b.lineWidth = 2;
    b.strokeStyle = '#4a3412';
    b.stroke();
    txt(b, 'JOSCAR', px, 39, 15, '#3d2a0c', '900', 'Georgia, "Times New Roman", serif');
    work = { gold: makeCanvas(GOLD.w, GOLD.h), base };
  }
  return { im, ...work };
}

/** Statuetta (cella 128×256, piedi a y=250). `shine` 0..1 è la posizione del riflesso, <0 senza riflesso. */
function joscar(g: G, shine: number) {
  const L = layers();
  if (!L) return;
  const gg = L.gold.getContext('2d')!;
  gg.globalCompositeOperation = 'source-over';
  gg.clearRect(0, 0, GOLD.w, GOLD.h);
  gg.drawImage(L.im, GOLD.sx, SY, GOLD.w, GOLD.h, 0, 0, GOLD.w, GOLD.h);
  if (shine >= 0) {
    // banda di luce in diagonale, solo dove c'è oro
    gg.globalCompositeOperation = 'source-atop';
    const p = -0.25 + shine * 1.5;
    const grad = gg.createLinearGradient(0, 0, GOLD.w, GOLD.h * 0.42);
    const stop = (v: number) => Math.min(1, Math.max(0, v));
    grad.addColorStop(stop(p - 0.12), 'rgba(255,252,225,0)');
    grad.addColorStop(stop(p), 'rgba(255,252,225,0.85)');
    grad.addColorStop(stop(p + 0.05), 'rgba(255,252,225,0.2)');
    grad.addColorStop(stop(p + 0.1), 'rgba(255,252,225,0.6)');
    grad.addColorStop(stop(p + 0.16), 'rgba(255,252,225,0)');
    gg.fillStyle = grad;
    gg.fillRect(0, 0, GOLD.w, GOLD.h);
  }
  const k = 236 / 480;
  const x0 = 64 - AXIS_X * k;
  const y0 = 250 - BOTTOM * k;
  g.drawImage(L.base, x0 + BASE.dx * k, y0 + BASE.dy * k, BASE.w * k, BASE.h * k);
  g.drawImage(L.gold, x0 + GOLD.dx * k, y0 + GOLD.dy * k, GOLD.w * k, GOLD.h * k);
}

/** Fasci di luce da palco, a ventaglio dal basso (dietro la statuetta). */
function stageRays(g: G) {
  const cx = 64;
  const cy = 126;
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.27;
    const len = 118 - Math.abs(k - 3) * 6;
    const grad = g.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    grad.addColorStop(0, 'rgba(255,238,170,0.85)');
    grad.addColorStop(1, 'rgba(255,238,170,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx + Math.cos(a + Math.PI / 2) * 3, cy);
    g.lineTo(cx + Math.cos(a - 0.08) * len, cy + Math.sin(a - 0.08) * len);
    g.lineTo(cx + Math.cos(a + 0.08) * len, cy + Math.sin(a + 0.08) * len);
    g.lineTo(cx - Math.cos(a + Math.PI / 2) * 3, cy);
    g.closePath();
    g.fill();
  }
  const glow = g.createRadialGradient(cx, cy, 2, cx, cy, 40);
  glow.addColorStop(0, 'rgba(255,245,200,0.9)');
  glow.addColorStop(1, 'rgba(255,245,200,0)');
  g.fillStyle = glow;
  g.fillRect(0, 60, 128, 68);
}

/** Scintilla a quattro punte. */
function sparkle(g: G) {
  const glow = g.createRadialGradient(64, 64, 2, 64, 64, 34);
  glow.addColorStop(0, 'rgba(255,248,210,0.95)');
  glow.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = glow;
  g.fillRect(20, 20, 88, 88);
  g.fillStyle = '#fffbe8';
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - Math.PI / 2;
    const r = k % 2 ? 7 : 56;
    if (k === 0) g.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    else g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

const CONFETTI = ['#e8554e', '#ffd23f', '#39b26a', '#4c86ff', '#ee7f01', '#b48cff', '#2bb3a3'];
// pezzetti di carta: posizione, rotazione, fase del ribaltamento
const BITS = [
  [34, 30, 0.3, 0],
  [86, 24, -0.6, 1.1],
  [60, 58, 1.1, 2.3],
  [26, 84, -0.2, 3.1],
  [96, 70, 0.8, 4.2],
  [70, 100, -1.2, 5.0],
  [44, 108, 0.5, 0.7],
];

/** Coriandoli: ogni pezzetto si ribalta (la larghezza segue il coseno) e cambia sfumatura. */
function confetti(g: G, i: number, n: number) {
  const t = (i / n) * TAU;
  BITS.forEach(([x, y, rot, ph], j) => {
    const c = Math.cos(t + ph);
    g.save();
    g.translate(x, y);
    g.rotate(rot + Math.sin(t + ph) * 0.4);
    g.fillStyle = CONFETTI[j % CONFETTI.length];
    g.fillRect(-12 * Math.max(0.12, Math.abs(c)), -5, 24 * Math.max(0.12, Math.abs(c)), 10);
    if (c < 0) {
      g.fillStyle = 'rgba(0,0,0,0.18)'; // il retro è un po' più scuro
      g.fillRect(-12 * Math.abs(c), -5, 24 * Math.abs(c), 10);
    }
    g.restore();
  });
}

export const JOSCAR_SHINE_FRAMES = 7;

export const JOSCAR_SPRITES: SpriteDef[] = [
  // fotogramma 0 senza riflesso (icona), poi il riflesso che attraversa la statuetta
  { id: 'joscar', cw: 1, ch: 2, frames: JOSCAR_SHINE_FRAMES, draw: (g, _w, _h, i, n) => joscar(g, i === 0 ? -1 : (i - 1) / (n - 2)) },
  { id: 'joscar_rays', cw: 1, ch: 1, sticker: false, draw: stageRays },
  { id: 'sparkle', cw: 1, ch: 1, sticker: false, draw: sparkle },
  { id: 'confetti', cw: 1, ch: 1, frames: 6, sticker: false, draw: (g, _w, _h, i, n) => confetti(g, i, n) },
];
