import {
  ARENA_LEFT,
  ARENA_RIGHT,
  COMBO_RESET_TIME,
  COYOTE_TIME,
  GRAVITY,
  GROUND_Y,
  INPUT_BUFFER_TIME,
  JUMP_BUFFER_TIME,
  PARRY_WINDOW,
  PRORATION_MIN,
  PRORATION_STEP,
  STATES,
} from './constants.js';
import { ScarfChain } from './ragdoll.js';
import { WEAPON_MAP } from './weapons.js';

let swingCounter = 1;

export class Fighter {
  constructor(cfg) {
    this.id = cfg.id;
    this.isPlayer = Boolean(cfg.isPlayer);
    this.name = cfg.name || 'Fighter';
    this.title = cfg.title || '';
    this.archetype = cfg.archetype || 'player';
    this.bossId = cfg.bossId || null;
    this.isElite = Boolean(cfg.isElite);
    this.scale = cfg.scale || 1.0;

    this.x = cfg.x;
    this.y = cfg.y ?? GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = cfg.facing ?? 1;

    this.weapon = WEAPON_MAP[cfg.weaponId || 'fists'] || WEAPON_MAP.fists;
    this.weaponTier = cfg.weaponTier || 1;
    this.maxHp = cfg.maxHp || 120;
    this.hp = this.maxHp;
    this.maxGuard = cfg.maxGuard || 100;
    this.guard = this.maxGuard;
    this.special = 0;

    this.dmgMult = cfg.dmgMult ?? 1.0;
    this.speedMult = cfg.speedMult ?? 1.0;
    this.dashCooldownMult = cfg.dashCooldownMult ?? 1.0;
    this.meterGainMult = cfg.meterGainMult ?? 1.0;
    this.guardRegenMult = cfg.guardRegenMult ?? 1.0;
    this.damageTakenMult = cfg.damageTakenMult ?? 1.0;
    this.parryWindowBonus = cfg.parryWindowBonus ?? 0;
    this.dashIframeBonus = cfg.dashIframeBonus ?? 0;
    this.hasHealingScroll = Boolean(cfg.hasHealingScroll);
    this.healingScrollUsed = false;

    this.style = {
      ink: cfg.inkColor || '#0D0E12',
      scarf: cfg.scarfColor || '#E63946',
      eye: cfg.eyeColor || '#FF4D5A',
      glow: cfg.glowColor || '#FF4D5A',
      spark: cfg.sparkColor || cfg.trailColor || this.weapon.trailColor,
      trail: cfg.trailColor || this.weapon.trailColor,
      trailCore: cfg.trailCore || this.weapon.trailCore,
    };

    this.state = STATES.IDLE;
    this.stateTimer = 0;
    this.stateDuration = 0;

    this.grounded = this.y >= GROUND_Y - 0.5;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.dropThroughTimer = 0;

    this.dashCooldown = 0;
    this.iframeTimer = 0;
    this.parryTimer = 0;
    this.hitFlashTimer = 0;
    this.hitFlashColor = '#FFFFFF';
    this.guardBreakCooldown = 0;

    this.comboCount = 0;
    this.comboTimer = 0;
    this.maxComboReached = 0;
    this.bufferedAction = null;
    this.bufferedTimer = 0;

    this.currentMove = null;
    this.currentSwingId = 0;
    this.hitSwingIds = new Set();
    this.specialHitsDone = 0;

    this.animTime = Math.random() * 10;
    this.scarf = new ScarfChain(this.x, this.y - 76 * this.scale, 6, 9 * this.scale);
    this.afterimages = [];
    this.weaponTrail = [];

    // Boss & elite state flags
    this.enraged = false;
    this.superArmor = false;
    this.counterStance = false;
    this.bossPhase = 1;
    this.hitsTakenCount = 0;
    this.visualWeaponOverride = null; // e.g. 'war_hammer'
  }

