import { AttackTokenPool, EnemyAIController } from './ai.js';
import { BossController } from './boss.js';
import { ARCHETYPES, GROUND_Y, STATES, WORLD_WIDTH } from './constants.js';
import { Fighter } from './fighter.js';
import { HazardManager } from './hazards.js';
import { ACTS, getLevel } from './levels.js';
import { ParticlePool } from './particles.js';
import { VerletRagdoll } from './ragdoll.js';

function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class GameEngine {
  constructor(store, renderer, input, sound, callbacks) {
    this.store = store;
    this.renderer = renderer;
    this.input = input;
    this.sound = sound;
    this.cb = callbacks;

    this.mode = 'title'; // 'title' | 'campaign' | 'endless'
    this.paused = false;
    this.matchEnded = false;
    this.level = getLevel(this.store.save.selectedLevel || 1);
    this.endlessWave = 1;
    this.endlessKOs = 0;

    this.waveIndex = 0;
    this.player = null;
    this.enemies = [];
    this.aiControllers = [];
    this.bossCtrl = null;
    this.tokenPool = new AttackTokenPool(1);
    this.hazards = new HazardManager();
    this.ragdolls = [];
    this.particles = new ParticlePool();

    this.hitstopTimer = 0;
    this.shakeTimer = 0;
    this.shakeDuration = 0.15;
    this.shakeVecX = 0;
    this.shakeVecY = 0;
    this.specialDimTimer = 0;
    this.matchTime = 0;
    this.tookDamage = false;
    this.hasLuckyCharm = false;
    this.activeBuffs = [];

    this.lastTime = performance.now();
    this.rafId = null;
    this.titleDemoTimer = 0;

    this.input.onAction = (action) => this.handleAction(action);
  }

  start() {
    this.startTitleBackdrop();
    this.lastTime = performance.now();
    const tick = (now) => {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.update(rawDt);
      this.render(rawDt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  startTitleBackdrop() {
    this.mode = 'title';
    this.paused = false;
    this.matchEnded = false;
    const highestAct = Math.ceil((this.store.save.unlockedLevel || 1) / 10);
    const act = ACTS[Math.max(0, Math.min(4, highestAct - 1))];
    this.level = { id: 1, actId: act.id, act, waves: [], maxTokens: 1, isBoss: false };
    this.hazards.setupForAct(act.id, false);
    this.ragdolls = [];
    this.particles.clear();
    this.bossCtrl = null;

    const cos = this.store.getEquippedCosmetic();
    const weapon = this.store.getEquippedWeapon();
    this.player = new Fighter({
      id: 'title_p',
      isPlayer: true,
      x: 420,
      y: GROUND_Y,
      facing: 1,
      weaponId: weapon.id,
      weaponTier: this.store.getWeaponTier(weapon.id),
      maxHp: 999,
      inkColor: cos.ink,
      scarfColor: cos.scarf,
      eyeColor: cos.eye,
      glowColor: cos.glow,
      sparkColor: cos.spark,
    });

    const sparEnemy = new Fighter({
      id: 'title_e',
      isPlayer: false,
      x: 780,
      y: GROUND_Y,
      facing: -1,
      weaponId: act.bossWeapon,
      maxHp: 999,
      scarfColor: act.accent,
    });
    this.enemies = [sparEnemy];
    this.aiControllers = [new EnemyAIController(sparEnemy, this.tokenPool)];
    this.cb.onModeChanged('title');
  }

  startCampaignLevel(levelId) {
    this.mode = 'campaign';
    this.loadLevel(levelId);
    this.cb.onModeChanged('campaign');
  }

  startEndlessMode() {
    this.mode = 'endless';
    this.endlessWave = 1;
    this.endlessKOs = 0;
    this.paused = false;
    this.matchEnded = false;
    this.matchTime = 0;
    this.tookDamage = false;
    this.ragdolls = [];
    this.particles.clear();
    this.bossCtrl = null;

    this.initPlayerForMatch();
    this.spawnEndlessWave(1);
    this.cb.onModeChanged('endless');
  }

  initPlayerForMatch() {
    const mods = this.store.getPlayerModifiers();
    const cos = this.store.getEquippedCosmetic();
    const weapon = this.store.getEquippedWeapon();
    const tier = this.store.getWeaponTier(weapon.id);
    const consumed = this.store.consumeArmedForMatch();
    this.hasLuckyCharm = Boolean(consumed.lucky_charm);
    this.activeBuffs = Object.keys(consumed).filter((k) => consumed[k]);

    this.player = new Fighter({
      id: 'player',
      isPlayer: true,
      name: 'Shadow',
      x: 280,
      y: GROUND_Y,
      facing: 1,
      weaponId: weapon.id,
      weaponTier: tier,
      maxHp: mods.maxHp,
      maxGuard: mods.maxGuard,
      dmgMult: mods.damageMult,
      speedMult: mods.speedMult,
      dashCooldownMult: mods.dashCooldownMult,
      meterGainMult: mods.meterGainMult,
      guardRegenMult: mods.guardRegenMult,
      damageTakenMult: mods.damageTakenMult,
      parryWindowBonus: mods.parryWindowBonus,
      dashIframeBonus: mods.dashIframeBonus,
      hasHealingScroll: Boolean(consumed.healing_scroll),
      inkColor: cos.ink,
      scarfColor: cos.scarf,
      eyeColor: cos.eye,
      glowColor: cos.glow,
      sparkColor: cos.spark,
    });
  }

  loadLevel(levelId) {
    this.level = getLevel(levelId);
    this.store.save.selectedLevel = this.level.id;
    this.store.persist();

    this.paused = false;
    this.matchEnded = false;
    this.waveIndex = 0;
    this.matchTime = 0;
    this.tookDamage = false;
    this.hitstopTimer = 0;
    this.shakeTimer = 0;
    this.specialDimTimer = 0;
    this.ragdolls = [];
    this.particles.clear();
    this.bossCtrl = null;

    this.initPlayerForMatch();
    this.hazards.setupForAct(this.level.actId, this.level.isBoss);
    this.tokenPool = new AttackTokenPool(this.level.maxTokens);
    this.spawnWave(0);

    this.cb.onMatchStart(this.level, this.activeBuffs);
  }

  spawnWave(idx) {
    this.waveIndex = idx;
    this.enemies = [];
    this.aiControllers = [];
    this.bossCtrl = null;
    this.tokenPool.clear();

    const wave = this.level.waves[idx];
    if (!wave) return;

    wave.enemies.forEach((def, i) => {
      const spawnX = WORLD_WIDTH - 220 - i * 115;
      const enemy = new Fighter({
        id: `e_${idx}_${i}`,
        isPlayer: false,
        name: def.name,
        title: def.title || '',
        archetype: def.archetype,
        bossId: def.bossId || null,
        isElite: Boolean(def.isElite),
        x: Math.max(460, Math.min(WORLD_WIDTH - 120, spawnX)),
        y: GROUND_Y,
        facing: -1,
        weaponId: def.weaponId,
        maxHp: def.maxHp,
        maxGuard: def.archetype === ARCHETYPES.BOSS ? 130 : 80,
        dmgMult: def.dmgMult,
        speedMult: def.speedMult,
        scale: def.scale || 1.0,
        inkColor: def.archetype === ARCHETYPES.BOSS ? '#070709' : '#16181F',
        scarfColor: def.scarfColor,
        eyeColor: def.archetype === ARCHETYPES.BOSS ? '#FACC15' : '#FB7185',
        glowColor: def.scarfColor,
      });
      this.enemies.push(enemy);
      if (def.archetype === ARCHETYPES.BOSS) {
        this.bossCtrl = new BossController(enemy);
      } else {
        this.aiControllers.push(new EnemyAIController(enemy, this.tokenPool));
      }
    });

    const banner = this.level.isBoss
      ? `${this.level.act.bossName.toUpperCase()} — ${this.level.act.bossTitle}`
      : `WAVE ${idx + 1} / ${this.level.waves.length}`;
    this.cb.onWaveBanner(banner);
  }

  spawnEndlessWave(waveNum) {
    this.endlessWave = waveNum;
    const actIdx = Math.floor((waveNum - 1) / 3) % ACTS.length;
    const act = ACTS[actIdx];
    const isBossWave = waveNum % 5 === 0;

    this.level = {
      id: waveNum,
      actId: act.id,
      act,
      isBoss: isBossWave,
      title: `ENDLESS WAVE ${waveNum}`,
      waves: [{ enemies: [] }],
      maxTokens: waveNum >= 8 ? 2 : 1,
    };

    this.hazards.setupForAct(act.id, isBossWave);
    this.enemies = [];
    this.aiControllers = [];
    this.bossCtrl = null;
    this.tokenPool = new AttackTokenPool(this.level.maxTokens);

    // Occasional inter-wave healing boost
    if (waveNum > 1 && this.player) {
      const heal = Math.round(this.player.maxHp * 0.22);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      this.particles.spawnText(this.player.x, this.player.y - 110, `+${heal} HP`, '#10B981', 18);
    }

    const scale = 1 + (waveNum - 1) * 0.14;
    if (isBossWave) {
      const boss = new Fighter({
        id: `endless_boss_${waveNum}`,
        isPlayer: false,
        name: act.bossName,
        title: `Wave ${waveNum} Sovereign`,
        archetype: ARCHETYPES.BOSS,
        bossId: act.bossId,
        x: WORLD_WIDTH - 240,
        y: GROUND_Y,
        facing: -1,
        weaponId: act.bossWeapon,
        maxHp: Math.round(240 * scale),
        dmgMult: 0.9 + waveNum * 0.05,
        speedMult: 1 + Math.min(0.35, waveNum * 0.02),
        scale: act.id === 3 ? 1.2 : 1.09,
        inkColor: '#070709',
        scarfColor: act.accent,
        eyeColor: '#FACC15',
      });
      this.enemies.push(boss);
      this.bossCtrl = new BossController(boss);
    } else {
      const count = Math.min(4, 2 + Math.floor(waveNum / 4));
      const archs = [ARCHETYPES.RUSHER, ARCHETYPES.ZONER, ARCHETYPES.BRUTE];
      for (let i = 0; i < count; i++) {
        const arch = archs[(waveNum + i) % archs.length];
        const enemy = new Fighter({
          id: `endless_${waveNum}_${i}`,
          isPlayer: false,
          name: arch === ARCHETYPES.BRUTE ? 'Foundry Brute' : arch === ARCHETYPES.ZONER ? 'Shadow Lancer' : 'Vanguard',
          archetype: arch,
          x: WORLD_WIDTH - 200 - i * 110,
          y: GROUND_Y,
          facing: -1,
          weaponId: arch === ARCHETYPES.BRUTE ? 'gauntlets' : arch === ARCHETYPES.ZONER ? 'kusarigama' : 'twin_daggers',
          maxHp: Math.round((arch === ARCHETYPES.BRUTE ? 115 : 75) * scale),
          dmgMult: 0.8 + waveNum * 0.045,
          speedMult: 0.95 + Math.min(0.3, waveNum * 0.02),
          scale: arch === ARCHETYPES.BRUTE ? 1.14 : 1.0,
          scarfColor: act.accent,
        });
        this.enemies.push(enemy);
        this.aiControllers.push(new EnemyAIController(enemy, this.tokenPool));
      }
    }

    this.cb.onMatchStart(this.level, this.activeBuffs);
    this.cb.onWaveBanner(isBossWave ? `ENDLESS BOSS • WAVE ${waveNum}` : `ENDLESS WAVE ${waveNum} • ${act.name.toUpperCase()}`);
  }

  handleAction(action) {
    if (action === 'unlockAudio') {
      this.sound.unlock();
      return;
    }
    if (this.mode === 'title') return;
    if (action === 'pause') {
      this.cb.onTogglePause();
      return;
    }
    if (this.paused || this.matchEnded || !this.player || this.player.state === STATES.DEAD) return;

    const moveX = this.input.getMoveX();
    if (action === 'jump') {
      this.player.requestJump(false);
    } else if (action === 'drop') {
      this.player.requestJump(true);
    } else if (action === 'light') {
      this.player.startAttack('light', this.sound);
    } else if (action === 'heavy') {
      this.player.startAttack('heavy', this.sound);
    } else if (action === 'dash') {
      if (!this.player.startDash(moveX)) {
        this.player.queueAction('dash');
      } else {
        this.sound.dash();
        this.particles.spawnDust(this.player.x, this.player.y, 6, -this.player.facing);
      }
    } else if (action === 'special') {
      if (this.player.startSpecial(this.sound)) {
        this.specialDimTimer = this.player.weapon.finisher.duration + 0.15;
        this.hitstopTimer = 0.085;
        this.renderer.triggerZoom(0.06);
        this.particles.spawnRing(this.player.x, this.player.y - 52, 130, this.player.style.trail, 5);
        this.particles.spawnText(this.player.x, this.player.y - 125, this.player.weapon.finisher.name.toUpperCase(), '#FACC15', 22);
      }
    }
  }

  setPaused(val) {
    this.paused = val;
  }

  update(dt) {
    if (this.paused) return;

    if (this.mode === 'title') {
      this.updateTitleDemo(dt);
      return;
    }

    if (this.specialDimTimer > 0) this.specialDimTimer = Math.max(0, this.specialDimTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    this.particles.update(dt);
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      this.ragdolls[i].update(dt);
      if (this.ragdolls[i].life <= 0) this.ragdolls.splice(i, 1);
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    if (!this.matchEnded) {
      this.matchTime += dt;
    }

    const solidPlats = this.hazards.getSolidPlatforms();

    if (this.player.state !== STATES.DEAD) {
      const moveX = this.matchEnded ? 0 : this.input.getMoveX();
      const blockHeld = this.matchEnded ? false : this.input.isBlockHeld();
      const wasGrounded = this.player.grounded;
      this.player.update(dt, moveX, blockHeld, this.sound, solidPlats);
      if (!wasGrounded && this.player.grounded) {
        this.particles.spawnDust(this.player.x, this.player.y, 5, 0);
      }
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy.state === STATES.DEAD) continue;
      let cmd = { moveX: 0, blockHeld: false };

      if (!this.matchEnded && this.player.state !== STATES.DEAD) {
        if (enemy.archetype === ARCHETYPES.BOSS && this.bossCtrl) {
          cmd = this.bossCtrl.update(
            dt,
            this.player,
            this.particles,
            this.sound,
            () => {
              this.hitstopTimer = 0.06;
              this.renderer.triggerZoom(0.08);
              this.triggerShake(1, 0, 12, 0.28);
            },
            (dmg, kbX, kbY, dir, heavy) => this.applyDirectHitToPlayer(dmg, kbX, kbY, dir, heavy)
          );
        } else if (this.aiControllers[i]) {
          cmd = this.aiControllers[i].update(dt, this.player, this.sound);
        }
      }
      enemy.update(dt, cmd.moveX, cmd.blockHeld, this.sound, solidPlats);
    }

    if (!this.matchEnded) {
      this.hazards.update(
        dt,
        [this.player, ...this.enemies],
        this.player,
        this.particles,
        this.sound,
        (lx, ly) => {
          // Breakable dojo crate drop
          if (Math.random() < 0.55) {
            this.store.save.coins += 18;
            this.store.persist();
            this.sound.coin();
            this.particles.spawnText(lx, ly - 15, '+18 COINS', '#FACC15', 15);
          } else {
            const heal = 22;
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
            this.sound.coin();
            this.particles.spawnText(lx, ly - 15, `+${heal} HP`, '#10B981', 15);
          }
        }
      );

      this.resolveCombat();

      const aliveCount = this.enemies.filter((e) => e.state !== STATES.DEAD).length;
      if (aliveCount === 0 && (this.ragdolls.length === 0 || this.ragdolls.every((r) => r.life < 1.55))) {
        if (this.mode === 'endless') {
          this.spawnEndlessWave(this.endlessWave + 1);
        } else if (this.waveIndex + 1 < this.level.waves.length) {
          this.spawnWave(this.waveIndex + 1);
        } else {
          this.triggerVictory();
        }
      }

      if (this.player.state === STATES.DEAD) {
        this.triggerDefeat();
      }
    }

    const boss = this.enemies.find((e) => e.archetype === ARCHETYPES.BOSS && e.state !== STATES.DEAD) || null;
    this.cb.onHudUpdate({
      mode: this.mode,
      player: this.player,
      boss,
      enemiesAlive: this.enemies.filter((e) => e.state !== STATES.DEAD).length,
      waveIndex: this.mode === 'endless' ? this.endlessWave : this.waveIndex + 1,
      waveTotal: this.mode === 'endless' ? '∞' : this.level.waves.length,
      activeBuffs: this.activeBuffs,
    });
  }

  updateTitleDemo(dt) {
    this.particles.update(dt);
    this.titleDemoTimer += dt;
    const p = this.player;
    const e = this.enemies[0];
    if (!p || !e) return;

    const dist = Math.abs(e.x - p.x);
    const dir = Math.sign(e.x - p.x) || 1;
    let moveX = 0;
    if (dist > 130) moveX = dir * 0.7;
    else if (Math.sin(this.titleDemoTimer * 2.2) > 0.75 && p.canAct()) {
      p.startAttack('light');
    }
    p.update(dt, moveX, false, null, []);
    const cmd = this.aiControllers[0].update(dt, p, null);
    e.update(dt, cmd.moveX, cmd.blockHeld, null, []);
    p.hp = p.maxHp;
    e.hp = e.maxHp;
  }

  applyDirectHitToPlayer(dmg, kbX, kbY, dir, heavy) {
    if (this.player.state === STATES.DEAD || this.player.iframeTimer > 0) return;
    if (this.player.state === STATES.BLOCK && this.player.parryTimer > 0) {
      this.sound.parry();
      this.store.recordParry();
      this.player.special = Math.min(100, this.player.special + 28 * this.player.meterGainMult);
      this.hitstopTimer = 0.088;
      this.particles.spawnRing(this.player.x, this.player.y - 55, 95, '#FACC15', 5);
      this.particles.spawnText(this.player.x, this.player.y - 115, 'PERFECT PARRY!', '#FACC15', 22);
      return;
    }

    const res = this.player.applyDamage(dmg, Math.abs(kbX), kbY, dir, heavy, '#FFFFFF');
    if (res.dmg > 0) this.tookDamage = true;
    this.sound.hit(heavy, 'gauntlets');
    this.hitstopTimer = heavy ? 0.065 : 0.036;
    this.triggerShake(dir, kbY < 0 ? -0.35 : 0, heavy ? 11 : 6, 0.18);
    this.particles.spawnDirectionalSparks(this.player.x, this.player.y - 58, dir, 12, '#EF4444');
    this.particles.spawnText(this.player.x, this.player.y - 95, `${res.dmg}`, '#FB7185', 18);
    if (res.healTriggered) {
      this.particles.spawnText(this.player.x, this.player.y - 130, 'SCROLL HEAL!', '#10B981', 19);
    }
  }

  resolveCombat() {
    const pHit = this.player.getActiveHitbox();
    if (pHit) {
      for (const enemy of this.enemies) {
        if (enemy.state === STATES.DEAD || enemy.iframeTimer > 0) continue;
        if (enemy.hitSwingIds.has(pHit.swingId)) continue;
        if (boxesOverlap(pHit, enemy.getHurtbox())) {
          enemy.hitSwingIds.add(pHit.swingId);
          this.processHit(this.player, enemy, pHit);
        }
      }
    }

    for (const enemy of this.enemies) {
      if (enemy.state === STATES.DEAD) continue;
      const eHit = enemy.getActiveHitbox();
      if (!eHit) continue;
      if (this.player.state === STATES.DEAD || this.player.iframeTimer > 0) continue;
      if (this.player.hitSwingIds.has(eHit.swingId)) continue;
      if (boxesOverlap(eHit, this.player.getHurtbox())) {
        this.player.hitSwingIds.add(eHit.swingId);
        this.processHit(enemy, this.player, eHit);
      }
    }
  }

  processHit(attacker, defender, hit) {
    const impactX = (attacker.x + defender.x) * 0.5;
    const impactY = defender.y - 62 * defender.scale;

    // Sensei Kuro counter stance check
    if (defender.counterStance && !hit.heavy && !hit.isSpecial) {
      defender.counterStance = false;
      this.sound.parry();
      this.hitstopTimer = 0.085;
      this.particles.spawnRing(impactX, impactY, 95, '#FFFFFF', 5);
      this.particles.spawnText(defender.x, defender.y - 115, 'COUNTERED!', '#FACC15', 22);
      attacker.applyDamage(18 * defender.dmgMult, 340, -180, defender.facing, true);
      this.tookDamage = true;
      return;
    } else if (defender.counterStance && (hit.heavy || hit.isSpecial)) {
      defender.counterStance = false;
      defender.state = STATES.STAGGERED;
      defender.stateTimer = 0;
      defender.stateDuration = 1.1;
      this.particles.spawnText(defender.x, defender.y - 120, 'STANCE BROKEN!', '#38BDF8', 20);
    }

    const facingAttacker = Math.sign(attacker.x - defender.x) === defender.facing || attacker.x === defender.x;
    if (defender.state === STATES.BLOCK && facingAttacker) {
      if (defender.parryTimer > 0) {
        this.sound.parry();
        if (defender.isPlayer) this.store.recordParry();
        defender.state = STATES.PARRY_SUCCESS;
        defender.stateTimer = 0;
        defender.stateDuration = 0.14;
        defender.parryTimer = 0;
        defender.special = Math.min(100, defender.special + 28 * defender.meterGainMult);

        attacker.state = STATES.STAGGERED;
        attacker.stateTimer = 0;
        attacker.stateDuration = 1.15;
        attacker.currentMove = null;
        attacker.vx = -attacker.facing * 240;

        this.hitstopTimer = 0.092;
        this.triggerShake(-attacker.facing, 0, 10, 0.18);
        this.particles.spawnRing(impactX, impactY, 105, '#FACC15', 6);
        this.particles.spawnRadialSparks(impactX, impactY, 18, '#FEF08A', 1.1);
        this.particles.spawnText(defender.x, defender.y - 118, 'PERFECT PARRY!', '#FACC15', 22);
        return;
      }

      defender.guard = Math.max(0, defender.guard - hit.guardDmg);
      defender.vx = attacker.facing * (hit.kbX * 0.45);
      this.sound.block();
      this.particles.spawnDirectionalSparks(impactX, impactY, -attacker.facing, 7, '#94A3B8');

      if (defender.guard <= 0) {
        defender.state = STATES.STAGGERED;
        defender.stateTimer = 0;
        defender.stateDuration = 1.25;
        defender.guardBreakCooldown = 2.0;
        this.hitstopTimer = 0.068;
        this.triggerShake(attacker.facing, 0, 10, 0.2);
        this.particles.spawnText(defender.x, defender.y - 115, 'GUARD BREAK!', '#FB7185', 20);
      } else {
        if (hit.heavy) {
          defender.hp = Math.max(1, defender.hp - Math.round(hit.dmg * 0.15));
        }
        this.particles.spawnText(defender.x, defender.y - 98, 'BLOCKED', '#CBD5E1', 15);
      }
      return;
    }

    let dmg = hit.dmg;
    if (attacker.isPlayer) {
      dmg *= attacker.getProratedMultiplier();
      attacker.registerComboHit();
      this.store.recordCombo(attacker.comboCount);
      attacker.special = Math.min(100, attacker.special + (hit.heavy ? 16 : 10) * attacker.meterGainMult);
    } else if (defender.isPlayer) {
      defender.special = Math.min(100, defender.special + 7 * defender.meterGainMult);
    }

    const flashCol = hit.isSpecial ? '#FACC15' : '#FFFFFF';
    const res = defender.applyDamage(dmg, hit.kbX, hit.kbY, attacker.facing, hit.heavy, flashCol);
    if (defender.isPlayer && res.dmg > 0) this.tookDamage = true;

    this.sound.hit(hit.heavy, attacker.weapon.id);
    this.hitstopTimer = Math.max(this.hitstopTimer, hit.isSpecial ? 0.09 : hit.heavy ? 0.066 : 0.036);
    this.triggerShake(attacker.facing, hit.kbY < -100 ? -0.35 : 0, hit.heavy ? 11 : 5.5, hit.heavy ? 0.18 : 0.11);

    const sparkCol = attacker.style.spark || attacker.style.trail;
    this.particles.spawnDirectionalSparks(impactX, impactY, attacker.facing, hit.heavy ? 16 : 9, sparkCol);
    if (hit.heavy || hit.isSpecial) {
      this.particles.spawnRing(impactX, impactY, 68, attacker.style.trail, 4);
    }

    const label = hit.heavy ? `${res.dmg}!` : `${res.dmg}`;
    const color = hit.isSpecial ? '#FACC15' : hit.heavy ? '#FB7185' : '#F8FAFC';
    this.particles.spawnText(defender.x + (Math.random() - 0.5) * 18, defender.y - 95, label, color, hit.heavy ? 22 : 17);

    if (res.healTriggered) {
      this.particles.spawnText(defender.x, defender.y - 130, 'SCROLL HEAL!', '#10B981', 19);
    }

    if (res.killed) {
      if (!defender.isPlayer) this.endlessKOs += 1;
      this.sound.ko();
      this.hitstopTimer = 0.095;
      this.renderer.triggerZoom(0.07);
      this.triggerShake(attacker.facing, -0.4, 15, 0.28);
      const joints = defender.computeJoints();
      this.ragdolls.push(
        new VerletRagdoll(
          joints,
          attacker.facing * Math.max(360, hit.kbX * 1.25),
          Math.min(-260, hit.kbY - 120),
          defender.style
        )
      );
      this.particles.spawnRadialSparks(impactX, impactY, 24, '#EF4444', 1.2);
    }
  }

  triggerVictory() {
    this.matchEnded = true;
    const reward = this.store.recordVictory(
      this.level,
      this.matchTime,
      this.player.maxComboReached,
      this.tookDamage,
      this.hasLuckyCharm
    );
    this.sound.coin();
    this.cb.onVictory({
      level: this.level,
      maxCombo: this.player.maxComboReached,
      time: this.matchTime,
      tookDamage: this.tookDamage,
      ...reward,
    });
  }

  triggerDefeat() {
    this.matchEnded = true;
    if (this.mode === 'endless') {
      const wavesCleared = Math.max(0, this.endlessWave - 1);
      const reward = this.store.recordEndlessRun(wavesCleared, this.player.maxComboReached, this.endlessKOs);
      this.cb.onEndlessEnd({
        wavesCleared,
        waveReached: this.endlessWave,
        maxCombo: this.player.maxComboReached,
        kos: this.endlessKOs,
        ...reward,
      });
    } else {
      const boss = this.enemies.find((e) => e.archetype === ARCHETYPES.BOSS);
      this.cb.onDefeat({
        level: this.level,
        maxCombo: this.player.maxComboReached,
        waveReached: this.waveIndex + 1,
        waveTotal: this.level.waves.length,
        bossHpPct: boss ? Math.round((boss.hp / boss.maxHp) * 100) : null,
      });
    }
  }

  triggerShake(dirX, dirY, intensity, duration) {
    this.shakeVecX = dirX * intensity;
    this.shakeVecY = dirY * intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  render(dt) {
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0 && this.shakeDuration > 0) {
      const decay = this.shakeTimer / this.shakeDuration;
      const osc = Math.sin(this.shakeTimer * 95);
      shakeX = this.shakeVecX * decay * osc + (Math.random() - 0.5) * 2.5 * decay;
      shakeY = this.shakeVecY * decay * osc + (Math.random() - 0.5) * 2.0 * decay;
    }

    this.renderer.render({
      act: this.level.act,
      player: this.player,
      enemies: this.enemies,
      bossCtrl: this.bossCtrl,
      hazards: this.hazards,
      ragdolls: this.ragdolls,
      particles: this.particles,
      shakeX,
      shakeY,
      specialDimTimer: this.specialDimTimer,
      dt,
    });
  }
}
