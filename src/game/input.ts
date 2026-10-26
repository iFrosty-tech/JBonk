// Tastiera + mouse. La camera si gira col mouse (pointer lock se disponibile,
// altrimenti trascinando) oppure con Q/E.

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  private dragging = false;
  locked = false;
  onLockLost: (() => void) | null = null;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('wheel', this.onWheel, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  down(code: string) {
    return this.keys.has(code);
  }

  /** Vero solo nel frame in cui il tasto è stato premuto. */
  hit(code: string) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  requestLock() {
    if (this.locked || !this.el.requestPointerLock) return;
    try {
      const r = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // pointer lock non disponibile (iframe, mobile): si usa il trascinamento
    }
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
  };
  private onMouseDown = (e: MouseEvent) => {
    this.dragging = true;
    if (e.button === 0) this.pressed.add('Mouse0');
  };
  private onMouseUp = () => {
    this.dragging = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.locked || this.dragging) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };
  private onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };
  private onLockChange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.el;
    if (was && !this.locked) this.onLockLost?.();
  };
}
