import { ARENA_LEFT, ARENA_RIGHT, BOSS_STATES, GROUND_Y, STATES, WORLD_WIDTH } from './constants.js';

export class BossController {
  constructor(boss) {
    this.boss = boss;
    this.bossId = boss.bossId || 'kuro';
    this.bState = BOSS_STATES.CHASE;
    this.timer = 0;
    this.duration = 0;
    this.pattern = null;
    this.chaseTimer = 0.6;
    this.comboStep = 0;
    this.lastHitSwing = 0;

    // Boss special entities managed in engine/renderer
    this.telegraphs = []; // { type, x, y, x2, y2, radius, w, color, progress }
    this.projectiles = []; // { x, y, vx, vy, radius, dmg, color, kind, life }
    this.decoys = []; // { x, y, timer, maxTimer, radius, dmg, color, kind }
    this.clones = []; // { x, y, facing, life, slashTimer, alpha }
    this.shockwaves = []; // { x, y, vx, radius, dmg, color, life }
    this.dimArenaTimer = 0;
    this.hitsTrackedForTeleport = 0;

    if (this.bossId === 'titan') {
      this.boss.visualWeaponOverride = 'war_hammer';
      this.boss.superArmor = true;
    }
  }

  checkPhaseTransition(onPhaseShift, particles, sound) {
    const b = this.boss;
    const ratio = b.hp / b.maxHp;
    let nextPhase = b.bossPhase;

    if (this.bossId === 'grandmaster') {
      if (b.bossPhase === 1 && ratio <= 0.66) nextPhase = 2;
      else if (b.bossPhase === 2 && ratio <= 0.33) nextPhase = 3;
    } else {
      if (b.bossPhase === 1 && ratio <= 0.5) nextPhase = 2;
    }

    if (nextPhase !== b.bossPhase) {
      b.bossPhase = nextPhase;
      b.enraged = true;
      b.counterStance = false;
      this.bState = BOSS_STATES.PHASE_TRANSITION;
      this.timer = 0;
      this.duration = 0.72;
      this.telegraphs = [];
      b.vx = 0;
      b.iframeTimer = 0.75;

      if (this.bossId === 'kuro') {
        b.style.trail = '#EF4444';
        b.style.trailCore = '#FEE2E2';
      } else if (this.bossId === 'titan') {
        b.superArmor = false;
        b.speedMult *= 1.32;
      } else if (this.bossId === 'grandmaster') {
        if (nextPhase === 2) b.setWeapon('halberd');
        if (nextPhase === 3) {
          b.style.scarf = '#FBBF24';
          b.style.trail = '#FACC15';
        }
      }

      sound.phaseShift();
      particles.spawnRing(b.x, b.y - 50, 140, b.style.scarf, 6, 0.45);
      particles.spawnRadialSparks(b.x, b.y - 50, 22, b.style.scarf, 1.2);
      particles.spawnText(b.x, b.y - 125, `PHASE ${nextPhase}!`, '#FACC15', 24);
      if (onPhaseShift) onPhaseShift(nextPhase, b);
      return true;
    }
    return false;
  }

