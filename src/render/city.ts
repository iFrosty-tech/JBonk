import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BiomeDef } from '../config/types';
import { NavGrid } from '../game/nav';
import { AREA_KINDS, type AreaKind, type MapData, type MapPoi, type Poly, type Ring } from '../maps/types';
import type { Atlas } from './atlas';
import type { Collider, GameWorld, Place } from './world';

// Una mappa reale (vedi scripts/map/build_map.py): il terreno è fatto di strati piatti
// disegnati uno sopra l'altro (prati, parchi, marciapiedi, asfalto, strisce), poi edifici
// estrusi alle altezze vere, alberi, lampioni, fermate e le insegne dei locali.
// I palazzi bloccano il passaggio (collisioni sui lati) e la navigazione dei nemici.

const D = 0.1; // i dati sono in decimi di unità
const NAV_CELL = 2;

const GROUND = '#aea873'; // prato secco, il colore di fondo dell'Agro romano
const AREA: Record<AreaKind, string> = {
  res: '#a7ad7b',
  farm: '#c2b27a',
  green: '#86ad5c',
  forest: '#5f8a47',
  pitch: '#4f9a52',
  plaza: '#d6cdbb',
  parking: '#6c6f75',
  water: '#3fa2d8',
  path: '#d9ccad',
  walk: '#c8c2b6',
  road: '#4b4e54',
};
const WALLS = ['#eadbc0', '#e4c79c', '#d8ab7d', '#cf9573', '#efe9de', '#dccdb4', '#c2876a', '#e7d3a9'];
const KIND_WALL: Record<number, string> = { 2: '#e8cf98', 3: '#ece4d4', 4: '#9aa1aa' };
const OFFICE_WALL = '#c9d5e2';
const ROOFS = ['#9d958a', '#8f877c', '#a8a196', '#857c72'];
const BAY = 3.2; // larghezza di una finestra (unità)
const FLOOR = 2.6; // altezza di un piano (unità)

/** Stile delle insegne: sfondo, testo e un eventuale disegno a sinistra. */
interface SignStyle {
  bg: string;
  fg: string;
  mark?: 'jpanik' | 'disc' | 'tricolore' | 'leaf' | 'bowl' | 'barcode' | 'ball' | 'cup' | 'cross' | 'paper' | 'fuel';
  accent?: string;
}
const SIGN_STYLES: Record<string, SignStyle> = {
  jpanik: { bg: '#ffffff', fg: '#1d2333', mark: 'jpanik' },
  konan: { bg: '#151515', fg: '#ffffff', mark: 'disc', accent: '#d7263d' },
  albertos: { bg: '#fdf6e3', fg: '#c8102e', mark: 'tricolore' },
  jungle: { bg: '#1f5f3a', fg: '#c6f06b', mark: 'leaf', accent: '#c6f06b' },
  ami: { bg: '#2bb7aa', fg: '#ffffff', mark: 'bowl', accent: '#ff7b6b' },
  barcode: { bg: '#111111', fg: '#ffffff', mark: 'barcode' },
  sporting: { bg: '#1c4fa0', fg: '#ffffff', mark: 'ball', accent: '#e4f05a' },
  barcolombo: { bg: '#4a2c1a', fg: '#ffe9c7', mark: 'cup', accent: '#ffe9c7' },
  positano: { bg: '#f4e1c1', fg: '#2c5d8a', mark: 'cup', accent: '#2c5d8a' },
  pandolce: { bg: '#f7efe2', fg: '#8a4b2a', mark: 'cup', accent: '#8a4b2a' },
  farmacia: { bg: '#0f7a3c', fg: '#ffffff', mark: 'cross', accent: '#5dfd8a' },
  edicola: { bg: '#ffd23f', fg: '#1d2333', mark: 'paper', accent: '#1d2333' },
  ip: { bg: '#003b8e', fg: '#ffd200', mark: 'fuel', accent: '#ffd200' },
  tabacchi: { bg: '#1d2333', fg: '#ffffff' },
  bcc: { bg: '#0b6b3a', fg: '#ffffff' },
  climbing: { bg: '#f26b21', fg: '#ffffff' },
  cortomaltese: { bg: '#6b4a2b', fg: '#f5e6c8', mark: 'leaf', accent: '#a6d672' },
};
const SIGN_DEFAULT: SignStyle = { bg: '#7a1f1f', fg: '#fff3dc' };
const SIGN_W = 512;
const SIGN_H = 128;

type V2 = { x: number; z: number };

function ring(r: Ring): Float32Array {
  const a = new Float32Array(r.length);
  for (let i = 0; i < r.length; i++) a[i] = r[i] * D;
  return a;
}

function signedArea(r: Float32Array) {
  let s = 0;
  const m = r.length;
  for (let k = 0; k < m; k += 2) s += r[k] * r[(k + 3) % m] - r[(k + 2) % m] * r[k + 1];
  return s / 2;
}

/** Triangola un poligono (con buchi) sul piano y, con le facce rivolte verso l'alto. */
function triangulate(rings: Float32Array[], y: number, pos: number[]) {
  const toV = (r: Float32Array) => {
    const v: THREE.Vector2[] = [];
    for (let k = 0; k < r.length; k += 2) v.push(new THREE.Vector2(r[k], r[k + 1]));
    return v;
  };
  const contour = toV(rings[0]);
  if (contour.length < 3) return;
  const holes = rings.slice(1).map(toV).filter((h) => h.length >= 3);
  const all = contour.concat(...holes);
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
    const A = all[a];
    const B = all[b];
    const C = all[c];
    const up = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) >= 0;
    const [P, Q] = up ? [B, C] : [C, B];
    pos.push(A.x, y, A.y, P.x, y, P.y, Q.x, y, Q.y);
  }
}

