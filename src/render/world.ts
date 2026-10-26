import * as THREE from 'three';
import type { BiomeDef } from '../config/types';
import type { NavGrid } from '../game/nav';
import { fbm, hashNoise, mulberry32, smoothstep } from '../game/random';
import type { PoiRole } from '../maps/types';
import { buildProp } from './props';

// Il bioma: terreno a colline con piastrelle (moquette/pavimento), muri perimetrali,
// arredi sparsi e luci. Tutto generato dal BiomeDef + un seme.

const STEP = 2; // distanza tra i vertici del terreno

export interface Collider {
  x: number;
  z: number;
  r: number;
}

/** Un locale o punto di interesse delle mappe reali; x, z è davanti all'ingresso. */
export interface Place {
  id: string;
  name: string;
  addr: string;
  role: PoiRole;
  icon?: string;
  x: number;
  z: number;
  top: number; // altezza a cui galleggia il segnaposto
}

/** Ciò che la partita usa del mondo: lo implementano l'arena procedurale (World) e le mappe reali (CityWorld). */
export interface GameWorld {
  readonly group: THREE.Group;
  readonly half: number;
  /** Posizioni libere riservate agli interattivi (forzieri, macchinette, sala riunioni). */
  readonly spots: { x: number; z: number }[];
  /** Dove compare il giocatore e verso dove guarda la camera. */
  readonly start: { x: number; z: number; yaw: number };
  readonly places: Place[];
  /** Griglia per aggirare gli ostacoli grandi (null se bastano le collisioni). */
  readonly nav: NavGrid | null;
  /** Pianta per la minimappa: canvas che copre il quadrato [-half, half]. */
  readonly minimap: { canvas: HTMLCanvasElement; half: number } | null;
  height(x: number, z: number): number;
  resolve(p: { x: number; z: number }, r: number): void;
  /** Nome del luogo per l'HUD (locale o via), null se non c'è. */
  locate(x: number, z: number): string | null;
  /** Prima del rendering: la camera "buca" ciò che sta tra lei e il giocatore. */
  beforeRender(camera: THREE.Camera, target: THREE.Vector3): void;
  dispose(scene: THREE.Scene): void;
}

/** Arena procedurale: per i progetti senza una mappa reale (BiomeDef.map). */
export class World implements GameWorld {
  readonly group = new THREE.Group();
  readonly half: number;
  readonly colliders: Collider[] = [];
  /** Posizioni libere riservate agli interattivi (forzieri, macchinette, sala riunioni). */
  readonly spots: { x: number; z: number }[] = [];
  readonly start = { x: 0, z: 0, yaw: 0 };
  readonly places: Place[] = [];
  readonly nav = null;
  readonly minimap = null;
  private readonly n: number;
  private readonly heights: Float32Array;
  private readonly grid = new Map<number, number[]>();
  private readonly gridCell = 8;

  constructor(
    scene: THREE.Scene,
    readonly biome: BiomeDef,
    half: number,
    seed: number,
    spotCount: number,
  ) {
    this.half = half;
    this.n = Math.round((half * 2) / STEP) + 1;
    this.heights = new Float32Array(this.n * this.n);
    const rand = mulberry32(seed);

    // --- altezze ---
    const { amplitude, frequency } = biome.terrain;
    for (let iz = 0; iz < this.n; iz++) {
      for (let ix = 0; ix < this.n; ix++) {
        const x = ix * STEP - half;
        const z = iz * STEP - half;
        let h = (fbm(x * frequency, z * frequency, seed) * 2 - 1) * amplitude * 1.6;
        // terrazze morbide: crea "gradini" su cui saltare
        const terr = Math.round(h / 2.2) * 2.2;
        h = h * 0.55 + terr * 0.45;
        const d = Math.hypot(x, z);
        h *= smoothstep(8, 30, d); // spawn pianeggiante
        h *= 1 - smoothstep(half - 16, half - 4, Math.max(Math.abs(x), Math.abs(z)));
        this.heights[iz * this.n + ix] = h;
      }
    }

    scene.background = new THREE.Color(biome.palette.sky);
    scene.fog = new THREE.FogExp2(biome.palette.fog, biome.fogDensity);

    this.buildTerrain(seed);
    this.buildWalls();
    this.reserveSpots(rand, spotCount);
    this.buildProps(rand);
    this.buildLights();
  }