  get moveSpeed() {
    return 375 * this.speedMult;
  }

  get jumpVelocity() {
    return -800;
  }

  setWeapon(weaponId) {
    const w = WEAPON_MAP[weaponId];
    if (!w) return;
    this.weapon = w;
    this.style.trail = w.trailColor;
    this.style.trailCore = w.trailCore;
  }

  canAct() {
    return (
      this.state === STATES.IDLE ||
      this.state === STATES.MOVE ||
      this.state === STATES.JUMP ||
      this.state === STATES.FALL ||
      this.state === STATES.BLOCK
    );
  }

  isAttacking() {
    return (
      this.state === STATES.LIGHT_1 ||
      this.state === STATES.LIGHT_2 ||
      this.state === STATES.LIGHT_3 ||
      this.state === STATES.HEAVY ||
      this.state === STATES.AIR_ATTACK ||
      this.state === STATES.SPECIAL
    );
  }

  queueAction(action) {
    this.bufferedAction = action;
    this.bufferedTimer = INPUT_BUFFER_TIME;
  }

  requestJump(dropThrough = false) {
    if (dropThrough && this.grounded && this.y < GROUND_Y - 5) {
      this.dropThroughTimer = 0.25;
      this.grounded = false;
      this.y += 4;
      return;
    }
    this.jumpBufferTimer = JUMP_BUFFER_TIME;
  }

  tryExecuteJump(sound) {
    if (this.jumpBufferTimer <= 0) return false;
    if (this.state === STATES.HITSTUN || this.state === STATES.STAGGERED || this.state === STATES.DEAD || this.state === STATES.SPECIAL) {
      return false;
    }
    if (this.grounded || this.coyoteTimer > 0) {
      this.vy = this.jumpVelocity;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      if (!this.isAttacking()) {
        this.state = STATES.JUMP;
      }
      if (sound) sound.jump();
      return true;
    }
    return false;
  }

  startDash(dir) {
    if (this.dashCooldown > 0) return false;
    if (this.state === STATES.HITSTUN || this.state === STATES.STAGGERED || this.state === STATES.DEAD || this.state === STATES.SPECIAL) {
      return false;
    }
    const dashDir = dir !== 0 ? Math.sign(dir) : this.facing;
    this.facing = dashDir;
    this.state = STATES.DASH;
    this.stateTimer = 0;
    this.stateDuration = 0.19;
    this.vx = dashDir * 860 * this.speedMult;
    this.vy = Math.min(this.vy, 0) * 0.25;
    this.iframeTimer = 0.20 + this.dashIframeBonus;
    this.dashCooldown = 0.42 * this.dashCooldownMult;
    this.currentMove = null;
    this.bufferedAction = null;
    return true;
  }

  startBlock() {
    if (this.guardBreakCooldown > 0 || this.guard <= 5) return false;
    if (!this.canAct()) return false;
    if (this.state !== STATES.BLOCK) {
      this.state = STATES.BLOCK;
      this.stateTimer = 0;
      this.parryTimer = PARRY_WINDOW + this.parryWindowBonus;
    }
    return true;
  }

  stopBlock() {
    if (this.state === STATES.BLOCK) {
      this.state = this.grounded ? STATES.IDLE : STATES.FALL;
      this.parryTimer = 0;
    }
  }

