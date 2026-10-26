// Griglia spaziale ricostruita a ogni frame: trova i nemici vicini senza confrontarli tutti.

export class SpatialHash {
  private readonly cols: number;
  private readonly heads: Int32Array;
  private next: Int32Array;

  constructor(
    private readonly half: number,
    private readonly cell: number,
    capacity: number,
  ) {
    this.cols = Math.ceil((half * 2) / cell);
    this.heads = new Int32Array(this.cols * this.cols);
    this.next = new Int32Array(capacity);
  }

  clear(capacity: number) {
    this.heads.fill(-1);
    if (capacity > this.next.length) this.next = new Int32Array(capacity * 2);
  }

  private idx(v: number) {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((v + this.half) / this.cell)));
  }

  insert(i: number, x: number, z: number) {
    const c = this.idx(z) * this.cols + this.idx(x);
    this.next[i] = this.heads[c];
    this.heads[c] = i;
  }

  /** Riempie `out` con gli indici nelle celle che toccano il cerchio (x, z, r). */
  query(x: number, z: number, r: number, out: number[]) {
    out.length = 0;
    const x0 = this.idx(x - r);
    const x1 = this.idx(x + r);
    const z0 = this.idx(z - r);
    const z1 = this.idx(z + r);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.heads[cz * this.cols + cx];
        while (i !== -1) {
          out.push(i);
          i = this.next[i];
        }
      }
    return out;
  }
}
