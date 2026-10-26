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
  frozen: number; // secondi rimasti "in lista d'attesa" (totem NGH)
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
  anim: Frame[] | null; // se presente, lo sprite gira in loop
  size: number;
  rot: number;
  spin: number;
  split: number; // al primo impatto si divide in tanti frammenti (arma 'split')
  hits: number[];
  weapon: string;
  knock: number;
  alive: boolean;
}

export type PickupKind = 'xp' | 'gold' | 'heal' | 'magnet' | 'card';

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
  anim: Frame[] | null; // se presente, lo sprite gira in loop
  size: number;
  t: number;
}

export type InteractKind = 'chest' | 'shrine' | 'altar' | 'portal' | 'clinic' | 'ngh' | 'joscar';

export interface Interactable {
  kind: InteractKind;
  x: number;
  y: number;
  z: number;
  used: boolean;
  charge: number; // macchinetta: secondi di attesa; presidio: HP già erogati
  free: boolean;
}

export interface Fx {
  frame: Frame;
  anim: Frame[] | null; // se presente, l'animazione dura quanto l'effetto
  fps: number; // se > 0, l'animazione gira in loop a questa velocità
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