  update(dt, player, particles, sound, onPhaseShift, onBossHitPlayer) {
    const b = this.boss;
    if (b.state === STATES.DEAD) return { moveX: 0, blockHeld: false };

    if (this.dimArenaTimer > 0) this.dimArenaTimer = Math.max(0, this.dimArenaTimer - dt);

    // Mirage Phase 2: teleport behind player after 3 hits taken
    if (this.bossId === 'mirage' && b.bossPhase >= 2 && b.hitsTakenCount - this.hitsTrackedForTeleport >= 3) {
      this.hitsTrackedForTeleport = b.hitsTakenCount;
      particles.spawnRing(b.x, b.y - 50, 55, '#C084FC', 4);
      const behindX = Math.max(ARENA_LEFT + 70, Math.min(ARENA_RIGHT - 70, player.x - player.facing * 115));
      b.x = behindX;
      b.facing = player.x >= b.x ? 1 : -1;
      particles.spawnRing(b.x, b.y - 50, 65, '#E879F9', 4);
      particles.spawnText(b.x, b.y - 115, 'SHADOW STEP!', '#E879F9', 16);
    }

    // Update projectiles, shockwaves, decoys, clones
    this.updateEntities(dt, player, particles, sound, onBossHitPlayer);

    // Check phase transition unless already dead/transitioning
    if (this.bState !== BOSS_STATES.PHASE_TRANSITION) {
      if (this.checkPhaseTransition(onPhaseShift, particles, sound)) {
        return { moveX: 0, blockHeld: false };
      }
    }

    if (b.state === STATES.STAGGERED) {
      this.bState = BOSS_STATES.RECOVER;
      this.timer = 0;
      this.duration = 0.5;
      this.telegraphs = [];
      b.counterStance = false;
      return { moveX: 0, blockHeld: false };
    }

    this.timer += dt;
    const dx = player.x - b.x;
    const dist = Math.abs(dx);
    const dir = dx >= 0 ? 1 : -1;

    if (this.bState === BOSS_STATES.PHASE_TRANSITION) {
      if (this.timer >= this.duration) {
        this.bState = BOSS_STATES.CHASE;
        this.chaseTimer = 0.35;
      }
      return { moveX: 0, blockHeld: false };
    }

    if (this.bState === BOSS_STATES.CHASE) {
      b.facing = dir;
      this.chaseTimer -= dt;

      // Grandmaster seamless weapon swap in Phase 1/2/3
      if (this.bossId === 'grandmaster') {
        if (b.bossPhase === 1) b.setWeapon(dist < 100 ? 'twin_daggers' : 'katana');
        else if (b.bossPhase === 2) b.setWeapon(dist < 110 ? 'gauntlets' : 'halberd');
        else b.setWeapon(dist < 115 ? 'twin_daggers' : 'halberd');
      }

      if (this.chaseTimer <= 0) {
        this.pickPattern(dist, dir, player, particles, sound);
        return { moveX: 0, blockHeld: false };
      }

      const ideal = b.weapon.reach * 0.78;
      let moveX = 0;
      if (dist > ideal) moveX = dir * 0.95;
      else if (this.bossId === 'gale' && dist < 80) moveX = -dir * 0.7;
      return { moveX, blockHeld: false };
    }

    if (this.bState === BOSS_STATES.TELEGRAPH) {
      // Update telegraph visual progress
      const p = Math.min(1, this.timer / Math.max(0.05, this.duration));
      for (const t of this.telegraphs) t.progress = p;

      if (this.pattern === 'kuro_counter') {
        b.counterStance = true;
      }

      if (this.timer >= this.duration) {
        this.enterExecute(player, particles, sound, onBossHitPlayer);
      }
      return { moveX: 0, blockHeld: false };
    }

    if (this.bState === BOSS_STATES.EXECUTE) {
      this.updateExecute(dt, player, particles, sound, onBossHitPlayer);
      if (this.timer >= this.duration) {
        b.counterStance = false;
        this.telegraphs = [];
        this.bState = BOSS_STATES.RECOVER;
        this.timer = 0;
        this.duration = this.pattern === 'gm_eclipse' ? 0.92 : this.pattern.includes('slam') || this.pattern.includes('thrust') ? 0.56 : 0.36;
      }
      return { moveX: 0, blockHeld: false };
    }

    if (this.bState === BOSS_STATES.RECOVER) {
      if (this.timer >= this.duration) {
        this.bState = BOSS_STATES.CHASE;
        this.chaseTimer = b.enraged ? 0.2 + Math.random() * 0.18 : 0.28 + Math.random() * 0.22;
      }
      return { moveX: 0, blockHeld: false };
    }

    return { moveX: 0, blockHeld: false };
  }

