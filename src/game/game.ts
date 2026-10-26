import * as THREE from 'three';
import { BIOMES } from '../config/biomes';
import { BASE_STATS } from '../config/characters';
import { ENEMIES } from '../config/enemies';
import { PASSIVES } from '../config/passives';
import { TUNING, xpForLevel } from '../config/tuning';
import { WEAPONS } from '../config/weapons';
import type { BiomeDef, CharacterDef, EnemyDef, StatKey, Stats } from '../config/types';
import type { Atlas, Frame } from '../render/atlas';
import { BillboardBatch, ShadowBatch } from '../render/billboards';
import { World } from '../render/world';
import type { Audio } from './audio';
import { CameraRig } from './camera';
import { shrineCards, upgradeCards } from './cards';
import type { ChoiceRequest, DamageNumber, Enemy, Fx, Interactable, Pickup, PickupKind, Player, Projectile } from './entities';
import type { Input } from './input';
import { SpatialHash } from './spatial';
import { WeaponInstance, drawWeapon, updateWeapon } from './weapons';

export type Mode = 'play' | 'paused' | 'choice' | 'over';

export interface RunResult {
  victory: boolean;
  time: number;
  kills: number;
  level: number;
  gold: number;
  stages: number;
  biome: BiomeDef;
  character: CharacterDef;
  damage: { name: string; icon: string; value: number }[];
}

export interface GameHooks {
  choice(req: ChoiceRequest): void;
  over(result: RunResult): void;
  banner(text: string, tone: 'info' | 'warn' | 'boss' | 'good'): void;
  stage(biome: BiomeDef, stage: number): void;
}

interface FxOpts {
  size0?: number;
  size1?: number;
  life?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  rot?: number;
  spin?: number;
  gravity?: number;
  alpha?: number;
  anim?: boolean; // riproduce tutti i fotogrammi dello sprite nella durata dell'effetto
}

