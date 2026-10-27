import type { WeaponDef, WeaponStats } from '../config/types';
import type { Frame } from '../render/atlas';
import { HIVES, type HiveLayout } from '../render/logos/index';
import type { Enemy, Projectile } from './entities';
import type { Game } from './game';

// Comportamento delle armi. Ogni "kind" è un pattern riusabile: nuove armi a tema
// si aggiungono in config/weapons.ts senza toccare questo file.
// 'minion' usa gli sprite <sprite>, <sprite>_idle, <sprite>_hit e <sprite>_spark;
// 'lob' usa <sprite> (in volo), <sprite>_splash e <sprite>_steam (la pozza).
// 'split' usa <sprite> (in volo), <sprite>_l e <sprite>_r (i frammenti), <sprite>_stem e <sprite>_burst.
// 'swarm' usa l'alveare HIVES[<sprite>] (celle <sprite>_c0…), <sprite>_fly e <sprite>_burst.

/** Aiutante autonomo (arma 'minion'): corre dal bersaglio, colpisce, torna dal giocatore. */
export interface Minion {
  x: number;
  y: number;
  z: number;
  face: number;
  target: Enemy | null;
  atk: number; // attesa prima del prossimo colpo
  hitT: number; // tempo dall'ultimo colpo (animazione d'attacco)
  moving: boolean;
  phase: number; // sfasa camminata e battito di ciglia tra un aiutante e l'altro
}

/** Oggetto lanciato a parabola (arma 'lob'). */
export interface Lob {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  max: number;
  rot: number;
  spin: number;
}

/** Zona che danneggia nel tempo, lasciata da un 'lob' all'atterraggio. */
export interface Pool {
  x: number;
  y: number;
  z: number;
  r: number;
  t: number;
  max: number;
  tick: number;
}

/** Disco che va e torna (arma 'boomerang'). */
export interface Disc {
  x: number;
  y: number;
  z: number;
  vx: number; // direzione (unitaria)
  vz: number;
  sp: number; // velocità
  back: boolean;
  t: number;
  hits: Map<number, number>; // nemico → istante da cui può essere colpito di nuovo
}

/** Cella dell'alveare in volo verso un nemico (arma 'swarm'). */
export interface Bee {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  target: Enemy | null; // senza bersaglio torna al suo posto nell'alveare
  cell: number;
  t: number;
  rot: number;
}

const LOB_GRAVITY = 30;
const HIVE_WIDTH = 2.1; // larghezza dell'alveare in unità mondo
/** Kind con oggetti propri già partiti (fulmini, tazze e pozze, dischi, api): in aggiornamento finiscono la corsa senza fare danno. */
const IN_FLIGHT_KINDS = new Set(['strike', 'lob', 'boomerang', 'swarm']);

export class WeaponInstance {
  level = 1;
  stats: WeaponStats;
  timer = 0.4;
  /** Secondi rimasti "in aggiornamento" (0 = attiva): niente nuovi attacchi né danni, oggetti persistenti spenti. */
  locked = 0;
  angle = 0;
  damageDealt = 0;
  readonly hitTimes = new Map<number, number>();
  readonly strikes: { x: number; z: number; t: number; max: number }[] = [];
  readonly points: { x: number; y: number; z: number }[] = [];
  minions: Minion[] = [];
  lobs: Lob[] = [];
  pools: Pool[] = [];
  discs: Disc[] = [];
  readonly hive = { x: 0, y: 0, z: 0, ready: false };
  cells: number[] = []; // per cella dell'alveare: 1 = al suo posto, 0..1 = ricresce, -1 = in volo
  bees: Bee[] = [];

  constructor(readonly def: WeaponDef) {
    this.stats = { ...def.base };
  }

  /** Nuovo progetto: via gli effetti a terra, gli aiutanti ripartono dal giocatore. */
  resetStage(x: number, y: number, z: number) {
    this.strikes.length = 0;
    this.lobs = [];
    this.pools = [];
    this.discs = [];
    this.bees = [];
    this.hive.ready = false;
    this.cells.fill(1);
    for (const m of this.minions) {
      m.x = x + (Math.random() - 0.5) * 3;
      m.z = z + (Math.random() - 0.5) * 3;
      m.y = y;
      m.target = null;
    }
  }
}

const tmp: Enemy[] = [];
const tmpPt = { x: 0, z: 0 };
const cellPt = { x: 0, y: 0, z: 0 };

