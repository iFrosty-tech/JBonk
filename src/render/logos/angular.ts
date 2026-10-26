import { type G, type SpriteDef, TAU } from '../draw';

// Angular: lo scudo ricostruito dai path SVG ufficiali, che ruota su se stesso.

let ngCache: Record<'shield' | 'right' | 'left' | 'a' | 'aShade', Path2D> | null = null;
/** Path del logo ufficiale (viewBox 256×270). */
function ng() {
  return (ngCache ??= {
    shield: new Path2D('M127.606.341L.849 44.95 20.88 211.022l106.86 58.732 107.412-59.528L255.175 44.16 127.606.341z'),
    right: new Path2D('M242.532 53.758L127.31 14.466v241.256l96.561-53.441 18.66-148.523z'),
    left: new Path2D('M15.073 54.466l17.165 148.525 95.07 52.731V14.462L15.074 54.465z'),
    a: new Path2D('M159.027 142.898L127.31 157.73H93.881l-15.714 39.305-29.228.54L127.31 23.227l31.717 119.672zm-3.066-7.467l-28.44-56.303-23.329 55.334h23.117l28.652.97z'),
    aShade: new Path2D('M127.309 23.226l.21 55.902 26.47 55.377h-26.62l-.06 23.189 36.81.035 17.204 39.852 27.967.518-81.981-174.873z'),
  });
}

/** Scudo di Angular che ruota su se stesso: faccia, spessore del bordo, retro con le cinghie. */
function angularShield(g: G, i: number, n: number) {
  const P = ng();
  const th = (i / n) * TAU;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const ce = Math.sign(c || 1) * Math.max(Math.abs(c), 0.03); // di taglio resta una lama sottile
  const k = 104 / 270;
  const top = 18;
  const D = 20; // spessore dello scudo, in unità SVG
  const near = c >= 0 ? 0 : -D * s;
  const far = c >= 0 ? -D * s : 0;
  const at = (off: number) => {
    g.translate(64 + off * k, top);
    g.scale(k * ce, k);
    g.translate(-128, 0);
  };
  const layers = 8;
  for (let j = 0; j < layers; j++) {
    g.save();
    at(far + (near - far) * (j / layers));
    g.fillStyle = j % 2 ? '#86898f' : '#95989e';
    g.fill(P.shield);
    g.restore();
  }
  g.save();
  at(near);
  if (c >= 0) {
    g.fillStyle = '#B3B3B3';
    g.fill(P.shield);
    g.fillStyle = '#A6120D';
    g.fill(P.right);
    g.fillStyle = '#DD1B16';
    g.fill(P.left);
    g.fillStyle = '#F2F2F2';
    g.fill(P.a);
    g.fillStyle = '#B3B3B3';
    g.fill(P.aShade);
    if (c > 0.5) {
      // riflesso che scorre sulla faccia mentre lo scudo gira
      g.save();
      g.clip(P.shield);
      const gx = 128 - s * 260;
      const grad = g.createLinearGradient(gx - 46, 70, gx + 46, 130);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 270);
      g.restore();
    }
  } else {
    g.fillStyle = '#a7aab0';
    g.fill(P.shield);
    g.fillStyle = '#5c0b08';
    g.fill(P.left);
    g.fill(P.right);
    g.fillStyle = '#4a3b2c';
    g.fillRect(44, 92, 168, 20);
    g.fillRect(52, 164, 152, 20);
    g.fillStyle = '#2f251b';
    g.beginPath();
    g.roundRect(110, 76, 36, 124, 14);
    g.fill();
    g.fillStyle = '#d9dce1';
    for (const [x, y] of [[50, 102], [206, 102], [58, 174], [198, 174]]) {
      g.beginPath();
      g.arc(x, y, 7, 0, TAU);
      g.fill();
    }
  }
  // la faccia si scurisce quando è di taglio
  g.fillStyle = `rgba(25,12,12,${(1 - Math.abs(c)) * 0.45})`;
  g.fill(P.shield);
  g.restore();
}

export const ANGULAR_SPRITES: SpriteDef[] = [{ id: 'angular', cw: 1, ch: 1, frames: 16, draw: (g, _w, _h, i, n) => angularShield(g, i, n) }];
