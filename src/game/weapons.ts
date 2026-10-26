import type { WeaponDef, WeaponStats } from '../config/types';
import type { Frame } from '../render/atlas';
import type { Enemy } from './entities';
import type { Game } from './game';

// Comportamento delle armi. Ogni "kind" è un pattern riusabile: nuove armi a tema
// si aggiungono in config/weapons.ts senza toccare questo file.
// 'minion' usa gli sprite <sprite>, <sprite>_idle, <sprite>_hit e <sprite>_spark;
// 'lob' usa <sprite> (in volo), <sprite>_splash e <sprite>_steam (la pozza).

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

const LOB_GRAVITY = 30;

export class WeaponInstance {
  level = 1;
  stats: WeaponStats;
  timer = 0.4;
  angle = 0;
  damageDealt = 0;
  readonly hitTimes = new Map<number, number>();
  readonly strikes: { x: number; z: number; t: number; max: number }[] = [];
  readonly points: { x: number; y: number; z: number }[] = [];
  minions: Minion[] = [];
  lobs: Lob[] = [];
  pools: Pool[] = [];

  constructor(readonly def: WeaponDef) {
    this.stats = { ...def.base };
  }

  /** Nuovo progetto: via gli effetti a terra, gli aiutanti ripartono dal giocatore. */
  resetStage(x: number, y: number, z: number) {
    this.strikes.length = 0;
    this.lobs = [];
    this.pools = [];
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
      if (w.timer <= 0) {
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
      if (w.timer <= 0) {
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
  }
}

/** Fotogramma di un'animazione in loop a `fps` al tempo `t` (in secondi). */
function loop(frames: Frame[], t: number, fps: number) {
  return frames[Math.floor(Math.abs(t) * fps) % frames.length];
}

export function drawWeapon(w: WeaponInstance, g: Game) {
  const st = w.stats;
  const area = st.area * g.stats.area;
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