/** Posizione nel mondo di una cella dell'alveare: le celle stanno su un piano rivolto alla camera. */
function cellPos(w: WeaponInstance, g: Game, hive: HiveLayout, i: number) {
  const s = HIVE_WIDTH / hive.size;
  const c = hive.cells[i];
  const r = g.rig.right;
  const f = g.rig.forward;
  cellPt.x = w.hive.x + r.x * c.x * s - f.x * i * 0.02; // piccolo scarto in profondità: niente sfarfallio tra i bordi
  cellPt.y = w.hive.y - c.y * s;
  cellPt.z = w.hive.z + r.z * c.x * s - f.z * i * 0.02;
  return cellPt;
}

/** Arma 'split': il proiettile si divide in frammenti diretti ai nemici vicini (o a ventaglio). */
export function splitProjectile(g: Game, w: WeaponInstance, pr: Projectile, hit: Enemy) {
  pr.alive = false;
  const sprite = w.def.sprite;
  const area = w.stats.area * g.stats.area;
  const near = g.nearestEnemies(hit.x, hit.z, 9 * area, pr.split + 1).filter((e) => e !== hit);
  const base = Math.atan2(pr.vz, pr.vx);
  const sp = Math.hypot(pr.vx, pr.vz) * 0.85;
  for (let i = 0; i < pr.split; i++) {
    const t = near[i];
    const a = t ? Math.atan2(t.z - hit.z, t.x - hit.x) : base + (i - (pr.split - 1) / 2) * 0.9;
    const sh = g.spawnProjectile(w, hit.x, pr.y, hit.z, Math.cos(a) * sp, 0, Math.sin(a) * sp, 1.05 * area, 0.6, (i % 2 ? 1 : -1) * 10);
    sh.frame = g.frame(`${sprite}_${i % 2 ? 'r' : 'l'}`);
    sh.damage = pr.damage * 0.7;
    sh.pierce = 0;
    sh.hits.push(hit.id);
  }
  g.spawnFx(`${sprite}_burst`, hit.x, pr.y, hit.z, { size0: 1.6 * area, size1: 2.6 * area, life: 0.3, anim: true });
  g.spawnFx(`${sprite}_stem`, hit.x, pr.y, hit.z, { size0: 0.8, size1: 0.6, life: 0.7, vx: (Math.random() - 0.5) * 3, vy: 4, vz: (Math.random() - 0.5) * 3, gravity: 18, spin: 7 });
  g.audio.play('split');
}