  pickPattern(dist, dir, player, particles, sound) {
    const b = this.boss;
    const p2 = b.bossPhase >= 2;
    const roll = Math.random();

    if (this.bossId === 'kuro') {
      if (p2 && roll < 0.36) {
        this.startTelegraph('kuro_tornado', 0.55, [{ type: 'ring', x: b.x, y: b.y - 50, radius: 135, color: '#EF4444' }], sound);
      } else if (p2 && roll < 0.7) {
        this.startTelegraph('kuro_bamboo_thrust', 0.6, [{ type: 'line', x: b.x, y: b.y - 52, x2: b.x + dir * 240, y2: b.y - 52, color: '#EF4444' }], sound);
      } else if (roll < 0.32) {
        this.startTelegraph('kuro_counter', 0.45, [{ type: 'glint', x: b.x + dir * 18, y: b.y - 82, color: '#FFFFFF' }], sound);
      } else {
        this.startTelegraph('kuro_combo', 0.32, [{ type: 'glint', x: b.x, y: b.y - 72, color: '#FACC15' }], sound);
      }
    } else if (this.bossId === 'gale') {
      if (p2 && roll < 0.38) {
        this.startTelegraph('gale_cyclone_dive', 0.58, [{ type: 'zone', x: player.x, y: GROUND_Y, w: 150, color: '#22D3EE' }], sound);
        b.vy = -680;
        b.grounded = false;
      } else if (roll < 0.48) {
        this.startTelegraph('gale_kunai', 0.48, [{ type: 'glint', x: b.x, y: b.y - 86, color: '#22D3EE' }], sound);
        if (b.grounded) {
          b.vy = -520;
          b.grounded = false;
        }
      } else {
        const endX = Math.max(ARENA_LEFT + 60, Math.min(ARENA_RIGHT - 60, b.x + dir * 420));
        this.startTelegraph('gale_zipline', 0.5, [{ type: 'line', x: b.x, y: b.y - 46, x2: endX, y2: b.y - 46, color: '#38BDF8' }], sound);
      }
    } else if (this.bossId === 'titan') {
      if (p2 && roll < 0.38) {
        const marks = [player.x - 110, player.x, player.x + 110].map((mx) => ({
          type: 'zone',
          x: Math.max(ARENA_LEFT + 60, Math.min(ARENA_RIGHT - 60, mx)),
          y: GROUND_Y,
          w: 84,
          color: '#EF4444',
        }));
        this.startTelegraph('titan_slag_rain', 0.78, marks, sound);
      } else if (roll < 0.55) {
        this.startTelegraph('titan_slam', 0.9, [{ type: 'zone', x: b.x + dir * 75, y: GROUND_Y, w: 150, color: '#F97316' }], sound);
      } else {
        this.startTelegraph('titan_charge', 0.55, [{ type: 'line', x: b.x, y: b.y - 48, x2: b.x + dir * 320, y2: b.y - 48, color: '#FB923C' }], sound);
      }
    } else if (this.bossId === 'mirage') {
      if (p2 && roll < 0.42) {
        this.dimArenaTimer = 2.4;
        this.startTelegraph('mirage_clones', 0.6, [{ type: 'ring', x: b.x, y: b.y - 50, radius: 110, color: '#C084FC' }], sound);
      } else if (roll < 0.55) {
        this.startTelegraph('mirage_chain_snare', 0.6, [{ type: 'ring', x: b.x, y: b.y - 54, radius: 175, color: '#A855F7' }], sound);
      } else {
        this.startTelegraph('mirage_projectiles', 0.45, [{ type: 'glint', x: b.x, y: b.y - 68, color: '#E879F9' }], sound);
      }
    } else {
      // Level 50 — The Grandmaster
      if (b.bossPhase === 3 && roll < 0.42) {
        this.startTelegraph('gm_eclipse', 1.2, [{ type: 'ring', x: b.x, y: b.y - 56, radius: 250, color: '#FBBF24' }], sound);
      } else if (b.bossPhase >= 2 && roll < 0.5) {
        const pillars = [player.x - 140, player.x, player.x + 140].map((px) => ({
          type: 'zone',
          x: Math.max(ARENA_LEFT + 60, Math.min(ARENA_RIGHT - 60, px)),
          y: GROUND_Y,
          w: 78,
          color: '#F59E0B',
        }));
        this.startTelegraph('gm_rune_pillars', 0.72, pillars, sound);
      } else if (roll < 0.45) {
        const endX = Math.max(ARENA_LEFT + 60, Math.min(ARENA_RIGHT - 60, b.x + dir * 340));
        this.startTelegraph('gm_iaido', 0.5, [
          { type: 'glint', x: b.x + dir * 12, y: b.y - 56, color: '#FFFFFF' },
          { type: 'line', x: b.x, y: b.y - 50, x2: endX, y2: b.y - 50, color: '#FACC15' },
        ], sound);
      } else {
        this.startTelegraph('gm_combo', 0.34, [{ type: 'glint', x: b.x, y: b.y - 72, color: '#FACC15' }], sound);
      }
    }
  }

