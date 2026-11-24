export class InputManager {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.touchRoot = touchRoot;
    this.keys = new Set();
    this.touchMoveLeft = false;
    this.touchMoveRight = false;
    this.touchBlockHeld = false;

    this.onAction = null;
    this.hasReceivedInput = false;
    this.activePointers = new Map();

    this.bindKeyboard();
    this.bindMouse();
    this.bindTouchButtons();
  }

  notifyFirstInput() {
    if (!this.hasReceivedInput) {
      this.hasReceivedInput = true;
    }
    if (this.onAction) this.onAction('unlockAudio');
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      const relevant = [
        'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'KeyE', 'KeyC', 'KeyP',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight', 'Escape',
      ];
      if (relevant.includes(code)) {
        e.preventDefault();
      }
      this.notifyFirstInput();

      const alreadyHeld = this.keys.has(code);
      this.keys.add(code);
      if (alreadyHeld) return;

      if (code === 'KeyW' || code === 'Space' || code === 'ArrowUp') {
        const drop = this.keys.has('KeyS') || this.keys.has('ArrowDown');
        this.emit(drop ? 'drop' : 'jump');
      } else if (code === 'KeyJ') {
        this.emit('light');
      } else if (code === 'KeyK') {
        this.emit('heavy');
      } else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyC') {
        this.emit('dash');
      } else if (code === 'KeyI' || code === 'KeyE') {
        this.emit('special');
      } else if (code === 'Escape' || code === 'KeyP') {
        this.emit('pause');
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchMoveLeft = false;
      this.touchMoveRight = false;
      this.touchBlockHeld = false;
    });
  }

  bindMouse() {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      this.notifyFirstInput();
      if (e.button === 0) this.emit('light');
      else if (e.button === 2) this.emit('heavy');
    });
  }

  bindTouchButtons() {
    if (!this.touchRoot) return;
    const buttons = this.touchRoot.querySelectorAll('[data-action]');
    buttons.forEach((btn) => {
      const role = btn.getAttribute('data-action');

      const press = (e) => {
        e.preventDefault();
        this.notifyFirstInput();
        this.activePointers.set(e.pointerId, role);
        btn.classList.add('is-pressed');
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {}

        if (role === 'left') this.touchMoveLeft = true;
        else if (role === 'right') this.touchMoveRight = true;
        else if (role === 'block') this.touchBlockHeld = true;
        else this.emit(role);
      };

      const release = (e) => {
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.delete(e.pointerId);
        btn.classList.remove('is-pressed');

        if (role === 'left') this.touchMoveLeft = false;
        else if (role === 'right') this.touchMoveRight = false;
        else if (role === 'block') this.touchBlockHeld = false;
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
    });
  }

  emit(action) {
    if (this.onAction) this.onAction(action);
  }

  getMoveX() {
    let x = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touchMoveLeft) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touchMoveRight) x += 1;
    return x;
  }

  isBlockHeld() {
    return (
      this.keys.has('KeyL') ||
      this.keys.has('KeyS') ||
      this.keys.has('ArrowDown') ||
      this.touchBlockHeld
    );
  }
}