const tmpPt = { x: 0, z: 0 };

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly solid: BillboardBatch;
  readonly fx: BillboardBatch;
  readonly shadows: ShadowBatch;
  readonly decals: ShadowBatch; // macchie a terra (pozze di caffè)
  world!: World;
  biome!: BiomeDef;

  mode: Mode = 'play';
  stage = 0;
  biomeIdx: number;
  stageTime = 0;
  runTime = 0;
  stats: Stats = { ...BASE_STATS };
  readonly player: Player;
  readonly companion = { x: 0, y: 0, z: 0 };
  weapons: WeaponInstance[] = [];
  passives: { id: string; level: number; value: number }[] = [];
  private buffs: Partial<Record<StatKey, number>> = {};

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  hostile: Projectile[] = [];
  pickups: Pickup[] = [];
  fxs: Fx[] = [];
  interactables: Interactable[] = [];
  numbers: DamageNumber[] = [];

  kills = 0;
  gold = 0;
  level = 1;
  xp = 0;
  xpNext = xpForLevel(1);
  boss: Enemy | null = null;
  bossSpawned = false;
  chestsOpened = 0;
  prompt: string | null = null;
  hurtFlash = 0;
  god = false;

  private hash: SpatialHash;
  private nearIdx: number[] = [];
  private nextId = 1;
  private spawnAcc = 0;
  private eliteT = 0;
  private swarmsDone = new Set<number>();
  private choiceQueue: (() => ChoiceRequest)[] = [];
  private hitFxBudget = 0;
  private readonly frames = new Map<string, Frame>();
  private readonly anims = new Map<string, Frame[]>();
  private stagesCleared = 0;

  constructor(
    readonly atlas: Atlas,
    readonly character: CharacterDef,
    startBiome: number,
    readonly input: Input,
    readonly audio: Audio,
    private readonly hooks: GameHooks,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 400);
    this.rig = new CameraRig(this.camera);
    this.solid = new BillboardBatch(atlas, 6000, 'solid');
    this.fx = new BillboardBatch(atlas, 3000, 'fx');
    this.shadows = new ShadowBatch(3000);
    this.decals = new ShadowBatch(128, 0x6b3e1f, 0.55);
    this.scene.add(this.solid.mesh, this.fx.mesh, this.shadows.mesh, this.decals.mesh);
    this.hash = new SpatialHash(TUNING.arenaHalf, 4, 1024);
    this.biomeIdx = startBiome;
    this.player = {
      x: 0, y: 0, z: 0, vy: 0, grounded: true, face: 1, hp: 100, invuln: 0,
      dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, moving: false, anim: 0,
    };
    this.recomputeStats();
    this.player.hp = this.stats.maxHp;
    this.addWeapon(character.startWeapon);
    this.loadStage();
  }

  // ---------------------------------------------------------------- setup

  private loadStage() {
    if (this.world) this.world.dispose(this.scene);
    this.biome = BIOMES[this.biomeIdx % BIOMES.length];
    const seed = (Math.random() * 1e9) | 0;
    const spotCount = 1 + TUNING.shrineCount + TUNING.clinicCount + TUNING.chestCount;
    this.world = new World(this.scene, this.biome, TUNING.arenaHalf, seed, spotCount);
    this.scene.add(this.world.group);
    this.enemies = [];
    this.projectiles = [];
    this.hostile = [];
    this.pickups = [];
    this.fxs = [];
    this.numbers = [];
    this.interactables = [];
    this.boss = null;
    this.bossSpawned = false;
    this.stageTime = 0;
    this.spawnAcc = 0;
    this.eliteT = 0;
    this.swarmsDone.clear();

    // la sala riunioni è il punto più lontano dal centro, poi macchinette e presidi GPI
    const spots = [...this.world.spots].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
    spots.forEach((s, i) => {
      const kind = i === 0 ? 'altar' : i <= TUNING.shrineCount ? 'shrine' : i <= TUNING.shrineCount + TUNING.clinicCount ? 'clinic' : 'chest';
      this.interactables.push({ kind, x: s.x, z: s.z, y: this.world.height(s.x, s.z), used: false, charge: 0, free: false });
    });

    const p = this.player;
    p.x = 0;
    p.z = 0;
    p.y = this.world.height(0, 0);
    p.vy = 0;
    for (const w of this.weapons) w.resetStage(p.x, p.y, p.z);
    this.companion.x = -1.5;
    this.companion.z = 1;
    this.companion.y = p.y + 1;
    this.rig.snap();
    this.hooks.stage(this.biome, this.stage);
  }

  frame(id: string): Frame {
    let f = this.frames.get(id);
    if (!f) {
      f = this.atlas.get(id);
      this.frames.set(id, f);
    }
    return f;
  }

  /** Tutti i fotogrammi di uno sprite animato. */
  anim(id: string): Frame[] {
    let a = this.anims.get(id);
    if (!a) {
      a = this.atlas.anim(id);
      this.anims.set(id, a);
    }
    return a;
  }

  // ---------------------------------------------------------------- statistiche e progressione

  recomputeStats() {
    const s: Stats = { ...BASE_STATS };
    const add = (k: StatKey, v: number) => {
      s[k] += v;
    };
    for (const [k, v] of Object.entries(this.character.bonus)) add(k as StatKey, v as number);
    for (const p of this.passives) add(PASSIVES[p.id].stat, p.value);
    for (const [k, v] of Object.entries(this.buffs)) add(k as StatKey, v as number);
    const prevMax = this.stats.maxHp;
    this.stats = s;
    if (s.maxHp > prevMax && this.player) this.player.hp += s.maxHp - prevMax;
    if (this.player) this.player.hp = Math.min(this.player.hp, s.maxHp);
  }

  addWeapon(id: string) {
    if (this.weapons.some((w) => w.def.id === id)) return;
    this.weapons.push(new WeaponInstance(WEAPONS[id]));
  }

  addPassive(id: string, amount: number) {
    const p = this.passives.find((x) => x.id === id);
    if (p) {
      p.level++;
      p.value += amount;
    } else this.passives.push({ id, level: 1, value: amount });
    this.recomputeStats();
  }

  addBuff(stat: StatKey, amount: number) {
    this.buffs[stat] = (this.buffs[stat] ?? 0) + amount;
    this.recomputeStats();
  }

  heal(v: number) {
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + v);
  }

  private queueChoice(make: () => ChoiceRequest) {
    this.choiceQueue.push(make);
  }

  /** Chiamato dall'interfaccia quando il giocatore sceglie una carta (o salta). */
  resolveChoice() {
    this.mode = 'play';
  }

  // ---------------------------------------------------------------- query sui nemici

  enemiesNear(x: number, z: number, r: number, out: Enemy[]): Enemy[] {
    this.hash.query(x, z, r, this.nearIdx);
    out.length = 0;
    for (const i of this.nearIdx) {
      const e = this.enemies[i];
      if (e && e.alive) out.push(e);
    }
    return out;
  }

  nearestEnemies(x: number, z: number, range: number, n: number): Enemy[] {
    const best: Enemy[] = [];
    const dist: number[] = [];
    const r2 = range * range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d > r2) continue;
      if (best.length < n || d < dist[best.length - 1]) {
        let i = best.length < n ? best.length : n - 1;
        while (i > 0 && dist[i - 1] > d) {
          if (i < n) {
            best[i] = best[i - 1];
            dist[i] = dist[i - 1];
          }
          i--;
        }
        best[i] = e;
        dist[i] = d;
        if (best.length > n) best.length = n;
      }
    }
    return best;
  }

  nearestExcluding(x: number, z: number, range: number, exclude: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    for (const e of this.enemiesNear(x, z, range, [])) {
      if (exclude.has(e.id)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  randomEnemies(x: number, z: number, range: number, n: number): Enemy[] {
    const inRange = this.enemies.filter((e) => e.alive && (e.x - x) ** 2 + (e.z - z) ** 2 < range * range);
    const out: Enemy[] = [];
    while (out.length < n && inRange.length) out.push(inRange.splice(Math.floor(Math.random() * inRange.length), 1)[0]);
    return out;
  }

  // ---------------------------------------------------------------- creazione entità

  spawnProjectile(w: WeaponInstance, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, spin: number) {
    this.projectiles.push({
      x, y, z, vx, vy, vz, size, life, spin,
      damage: w.stats.damage,
      pierce: w.stats.pierce,
      radius: size * 0.4,
      frame: this.frame(w.def.sprite),
      rot: 0,
      hits: [],
      weapon: w.def.id,
      knock: w.stats.knockback,
      alive: true,
    });
  }

  spawnFx(id: string, x: number, y: number, z: number, o: FxOpts = {}) {
    if (this.fxs.length > 900) return;
    const life = o.life ?? 0.4;
    this.fxs.push({
      frame: this.frame(id), anim: o.anim ? this.anim(id) : null, x, y, z,
      vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
      size0: o.size0 ?? 1, size1: o.size1 ?? o.size0 ?? 1,
      life, max: life, rot: o.rot ?? 0, spin: o.spin ?? 0, gravity: o.gravity ?? 0, alpha: o.alpha ?? 1,
    });
  }

  sparkLine(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const n = Math.max(3, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = (Math.random() - 0.5) * 0.6;
      this.spawnFx('spark', x0 + (x1 - x0) * t + j, y0 + (y1 - y0) * t - 0.3 + j, z0 + (z1 - z0) * t, { size0: 0.9, size1: 0.2, life: 0.18, rot: Math.random() * 3 });
    }
  }

  spawnPickup(kind: PickupKind, value: number, x: number, z: number) {
    if (kind === 'xp' && this.pickups.length > 380) {
      // troppe gemme: accorpa in una esistente
      const g = this.pickups.find((p) => p.kind === 'xp' && !p.magnet);
      if (g) {
        g.value += value;
        g.frame = this.frame(g.value >= 10 ? 'xp3' : g.value >= 3 ? 'xp2' : 'xp1');
        return;
      }
    }
    const id = kind === 'xp' ? (value >= 10 ? 'xp3' : value >= 3 ? 'xp2' : 'xp1') : kind === 'gold' ? 'gold' : kind === 'heal' ? 'pizza' : kind === 'card' ? 'soldo' : 'magnet';
    const size = kind === 'xp' ? (value >= 10 ? 1.0 : 0.75) : kind === 'gold' ? 0.9 : kind === 'card' ? 1.7 : 1.2;
    this.pickups.push({
      kind, value, x: x + (Math.random() - 0.5) * 0.8, z: z + (Math.random() - 0.5) * 0.8,
      y: this.world.height(x, z) + 1, vy: 5, magnet: false, pull: 0, alive: true,
      frame: this.frame(id), anim: kind === 'card' ? this.anim(id) : null, size, t: Math.random() * 6,
    });
  }

  spawnEnemy(def: EnemyDef, x?: number, z?: number): Enemy {
    const p = this.player;
    if (x === undefined || z === undefined) {
      const a = Math.random() * Math.PI * 2;
      const [d0, d1] = TUNING.spawnDistance;
      const d = d0 + Math.random() * (d1 - d0);
      x = p.x + Math.cos(a) * d;
      z = p.z + Math.sin(a) * d;
    }
    tmpPt.x = x;
    tmpPt.z = z;
    this.world.resolve(tmpPt, def.radius);
    const minutes = this.stageTime / 60;
    const stageMul = 1 + this.stage * 1.3;
    const kind = def.kind ?? 'normal';
    const hpMul = kind === 'boss' ? stageMul : kind === 'elite' ? (1 + minutes * 0.2) * stageMul : (1 + minutes * 0.25) * stageMul;
    const dmgMul = (1 + minutes * 0.09) * (1 + this.stage * 0.45);
    const e: Enemy = {
      id: this.nextId++, def, frame: this.frame(def.sprite),
      x: tmpPt.x, z: tmpPt.z, y: this.world.height(tmpPt.x, tmpPt.z) + (def.hover ?? 0),
      kx: 0, kz: 0, hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      speed: def.speed * (0.9 + Math.random() * 0.2), damage: def.damage * dmgMul,
      radius: def.radius, height: def.height, flash: 0, face: 1, phase: Math.random() * 10, alive: true,
      elite: kind === 'elite', boss: kind === 'boss',
      shotT: def.boss ? def.boss.shotEvery : 0, chargeT: def.boss ? def.boss.chargeEvery : 0,
      telegraph: 0, charging: 0, cx: 0, cz: 0,
    };
    this.enemies.push(e);
    return e;
  }

  spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const def = ENEMIES[this.biome.boss];
    const p = this.player;
    const a = Math.atan2(-this.rig.forward.z, -this.rig.forward.x) + Math.PI;
    this.boss = this.spawnEnemy(def, p.x + Math.cos(a) * 24, p.z + Math.sin(a) * 24);
    this.hooks.banner(`${def.name} — ${def.boss?.quote ?? ''}`, 'boss');
    this.audio.play('boss');
    this.rig.shake = 0.6;
  }

  // ---------------------------------------------------------------- danni

  damageEnemy(e: Enemy, base: number, w: WeaponInstance | null, kx: number, kz: number) {
    if (!e.alive) return;
    const s = this.stats;
    let dmg = base * s.damage;
    const crit = Math.random() < s.critChance;
    if (crit) dmg *= s.critDamage;
    dmg = Math.max(1, Math.round(dmg * (0.92 + Math.random() * 0.16)));
    e.hp -= dmg;
    e.flash = 1;
    const mass = e.boss ? 0.08 : e.elite ? 0.25 : 1;
    e.kx += kx * 6 * mass;
    e.kz += kz * 6 * mass;
    if (w) w.damageDealt += dmg;
    this.addNumber(e.x, e.y + e.height, e.z, String(dmg), crit, crit ? '#ffd23f' : '#ffffff');
    if (this.hitFxBudget > 0) {
      this.hitFxBudget--;
      this.spawnFx('spark', e.x, e.y + e.height * 0.5, e.z, { size0: 0.8, size1: 0.1, life: 0.12, rot: Math.random() * 3 });
    }
    this.audio.play('hit');
    if (e.hp <= 0) this.killEnemy(e);
  }

  private addNumber(x: number, y: number, z: number, text: string, crit: boolean, color: string) {
    if (this.numbers.length > 70) this.numbers.shift();
    this.numbers.push({ x: x + (Math.random() - 0.5) * 0.6, y, z, text, life: 0.75, crit, color });
  }

  private killEnemy(e: Enemy) {
    e.alive = false;
    this.kills++;
    const xp = e.def.xp * (1 + this.stage * 0.3);
    this.spawnPickup('xp', xp, e.x, e.z);
    if (Math.random() < e.def.gold) this.spawnPickup('gold', e.boss ? 40 : e.elite ? 15 : 1 + Math.floor(Math.random() * 2), e.x, e.z);
    if (!e.boss && !e.elite) {
      const r = Math.random();
      if (r < 0.004) this.spawnPickup('heal', 1, e.x, e.z);
      else if (r < 0.006) this.spawnPickup('magnet', 1, e.x, e.z);
      else if (r < 0.0075) this.spawnPickup('card', 10, e.x, e.z);
    }
    this.spawnFx('puff', e.x, e.y, e.z, { size0: e.height * 0.8, size1: e.height * 1.4, life: 0.3, alpha: 0.8 });
    if (e.elite) {
      // il guardiano lascia un forziere gratuito
      this.interactables.push({ kind: 'chest', x: e.x, z: e.z, y: this.world.height(e.x, e.z), used: false, charge: 0, free: true });
      this.spawnPickup('heal', 1, e.x + 1.5, e.z);
      this.spawnPickup('card', 15, e.x - 1.5, e.z);
      this.hooks.banner(`${e.def.name} sconfitto: ordine d'acquisto gratuito!`, 'good');
    }
    if (e.boss) {
      this.boss = null;
      this.rig.shake = 1;
      this.audio.play('boom');
      for (let i = 0; i < 12; i++) this.spawnFx('boom', e.x + (Math.random() - 0.5) * 6, e.y + Math.random() * 6, e.z + (Math.random() - 0.5) * 6, { size0: 2, size1: 5, life: 0.6 + Math.random() * 0.4 });
      tmpPt.x = e.x;
      tmpPt.z = e.z;
      this.world.resolve(tmpPt, 2);
      this.interactables.push({ kind: 'portal', x: tmpPt.x, z: tmpPt.z, y: this.world.height(tmpPt.x, tmpPt.z), used: false, charge: 0, free: true });
      for (let i = 0; i < 4; i++) this.spawnPickup('gold', 10, e.x, e.z);
      for (let i = 0; i < 2; i++) this.spawnPickup('card', 20, e.x + (i ? 2 : -2), e.z);
      const last = this.stagesCleared + 1 >= TUNING.stagesToWin;
      this.hooks.banner(last ? 'Progetto consegnato! Prendi l\'ascensore per chiudere.' : 'Boss sconfitto! L\'ascensore porta al prossimo progetto.', 'good');
    }
  }

  private hurtPlayer(raw: number) {
    const p = this.player;
    if (p.invuln > 0 || p.dashT > 0 || this.god) return;
    const dmg = Math.max(1, Math.round(raw - this.stats.armor));
    p.hp -= dmg;
    p.invuln = TUNING.hurtInvuln;
    this.hurtFlash = 1;
    this.rig.shake = Math.max(this.rig.shake, 0.3);
    this.audio.play('hurt');
    if (p.hp <= 0) this.endRun(false);
  }

  private endRun(victory: boolean) {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.input.releaseLock();
    this.hooks.over({
      victory,
      time: this.runTime,
      kills: this.kills,
      level: this.level,
      gold: this.gold,
      stages: this.stagesCleared,
      biome: this.biome,
      character: this.character,
      damage: this.weapons
        .map((w) => ({ name: w.def.name, icon: w.def.icon, value: Math.round(w.damageDealt) }))
        .sort((a, b) => b.value - a.value),
    });
  }

  // ---------------------------------------------------------------- loop

  update(dt: number) {
    if (this.mode === 'over') {
      this.rig.update(dt, null, this.player.x, this.player.y, this.player.z, this.world);
      return;
    }
    if (this.mode !== 'play') {
      this.rig.update(dt, null, this.player.x, this.player.y, this.player.z, this.world);
      return;
    }
    this.runTime += dt;
    this.stageTime += dt;
    this.hitFxBudget = 6;
    const input = this.input;
    this.rig.update(dt, input, this.player.x, this.player.y, this.player.z, this.world);

    this.updatePlayer(dt);
    this.updateDirector(dt);

    // griglia spaziale dei nemici
    this.hash.clear(this.enemies.length);
    for (let i = 0; i < this.enemies.length; i++) this.hash.insert(i, this.enemies[i].x, this.enemies[i].z);

    for (const w of this.weapons) updateWeapon(w, this, dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.updateHostile(dt);
    this.updatePickups(dt);
    this.updateInteractables(dt);
    this.updateFx(dt);

    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.regen * dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);

    // pulizia
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);
    if (this.hostile.some((p) => !p.alive)) this.hostile = this.hostile.filter((p) => p.alive);
    if (this.pickups.some((p) => !p.alive)) this.pickups = this.pickups.filter((p) => p.alive);

    // livelli
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      const lvl = this.level;
      this.queueChoice(() => ({
        title: `Promozione! Livello ${lvl}`,
        subtitle: 'Scegli un ticket da prendere in carico',
        cards: upgradeCards(this),
        skipLabel: 'Rimanda (+5 €)',
        onSkip: () => {
          this.gold += 5;
        },
      }));
      this.audio.play('level');
    }
    if (this.mode === 'play' && this.choiceQueue.length) {
      const req = this.choiceQueue.shift()!();
      if (this.choiceQueue.length) req.subtitle += ` · altre ${this.choiceQueue.length} in coda`;
      this.mode = 'choice';
      this.input.releaseLock();
      this.hooks.choice(req);
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const input = this.input;
    let mx = 0;
    let mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    const f = this.rig.forward;
    const r = this.rig.right;
    let dx = f.x * mz + r.x * mx;
    let dz = f.z * mz + r.z * mx;
    const len = Math.hypot(dx, dz);
    p.moving = len > 0.01;
    if (p.moving) {
      dx /= len;
      dz /= len;
      const side = dx * r.x + dz * r.z;
      if (Math.abs(side) > 0.1) p.face = side > 0 ? 1 : -1;
    }
    p.dashCd -= dt;
    if ((input.hit('ShiftLeft') || input.hit('ShiftRight')) && p.dashCd <= 0) {
      p.dashT = TUNING.dashTime;
      p.dashCd = TUNING.dashCooldown;
      p.dashX = p.moving ? dx : f.x;
      p.dashZ = p.moving ? dz : f.z;
      this.spawnFx('puff', p.x, p.y, p.z, { size0: 1, size1: 2, life: 0.3, alpha: 0.6 });
    }
    let speed = TUNING.playerSpeed * this.stats.moveSpeed;
    if (p.dashT > 0) {
      p.dashT -= dt;
      dx = p.dashX;
      dz = p.dashZ;
      speed = TUNING.dashSpeed;
    } else if (!p.moving) speed = 0;
    tmpPt.x = p.x + dx * speed * dt;
    tmpPt.z = p.z + dz * speed * dt;
    this.world.resolve(tmpPt, TUNING.playerRadius);
    p.x = tmpPt.x;
    p.z = tmpPt.z;

    const ground = this.world.height(p.x, p.z);
    if (input.hit('Space') && p.grounded) {
      p.vy = TUNING.jumpVelocity;
      p.grounded = false;
    }
    p.vy -= TUNING.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= ground) {
      // sulle salite il giocatore "sale" i gradini senza saltare
      p.y = ground;
      p.vy = 0;
      p.grounded = true;
    } else if (p.grounded && p.y - ground < 0.6 && p.vy <= 0) {
      p.y = ground; // aderisce in discesa
      p.vy = 0;
    } else p.grounded = false;
    p.invuln -= dt;
    p.anim += dt * (p.moving ? 1 : 0.3);

    // il compagno segue alle spalle del giocatore
    const c = this.companion;
    const tx = p.x - f.x * 1.2 - r.x * 1.6 * p.face;
    const tz = p.z - f.z * 1.2 - r.z * 1.6 * p.face;
    const k = 1 - Math.exp(-6 * dt);
    c.x += (tx - c.x) * k;
    c.z += (tz - c.z) * k;
    c.y += (Math.max(p.y, this.world.height(c.x, c.z)) + 1.3 + Math.sin(this.runTime * 3) * 0.2 - c.y) * k;
  }

  private updateDirector(dt: number) {
    const t = this.stageTime;
    const overtime = t > TUNING.stageSeconds;
    if (overtime && !this.bossSpawned) {
      this.hooks.banner('Sono le 18:00: la call col boss non si può più rimandare!', 'warn');
      this.spawnBoss();
    }
    // élite periodici
    this.eliteT += dt;
    if (this.eliteT >= TUNING.eliteEvery) {
      this.eliteT = 0;
      const def = ENEMIES[this.biome.elite];
      this.spawnEnemy(def);
      this.hooks.banner(`Guardiano in arrivo: ${def.name}`, 'warn');
    }
    // sciami
    for (const at of TUNING.swarmAt) {
      if (t >= at && !this.swarmsDone.has(at)) {
        this.swarmsDone.add(at);
        const def = ENEMIES[this.biome.swarm];
        const n = 26 + this.stage * 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawnEnemy(def, this.player.x + Math.cos(a) * 24, this.player.z + Math.sin(a) * 24);
        }
        this.hooks.banner(this.biome.swarmName, 'warn');
      }
    }
    // flusso continuo, pesato per tipo di nemico
    let rate = (TUNING.baseSpawnRate + t * TUNING.spawnRateGrowth) * (1 + this.stage * 0.25);
    if (overtime) rate *= 1.8;
    if (this.boss) rate *= 0.5;
    this.spawnAcc += rate * dt;
    const max = TUNING.maxEnemies + this.stage * 60;
    const pool = this.biome.enemies.filter((e) => e.from <= t);
    const tot = pool.reduce((a, e) => a + e.weight, 0);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= max || !pool.length) continue;
      let r = Math.random() * tot;
      let id = pool[0].id;
      for (const e of pool) {
        r -= e.weight;
        if (r <= 0) {
          id = e.id;
          break;
        }
      }
      this.spawnEnemy(ENEMIES[id]);
    }
  }

  private updateProjectiles(dt: number) {
    const near: Enemy[] = [];
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.life <= 0) {
        pr.alive = false;
        continue;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;
      pr.rot += pr.spin * dt;
      if (pr.y < this.world.height(pr.x, pr.z) - 0.5) {
        pr.alive = false;
        continue;
      }
      for (const e of this.enemiesNear(pr.x, pr.z, pr.radius + 3, near)) {
        if (pr.y < e.y - 0.4 || pr.y > e.y + e.height + 0.4) continue;
        const dx = e.x - pr.x;
        const dz = e.z - pr.z;
        if (dx * dx + dz * dz > (pr.radius + e.radius) ** 2) continue;
        if (pr.hits.includes(e.id)) continue;
        pr.hits.push(e.id);
        const sp = Math.hypot(pr.vx, pr.vz) || 1;
        const w = this.weapons.find((x) => x.def.id === pr.weapon) ?? null;
        this.damageEnemy(e, pr.damage, w, (pr.vx / sp) * pr.knock, (pr.vz / sp) * pr.knock);
        if (pr.pierce-- <= 0) {
          pr.alive = false;
          break;
        }
      }
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    const near: Enemy[] = [];
    const r = this.rig.right;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      let vx = (dx / d) * e.speed;
      let vz = (dz / d) * e.speed;

      if (e.boss && e.def.boss) {
        const b = e.def.boss;
        e.shotT -= dt;
        if (e.shotT <= 0) {
          e.shotT = b.shotEvery;
          const off = Math.random() * Math.PI;
          for (let i = 0; i < b.shots; i++) {
            const a = off + (i / b.shots) * Math.PI * 2;
            this.hostile.push({
              x: e.x, y: e.y + 1.6, z: e.z, vx: Math.cos(a) * b.shotSpeed, vy: 0, vz: Math.sin(a) * b.shotSpeed,
              damage: e.damage * 0.6, pierce: 0, radius: 0.6, life: 4, frame: this.frame(b.projectile), size: 1.3,
              rot: 0, spin: 4, hits: [], weapon: '', knock: 0, alive: true,
            });
          }
        }
        e.chargeT -= dt;
        if (e.chargeT <= 0 && e.telegraph <= 0 && e.charging <= 0) {
          e.telegraph = 0.8;
          e.chargeT = b.chargeEvery;
        }
        if (e.telegraph > 0) {
          e.telegraph -= dt;
          e.flash = Math.sin(e.telegraph * 30) > 0 ? 0.8 : 0;
          vx = 0;
          vz = 0;
          if (e.telegraph <= 0) {
            e.charging = 0.75;
            e.cx = dx / d;
            e.cz = dz / d;
          }
        } else if (e.charging > 0) {
          e.charging -= dt;
          vx = e.cx * e.speed * 4.5;
          vz = e.cz * e.speed * 4.5;
        }
      }

      // separazione dai vicini: l'orda si allarga invece di sovrapporsi
      if (!e.boss) {
        for (const o of this.enemiesNear(e.x, e.z, e.radius * 2 + 1, near)) {
          if (o === e) continue;
          const ox = e.x - o.x;
          const oz = e.z - o.z;
          const min = e.radius + o.radius;
          const d2 = ox * ox + oz * oz;
          if (d2 < min * min && d2 > 1e-6) {
            const dd = Math.sqrt(d2);
            const push = (min - dd) * 0.5;
            e.x += (ox / dd) * push;
            e.z += (oz / dd) * push;
          }
        }
      }

      e.x += (vx + e.kx) * dt;
      e.z += (vz + e.kz) * dt;
      const damp = Math.exp(-7 * dt);
      e.kx *= damp;
      e.kz *= damp;
      tmpPt.x = e.x;
      tmpPt.z = e.z;
      this.world.resolve(tmpPt, e.radius);
      e.x = tmpPt.x;
      e.z = tmpPt.z;
      e.y = this.world.height(e.x, e.z) + (e.def.hover ?? 0);
      const side = vx * r.x + vz * r.z;
      if (Math.abs(side) > 0.3) e.face = side > 0 ? 1 : -1;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.phase += dt * e.speed * 1.6;

      // contatto col giocatore (saltando si evitano i nemici bassi)
      const reach = e.radius + TUNING.playerRadius;
      if (d < reach && p.y < e.y + e.height * 0.75 && p.y + 1.6 > e.y) this.hurtPlayer(e.damage);
    }
  }

  private updateHostile(dt: number) {
    const p = this.player;
    for (const h of this.hostile) {
      h.life -= dt;
      h.x += h.vx * dt;
      h.z += h.vz * dt;
      h.rot += h.spin * dt;
      h.y = Math.max(h.y, this.world.height(h.x, h.z) + 0.8);
      if (h.life <= 0) {
        h.alive = false;
        continue;
      }
      const dx = h.x - p.x;
      const dz = h.z - p.z;
      if (dx * dx + dz * dz < (h.radius + TUNING.playerRadius) ** 2 && Math.abs(h.y - (p.y + 0.9)) < 1.4) {
        this.hurtPlayer(h.damage);
        h.alive = false;
      }
    }
  }

  private updatePickups(dt: number) {
    const p = this.player;
    const range = TUNING.pickupRadius * this.stats.pickupRange;
    for (const k of this.pickups) {
      k.t += dt;
      const ground = this.world.height(k.x, k.z) + 0.3;
      const dx = p.x - k.x;
      const dz = p.z - k.z;
      const dy = p.y + 0.8 - k.y;
      const d = Math.hypot(dx, dz, dy);
      if (!k.magnet && d < range) k.magnet = true;
      if (k.magnet) {
        k.pull += dt * 40;
        const sp = Math.min(40, 10 + k.pull);
        k.x += (dx / (d || 1)) * sp * dt;
        k.z += (dz / (d || 1)) * sp * dt;
        k.y += (dy / (d || 1)) * sp * dt;
      } else {
        k.vy -= 20 * dt;
        k.y += k.vy * dt;
        if (k.y < ground) {
          k.y = ground;
          k.vy = 0;
        }
      }
      if (d < 1.1) {
        k.alive = false;
        this.collect(k);
      }
    }
  }

  private collect(k: Pickup) {
    switch (k.kind) {
      case 'xp':
        this.xp += k.value * this.stats.xpGain;
        this.audio.play('pickup');
        break;
      case 'gold':
        this.gold += Math.round(k.value * this.stats.goldGain);
        this.audio.play('coin');
        break;
      case 'heal':
        this.heal(this.stats.maxHp * 0.3);
        this.addNumber(this.player.x, this.player.y + 2.2, this.player.z, '+HP', false, '#5dfd8a');
        this.audio.play('coin');
        break;
      case 'card': {
        const v = Math.round(k.value * this.stats.goldGain);
        this.gold += v;
        this.addNumber(this.player.x, this.player.y + 2.4, this.player.z, `+${v} €`, true, '#ffd23f');
        this.hooks.banner(`Carta Soldo: spesa approvata, +${v} € di budget!`, 'good');
        this.audio.play('coin');
        break;
      }
      case 'magnet':
        for (const o of this.pickups) if (o.kind === 'xp') o.magnet = true;
        this.hooks.banner('Wi-Fi aziendale: tutta l\'esperienza arriva a te!', 'good');
        this.audio.play('coin');
        break;
    }
  }

  chestCost() {
    return Math.round(TUNING.chestBaseCost * (1 + this.chestsOpened * 0.5));
  }

  private updateInteractables(dt: number) {
    const p = this.player;
    this.prompt = null;
    let best: Interactable | null = null;
    let bd = 3.6;
    for (const it of this.interactables) {
      if (it.used) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (it.kind === 'shrine') {
        if (d < 3.4) {
          it.charge += dt;
          this.prompt = `Macchinetta del caffè: resta qui… ${Math.min(100, Math.round((it.charge / TUNING.shrineChargeTime) * 100))}%`;
          if (it.charge >= TUNING.shrineChargeTime) {
            it.used = true;
            this.audio.play('open');
            this.queueChoice(() => ({ title: 'Pausa caffè', subtitle: 'Scegli una bevanda: il bonus è permanente', cards: shrineCards(this), skipLabel: null }));
          }
        } else it.charge = Math.max(0, it.charge - dt);
        continue;
      }
      if (it.kind === 'clinic') {
        if (d < TUNING.clinicRadius) this.useClinic(it, dt);
        continue;
      }
      if (it.kind === 'portal' && d < 1.8) {
        this.usePortal(it);
        return;
      }
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (!best) return;
    const cost = best.free ? 0 : this.chestCost();
    if (best.kind === 'chest') this.prompt = cost ? `[E] Apri ordine d'acquisto — ${cost} €` : '[E] Apri ordine d\'acquisto — gratis';
    else if (best.kind === 'altar') this.prompt = this.bossSpawned ? 'Sala riunioni occupata' : `[E] Convoca la riunione: arriva ${ENEMIES[this.biome.boss].name}`;
    else if (best.kind === 'portal') this.prompt = '[E] Prendi l\'ascensore';
    if (!this.input.hit('KeyE')) return;
    if (best.kind === 'chest') {
      if (this.gold < cost) {
        this.hooks.banner(`Budget insufficiente: servono ${cost} €`, 'warn');
        return;
      }
      this.gold -= cost;
      if (!best.free) this.chestsOpened++;
      best.used = true;
      this.audio.play('open');
      this.queueChoice(() => ({ title: 'Ordine approvato!', subtitle: 'Il budget è arrivato: scegli cosa comprare', cards: upgradeCards(this, 1), skipLabel: null }));
    } else if (best.kind === 'altar' && !this.bossSpawned) {
      best.used = true;
      this.spawnBoss();
    } else if (best.kind === 'portal') this.usePortal(best);
  }

  /** Presidio GPI: cura finché resti vicino, fino a esaurire la scorta. */
  private useClinic(it: Interactable, dt: number) {
    const p = this.player;
    const stock = TUNING.clinicStock;
    const left = () => Math.round(100 * (1 - it.charge / stock));
    const missing = this.stats.maxHp - p.hp;
    if (missing < 0.5) {
      this.prompt = `Presidio GPI · The Healthcare Partner — sei in forma (scorta ${left()}%)`;
      return;
    }
    const v = Math.min(TUNING.clinicRate * dt, missing, stock - it.charge);
    this.heal(v);
    it.charge += v;
    this.prompt = `Presidio GPI — cure in corso… scorta ${left()}%`;
    if (Math.random() < dt * 6) {
      this.spawnFx('heal_plus', p.x + (Math.random() - 0.5) * 1.6, p.y + 0.8 + Math.random(), p.z + (Math.random() - 0.5) * 1.6, { size0: 0.6, size1: 0.3, life: 0.8, vy: 2.4 });
    }
    if (it.charge >= stock - 0.01) {
      it.used = true;
      this.hooks.banner('Presidio GPI esaurito: il prossimo è in un altro progetto', 'info');
      this.audio.play('open');
    }
  }

  private usePortal(it: Interactable) {
    it.used = true;
    this.stagesCleared++;
    if (this.stagesCleared >= TUNING.stagesToWin) {
      this.endRun(true);
      return;
    }
    this.stage++;
    this.biomeIdx++;
    this.loadStage();
  }

  private updateFx(dt: number) {
    for (const f of this.fxs) {
      f.life -= dt;
      f.vy -= f.gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      f.rot += f.spin * dt;
    }
    if (this.fxs.some((f) => f.life <= 0)) this.fxs = this.fxs.filter((f) => f.life > 0);
    for (const n of this.numbers) {
      n.life -= dt;
      n.y += dt * 1.6;
    }
    if (this.numbers.length && this.numbers[0].life <= 0) this.numbers = this.numbers.filter((n) => n.life > 0);
  }

  // ---------------------------------------------------------------- disegno

  draw(renderer: THREE.WebGLRenderer) {
    const { solid, fx, shadows } = this;
    solid.begin();
    fx.begin();
    shadows.begin();
    this.decals.begin();
    const p = this.player;
    const t = this.runTime;

    // giocatore: rimbalzo mentre cammina, lampeggia quando è invulnerabile
    const bob = p.moving && p.grounded ? Math.abs(Math.sin(p.anim * 12)) * 0.15 : 0;
    const blink = p.invuln > 0 && Math.sin(t * 50) > 0;
    if (!blink) solid.push(this.frame(this.character.sprite), p.x, p.y + bob, p.z, 2.2 - bob * 0.5, p.face, p.dashT > 0 ? 0.6 : 0, 1, p.moving ? Math.sin(p.anim * 12) * 0.06 : 0);
    shadows.push(p.x, this.world.height(p.x, p.z), p.z, 1.3);
    const c = this.companion;
    solid.push(this.frame(this.character.companion), c.x, c.y, c.z, 1.1, p.face);
    shadows.push(c.x, this.world.height(c.x, c.z), c.z, 0.7);

    for (const e of this.enemies) {
      const squash = 1 + Math.sin(e.phase) * 0.06;
      solid.push(e.frame, e.x, e.y, e.z, e.height * squash, e.face, e.flash, 1, Math.sin(e.phase * 0.5) * 0.08, 1 / squash);
      shadows.push(e.x, e.y - (e.def.hover ?? 0), e.z, e.radius * 2.2);
    }
    for (const pr of this.projectiles) solid.push(pr.frame, pr.x, pr.y - pr.size * 0.5, pr.z, pr.size, 1, 0, 1, pr.rot);
    for (const h of this.hostile) solid.push(h.frame, h.x, h.y - h.size * 0.5, h.z, h.size, 1, 0, 1, h.rot);
    for (const k of this.pickups) {
      const hover = k.magnet ? 0 : 0.25 + Math.sin(k.t * 4) * 0.15;
      const f = k.anim ? k.anim[Math.floor(k.t * 11) % k.anim.length] : k.frame;
      solid.push(f, k.x, k.y + hover, k.z, k.size, 1, 0, 1, k.kind === 'xp' ? Math.sin(k.t * 3) * 0.3 : 0);
      if (k.kind === 'card') shadows.push(k.x, this.world.height(k.x, k.z), k.z, 0.8);
    }
    for (const it of this.interactables) {
      let f: Frame;
      if (it.kind === 'clinic') {
        const a = this.anim('gpi');
        f = it.used ? this.frame('gpi_off') : a[Math.floor(t * 9 + Math.abs(it.x)) % a.length];
      } else f = this.frame(it.kind === 'chest' ? (it.used ? 'chest_open' : 'chest') : it.kind === 'shrine' ? (it.used ? 'shrine_off' : 'shrine') : it.kind);
      const h = it.kind === 'chest' ? 2.2 : it.kind === 'portal' ? 6 : it.kind === 'clinic' ? 5.4 : 5;
      let glow = 0;
      if (!it.used && it.kind === 'chest' && it.free) glow = 0.25 + Math.sin(t * 6) * 0.25;
      else if (!it.used && it.kind === 'shrine' && it.charge > 0) glow = 0.15 + Math.sin(t * 20) * 0.12;
      else if (!it.used && it.kind === 'clinic' && p.hp < this.stats.maxHp && Math.hypot(it.x - p.x, it.z - p.z) < TUNING.clinicRadius) glow = 0.12 + Math.sin(t * 9) * 0.1;
      solid.push(f, it.x, it.y, it.z, h, 1, glow);
      shadows.push(it.x, it.y, it.z, it.kind === 'portal' ? 6 : 2.6);
    }
    for (const w of this.weapons) drawWeapon(w, this);
    for (const f of this.fxs) {
      const k = 1 - f.life / f.max;
      const size = f.size0 + (f.size1 - f.size0) * k;
      const frame = f.anim ? f.anim[Math.min(f.anim.length - 1, Math.floor(k * f.anim.length))] : f.frame;
      fx.push(frame, f.x, f.y - size * 0.5, f.z, size, 1, 0, f.alpha * Math.min(1, (f.life / f.max) * 2), f.rot);
    }

    const fog = this.scene.fog as THREE.FogExp2;
    solid.end(this.rig.right, fog);
    fx.end(this.rig.right, fog);
    shadows.end();
    this.decals.end();
    renderer.render(this.scene, this.camera);
  }

  /** Orario di gioco: la giornata va dalle 9:00 alle 18:00, poi straordinario. */
  clock(): { text: string; overtime: boolean } {
    const span = TUNING.dayEndMinutes - TUNING.dayStartMinutes;
    const m = TUNING.dayStartMinutes + (this.stageTime / TUNING.stageSeconds) * span;
    const hh = Math.floor(m / 60) % 24;
    const mm = Math.floor(m % 60);
    return { text: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, overtime: this.stageTime > TUNING.stageSeconds };
  }

  dispose() {
    this.world.dispose(this.scene);
    for (const m of [this.solid.mesh, this.fx.mesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.shadows.mesh.dispose();
    this.decals.mesh.dispose();
  }
}
