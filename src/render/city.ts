import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BiomeDef } from '../config/types';
import { NavGrid } from '../game/nav';
import { AREA_KINDS, type AreaKind, type MapBuilding, type MapData, type MapPoi, type Poly, type Ring } from '../maps/types';
import type { Atlas } from './atlas';
import { COURT_TYPES, courtTexture, FACADES, facadeTexture, SHOP_BAY, shopTexture, tileTexture, windscreenTexture } from './facades';
import type { Collider, GameWorld, Place } from './world';

// Una mappa reale (vedi scripts/map/build_map.py): il terreno è fatto di strati piatti
// disegnati uno sopra l'altro (il suolo col colore misurato dal satellite, marciapiedi, asfalto,
// strisce), poi edifici estrusi alle altezze vere con facciate, balconi e tetti nello stile del
// quartiere, gli alberi veri (posizione, altezza e chioma), i campi sportivi, lampioni, fermate
// e le insegne dei locali. I palazzi bloccano il passaggio (collisioni sui lati) e la navigazione
// dei nemici.

const D = 0.1; // i dati sono in decimi di unità
const NAV_CELL = 2;

const GROUND = '#aea873'; // prato secco, il colore di fondo dell'Agro romano (fuori dalla mappa)
/** Strati disegnati col loro colore. Prati, parchi, giardini e campi incolti hanno il colore misurato (tint). */
const AREA: Partial<Record<AreaKind, string>> = {
  pitch: '#6f8f5a',
  plaza: '#d6cdbb',
  parking: '#6c6f75',
  water: '#3fa2d8',
  path: '#d9ccad',
  walk: '#c8c2b6',
  road: '#4b4e54',
};
/** Tetti, nello stesso ordine di ROOF in build_map.py. */
const ROOF = { flat: 0, tiles: 1, dome: 2, canopy: 3, sheet: 4 } as const;
const GF = 3.6; // altezza del piano terra con i negozi (4,5 m)
const STONE = '#e6e0d4'; // rivestimento dei pilastri delle vetrine
const SLAB = '#dcd8cf'; // solette dei balconi
const SUN_SHADOW = 0.85; // allungamento delle ombre, come in build_map.py

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

/** Accumula triangoli con normale, uv e colore: diventa una sola geometria (una draw call). */
class Geo {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly bid: number[] = [];
  /** Edificio a cui appartengono i vertici aggiunti da qui in poi (vedi cutaway). */
  id = -1;

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: THREE.Color) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.bid.push(this.id);
  }

  /** Aggiunge una primitiva di three.js già posizionata, tutta di un colore. */
  add(g: THREE.BufferGeometry, c: THREE.Color) {
    const f = g.index ? g.toNonIndexed() : g;
    const p = f.getAttribute('position');
    const n = f.getAttribute('normal');
    const u = f.getAttribute('uv');
    for (let i = 0; i < p.count; i++) this.vert(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), u ? u.getX(i) : 0, u ? u.getY(i) : 0, c);
  }

  /** Scatola lunga `l` (lungo l'angolo `a` nel piano), alta `h`, profonda `d`, con la base a quota y. */
  box(x: number, y: number, z: number, l: number, h: number, d: number, a: number, c: THREE.Color, tiltX = 0) {
    const g = new THREE.BoxGeometry(l, h, d);
    if (tiltX) g.rotateX(tiltX);
    g.translate(0, h / 2, 0).rotateY(-a).translate(x, y, z);
    this.add(g, c);
  }

  /** Muro verticale da (ax, az) a (bx, bz) tra y0 e y1, rivolto verso (nx, nz). */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, nx: number, nz: number, u0: number, u1: number, v0: number, v1: number, c: THREE.Color) {
    const q = [
      [ax, y0, az, u0, v0],
      [bx, y0, bz, u1, v0],
      [bx, y1, bz, u1, v1],
      [ax, y1, az, u0, v1],
    ];
    const keep = nx * -(bz - az) + nz * (bx - ax) > 0;
    for (const o of keep ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) this.vert(q[o][0], q[o][1], q[o][2], nx, 0, nz, q[o][3], q[o][4], c);
  }

  /** Poligono piano (a ventaglio) con la normale calcolata; `up` gira le facce verso l'alto. uv dalla funzione. */
  face(pts: number[][], c: THREE.Color, uv: (p: number[]) => [number, number], up = true) {
    const [a, b, d] = pts;
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
    if (up !== n.y >= 0) {
      pts = [...pts].reverse();
      n.negate();
    }
    for (let k = 1; k + 1 < pts.length; k++)
      for (const p of [pts[0], pts[k], pts[k + 1]]) {
        const [u, v] = uv(p);
        this.vert(p[0], p[1], p[2], n.x, n.y, n.z, u, v, c);
      }
  }

  /** Poligono orizzontale (con buchi) a quota y, rivolto in su (o in giù). */
  flat(rings: Float32Array[], y: number, c: THREE.Color, down = false) {
    const pos: number[] = [];
    triangulate(rings, y, pos);
    for (let k = 0; k < pos.length; k += 9) {
      const tri = down ? [6, 3, 0] : [0, 3, 6];
      for (const o of tri) this.vert(pos[k + o], pos[k + o + 1], pos[k + o + 2], 0, down ? -1 : 1, 0, pos[k + o] * 0.1, pos[k + o + 2] * 0.1, c);
    }
  }

  get empty() {
    return this.pos.length === 0;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('bid', new THREE.Float32BufferAttribute(this.bid, 1));
    return g;
  }
}

