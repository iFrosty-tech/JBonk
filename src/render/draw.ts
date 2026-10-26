// Primitive di disegno su canvas condivise dagli sprite (atlas.ts e logos.ts).

export const INK = '#1d2333';
export const TAU = Math.PI * 2;

export type G = CanvasRenderingContext2D;
/** Disegna lo sprite in una cella w×h. Per gli sprite animati `i` è il fotogramma (0..n-1). */
export type DrawFn = (g: G, w: number, h: number, i: number, n: number) => void;
export interface SpriteDef {
  id: string;
  cw: number;
  ch: number;
  draw: DrawFn;
  sticker?: boolean;
  /** Forme sottili (es. loghi a filetti): bordo adesivo calcolato con più passaggi. */
  fine?: boolean;
  /** Numero di fotogrammi dell'animazione (default 1). */
  frames?: number;
}

export function path(g: G, fill: string, stroke = true, lw = 3.5) {
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.lineJoin = 'round';
    g.stroke();
  }
}
export function rr(g: G, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = true, lw = 3.5) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  path(g, fill, stroke, lw);
}
export function circ(g: G, x: number, y: number, r: number, fill: string, stroke = true, lw = 3.5) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  path(g, fill, stroke, lw);
}
export function ell(g: G, x: number, y: number, rx: number, ry: number, fill: string, stroke = true, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  path(g, fill, stroke);
}
export function poly(g: G, pts: number[], fill: string, stroke = true, lw = 3.5) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  path(g, fill, stroke, lw);
}
export function line(g: G, pts: number[], color = INK, lw = 3.5) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}
export function txt(g: G, s: string, x: number, y: number, size: number, color: string, weight = '800', font = 'Arial, Helvetica, sans-serif') {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
