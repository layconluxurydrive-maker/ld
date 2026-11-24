import { ARENA_LEFT, ARENA_RIGHT, GROUND_Y, STATES, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js';

export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ambientParticles = [];
    this.currentActId = -1;
    this.camX = WORLD_WIDTH * 0.5;
    this.zoomBoost = 0;
    this.dpr = 1;
    this.viewW = 1280;
    this.viewH = 720;
    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const w = Math.max(300, rect.width || window.innerWidth);
    const h = Math.max(300, rect.height || window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  triggerZoom(amount = 0.08) {
    this.zoomBoost = Math.max(this.zoomBoost, amount);
  }

  initAmbient(act) {
    if (this.currentActId === act.id && this.ambientParticles.length > 0) return;
    this.currentActId = act.id;
    this.ambientParticles = [];
    const count = act.particleType === 'rain' ? 56 : 34;
    for (let i = 0; i < count; i++) {
      this.ambientParticles.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * GROUND_Y,
        vx: act.particleType === 'rain' ? -140 : (Math.random() - 0.5) * 45,
        vy:
          act.particleType === 'rain'
            ? 820 + Math.random() * 260
            : act.particleType === 'embers'
            ? -(45 + Math.random() * 70)
            : act.particleType === 'wisps'
            ? -(12 + Math.random() * 22)
            : 28 + Math.random() * 42,
        size: 2 + Math.random() * 4.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  updateAmbient(act, dt) {
    this.initAmbient(act);
    for (const p of this.ambientParticles) {
      p.phase += dt * 3;
      p.x += (p.vx + (act.particleType === 'petals' || act.particleType === 'ash' ? Math.sin(p.phase) * 26 : 0)) * dt;
      p.y += p.vy * dt;

      if (p.y > GROUND_Y + 20) {
        p.y = -20;
        p.x = Math.random() * WORLD_WIDTH;
      } else if (p.y < -20) {
        p.y = GROUND_Y - 10;
        p.x = Math.random() * WORLD_WIDTH;
      }
      if (p.x < -20) p.x = WORLD_WIDTH + 20;
      if (p.x > WORLD_WIDTH + 20) p.x = -20;
    }
  }

  render(state) {
    const {
      act,
      player,
      enemies,
      bossCtrl,
      hazards,
      ragdolls,
      particles,
      shakeX,
      shakeY,
      specialDimTimer,
      dt,
    } = state;

    this.updateAmbient(act, dt);
    if (this.zoomBoost > 0) this.zoomBoost = Math.max(0, this.zoomBoost - dt * 0.25);

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    const activeEntities = [player, ...enemies.filter((e) => e.state !== STATES.DEAD)];
    let minX = player.x;
    let maxX = player.x;
    for (const ent of activeEntities) {
      if (ent.x < minX) minX = ent.x;
      if (ent.x > maxX) maxX = ent.x;
    }
    const midX = (minX + maxX) * 0.5;
    const span = Math.max(460, maxX - minX + 340);

    const aspect = this.viewW / this.viewH;
    let baseScale = this.viewH / WORLD_HEIGHT;
    if (aspect < 1.25) {
      const neededScale = Math.min(this.viewW / span, (this.viewH * 0.88) / WORLD_HEIGHT);
      baseScale = Math.max(this.viewW / WORLD_WIDTH, neededScale);
    } else {
      baseScale = Math.max(this.viewW / WORLD_WIDTH, this.viewH / WORLD_HEIGHT);
    }
    baseScale *= 1 + this.zoomBoost;

    const targetCamX = Math.max(WORLD_WIDTH * 0.25, Math.min(WORLD_WIDTH * 0.75, midX));
    this.camX += (targetCamX - this.camX) * Math.min(1, dt * 7);

    ctx.fillStyle = act.skyTop;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.save();
    const groundScreenY = aspect < 1.0 ? this.viewH * 0.76 : this.viewH * 0.84;
    ctx.translate(this.viewW * 0.5 + shakeX, groundScreenY + shakeY);
    ctx.scale(baseScale, baseScale);
    ctx.translate(-this.camX, -GROUND_Y);

    // 1. Arena Sky & Backdrops
    this.drawArena(ctx, act);
    this.drawAmbientParticles(ctx, act);

    // 2. Stage Hazards
    if (hazards) {
      this.drawHazards(ctx, hazards);
    }

    // 3. Special or Mirage Arena Dim
    const dimAmt = Math.max(
      specialDimTimer > 0 ? Math.min(0.62, specialDimTimer * 1.4) : 0,
      bossCtrl && bossCtrl.dimArenaTimer > 0 ? 0.52 : 0
    );
    if (dimAmt > 0) {
      ctx.fillStyle = `rgba(5, 5, 10, ${dimAmt})`;
      ctx.fillRect(-400, -400, WORLD_WIDTH + 800, WORLD_HEIGHT + 600);
    }

    // 4. Boss Telegraphs & Clones/Decoys
    if (bossCtrl) {
      this.drawBossVisuals(ctx, bossCtrl);
    }

    // 5. Ragdolls
    for (const rag of ragdolls) {
      this.drawRagdoll(ctx, rag);
    }

    // 6. Enemies & Player
    for (const enemy of enemies) {
      if (enemy.state !== STATES.DEAD) {
        this.drawFighter(ctx, enemy);
      }
    }
    if (player.state !== STATES.DEAD) {
      this.drawFighter(ctx, player);
    }

    // 7. Boss Projectiles & Shockwaves
    if (bossCtrl) {
      this.drawBossProjectiles(ctx, bossCtrl);
    }

    // 8. Pooled Impact Particles
    if (particles) {
      this.drawParticles(ctx, particles);
    }

    ctx.restore();
    ctx.restore();
  }

  drawArena(ctx, act) {
    const skyGrad = ctx.createLinearGradient(0, -300, 0, GROUND_Y);
    skyGrad.addColorStop(0, act.skyTop);
    skyGrad.addColorStop(0.7, act.skyBottom);
    skyGrad.addColorStop(1, act.horizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-400, -300, WORLD_WIDTH + 800, GROUND_Y + 300);

    if (act.id === 1) {
      ctx.fillStyle = 'rgba(230, 57, 70, 0.25)';
      ctx.beginPath();
      ctx.arc(WORLD_WIDTH * 0.5, 275, 138, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(24, 10, 12, 0.62)';
      ctx.fillRect(460, 290, 22, 300);
      ctx.fillRect(798, 290, 22, 300);
      ctx.fillRect(410, 275, 460, 20);
      ctx.fillRect(438, 330, 404, 14);
      ctx.fillStyle = 'rgba(18, 8, 10, 0.5)';
      ctx.fillRect(90, 80, 28, 510);
      ctx.fillRect(WORLD_WIDTH - 118, 80, 28, 510);
      for (const lx of [165, WORLD_WIDTH - 165]) {
        ctx.fillStyle = 'rgba(255, 180, 110, 0.22)';
        ctx.beginPath();
        ctx.arc(lx, 245, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(lx - 11, 225, 22, 38);
      }
    } else if (act.id === 2) {
      const towers = [
        [40, 240, 110], [170, 190, 95], [290, 280, 130], [450, 210, 110],
        [620, 175, 140], [790, 230, 115], [940, 195, 125], [1100, 250, 135],
      ];
      for (let i = 0; i < towers.length; i++) {
        const [bx, by, bw] = towers[i];
        ctx.fillStyle = i % 2 === 0 ? '#0C1424' : '#101B30';
        ctx.fillRect(bx, by, bw, GROUND_Y - by);
        ctx.fillStyle = i % 3 === 0 ? 'rgba(56, 189, 248, 0.35)' : 'rgba(245, 158, 11, 0.25)';
        ctx.fillRect(bx + 14, by + 22, bw - 28, 8);
      }
    } else if (act.id === 3) {
      ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
      ctx.fillRect(360, 410, 560, 180);
      ctx.fillStyle = '#140E0C';
      for (const gx of [120, 420, 840, 1140]) {
        ctx.fillRect(gx, 0, 24, GROUND_Y);
      }
      ctx.fillRect(-200, 120, WORLD_WIDTH + 400, 32);
    } else if (act.id === 4) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.beginPath();
      ctx.arc(WORLD_WIDTH * 0.5, 235, 108, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0D111C';
      ctx.beginPath();
      ctx.moveTo(470, 390);
      ctx.lineTo(640, 305);
      ctx.lineTo(810, 390);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(525, 390, 230, 200);
    } else {
      ctx.fillStyle = 'rgba(225, 29, 72, 0.16)';
      ctx.beginPath();
      ctx.arc(WORLD_WIDTH * 0.5, 280, 195, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#09070C';
      const spires = [
        [100, 190, 75], [260, 260, 55], [470, 140, 85],
        [740, 145, 85], [960, 250, 60], [1110, 185, 80],
      ];
      for (const [sx, sy, sw] of spires) {
        ctx.beginPath();
        ctx.moveTo(sx, GROUND_Y);
        ctx.lineTo(sx + sw * 0.5, sy);
        ctx.lineTo(sx + sw, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
    }

    const floorGrad = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 260);
    floorGrad.addColorStop(0, act.floorTop);
    floorGrad.addColorStop(1, act.floorBottom);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(-400, GROUND_Y, WORLD_WIDTH + 800, 360);

    ctx.strokeStyle = act.floorLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-400, GROUND_Y);
    ctx.lineTo(WORLD_WIDTH + 400, GROUND_Y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= WORLD_WIDTH; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 2);
      ctx.lineTo(x + (x - WORLD_WIDTH * 0.5) * 0.25, GROUND_Y + 130);
      ctx.stroke();
    }
  }

  drawHazards(ctx, hazards) {
    ctx.save();

    // Pitfall Edge Warnings (Act 2)
    if (hazards.pitfallEnabled) {
      for (const ex of [ARENA_LEFT - 10, ARENA_RIGHT - 42]) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(ex, GROUND_Y - 12, 52, 12);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(ex, GROUND_Y - 12, 52, 12);
      }
    }

    // Shadow Fog Edges (Act 4)
    if (hazards.shadowFogEnabled) {
      const gradL = ctx.createLinearGradient(ARENA_LEFT - 30, 0, ARENA_LEFT + 70, 0);
      gradL.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      gradL.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = gradL;
      ctx.fillRect(ARENA_LEFT - 30, GROUND_Y - 140, 100, 140);

      const gradR = ctx.createLinearGradient(ARENA_RIGHT + 30, 0, ARENA_RIGHT - 70, 0);
      gradR.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      gradR.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = gradR;
      ctx.fillRect(ARENA_RIGHT - 70, GROUND_Y - 140, 100, 140);
    }

    // Platforms (Act 2, Act 4, Act 5)
    for (const p of hazards.platforms) {
      if (!p.solid) {
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)';
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p.x, p.y, p.w, 10);
        ctx.setLineDash([]);
        continue;
      }
      ctx.globalAlpha = p.warning ? (Math.floor(performance.now() / 80) % 2 === 0 ? 0.35 : 0.85) : 1;
      ctx.fillStyle = p.phasing ? '#132A24' : '#1E293B';
      ctx.fillRect(p.x, p.y, p.w, 11);
      ctx.fillStyle = p.warning ? '#FACC15' : p.phasing ? '#34D399' : '#38BDF8';
      ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.globalAlpha = 1;
    }

    // Breakable Crates (Act 1)
    for (const c of hazards.crates) {
      if (c.broken) continue;
      ctx.fillStyle = c.flash > 0 ? '#FFFFFF' : '#78350F';
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 2;
      ctx.fillRect(c.x - c.w * 0.5, c.y - c.h, c.w, c.h);
      ctx.strokeRect(c.x - c.w * 0.5, c.y - c.h, c.w, c.h);
      ctx.beginPath();
      ctx.moveTo(c.x - c.w * 0.5, c.y - c.h);
      ctx.lineTo(c.x + c.w * 0.5, c.y);
      ctx.stroke();
    }

    // Swinging Pendulums (Act 3)
    for (const pend of hazards.pendulums) {
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pend.pivotX, pend.pivotY);
      ctx.lineTo(pend.x, pend.y);
      ctx.stroke();
      ctx.fillStyle = '#EA580C';
      ctx.strokeStyle = '#FDBA74';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pend.x, pend.y, pend.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Steam Vents (Acts 3 & 5)
    for (const v of hazards.steamVents) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(v.x - v.w * 0.5, GROUND_Y - 5, v.w, 8);
      if (v.state === 'telegraph') {
        ctx.fillStyle = 'rgba(251, 146, 60, 0.45)';
        ctx.fillRect(v.x - v.w * 0.4, GROUND_Y - 26, v.w * 0.8, 24);
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 2;
        ctx.strokeRect(v.x - v.w * 0.4, GROUND_Y - 26, v.w * 0.8, 24);
      } else if (v.state === 'erupt') {
        const g = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y - 140);
        g.addColorStop(0, 'rgba(254, 215, 170, 0.92)');
        g.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(v.x - v.w * 0.38, GROUND_Y - 138, v.w * 0.76, 138);
      }
    }

    // Citadel Rune Floor Waves (Act 5)
    for (const rw of hazards.runeWaves) {
      if (rw.telegraph > 0) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.beginPath();
        ctx.arc(rw.x, GROUND_Y - 12, 22, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.moveTo(rw.x - 16, GROUND_Y);
        ctx.lineTo(rw.x, GROUND_Y - 46);
        ctx.lineTo(rw.x + 16, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawBossVisuals(ctx, bossCtrl) {
    ctx.save();

    // Subtle ground pulse under real Mirage in Phase 2 so player can spot her
    if (bossCtrl.bossId === 'mirage' && bossCtrl.boss.bossPhase >= 2) {
      ctx.strokeStyle = 'rgba(232, 121, 249, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(bossCtrl.boss.x, GROUND_Y + 3, 28, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Telegraphs
    for (const t of bossCtrl.telegraphs) {
      const p = t.progress || 0;
      if (t.type === 'glint') {
        const r = 18 * (1 - p * 0.4) + 6;
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(t.x - r, t.y);
        ctx.lineTo(t.x + r, t.y);
        ctx.moveTo(t.x, t.y - r);
        ctx.lineTo(t.x, t.y + r);
        ctx.stroke();
      } else if (t.type === 'line') {
        ctx.strokeStyle = t.color;
        ctx.globalAlpha = 0.35 + p * 0.65;
        ctx.lineWidth = 2 + p * 3;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (t.type === 'ring') {
        ctx.strokeStyle = t.color;
        ctx.globalAlpha = 0.45 + p * 0.55;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius * (1 - p * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      } else if (t.type === 'zone') {
        ctx.fillStyle = t.color;
        ctx.globalAlpha = 0.18 + p * 0.35;
        ctx.fillRect(t.x - t.w * 0.5, t.y - 18, t.w, 18);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(t.x - t.w * 0.5, t.y - 18, t.w, 18);
      }
    }

    // Decoys
    for (const d of bossCtrl.decoys) {
      const p = 1 - d.timer / d.maxTimer;
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius * p + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mirage Clones
    for (const c of bossCtrl.clones) {
      ctx.globalAlpha = 0.68;
      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x, c.y - 72);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y - 84, 10, 0, Math.PI * 2);
      ctx.stroke();
      if (c.hitDone) {
        ctx.strokeStyle = '#E879F9';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(c.x - 20, c.y - 95);
        ctx.lineTo(c.x + c.facing * 75, c.y - 20);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  drawBossProjectiles(ctx, bossCtrl) {
    ctx.save();
    for (const pr of bossCtrl.projectiles) {
      ctx.fillStyle = pr.color;
      if (pr.kind === 'kunai') {
        const ang = Math.atan2(pr.vy, pr.vx);
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -4);
        ctx.lineTo(-10, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const sw of bossCtrl.shockwaves) {
      ctx.fillStyle = sw.color;
      ctx.beginPath();
      ctx.moveTo(sw.x - 16, sw.y);
      ctx.lineTo(sw.x, sw.y - 44);
      ctx.lineTo(sw.x + 16, sw.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawAmbientParticles(ctx, act) {
    ctx.save();
    for (const p of this.ambientParticles) {
      if (act.particleType === 'rain') {
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 5, p.y + 18);
        ctx.stroke();
      } else if (act.particleType === 'petals') {
        ctx.fillStyle = 'rgba(255, 190, 200, 0.65)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, p.phase, 0, Math.PI * 2);
        ctx.fill();
      } else if (act.particleType === 'embers') {
        ctx.fillStyle = 'rgba(251, 146, 60, 0.78)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (act.particleType === 'wisps') {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.45)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.85, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.42)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawFighter(ctx, f) {
    const joints = f.computeJoints();

    const heightAboveGround = Math.max(0, GROUND_Y - f.y);
    const shadowScale = Math.max(0.4, 1 - heightAboveGround / 280);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND_Y + 4, 24 * f.scale * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const ghost of f.afterimages) {
      ctx.save();
      ctx.globalAlpha = (ghost.life / 0.22) * 0.35;
      this.drawStickBody(ctx, ghost.joints, f.scale, f.style.scarf, f.style.scarf, f.facing, false);
      ctx.restore();
    }

    if (f.weaponTrail.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < f.weaponTrail.length; i++) {
        const a = f.weaponTrail[i - 1];
        const b = f.weaponTrail[i];
        const t = Math.max(0, b.life / 0.16);
        ctx.strokeStyle = f.style.trail;
        ctx.globalAlpha = t * 0.8;
        ctx.lineWidth = (5 + t * (f.weaponTier >= 5 ? 14 : 11)) * f.scale;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        ctx.strokeStyle = f.style.trailCore;
        ctx.globalAlpha = t * 0.92;
        ctx.lineWidth = (2 + t * 4) * f.scale;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    this.drawScarf(ctx, f.scarf.nodes, f.style.scarf, f.scale);

    const isFlashing = f.hitFlashTimer > 0;
    const bodyColor = isFlashing ? f.hitFlashColor : f.style.ink;
    const outlineColor = f.enraged
      ? '#EF4444'
      : f.superArmor
      ? '#F97316'
      : f.iframeTimer > 0 && f.state === STATES.DASH
      ? f.style.glow
      : f.weaponTier >= 5
      ? f.style.trail
      : 'rgba(255,255,255,0.24)';

    this.drawWeapon(ctx, f, joints);
    this.drawStickBody(ctx, joints, f.scale, bodyColor, outlineColor, f.facing, !isFlashing, f.style.eye);

    if (f.state === STATES.BLOCK || f.counterStance) {
      const parryActive = f.parryTimer > 0 || f.counterStance;
      ctx.save();
      ctx.strokeStyle = parryActive ? '#FACC15' : 'rgba(148, 163, 184, 0.85)';
      ctx.lineWidth = parryActive ? 4.5 : 3;
      const sx = f.x + f.facing * 24 * f.scale;
      const sy = f.y - 54 * f.scale;
      ctx.beginPath();
      if (f.facing > 0) {
        ctx.arc(sx, sy, 36 * f.scale, -Math.PI * 0.42, Math.PI * 0.42);
      } else {
        ctx.arc(sx, sy, 36 * f.scale, Math.PI * 0.58, Math.PI * 1.42);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (f.state === STATES.STAGGERED) {
      ctx.save();
      ctx.fillStyle = '#FACC15';
      for (let i = 0; i < 3; i++) {
        const ang = f.animTime * 6 + (i * Math.PI * 2) / 3;
        const sx = joints.head.x + Math.cos(ang) * 18 * f.scale;
        const sy = joints.head.y - 16 * f.scale + Math.sin(ang) * 5 * f.scale;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (!f.isPlayer && f.archetype !== 'boss') {
      const barW = 48 * f.scale;
      const barH = 5;
      const bx = f.x - barW * 0.5;
      const by = joints.head.y - 26 * f.scale;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = f.isElite ? '#FACC15' : '#EF4444';
      ctx.fillRect(bx, by, barW * Math.max(0, f.hp / f.maxHp), barH);
    }
  }

  drawStickBody(ctx, j, scale, fill, rim, facing, drawEyes = true, eyeColor = '#FF4D5A') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawLimbs = (color, extraWidth) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = (7.2 * scale) + extraWidth;
      ctx.beginPath();
      ctx.moveTo(j.hip.x, j.hip.y);
      ctx.lineTo(j.kneeL.x, j.kneeL.y);
      ctx.lineTo(j.footL.x, j.footL.y);
      ctx.moveTo(j.hip.x, j.hip.y);
      ctx.lineTo(j.kneeR.x, j.kneeR.y);
      ctx.lineTo(j.footR.x, j.footR.y);
      ctx.stroke();

      ctx.lineWidth = (8.8 * scale) + extraWidth;
      ctx.beginPath();
      ctx.moveTo(j.hip.x, j.hip.y);
      ctx.lineTo(j.neck.x, j.neck.y);
      ctx.stroke();

      ctx.lineWidth = (6.4 * scale) + extraWidth;
      ctx.beginPath();
      ctx.moveTo(j.neck.x, j.neck.y);
      ctx.lineTo(j.elbowL.x, j.elbowL.y);
      ctx.lineTo(j.handL.x, j.handL.y);
      ctx.moveTo(j.neck.x, j.neck.y);
      ctx.lineTo(j.elbowR.x, j.elbowR.y);
      ctx.lineTo(j.handR.x, j.handR.y);
      ctx.stroke();
    };

    drawLimbs(rim, 2.6);
    drawLimbs(fill, 0);

    const headR = 11.5 * scale;
    ctx.fillStyle = fill;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (drawEyes) {
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(
        j.head.x + facing * 4.8 * scale,
        j.head.y - 1 * scale,
        3.2 * scale,
        1.5 * scale,
        -0.18 * facing,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  drawScarf(ctx, nodes, color, scale) {
    if (!nodes || nodes.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < nodes.length - 1; i++) {
      ctx.lineWidth = Math.max(2, (6.5 - i * 0.85) * scale);
      ctx.beginPath();
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(nodes[i + 1].x, nodes[i + 1].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawWeapon(ctx, f, j) {
    const s = f.scale;
    const hand = j.handR;
    const angle = j.weaponAngle;
    const id = f.visualWeaponOverride || f.weapon.id;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (id === 'war_hammer') {
      ctx.translate(hand.x, hand.y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 5.5 * s;
      ctx.beginPath();
      ctx.moveTo(-26 * s, 0);
      ctx.lineTo(66 * s, 0);
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#F97316';
      ctx.lineWidth = 2.5;
      ctx.fillRect(52 * s, -18 * s, 22 * s, 36 * s);
      ctx.strokeRect(52 * s, -18 * s, 22 * s, 36 * s);
    } else if (id === 'fists') {
      ctx.fillStyle = f.style.trail;
      ctx.beginPath();
      ctx.arc(j.handR.x, j.handR.y, 4.8 * s, 0, Math.PI * 2);
      ctx.arc(j.handL.x, j.handL.y, 4.4 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'bo_staff') {
      ctx.translate(hand.x, hand.y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 4.6 * s;
      ctx.beginPath();
      ctx.moveTo(-36 * s, 0);
      ctx.lineTo(64 * s, 0);
      ctx.stroke();
      ctx.strokeStyle = '#FEF3C7';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(52 * s, 0);
      ctx.lineTo(64 * s, 0);
      ctx.stroke();
    } else if (id === 'twin_daggers') {
      for (const hPos of [j.handR, j.handL]) {
        ctx.save();
        ctx.translate(hPos.x, hPos.y);
        ctx.rotate(hPos === j.handR ? angle : angle + f.facing * 0.5);
        ctx.fillStyle = '#E2E8F0';
        ctx.beginPath();
        ctx.moveTo(0, -2.5 * s);
        ctx.lineTo(26 * s, 0);
        ctx.lineTo(0, 2.5 * s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (id === 'katana') {
      ctx.translate(hand.x, hand.y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 3.2 * s;
      ctx.beginPath();
      ctx.moveTo(-10 * s, 0);
      ctx.quadraticCurveTo(32 * s, -4 * s, 64 * s, -2 * s);
      ctx.stroke();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(2 * s, -6 * s);
      ctx.lineTo(2 * s, 6 * s);
      ctx.stroke();
    } else if (id === 'gauntlets') {
      for (const hPos of [j.handR, j.handL]) {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#FB923C';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hPos.x, hPos.y, 7.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (id === 'kusarigama') {
      ctx.translate(hand.x, hand.y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#94A3B8';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(68 * s, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#E9D5FF';
      ctx.lineWidth = 3.5 * s;
      ctx.beginPath();
      ctx.moveTo(68 * s, -2 * s);
      ctx.quadraticCurveTo(82 * s, 8 * s, 66 * s, 18 * s);
      ctx.stroke();
    } else if (id === 'halberd') {
      ctx.translate(hand.x, hand.y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 4.4 * s;
      ctx.beginPath();
      ctx.moveTo(-34 * s, 0);
      ctx.lineTo(74 * s, 0);
      ctx.stroke();
      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.moveTo(58 * s, -2 * s);
      ctx.lineTo(84 * s, 0);
      ctx.lineTo(62 * s, 16 * s);
      ctx.quadraticCurveTo(54 * s, 6 * s, 58 * s, -2 * s);
      ctx.fill();
    }

    ctx.restore();
  }

  drawRagdoll(ctx, rag) {
    const alpha = Math.max(0, Math.min(1, rag.life / 0.8));
    const p = rag.points;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 9;
    this.strokeRagdollSkeleton(ctx, p);
    ctx.strokeStyle = rag.style.ink;
    ctx.lineWidth = 6.5;
    this.strokeRagdollSkeleton(ctx, p);

    ctx.fillStyle = rag.style.ink;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.head.x, p.head.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  strokeRagdollSkeleton(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p.neck.x, p.neck.y);
    ctx.lineTo(p.hip.x, p.hip.y);
    ctx.moveTo(p.neck.x, p.neck.y);
    ctx.lineTo(p.elbowL.x, p.elbowL.y);
    ctx.lineTo(p.handL.x, p.handL.y);
    ctx.moveTo(p.neck.x, p.neck.y);
    ctx.lineTo(p.elbowR.x, p.elbowR.y);
    ctx.lineTo(p.handR.x, p.handR.y);
    ctx.moveTo(p.hip.x, p.hip.y);
    ctx.lineTo(p.kneeL.x, p.kneeL.y);
    ctx.lineTo(p.footL.x, p.footL.y);
    ctx.moveTo(p.hip.x, p.hip.y);
    ctx.lineTo(p.kneeR.x, p.kneeR.y);
    ctx.lineTo(p.footR.x, p.footR.y);
    ctx.stroke();
  }

  drawParticles(ctx, pool) {
    ctx.save();
    for (const r of pool.rings) {
      if (!r.active) continue;
      const p = 1 - r.life / r.maxLife;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.lineWidth = r.width * (1 - p * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * p + 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const sp of pool.sparks) {
      if (!sp.active) continue;
      ctx.globalAlpha = Math.max(0, sp.life / sp.maxLife);
      if (sp.kind === 'dust') {
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = sp.size;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x - sp.vx * 0.025, sp.y - sp.vy * 0.025);
        ctx.stroke();
      }
    }

    ctx.textAlign = 'center';
    for (const t of pool.texts) {
      if (!t.active) continue;
      ctx.globalAlpha = Math.min(1, t.life * 2.2);
      ctx.font = `900 ${t.size}px system-ui, -apple-system, sans-serif`;
      ctx.strokeStyle = '#09090B';
      ctx.lineWidth = 4;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
