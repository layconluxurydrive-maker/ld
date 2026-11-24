import { ARENA_LEFT, ARENA_RIGHT, GRAVITY, GROUND_Y } from './constants.js';

export class ScarfChain {
  constructor(x, y, count = 6, segLen = 9) {
    this.segLen = segLen;
    this.nodes = Array.from({ length: count }, (_, i) => ({
      x: x - i * segLen,
      y: y + i * 2,
      ox: x - i * segLen,
      oy: y + i * 2,
    }));
  }

  update(anchorX, anchorY, facing, windX, dt) {
    const first = this.nodes[0];
    first.x = anchorX;
    first.y = anchorY;
    first.ox = anchorX;
    first.oy = anchorY;

    const damping = 0.9;
    const stepGravity = 340 * dt * dt;
    const stepWind = (windX - facing * 85) * dt * dt;

    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const vx = (n.x - n.ox) * damping;
      const vy = (n.y - n.oy) * damping;
      n.ox = n.x;
      n.oy = n.y;
      n.x += vx + stepWind;
      n.y += vy + stepGravity;
    }

    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < this.nodes.length - 1; i++) {
        const a = this.nodes[i];
        const b = this.nodes[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - this.segLen) / dist;
        if (i === 0) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
      for (let i = 1; i < this.nodes.length; i++) {
        if (this.nodes[i].y > GROUND_Y - 2) {
          this.nodes[i].y = GROUND_Y - 2;
        }
      }
    }
  }
}

export class VerletRagdoll {
  constructor(joints, impulseX, impulseY, style) {
    this.style = style;
    this.life = 2.4;
    this.maxLife = 2.4;

    const names = [
      'head', 'neck', 'hip',
      'elbowL', 'handL', 'elbowR', 'handR',
      'kneeL', 'footL', 'kneeR', 'footR',
    ];

    this.points = {};
    for (const name of names) {
      const p = joints[name];
      const jitterX = (Math.random() - 0.5) * 80;
      const jitterY = (Math.random() - 0.5) * 60;
      const vx = (impulseX + jitterX) * 0.016;
      const vy = (impulseY + jitterY) * 0.016;
      this.points[name] = {
        x: p.x,
        y: p.y,
        ox: p.x - vx,
        oy: p.y - vy,
      };
    }

    const dist = (a, b) => Math.max(8, Math.hypot(joints[a].x - joints[b].x, joints[a].y - joints[b].y));
    this.links = [
      ['head', 'neck', dist('head', 'neck')],
      ['neck', 'hip', dist('neck', 'hip')],
      ['neck', 'elbowL', dist('neck', 'elbowL')],
      ['elbowL', 'handL', dist('elbowL', 'handL')],
      ['neck', 'elbowR', dist('neck', 'elbowR')],
      ['elbowR', 'handR', dist('elbowR', 'handR')],
      ['hip', 'kneeL', dist('hip', 'kneeL')],
      ['kneeL', 'footL', dist('kneeL', 'footL')],
      ['hip', 'kneeR', dist('hip', 'kneeR')],
      ['kneeR', 'footR', dist('kneeR', 'footR')],
      // Structural spine & limb stiffness constraints
      ['head', 'hip', dist('head', 'hip') * 0.94, 0.35],
    ];
  }

  update(dt) {
    this.life -= dt;
    const g = GRAVITY * 0.85 * dt * dt;
    const airDrag = 0.992;

    for (const key in this.points) {
      const p = this.points[key];
      const vx = (p.x - p.ox) * airDrag;
      const vy = (p.y - p.oy) * airDrag;
      p.ox = p.x;
      p.oy = p.y;
      p.x += vx;
      p.y += vy + g;
    }

    for (let iter = 0; iter < 6; iter++) {
      for (const link of this.links) {
        const a = this.points[link[0]];
        const b = this.points[link[1]];
        const target = link[2];
        const stiffness = link[3] ?? 1.0;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = ((d - target) / d) * 0.5 * stiffness;
        a.x += dx * diff;
        a.y += dy * diff;
        b.x -= dx * diff;
        b.y -= dy * diff;
      }

      for (const key in this.points) {
        const p = this.points[key];
        const floorMargin = key === 'head' ? 11 : 4;
        if (p.y > GROUND_Y - floorMargin) {
          const vx = (p.x - p.ox) * 0.72;
          const vy = (p.y - p.oy) * 0.25;
          p.y = GROUND_Y - floorMargin;
          p.oy = p.y + vy;
          p.ox = p.x - vx;
        }
        if (p.x < ARENA_LEFT) {
          p.x = ARENA_LEFT;
        } else if (p.x > ARENA_RIGHT) {
          p.x = ARENA_RIGHT;
        }
      }
    }
  }
}
