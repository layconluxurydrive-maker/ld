import { ARENA_LEFT, ARENA_RIGHT, GROUND_Y, STATES, WORLD_WIDTH } from './constants.js';

export class HazardManager {
  constructor() {
    this.actId = 1;
    this.crates = [];
    this.platforms = [];
    this.pendulums = [];
    this.steamVents = [];
    this.runeWaves = [];
    this.pitfallEnabled = false;
    this.shadowFogEnabled = false;
    this.waveTimer = 4.2;
    this.hitCooldowns = new Map();
  }

  setupForAct(actId, isBoss = false) {
    this.actId = actId;
    this.crates = [];
    this.platforms = [];
    this.pendulums = [];
    this.steamVents = [];
    this.runeWaves = [];
    this.pitfallEnabled = false;
    this.shadowFogEnabled = false;
    this.waveTimer = 4.0;
    this.hitCooldowns.clear();

    if (actId === 1) {
      // Act 1: Breakable Dojo Training Crates
      const xs = isBoss ? [210, WORLD_WIDTH - 210] : [360, 640, 920];
      xs.forEach((x, idx) => {
        this.crates.push({
          id: `crate_${idx}`,
          x,
          y: GROUND_Y,
          w: 44,
          h: 44,
          hp: 25,
          broken: false,
          flash: 0,
        });
      });
    } else if (actId === 2) {
      // Act 2: Multi-tier Neon Rooftop platforms + Pitfall edge warnings
      this.pitfallEnabled = true;
      this.platforms = [
        { x: 240, y: GROUND_Y - 125, w: 220, phasing: false, phaseTimer: 0, solid: true },
        { x: 540, y: GROUND_Y - 210, w: 200, phasing: false, phaseTimer: 0, solid: true },
        { x: 820, y: GROUND_Y - 125, w: 220, phasing: false, phaseTimer: 0, solid: true },
      ];
    } else if (actId === 3) {
      // Act 3: Swinging Foundry Pendulum + Timed Steam Vents
      this.pendulums = [
        { pivotX: WORLD_WIDTH * 0.5, pivotY: 130, len: 315, angle: 0, phase: 0, speed: 2.1, maxAngle: 0.72, radius: 22, x: WORLD_WIDTH * 0.5, y: 445 },
      ];
      this.steamVents = [
        { x: 350, w: 68, timer: 1.5, cycle: 4.8, state: 'idle' },
        { x: 930, w: 68, timer: 3.8, cycle: 4.8, state: 'idle' },
      ];
    } else if (actId === 4) {
      // Act 4: Disappearing Spirit Platforms + Dim Shadow-Fog edges
      this.shadowFogEnabled = true;
      this.platforms = [
        { x: 260, y: GROUND_Y - 130, w: 200, phasing: true, phaseTimer: 0, cycle: 5.5, solid: true, warning: false },
        { x: 540, y: GROUND_Y - 205, w: 200, phasing: true, phaseTimer: 2.7, cycle: 5.5, solid: true, warning: false },
        { x: 820, y: GROUND_Y - 130, w: 200, phasing: true, phaseTimer: 0, cycle: 5.5, solid: true, warning: false },
      ];
    } else if (actId === 5) {
      // Act 5: Combined elevated platforms + steam/rune floor waves
      this.platforms = [
        { x: 250, y: GROUND_Y - 135, w: 190, phasing: false, solid: true },
        { x: 840, y: GROUND_Y - 135, w: 190, phasing: false, solid: true },
      ];
      this.steamVents = [
        { x: 640, w: 80, timer: 2.2, cycle: 5.2, state: 'idle' },
      ];
    }
  }

  canHitFighter(fighter, key, cooldown = 0.85) {
    const k = `${fighter.id}_${key}`;
    const rem = this.hitCooldowns.get(k) || 0;
    if (rem > 0) return false;
    this.hitCooldowns.set(k, cooldown);
    return true;
  }