  startTelegraph(pattern, duration, telegraphs, sound) {
    this.pattern = pattern;
    this.bState = BOSS_STATES.TELEGRAPH;
    this.timer = 0;
    this.duration = duration;
    this.telegraphs = telegraphs.map((t) => ({ ...t, progress: 0 }));
    if (sound) sound.telegraph();
  }

  enterExecute(player, particles, sound, onBossHitPlayer) {
    const b = this.boss;
    const dir = player.x >= b.x ? 1 : -1;
    b.facing = dir;
    this.bState = BOSS_STATES.EXECUTE;
    this.timer = 0;
    this.comboStep = 0;

    if (this.pattern === 'kuro_combo' || this.pattern === 'gm_combo') {
      this.duration = 0.85;
      this.comboStep = 1;
      b.startAttack('light', sound);
    } else if (this.pattern === 'kuro_counter') {
      this.duration = 1.05;
      b.counterStance = true;
    } else if (this.pattern === 'kuro_tornado') {
      this.duration = 0.78;
      sound.special();
    } else if (this.pattern === 'kuro_bamboo_thrust') {
      this.duration = 0.55;
      b.vx = dir * 680;
      b.startAttack('heavy', sound);
    } else if (this.pattern === 'gale_kunai') {
      this.duration = 0.42;
      sound.swing(false, 'twin_daggers');
      for (const dy of [-80, 0, 80]) {
        this.projectiles.push({
          x: b.x + dir * 24,
          y: b.y - 58,
          vx: dir * 560,
          vy: dy + 40,
          radius: 9,
          dmg: 14 * b.dmgMult,
          color: '#22D3EE',
          kind: 'kunai',
          life: 1.6,
        });
      }
    } else if (this.pattern === 'gale_zipline') {
      this.duration = 0.36;
      if (b.bossPhase >= 2) {
        this.decoys.push({ x: b.x, y: b.y - 45, timer: 0.65, maxTimer: 0.65, radius: 78, dmg: 16 * b.dmgMult, color: '#22D3EE' });
      }
      b.vx = dir * 1050;
      b.startAttack('heavy', sound);
    } else if (this.pattern === 'gale_cyclone_dive') {
      this.duration = 0.55;
      const targetX = this.telegraphs[0]?.x || player.x;
      b.x += (targetX - b.x) * 0.65;
      b.vy = 920;
      sound.swing(true, 'twin_daggers');
    } else if (this.pattern === 'titan_slam') {
      this.duration = b.bossPhase >= 2 ? 0.85 : 0.48;
      this.spawnTitanShockwave(b.x, dir, b.dmgMult, particles, sound);
      if (b.bossPhase >= 2) {
        this.spawnTitanShockwave(b.x, -dir, b.dmgMult, particles, sound);
      }
    } else if (this.pattern === 'titan_charge') {
      this.duration = 0.65;
      b.vx = dir * 620;
      b.startAttack('heavy', sound);
      particles.spawnDust(b.x, GROUND_Y, 10, -dir);
    } else if (this.pattern === 'titan_slag_rain') {
      this.duration = 0.45;
      sound.hazard();
      for (const t of this.telegraphs) {
        this.projectiles.push({
          x: t.x,
          y: 40,
          vx: 0,
          vy: 780,
          radius: 18,
          dmg: 18 * b.dmgMult,
          color: '#EF4444',
          kind: 'slag',
          life: 1.1,
        });
      }
    } else if (this.pattern === 'mirage_chain_snare') {
      this.duration = 0.5;
      b.startAttack('heavy', sound);
      particles.spawnRing(b.x, b.y - 54, 175, '#C084FC', 5);
      if (Math.hypot(player.x - b.x, player.y - b.y) < 185 && player.iframeTimer <= 0) {
        onBossHitPlayer(16 * b.dmgMult, -dir * 260, -140, dir, true);
      }
    } else if (this.pattern === 'mirage_projectiles') {
      this.duration = 0.45;
      sound.swing(false, 'kusarigama');
      this.projectiles.push({
        x: b.x + dir * 24,
        y: b.y - 54,
        vx: dir * 480,
        vy: 0,
        radius: 12,
        dmg: 15 * b.dmgMult,
        color: '#E879F9',
        kind: 'orb',
        life: 1.8,
      });
      if (b.bossPhase === 1 && this.decoys.length === 0) {
        this.decoys.push({ x: b.x - dir * 130, y: b.y - 45, timer: 1.2, maxTimer: 1.2, radius: 68, dmg: 14 * b.dmgMult, color: '#A855F7' });
      }
    } else if (this.pattern === 'mirage_clones') {
      this.duration = 0.72;
      sound.special();
      const offsets = [-160, 0, 160];
      for (const off of offsets) {
        const cx = Math.max(ARENA_LEFT + 70, Math.min(ARENA_RIGHT - 70, player.x + off));
        this.clones.push({ x: cx, y: GROUND_Y, facing: player.x >= cx ? 1 : -1, life: 0.68, hitDone: false });
      }
    } else if (this.pattern === 'gm_iaido') {
      this.duration = 0.42;
      b.vx = dir * 980;
      b.startAttack('heavy', sound);
      particles.spawnRing(b.x, b.y - 52, 85, '#FFFFFF', 4);
    } else if (this.pattern === 'gm_rune_pillars') {
      this.duration = 0.55;
      sound.hazard();
      for (const t of this.telegraphs) {
        particles.spawnRing(t.x, GROUND_Y - 12, 70, '#F59E0B', 5);
        if (Math.abs(player.x - t.x) < 46 && player.y > GROUND_Y - 140 && player.iframeTimer <= 0) {
          onBossHitPlayer(20 * b.dmgMult, dir * 260, -300, dir, true);
        }
      }
    } else if (this.pattern === 'gm_eclipse') {
      this.duration = 0.85;
      b.startSpecial(sound);
      this.spawnTitanShockwave(b.x, 1, b.dmgMult * 1.1, particles, sound);
      this.spawnTitanShockwave(b.x, -1, b.dmgMult * 1.1, particles, sound);
    }

    this.telegraphs = [];
  }

