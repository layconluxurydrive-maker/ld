import { ARCHETYPES, STATES } from './constants.js';

export class AttackTokenPool {
  constructor(maxTokens = 2) {
    this.maxTokens = maxTokens;
    this.holders = new Set();
  }

  request(enemyId) {
    if (this.holders.has(enemyId)) return true;
    if (this.holders.size < this.maxTokens) {
      this.holders.add(enemyId);
      return true;
    }
    return false;
  }

  release(enemyId) {
    this.holders.delete(enemyId);
  }

  clear() {
    this.holders.clear();
  }
}

export class EnemyAIController {
  constructor(enemy, tokenPool) {
    this.enemy = enemy;
    this.tokenPool = tokenPool;
    this.thinkTimer = 0.14 + Math.random() * 0.18;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.attackCooldown = 0.18 + Math.random() * 0.25;
    this.comboStep = 0;
    this.blockTimer = 0;
    this.jumpCooldown = 0.6;
  }

  update(dt, player, sound) {
    const e = this.enemy;
    if (e.state === STATES.DEAD) {
      this.tokenPool.release(e.id);
      return { moveX: 0, blockHeld: false };
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.blockTimer > 0) this.blockTimer -= dt;
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

    if (e.archetype === ARCHETYPES.BOSS && !e.enraged && e.hp <= e.maxHp * 0.5) {
      e.enraged = true;
      e.speedMult *= 1.18;
      e.dmgMult *= 1.18;
    }

    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.abs(dx);
    const dirToPlayer = dx >= 0 ? 1 : -1;

    const idealDist =
      e.archetype === ARCHETYPES.ZONER
        ? e.weapon.reach * 0.92
        : e.archetype === ARCHETYPES.BRUTE
        ? e.weapon.reach * 0.78
        : e.weapon.reach * 0.74;

    if (e.state === STATES.HITSTUN || e.state === STATES.STAGGERED) {
      this.tokenPool.release(e.id);
      this.comboStep = 0;
      return { moveX: 0, blockHeld: false };
    }

    // Reactive blocking against incoming player attacks (higher chance when player spams)
    if (this.blockTimer <= 0 && player.isAttacking() && dist < player.weapon.reach + 48) {
      const blockChance =
        e.archetype === ARCHETYPES.BOSS ? (e.enraged ? 0.56 : 0.44) :
        e.archetype === ARCHETYPES.BRUTE ? 0.36 :
        e.archetype === ARCHETYPES.ZONER ? 0.30 : 0.26;
      if (Math.random() < blockChance * dt * 14) {
        this.blockTimer = 0.26 + Math.random() * 0.22;
      }
    }

    if (this.blockTimer > 0 && e.guard > 15) {
      e.facing = dirToPlayer;
      return { moveX: 0, blockHeld: true };
    }

    // Continue full 3-hit combo strings when in range
    if (e.isAttacking() && this.comboStep > 0 && e.currentMove) {
      const m = e.currentMove;
      if (e.stateTimer >= m.windup + m.active * 0.75) {
        if (this.comboStep === 1 && dist < e.weapon.reach * e.scale + 44) {
          this.comboStep = 2;
          e.facing = dirToPlayer;
          e.startAttack('light', sound);
        } else if (this.comboStep === 2 && dist < e.weapon.reach * e.scale + 52) {
          this.comboStep = 0;
          e.facing = dirToPlayer;
          e.startAttack(e.archetype === ARCHETYPES.ZONER ? 'light' : 'heavy', sound);
        } else {
          this.comboStep = 0;
        }
      }
      return { moveX: 0, blockHeld: false };
    }

    // Punish player recovery / stagger immediately
    const playerVulnerable =
      player.state === STATES.STAGGERED ||
      player.state === STATES.HITSTUN ||
      (player.isAttacking() && player.currentMove && player.stateTimer > player.currentMove.windup + player.currentMove.active);

    const hasToken = this.tokenPool.request(e.id);

    if (!hasToken) {
      // Flanking pressure while waiting for token
      this.thinkTimer -= dt;
      if (this.thinkTimer <= 0) {
        this.thinkTimer = 0.32 + Math.random() * 0.32;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
      }
      const waitDist = idealDist + 85;
      let moveX = 0;
      if (dist < waitDist - 25) moveX = -dirToPlayer * 0.75;
      else if (dist > waitDist + 30) moveX = dirToPlayer * 0.92;
      else moveX = this.strafeDir * 0.45;
      e.facing = dirToPlayer;
      return { moveX, blockHeld: false };
    }

    // Pursue elevated/airborne player with jump + air attack
    if (dy < -75 && dist < 210 && e.grounded && this.jumpCooldown <= 0) {
      e.requestJump(false);
      this.jumpCooldown = 1.2;
      e.facing = dirToPlayer;
      return { moveX: dirToPlayer, blockHeld: false };
    }

    if (!e.grounded && dist < e.weapon.reach * e.scale + 25 && Math.abs(dy) < 70 && this.attackCooldown <= 0) {
      e.facing = dirToPlayer;
      e.startAttack('light', sound);
      this.attackCooldown = 0.45;
      return { moveX: dirToPlayer, blockHeld: false };
    }

    // Zoner evasive back-dash if crowded
    if (e.archetype === ARCHETYPES.ZONER && dist < idealDist * 0.42 && e.dashCooldown <= 0) {
      e.startDash(-dirToPlayer);
      if (sound) sound.dash();
      return { moveX: 0, blockHeld: false };
    }

    // Rusher aggressive dash-in
    if (e.archetype === ARCHETYPES.RUSHER && dist > 155 && dist < 340 && e.dashCooldown <= 0 && Math.random() < 0.12) {
      e.startDash(dirToPlayer);
      if (sound) sound.dash();
      return { moveX: 0, blockHeld: false };
    }

    // In attack range
    const canStrikeNow = this.attackCooldown <= 0 || (playerVulnerable && this.attackCooldown <= 0.2);
    if (dist <= e.weapon.reach * e.scale + 24 && canStrikeNow) {
      e.facing = dirToPlayer;
      const roll = Math.random();
      if (e.archetype === ARCHETYPES.BRUTE || (roll < 0.34 && e.archetype !== ARCHETYPES.RUSHER)) {
        e.startAttack('heavy', sound);
        this.comboStep = 0;
        this.attackCooldown = e.archetype === ARCHETYPES.BRUTE ? 0.68 : 0.52;
      } else {
        e.startAttack('light', sound);
        this.comboStep = 1;
        this.attackCooldown = e.archetype === ARCHETYPES.RUSHER ? 0.38 : 0.48;
      }
      this.tokenPool.release(e.id);
      return { moveX: 0, blockHeld: false };
    }

    let moveX = 0;
    if (dist > idealDist) {
      moveX = dirToPlayer * (e.archetype === ARCHETYPES.RUSHER ? 1.08 : 0.94);
    } else if (e.archetype === ARCHETYPES.ZONER && dist < idealDist * 0.65) {
      moveX = -dirToPlayer * 0.82;
    }

    return { moveX, blockHeld: false };
  }
}