  update(dt, fighters, player, particles, sound, onLootDrop) {
    for (const [k, v] of this.hitCooldowns.entries()) {
      if (v - dt <= 0) this.hitCooldowns.delete(k);
      else this.hitCooldowns.set(k, v - dt);
    }

    // Crates flash & player attack collision
    for (const crate of this.crates) {
      if (crate.broken) continue;
      if (crate.flash > 0) crate.flash = Math.max(0, crate.flash - dt);

      const pHit = player && player.state !== STATES.DEAD ? player.getActiveHitbox() : null;
      if (pHit) {
        const cx = crate.x - crate.w * 0.5;
        const cy = crate.y - crate.h;
        if (pHit.x < cx + crate.w && pHit.x + pHit.w > cx && pHit.y < cy + crate.h && pHit.y + pHit.h > cy) {
          crate.hp -= pHit.dmg;
          crate.flash = 0.1;
          particles.spawnDirectionalSparks(crate.x, crate.y - 24, player.facing, 6, '#D97706', 0.8);
          if (crate.hp <= 0) {
            crate.broken = true;
            sound.hazard();
            particles.spawnDust(crate.x, GROUND_Y, 10, 0);
            if (onLootDrop) onLootDrop(crate.x, GROUND_Y - 20);
          }
        }
      }
    }

    // Phasing Platforms (Act 4)
    for (const plat of this.platforms) {
      if (!plat.phasing) continue;
      plat.phaseTimer = (plat.phaseTimer + dt) % plat.cycle;
      // 0..3.0 solid, 3.0..3.75 warning flicker, 3.75..5.5 gone
      if (plat.phaseTimer < 3.0) {
        plat.solid = true;
        plat.warning = false;
      } else if (plat.phaseTimer < 3.75) {
        plat.solid = true;
        plat.warning = true;
      } else {
        plat.solid = false;
        plat.warning = false;
      }
    }

    // Swinging Pendulums (Act 3)
    for (let i = 0; i < this.pendulums.length; i++) {
      const pend = this.pendulums[i];
      pend.phase += dt * pend.speed;
      pend.angle = Math.sin(pend.phase) * pend.maxAngle;
      pend.x = pend.pivotX + Math.sin(pend.angle) * pend.len;
      pend.y = pend.pivotY + Math.cos(pend.angle) * pend.len;

      for (const f of fighters) {
        if (f.state === STATES.DEAD || f.iframeTimer > 0) continue;
        const fx = f.x;
        const fy = f.y - 54 * f.scale;
        if (Math.hypot(fx - pend.x, fy - pend.y) < pend.radius + 20 * f.scale) {
          if (this.canHitFighter(f, `pend_${i}`, 0.9)) {
            const dir = Math.cos(pend.phase) >= 0 ? 1 : -1;
            f.applyDamage(12, 340, -180, dir, true);
            sound.hazard();
            particles.spawnDirectionalSparks(fx, fy, dir, 10, '#FB923C');
            particles.spawnText(fx, fy - 36, 'CLANG!', '#FB923C', 16);
          }
        }
      }
    }

    // Timed Steam Vents (Acts 3 & 5)
    for (let i = 0; i < this.steamVents.length; i++) {
      const v = this.steamVents[i];
      v.timer = (v.timer + dt) % v.cycle;
      // 0..cycle-1.45 idle, cycle-1.45..cycle-0.75 telegraph (0.7s), cycle-0.75..cycle erupt
      const tTel = v.cycle - 1.45;
      const tErupt = v.cycle - 0.75;
      const prevState = v.state;
      v.state = v.timer >= tErupt ? 'erupt' : v.timer >= tTel ? 'telegraph' : 'idle';
      if (v.state === 'erupt' && prevState !== 'erupt') {
        sound.hazard();
        particles.spawnDust(v.x, GROUND_Y, 8, 0);
      }

      if (v.state === 'erupt') {
        for (const f of fighters) {
          if (f.state === STATES.DEAD || f.iframeTimer > 0) continue;
          if (Math.abs(f.x - v.x) < v.w * 0.55 && f.y > GROUND_Y - 125) {
            if (this.canHitFighter(f, `vent_${i}`, 0.8)) {
              const dir = f.x >= v.x ? 1 : -1;
              f.applyDamage(10, 220, -340, dir, false);
              particles.spawnDirectionalSparks(f.x, f.y - 45, 0, 8, '#FED7AA');
              particles.spawnText(f.x, f.y - 96, 'SCALD!', '#FB923C', 15);
            }
          }
        }
      }
    }

    // Act 5 Citadel Rune Floor Waves
    if (this.actId === 5) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveTimer = 5.4;
        const fromLeft = Math.random() < 0.5;
        this.runeWaves.push({
          x: fromLeft ? ARENA_LEFT + 20 : ARENA_RIGHT - 20,
          vx: fromLeft ? 410 : -410,
          telegraph: 0.65,
          life: 3.4,
        });
        sound.telegraph();
      }
    }

    for (let i = this.runeWaves.length - 1; i >= 0; i--) {
      const rw = this.runeWaves[i];
      if (rw.telegraph > 0) {
        rw.telegraph -= dt;
        continue;
      }
      rw.life -= dt;
      rw.x += rw.vx * dt;
      if (rw.life <= 0 || rw.x < ARENA_LEFT - 40 || rw.x > ARENA_RIGHT + 40) {
        this.runeWaves.splice(i, 1);
        continue;
      }

      for (const f of fighters) {
        if (f.state === STATES.DEAD || f.iframeTimer > 0) continue;
        if (Math.abs(f.x - rw.x) < 26 && f.y > GROUND_Y - 46) {
          if (this.canHitFighter(f, 'runewave', 0.7)) {
            const dir = Math.sign(rw.vx);
            f.applyDamage(14, 300, -210, dir, true);
            sound.hazard();
            particles.spawnRing(rw.x, GROUND_Y - 12, 48, '#FBBF24', 3);
          }
        }
      }
    }

    // Act 2 Pitfall Edge Warnings + Clean Respawn & Act 4 Shadow Fog Edge Zone
    for (const f of fighters) {
      if (f.state === STATES.DEAD) continue;
      const inEdgeZone = f.x <= ARENA_LEFT + 38 || f.x >= ARENA_RIGHT - 38;
      if (this.pitfallEnabled && inEdgeZone && f.y >= GROUND_Y - 10) {
        if (this.canHitFighter(f, 'pitfall', 1.15)) {
          const pushDir = f.x < WORLD_WIDTH * 0.5 ? 1 : -1;
          f.applyDamage(12, 340, -390, pushDir, false);
          f.x = f.x < WORLD_WIDTH * 0.5 ? ARENA_LEFT + 95 : ARENA_RIGHT - 95;
          sound.hazard();
          particles.spawnText(f.x, f.y - 105, 'EDGE FALL!', '#38BDF8', 16);
        }
      } else if (this.shadowFogEnabled && inEdgeZone) {
        if (this.canHitFighter(f, 'shadowfog', 0.95)) {
          f.hp = Math.max(1, f.hp - 5);
          particles.spawnDirectionalSparks(f.x, f.y - 50, 0, 5, '#34D399', 0.5, 'wisp');
        }
      }
    }
  }

  getSolidPlatforms() {
    return this.platforms.filter((p) => p.solid);
  }
}