  /** Altezza del terreno, interpolata esattamente come i triangoli della mesh. */
  height(x: number, z: number): number {
    const gx = Math.min(this.n - 1.001, Math.max(0, (x + this.half) / STEP));
    const gz = Math.min(this.n - 1.001, Math.max(0, (z + this.half) / STEP));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const H = this.heights;
    const n = this.n;
    const a = H[iz * n + ix];
    const b = H[(iz + 1) * n + ix];
    const c = H[(iz + 1) * n + ix + 1];
    const d = H[iz * n + ix + 1];
    if (fx + fz <= 1) return a + (d - a) * fx + (b - a) * fz;
    return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }

  /** Spinge un cerchio fuori dagli arredi e dentro l'arena. Modifica `p` in place. */
  resolve(p: { x: number; z: number }, r: number) {
    const lim = this.half - 2 - r;
    if (p.x > lim) p.x = lim;
    if (p.x < -lim) p.x = -lim;
    if (p.z > lim) p.z = lim;
    if (p.z < -lim) p.z = -lim;
    const cs = this.gridCell;
    const gx = Math.floor(p.x / cs);
    const gz = Math.floor(p.z / cs);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.grid.get(this.key(gx + dx, gz + dz));
        if (!list) continue;
        for (const i of list) {
          const c = this.colliders[i];
          const ox = p.x - c.x;
          const oz = p.z - c.z;
          const min = r + c.r;
          const d2 = ox * ox + oz * oz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.x = c.x + (ox / d) * min;
            p.z = c.z + (oz / d) * min;
          }
        }
      }
  }

  locate(): string | null {
    return null;
  }

  beforeRender() {}

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  private key(gx: number, gz: number) {
    return (gx + 1000) * 4096 + (gz + 1000);
  }

  private addCollider(c: Collider) {
    const i = this.colliders.push(c) - 1;
    const cs = this.gridCell;
    const x0 = Math.floor((c.x - c.r) / cs);
    const x1 = Math.floor((c.x + c.r) / cs);
    const z0 = Math.floor((c.z - c.r) / cs);
    const z1 = Math.floor((c.z + c.r) / cs);
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) {
        const k = this.key(gx, gz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(i);
      }
  }

  private buildTerrain(seed: number) {
    const n = this.n;
    const cells = n - 1;
    const pos = new Float32Array(cells * cells * 6 * 3);
    const col = new Float32Array(cells * cells * 6 * 3);
    const { tileA, tileB, hill } = this.biome.palette;
    const cA = new THREE.Color(tileA);
    const cB = new THREE.Color(tileB);
    const cH = new THREE.Color(hill);
    const tmp = new THREE.Color();
    const tile = this.biome.terrain.tile;
    const v = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    let o = 0;
    const H = this.heights;
    const pushTri = (pts: number[][]) => {
      // colore per faccia: piastrella a scacchi, più scuro sui pendii
      const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
      const cz = (pts[0][2] + pts[1][2] + pts[2][2]) / 3;
      const tx = Math.floor(cx / tile);
      const tz = Math.floor(cz / tile);
      tmp.copy((tx + tz) & 1 ? cA : cB);
      const jitter = 0.94 + hashNoise(tx, tz, seed) * 0.1;
      tmp.multiplyScalar(jitter);
      e1.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
      e2.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
      v.crossVectors(e1, e2).normalize();
      const slope = 1 - Math.abs(v.y);
      tmp.lerp(cH, Math.min(1, slope * 3.2));
      for (const p of pts) {
        pos[o] = p[0];
        pos[o + 1] = p[1];
        pos[o + 2] = p[2];
        col[o] = tmp.r;
        col[o + 1] = tmp.g;
        col[o + 2] = tmp.b;
        o += 3;
      }
    };
    for (let iz = 0; iz < cells; iz++) {
      for (let ix = 0; ix < cells; ix++) {
        const x0 = ix * STEP - this.half;
        const z0 = iz * STEP - this.half;
        const a = [x0, H[iz * n + ix], z0];
        const b = [x0, H[(iz + 1) * n + ix], z0 + STEP];
        const c = [x0 + STEP, H[(iz + 1) * n + ix + 1], z0 + STEP];
        const d = [x0 + STEP, H[iz * n + ix + 1], z0];
        pushTri([a, b, d]);
        pushTri([b, c, d]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(mesh);
  }

  private buildWalls() {
    const seg = 4;
    const per = Math.round((this.half * 2) / seg);
    const count = per * 4;
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(seg, 7, 1.2), new THREE.MeshLambertMaterial({ color: this.biome.palette.wall }), count);
    const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(seg, 0.4, 1.5), new THREE.MeshLambertMaterial({ color: this.biome.palette.accent }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    let i = 0;
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < per; k++) {
        const t = -this.half + seg / 2 + k * seg;
        const rotY = side < 2 ? 0 : Math.PI / 2;
        const x = side < 2 ? t : side === 2 ? -this.half : this.half;
        const z = side < 2 ? (side === 0 ? -this.half : this.half) : t;
        const y = this.height(x, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        p.set(x, y + 2.5, z);
        wall.setMatrixAt(i, m.compose(p, q, s));
        p.set(x, y + 6.1, z);
        trim.setMatrixAt(i, m.compose(p, q, s));
        i++;
      }
    }
    this.group.add(wall, trim);
  }

  private reserveSpots(rand: () => number, count: number) {
    let guard = 0;
    while (this.spots.length < count && guard++ < 5000) {
      const x = (rand() * 2 - 1) * (this.half - 14);
      const z = (rand() * 2 - 1) * (this.half - 14);
      if (Math.hypot(x, z) < 22) continue;
      if (this.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 24)) continue;
      this.spots.push({ x, z });
    }
  }

  private buildProps(rand: () => number) {
    const accent = this.biome.palette.accent;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const placed: Collider[] = [];
    for (const { type, count } of this.biome.props) {
      const model = buildProp(type, accent);
      const bound = Math.max(...model.colliders.map((c) => Math.hypot(c.x, c.z) + c.r));
      const xforms: { x: number; z: number; rot: number }[] = [];
      let guard = 0;
      while (xforms.length < count && guard++ < count * 60) {
        const x = (rand() * 2 - 1) * (this.half - 8);
        const z = (rand() * 2 - 1) * (this.half - 8);
        if (Math.hypot(x, z) < 12) continue;
        if (this.spots.some((sp) => Math.hypot(sp.x - x, sp.z - z) < bound + 5)) continue;
        if (placed.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + bound + 1.2)) continue;
        const rot = Math.floor(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.2;
        xforms.push({ x, z, rot });
        placed.push({ x, z, r: bound });
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        for (const c of model.colliders) {
          // rotazione attorno a Y (stessa convenzione di Object3D)
          this.addCollider({ x: x + c.x * cos + c.z * sin, z: z - c.x * sin + c.z * cos, r: c.r });
        }
      }
      for (const part of model.parts) {
        const mat = new THREE.MeshLambertMaterial({ color: part.color, flatShading: true });
        if (part.emissive) mat.emissive = new THREE.Color(part.emissive);
        const im = new THREE.InstancedMesh(part.geo, mat, Math.max(1, xforms.length));
        im.count = xforms.length;
        xforms.forEach((t, i) => {
          // base del prop al punto più basso sotto la sua impronta: niente arredi sospesi
          const y = Math.min(this.height(t.x, t.z), this.height(t.x + bound * 0.7, t.z), this.height(t.x - bound * 0.7, t.z), this.height(t.x, t.z + bound * 0.7), this.height(t.x, t.z - bound * 0.7));
          q.setFromAxisAngle(up, t.rot);
          p.set(t.x, y, t.z);
          im.setMatrixAt(i, m.compose(p, q, s));
        });
        this.group.add(im);
      }
    }
  }

  private buildLights() {
    const dark = new THREE.Color(this.biome.palette.sky).getHSL({ h: 0, s: 0, l: 0 }).l < 0.3;
    const hemi = new THREE.HemisphereLight(0xffffff, dark ? 0x202838 : 0x8c8478, dark ? 1.6 : 2.0);
    const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.4 : 1.8);
    sun.position.set(40, 80, 25);
    this.group.add(hemi, sun);
  }
}