/** Uniforms condivisi dai materiali che la camera può "bucare" per non perdere di vista il giocatore. */
const cutUniforms = {
  uCutCam: { value: new THREE.Vector3() },
  uCutTarget: { value: new THREE.Vector3() },
  uCut: { value: 0 },
  uInside: { value: -1 }, // edificio in cui è finita la camera: i suoi balconi e parapetti spariscono come i muri
};

/** `perBuilding`: la geometria ha l'attributo `bid` (indice dell'edificio) e sparisce se la camera ci è dentro. */
function cutaway<T extends THREE.Material>(mat: T, perBuilding = false): T {
  mat.customProgramCacheKey = () => (perBuilding ? 'cutaway-b' : 'cutaway');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cutUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCutPos;${perBuilding ? '\nattribute float bid;\nvarying float vBid;' : ''}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
      vec4 cutWp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cutWp = instanceMatrix * cutWp;
      #endif
      vCutPos = (modelMatrix * cutWp).xyz;${perBuilding ? '\n      vBid = bid;' : ''}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec3 uCutCam;\nuniform vec3 uCutTarget;\nuniform float uCut;\nvarying vec3 vCutPos;${perBuilding ? '\nuniform float uInside;\nvarying float vBid;' : ''}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>${perBuilding ? '\n        if (abs(vBid - uInside) < 0.5) discard;' : ''}
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
  private readonly solidOwner: { b: number; h: number }[] = [];
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
    this.buildCourts();
    this.buildBuildings();
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
    const c = camera.position;
    let inside = -1;
    const list = this.cellSolids.get(this.key(Math.floor(c.x / this.gridCell), Math.floor(c.z / this.gridCell)));
    if (list)
      for (const i of list) {
        const info = this.solidOwner[i];
        if (info.b >= 0 && c.y < info.h + 3 && this.inside(this.solids[i], c.x, c.z)) inside = info.b;
      }
    cutUniforms.uInside.value = inside;
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

  /** Ostacolo poligonale; `b`, `h`: edificio a cui appartiene (-1 per le piscine) e sua altezza. */
  private addSolid(rings: Float32Array[], b = -1, h = 0) {
    const idx = this.solids.push(rings) - 1;
    this.solidOwner.push({ b, h });
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

  /** C'è un edificio (o una piscina) in questo punto? */
  private solidAt(x: number, z: number) {
    const list = this.cellSolids.get(this.key(Math.floor(x / this.gridCell), Math.floor(z / this.gridCell)));
    return !!list?.some((i) => this.inside(this.solids[i], x, z));
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
    // il suolo col colore misurato: prati secchi o irrigati, giardini, terra
    const R = this.renderHalf;
    const tint = this.tintTexture();
    const pos = [-R, 0, -R, -R, 0, R, R, 0, R, -R, 0, -R, R, 0, R, R, 0, -R];
    const g = flatGeometry(pos);
    const uv: number[] = [];
    for (let k = 0; k < pos.length; k += 3) uv.push((pos[k] + R) / (2 * R), (pos[k + 2] + R) / (2 * R));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const soil = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tint, depthWrite: false }));
    soil.renderOrder = -95;
    this.group.add(soil);
    AREA_KINDS.forEach((kind, i) => {
      const polys = this.map.areas[kind];
      const color = AREA[kind];
      if (color && polys.length) this.addLayer(polys, color, -90 + i);
    });
    // ombre dei palazzi, calcolate in build_map.py con la stessa direzione del sole
    const sh: number[] = [];
    for (const p of this.map.shadow) triangulate(p.map(ring), 0, sh);
    const mat = new THREE.MeshBasicMaterial({ color: '#10131c', transparent: true, opacity: this.night ? 0.12 : 0.24, depthWrite: false });
    const mesh = new THREE.Mesh(flatGeometry(sh), mat);
    mesh.renderOrder = -2;
    this.group.add(mesh);
  }

  /** Il colore del suolo (celle di 10 m dalla Sentinel-2), filtrato: le celle sfumano l'una nell'altra. */
  private tintTexture() {
    const { n, data } = this.map.tint;
    const bin = atob(data);
    const px = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      px[i * 4] = bin.charCodeAt(i * 3);
      px[i * 4 + 1] = bin.charCodeAt(i * 3 + 1);
      px[i * 4 + 2] = bin.charCodeAt(i * 3 + 2);
      px[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(px, n, n, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    this.textures.push(t);
    return t;
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

  /** Edifici: facciate nello stile del quartiere, vetrine, balconi, tetti, pensiline. */
  private buildBuildings() {
    const walls = FACADES.map(() => new Geo());
    const shops = new Geo();
    const solid = new Geo(); // tetti piani, cupole, parapetti, balconi, torrini, pensiline, pompe
    const tiles = new Geo(); // falde in coppi
    const wallC = new THREE.Color();
    const stone = new THREE.Color(STONE);
    // la fascia della pensilina ha il colore dell'insegna (es. il blu del distributore IP)
    const band = new Map<number, string>();
    for (const p of this.map.pois) if (p.building !== undefined) band.set(p.building, (SIGN_STYLES[p.id] ?? SIGN_DEFAULT).bg);
    const fronts: { b: MapBuilding; bi: number; edges: number[][]; g0: number }[] = [];
    this.map.buildings.forEach((b, bi) => {
      const h = b.h * D;
      const rings = b.rings.map(ring);
      solid.id = bi;
      if (b.r === ROOF.canopy) {
        this.buildCanopy(b, rings, h, band.get(bi), solid);
        return;
      }
      const st = FACADES[b.s] ?? FACADES[0];
      wallC.setHex(b.wc);
      const plinth = wallC.clone().multiplyScalar(0.9);
      const shop = new Set(b.shop ?? []);
      // il piano terra dei negozi è più alto: i piani sopra partono da lì
      const gFull = shop.size ? GF : st.floor;
      const g0 = Math.min(h, gFull);
      const uS = 1 / (st.bay * 4);
      const vS = 1 / (st.floor * 4);
      let u = (((bi * 2654435761) >>> 0) % 7) * st.bay;
      const edges: number[][] = [];
      rings.forEach((r, ri) => {
        const sign = (ri === 0 ? 1 : -1) * (signedArea(r) > 0 ? 1 : -1);
        const m = r.length;
        for (let k = 0; k < m; k += 2) {
          const ax = r[k];
          const az = r[k + 1];
          const bx = r[(k + 2) % m];
          const bz = r[(k + 3) % m];
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 1e-4) continue;
          const nx = (sign * (bz - az)) / len;
          const nz = (-sign * (bx - ax)) / len;
          if (ri === 0 && shop.has(k / 2)) shops.wall(ax, az, bx, bz, 0, g0, nx, nz, u / (SHOP_BAY * 4), (u + len) / (SHOP_BAY * 4), 0, g0 / GF, stone);
          else walls[b.s].wall(ax, az, bx, bz, 0, g0, nx, nz, u * uS, (u + len) * uS, 0, (0.25 * g0) / gFull, plinth);
          if (h > g0) walls[b.s].wall(ax, az, bx, bz, g0, h, nx, nz, u * uS, (u + len) * uS, 0.25, 0.25 + (h - g0) * vS, wallC);
          if (ri === 0) edges.push([ax, az, bx, bz, nx, nz, len]);
          u += len;
        }
      });
      this.buildRoof(b, bi, rings, h, wallC, solid, tiles);
      if (st.balconies && h - g0 > 3) fronts.push({ b, bi, edges, g0 });
      this.addSolid(rings, bi, h);
    });
    // balconi con parapetto pieno, uno o due per piano su ogni facciata libera (non sui muri in comune)
    const slab = new THREE.Color(SLAB);
    const par = new THREE.Color();
    for (const { b, bi, edges, g0 } of fronts) {
      solid.id = bi;
      const st = FACADES[b.s];
      const h = b.h * D;
      if (st.trim) par.set(st.trim);
      else par.setHex(b.wc);
      for (const [ax, az, bx, bz, nx, nz, len] of edges) {
        if (len < 6 || this.solidAt((ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2)) continue;
        const a = Math.atan2(bz - az, bx - ax);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const segs = len < 14 ? [[0.5, 0.62]] : [[0.27, 0.36], [0.73, 0.36]];
        for (let y = g0; y + 1.6 < h; y += st.floor)
          for (const [t, f] of segs) {
            const l = len * f;
            const cx = ax + (bx - ax) * t + nx * 0.55;
            const cz = az + (bz - az) * t + nz * 0.55;
            solid.box(cx, y - 0.16, cz, l, 0.16, 1.1, a, slab);
            solid.box(cx + nx * 0.5, y, cz + nz * 0.5, l, 0.95, 0.1, a, par);
            for (const s of [-1, 1]) solid.box(cx + ca * s * (l / 2 - 0.05), y, cz + sa * s * (l / 2 - 0.05), 0.1, 0.95, 1.1, a, par);
          }
      }
    }
    const tex = FACADES.map((st, i) => facadeTexture(st, 7 + i * 31));
    const shopTex = shopTexture();
    const tileTex = tileTexture();
    this.textures.push(shopTex.map, shopTex.lit, tileTex, ...tex.flatMap((t) => [t.map, t.lit]));
    const lit = (map: THREE.Texture, emissiveMap: THREE.Texture) =>
      cutaway(new THREE.MeshLambertMaterial({ vertexColors: true, map, emissiveMap, emissive: this.night ? '#ffffff' : '#000000' }));
    walls.forEach((g, i) => {
      if (!g.empty) this.group.add(new THREE.Mesh(g.geometry(), lit(tex[i].map, tex[i].lit)));
    });
    if (!shops.empty) this.group.add(new THREE.Mesh(shops.geometry(), lit(shopTex.map, shopTex.lit)));
    if (!tiles.empty) this.group.add(new THREE.Mesh(tiles.geometry(), cutaway(new THREE.MeshLambertMaterial({ vertexColors: true, map: tileTex }))));
    this.group.add(new THREE.Mesh(solid.geometry(), cutaway(new THREE.MeshLambertMaterial({ vertexColors: true }), true)));
  }

  /** Tetto: lastrico solare (parapetto, torrino, pannelli), padiglione in coppi, cupola, lamiera. */
  private buildRoof(b: MapBuilding, bi: number, rings: Float32Array[], h: number, wallC: THREE.Color, solid: Geo, tiles: Geo) {
    const rc = new THREE.Color(b.rc);
    const r = rings[0];
    const m = r.length;
    if (b.r === ROOF.dome) {
      let cx = 0;
      let cz = 0;
      for (let k = 0; k < m; k += 2) {
        cx += r[k];
        cz += r[k + 1];
      }
      cx /= m / 2;
      cz /= m / 2;
      let rad = 0;
      for (let k = 0; k < m; k += 2) rad += Math.hypot(r[k] - cx, r[k + 1] - cz);
      rad /= m / 2;
      solid.flat(rings, h, rc);
      solid.add(new THREE.SphereGeometry(rad, 28, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.36, 1).translate(cx, h, cz), rc);
      return;
    }
    if (b.r === ROOF.tiles && b.hip) {
      this.hipRoof(b.hip, h, rc, tiles);
      return;
    }
    solid.flat(rings, h, rc);
    if (b.r === ROOF.sheet) return;
    const st = FACADES[b.s];
    const par = st.trim ? new THREE.Color(st.trim) : wallC.clone().multiplyScalar(0.96);
    let best = 0;
    let ang = 0;
    for (const rg of rings) {
      const n = rg.length;
      for (let k = 0; k < n; k += 2) {
        const ax = rg[k];
        const az = rg[k + 1];
        const bx = rg[(k + 2) % n];
        const bz = rg[(k + 3) % n];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const a = Math.atan2(bz - az, bx - ax);
        solid.box((ax + bx) / 2, h, (az + bz) / 2, len + 0.24, 0.7, 0.24, a, par);
        if (rg === r && len > best) {
          best = len;
          ang = a;
        }
      }
    }
    if (b.s === 3 || b.s === 6) return;
    // baricentro: lì il torrino delle scale e dell'ascensore
    let A = 0;
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < m; k += 2) {
      const x0 = r[k];
      const z0 = r[k + 1];
      const x1 = r[(k + 2) % m];
      const z1 = r[(k + 3) % m];
      const cr = x0 * z1 - x1 * z0;
      A += cr;
      cx += (x0 + x1) * cr;
      cz += (z0 + z1) * cr;
    }
    if (Math.abs(A / 2) < 80) return;
    cx /= 3 * A;
    cz /= 3 * A;
    if (!this.inside(rings, cx, cz)) return;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const box = par.clone().multiplyScalar(0.97);
    solid.box(cx, h, cz, 3, 2.4, 2.4, ang, box);
    solid.box(cx, h + 2.4, cz, 3.3, 0.14, 2.7, ang, new THREE.Color('#9b968d'));
    const hash = (bi * 40503 + 17) & 0xffff;
    if (hash % 3 !== 0) {
      // pannelli solari, rivolti a sud
      const side = ca >= 0 ? 1 : -1;
      const panel = new THREE.Color('#27354a');
      for (let i = -2; i <= 2; i++) {
        const px = cx + ca * i * 1.3 - sa * 3.4 * side;
        const pz = cz + sa * i * 1.3 + ca * 3.4 * side;
        if (this.inside(rings, px - sa * 1.2, pz + ca * 1.2) && this.inside(rings, px + sa * 1.2, pz - ca * 1.2)) solid.box(px, h + 0.35, pz, 1.15, 0.06, 1.8, ang, panel, 0.45 * side);
      }
    }
    const unit = new THREE.Color('#cfd2d4');
    for (const s of [-1, 1]) {
      const px = cx + ca * s * 3.2 + sa * 2.4;
      const pz = cz + sa * s * 3.2 - ca * 2.4;
      if (this.inside(rings, px, pz)) solid.box(px, h, pz, 0.9, 0.65, 0.55, ang, unit);
    }
  }

  /** Tetto a padiglione sul rettangolo della pianta, con la gronda che sporge. */
  private hipRoof(hip: number[], h: number, rc: THREE.Color, tiles: Geo) {
    const x = hip[0] * D;
    const z = hip[1] * D;
    const a = hip[2] / 1000;
    const o = 0.4;
    const L = hip[3] * D + 2 * o;
    const W = hip[4] * D + 2 * o;
    const rise = Math.min(4.5, (W / 2) * 0.5); // ~27°
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const y0 = h - 0.15;
    const P = (s: number, t: number) => [x + ux * (L / 2) * s - uz * (W / 2) * t, y0, z + uz * (L / 2) * s + ux * (W / 2) * t];
    const rl = Math.max(0, (L - W) / 2);
    const top = (s: number) => [x + ux * rl * s, y0 + rise, z + uz * rl * s];
    const k = Math.hypot(rise, W / 2) / rise / 2;
    const along = (p: number[]): [number, number] => [((p[0] - x) * ux + (p[2] - z) * uz) / 2, (p[1] - y0) * k];
    const across = (p: number[]): [number, number] => [(-(p[0] - x) * uz + (p[2] - z) * ux) / 2, (p[1] - y0) * k];
    tiles.face([P(-1, 1), P(1, 1), top(1), top(-1)], rc, along);
    tiles.face([P(1, -1), P(-1, -1), top(-1), top(1)], rc, along);
    tiles.face([P(1, 1), P(1, -1), top(1)], rc, across);
    tiles.face([P(-1, -1), P(-1, 1), top(-1)], rc, across);
  }

  /** Pensilina (tettoia, distributore): solo la copertura su pilastri, ci si passa sotto. */
  private buildCanopy(b: MapBuilding, rings: Float32Array[], h: number, band: string | undefined, solid: Geo) {
    const t = 0.9;
    const side = new THREE.Color(band ?? '#d5d9de');
    solid.flat(rings, h, new THREE.Color(b.rc));
    solid.flat(rings, h - t, new THREE.Color('#c9cdd2'), true);
    const r = rings[0];
    const m = r.length;
    const sign = signedArea(r) > 0 ? 1 : -1;
    let best = 0;
    let ang = 0;
    for (let k = 0; k < m; k += 2) {
      const ax = r[k];
      const az = r[k + 1];
      const bx = r[(k + 2) % m];
      const bz = r[(k + 3) % m];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      solid.wall(ax, az, bx, bz, h - t, h, (sign * (bz - az)) / len, (-sign * (bx - ax)) / len, 0, 0, 0, 0, side);
      if (len > best) {
        best = len;
        ang = Math.atan2(bz - az, bx - ax);
      }
    }
    // rettangolo orientato sul lato più lungo: i pilastri stanno sul suo asse
    const ux = Math.cos(ang);
    const uz = Math.sin(ang);
    let s0 = Infinity;
    let s1 = -Infinity;
    let t0 = Infinity;
    let t1 = -Infinity;
    for (let k = 0; k < m; k += 2) {
      const s = r[k] * ux + r[k + 1] * uz;
      const q = -r[k] * uz + r[k + 1] * ux;
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
      t0 = Math.min(t0, q);
      t1 = Math.max(t1, q);
    }
    const sm = (s0 + s1) / 2;
    const tm = (t0 + t1) / 2;
    const L = s1 - s0;
    const n = L > 14 ? 3 : L > 7 ? 2 : 1;
    const pillar = new THREE.Color('#dfe2e6');
    const island = new THREE.Color('#bfc3c8');
    const pump = new THREE.Color('#f1f2f4');
    for (let i = 0; i < n; i++) {
      const s = n === 1 ? sm : s0 + 3 + (i * (L - 6)) / (n - 1);
      const px = s * ux - tm * uz;
      const pz = s * uz + tm * ux;
      solid.add(new THREE.CylinderGeometry(0.22, 0.22, h - t, 10).translate(px, (h - t) / 2, pz), pillar);
      this.addCircle(px, pz, 0.35);
      if (!b.fuel) continue;
      // isola con due colonnine di erogazione
      solid.box(px, 0, pz, 1, 0.18, 3.4, ang, island);
      for (const q of [-1.1, 1.1]) {
        const qx = px - uz * q;
        const qz = pz + ux * q;
        solid.box(qx, 0.18, qz, 0.5, 1.45, 0.75, ang, pump);
        solid.box(qx, 1.63, qz, 0.54, 0.3, 0.79, ang, side);
        this.addCircle(qx, qz, 0.5);
      }
    }
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

  /** Gli alberi veri: ogni modello è scalato sull'altezza e sulla chioma misurate; ombra a terra. */
  private buildTrees() {
    const t = this.map.trees;
    const cyl = (r0: number, r1: number, h: number, seg = 6) => new THREE.CylinderGeometry(r0, r1, h, seg);
    const ico = (detail = 0) => new THREE.IcosahedronGeometry(1, detail);
    // H, R: altezza e raggio della chioma del modello; r: raggio del tronco per le collisioni;
    // wide: quanto la chioma può allargarsi rispetto all'altezza (un cipresso resta stretto)
    const models = [
      {
        // 0 pino domestico: tronco alto e un po' storto, chioma a ombrello
        H: 10,
        R: 4,
        trunk: merge(cyl(0.2, 0.36, 8.6).rotateZ(0.05).translate(0.2, 4.3, 0), cyl(0.07, 0.11, 2.6).rotateZ(0.95).translate(1.2, 7.9, 0.2), cyl(0.07, 0.11, 2.4).rotateZ(-0.9).translate(-0.8, 8, -0.2)),
        crown: merge(ico(1).scale(3.4, 0.95, 3.2).translate(0, 8.9, 0), ico().scale(2, 0.7, 1.9).translate(1.9, 8.5, 0.8), ico().scale(1.9, 0.7, 1.8).translate(-1.8, 8.6, -0.6), ico().scale(1.6, 0.6, 1.6).translate(0.3, 9.3, -1.5)),
        colors: ['#3e5f35', '#46683a', '#3a5a36'],
        r: 0.38,
        wide: 1.6,
      },
      {
        // 1 latifoglia: lecci, platani, tigli
        H: 7,
        R: 3,
        trunk: merge(cyl(0.16, 0.28, 3.2).translate(0, 1.6, 0), cyl(0.08, 0.12, 1.6).rotateZ(-0.7).translate(0.6, 3.1, 0)),
        crown: merge(ico(1).scale(2.4, 2, 2.4).translate(0, 4.7, 0), ico().scale(1.6, 1.4, 1.6).translate(1.3, 4, 0.7), ico().scale(1.5, 1.3, 1.5).translate(-1.2, 4.2, -0.6), ico().scale(1.3, 1.2, 1.3).translate(0.2, 5.8, 0.3)),
        colors: ['#3f6136', '#4f7a3f', '#5d8b45', '#466d39'],
        r: 0.32,
        wide: 1.6,
      },
      {
        // 2 cipresso
        H: 10,
        R: 1.3,
        trunk: cyl(0.12, 0.18, 1, 5).translate(0, 0.5, 0),
        crown: merge(ico(1).scale(1.25, 4.3, 1.25).translate(0, 5.3, 0), ico().scale(0.7, 1.4, 0.7).translate(0, 8.9, 0)),
        colors: ['#2c4a2e', '#33522f'],
        r: 0.55,
        wide: 1,
      },
      {
        // 3 arbusto: oleandri, pittosfori, siepi
        H: 2.4,
        R: 1.5,
        trunk: null,
        crown: merge(ico(1).scale(1.5, 1.1, 1.5).translate(0, 1.1, 0), ico().scale(1, 0.8, 1).translate(0.8, 1.4, 0.3)),
        colors: ['#557f42', '#4c7340', '#6a8b4a'],
        r: 0.9,
        wide: 1.8,
      },
      {
        // 4 olivo: tronco contorto, chioma grigio-argento
        H: 4.5,
        R: 2.4,
        trunk: merge(cyl(0.16, 0.3, 2.2).rotateZ(0.25).translate(-0.25, 1.1, 0), cyl(0.12, 0.2, 1.8).rotateZ(-0.45).translate(0.45, 1.6, 0.1)),
        crown: merge(ico(1).scale(1.9, 1, 1.8).translate(-0.4, 3.3, 0), ico().scale(1.5, 0.9, 1.4).translate(1, 3.5, 0.3), ico().scale(1.2, 0.8, 1.2).translate(0.1, 4, -0.6)),
        colors: ['#7f9466', '#8a9b70'],
        r: 0.35,
        wide: 1.5,
      },
    ];
    const byType: number[][] = models.map(() => []);
    for (let i = 0; i < t.length; i += 5) byType[t[i + 2]]?.push(i);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#76563e', flatShading: true });
    // ombre: un disco per chioma, spostato come le ombre dei palazzi
    const [lx, ly, lz] = this.map.meta.sun;
    const shadowGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#10131c', transparent: true, opacity: this.night ? 0.1 : 0.2, depthWrite: false });
    const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, t.length / 5);
    let ns = 0;
    models.forEach((model, type) => {
      const list = byType[type];
      if (!list.length) return;
      const crownMat = cutaway(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }));
      const crown = new THREE.InstancedMesh(model.crown, crownMat, list.length);
      const trunk = model.trunk ? new THREE.InstancedMesh(model.trunk, trunkMat, list.length) : null;
      list.forEach((i, k) => {
        const x = t[i] * D;
        const z = t[i + 1] * D;
        const h = t[i + 3] * D;
        const r = t[i + 4] * D;
        const hs = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        const rnd = hs - Math.floor(hs);
        const sy = h / model.H;
        const sxz = Math.min(model.wide * sy, Math.max(0.55 * sy, r / model.R));
        q.setFromAxisAngle(up, rnd * Math.PI * 2);
        m.compose(p.set(x, 0, z), q, s.set(sxz, sy, sxz));
        crown.setMatrixAt(k, m);
        trunk?.setMatrixAt(k, m);
        c.set(model.colors[Math.floor(rnd * 997) % model.colors.length]).offsetHSL((rnd - 0.5) * 0.03, 0, (rnd - 0.5) * 0.06);
        crown.setColorAt(k, c);
        this.addCircle(x, z, model.r * sxz);
        const hc = h * 0.75;
        q.identity();
        m.compose(p.set(x - (lx / ly) * SUN_SHADOW * hc, 0.02, z - (lz / ly) * SUN_SHADOW * hc), q, s.set(r, 1, r));
        shadows.setMatrixAt(ns++, m);
      });
      this.group.add(crown);
      if (trunk) this.group.add(trunk);
    });
    shadows.count = ns;
    shadows.renderOrder = -2;
    this.group.add(shadows);
  }

  /** Campi sportivi: superficie con le righe, reti, frangivento dei campi da tennis, vetri dei padel, porte del calcetto. */
  private buildCourts() {
    const c = this.map.courts;
    if (!c.length) return;
    const surfaces = COURT_TYPES.map(() => new Geo());
    const parts = new Geo(); // reti, pali, porte
    const screens = new Geo(); // frangivento e maglia metallica
    const glass = new Geo(); // pareti dei padel
    const white = new THREE.Color('#ffffff');
    const net = new THREE.Color('#2b3036');
    const post = new THREE.Color('#59616a');
    const H = 2.4; // 3 m
    for (let i = 0; i < c.length; i += 6) {
      const type = c[i];
      const x = c[i + 1] * D;
      const z = c[i + 2] * D;
      const a = c[i + 3] / 1000;
      const L = c[i + 4] * D;
      const W = c[i + 5] * D;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const P = (s: number, t: number) => [x + ux * (L / 2) * s - uz * (W / 2) * t, 0.03, z + uz * (L / 2) * s + ux * (W / 2) * t];
      surfaces[type]?.face([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], white, (v) => [((v[0] - x) * ux + (v[2] - z) * uz) / L + 0.5, (-(v[0] - x) * uz + (v[2] - z) * ux) / W + 0.5]);
      const kind = COURT_TYPES[type];
      if (kind === 'turf') {
        for (const s of [-1, 1]) {
          const gx = x + ux * (L / 2 - 0.6) * s;
          const gz = z + uz * (L / 2 - 0.6) * s;
          for (const tt of [-1.2, 1.2]) parts.box(gx - uz * tt, 0, gz + ux * tt, 0.1, 1.6, 0.1, a, white);
          parts.box(gx, 1.55, gz, 0.1, 0.1, 2.5, a, white);
        }
        continue;
      }
      // rete a metà campo, con i pali
      const nl = kind === 'padel' ? W - 0.1 : Math.min(W - 0.2, 10.3);
      parts.box(x, 0.05, z, 0.04, 0.72, nl, a, net);
      parts.box(x, 0.77, z, 0.06, 0.06, nl, a, white);
      for (const s of [-1, 1]) parts.box(x - uz * (nl / 2) * s, 0, z + ux * (nl / 2) * s, 0.1, 0.85, 0.1, a, post);
      // recinzione, appena dentro il bordo: i campi vicini non si sovrappongono
      const e = 0.06;
      const corner = (s: number, t: number) => [x + ux * (L / 2 - e) * s - uz * (W / 2 - e) * t, z + uz * (L / 2 - e) * s + ux * (W / 2 - e) * t];
      const sides: [number, number, number, number, boolean][] = [
        [-1, -1, 1, -1, false],
        [1, -1, 1, 1, true],
        [1, 1, -1, 1, false],
        [-1, 1, -1, -1, true],
      ];
      for (const [s0, t0, s1, t1, end] of sides) {
        const [ax, az] = corner(s0, t0);
        const [bx, bz] = corner(s1, t1);
        const len = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        if (kind === 'padel') {
          // fondo di vetro, lati di vetro per 2 m e poi maglia metallica
          if (end) glass.wall(ax, az, bx, bz, 0, H, nx, nz, 0, 0, 0, 0, white);
          else {
            const f = Math.min(0.45, 1.6 / len);
            const lerp = (k: number) => [ax + (bx - ax) * k, az + (bz - az) * k];
            const [p1x, p1z] = lerp(f);
            const [p2x, p2z] = lerp(1 - f);
            glass.wall(ax, az, p1x, p1z, 0, H, nx, nz, 0, 0, 0, 0, white);
            glass.wall(p2x, p2z, bx, bz, 0, H, nx, nz, 0, 0, 0, 0, white);
            screens.wall(p1x, p1z, p2x, p2z, 0, H * 0.8, nx, nz, 0, (len * (1 - 2 * f)) / 2, 0, 0.8, white);
          }
        } else screens.wall(ax, az, bx, bz, 0, H, nx, nz, 0, len / 2, 0, 1, white);
        parts.box(ax, 0, az, 0.09, H + 0.05, 0.09, a, post);
      }
    }
    const fence = windscreenTexture();
    this.textures.push(fence);
    COURT_TYPES.forEach((kind, i) => {
      if (surfaces[i].empty) return;
      const map = courtTexture(kind);
      this.textures.push(map);
      const mesh = new THREE.Mesh(surfaces[i].geometry(), new THREE.MeshLambertMaterial({ map, depthWrite: false }));
      mesh.renderOrder = -85.5;
      this.group.add(mesh);
    });
    this.group.add(new THREE.Mesh(parts.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    if (!screens.empty) this.group.add(new THREE.Mesh(screens.geometry(), cutaway(new THREE.MeshLambertMaterial({ map: fence, alphaTest: 0.35, side: THREE.DoubleSide }))));
    if (!glass.empty)
      this.group.add(new THREE.Mesh(glass.geometry(), cutaway(new THREE.MeshLambertMaterial({ color: '#cfeaf2', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }))));
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
    const awnings = new Geo();
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
        const canopy = poi.building !== undefined && this.map.buildings[poi.building]?.r === ROOF.canopy;
        if ((poi.role === 'lunch' || poi.role === 'coffee') && !canopy) {
          // tenda da sole a strisce sopra la vetrina, nei colori del locale
          const st = SIGN_STYLES[poi.id] ?? SIGN_DEFAULT;
          const a = new THREE.Color(st.accent && st.accent !== st.fg ? st.accent : st.bg);
          const white = new THREE.Color('#f4f1ea');
          const y0 = y - h / 2 - 0.12;
          const n = Math.max(4, Math.round(w / 0.5));
          for (let k = 0; k < n; k++) {
            const t0 = -w / 2 + (k * w) / n;
            const t1 = t0 + w / n;
            const c = k % 2 ? white : a;
            const p = (t: number, out: number, dy: number) => [x + tx * t + nx * out, y0 + dy, z + tz * t + nz * out];
            awnings.face([p(t0, 0.05, 0), p(t1, 0.05, 0), p(t1, 1.4, -0.6), p(t0, 1.4, -0.6)], c, () => [0, 0]);
            awnings.face([p(t0, 1.4, -0.6), p(t1, 1.4, -0.6), p(t1, 1.4, -0.9), p(t0, 1.4, -0.9)], c, () => [0, 0]);
          }
        }
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
    if (!awnings.empty) this.group.add(new THREE.Mesh(awnings.geometry(), cutaway(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))));
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
    // campi sportivi coi loro colori (terra rossa, resina, padel, erba sintetica)
    const COURT_MINI = ['#c4673f', '#2f5f9e', '#2f62b8', '#3f8a45'];
    const c = this.map.courts;
    for (let i = 0; i < c.length; i += 6) {
      const a = c[i + 3] / 1000;
      g.save();
      g.translate(c[i + 1] * D, c[i + 2] * D);
      g.rotate(a);
      g.fillStyle = COURT_MINI[c[i]] ?? '#3f7a43';
      g.fillRect((-c[i + 4] * D) / 2, (-c[i + 5] * D) / 2, c[i + 4] * D, c[i + 5] * D);
      g.restore();
    }
    g.strokeStyle = '#1d2333';
    g.lineWidth = 0.6;
    for (const b of this.map.buildings) {
      g.fillStyle = `#${b.rc.toString(16).padStart(6, '0')}`;
      g.beginPath();
      for (const r of b.rings) {
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
