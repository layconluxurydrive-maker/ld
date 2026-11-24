import { GROUND_Y, STATES } from './constants.js';
import { Fighter } from './fighter.js';
import { WEAPON_MAP } from './weapons.js';

export class StorePreviewStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.fighter = null;
    this.swingTimer = 0.8;
    this.sparks = [];
    this.rafId = null;
    this.lastTime = performance.now();
  }

  setLoadout(weaponId, weaponTier, cosmetic) {
    const w = WEAPON_MAP[weaponId] || WEAPON_MAP.fists;
    if (!this.fighter) {
      this.fighter = new Fighter({
        id: 'preview',
        isPlayer: true,
        x: 110,
        y: 170,
        facing: 1,
        weaponId: w.id,
        weaponTier,
        inkColor: cosmetic.ink,
        scarfColor: cosmetic.scarf,
        eyeColor: cosmetic.eye,
        glowColor: cosmetic.glow,
        sparkColor: cosmetic.spark,
      });
    } else {
      this.fighter.setWeapon(w.id);
      this.fighter.weaponTier = weaponTier;
      this.fighter.style.ink = cosmetic.ink;
      this.fighter.style.scarf = cosmetic.scarf;
      this.fighter.style.eye = cosmetic.eye;
      this.fighter.style.glow = cosmetic.glow;
      this.fighter.style.spark = cosmetic.spark;
    }
  }

  start() {
    if (!this.canvas || !this.ctx || this.rafId) return;
    this.lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      this.draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  update(dt) {
    if (!this.fighter) return;
    this.swingTimer -= dt;
    if (this.swingTimer <= 0) {
      this.swingTimer = 1.65;
      this.fighter.startAttack(Math.random() < 0.35 ? 'heavy' : 'light');
      for (let i = 0; i < 8; i++) {
        const ang = (Math.random() - 0.5) * 1.4;
        const spd = 80 + Math.random() * 140;
        this.sparks.push({
          x: 175,
          y: 118,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 30,
          life: 0.28,
          maxLife: 0.28,
        });
      }
    }

    // Keep fighter anchored inside mini-stage
    this.fighter.x = 110;
    this.fighter.y = 175;
    this.fighter.animTime += dt;
    this.fighter.stateTimer += dt;
    if (this.fighter.isAttacking() && this.fighter.currentMove) {
      if (this.fighter.stateTimer >= this.fighter.stateDuration) {
        this.fighter.state = STATES.IDLE;
        this.fighter.currentMove = null;
      }
    }
    const joints = this.fighter.computeJoints();
    this.fighter.scarf.update(joints.neck.x, joints.neck.y, 1, -120, dt);

    if (this.fighter.isAttacking() && this.fighter.weaponTip) {
      this.fighter.weaponTrail.push({ x: this.fighter.weaponTip.x, y: this.fighter.weaponTip.y, life: 0.16 });
    }
    for (let i = this.fighter.weaponTrail.length - 1; i >= 0; i--) {
      this.fighter.weaponTrail[i].life -= dt;
      if (this.fighter.weaponTrail[i].life <= 0) this.fighter.weaponTrail.splice(i, 1);
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  }

  draw() {
    if (!this.ctx || !this.fighter) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#12131A');
    grad.addColorStop(1, '#1E202C');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle stage glow & floor line
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.arc(110, 120, 72, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = this.fighter.style.scarf;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 178);
    ctx.lineTo(w - 18, 178);
    ctx.stroke();

    const j = this.fighter.computeJoints();

    // Weapon trail
    if (this.fighter.weaponTrail.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < this.fighter.weaponTrail.length; i++) {
        const a = this.fighter.weaponTrail[i - 1];
        const b = this.fighter.weaponTrail[i];
        const t = Math.max(0, b.life / 0.16);
        ctx.strokeStyle = this.fighter.style.trail;
        ctx.globalAlpha = t * 0.85;
        ctx.lineWidth = 4 + t * 8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Scarf
    ctx.save();
    ctx.strokeStyle = this.fighter.style.scarf;
    ctx.lineCap = 'round';
    const nodes = this.fighter.scarf.nodes;
    for (let i = 0; i < nodes.length - 1; i++) {
      ctx.lineWidth = Math.max(2, 6 - i * 0.8);
      ctx.beginPath();
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(nodes[i + 1].x, nodes[i + 1].y);
      ctx.stroke();
    }
    ctx.restore();

    // Body
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const strokeBody = (col, extra) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 7 + extra;
      ctx.beginPath();
      ctx.moveTo(j.hip.x, j.hip.y);
      ctx.lineTo(j.kneeL.x, j.kneeL.y);
      ctx.lineTo(j.footL.x, j.footL.y);
      ctx.moveTo(j.hip.x, j.hip.y);
      ctx.lineTo(j.kneeR.x, j.kneeR.y);
      ctx.lineTo(j.footR.x, j.footR.y);
      ctx.moveTo(j.hip.x, j.hip.y);
      ctx.lineTo(j.neck.x, j.neck.y);
      ctx.moveTo(j.neck.x, j.neck.y);
      ctx.lineTo(j.elbowL.x, j.elbowL.y);
      ctx.lineTo(j.handL.x, j.handL.y);
      ctx.moveTo(j.neck.x, j.neck.y);
      ctx.lineTo(j.elbowR.x, j.elbowR.y);
      ctx.lineTo(j.handR.x, j.handR.y);
      ctx.stroke();
    };
    strokeBody(this.fighter.weaponTier >= 5 ? this.fighter.style.trail : 'rgba(255,255,255,0.28)', 2.5);
    strokeBody(this.fighter.style.ink, 0);

    ctx.fillStyle = this.fighter.style.ink;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.fighter.style.eye;
    ctx.beginPath();
    ctx.ellipse(j.head.x + 5, j.head.y - 1, 3.2, 1.5, -0.18, 0, Math.PI * 2);
    ctx.fill();

    // Sample Weapon Line
    ctx.strokeStyle = this.fighter.style.trail;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(j.handR.x, j.handR.y);
    ctx.lineTo(
      j.handR.x + Math.cos(j.weaponAngle) * (this.fighter.weapon.reach * 0.55),
      j.handR.y + Math.sin(j.weaponAngle) * (this.fighter.weapon.reach * 0.55)
    );
    ctx.stroke();

    // Sparks
    for (const sp of this.sparks) {
      ctx.globalAlpha = sp.life / sp.maxLife;
      ctx.fillStyle = this.fighter.style.spark;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
