import type { MapData } from './types';
import mezzocammino from './mezzocammino.json?raw';

// Mappe reali, per id (BiomeDef.map). Il JSON arriva come testo e si legge una volta sola:
// così TypeScript non deve dedurre il tipo di 200 KB di coordinate.

const sources: Record<string, string> = { mezzocammino };
const cache = new Map<string, MapData>();

export function getMap(id: string): MapData {
  let m = cache.get(id);
  if (!m) {
    const src = sources[id];
    if (!src) throw new Error(`Mappa sconosciuta: ${id}`);
    m = JSON.parse(src) as MapData;
    cache.set(id, m);
  }
  return m;
}
