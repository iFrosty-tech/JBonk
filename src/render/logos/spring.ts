import { type G, type SpriteDef, TAU, makeCanvas } from '../draw';
import { images } from './images';

// Spring: il logo originale (assets/spring.webp) lanciato come un frisbee.
// 'spring' è il logo piatto (icona); 'spring_spin' è il disco visto in prospettiva che gira:
// il logo ruota sulla faccia superiore, sotto c'è lo spessore del bordo e la luce resta ferma.

const RIM = '#3d7a1d';
let rimCache: HTMLCanvasElement | null = null;

/** Sagoma del logo tutta in verde scuro: impilata più volte fa lo spessore del disco. */
function rim(im: HTMLImageElement) {
  if (rimCache) return rimCache;
  const c = makeCanvas(im.width, im.height);
  const g = c.getContext('2d')!;
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = RIM;
  g.fillRect(0, 0, c.width, c.height);
  return (rimCache = c);
}

function springLogo(g: G) {
  const im = images.get('spring');
  if (!im) return;
  g.drawImage(im, 8, 8, 112, 112);
}

function springDisc(g: G, i: number, n: number) {
  const im = images.get('spring');
  if (!im) return;
  const th = (i / n) * TAU;
  const s = 108; // diametro del disco
  const tilt = 0.46; // il disco è inclinato verso la camera: il cerchio diventa un'ellisse
  const cx = 64;
  const cy = 58;
  const face = (src: CanvasImageSource, dy: number) => {
    g.save();
    g.translate(cx, cy + dy);
    g.scale(1, tilt);
    g.rotate(th);
    g.drawImage(src, -s / 2, -s / 2, s, s);
    g.restore();
  };
  const r = rim(im);
  for (let k = 11; k >= 1; k--) face(r, k);
  face(im, 0);
  // riflesso fisso in alto a sinistra: il logo gira sotto la luce
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const hl = g.createRadialGradient(cx - 22, cy - 12, 2, cx - 22, cy - 12, 46);
  hl.addColorStop(0, 'rgba(255,255,255,0.5)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, 128, 128);
  g.restore();
}

export const SPRING_SPRITES: SpriteDef[] = [
  { id: 'spring', cw: 1, ch: 1, draw: springLogo },
  { id: 'spring_spin', cw: 1, ch: 1, frames: 12, draw: (g, _w, _h, i, n) => springDisc(g, i, n) },
];