  updateExecute(dt, player, particles, sound, onBossHitPlayer) {
    const b = this.boss;
    const dir = player.x >= b.x ? 1 : -1;

    if ((this.pattern === 'kuro_combo' || this.pattern === 'gm_combo') && !b.isAttacking() && this.comboStep < 3) {
      this.comboStep++;
      b.facing = dir;
      b.startAttack(this.comboStep === 3 ? 'heavy' : 'light', sound);
    }

    if (this.pattern === 'kuro_tornado') {
      // Gentle pull inward + spin damage
      const dist = Math.abs(player.x - b.x);
      if (dist < 220 && dist > 45) {
        player.x += Math.sign(b.x - player.x) * 165 * dt;
      }
      if (Math.floor(this.timer * 10) > Math.floor((this.timer - dt) * 10)) {
        particles.spawnRing(b.x, b.y - 50, 125, '#EF4444', 3, 0.2);
        if (dist < 130 && player.iframeTimer <= 0) {
          onBossHitPlayer(9 * b.dmgMult, dir * 180, -240, dir, false);
        }
      }
    }

    if (this.pattern === 'gale_cyclone_dive' && b.grounded && this.comboStep === 0) {
      this.comboStep = 1;
      sound.hazard();
      particles.spawnDust(b.x, GROUND_Y, 14, 0);
      particles.spawnRing(b.x, GROUND_Y - 12, 135, '#22D3EE', 5);
      if (Math.abs(player.x - b.x) < 135 && player.iframeTimer <= 0) {
        // Wind pushback toward edges
        const edgeDir = player.x >= b.x ? 1 : -1;
        onBossHitPlayer(18 * b.dmgMult, edgeDir * 460, -220, edgeDir, true);
      }
    }
  }

