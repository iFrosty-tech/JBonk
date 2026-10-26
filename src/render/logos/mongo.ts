import { type G, type SpriteDef, TAU, makeCanvas } from '../draw';
import { images } from './images';

// MongoDB: la foglia originale divisa lungo la nervatura in metà sinistra, metà destra e gambo
// (assets/mongo-leaf.webp). In volo la foglia si ribalta su se stessa e mostra il rovescio, più chiaro;
// quando colpisce si "shardizza": le due metà e il gambo si separano.

interface Part {
  dx: number; // posizione nel logo (224×224)
  dy: number;
  w: number;
  h: number;
  sx: number; // posizione nel foglio mongo-leaf.webp (tutte le parti hanno sy = 3)
}
const SY = 3;
const LEFT: Part = { dx: 63.5, dy: 5.5, w: 50, h: 186, sx: 3 };
const RIGHT: Part = { dx: 112.5, dy: 9, w: 48, h: 181, sx: 56 };
const STEM: Part = { dx: 106.5, dy: 166, w: 14, h: 52, sx: 107 };
// riquadro della foglia intera nel logo e nervatura (asse del ribaltamento)
const BOX = { x: 62, y: 4, w: 100, h: 216 };
const AXIS = 113 - BOX.x;

let leafCache: { front: HTMLCanvasElement; back: HTMLCanvasElement } | null = null;

function part(g: G, im: HTMLImageElement, p: Part, x: number, y: number) {
  g.drawImage(im, p.sx, SY, p.w, p.h, x, y, p.w, p.h);
}

/** Foglia ricomposta dalle tre parti, più il suo rovescio (specchiato e più chiaro). */
function leaf() {
  if (leafCache) return leafCache;
  const im = images.get('mongo');
  if (!im) return null;
  const front = makeCanvas(BOX.w, BOX.h);
  const f = front.getContext('2d')!;
  for (const p of [LEFT, RIGHT, STEM]) part(f, im, p, p.dx - BOX.x, p.dy - BOX.y);
  const back = makeCanvas(BOX.w, BOX.h);
  const b = back.getContext('2d')!;
  b.translate(AXIS * 2, 0); // specchiato attorno alla nervatura
  b.scale(-1, 1);
  b.drawImage(front, 0, 0);
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = 'rgba(214,240,196,0.42)';
  b.fillRect(0, 0, BOX.w, BOX.h);
  // la nervatura sul rovescio sporge ed è più evidente
  b.globalCompositeOperation = 'source-over';
  b.strokeStyle = 'rgba(232,236,214,0.9)';
  b.lineWidth = 3;
  b.beginPath();
  b.moveTo(AXIS, 14);
  b.quadraticCurveTo(AXIS + 2, 110, AXIS, BOX.h - 4);
  b.stroke();
  leafCache = { front, back };
  return leafCache;
}

/** La foglia che si ribalta attorno alla nervatura, in prospettiva (una colonna di pixel alla volta). */
function mongoTumble(g: G, i: number, n: number) {
  const l = leaf();
  if (!l) return;
  const th = (i / n) * TAU;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const k = 112 / BOX.h;
  const cx = 64;
  const cy = 64;
  const dist = 260;
  const src = c >= 0 ? l.front : l.back;
  for (let x = 0; x < BOX.w; x += 2) {
    const xa = (x - AXIS) * k;
    const xb = (x + 2 - AXIS) * k;
    const fa = dist / (dist + xa * s);
    const fb = dist / (dist + xb * s);
    const sa = cx + xa * c * fa;
    const sb = cx + xb * c * fb;
    const f = (fa + fb) / 2;
    const h = BOX.h * k * f;
    g.drawImage(src, x, 0, 2, BOX.h, Math.min(sa, sb) - 0.3, cy - h / 2, Math.abs(sb - sa) + 0.6, h);
  }
  // di taglio resta visibile la nervatura
  if (Math.abs(c) < 0.25) {
    g.fillStyle = '#c9c7a6';
    g.fillRect(cx - 1.5, cy - 52, 3, 104);
  }
  // ombreggiatura: più è di taglio, più è scura
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(10,40,10,${(1 - Math.abs(c)) * 0.35})`;
  g.fillRect(0, 0, 128, 128);
  g.restore();
}

/** Una delle parti, centrata nella cella alla stessa scala della foglia intera. */
function mongoPart(g: G, p: Part, k: number) {
  const im = images.get('mongo');
  if (!im) return;
  g.drawImage(im, p.sx, SY, p.w, p.h, 64 - (p.w * k) / 2, 64 - (p.h * k) / 2, p.w * k, p.h * k);
}

/** Schegge e anello verde quando la foglia si divide. */
function mongoBurst(g: G, i: number, n: number) {
  const t = (i + 1) / n;
  g.globalAlpha = 1 - t * 0.55;
  g.strokeStyle = '#8fdc7a';
  g.lineWidth = 12 * (1 - t) + 2;
  g.beginPath();
  g.arc(64, 64, 12 + t * 44, 0, TAU);
  g.stroke();
  for (let j = 0; j < 7; j++) {
    const a = (j / 7) * TAU + 0.4;
    const d = 16 + t * 42;
    const sz = 1 - t * 0.5;
    g.save();
    g.translate(64 + Math.cos(a) * d, 64 + Math.sin(a) * d);
    g.rotate(a + t * 3);
    g.fillStyle = j % 2 ? '#5fb04a' : '#3f9a3a';
    g.beginPath();
    g.ellipse(0, 0, 10 * sz, 4.5 * sz, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
}

export const MONGO_SPRITES: SpriteDef[] = [
  { id: 'mongo', cw: 1, ch: 1, frames: 12, draw: (g, _w, _h, i, n) => mongoTumble(g, i, n) },
  { id: 'mongo_l', cw: 1, ch: 1, draw: (g) => mongoPart(g, LEFT, 0.6) },
  { id: 'mongo_r', cw: 1, ch: 1, draw: (g) => mongoPart(g, RIGHT, 0.6) },
  { id: 'mongo_stem', cw: 1, ch: 1, draw: (g) => mongoPart(g, STEM, 1.6) },
  { id: 'mongo_burst', cw: 1, ch: 1, frames: 5, sticker: false, draw: (g, _w, _h, i, n) => mongoBurst(g, i, n) },
];
