const MAX_SPARKS = 260;
const MAX_RINGS = 32;
const MAX_TEXTS = 36;

export class ParticlePool {
  constructor() {
    this.sparks = Array.from({ length: MAX_SPARKS }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.2,
      color: '#FFFFFF',
      size: 2,
      gravity: 900,
      kind: 'spark', // 'spark' | 'dust' | 'ink' | 'wisp'
    }));

    this.rings = Array.from({ length: MAX_RINGS }, () => ({
      active: false,
      x: 0,
      y: 0,
      radius: 60,
      color: '#FFFFFF',
      width: 4,
      life: 0,
      maxLife: 0.28,
    }));

    this.texts = Array.from({ length: MAX_TEXTS }, () => ({
      active: false,
      x: 0,
      y: 0,
      text: '',
      color: '#FFFFFF',
      size: 18,
      vy: -50,
      life: 0,
    }));
  }

  clear() {
    for (const s of this.sparks) s.active = false;
    for (const r of this.rings) r.active = false;
    for (const t of this.texts) t.active = false;
  }

  allocSpark() {
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (!this.sparks[i].active) return this.sparks[i];
    }
    return this.sparks[0];
  }

  spawnDirectionalSparks(x, y, dirX, count, color, speedScale = 1, kind = 'spark') {
    const baseAngle = dirX >= 0 ? 0 : Math.PI;
    for (let i = 0; i < count; i++) {
      const p = this.allocSpark();
      const spread = (Math.random() - 0.5) * 1.65;
      const ang = baseAngle + spread;
      const spd = (150 + Math.random() * 410) * speedScale;
      const life = 0.16 + Math.random() * 0.24;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd - 70;
      p.life = life;
      p.maxLife = life;
      p.color = color;
      p.size = kind === 'ink' ? 3 + Math.random() * 3.5 : 2 + Math.random() * 2.5;
      p.gravity = kind === 'wisp' ? -120 : 880;
      p.kind = kind;
    }
  }

  spawnRadialSparks(x, y, count, color, speedScale = 1) {
    for (let i = 0; i < count; i++) {
      const p = this.allocSpark();
      const ang = (i / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = (140 + Math.random() * 380) * speedScale;
      const life = 0.18 + Math.random() * 0.24;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd - 45;
      p.life = life;
      p.maxLife = life;
      p.color = color;
      p.size = 2.2 + Math.random() * 2.4;
      p.gravity = 760;
      p.kind = 'spark';
    }
  }

  spawnDust(x, y, count = 6, dirX = 0) {
    for (let i = 0; i < count; i++) {
      const p = this.allocSpark();
      const life = 0.22 + Math.random() * 0.18;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 24;
      p.y = y - 2;
      p.vx = (dirX * 95) + (Math.random() - 0.5) * 140;
      p.vy = -(28 + Math.random() * 65);
      p.life = life;
      p.maxLife = life;
      p.color = 'rgba(203, 213, 225, 0.72)';
      p.size = 4 + Math.random() * 5;
      p.gravity = 80;
      p.kind = 'dust';
    }
  }

  spawnRing(x, y, radius, color, width = 4, duration = 0.28) {
    let slot = this.rings[0];
    for (let i = 0; i < MAX_RINGS; i++) {
      if (!this.rings[i].active) {
        slot = this.rings[i];
        break;
      }
    }
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.radius = radius;
    slot.color = color;
    slot.width = width;
    slot.life = duration;
    slot.maxLife = duration;
  }

  spawnText(x, y, text, color = '#F8FAFC', size = 18) {
    let slot = this.texts[0];
    for (let i = 0; i < MAX_TEXTS; i++) {
      if (!this.texts[i].active) {
        slot = this.texts[i];
        break;
      }
    }
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.color = color;
    slot.size = size;
    slot.vy = -56;
    slot.life = 0.82;
  }

  update(dt) {
    for (let i = 0; i < MAX_SPARKS; i++) {
      const sp = this.sparks[i];
      if (!sp.active) continue;
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.active = false;
        continue;
      }
      sp.vy += sp.gravity * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
    }

    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) r.active = false;
    }

    for (let i = 0; i < MAX_TEXTS; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
    }
  }
}