function easeOutBack(x: number) {
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

/** Nemico più vicino all'aiutante, entro `range` dal giocatore; evita quelli già presi da altri aiutanti. */
function minionTarget(g: Game, m: Minion, range: number, taken: Set<number>): Enemy | null {
  const p = g.player;
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of g.enemiesNear(m.x, m.z, range, tmp)) {
    if (!e.alive || (e.x - p.x) ** 2 + (e.z - p.z) ** 2 > range * range) continue;
    const d = (e.x - m.x) ** 2 + (e.z - m.z) ** 2 + (taken.has(e.id) ? 400 : 0);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

export function updateWeapon(w: WeaponInstance, g: Game, dt: number) {
  const s = g.stats;
  const st = w.stats;
  const cd = st.cooldown / s.attackSpeed;
  const area = st.area * s.area;
  const p = g.player;
  // in aggiornamento: nessun nuovo attacco; orbite, aura e aiutanti si spengono (i danni li blocca damageEnemy)
  const locked = w.locked > 0;
  if (locked && !IN_FLIGHT_KINDS.has(w.def.kind)) {
    w.points.length = 0;
    return;
  }

  switch (w.def.kind) {
    case 'projectile': {
      w.timer -= dt;
      if (w.timer > 0) break;
      const n = st.count + s.projectiles;
      const o = g.companion;
      const targets = g.nearestEnemies(o.x, o.z, st.range, n);
      if (!targets.length) {
        w.timer = 0.1;
        break;
      }
      w.timer = cd;
      for (let i = 0; i < n; i++) {
        const t = targets[i % targets.length];
        const dx = t.x - o.x;
        const dy = t.y + t.height * 0.45 - (o.y + 0.5);
        const dz = t.z - o.z;
        const spread = i >= targets.length ? (i - targets.length + 1) * 0.15 : 0;
        const a = Math.atan2(dz, dx) + spread;
        const hd = Math.hypot(dx, dz) || 1;
        const sp = st.speed * s.projSpeed;
        g.spawnProjectile(w, o.x, o.y + 0.5, o.z, Math.cos(a) * sp, (dy / hd) * sp, Math.sin(a) * sp, 1.1 * area, st.duration * s.duration, 9);
      }
      g.audio.play('shoot');
      break;
    }
    case 'orbit': {
      const n = st.count + s.projectiles;
      const R = st.range * area;
      const size = 1.4 * area;
      w.angle += st.speed * s.projSpeed * dt;
      w.points.length = 0;
      const now = g.runTime;
      for (let i = 0; i < n; i++) {
        const a = w.angle + (i / n) * Math.PI * 2;
        const x = p.x + Math.cos(a) * R;
        const z = p.z + Math.sin(a) * R;
        const y = p.y + 0.6;
        w.points.push({ x, y, z });
        for (const e of g.enemiesNear(x, z, size * 0.5 + 3, tmp)) {
          if (!e.alive || y + size < e.y || y > e.y + e.height + 0.3) continue;
          const d = Math.hypot(e.x - x, e.z - z);
          if (d > size * 0.5 + e.radius) continue;
          if ((w.hitTimes.get(e.id) ?? 0) > now) continue;
          w.hitTimes.set(e.id, now + cd);
          const kx = (e.x - p.x) / (Math.hypot(e.x - p.x, e.z - p.z) || 1);
          const kz = (e.z - p.z) / (Math.hypot(e.x - p.x, e.z - p.z) || 1);
          g.damageEnemy(e, st.damage, w, kx * st.knockback, kz * st.knockback);
        }
        if (w.def.blocks) {
          for (const h of g.hostile) {
            if (!h.alive || (h.x - x) ** 2 + (h.z - z) ** 2 > (size * 0.5 + h.radius) ** 2 || Math.abs(h.y - (y + 0.6)) > 1.8) continue;
            h.alive = false;
            g.spawnFx('spark', h.x, h.y, h.z, { size0: 1.6, size1: 0.3, life: 0.2, rot: Math.random() * 3 });
            g.audio.play('block');
          }
        }
      }
      if (w.hitTimes.size > 600) w.hitTimes.clear();
      break;
    }
    case 'aura': {
      w.angle += dt;
      w.timer -= dt;
      if (w.timer > 0) break;
      w.timer = cd;
      const R = st.range * area;
      for (const e of g.enemiesNear(p.x, p.z, R + 3, tmp)) {
        if (!e.alive) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d > R + e.radius) continue;
        g.damageEnemy(e, st.damage, w, (dx / d) * st.knockback, (dz / d) * st.knockback);
      }
      break;
    }
    case 'radial': {
      w.timer -= dt;
      if (w.timer > 0) break;
      w.timer = cd;
      const n = st.count + s.projectiles * 2;
      w.angle += 0.37;
      const sp = st.speed * s.projSpeed;
      for (let i = 0; i < n; i++) {
        const a = w.angle + (i / n) * Math.PI * 2;
        g.spawnProjectile(w, p.x, p.y + 0.9, p.z, Math.cos(a) * sp, 0, Math.sin(a) * sp, 1.0 * area, st.duration * s.duration, 0);
      }
      g.audio.play('shoot');
      break;
    }
    case 'strike': {
      w.timer -= dt;
      if (w.timer <= 0 && !locked) {
        const n = st.count + s.projectiles;
        const targets = g.randomEnemies(p.x, p.z, st.range, n);
        if (targets.length) {
          w.timer = cd;
          for (const t of targets) w.strikes.push({ x: t.x, z: t.z, t: st.duration, max: st.duration });
        } else w.timer = 0.2;
      }
      for (const k of w.strikes) {
        k.t -= dt;
        if (k.t > 0) continue;
        const R = 3.2 * area;
        const y = g.world.height(k.x, k.z);
        for (const e of g.enemiesNear(k.x, k.z, R + 3, tmp)) {
          if (!e.alive) continue;
          const dx = e.x - k.x;
          const dz = e.z - k.z;
          const d = Math.hypot(dx, dz) || 1;
          if (d > R + e.radius) continue;
          g.damageEnemy(e, st.damage, w, (dx / d) * st.knockback, (dz / d) * st.knockback);
        }
        g.spawnFx('boom', k.x, y + 0.2, k.z, { size0: R * 0.8, size1: R * 2.2, life: 0.35, rot: (Math.random() - 0.5) * 0.6 });
        g.spawnFx('puff', k.x, y, k.z, { size0: R, size1: R * 2, life: 0.5, alpha: 0.7 });
        g.audio.play('boom');
        g.rig.shake = Math.max(g.rig.shake, 0.25);
      }
      for (let i = w.strikes.length - 1; i >= 0; i--) if (w.strikes[i].t <= 0) w.strikes.splice(i, 1);
      break;
    }
    case 'chain': {
      w.timer -= dt;
      if (w.timer > 0) break;
      const n = st.count + s.projectiles;
      const starts = g.nearestEnemies(p.x, p.z, st.range, n);
      if (!starts.length) {
        w.timer = 0.15;
        break;
      }
      w.timer = cd;
      const hit = new Set<number>();
      for (const start of starts) {
        let fx = p.x;
        let fy = p.y + 1.2;
        let fz = p.z;
        let cur: Enemy | null = start;
        for (let b = 0; b <= st.pierce && cur; b++) {
          hit.add(cur.id);
          const ty = cur.y + cur.height * 0.5;
          g.sparkLine(fx, fy, fz, cur.x, ty, cur.z);
          g.damageEnemy(cur, st.damage, w, 0, 0);
          fx = cur.x;
          fy = ty;
          fz = cur.z;
          cur = g.nearestExcluding(cur.x, cur.z, 8 * area, hit);
        }
      }
      g.audio.play('shoot');
      break;
    }
    case 'minion': {
      const n = st.count + s.projectiles;
      while (w.minions.length < n) {
        const a = Math.random() * Math.PI * 2;
        const m: Minion = { x: p.x + Math.cos(a) * 1.5, y: p.y, z: p.z + Math.sin(a) * 1.5, face: 1, target: null, atk: 0, hitT: 9, moving: false, phase: Math.random() * 10 };
        w.minions.push(m);
        g.spawnFx('puff', m.x, m.y, m.z, { size0: 1, size1: 2.2, life: 0.35, alpha: 0.7 });
      }
      const speed = st.speed * s.projSpeed;
      const reach = 0.6 * area;
      const r = g.rig.right;
      const taken = new Set<number>();
      w.minions.forEach((m, i) => {
        m.atk -= dt;
        m.hitT += dt;
        const t0 = m.target;
        if (t0 && (!t0.alive || (t0.x - p.x) ** 2 + (t0.z - p.z) ** 2 > (st.range * 1.4) ** 2)) m.target = null;
        if (!m.target) m.target = minionTarget(g, m, st.range, taken);
        const t = m.target;
        if (t) taken.add(t.id);
        // senza bersaglio si dispone in cerchio attorno al giocatore
        const a = (i / w.minions.length) * Math.PI * 2 + g.runTime * 0.4;
        const tx = t ? t.x : p.x + Math.cos(a) * 2.4;
        const tz = t ? t.z : p.z + Math.sin(a) * 2.4;
        const stop = t ? t.radius + reach : 0.4;
        const dx = tx - m.x;
        const dz = tz - m.z;
        const d = Math.hypot(dx, dz) || 1;
        m.moving = d > stop + 0.05;
        if (m.moving) {
          const sp = t ? speed : speed * Math.min(1, d / 2.5);
          const step = Math.min(d - stop, sp * dt);
          m.x += (dx / d) * step;
          m.z += (dz / d) * step;
          const side = dx * r.x + dz * r.z;
          if (Math.abs(side) > d * 0.2) m.face = side > 0 ? 1 : -1;
        }
        tmpPt.x = m.x;
        tmpPt.z = m.z;
        g.world.resolve(tmpPt, 0.35);
        m.x = tmpPt.x;
        m.z = tmpPt.z;
        m.y = g.world.height(m.x, m.z);
        if ((m.x - p.x) ** 2 + (m.z - p.z) ** 2 > 34 * 34) {
          // rimasto indietro: si "teletrasporta" accanto al giocatore
          m.x = p.x - Math.cos(a) * 1.5;
          m.z = p.z - Math.sin(a) * 1.5;
          m.y = g.world.height(m.x, m.z);
          m.target = null;
          g.spawnFx('puff', m.x, m.y, m.z, { size0: 1, size1: 2.2, life: 0.35, alpha: 0.7 });
          return;
        }
        if (t && m.atk <= 0 && Math.hypot(t.x - m.x, t.z - m.z) <= stop + 0.25) {
          m.atk = cd;
          m.hitT = 0;
          const kd = Math.hypot(t.x - m.x, t.z - m.z) || 1;
          g.spawnFx(`${w.def.sprite}_spark`, t.x, t.y + t.height * 0.55, t.z, { size0: 0.7, size1: 1.7, life: 0.26, rot: Math.random() * 3, spin: 5 });
          g.damageEnemy(t, st.damage, w, ((t.x - m.x) / kd) * st.knockback, ((t.z - m.z) / kd) * st.knockback);
        }
      });
      break;
    }
    case 'lob': {
      w.timer -= dt;
      if (w.timer <= 0 && !locked) {
        const n = st.count + s.projectiles;
        const near = g.nearestEnemies(p.x, p.z, st.range, n * 3);
        if (!near.length) w.timer = 0.2;
        else {
          w.timer = cd;
          for (let i = 0; i < n; i++) {
            // bersagli diversi tra i più vicini, così le pozze non si sovrappongono
            const t = near.length > n ? near.splice(Math.floor(Math.random() * near.length), 1)[0] : near[i % near.length];
            const x0 = p.x;
            const y0 = p.y + 1.6;
            const z0 = p.z;
            const tx = t.x + (i >= near.length ? (Math.random() - 0.5) * 4 : 0);
            const tz = t.z + (i >= near.length ? (Math.random() - 0.5) * 4 : 0);
            const T = 0.6 + Math.hypot(tx - x0, tz - z0) * 0.02;
            const ty = g.world.height(tx, tz);
            w.lobs.push({
              x: x0, y: y0, z: z0, vx: (tx - x0) / T, vz: (tz - z0) / T, vy: (ty - y0 + 0.5 * LOB_GRAVITY * T * T) / T,
              t: 0, max: T, rot: 0, spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 3),
            });
          }
          g.audio.play('shoot');
        }
      }
      const R = 2.6 * area;
      for (const l of w.lobs) {
        l.t += dt;
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.z += l.vz * dt;
        l.vy -= LOB_GRAVITY * dt;
        l.rot += l.spin * dt;
        const ground = g.world.height(l.x, l.z);
        if (l.t < l.max && !(l.vy < 0 && l.y <= ground)) continue;
        l.t = Infinity;
        const dur = st.duration * s.duration;
        w.pools.push({ x: l.x, y: ground, z: l.z, r: R, t: dur, max: dur, tick: 0 });
        g.spawnFx(`${w.def.sprite}_splash`, l.x, ground, l.z, { size0: 2.2 * area, size1: 2.6 * area, life: 0.45, anim: true });
        g.audio.play('splash');
      }
      if (w.lobs.some((l) => l.t === Infinity)) w.lobs = w.lobs.filter((l) => l.t !== Infinity);
      for (const pool of w.pools) {
        pool.t -= dt;
        pool.tick -= dt;
        if (pool.tick > 0) continue;
        pool.tick = 0.5;
        for (const e of g.enemiesNear(pool.x, pool.z, pool.r + 3, tmp)) {
          if (!e.alive || Math.hypot(e.x - pool.x, e.z - pool.z) > pool.r + e.radius * 0.5) continue;
          g.damageEnemy(e, st.damage, w, 0, 0);
        }
      }
      if (w.pools.some((x) => x.t <= 0)) w.pools = w.pools.filter((x) => x.t > 0);
      break;
    }
    case 'boomerang': {
      const v0 = st.speed * s.projSpeed;
      const R = st.range;
      w.timer -= dt;
      if (w.timer <= 0 && !locked) {
        const t = g.nearestEnemies(p.x, p.z, R * 1.2, 1)[0];
        if (!t) w.timer = 0.2;
        else {
          w.timer = cd;
          const n = st.count + s.projectiles;
          const a0 = Math.atan2(t.z - p.z, t.x - p.x);
          for (let i = 0; i < n; i++) {
            const a = a0 + (i - (n - 1) / 2) * 0.42;
            w.discs.push({ x: p.x, y: p.y + 1.2, z: p.z, vx: Math.cos(a), vz: Math.sin(a), sp: v0, back: false, t: 0, hits: new Map() });
          }
          g.audio.play('swish');
        }
      }
      // all'andata rallenta fino a fermarsi a distanza R, poi torna dal giocatore accelerando
      const decel = (v0 * v0) / (2 * R);
      const hitR = (w.def.scale ?? 1.9) * area * 0.42;
      for (const d of w.discs) {
        d.t += dt;
        if (!d.back) {
          d.sp -= decel * dt;
          if (d.sp <= 0) {
            d.back = true;
            d.sp = 0;
            d.hits.clear(); // al ritorno può colpire di nuovo gli stessi nemici
          }
        } else {
          const dx = p.x - d.x;
          const dz = p.z - d.z;
          const dd = Math.hypot(dx, dz) || 1;
          if (dd < 1.2 || d.t > 6) {
            d.t = Infinity; // ripreso al volo
            continue;
          }
          d.vx = dx / dd;
          d.vz = dz / dd;
          d.sp = Math.min(v0 * 1.3, d.sp + decel * 1.4 * dt);
        }
        d.x += d.vx * d.sp * dt;
        d.z += d.vz * d.sp * dt;
        d.y += (Math.max(p.y + 1.1, g.world.height(d.x, d.z) + 0.8) - d.y) * (1 - Math.exp(-10 * dt));
        for (const e of g.enemiesNear(d.x, d.z, hitR + 3, tmp)) {
          if (!e.alive || d.y < e.y - 0.6 || d.y > e.y + e.height + 0.6) continue;
          if ((e.x - d.x) ** 2 + (e.z - d.z) ** 2 > (hitR + e.radius) ** 2) continue;
          if ((d.hits.get(e.id) ?? 0) > g.runTime) continue;
          d.hits.set(e.id, g.runTime + 0.5);
          g.damageEnemy(e, st.damage, w, d.vx * st.knockback, d.vz * st.knockback);
        }
      }
      if (w.discs.some((d) => d.t === Infinity)) w.discs = w.discs.filter((d) => d.t !== Infinity);
      break;
    }
    case 'split': {
      w.timer -= dt;
      if (w.timer > 0) break;
      const n = st.count + s.projectiles;
      const targets = g.nearestEnemies(p.x, p.z, st.range, n);
      if (!targets.length) {
        w.timer = 0.15;
        break;
      }
      w.timer = cd;
      const sp = st.speed * s.projSpeed;
      const frames = g.anim(w.def.sprite);
      for (let i = 0; i < n; i++) {
        const t = targets[i % targets.length];
        const y0 = p.y + 1.2;
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        const dy = t.y + t.height * 0.5 - y0;
        const a = Math.atan2(dz, dx) + (i >= targets.length ? (i - targets.length + 1) * 0.2 : 0);
        const hd = Math.hypot(dx, dz) || 1;
        const pr = g.spawnProjectile(w, p.x, y0, p.z, Math.cos(a) * sp, (dy / hd) * sp, Math.sin(a) * sp, (w.def.scale ?? 1.6) * area, st.duration * s.duration, (i % 2 ? 1 : -1) * 4);
        pr.anim = frames;
        pr.split = Math.round(st.pierce);
        pr.pierce = 0;
      }
      g.audio.play('shoot');
      break;
    }
    case 'swarm': {
      const hive = HIVES[w.def.sprite];
      if (!hive) break;
      const N = hive.cells.length;
      if (w.cells.length !== N) w.cells = Array.from({ length: N }, () => 1);
      // l'alveare galleggia sopra il giocatore, dalla parte opposta al compagno
      const f = g.rig.forward;
      const r = g.rig.right;
      const H = w.hive;
      const hx = p.x - f.x * 0.6 + r.x * 1.5 * p.face;
      const hz = p.z - f.z * 0.6 + r.z * 1.5 * p.face;
      const hy = p.y + 3.1;
      if (!H.ready) {
        H.x = hx;
        H.y = hy;
        H.z = hz;
        H.ready = true;
      }
      const k = 1 - Math.exp(-5 * dt);
      H.x += (hx - H.x) * k;
      H.y += (hy - H.y) * k;
      H.z += (hz - H.z) * k;
      for (let i = 0; i < N; i++) if (w.cells[i] >= 0 && w.cells[i] < 1) w.cells[i] = Math.min(1, w.cells[i] + dt / Math.max(0.1, st.duration));
      w.timer -= dt;
      if (w.timer <= 0 && !locked) {
        const ready: number[] = [];
        for (let i = 0; i < N; i++) if (w.cells[i] === 1) ready.push(i);
        const n = Math.min(ready.length, st.count + s.projectiles);
        const targets = n ? g.nearestEnemies(p.x, p.z, st.range, n) : [];
        if (!targets.length) w.timer = 0.15;
        else {
          w.timer = cd;
          for (let j = 0; j < n; j++) {
            const ci = ready.splice(Math.floor(Math.random() * ready.length), 1)[0];
            const c = hive.cells[ci];
            const pos = cellPos(w, g, hive, ci);
            const out = Math.hypot(c.x, c.y) || 1;
            w.cells[ci] = -1;
            // si stacca verso l'esterno dell'alveare, poi curva verso il bersaglio
            w.bees.push({
              x: pos.x, y: pos.y, z: pos.z, vx: r.x * (c.x / out) * 6, vy: 2 - (c.y / out) * 5, vz: r.z * (c.x / out) * 6,
              target: targets[j % targets.length], cell: ci, t: 0, rot: Math.random() * 6,
            });
          }
          g.audio.play('shoot');
        }
      }
      const sp = st.speed * s.projSpeed;
      const R = 1.6 * area;
      for (const b of w.bees) {
        b.t += dt;
        b.rot += dt * 6;
        if (b.target && !b.target.alive) b.target = g.nearestEnemies(b.x, b.z, 12, 1)[0] ?? null;
        const t = b.target;
        const home = t ? null : cellPos(w, g, hive, b.cell);
        const tx = t ? t.x : home!.x;
        const ty = t ? t.y + t.height * 0.5 : home!.y;
        const tz = t ? t.z : home!.z;
        const dx = tx - b.x;
        const dy = ty - b.y;
        const dz = tz - b.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const speed = sp * Math.min(1.2, 0.35 + b.t * 1.6);
        const kk = 1 - Math.exp(-6 * dt);
        b.vx += ((dx / d) * speed - b.vx) * kk;
        b.vy += ((dy / d) * speed - b.vy) * kk;
        b.vz += ((dz / d) * speed - b.vz) * kk;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        if (t && d < t.radius + 0.5) {
          for (const e of g.enemiesNear(b.x, b.z, R + 3, tmp)) {
            const ex = e.x - b.x;
            const ez = e.z - b.z;
            const ed = Math.hypot(ex, ez) || 1;
            if (!e.alive || ed > R + e.radius) continue;
            g.damageEnemy(e, st.damage, w, (ex / ed) * st.knockback, (ez / ed) * st.knockback);
          }
          g.spawnFx(`${w.def.sprite}_burst`, b.x, b.y, b.z, { size0: R * 1.1, size1: R * 1.9, life: 0.3, anim: true });
          g.audio.play('pop');
          w.cells[b.cell] = 0; // ricresce
          b.t = Infinity;
        } else if (!t && d < 0.35) {
          w.cells[b.cell] = 1; // rientrato senza bersaglio
          b.t = Infinity;
        } else if (b.t > 5) {
          w.cells[b.cell] = 0;
          b.t = Infinity;
        }
      }
      if (w.bees.some((b) => b.t === Infinity)) w.bees = w.bees.filter((b) => b.t !== Infinity);
      break;
    }
  }
}

