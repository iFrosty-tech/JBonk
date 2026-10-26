import type { WeaponDef, WeaponStats } from '../config/types';
import type { Enemy } from './entities';
import type { Game } from './game';

// Comportamento delle armi. Ogni "kind" è un pattern riusabile: nuove armi a tema
// si aggiungono in config/weapons.ts senza toccare questo file.

export class WeaponInstance {
  level = 1;
  stats: WeaponStats;
  timer = 0.4;
  angle = 0;
  damageDealt = 0;
  readonly hitTimes = new Map<number, number>();
  readonly strikes: { x: number; z: number; t: number; max: number }[] = [];
  readonly points: { x: number; y: number; z: number }[] = [];

  constructor(readonly def: WeaponDef) {
    this.stats = { ...def.base };
  }
}

const tmp: Enemy[] = [];

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
  }
}

export function drawWeapon(w: WeaponInstance, g: Game) {
  const st = w.stats;
  const area = st.area * g.stats.area;
  switch (w.def.kind) {
    case 'orbit': {
      const f = g.frame(w.def.sprite);
      for (const pt of w.points) g.solid.push(f, pt.x, pt.y, pt.z, 1.4 * area * 0.62, 1, 0, 1, Math.sin(g.runTime * 6 + pt.x) * 0.25);
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
