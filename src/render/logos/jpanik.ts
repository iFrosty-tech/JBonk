import { type G, type SpriteDef, TAU } from '../draw';

// JPanik: il logo a esagoni ricostruito in vettoriale. Ogni esagono è stato misurato
// sull'originale (200×200) ed è anche uno sprite a sé ('jpanik_c0'…'jpanik_c7').
// Nel gioco gli esagoni formano un alveare sopra il giocatore, si staccano uno alla volta
// per inseguire i nemici ('jpanik_fly', un prisma che si ribalta) e poi ricrescono al loro posto.

const FACE = '#fc4c02';
const LIP = '#ffae82'; // il bordo chiaro sotto ogni esagono, che dà spessore
const SIDE = '#c93a00';

// vertici di ogni esagono nel logo, dall'alto in basso
const HEXES: number[][] = [
  [79.8, 40.4, 94, 18, 113, 15, 123, 36, 112, 53, 86, 56.1],
  [140, 60, 154, 32, 184.4, 28.9, 201.5, 51.7, 185, 77, 156, 80],
  [48.1, 78.5, 61.4, 60.5, 77.9, 58.2, 85.3, 78.4, 70, 98, 53, 98],
  [-1, 98.1, 13, 82, 25.7, 80.8, 30.3, 99.1, 18.9, 116.1, 1.7, 114],
  [72.6, 98.4, 83, 81, 107, 76, 119, 103, 103.4, 124.8, 79.8, 121.8],
  [40.6, 117.4, 52.2, 99, 71, 100, 78, 121, 65, 144, 44.8, 140.6],
  [106.6, 126.1, 124, 101, 152, 101, 174, 130, 150, 164, 118.4, 154.8],
  [67, 144, 80, 124, 105.6, 128.1, 117.2, 157, 102, 182, 75, 176],
];
const CENTER = { x: 100.25, y: 98.5 }; // centro del riquadro del logo
const CELL_SCALE = 1.45; // px di cella per px del logo, uguale per tutti gli esagoni

function centroid(h: number[]) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 12; i += 2) {
    x += h[i];
    y += h[i + 1];
  }
  return { x: x / 6, y: y / 6 };
}

/** Esagono con gli angoli arrotondati: rientra verso il centro e si ripassa con un tratto tondo. */
function hexShape(g: G, h: number[], ox: number, oy: number, k: number, color: string) {
  const c = centroid(h);
  const inset = 2.2;
  g.beginPath();
  for (let i = 0; i < 12; i += 2) {
    const dx = h[i] - c.x;
    const dy = h[i + 1] - c.y;
    const d = Math.hypot(dx, dy);
    const f = (d - inset) / d;
    const x = ox + (c.x + dx * f) * k;
    const y = oy + (c.y + dy * f) * k;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = inset * 2 * k;
  g.lineJoin = 'round';
  g.fill();
  g.stroke();
}

function hexTile(g: G, h: number[], ox: number, oy: number, k: number) {
  hexShape(g, h, ox + 0.8 * k, oy + 2.4 * k, k, LIP);
  hexShape(g, h, ox, oy, k, FACE);
}

/** Il logo intero centrato in (cx, cy); `k` = px per px del logo originale (200×200). */
export function drawJpanikLogo(g: G, cx = 64, cy = 64, k = 0.58) {
  const ox = cx - CENTER.x * k;
  const oy = cy - CENTER.y * k;
  for (const h of HEXES) hexTile(g, h, ox, oy, k);
}

/** Un solo esagono del logo, centrato nella sua cella. */
function jpanikCell(g: G, idx: number) {
  const h = HEXES[idx];
  const c = centroid(h);
  hexTile(g, h, 64 - c.x * CELL_SCALE, 64 - c.y * CELL_SCALE, CELL_SCALE);
}

/** Esagono in volo: un prisma che si ribalta (mezzo giro basta, le due facce sono uguali). */
function hexPrism(g: G, i: number, n: number) {
  const ph = (i / n) * Math.PI;
  const c = Math.cos(ph);
  const s = Math.sin(ph);
  const R = 42;
  const T = 18;
  const sy = Math.max(0.12, Math.abs(c));
  const off = T * s * (c >= 0 ? 1 : -1);
  const hex = (dy: number, color: string) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const x = 64 + Math.cos(a) * R;
      const y = 64 + dy + Math.sin(a) * R * sy;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  const layers = 9;
  for (let j = layers; j >= 1; j--) hex(off * (j / layers) - off / 2, j % 2 ? SIDE : '#d44100');
  hex(-off / 2, FACE);
  // riflesso sul bordo alto della faccia
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,214,170,0.55)';
  g.fillRect(0, 64 - off / 2 - R * sy, 128, R * sy * 0.45);
  g.restore();
}

/** Impatto: un esagono-onda che si allarga e sei schegge esagonali che volano via. */
function hexBurst(g: G, i: number, n: number) {
  const t = (i + 1) / n;
  const ring = (r: number, lw: number, color: string) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      if (k === 0) g.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      else g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.closePath();
    g.lineWidth = lw;
    g.strokeStyle = color;
    g.lineJoin = 'round';
    g.stroke();
  };
  ring(14 + t * 40, 14 * (1 - t) + 3, FACE);
  if (t < 0.6) ring(8 + t * 30, 5, LIP);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + Math.PI / 6;
    const d = 20 + t * 38;
    const r = 9 * (1 - t * 0.6);
    g.beginPath();
    for (let j = 0; j < 6; j++) {
      const b = (j / 6) * TAU + t * 2;
      const x = 64 + Math.cos(a) * d + Math.cos(b) * r;
      const y = 64 + Math.sin(a) * d + Math.sin(b) * r;
      if (j === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = k % 2 ? FACE : '#ff7a3a';
    g.fill();
  }
}

/** Disposizione dell'alveare per l'arma 'swarm': posizione di ogni cella e scala degli sprite. */
export interface HiveLayout {
  cells: { x: number; y: number }[]; // centro di ogni cella, in px del logo rispetto al centro del logo
  cellPx: number; // px del logo coperti dall'altezza di uno sprite-cella
  size: number; // larghezza del logo in px
}

export const JPANIK_HIVE: HiveLayout = {
  cells: HEXES.map((h) => {
    const c = centroid(h);
    return { x: c.x - CENTER.x, y: c.y - CENTER.y };
  }),
  cellPx: 128 / CELL_SCALE,
  size: 203,
};

export const JPANIK_SPRITES: SpriteDef[] = [
  { id: 'jpanik', cw: 1, ch: 1, draw: (g) => drawJpanikLogo(g) },
  ...HEXES.map((_, idx): SpriteDef => ({ id: `jpanik_c${idx}`, cw: 1, ch: 1, draw: (g) => jpanikCell(g, idx) })),
  { id: 'jpanik_fly', cw: 1, ch: 1, frames: 8, draw: (g, _w, _h, i, n) => hexPrism(g, i, n) },
  { id: 'jpanik_burst', cw: 1, ch: 1, frames: 6, draw: (g, _w, _h, i, n) => hexBurst(g, i, n) },
];