function flatGeometry(pos: number[], colors?: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Unisce primitive diverse (con o senza indice) tenendo solo posizione e normale. */
function merge(...geos: THREE.BufferGeometry[]) {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  return mergeGeometries(flat)!;
}

/** Uniforms condivisi dai materiali che la camera può "bucare" per non perdere di vista il giocatore. */
const cutUniforms = {
  uCutCam: { value: new THREE.Vector3() },
  uCutTarget: { value: new THREE.Vector3() },
  uCut: { value: 0 },
};

function cutaway<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cutUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 cutWp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cutWp = instanceMatrix * cutWp;
      #endif
      vCutPos = (modelMatrix * cutWp).xyz;`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCutCam;\nuniform vec3 uCutTarget;\nuniform float uCut;\nvarying vec3 vCutPos;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uCut > 0.0) {
          vec3 seg = uCutTarget - uCutCam;
          float t = clamp(dot(vCutPos - uCutCam, seg) / dot(seg, seg), 0.0, 1.0);
          float d = length(vCutPos - (uCutCam + seg * t));
          if (t < 0.96 && d < uCut) {
            // bordo a retino: il buco sfuma invece di avere un taglio netto
            float edge = smoothstep(uCut * 0.7, uCut, d);
            float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
            if (n > edge) discard;
          }
        }`,
      );
  };
  return mat;
}

/** Facciata: 4×4 finestre con persiane; il secondo canvas sono le finestre accese (di notte). */
function facadeTextures() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const lit = document.createElement('canvas');
  lit.width = lit.height = S;
  const lg = lit.getContext('2d')!;
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, S, S);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    g.fillStyle = '#e6e1d8'; // marcapiano
    g.fillRect(0, y + 58, S, 6);
    for (let col = 0; col < 4; col++) {
      const x = col * 64;
      const shutters = col % 2 === 0;
      const open = rnd() > 0.35;
      g.fillStyle = '#f4f1ea';
      g.fillRect(x + 14, y + 10, 36, 40);
      g.fillStyle = '#4f6072';
      g.fillRect(x + 18, y + 14, 28, 34);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x + 18, y + 14, 8, 34);
      if (shutters) {
        // persiane verdi, aperte o socchiuse
        g.fillStyle = '#5f7d58';
        if (open) {
          g.fillRect(x + 4, y + 12, 10, 38);
          g.fillRect(x + 50, y + 12, 10, 38);
        } else g.fillRect(x + 18, y + 14, 28, 34);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let k = 0; k < 6; k++) g.fillRect(open ? x + 4 : x + 18, y + 16 + k * 6, open ? 56 : 28, 1.5);
      } else {
        // balconcino
        g.fillStyle = '#8e9299';
        g.fillRect(x + 10, y + 38, 44, 3);
        for (let k = 0; k < 7; k++) g.fillRect(x + 12 + k * 6.5, y + 38, 2, 12);
      }
      if (rnd() < 0.38 && !(shutters && !open)) {
        lg.fillStyle = rnd() < 0.5 ? '#ffd58a' : '#fff0c8';
        lg.fillRect(x + 18, y + 14, 28, 34);
      }
    }
  }
  const mk = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(c, true), lit: mk(lit, true) };
}