  startAttack(type, sound) {
    if (this.state === STATES.HITSTUN || this.state === STATES.STAGGERED || this.state === STATES.DEAD || this.state === STATES.SPECIAL) {
      return false;
    }

    if (!this.grounded && (type === 'light' || type === 'heavy') && this.canAct()) {
      return this.enterMoveState(STATES.AIR_ATTACK, 'AIR_ATTACK', sound);
    }

    if (this.isAttacking()) {
      const m = this.currentMove;
      const inCancelWindow = m && this.stateTimer >= (m.windup + m.active * 0.85);
      if (!inCancelWindow) {
        this.queueAction(type);
        return false;
      }
      if (type === 'light') {
        if (this.state === STATES.LIGHT_1) return this.enterMoveState(STATES.LIGHT_2, 'LIGHT_2', sound);
        if (this.state === STATES.LIGHT_2) return this.enterMoveState(STATES.LIGHT_3, 'LIGHT_3', sound);
      } else if (type === 'heavy') {
        if (this.state === STATES.LIGHT_1 || this.state === STATES.LIGHT_2) {
          return this.enterMoveState(STATES.HEAVY, 'HEAVY', sound);
        }
      }
      this.queueAction(type);
      return false;
    }

    if (!this.canAct() && this.state !== STATES.DASH) {
      this.queueAction(type);
      return false;
    }

    if (type === 'heavy') {
      return this.enterMoveState(STATES.HEAVY, 'HEAVY', sound);
    }
    return this.enterMoveState(STATES.LIGHT_1, 'LIGHT_1', sound);
  }

  enterMoveState(stateName, moveKey, sound) {
    const baseMove = this.weapon.moves[moveKey];
    if (!baseMove) return false;
    const speed = this.weapon.speed;
    this.state = stateName;
    this.stateTimer = 0;
    this.currentMove = {
      ...baseMove,
      windup: baseMove.windup / speed,
      active: baseMove.active / speed,
      recovery: baseMove.recovery / speed,
      key: moveKey,
    };
    this.stateDuration = this.currentMove.windup + this.currentMove.active + this.currentMove.recovery;
    this.currentSwingId = ++swingCounter;
    this.vx = this.facing * baseMove.lunge;
    this.bufferedAction = null;
    if (sound) sound.swing(moveKey === 'HEAVY' || moveKey === 'LIGHT_3', this.weapon.id);
    return true;
  }

  startSpecial(sound) {
    if (!this.isPlayer && this.archetype !== 'boss') return false;
    if (this.isPlayer && this.special < 100) return false;
    if (this.state === STATES.HITSTUN || this.state === STATES.STAGGERED || this.state === STATES.DEAD || this.state === STATES.SPECIAL) {
      return false;
    }
    if (this.isPlayer) this.special = 0;
    this.state = STATES.SPECIAL;
    this.stateTimer = 0;
    this.stateDuration = this.weapon.finisher.duration;
    this.iframeTimer = this.weapon.finisher.duration + 0.08;
    this.specialHitsDone = 0;
    this.currentMove = null;
    this.vx = this.facing * 320;
    if (sound) sound.special();
    return true;
  }

  getActiveHitbox() {
    if (this.state === STATES.SPECIAL) {
      const fin = this.weapon.finisher;
      const step = fin.duration / fin.hits;
      const expectedHits = Math.floor(this.stateTimer / step) + 1;
      if (expectedHits > this.specialHitsDone && this.specialHitsDone < fin.hits) {
        this.specialHitsDone = expectedHits;
        const isLast = this.specialHitsDone === fin.hits;
        const reach = fin.range * this.scale;
        return {
          swingId: ++swingCounter,
          x: this.facing > 0 ? this.x - 20 : this.x - reach + 20,
          y: this.y - 108 * this.scale,
          w: reach + 20,
          h: 108 * this.scale,
          dmg: (22 * fin.damageMult * this.dmgMult) / fin.hits,
          guardDmg: 30,
          kbX: isLast ? 520 : 120,
          kbY: isLast ? -320 : -85,
          hitstop: isLast ? 0.095 : 0.032,
          heavy: isLast,
          isSpecial: true,
        };
      }
      return null;
    }

    if (!this.currentMove) return null;
    const m = this.currentMove;
    if (this.stateTimer >= m.windup && this.stateTimer <= m.windup + m.active) {
      const reach = m.reach * this.scale;
      const h = m.height * this.scale;
      return {
        swingId: this.currentSwingId,
        x: this.facing > 0 ? this.x + 6 : this.x - reach - 6,
        y: this.y - 88 * this.scale,
        w: reach,
        h,
        dmg: m.dmg * this.dmgMult,
        guardDmg: this.weapon.guardDamage * (m.key === 'HEAVY' ? 1.65 : 1),
        kbX: m.kbX,
        kbY: m.kbY,
        hitstop: m.hitstop,
        heavy: m.key === 'HEAVY' || m.key === 'LIGHT_3',
        isSpecial: false,
      };
    }
    return null;
  }

