import * as THREE from 'three';
import type { Atlas, Frame } from './atlas';

// Tutti gli sprite 2D del mondo (nemici, giocatore, proiettili, raccoglibili) vengono
// disegnati in UNA draw call: un quad istanziato per sprite, sempre rivolto verso la camera
// ma "in piedi" (ruota solo attorno all'asse verticale), come una sagoma di cartone.

const vertex = /* glsl */ `
  uniform vec3 camRight;
  attribute vec3 iPos;
  attribute vec2 iSize;
  attribute vec4 iUv;
  attribute vec4 iParams; // flip, flash (negativo = tinta "in attesa"), alpha, rotazione
  varying vec2 vUv;
  varying float vFlash;
  varying float vAlpha;
  varying float vFogDepth;
  void main() {
    vec2 p = position.xy - vec2(0.0, 0.5);
    float r = iParams.w;
    p = vec2(p.x * cos(r) - p.y * sin(r), p.x * sin(r) + p.y * cos(r));
    p += vec2(0.0, 0.5);
    vec3 world = iPos + camRight * (p.x * iSize.x) + vec3(0.0, 1.0, 0.0) * (p.y * iSize.y);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    vec2 luv = uv;
    if (iParams.x < 0.0) luv.x = 1.0 - luv.x;
    vUv = mix(iUv.xy, iUv.zw, luv);
    vFlash = iParams.y;
    vAlpha = iParams.z;
    vFogDepth = -mv.z;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float alphaCut;
  varying vec2 vUv;
  varying float vFlash;
  varying float vAlpha;
  varying float vFogDepth;
  void main() {
    vec4 t = texture2D(map, vUv);
    if (t.a < alphaCut) discard;
    vec3 col = mix(t.rgb, vec3(1.0, 0.95, 0.9), max(vFlash, 0.0));
    // flash negativo: desaturato e verde acqua, come i nemici messi in lista d'attesa dal totem NGH
    float grey = dot(t.rgb, vec3(0.3, 0.59, 0.11));
    col = mix(col, grey * vec3(0.6, 0.92, 0.98) + vec3(0.02, 0.1, 0.12), max(-vFlash, 0.0));
    float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, t.a * vAlpha);
    #include <colorspace_fragment>
  }
`;

export class BillboardBatch {
  readonly mesh: THREE.Mesh;
  count = 0;
  private readonly cap: number;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aSize: THREE.InstancedBufferAttribute;
  private readonly aUv: THREE.InstancedBufferAttribute;
  private readonly aParams: THREE.InstancedBufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(atlas: Atlas, cap: number, mode: 'solid' | 'fx') {
    this.cap = cap;
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0); // ancorato ai piedi
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    const mk = (size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk(3);
    this.aSize = mk(2);
    this.aUv = mk(4);
    this.aParams = mk(4);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iSize', this.aSize);
    this.geo.setAttribute('iUv', this.aUv);
    this.geo.setAttribute('iParams', this.aParams);
    this.geo.instanceCount = 0;

    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        map: { value: atlas.texture },
        camRight: { value: new THREE.Vector3(1, 0, 0) },
        fogColor: { value: new THREE.Color() },
        fogDensity: { value: 0 },
        alphaCut: { value: mode === 'solid' ? 0.5 : 0.02 },
      },
      transparent: mode === 'fx',
      depthWrite: mode === 'solid',
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = mode === 'fx' ? 10 : 0;
  }

  begin() {
    this.count = 0;
  }

  /** Aggiunge uno sprite ancorato in basso al centro in (x, y, z). */
  push(f: Frame, x: number, y: number, z: number, h: number, flip = 1, flash = 0, alpha = 1, rot = 0, wScale = 1) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    const p = this.aPos.array as Float32Array;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    const s = this.aSize.array as Float32Array;
    s[i * 2] = h * f.aspect * wScale;
    s[i * 2 + 1] = h;
    const u = this.aUv.array as Float32Array;
    u[i * 4] = f.u0;
    u[i * 4 + 1] = f.v0;
    u[i * 4 + 2] = f.u1;
    u[i * 4 + 3] = f.v1;
    const q = this.aParams.array as Float32Array;
    q[i * 4] = flip;
    q[i * 4 + 1] = flash;
    q[i * 4 + 2] = alpha;
    q[i * 4 + 3] = rot;
  }

  end(camRight: THREE.Vector3, fog: THREE.FogExp2) {
    const n = this.count;
    for (const [a, size] of [
      [this.aPos, 3],
      [this.aSize, 2],
      [this.aUv, 4],
      [this.aParams, 4],
    ] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, n) * size);
      a.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    const u = this.material.uniforms;
    (u.camRight.value as THREE.Vector3).copy(camRight);
    (u.fogColor.value as THREE.Color).copy(fog.color);
    u.fogDensity.value = fog.density;
  }
}

/** Ombre a disco sotto gli sprite: rendono leggibile la profondità in 2.5D. Con un altro colore fanno da macchie a terra. */
export class ShadowBatch {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly cap: number;

  constructor(cap: number, color = 0x0b0e18, opacity = 0.32) {
    this.cap = cap;
    const geo = new THREE.CircleGeometry(0.5, 20);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  begin() {
    this.n = 0;
  }

  push(x: number, y: number, z: number, diameter: number) {
    if (this.n >= this.cap) return;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const o = this.n++ * 16;
    m[o] = diameter;
    m[o + 1] = 0;
    m[o + 2] = 0;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = 1;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = 0;
    m[o + 9] = 0;
    m[o + 10] = diameter;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y + 0.06;
    m[o + 14] = z;
    m[o + 15] = 1;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, this.n) * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
