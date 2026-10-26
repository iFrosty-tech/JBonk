import * as THREE from 'three';
import type { Input } from './input';
import type { GameWorld } from '../render/world';

// Camera in terza persona che orbita attorno al giocatore (mouse) e segue il terreno.

export class CameraRig {
  yaw = 0;
  pitch = 0.36;
  dist = 12;
  shake = 0;
  sensitivity = 1;
  readonly target = new THREE.Vector3();
  readonly right = new THREE.Vector3(1, 0, 0);
  readonly forward = new THREE.Vector3(0, 0, -1);
  private first = true;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap() {
    this.first = true;
  }

  update(dt: number, input: Input | null, px: number, py: number, pz: number, world: GameWorld) {
    if (input) {
      this.yaw -= input.mouseDX * 0.0032 * this.sensitivity;
      this.pitch = Math.min(1.15, Math.max(0.12, this.pitch + input.mouseDY * 0.0025 * this.sensitivity));
      this.dist = Math.min(26, Math.max(8, this.dist + input.wheel * 1.2));
    }
    const k = this.first ? 1 : 1 - Math.exp(-12 * dt);
    this.first = false;
    this.target.x += (px - this.target.x) * k;
    this.target.y += (py + 1.6 - this.target.y) * k;
    this.target.z += (pz - this.target.z) * k;

    const cp = Math.cos(this.pitch);
    const cam = this.camera.position;
    cam.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    const lim = world.half - 1.5;
    cam.x = Math.min(lim, Math.max(-lim, cam.x));
    cam.z = Math.min(lim, Math.max(-lim, cam.z));
    const floor = world.height(cam.x, cam.z) + 1.2;
    if (cam.y < floor) cam.y = floor;
    if (this.shake > 0.001) {
      cam.x += (Math.random() - 0.5) * this.shake;
      cam.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-10 * dt);
    }
    this.camera.lookAt(this.target);
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
