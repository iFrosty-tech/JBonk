// Navigazione nelle mappe con edifici. La griglia segna le celle occupate dai palazzi;
// a intervalli regolari si calcolano le distanze dal giocatore (un'ondata che si allarga
// cella per cella, aggirando gli ostacoli) e ogni nemico scende verso la cella vicina più bassa.
// Chi vede il giocatore in linea d'aria va dritto: la griglia serve solo dietro gli angoli.

const INF = 0xffff;
// 8 vicini: dx, dz, costo (2 in orizzontale, 3 in diagonale ≈ 2·√2)
const NB = [1, 0, 2, -1, 0, 2, 0, 1, 2, 0, -1, 2, 1, 1, 3, -1, 1, 3, 1, -1, 3, -1, -1, 3];

export class NavGrid {
  readonly n: number;
  readonly blocked: Uint8Array;
  private readonly dist: Uint16Array;
  private readonly stamp: Uint32Array;
  private cur = 0;
  private buckets: number[][] = [];

  constructor(
    readonly half: number,
    readonly cell: number,
  ) {
    this.n = Math.ceil((half * 2) / cell);
    this.blocked = new Uint8Array(this.n * this.n);
    this.dist = new Uint16Array(this.n * this.n);
    this.stamp = new Uint32Array(this.n * this.n);
  }

  index(x: number, z: number): number {
    const ix = Math.floor((x + this.half) / this.cell);
    const iz = Math.floor((z + this.half) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) return -1;
    return iz * this.n + ix;
  }

  cx(i: number) {
    return ((i % this.n) + 0.5) * this.cell - this.half;
  }

  cz(i: number) {
    return (Math.floor(i / this.n) + 0.5) * this.cell - this.half;
  }