  spawnTitanShockwave(x, dir, dmgMult, particles, sound) {
    sound.hazard();
    particles.spawnDust(x, GROUND_Y, 12, dir);
    this.shockwaves.push({
      x,
      y: GROUND_Y,
      vx: dir * 470,
      radius: 26,
      dmg: 18 * dmgMult,
      color: '#F97316',
      life: 1.8,
    });
  }

  updateEntities(dt, player, particles, sound, onBossHitPlayer) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.y >= GROUND_Y && pr.kind === 'slag') {
        particles.spawnDirectionalSparks(pr.x, GROUND_Y - 8, 0, 8, '#EF4444');
        this.projectiles.splice(i, 1);
        continue;
      }
      if (pr.life <= 0 || pr.x < ARENA_LEFT - 60 || pr.x > ARENA_RIGHT + 60) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (player.state !== STATES.DEAD && player.iframeTimer <= 0) {
        const px = player.x;
        const py = player.y - 52;
        if (Math.hypot(px - pr.x, py - pr.y) < pr.radius + 22) {
          onBossHitPlayer(pr.dmg, Math.sign(pr.vx || 1) * 200, -120, Math.sign(pr.vx || 1), false);
          particles.spawnDirectionalSparks(pr.x, pr.y, Math.sign(pr.vx || 1), 8, pr.color);
          this.projectiles.splice(i, 1);
        }
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      sw.x += sw.vx * dt;
      if (sw.life <= 0 || sw.x < ARENA_LEFT - 30 || sw.x > ARENA_RIGHT + 30) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      if (player.state !== STATES.DEAD && player.iframeTimer <= 0) {
        if (Math.abs(player.x - sw.x) < 28 && player.y > GROUND_Y - 46) {
          onBossHitPlayer(sw.dmg, Math.sign(sw.vx) * 290, -240, Math.sign(sw.vx), true);
          this.shockwaves.splice(i, 1);
        }
      }
    }

    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.timer -= dt;
      if (d.timer <= 0) {
        sound.hazard();
        particles.spawnRing(d.x, d.y, d.radius, d.color, 5);
        particles.spawnRadialSparks(d.x, d.y, 14, d.color);
        if (player.state !== STATES.DEAD && player.iframeTimer <= 0 && Math.hypot(player.x - d.x, (player.y - 50) - d.y) < d.radius) {
          const dir = player.x >= d.x ? 1 : -1;
          onBossHitPlayer(d.dmg, dir * 320, -180, dir, true);
        }
        this.decoys.splice(i, 1);
      }
    }

    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      c.life -= dt;
      if (!c.hitDone && c.life <= 0.35) {
        c.hitDone = true;
        particles.spawnDirectionalSparks(c.x + c.facing * 45, c.y - 55, c.facing, 8, '#E879F9');
        if (player.state !== STATES.DEAD && player.iframeTimer <= 0 && Math.abs(player.x - c.x) < 88 && player.y > GROUND_Y - 110) {
          onBossHitPlayer(15 * this.boss.dmgMult, c.facing * 240, -140, c.facing, true);
        }
      }
      if (c.life <= 0) this.clones.splice(i, 1);
    }
  }
}
