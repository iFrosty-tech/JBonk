import { type G, type SpriteDef, TAU, line, makeCanvas, rr, txt } from '../draw';
import { images } from './images';

// Soldo: la carta prepagata originale che gira in prospettiva, con il retro disegnato.

let soldoBack: HTMLCanvasElement | null = null;
/** Retro della carta: banda magnetica, pannello firma e logo. */
function cardBack(w: number, h: number) {
  if (soldoBack) return soldoBack;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.beginPath();
  g.roundRect(0, 0, w, h, 11);
  g.fillStyle = '#121214';
  g.fill();
  g.save();
  g.clip();
  const band = g.createLinearGradient(0, 30, 0, 72);
  band.addColorStop(0, '#2b2b30');
  band.addColorStop(1, '#3c3c44');
  g.fillStyle = band;
  g.fillRect(0, 34, w, 40);
  g.restore();
  g.fillStyle = '#ece8df';
  g.fillRect(16, 96, 120, 26);
  g.strokeStyle = '#cfc8b8';
  g.lineWidth = 2;
  for (let x = 16; x < 136; x += 8) line(g, [x, 96, x + 8, 122], '#d8d1c2', 2);
  g.fillStyle = '#fff';
  g.fillRect(142, 96, 40, 26);
  txt(g, '•••', 162, 109, 14, '#1d2333', '900');
  for (let k = 0; k < 3; k++) {
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(16, 148 + k * 12, 110 - k * 26, 5);
  }
  g.shadowColor = '#ff5fa2';
  g.shadowBlur = 16;
  txt(g, 'soldo', 64, h - 36, 34, '#ffffff', '800');
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.arc(w - 52, h - 36, 16, 0, TAU);
  g.arc(w - 32, h - 36, 16, 0, TAU);
  g.fill();
  return (soldoBack = c);
}

/** Carta Soldo che gira su se stessa in prospettiva, con riflesso quando è di fronte. */
function soldoCard(g: G, i: number, n: number) {
  const im = images.get('soldo');
  if (!im) return;
  const back = cardBack(im.width, im.height);
  const th = (i / n) * TAU;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const H = 108;
  const W = (H * im.width) / im.height;
  const cx = 64;
  const cy = 67;
  const dist = 230; // distanza della "camera": più è bassa, più la prospettiva è forte
  const src = c >= 0 ? im : back;
  const cols = 48;
  const sw = im.width / cols;
  for (let j = 0; j < cols; j++) {
    const xa = (j / cols - 0.5) * W;
    const xb = ((j + 1) / cols - 0.5) * W;
    const fa = dist / (dist + xa * s);
    const fb = dist / (dist + xb * s);
    const sa = cx + xa * c * fa;
    const sb = cx + xb * c * fb;
    const f = (fa + fb) / 2;
    const u = c >= 0 ? j : cols - 1 - j; // il retro si legge dritto
    g.drawImage(src, u * sw, 0, sw, im.height, Math.min(sa, sb) - 0.3, cy - (H * f) / 2, Math.abs(sb - sa) + 0.6, H * f);
  }
  if (Math.abs(c) < 0.2) rr(g, cx - 2, cy - H / 2, 4, H, 2, '#d8dbe2', false);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(10,10,20,${(1 - Math.abs(c)) * 0.4})`;
  g.fillRect(0, 0, 128, 128);
  if (c > 0.3) {
    const gx = cx - s * 70;
    const grad = g.createLinearGradient(gx - 22, cy - 30, gx + 22, cy + 30);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  g.restore();
}

export const SOLDO_SPRITES: SpriteDef[] = [{ id: 'soldo', cw: 1, ch: 1, frames: 16, draw: (g, _w, _h, i, n) => soldoCard(g, i, n) }];