  /**
   * Blocca le celle il cui centro sta dentro il poligono (regola pari-dispari su tutti gli
   * anelli, quindi i cortili restano liberi) o a meno di `pad` da un suo lato.
   */
  blockPolygon(rings: Float32Array[], pad: number) {
    const { n, cell, half } = this;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const r of rings)
      for (let k = 1; k < r.length; k += 2) {
        z0 = Math.min(z0, r[k]);
        z1 = Math.max(z1, r[k]);
      }
    const xs: number[] = [];
    const iz0 = Math.max(0, Math.floor((z0 + half) / cell));
    const iz1 = Math.min(n - 1, Math.floor((z1 + half) / cell));
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = (iz + 0.5) * cell - half;
      xs.length = 0;
      for (const r of rings) {
        const m = r.length;
        for (let k = 0; k < m; k += 2) {
          const ax = r[k];
          const az = r[k + 1];
          const bx = r[(k + 2) % m];
          const bz = r[(k + 3) % m];
          if (az > z !== bz > z) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil((xs[k] + half) / cell - 0.5));
        const b = Math.min(n - 1, Math.floor((xs[k + 1] + half) / cell - 0.5));
        for (let ix = a; ix <= b; ix++) this.blocked[iz * n + ix] = 1;
      }
    }
    for (const r of rings) {
      const m = r.length;
      for (let k = 0; k < m; k += 2) this.blockSegment(r[k], r[k + 1], r[(k + 2) % m], r[(k + 3) % m], pad);
    }
  }

  blockSegment(ax: number, az: number, bx: number, bz: number, pad: number) {
    const { n, cell, half } = this;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad + half) / cell));
    const x1 = Math.min(n - 1, Math.floor((Math.max(ax, bx) + pad + half) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz) - pad + half) / cell));
    const z1 = Math.min(n - 1, Math.floor((Math.max(az, bz) + pad + half) / cell));
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const px = (ix + 0.5) * cell - half;
        const pz = (iz + 0.5) * cell - half;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
        if (Math.hypot(px - ax - dx * t, pz - az - dz * t) < pad) this.blocked[iz * n + ix] = 1;
      }
  }

  /** Distanze da (x, z) per tutte le celle raggiungibili entro `radius` celle. */
  flood(x: number, z: number, radius: number) {
    let start = this.index(x, z);
    if (start < 0) return;
    if (this.blocked[start]) start = this.nearestFree(start);
    if (start < 0) return;
    const { n, blocked, dist, stamp } = this;
    const cur = ++this.cur;
    const sx = start % n;
    const sz = Math.floor(start / n);
    const b = this.buckets;
    for (const q of b) if (q) q.length = 0;
    stamp[start] = cur;
    dist[start] = 0;
    (b[0] ??= []).push(start);
    for (let d = 0; d < b.length; d++) {
      const q = b[d];
      if (!q) continue;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        if (dist[i] !== d) continue;
        const ix = i % n;
        const iz = (i - ix) / n;
        for (let e = 0; e < 24; e += 3) {
          const jx = ix + NB[e];
          const jz = iz + NB[e + 1];
          if (jx < 0 || jz < 0 || jx >= n || jz >= n || Math.abs(jx - sx) > radius || Math.abs(jz - sz) > radius) continue;
          const j = jz * n + jx;
          if (blocked[j]) continue;
          // in diagonale solo se le due celle a fianco sono libere: niente angoli tagliati
          if (NB[e + 2] === 3 && (blocked[iz * n + jx] || blocked[jz * n + ix])) continue;
          const nd = d + NB[e + 2];
          if (stamp[j] === cur && dist[j] <= nd) continue;
          stamp[j] = cur;
          dist[j] = nd;
          (b[nd] ??= []).push(j);
        }
      }
    }
  }

  /** Distanza (in passi) dall'ultimo punto di partenza, INF se irraggiungibile o fuori finestra. */
  distAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i >= 0 && this.stamp[i] === this.cur ? this.dist[i] : INF;
  }

  reachable(x: number, z: number) {
    return this.distAt(x, z) < INF;
  }

  /**
   * Direzione verso la cella vicina più vicina al giocatore. Chi sta rasente a un muro
   * (cella bloccata dal margine di sicurezza) usa le celle libere intorno.
   * false se intorno non c'è niente di raggiunto dall'ultimo flood.
   */
  step(x: number, z: number, out: { x: number; z: number }): boolean {
    const i = this.index(x, z);
    if (i < 0) return false;
    const { n, blocked, dist, stamp, cur } = this;
    const ix = i % n;
    const iz = (i - ix) / n;
    const here = stamp[i] === cur && !blocked[i];
    let best = -1;
    let bd = here ? dist[i] : INF;
    for (let e = 0; e < 24; e += 3) {
      const jx = ix + NB[e];
      const jz = iz + NB[e + 1];
      if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
      const j = jz * n + jx;
      if (stamp[j] !== cur || dist[j] >= bd) continue;
      if (here && NB[e + 2] === 3 && (blocked[iz * n + jx] || blocked[jz * n + ix])) continue;
      bd = dist[j];
      best = j;
    }
    if (best < 0) return false;
    const dx = this.cx(best) - x;
    const dz = this.cz(best) - z;
    const d = Math.hypot(dx, dz) || 1;
    out.x = dx / d;
    out.z = dz / d;
    return true;
  }

  /** La cella è libera ma l'ultimo flood non l'ha raggiunta (es. un cortile chiuso). */
  stranded(x: number, z: number, radius: number, fx: number, fz: number): boolean {
    const i = this.index(x, z);
    if (i < 0 || this.blocked[i] || this.stamp[i] === this.cur) return false;
    const r = radius * this.cell;
    return Math.abs(x - fx) < r && Math.abs(z - fz) < r;
  }

  /** Linea d'aria libera tra due punti (campiona la griglia ogni mezza cella). */
  clear(x0: number, z0: number, x1: number, z1: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const i = this.index(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (i >= 0 && this.blocked[i]) return false;
    }
    return true;
  }

  /** Celle libere raggiunte dall'ultimo flood. */
  reached(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.stamp.length; i++) if (this.stamp[i] === this.cur) out.push(i);
    return out;
  }

  private nearestFree(i: number): number {
    const { n } = this;
    const ix = i % n;
    const iz = (i - ix) / n;
    for (let r = 1; r < 8; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
          if (!this.blocked[jz * n + jx]) return jz * n + jx;
        }
    return -1;
  }
}