  getHurtbox() {
    const w = 36 * this.scale;
    const h = 98 * this.scale;
    return {
      x: this.x - w * 0.5,
      y: this.y - h,
      w,
      h,
    };
  }

  registerComboHit() {
    this.comboCount += 1;
    this.comboTimer = COMBO_RESET_TIME;
    if (this.comboCount > this.maxComboReached) {
      this.maxComboReached = this.comboCount;
    }
  }

  getProratedMultiplier() {
    return Math.max(PRORATION_MIN, 1 - this.comboCount * PRORATION_STEP);
  }

  applyDamage(rawDmg, kbX, kbY, attackerFacing, isHeavy, flashColor = '#FFFFFF') {
    const finalDmg = Math.max(1, Math.round(rawDmg * this.damageTakenMult));
    this.hp = Math.max(0, this.hp - finalDmg);
    this.hitsTakenCount += 1;
    this.hitFlashTimer = 0.095;
    this.hitFlashColor = flashColor;

    const hasPoise = (this.archetype === 'brute' || this.superArmor) && !isHeavy;
    if (!hasPoise) {
      this.vx = attackerFacing * kbX;
      if (kbY < 0 || !this.grounded) {
        this.vy = kbY;
        if (kbY < -80) this.grounded = false;
      }
    }

    let healTriggered = false;
    if (this.isPlayer && this.hasHealingScroll && !this.healingScrollUsed && this.hp > 0 && this.hp <= this.maxHp * 0.35) {
      this.healingScrollUsed = true;
      this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.4));
      healTriggered = true;
    }

    if (this.hp <= 0) {
      this.state = STATES.DEAD;
      this.currentMove = null;
      return { dmg: finalDmg, killed: true, healTriggered };
    }

    if (!hasPoise && this.archetype !== 'boss') {
      this.state = STATES.HITSTUN;
      this.stateTimer = 0;
      this.stateDuration = isHeavy ? 0.34 : 0.21;
      this.currentMove = null;
      this.bufferedAction = null;
    } else if (!hasPoise && this.archetype === 'boss' && isHeavy && this.state === STATES.IDLE) {
      this.state = STATES.HITSTUN;
      this.stateTimer = 0;
      this.stateDuration = 0.16;
    }
    return { dmg: finalDmg, killed: false, healTriggered };
  }

  update(dt, moveInputX, blockHeld, sound, platforms = []) {
    this.animTime += dt;
    this.stateTimer += dt;
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.iframeTimer > 0) this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    if (this.parryTimer > 0) this.parryTimer = Math.max(0, this.parryTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.guardBreakCooldown > 0) this.guardBreakCooldown = Math.max(0, this.guardBreakCooldown - dt);
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (this.dropThroughTimer > 0) this.dropThroughTimer = Math.max(0, this.dropThroughTimer - dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    if (this.bufferedTimer > 0) {
      this.bufferedTimer -= dt;
      if (this.bufferedTimer <= 0) this.bufferedAction = null;
    }

    if (this.state !== STATES.BLOCK && this.state !== STATES.STAGGERED && this.guard < this.maxGuard) {
      this.guard = Math.min(this.maxGuard, this.guard + 24 * this.guardRegenMult * dt);
    }

    if (this.grounded) {
      this.coyoteTimer = COYOTE_TIME;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    this.tryExecuteJump(sound);

    if (this.bufferedAction && this.canAct()) {
      const act = this.bufferedAction;
      this.bufferedAction = null;
      if (act === 'dash') {
        if (this.startDash(moveInputX) && sound) sound.dash();
      } else if (act === 'light' || act === 'heavy') {
        this.startAttack(act, sound);
      }
    }

    if (this.state === STATES.DASH) {
      if (Math.floor(this.stateTimer * 60) % 2 === 0) {
        this.afterimages.push({
          x: this.x,
          y: this.y,
          facing: this.facing,
          life: 0.16,
          joints: this.computeJoints(),
        });
      }
      if (this.stateTimer >= this.stateDuration) {
        this.vx *= 0.45;
        this.state = this.grounded ? STATES.IDLE : STATES.FALL;
      }
    } else if (this.state === STATES.SPECIAL) {
      if (Math.floor(this.stateTimer * 60) % 2 === 0) {
        this.afterimages.push({
          x: this.x,
          y: this.y,
          facing: this.facing,
          life: 0.22,
          joints: this.computeJoints(),
        });
      }
      this.vx *= Math.pow(0.06, dt);
      if (this.stateTimer >= this.stateDuration) {
        this.state = this.grounded ? STATES.IDLE : STATES.FALL;
      }
    } else if (this.isAttacking()) {
      if (this.bufferedAction && this.currentMove) {
        const m = this.currentMove;
        if (this.stateTimer >= m.windup + m.active * 0.85) {
          const act = this.bufferedAction;
          if (act === 'dash') {
            this.bufferedAction = null;
            if (this.startDash(moveInputX) && sound) sound.dash();
          } else if (act === 'light' || act === 'heavy') {
            this.startAttack(act, sound);
          }
        }
      }
      this.vx *= Math.pow(0.015, dt);
      if (this.stateTimer >= this.stateDuration) {
        this.currentMove = null;
        this.state = this.grounded ? STATES.IDLE : STATES.FALL;
      }
    } else if (this.state === STATES.HITSTUN || this.state === STATES.STAGGERED || this.state === STATES.PARRY_SUCCESS) {
      this.vx *= Math.pow(0.04, dt);
      if (this.stateTimer >= this.stateDuration) {
        this.state = this.grounded ? STATES.IDLE : STATES.FALL;
      }
    } else if (this.state === STATES.BLOCK) {
      this.vx *= Math.pow(0.02, dt);
      if (moveInputX !== 0) this.facing = Math.sign(moveInputX);
      if (!blockHeld || this.guard <= 0) {
        this.stopBlock();
      }
    } else if (this.archetype !== 'boss' || this.canAct()) {
      if (blockHeld && this.grounded && this.guardBreakCooldown <= 0 && this.guard > 5) {
        this.startBlock();
      } else {
        const targetVx = moveInputX * this.moveSpeed;
        const accel = this.grounded ? 2600 : 1700;
        if (this.vx < targetVx) this.vx = Math.min(targetVx, this.vx + accel * dt);
        else if (this.vx > targetVx) this.vx = Math.max(targetVx, this.vx - accel * dt);

        if (moveInputX !== 0) this.facing = Math.sign(moveInputX);

        if (!this.grounded) {
          this.state = this.vy < 0 ? STATES.JUMP : STATES.FALL;
        } else {
          this.state = Math.abs(moveInputX) > 0.1 ? STATES.MOVE : STATES.IDLE;
        }
      }
    }

    const prevY = this.y;
    if (!this.grounded || this.vy < 0) {
      const gravScale = this.state === STATES.DASH ? 0.2 : 1;
      this.vy += GRAVITY * gravScale * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Jump-through platform landing
    let landedOnPlatform = false;
    if (this.vy >= 0 && this.dropThroughTimer <= 0 && platforms.length > 0) {
      for (const plat of platforms) {
        if (this.x >= plat.x - 10 && this.x <= plat.x + plat.w + 10) {
          if (prevY <= plat.y + 8 && this.y >= plat.y) {
            this.y = plat.y;
            this.vy = 0;
            this.grounded = true;
            landedOnPlatform = true;
            break;
          }
        }
      }
    }

    if (!landedOnPlatform) {
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.grounded = true;
      } else if (this.grounded) {
        // Check if walked off elevated platform
        const stillOnPlat = platforms.some((p) => this.y === p.y && this.x >= p.x - 10 && this.x <= p.x + p.w + 10);
        if (!stillOnPlat) {
          this.grounded = false;
        }
      }
    }

    if (this.grounded && (this.state === STATES.FALL || this.state === STATES.JUMP || this.state === STATES.AIR_ATTACK)) {
      if (this.state === STATES.AIR_ATTACK) this.currentMove = null;
      this.state = STATES.IDLE;
    }

    if (this.x < ARENA_LEFT) {
      this.x = ARENA_LEFT;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x > ARENA_RIGHT) {
      this.x = ARENA_RIGHT;
      if (this.vx > 0) this.vx = 0;
    }

    const joints = this.computeJoints();
    this.scarf.update(joints.neck.x, joints.neck.y, this.facing, -this.vx * 0.2, dt);

    if (this.isAttacking() && this.weaponTip) {
      const active =
        this.state === STATES.SPECIAL ||
        (this.currentMove && this.stateTimer >= this.currentMove.windup * 0.7 && this.stateTimer <= this.currentMove.windup + this.currentMove.active);
      if (active) {
        this.weaponTrail.push({ x: this.weaponTip.x, y: this.weaponTip.y, life: 0.16 });
      }
    }
    for (let i = this.weaponTrail.length - 1; i >= 0; i--) {
      this.weaponTrail[i].life -= dt;
      if (this.weaponTrail[i].life <= 0) this.weaponTrail.splice(i, 1);
    }
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life -= dt;
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
    }
  }

  computeJoints() {
    const s = this.scale;
    const f = this.facing;
    const bob =
      this.state === STATES.IDLE
        ? Math.sin(this.animTime * 4.5) * 2.5
        : this.state === STATES.MOVE
        ? Math.abs(Math.sin(this.animTime * 13)) * -4
        : 0;

    let lean = 0;
    let hipY = this.y - 46 * s + bob;
    let armL = [-0.65, 0.85];
    let armR = [0.55, -0.95];
    let legL = [-0.28, 0.35];
    let legR = [0.36, 0.25];

    if (this.counterStance) {
      // Sensei Kuro vertical staff raise stance
      lean = -0.08;
      armR = [1.45, -1.5];
      armL = [0.95, -1.2];
      legL = [-0.38, 0.4];
      legR = [0.42, 0.3];
    } else if (this.state === STATES.MOVE) {
      const cycle = this.animTime * 12;
      lean = 0.22;
      legL = [Math.sin(cycle) * 0.65, Math.max(0.1, Math.cos(cycle) * 0.75)];
      legR = [-Math.sin(cycle) * 0.65, Math.max(0.1, -Math.cos(cycle) * 0.75)];
      armL = [-0.4 - Math.sin(cycle) * 0.5, 0.9];
      armR = [0.4 + Math.sin(cycle) * 0.45, -0.8];
    } else if (this.state === STATES.JUMP || this.state === STATES.FALL) {
      lean = 0.12;
      legL = [-0.45, 0.95];
      legR = [0.25, 0.75];
      armL = [-0.9, 0.6];
      armR = [0.7, -0.7];
    } else if (this.state === STATES.DASH) {
      lean = 0.58;
      hipY += 6 * s;
      legL = [-0.8, 0.6];
      legR = [0.6, 0.8];
      armL = [-1.1, 0.3];
      armR = [-0.8, 0.4];
    } else if (this.state === STATES.BLOCK) {
      lean = -0.1;
      hipY += 5 * s;
      armL = [0.45, -1.45];
      armR = [0.75, -1.3];
      legL = [-0.4, 0.45];
      legR = [0.45, 0.35];
    } else if (this.state === STATES.HITSTUN || this.state === STATES.STAGGERED) {
      lean = -0.38;
      armL = [-0.9, 0.4];
      armR = [0.9, 0.4];
      legL = [-0.3, 0.4];
      legR = [0.35, 0.3];
    } else if (this.state === STATES.SPECIAL) {
      const p = (this.stateTimer * 18) % (Math.PI * 2);
      lean = 0.4;
      armR = [Math.cos(p) * 1.4, -0.2];
      armL = [-0.8 + Math.sin(p) * 0.5, 0.6];
      legL = [-0.5, 0.5];
      legR = [0.55, 0.3];
    } else if (this.isAttacking() && this.currentMove) {
      const m = this.currentMove;
      const t = this.stateTimer;
      let swingP = 0;
      if (t < m.windup) {
        swingP = -0.35 * (t / Math.max(0.01, m.windup));
      } else if (t < m.windup + m.active) {
        swingP = (t - m.windup) / Math.max(0.01, m.active);
      } else {
        swingP = 1;
      }
      const arcStart = m.arc ? m.arc[0] : -1.1;
      const arcEnd = m.arc ? m.arc[1] : 0.9;
      const angle = arcStart + (arcEnd - arcStart) * Math.max(0, Math.min(1, swingP + 0.25));
      lean = 0.28 + Math.max(0, swingP) * 0.16;
      armR = [1.05 + angle * 0.85, -0.25];
      armL = [-0.65, 0.85];
      legL = [-0.48, 0.55];
      legR = [0.54, 0.3];
    }

    const torsoAngle = lean * f;
    const hip = { x: this.x, y: hipY };
    const torsoLen = 33 * s;
    const neck = {
      x: hip.x + Math.sin(torsoAngle) * torsoLen,
      y: hip.y - Math.cos(torsoAngle) * torsoLen,
    };
    const head = {
      x: neck.x + Math.sin(torsoAngle * 0.7) * 13 * s,
      y: neck.y - Math.cos(torsoAngle * 0.7) * 13 * s,
    };

    const limbPos = (origin, a1, a2, l1, l2) => {
      const worldA1 = a1 * f;
      const joint = {
        x: origin.x + Math.sin(worldA1) * l1 * s,
        y: origin.y + Math.cos(worldA1) * l1 * s,
      };
      const worldA2 = (a1 + a2) * f;
      const end = {
        x: joint.x + Math.sin(worldA2) * l2 * s,
        y: joint.y + Math.cos(worldA2) * l2 * s,
      };
      return { joint, end };
    };

    const L_arm = limbPos(neck, armL[0], armL[1], 18, 17);
    const R_arm = limbPos(neck, armR[0], armR[1], 19, 18);
    const L_leg = limbPos(hip, legL[0], legL[1], 23, 23);
    const R_leg = limbPos(hip, legR[0], legR[1], 23, 23);

    if (this.grounded) {
      L_leg.end.y = Math.min(this.y, L_leg.end.y);
      R_leg.end.y = Math.min(this.y, R_leg.end.y);
    }

    const hand = R_arm.end;
    const elbow = R_arm.joint;
    const dirAngle = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
    const wLen = this.weapon.reach * 0.62 * s;
    this.weaponTip = {
      x: hand.x + Math.cos(dirAngle) * wLen,
      y: hand.y + Math.sin(dirAngle) * wLen,
      angle: dirAngle,
    };

    return {
      head,
      neck,
      hip,
      elbowL: L_arm.joint,
      handL: L_arm.end,
      elbowR: R_arm.joint,
      handR: R_arm.end,
      kneeL: L_leg.joint,
      footL: L_leg.end,
      kneeR: R_leg.joint,
      footR: R_leg.end,
      weaponAngle: dirAngle,
    };
  }
}