/** Fotogramma di un'animazione in loop a `fps` al tempo `t` (in secondi). */
function loop(frames: Frame[], t: number, fps: number) {
  return frames[Math.floor(Math.abs(t) * fps) % frames.length];
}

export function drawWeapon(w: WeaponInstance, g: Game) {
  const st = w.stats;
  const area = st.area * g.stats.area;
  // in aggiornamento orbite, aura e aiutanti sono spenti; dell'alveare restano solo le api già in volo
  if (w.locked > 0 && !IN_FLIGHT_KINDS.has(w.def.kind)) return;
  switch (w.def.kind) {
    case 'orbit': {
      const frames = g.anim(w.def.sprite);
      const h = 1.4 * area * (w.def.scale ?? 0.62);
      const n = w.points.length;
      w.points.forEach((pt, i) => {
        // sprite animati (es. scudi che ruotano): ognuno sfasato; quelli statici dondolano
        if (frames.length > 1) g.solid.push(loop(frames, g.runTime + (i / n) * (frames.length / 14), 14), pt.x, pt.y, pt.z, h);
        else g.solid.push(frames[0], pt.x, pt.y, pt.z, h, 1, 0, 1, Math.sin(g.runTime * 6 + pt.x) * 0.25);
      });
      break;
    }
    case 'minion': {
      const walk = g.anim(w.def.sprite);
      const idle = g.anim(`${w.def.sprite}_idle`);
      const hit = g.anim(`${w.def.sprite}_hit`);
      const h = (w.def.scale ?? 1.2) * Math.sqrt(area);
      for (const m of w.minions) {
        let f: Frame;
        if (m.hitT < hit.length * 0.09) f = hit[Math.floor(m.hitT / 0.09)];
        else if (m.moving) f = loop(walk, g.runTime + m.phase, 14);
        else f = idle[(g.runTime + m.phase) % 3.1 < 0.13 ? 1 : 0]; // ogni tanto sbatte le palpebre
        g.solid.push(f, m.x, m.y, m.z, h, m.face);
        g.shadows.push(m.x, m.y, m.z, h * 0.8);
      }
      break;
    }
    case 'lob': {
      const cup = g.anim(w.def.sprite);
      const steam = g.anim(`${w.def.sprite}_steam`);
      const size = (w.def.scale ?? 1.3) * Math.sqrt(area);
      for (const l of w.lobs) {
        g.solid.push(loop(cup, g.runTime + l.max, 12), l.x, l.y - size * 0.5, l.z, size, 1, 0, 1, l.rot);
        g.shadows.push(l.x, g.world.height(l.x, l.z), l.z, size * 0.6);
      }
      for (const pool of w.pools) {
        const age = pool.max - pool.t;
        const life = Math.min(1, age * 6) * Math.min(1, pool.t * 2.5); // compare e svanisce
        g.decals.push(pool.x, pool.y, pool.z, pool.r * 2 * (0.5 + 0.5 * life));
        const m = Math.min(9, Math.max(4, Math.round(pool.r * 2.2)));
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2 + pool.x;
          const rr = pool.r * (i % 2 ? 0.72 : 0.38);
          const x = pool.x + Math.cos(a) * rr;
          const z = pool.z + Math.sin(a) * rr;
          const sh = (1.4 + Math.sin(g.runTime * 3 + i) * 0.25) * Math.sqrt(area) * life;
          g.fx.push(loop(steam, g.runTime + i * 0.37, 10), x, g.world.height(x, z), z, sh, i % 2 ? 1 : -1, 0, 0.85 * life);
        }
      }
      break;
    }
    case 'boomerang': {
      const frames = g.anim(w.def.sprite);
      const size = (w.def.scale ?? 1.9) * area;
      w.discs.forEach((d, i) => {
        const f = loop(frames, g.runTime + i * 0.3, 30);
        const wob = Math.sin(d.t * 9 + i) * 0.08;
        // scia: copie sempre più trasparenti dietro al disco
        for (let k = 1; k <= 3; k++) {
          const back = d.sp * k * 0.022;
          g.fx.push(f, d.x - d.vx * back, d.y - size * 0.5, d.z - d.vz * back, size, 1, 0, 0.28 / k, wob);
        }
        g.solid.push(f, d.x, d.y - size * 0.5, d.z, size, 1, 0, 1, wob);
        g.shadows.push(d.x, g.world.height(d.x, d.z), d.z, size * 0.7);
      });
      break;
    }
    case 'swarm': {
      const hive = HIVES[w.def.sprite];
      if (!hive || !w.hive.ready) break;
      const h = hive.cellPx * (HIVE_WIDTH / hive.size);
      w.cells.forEach((v, i) => {
        if (v < 0 || w.locked > 0) return; // in volo, o alveare spento
        const sc = v >= 1 ? 1 : Math.max(0, easeOutBack(v));
        if (sc < 0.03) return;
        const pos = cellPos(w, g, hive, i);
        const bob = Math.sin(g.runTime * 2.6 + i * 1.3) * 0.06;
        g.solid.push(g.frame(`${w.def.sprite}_c${i}`), pos.x, pos.y + bob - (h * sc) / 2, pos.z, h * sc, 1, v < 1 ? (1 - v) * 0.7 : 0);
      });
      if (w.locked <= 0) g.shadows.push(w.hive.x, g.world.height(w.hive.x, w.hive.z), w.hive.z, 0.9);
      const fly = g.anim(`${w.def.sprite}_fly`);
      const size = 0.8;
      for (const b of w.bees) {
        const f = loop(fly, g.runTime + b.cell * 0.13, 16);
        for (let k = 1; k <= 2; k++) {
          const back = k * 0.035;
          g.fx.push(f, b.x - b.vx * back, b.y - size * 0.5 - b.vy * back, b.z - b.vz * back, size * (1 - k * 0.15), 1, 0, 0.32 / k, b.rot);
        }
        g.solid.push(f, b.x, b.y - size * 0.5, b.z, size, 1, 0, 1, b.rot);
      }
      break;
    }
    case 'aura': {
      const R = st.range * area;
      const f = g.frame('flame');
      const n = Math.min(48, Math.max(14, Math.round(R * 4.2)));
      const p = g.player;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + w.angle * 0.6;
        const x = p.x + Math.cos(a) * R;
        const z = p.z + Math.sin(a) * R;
        const h = 0.9 + Math.sin(g.runTime * 11 + i * 1.7) * 0.25;
        g.fx.push(f, x, g.world.height(x, z), z, h, 1, 0, 0.75);
      }
      break;
    }
    case 'strike': {
      const f = g.frame('target');
      for (const k of w.strikes) {
        const y = g.world.height(k.x, k.z);
        const t = 1 - k.t / k.max;
        g.fx.push(f, k.x, y + 0.1, k.z, 2.4 - t * 0.8, 1, 0, 0.5 + t * 0.5, t * 3);
      }
      break;
    }
    default:
      break;
  }
}
