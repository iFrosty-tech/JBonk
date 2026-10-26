import type { Frame } from '../render/atlas';
import type { EnemyDef } from '../config/types';

export interface Player {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  face: number;
  hp: number;
  invuln: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashZ: number;
  moving: boolean;
  anim: number;
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  frame: Frame;
  x: number;
  y: number;
  z: number;
  kx: number; // velocità di knockback
  kz: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  height: number;
  flash: number;
  face: number;
  phase: number;
  alive: boolean;
  elite: boolean;
  boss: boolean;
  // solo boss
  shotT: number;
  chargeT: number;
  telegraph: number;
  charging: number;
  cx: number;
  cz: number;
}

export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  pierce: number;
  radius: number;
  life: number;
  frame: Frame;
  size: number;
  rot: number;
  spin: number;
  hits: number[];
  weapon: string;
  knock: number;
  alive: boolean;
}

export type PickupKind = 'xp' | 'gold' | 'heal' | 'magnet';

export interface Pickup {
  kind: PickupKind;
  value: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  magnet: boolean;
  pull: number;
  alive: boolean;
  frame: Frame;
  size: number;
  t: number;
}

export type InteractKind = 'chest' | 'shrine' | 'altar' | 'portal';

export interface Interactable {
  kind: InteractKind;
  x: number;
  y: number;
  z: number;
  used: boolean;
  charge: number;
  free: boolean;
}

export interface Fx {
  frame: Frame;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size0: number;
  size1: number;
  life: number;
  max: number;
  rot: number;
  spin: number;
  gravity: number;
  alpha: number;
}

export interface DamageNumber {
  x: number;
  y: number;
  z: number;
  text: string;
  life: number;
  crit: boolean;
  color: string;
}

export interface Card {
  icon: string;
  name: string;
  tag: string;
  rarity: number;
  level: string;
  lines: string[];
  apply: () => void;
}

export interface ChoiceRequest {
  title: string;
  subtitle: string;
  cards: Card[];
  skipLabel: string | null;
  onSkip?: () => void;
}
