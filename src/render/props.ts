import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropType } from '../config/types';

// Arredi low-poly costruiti con primitive di three.js (zero modelli da importare).
// Ogni prop è un insieme di "parti" (geometria + colore) e di collider circolari.

export interface Part {
  geo: THREE.BufferGeometry;
  color: string;
  emissive?: string;
}
export interface PropModel {
  parts: Part[];
  colliders: { x: number; z: number; r: number }[];
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 8) {
  return new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
}
function ico(r: number, x: number, y: number, z: number) {
  return new THREE.IcosahedronGeometry(r, 0).translate(x, y, z);
}
function merge(...geos: THREE.BufferGeometry[]) {
  // le primitive hanno attributi diversi (index sì/no): normalizziamo
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  return mergeGeometries(flat)!;
}
function line(n: number, len: number, r: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: -len / 2 + (len / (n - 1)) * i, z: 0, r });
  return out;
}

export function buildProp(type: PropType, accent: string): PropModel {
  switch (type) {
    case 'desk':
      return {
        parts: [
          { geo: box(3.2, 0.18, 1.6, 0, 1.1, 0), color: '#e6d3b3' },
          {
            geo: merge(
              box(0.12, 1.1, 0.12, -1.45, 0.55, -0.7),
              box(0.12, 1.1, 0.12, 1.45, 0.55, -0.7),
              box(0.12, 1.1, 0.12, -1.45, 0.55, 0.7),
              box(0.12, 1.1, 0.12, 1.45, 0.55, 0.7),
              box(0.1, 0.4, 0.1, 0, 1.38, -0.45),
            ),
            color: '#4a5263',
          },
          { geo: box(1.3, 0.85, 0.1, 0, 1.95, -0.45), color: '#1d2333' },
          { geo: box(1.15, 0.7, 0.02, 0, 1.95, -0.39), color: '#6ab7ff', emissive: '#2a5a8a' },
          { geo: merge(box(0.8, 0.12, 0.8, 0, 0.7, 1.0), box(0.8, 0.9, 0.12, 0, 1.2, 1.4), cyl(0.06, 0.06, 0.6, 0, 0.35, 1.0, 5)), color: '#2b3142' },
        ],
        colliders: [
          { x: -1, z: 0, r: 0.9 },
          { x: 1, z: 0, r: 0.9 },
        ],
      };
    case 'plant':
      return {
        parts: [
          { geo: cyl(0.45, 0.35, 0.8, 0, 0.4, 0), color: '#c4553b' },
          { geo: merge(ico(0.9, 0, 1.6, 0), ico(0.6, 0.3, 2.3, 0.1), ico(0.5, -0.4, 2.0, -0.2)), color: '#3f9b4f' },
        ],
        colliders: [{ x: 0, z: 0, r: 0.7 }],
      };
    case 'cooler':
      return {
        parts: [
          { geo: box(0.7, 1.2, 0.7, 0, 0.6, 0), color: '#f4f6fb' },
          { geo: cyl(0.32, 0.32, 0.9, 0, 1.65, 0, 10), color: '#8fd3ff', emissive: '#1e4a66' },
        ],
        colliders: [{ x: 0, z: 0, r: 0.55 }],
      };
    case 'cubicle':
      return {
        parts: [
          { geo: box(4, 1.8, 0.25, 0, 0.9, 0), color: '#7d8aa3' },
          { geo: box(4.05, 0.1, 0.32, 0, 1.85, 0), color: '#4a5263' },
        ],
        colliders: line(4, 3.4, 0.55),
      };
    case 'printer':
      return {
        parts: [
          { geo: box(1.2, 1, 0.9, 0, 0.5, 0), color: '#d9dde5' },
          { geo: box(1.0, 0.15, 0.6, 0, 1.07, 0), color: '#3c4250' },
          { geo: box(0.6, 0.03, 0.42, 0, 1.17, 0.05), color: '#ffffff' },
        ],
        colliders: [{ x: 0, z: 0, r: 0.75 }],
      };
    case 'whiteboard':
      return {
        parts: [
          { geo: box(3, 1.6, 0.08, 0, 1.7, 0), color: '#ffffff' },
          { geo: merge(box(0.08, 2.5, 0.08, -1.45, 1.25, 0), box(0.08, 2.5, 0.08, 1.45, 1.25, 0), box(3, 0.08, 0.2, 0, 0.9, 0.08)), color: '#9aa5b8' },
          { geo: merge(box(1.2, 0.08, 0.02, -0.5, 2.1, 0.05), box(0.8, 0.08, 0.02, 0.6, 1.7, 0.05)), color: '#e8554e' },
          { geo: merge(box(1.0, 0.08, 0.02, -0.3, 1.4, 0.05), box(0.5, 0.5, 0.02, 0.9, 2.1, 0.05)), color: '#4c86ff' },
        ],
        colliders: line(3, 2.6, 0.45),
      };
    case 'sofa':
      return {
        parts: [
          { geo: merge(box(2.6, 0.6, 1.1, 0, 0.3, 0), box(2.6, 0.9, 0.3, 0, 0.9, -0.45), box(0.3, 0.9, 1.1, -1.3, 0.55, 0), box(0.3, 0.9, 1.1, 1.3, 0.55, 0)), color: accent },
        ],
        colliders: line(3, 2.2, 0.7),
      };
    case 'rack': {
      const leds = (y0: number) => {
        const g: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 7; i++) g.push(box(0.7, 0.05, 0.03, -0.1, y0 + i * 0.42, 0.62));
        return merge(...g);
      };
      return {
        parts: [
          { geo: box(1.4, 3.4, 1.2, 0, 1.7, 0), color: '#23272f' },
          { geo: box(1.3, 3.2, 0.02, 0, 1.7, 0.6), color: '#353b47' },
          { geo: leds(0.4), color: '#39e48a', emissive: '#39e48a' },
          { geo: leds(0.6), color: '#4cc3ff', emissive: '#2a7fb0' },
        ],
        colliders: [{ x: 0, z: 0, r: 0.95 }],
      };
    }
    case 'crac':
      return {
        parts: [
          { geo: box(2.2, 2.6, 1, 0, 1.3, 0), color: '#c5ccd8' },
          { geo: merge(box(1.8, 0.08, 0.04, 0, 1.0, 0.51), box(1.8, 0.08, 0.04, 0, 1.3, 0.51), box(1.8, 0.08, 0.04, 0, 1.6, 0.51)), color: '#3c4250' },
          { geo: box(0.5, 0.3, 0.04, -0.6, 2.2, 0.51), color: '#4cc3ff', emissive: '#2a7fb0' },
        ],
        colliders: line(2, 1.4, 0.8),
      };
    case 'cabletray':
      return {
        parts: [
          { geo: merge(box(0.15, 3.2, 0.15, -1.2, 1.6, 0), box(0.15, 3.2, 0.15, 1.2, 1.6, 0), box(2.8, 0.12, 0.7, 0, 3.2, 0)), color: '#59647a' },
          {
            geo: merge(
              new THREE.CylinderGeometry(0.08, 0.08, 2.8, 5).rotateZ(Math.PI / 2).translate(0, 3.35, -0.15),
              new THREE.CylinderGeometry(0.08, 0.08, 2.8, 5).rotateZ(Math.PI / 2).translate(0, 3.35, 0.15),
            ),
            color: '#ffb020',
          },
        ],
        colliders: [
          { x: -1.2, z: 0, r: 0.3 },
          { x: 1.2, z: 0, r: 0.3 },
        ],
      };
    case 'column':
      return {
        parts: [
          { geo: merge(box(1.6, 0.4, 1.6, 0, 0.2, 0), box(1.5, 0.4, 1.5, 0, 5.6, 0)), color: '#d8cdb8' },
          { geo: cyl(0.55, 0.62, 5, 0, 2.9, 0, 10), color: '#efe8da' },
        ],
        colliders: [{ x: 0, z: 0, r: 0.9 }],
      };
    case 'counter':
      return {
        parts: [
          { geo: box(4, 1.2, 1, 0, 0.6, 0), color: '#2c6e63' },
          { geo: box(4.2, 0.1, 1.2, 0, 1.25, 0), color: '#efe8da' },
          { geo: box(4, 0.8, 0.05, 0, 1.7, 0.3), color: '#bfe3ef' },
        ],
        colliders: line(4, 3.4, 0.7),
      };
    case 'tree':
      return {
        parts: [
          { geo: box(1.2, 0.8, 1.2, 0, 0.4, 0), color: '#b9a98c' },
          { geo: cyl(0.15, 0.22, 2.2, 0, 1.9, 0, 6), color: '#6b4a2b' },
          { geo: merge(ico(1.4, 0, 3.4, 0), ico(0.9, 0.7, 4.2, 0.3)), color: '#4f8f45' },
        ],
        colliders: [{ x: 0, z: 0, r: 0.9 }],
      };
    case 'bench':
      return {
        parts: [
          { geo: box(2.4, 0.15, 0.7, 0, 0.5, 0), color: '#8a5a3b' },
          { geo: merge(box(0.15, 0.45, 0.6, -1, 0.22, 0), box(0.15, 0.45, 0.6, 1, 0.22, 0)), color: '#3c4250' },
        ],
        colliders: line(2, 1.8, 0.55),
      };
  }
}
