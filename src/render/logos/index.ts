import type { SpriteDef } from '../draw';
import { ANGULAR_SPRITES } from './angular';
import { CLAUDE_SPRITES } from './claude';
import { GPI_SPRITES } from './gpi';
import { JAVA_SPRITES } from './java';
import { JPANIK_HIVE, JPANIK_SPRITES, type HiveLayout } from './jpanik';
import { JOSCAR_SPRITES } from './joscar';
import { MONGO_SPRITES } from './mongo';
import { NGH_SPRITES } from './ngh';
import { SOLDO_SPRITES } from './soldo';
import { SPRING_SPRITES } from './spring';

// Sprite animati ricavati dai loghi di tecnologie, clienti e premi aziendali: un file per logo.
// - Claude, Angular, GPI, gli esagoni di JPanik e il radar di NGH sono ridisegnati in vettoriale.
// - Java, Soldo, Spring, MongoDB, la scritta NGH e il JOscar partono dalle immagini in src/assets
//   (caricate da images.ts), a volte scomposte in parti che si muovono ognuna per conto suo.
// `frames` è la lunghezza del ciclo: il gioco sceglie il fotogramma in base al tempo.

export { loadLogoImages } from './images';
export type { HiveLayout };

export const LOGO_SPRITES: SpriteDef[] = [
  ...CLAUDE_SPRITES,
  ...ANGULAR_SPRITES,
  ...JAVA_SPRITES,
  ...GPI_SPRITES,
  ...SOLDO_SPRITES,
  ...SPRING_SPRITES,
  ...MONGO_SPRITES,
  ...JPANIK_SPRITES,
  ...NGH_SPRITES,
  ...JOSCAR_SPRITES,
];

/** Alveari per l'arma 'swarm', per id dello sprite. */
export const HIVES: Record<string, HiveLayout> = { jpanik: JPANIK_HIVE };