/** Rete arancione da cantiere: il confine dell'area di gioco. */
function fenceTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ff7a1a';
  g.lineWidth = 6;
  g.beginPath();
  for (let k = -64; k <= 128; k += 16) {
    g.moveTo(k, 0);
    g.lineTo(k + 64, 64);
    g.moveTo(k + 64, 0);
    g.lineTo(k, 64);
  }
  g.stroke();
  g.fillStyle = '#ff8c2e';
  g.fillRect(0, 0, 64, 5);
  g.fillRect(0, 59, 64, 5);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CityWorld implements GameWorld {
  readonly group = new THREE.Group();
  readonly half: number;
  readonly spots: V2[] = [];
  readonly start: { x: number; z: number; yaw: number };
  readonly places: Place[] = [];
  readonly nav: NavGrid;
  readonly minimap: { canvas: HTMLCanvasElement; half: number };
  readonly night: boolean;
  private readonly renderHalf: number;
  // collisioni: lati di edifici e piscine (x0, z0, x1, z1) e cerchi (alberi, pali)
  private segs: number[] = [];
  private readonly circles: Collider[] = [];
  private readonly solids: Float32Array[][] = []; // anelli di ogni ostacolo, per il test "dentro"
  private readonly cellSegs = new Map<number, number[]>();
  private readonly cellCircles = new Map<number, number[]>();
  private readonly cellSolids = new Map<number, number[]>();
  private readonly gridCell = 8;
  private readonly streets: { name: string; pts: Float32Array }[] = [];
  private lastLoc = { x: 1e9, z: 1e9, text: null as string | null };
  private readonly textures: THREE.Texture[] = [];

  constructor(
    scene: THREE.Scene,
    readonly biome: BiomeDef,
    readonly map: MapData,
    private readonly atlas: Atlas,
    spotCount: number,
  ) {
    this.half = map.meta.half * D;
    this.renderHalf = map.meta.renderHalf * D;
    this.night = new THREE.Color(biome.palette.sky).getHSL({ h: 0, s: 0, l: 0 }).l < 0.3;
    scene.background = new THREE.Color(biome.palette.sky);
    scene.fog = new THREE.FogExp2(biome.palette.fog, biome.fogDensity * 0.8);

    const startPoi = map.pois.find((p) => p.role === 'start');
    const sx = map.start[0] * D;
    const sz = map.start[1] * D;
    // all'inizio la camera sta sulla strada e inquadra il giocatore davanti alla sede
    const yaw = startPoi ? Math.atan2(sx - startPoi.x * D, sz - startPoi.z * D) : 0;
    this.start = { x: sx, z: sz, yaw };

    this.buildGround();
    this.buildMarkings();
    const officeBuilding = startPoi?.building ?? -1;
    this.buildBuildings(officeBuilding);
    this.buildPools();
    this.buildTrees();
    this.buildLamps();
    this.buildStops();
    this.buildSigns();
    this.buildFence();
    this.buildLights();
    for (const r of map.roads) {
      if (r[1] < 0) continue;
      this.streets.push({ name: map.names[r[1]], pts: new Float32Array(r.slice(3).map((v) => v * D)) });
    }

    this.nav = new NavGrid(this.half, NAV_CELL);
    for (const rings of this.solids) this.nav.blockPolygon(rings, 0.9);
    this.minimap = { canvas: this.drawMinimap(), half: this.renderHalf };
    this.pickSpots(spotCount);
    this.group.traverse((o) => (o.matrixAutoUpdate = false));
    this.group.updateMatrixWorld(true);
  }

  height(): number {
    return 0;
  }

  /** Spinge un cerchio fuori da edifici, alberi e pali, e dentro la recinzione. Modifica `p`. */
  resolve(p: { x: number; z: number }, r: number) {
    const lim = this.half - 2 - r;
    if (p.x > lim) p.x = lim;
    if (p.x < -lim) p.x = -lim;
    if (p.z > lim) p.z = lim;
    if (p.z < -lim) p.z = -lim;
    const gx = Math.floor(p.x / this.gridCell);
    const gz = Math.floor(p.z / this.gridCell);
    // finito dentro un edificio (spawn, spinta dei colpi): fuori dal lato più vicino
    const solids = this.cellSolids.get(this.key(gx, gz));
    if (solids) for (const i of solids) if (this.inside(this.solids[i], p.x, p.z)) this.pushOut(this.solids[i], p, r);
    const s = this.segs;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = this.key(gx + dx, gz + dz);
        const list = this.cellSegs.get(k);
        if (list)
          for (const i of list) {
            const ax = s[i];
            const az = s[i + 1];
            const ex = s[i + 2] - ax;
            const ez = s[i + 3] - az;
            const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.z - az) * ez) / (ex * ex + ez * ez || 1)));
            const qx = ax + ex * t;
            const qz = az + ez * t;
            const ox = p.x - qx;
            const oz = p.z - qz;
            const d2 = ox * ox + oz * oz;
            if (d2 < r * r && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              p.x = qx + (ox / d) * r;
              p.z = qz + (oz / d) * r;
            }
          }
        const circ = this.cellCircles.get(k);
        if (circ)
          for (const i of circ) {
            const c = this.circles[i];
            const ox = p.x - c.x;
            const oz = p.z - c.z;
            const min = r + c.r;
            const d2 = ox * ox + oz * oz;
            if (d2 < min * min && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              p.x = c.x + (ox / d) * min;
              p.z = c.z + (oz / d) * min;
            }
          }
      }
  }

  /** Il locale davanti a cui si trova il giocatore, altrimenti la via. */
  locate(x: number, z: number): string | null {
    const L = this.lastLoc;
    if (Math.abs(L.x - x) + Math.abs(L.z - z) < 1.5) return L.text;
    L.x = x;
    L.z = z;
    let text: string | null = null;
    let best = 9;
    for (const p of this.places) {
      if (p.role === 'sign' || p.role === 'park') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best) {
        best = d;
        text = `${p.name} · ${p.addr}`;
      }
    }
    if (!text) {
      let bd = 14;
      for (const s of this.streets) {
        const pts = s.pts;
        for (let k = 0; k + 3 < pts.length; k += 2) {
          const ax = pts[k];
          const az = pts[k + 1];
          const ex = pts[k + 2] - ax;
          const ez = pts[k + 3] - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
          const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
          if (d < bd) {
            bd = d;
            text = s.name;
          }
        }
      }
    }
    L.text = text;
    return text;
  }

  beforeRender(camera: THREE.Camera, target: THREE.Vector3) {
    cutUniforms.uCutCam.value.copy(camera.position);
    cutUniforms.uCutTarget.value.copy(target);
    cutUniforms.uCut.value = 4.2;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    for (const t of this.textures) t.dispose();
  }

  // ---------------------------------------------------------------- collisioni

  private key(gx: number, gz: number) {
    return (gx + 1000) * 4096 + (gz + 1000);
  }

  private addToGrid(map: Map<number, number[]>, i: number, x0: number, z0: number, x1: number, z1: number) {
    const cs = this.gridCell;
    for (let gz = Math.floor(z0 / cs); gz <= Math.floor(z1 / cs); gz++)
      for (let gx = Math.floor(x0 / cs); gx <= Math.floor(x1 / cs); gx++) {
        const k = this.key(gx, gz);
        let list = map.get(k);
        if (!list) map.set(k, (list = []));
        list.push(i);
      }
  }

  private addSolid(rings: Float32Array[]) {
    const idx = this.solids.push(rings) - 1;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const r of rings) {
      const m = r.length;
      for (let k = 0; k < m; k += 2) {
        const ax = r[k];
        const az = r[k + 1];
        const bx = r[(k + 2) % m];
        const bz = r[(k + 3) % m];
        const i = this.segs.push(ax, az, bx, bz) - 4;
        this.addToGrid(this.cellSegs, i, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
        x0 = Math.min(x0, ax);
        z0 = Math.min(z0, az);
        x1 = Math.max(x1, ax);
        z1 = Math.max(z1, az);
      }
    }
    this.addToGrid(this.cellSolids, idx, x0, z0, x1, z1);
  }

  private addCircle(x: number, z: number, r: number) {
    const i = this.circles.push({ x, z, r }) - 1;
    this.addToGrid(this.cellCircles, i, x - r, z - r, x + r, z + r);
  }

  private inside(rings: Float32Array[], x: number, z: number) {
    let c = false;
    for (const r of rings) {
      const m = r.length;
      for (let k = 0; k < m; k += 2) {
        const ax = r[k];
        const az = r[k + 1];
        const bx = r[(k + 2) % m];
        const bz = r[(k + 3) % m];
        if (az > z !== bz > z && x < ax + ((z - az) / (bz - az)) * (bx - ax)) c = !c;
      }
    }
    return c;
  }

  private pushOut(rings: Float32Array[], p: { x: number; z: number }, r: number) {
    let best = Infinity;
    let bx = p.x;
    let bz = p.z;
    for (const rg of rings) {
      const m = rg.length;
      for (let k = 0; k < m; k += 2) {
        const ax = rg[k];
        const az = rg[k + 1];
        const ex = rg[(k + 2) % m] - ax;
        const ez = rg[(k + 3) % m] - az;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.z - az) * ez) / (ex * ex + ez * ez || 1)));
        const qx = ax + ex * t;
        const qz = az + ez * t;
        const d = Math.hypot(p.x - qx, p.z - qz);
        if (d < best) {
          best = d;
          bx = qx;
          bz = qz;
        }
      }
    }
    const dx = bx - p.x;
    const dz = bz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    p.x = bx + (dx / d) * (r + 0.05);
    p.z = bz + (dz / d) * (r + 0.05);
  }

  // ---------------------------------------------------------------- costruzione

  private buildGround() {
    // un prato grande che sfuma nella nebbia: niente bordo del mondo all'orizzonte
    const base = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GROUND, depthWrite: false }));
    base.renderOrder = -100;
    this.group.add(base);
    AREA_KINDS.forEach((kind, i) => {
      const polys = this.map.areas[kind];
      if (polys.length) this.addLayer(polys, AREA[kind], -90 + i);
    });
    // ombre dei palazzi, calcolate in build_map.py con la stessa direzione del sole
    const pos: number[] = [];
    for (const p of this.map.shadow) triangulate(p.map(ring), 0, pos);
    const mat = new THREE.MeshBasicMaterial({ color: '#10131c', transparent: true, opacity: this.night ? 0.12 : 0.24, depthWrite: false });
    const mesh = new THREE.Mesh(flatGeometry(pos), mat);
    mesh.renderOrder = -2;
    this.group.add(mesh);
  }

  private addLayer(polys: Poly[], color: string, order: number) {
    const pos: number[] = [];
    for (const p of polys) triangulate(p.map(ring), 0, pos);
    const mesh = new THREE.Mesh(flatGeometry(pos), new THREE.MeshLambertMaterial({ color, depthWrite: false }));
    mesh.renderOrder = order;
    this.group.add(mesh);
  }

  /** Segnaletica orizzontale: tratteggio, linee di bordo, strisce pedonali. */
  private buildMarkings() {
    const pos: number[] = [];
    const quad = (cx: number, cz: number, ux: number, uz: number, len: number, w: number) => {
      // rettangolo centrato in (cx, cz), lungo `len` nella direzione (ux, uz)
      const vx = -uz;
      const vz = ux;
      const a = [cx - ux * len * 0.5 - vx * w * 0.5, cz - uz * len * 0.5 - vz * w * 0.5];
      const b = [cx + ux * len * 0.5 - vx * w * 0.5, cz + uz * len * 0.5 - vz * w * 0.5];
      const c = [cx + ux * len * 0.5 + vx * w * 0.5, cz + uz * len * 0.5 + vz * w * 0.5];
      const d = [cx - ux * len * 0.5 + vx * w * 0.5, cz - uz * len * 0.5 + vz * w * 0.5];
      for (const [p, q, r] of [
        [a, b, c],
        [a, c, d],
      ]) {
        const up = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]) >= 0;
        const [Q, R] = up ? [q, r] : [r, q];
        pos.push(p[0], 0, p[1], Q[0], 0, Q[1], R[0], 0, R[1]);
      }
    };
    const d = this.map.dashes;
    for (let i = 0; i < d.length; i += 3) {
      const a = d[i + 2] / 1000;
      quad(d[i] * D, d[i + 1] * D, Math.cos(a), Math.sin(a), 2.6, 0.16);
    }
    for (const e of this.map.edges) {
      const r = ring(e);
      for (let k = 0; k + 3 < r.length; k += 2) {
        const dx = r[k + 2] - r[k];
        const dz = r[k + 3] - r[k + 1];
        const l = Math.hypot(dx, dz);
        if (l < 0.01) continue;
        quad((r[k] + r[k + 2]) / 2, (r[k + 1] + r[k + 3]) / 2, dx / l, dz / l, l + 0.1, 0.14);
      }
    }
    const c = this.map.crossings;
    for (let i = 0; i < c.length; i += 4) {
      const a = c[i + 2] / 1000;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const w = c[i + 3] * D;
      for (let t = -w / 2 + 0.5; t <= w / 2 - 0.4; t += 0.9) quad(c[i] * D - uz * t, c[i + 1] * D + ux * t, ux, uz, 2.6, 0.45);
    }
    const mesh = new THREE.Mesh(flatGeometry(pos), new THREE.MeshLambertMaterial({ color: '#efece2', depthWrite: false }));
    mesh.renderOrder = -10;
    this.group.add(mesh);
  }

  private buildBuildings(office: number) {
    const wp: number[] = [];
    const wn: number[] = [];
    const wuv: number[] = [];
    const wc: number[] = [];
    const rp: number[] = [];
    const rc: number[] = [];
    const col = new THREE.Color();
    const uScale = 1 / (BAY * 4);
    const vScale = 1 / (FLOOR * 4);
    this.map.buildings.forEach((b, bi) => {
      const h = (b[0] as number) * D;
      const kind = b[1] as number;
      const rings = (b.slice(2) as Ring[]).map(ring);
      const hash = (bi * 2654435761) >>> 0;
      col.set(bi === office ? OFFICE_WALL : (KIND_WALL[kind] ?? WALLS[hash % WALLS.length]));
      const u0 = (hash % 7) * BAY;
      rings.forEach((r, ri) => {
        const sign = (ri === 0 ? 1 : -1) * (signedArea(r) > 0 ? 1 : -1);
        let u = u0;
        const m = r.length;
        for (let k = 0; k < m; k += 2) {
          const ax = r[k];
          const az = r[k + 1];
          const bx = r[(k + 2) % m];
          const bz = r[(k + 3) % m];
          const dx = bx - ax;
          const dz = bz - az;
          const len = Math.hypot(dx, dz);
          if (len < 1e-4) continue;
          const nx = (sign * dz) / len;
          const nz = (-sign * dx) / len;
          const verts = [
            [ax, 0, az, u, 0],
            [bx, 0, bz, u + len, 0],
            [bx, h, bz, u + len, h],
            [ax, h, az, u, h],
          ];
          const keep = nx * -dz + nz * dx > 0;
          const order = keep ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
          for (const o of order) {
            const v = verts[o];
            wp.push(v[0], v[1], v[2]);
            wn.push(nx, 0, nz);
            wuv.push(v[3] * uScale, v[4] * vScale);
            wc.push(col.r, col.g, col.b);
          }
          u += len;
        }
      });
      const before = rp.length;
      triangulate(rings, h, rp);
      const roof = new THREE.Color(kind === 4 ? '#7d848d' : ROOFS[hash % ROOFS.length]);
      for (let k = before; k < rp.length; k += 3) rc.push(roof.r, roof.g, roof.b);
      this.addSolid(rings);
    });
    const facade = facadeTextures();
    this.textures.push(facade.map, facade.lit);
    const walls = new THREE.BufferGeometry();
    walls.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    walls.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
    walls.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
    walls.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    const wallMat = cutaway(
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: facade.map,
        emissiveMap: facade.lit,
        emissive: this.night ? '#ffcf86' : '#000000',
      }),
    );
    const roofMat = cutaway(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(new THREE.Mesh(walls, wallMat), new THREE.Mesh(flatGeometry(rp, rc), roofMat));
  }

  private buildPools() {
    const pos: number[] = [];
    const rim: number[] = [];
    for (const p of this.map.pools) {
      const rings = p.map(ring);
      triangulate(rings, 0.05, pos);
      // bordo in travertino
      for (const r of rings) {
        const m = r.length;
        for (let k = 0; k < m; k += 2) {
          const ax = r[k];
          const az = r[k + 1];
          const bx = r[(k + 2) % m];
          const bz = r[(k + 3) % m];
          const g = new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az) + 0.5, 0.3, 0.5);
          g.rotateY(-Math.atan2(bz - az, bx - ax));
          g.translate((ax + bx) / 2, 0.15, (az + bz) / 2);
          const nonIdx = g.toNonIndexed();
          rim.push(...(nonIdx.getAttribute('position').array as Float32Array));
        }
      }
      this.addSolid(rings);
    }
    if (!pos.length) return;
    const water = new THREE.Mesh(flatGeometry(pos), new THREE.MeshLambertMaterial({ color: '#46b6e6', emissive: '#0d3d55' }));
    water.renderOrder = -1;
    this.group.add(water, new THREE.Mesh(flatGeometry(rim), new THREE.MeshLambertMaterial({ color: '#e9e1cf' })));
  }

  private buildTrees() {
    const t = this.map.trees;
    // 0 pino domestico, 1 latifoglia (leccio, platano), 2 cipresso, 3 cespuglio
    const models = [
      {
        trunk: merge(new THREE.CylinderGeometry(0.17, 0.3, 6.6, 6).translate(0, 3.3, 0), new THREE.CylinderGeometry(0.1, 0.14, 2.2, 5).rotateZ(0.9).translate(0.8, 5.9, 0)),
        crown: merge(new THREE.IcosahedronGeometry(1, 0).scale(3.4, 1.1, 3.2).translate(0, 7.1, 0), new THREE.IcosahedronGeometry(1, 0).scale(2.1, 0.85, 2).translate(1.6, 6.8, 0.6)),
        color: '#3f6b36',
        r: 0.4,
      },
      {
        trunk: new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6).translate(0, 1.6, 0),
        crown: merge(new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4.3, 0), new THREE.IcosahedronGeometry(1.5, 0).translate(1.2, 3.6, 0.6), new THREE.IcosahedronGeometry(1.4, 0).translate(-1.1, 3.8, -0.5)),
        color: '#4e8a3d',
        r: 0.4,
      },
      {
        trunk: new THREE.CylinderGeometry(0.12, 0.16, 0.8, 5).translate(0, 0.4, 0),
        crown: new THREE.IcosahedronGeometry(1, 0).scale(1, 3.4, 1).translate(0, 3.6, 0),
        color: '#2f5b35',
        r: 0.35,
      },
      { trunk: null, crown: merge(new THREE.IcosahedronGeometry(1.1, 0).scale(1, 0.75, 1).translate(0, 0.65, 0)), color: '#5c8f46', r: 0 },
    ];
    const byType: number[][] = [[], [], [], []];
    for (let i = 0; i < t.length; i += 4) byType[t[i + 2]].push(i);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#76563e', flatShading: true });
    models.forEach((model, type) => {
      const list = byType[type];
      if (!list.length) return;
      const crownMat = cutaway(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }));
      const crown = new THREE.InstancedMesh(model.crown, crownMat, list.length);
      const trunk = model.trunk ? new THREE.InstancedMesh(model.trunk, trunkMat, list.length) : null;
      list.forEach((i, k) => {
        const x = t[i] * D;
        const z = t[i + 1] * D;
        const sc = t[i + 3] / 100;
        const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        const rnd = h - Math.floor(h);
        q.setFromAxisAngle(up, rnd * Math.PI * 2);
        p.set(x, 0, z);
        s.set(sc, sc * (0.9 + rnd * 0.2), sc);
        m.compose(p, q, s);
        crown.setMatrixAt(k, m);
        trunk?.setMatrixAt(k, m);
        c.set(model.color).offsetHSL((rnd - 0.5) * 0.04, 0, (rnd - 0.5) * 0.08);
        crown.setColorAt(k, c);
        if (model.r) this.addCircle(x, z, model.r * sc);
      });
      this.group.add(crown);
      if (trunk) this.group.add(trunk);
    });
  }

  private buildLamps() {
    const l = this.map.lamps;
    const n = l.length / 3;
    if (!n) return;
    const pole = merge(new THREE.CylinderGeometry(0.08, 0.12, 5.6, 6).translate(0, 2.8, 0), new THREE.BoxGeometry(1.5, 0.09, 0.09).translate(0.7, 5.5, 0));
    const head = new THREE.BoxGeometry(0.75, 0.16, 0.34).translate(1.35, 5.4, 0);
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: '#5d636d' }), n);
    const heads = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ color: '#fff6d8', emissive: this.night ? '#ffe2a0' : '#6b6450' }), n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const glow: number[] = [];
    for (let k = 0; k < n; k++) {
      const x = l[k * 3] * D;
      const z = l[k * 3 + 1] * D;
      const a = l[k * 3 + 2] / 1000;
      q.setFromAxisAngle(up, -a);
      m.compose(p.set(x, 0, z), q, one);
      poles.setMatrixAt(k, m);
      heads.setMatrixAt(k, m);
      this.addCircle(x, z, 0.22);
      glow.push(x + Math.cos(a) * 1.35, z + Math.sin(a) * 1.35);
    }
    this.group.add(poles, heads);
    if (this.night) {
      // di notte: pozze di luce calda sotto i lampioni
      const disc = new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: '#ffcc66', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
      const pools = new THREE.InstancedMesh(disc, mat, n);
      for (let k = 0; k < n; k++) pools.setMatrixAt(k, m.makeTranslation(glow[k * 2], 0.04, glow[k * 2 + 1]));
      pools.renderOrder = -1;
      this.group.add(pools);
    }
  }

  /** Pensiline dell'autobus con il palo della fermata. */
  private buildStops() {
    const s = this.map.stops;
    if (!s.length) return;
    const parts: { geo: THREE.BufferGeometry; color: string }[] = [
      { geo: new THREE.BoxGeometry(3.4, 0.14, 1.5).translate(0, 2.5, 0.2), color: '#3d434d' },
      { geo: new THREE.BoxGeometry(3.2, 1.9, 0.06).translate(0, 1.35, 0.85), color: '#a8c6d4' },
      { geo: merge(new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(-1.6, 1.25, 0.85), new THREE.BoxGeometry(0.1, 2.5, 0.1).translate(1.6, 1.25, 0.85), new THREE.CylinderGeometry(0.05, 0.05, 2.9, 5).translate(2.4, 1.45, -0.2)), color: '#7a808a' },
      { geo: new THREE.BoxGeometry(2.2, 0.12, 0.4).translate(0, 0.55, 0.55), color: '#8a5a3b' },
      { geo: new THREE.BoxGeometry(0.06, 0.7, 0.55).translate(2.4, 2.75, -0.2), color: '#f2c230' },
    ];
    const geos: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    for (let i = 0; i < s.length; i += 3) {
      const x = s[i] * D;
      const z = s[i + 1] * D;
      const a = s[i + 2] / 1000;
      q.setFromAxisAngle(up, -a);
      m.compose(p.set(x, 0, z), q, one);
      for (const part of parts) {
        const g = part.geo.clone().applyMatrix4(m);
        const flat = g.index ? g.toNonIndexed() : g;
        const c = new THREE.Color(part.color);
        const n = flat.getAttribute('position').count;
        flat.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]), 3));
        if (flat.getAttribute('uv')) flat.deleteAttribute('uv');
        geos.push(flat);
      }
      // il vetro posteriore blocca il passaggio
      const nx = -Math.sin(a);
      const nz = Math.cos(a);
      for (const t of [-1.2, 0, 1.2]) this.addCircle(x + Math.cos(a) * t + nx * 0.8, z + Math.sin(a) * t + nz * 0.8, 0.45);
    }
    this.group.add(new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  /** Insegne dei locali: un unico canvas con tutte le scritte, una sola geometria. */
  private buildSigns() {
    const pois = this.map.pois;
    const cols = 2;
    const rows = Math.ceil(pois.length / cols);
    const cv = document.createElement('canvas');
    cv.width = SIGN_W * cols;
    cv.height = THREE.MathUtils.ceilPowerOfTwo(SIGN_H * rows);
    const g = cv.getContext('2d')!;
    const faces: number[] = [];
    const uvs: number[] = [];
    const backs: THREE.BufferGeometry[] = [];
    pois.forEach((poi, i) => {
      const cx = (i % cols) * SIGN_W;
      const cy = Math.floor(i / cols) * SIGN_H;
      this.paintSign(g, poi, cx, cy);
      const main = poi.role !== 'sign' && poi.role !== 'park';
      const w = main ? 5.6 : 4.4;
      const h = w / 4;
      const [sx, sz, sa, sh] = poi.sign;
      const nx = Math.cos(sa / 1000);
      const nz = Math.sin(sa / 1000);
      const x = sx * D;
      const z = sz * D;
      const onPole = sh === 0;
      const y = onPole ? 3.0 : sh * D;
      const u0 = cx / cv.width;
      const u1 = (cx + SIGN_W) / cv.width;
      const v1 = 1 - cy / cv.height;
      const v0 = 1 - (cy + SIGN_H) / cv.height;
      // la scritta si legge stando davanti: "destra" è la tangente vista da fuori
      const tx = -nz;
      const tz = nx;
      const face = (off: number, flip: boolean) => {
        const fx = x + nx * off;
        const fz = z + nz * off;
        const dirX = flip ? -tx : tx;
        const dirZ = flip ? -tz : tz;
        const L = [fx - dirX * w * 0.5, fz - dirZ * w * 0.5];
        const R = [fx + dirX * w * 0.5, fz + dirZ * w * 0.5];
        const quad = [
          [L[0], y - h / 2, L[1], u0, v0],
          [R[0], y - h / 2, R[1], u1, v0],
          [R[0], y + h / 2, R[1], u1, v1],
          [L[0], y + h / 2, L[1], u0, v1],
        ];
        for (const o of [0, 1, 2, 0, 2, 3]) {
          faces.push(quad[o][0], quad[o][1], quad[o][2]);
          uvs.push(quad[o][3], quad[o][4]);
        }
      };
      if (onPole) {
        face(0.08, true);
        face(-0.08, false);
        const back = new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.14);
        back.rotateY(Math.atan2(nx, nz));
        back.translate(x, y, z);
        backs.push(back, new THREE.CylinderGeometry(0.08, 0.08, y - h / 2, 6).translate(x - tx * w * 0.35, (y - h / 2) / 2, z - tz * w * 0.35));
        backs.push(new THREE.CylinderGeometry(0.08, 0.08, y - h / 2, 6).translate(x + tx * w * 0.35, (y - h / 2) / 2, z + tz * w * 0.35));
        this.addCircle(x - tx * w * 0.35, z - tz * w * 0.35, 0.2);
        this.addCircle(x + tx * w * 0.35, z + tz * w * 0.35, 0.2);
      } else {
        face(0.14, true);
        const back = new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.2);
        back.rotateY(Math.atan2(nx, nz));
        back.translate(x + nx * 0.02, y, z + nz * 0.02);
        backs.push(back);
      }
      this.places.push({
        id: poi.id,
        name: poi.name,
        addr: poi.addr,
        role: poi.role,
        icon: poi.icon,
        x: poi.door[0] * D,
        z: poi.door[1] * D,
        top: y + h / 2 + 2.6,
      });
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.textures.push(tex);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(faces, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const faceMat = cutaway(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    this.group.add(new THREE.Mesh(geo, faceMat), new THREE.Mesh(merge(...backs), cutaway(new THREE.MeshLambertMaterial({ color: '#2a2f3a' }))));
  }

  private paintSign(g: CanvasRenderingContext2D, poi: MapPoi, x: number, y: number) {
    const st = SIGN_STYLES[poi.id] ?? SIGN_DEFAULT;
    const W = SIGN_W;
    const H = SIGN_H;
    g.save();
    g.translate(x, y);
    g.fillStyle = st.bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    let left = 22;
    const a = st.accent ?? st.fg;
    const cy = H / 2;
    switch (st.mark) {
      case 'jpanik': {
        const f = this.atlas.get('jpanik');
        const src = this.atlas.canvas;
        g.drawImage(src, f.cx * 128, f.cy * 128, 128, 128, 10, 4, 120, 120);
        left = 132;
        break;
      }
      case 'disc':
        g.fillStyle = a;
        g.beginPath();
        g.arc(70, cy, 40, 0, Math.PI * 2);
        g.fill();
        left = 124;
        break;
      case 'tricolore':
        for (const [k, c] of ['#008c45', '#f4f5f0', '#cd212a'].entries()) {
          g.fillStyle = c;
          g.fillRect(k * (W / 3), H - 18, W / 3, 18);
        }
        break;
      case 'leaf':
      case 'bowl':
      case 'cup':
      case 'ball':
      case 'fuel':
      case 'paper': {
        g.fillStyle = a;
        g.strokeStyle = a;
        g.lineWidth = 7;
        g.beginPath();
        if (st.mark === 'leaf') {
          g.ellipse(64, cy, 42, 22, -0.6, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = st.bg;
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(34, cy + 22);
          g.lineTo(92, cy - 20);
          g.stroke();
        } else if (st.mark === 'bowl') {
          g.arc(64, cy - 8, 42, 0, Math.PI);
          g.fill();
          g.fillStyle = '#ffd23f';
          g.beginPath();
          g.arc(48, cy - 14, 10, 0, Math.PI * 2);
          g.arc(78, cy - 16, 9, 0, Math.PI * 2);
          g.fill();
        } else if (st.mark === 'cup') {
          g.roundRect(34, cy - 22, 52, 44, 8);
          g.fill();
          g.beginPath();
          g.arc(90, cy, 13, -Math.PI / 2, Math.PI / 2);
          g.stroke();
        } else if (st.mark === 'ball') {
          g.arc(64, cy, 38, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = st.bg;
          g.lineWidth = 5;
          g.beginPath();
          g.arc(28, cy, 34, -0.9, 0.9);
          g.stroke();
          g.beginPath();
          g.arc(100, cy, 34, Math.PI - 0.9, Math.PI + 0.9);
          g.stroke();
        } else if (st.mark === 'fuel') {
          g.roundRect(40, cy - 34, 40, 68, 6);
          g.fill();
        } else {
          g.fillRect(36, cy - 30, 56, 60);
          g.fillStyle = st.bg;
          for (let k = 0; k < 4; k++) g.fillRect(44, cy - 20 + k * 12, 40, 5);
        }
        left = 124;
        break;
      }
      case 'barcode':
        g.fillStyle = '#ffffff';
        for (let k = 0, px = 24; k < 22; k++) {
          const bw = [3, 6, 2, 9, 4][k % 5];
          g.fillRect(px, 24, bw, H - 48);
          px += bw + [4, 3, 6, 2][k % 4];
        }
        left = 150;
        break;
      case 'cross':
        g.fillStyle = a;
        g.fillRect(48, cy - 38, 32, 76);
        g.fillRect(26, cy - 16, 76, 32);
        left = 124;
        break;
    }
    // il nome, il più grande possibile nello spazio rimasto
    const text = poi.id === 'albertos' ? "Alberto's Pizza" : poi.name.toUpperCase();
    const font = poi.id === 'albertos' ? 'italic 900' : '900';
    let size = 68;
    g.font = `${font} ${size}px "Arial Black", Arial, sans-serif`;
    const maxW = W - left - 22;
    while (g.measureText(text).width > maxW && size > 24) {
      size -= 2;
      g.font = `${font} ${size}px "Arial Black", Arial, sans-serif`;
    }
    g.fillStyle = st.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, left + maxW / 2, st.mark === 'tricolore' ? cy - 8 : cy + 2);
    g.restore();
  }

  private buildFence() {
    const H = this.half - 1;
    const tex = fenceTexture();
    this.textures.push(tex);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    for (let side = 0; side < 4; side++) {
      const geo = new THREE.PlaneGeometry(H * 2, 1.7);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * ((H * 2) / 1.7));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(side === 2 ? -H : side === 3 ? H : 0, 0.95, side === 0 ? -H : side === 1 ? H : 0);
      mesh.rotation.y = side < 2 ? 0 : Math.PI / 2;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
    const per = Math.round((H * 2) / 2.5);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 4).translate(0, 0.95, 0), new THREE.MeshLambertMaterial({ color: '#d9dde5' }), per * 4);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let side = 0; side < 4; side++)
      for (let k = 0; k < per; k++) {
        const t = -H + (k + 0.5) * ((H * 2) / per);
        const x = side < 2 ? t : side === 2 ? -H : H;
        const z = side < 2 ? (side === 0 ? -H : H) : t;
        posts.setMatrixAt(i++, m.makeTranslation(x, 0, z));
      }
    this.group.add(posts);
  }

  private buildLights() {
    const [lx, ly, lz] = this.map.meta.sun;
    const hemi = new THREE.HemisphereLight(this.night ? 0x8090c0 : 0xffffff, this.night ? 0x1a1e2a : 0x8c8478, this.night ? 0.9 : 2.0);
    const sun = new THREE.DirectionalLight(this.night ? 0x9fb0e0 : 0xfff4e0, this.night ? 0.5 : 1.9);
    sun.position.set(lx, ly, lz);
    this.group.add(hemi, sun);
  }

  // ---------------------------------------------------------------- minimappa e interattivi

  private drawMinimap(): HTMLCanvasElement {
    const S = 1400;
    const R = this.renderHalf;
    const k = S / (R * 2);
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d')!;
    g.setTransform(k, 0, 0, k, R * k, R * k);
    g.fillStyle = '#323a2c';
    g.fillRect(-R, -R, R * 2, R * 2);
    const fill = (polys: Poly[], color: string) => {
      g.fillStyle = color;
      for (const p of polys) {
        g.beginPath();
        for (const r of p) {
          for (let i = 0; i < r.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, r[i] * D, r[i + 1] * D);
          g.closePath();
        }
        g.fill('evenodd');
      }
    };
    const MINI: Partial<Record<AreaKind, string>> = {
      res: '#3d4434', farm: '#4a4632', green: '#3d6236', forest: '#355a30', pitch: '#3f7a43', parking: '#4a4d55', water: '#2f7fb8', path: '#6f6a58', walk: '#6d6b66', road: '#b9bcc4',
    };
    for (const kind of AREA_KINDS) if (MINI[kind]) fill(this.map.areas[kind], MINI[kind]);
    g.strokeStyle = '#1d2333';
    g.lineWidth = 0.6;
    for (const b of this.map.buildings) {
      g.fillStyle = '#d9b98a';
      g.beginPath();
      for (const r of b.slice(2) as Ring[]) {
        for (let i = 0; i < r.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, r[i] * D, r[i + 1] * D);
        g.closePath();
      }
      g.fill('evenodd');
      g.stroke();
    }
    return cv;
  }

  /** Posizioni libere e raggiungibili dalla sede, lontane tra loro, per forzieri e totem. */
  private pickSpots(count: number) {
    const nav = this.nav;
    nav.flood(this.start.x, this.start.z, nav.n);
    const n = nav.n;
    const cand = nav.reached().filter((i) => {
      const ix = i % n;
      const iz = (i - ix) / n;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const j = (iz + dz) * n + ix + dx;
          if (ix + dx < 0 || iz + dz < 0 || ix + dx >= n || iz + dz >= n || nav.blocked[j]) return false;
        }
      const x = nav.cx(i);
      const z = nav.cz(i);
      if (Math.max(Math.abs(x), Math.abs(z)) > this.half - 10) return false;
      if (Math.hypot(x - this.start.x, z - this.start.z) < 26) return false;
      const near = this.cellCircles.get(this.key(Math.floor(x / this.gridCell), Math.floor(z / this.gridCell))) ?? [];
      if (near.some((c) => Math.hypot(this.circles[c].x - x, this.circles[c].z - z) < 2.5)) return false;
      return !this.places.some((p) => Math.hypot(p.x - x, p.z - z) < 12);
    });
    let seed = 1271;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let minD = 60; minD >= 20 && this.spots.length < count; minD -= 10) {
      for (let guard = 0; guard < 4000 && this.spots.length < count; guard++) {
        const i = cand[Math.floor(rnd() * cand.length)];
        const x = nav.cx(i) + (rnd() - 0.5);
        const z = nav.cz(i) + (rnd() - 0.5);
        if (this.spots.some((s) => Math.hypot(s.x - x, s.z - z) < minD)) continue;
        this.spots.push({ x, z });
      }
    }
  }
}
