import { CONSUMABLES, COSMETICS, MILESTONE_CHALLENGES, STAT_UPGRADES } from './constants.js';
import { ACTS, getLevel, LEVELS } from './levels.js';
import { StorePreviewStage } from './preview.js';
import { getWeaponUpgradeCost, WEAPONS } from './weapons.js';

export class UIManager {
  constructor(store, sound) {
    this.store = store;
    this.sound = sound;
    this.engine = null;
    this.activeModal = null;
    this.storeTab = 'weapons';
    this.campaignAct = Math.ceil((this.store.save.selectedLevel || 1) / 10);
    this.selectedPreviewLevel = this.store.save.selectedLevel || 1;
    this.hoveredWeaponId = null;
    this.hoveredCosmeticId = null;

    this.previewStage = new StorePreviewStage(document.getElementById('preview-canvas'));

    this.el = {
      titleScreen: document.getElementById('title-screen'),
      titleContinueSub: document.getElementById('title-continue-sub'),
      titleStarsBadge: document.getElementById('title-stars-badge'),
      titleWalletBadge: document.getElementById('title-wallet-badge'),
      titleEndlessBadge: document.getElementById('title-endless-badge'),
      titleChalBadge: document.getElementById('title-chal-badge'),
      titleEndlessBtn: document.getElementById('title-btn-endless'),
      titleMuteBtn: document.getElementById('title-btn-mute'),
      titleTouchBtn: document.getElementById('title-btn-touch'),

      topHud: document.getElementById('top-hud'),
      hpFill: document.getElementById('hud-hp-fill'),
      hpText: document.getElementById('hud-hp-text'),
      guardFill: document.getElementById('hud-guard-fill'),
      hudBuffs: document.getElementById('hud-buffs'),
      spFill: document.getElementById('hud-sp-fill'),
      spReadyTag: document.getElementById('hud-sp-ready'),
      levelTag: document.getElementById('hud-level-tag'),
      actName: document.getElementById('hud-act-name'),
      waveTag: document.getElementById('hud-wave-tag'),
      comboBox: document.getElementById('hud-combo-box'),
      comboNum: document.getElementById('hud-combo-num'),
      bossBarWrap: document.getElementById('hud-boss-wrap'),
      bossName: document.getElementById('hud-boss-name'),
      bossFill: document.getElementById('hud-boss-fill'),
      bossMarkers: document.getElementById('boss-markers'),
      coinsVal: document.getElementById('hud-coins'),
      gemsVal: document.getElementById('hud-gems'),

      waveBanner: document.getElementById('wave-banner'),
      hintBar: document.getElementById('desktop-hints'),
      touchControls: document.getElementById('touch-controls'),
      touchSpecialBtn: document.getElementById('touch-sp-btn'),

      modalBackdrop: document.getElementById('modal-backdrop'),
      storeModal: document.getElementById('store-modal'),
      storeContent: document.getElementById('store-content'),
      storeCoins: document.getElementById('store-coins'),
      storeGems: document.getElementById('store-gems'),
      previewCaption: document.getElementById('preview-caption'),
      previewSlots: document.getElementById('preview-slots'),

      levelsModal: document.getElementById('levels-modal'),
      levelsTotalStars: document.getElementById('levels-total-stars'),
      levelsCoins: document.getElementById('levels-coins'),
      levelsGems: document.getElementById('levels-gems'),
      levelsActTabs: document.getElementById('levels-act-tabs'),
      levelsGrid: document.getElementById('levels-grid'),
      stageFooter: document.getElementById('stage-preview-footer'),

      challengesModal: document.getElementById('challenges-modal'),
      challengesContent: document.getElementById('challenges-content'),
      settingsModal: document.getElementById('settings-modal'),
      endlessPreviewBtn: document.getElementById('btn-toggle-endless-preview'),

      pauseModal: document.getElementById('pause-modal'),
      pauseObjective: document.getElementById('pause-objective'),
      pauseConsumables: document.getElementById('pause-consumables'),

      resultModal: document.getElementById('result-modal'),
      resultTitle: document.getElementById('result-title'),
      resultStars: document.getElementById('result-stars'),
      resultSub: document.getElementById('result-sub'),
      resultAlert: document.getElementById('result-alert'),
      resultStats: document.getElementById('result-stats'),
      resultNextBtn: document.getElementById('btn-result-next'),
      toast: document.getElementById('toast-msg'),
    };

    this.toastTimer = null;
    this.waveBannerTimer = null;
    this.bindEvents();
    this.syncCurrencies();
    this.syncTitleScreen();
    this.syncMuteButton();
    this.syncTouchVisibility();
  }

  bindEvents() {
    // Title screen buttons
    document.getElementById('title-btn-continue').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.uiClick();
      const target = this.store.save.unlockedLevel || 1;
      this.engine.startCampaignLevel(target);
    });
    document.getElementById('title-btn-levels').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.uiClick();
      this.openModal('levels');
    });
    document.getElementById('title-btn-store').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.uiClick();
      this.openModal('store');
    });
    this.el.titleEndlessBtn.addEventListener('click', () => {
      this.sound.unlock();
      if (!this.store.isEndlessUnlocked()) {
        this.showToast('Clear Level 50 (or toggle Preview in Settings) to unlock Endless Mode!');
        return;
      }
      this.sound.uiClick();
      this.engine.startEndlessMode();
    });
    document.getElementById('title-btn-challenges').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.uiClick();
      this.openModal('challenges');
    });
    document.getElementById('title-btn-settings').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.uiClick();
      this.openModal('settings');
    });

    this.el.titleMuteBtn.addEventListener('click', () => this.toggleMute());
    this.el.titleTouchBtn.addEventListener('click', () => this.cycleTouchSetting());

    // HUD buttons
    document.getElementById('btn-open-levels').addEventListener('click', () => this.openModal('levels'));
    document.getElementById('btn-open-store').addEventListener('click', () => this.openModal('store'));
    document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());

    document.getElementById('btn-store-back').addEventListener('click', () => {
      if (this.engine && this.engine.mode !== 'title' && this.engine.player) {
        const w = this.store.getEquippedWeapon();
        const cos = this.store.getEquippedCosmetic();
        this.engine.player.setWeapon(w.id);
        this.engine.player.weaponTier = this.store.getWeaponTier(w.id);
        this.engine.player.style.ink = cos.ink;
        this.engine.player.style.scarf = cos.scarf;
        this.engine.player.style.eye = cos.eye;
        this.engine.player.style.glow = cos.glow;
        this.engine.player.style.spark = cos.spark;
      }
      this.closeModal();
    });

    document.getElementById('btn-levels-title').addEventListener('click', () => {
      this.closeModal();
      this.engine.startTitleBackdrop();
    });
    document.getElementById('btn-levels-store').addEventListener('click', () => this.openModal('store'));

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => this.closeModal());
    });

    document.querySelectorAll('[data-store-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.storeTab = btn.getAttribute('data-store-tab');
        document.querySelectorAll('[data-store-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        this.renderStore();
      });
    });

    // Pause buttons
    document.getElementById('btn-pause-resume').addEventListener('click', () => this.closeModal());
    document.getElementById('btn-pause-restart').addEventListener('click', () => {
      const mode = this.engine.mode;
      const lvl = this.engine.level.id;
      this.closeModal();
      if (mode === 'endless') this.engine.startEndlessMode();
      else this.engine.startCampaignLevel(lvl);
    });
    document.getElementById('btn-pause-store').addEventListener('click', () => this.openModal('store'));
    document.getElementById('btn-pause-mute').addEventListener('click', () => this.toggleMute());
    document.getElementById('btn-pause-title').addEventListener('click', () => {
      this.closeModal();
      this.engine.startTitleBackdrop();
    });

    // Result buttons
    document.getElementById('btn-result-retry').addEventListener('click', () => {
      const mode = this.engine.mode;
      const lvl = this.engine.level.id;
      this.closeModal();
      if (mode === 'endless') this.engine.startEndlessMode();
      else this.engine.startCampaignLevel(lvl);
    });
    document.getElementById('btn-result-store').addEventListener('click', () => this.openModal('store'));
    document.getElementById('btn-result-levels').addEventListener('click', () => this.openModal('levels'));
    document.getElementById('btn-result-title').addEventListener('click', () => {
      this.closeModal();
      this.engine.startTitleBackdrop();
    });
    this.el.resultNextBtn.addEventListener('click', () => {
      const nextId = Math.min(50, this.engine.level.id + 1);
      this.closeModal();
      this.engine.startCampaignLevel(nextId);
    });

    // Settings actions
    this.el.endlessPreviewBtn.addEventListener('click', () => {
      this.store.save.endless.previewUnlocked = !this.store.save.endless.previewUnlocked;
      this.store.persist();
      this.syncSettings();
      this.syncTitleScreen();
    });
    document.getElementById('btn-export-save').addEventListener('click', () => {
      const json = this.store.exportJson();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(() => this.showToast('Save JSON copied to clipboard!')).catch(() => {
          window.prompt('Copy your Save JSON:', json);
        });
      } else {
        window.prompt('Copy your Save JSON:', json);
      }
    });
    document.getElementById('btn-import-save').addEventListener('click', () => {
      const raw = window.prompt('Paste Save JSON:');
      if (!raw) return;
      if (this.store.importJson(raw)) {
        this.showToast('Save restored!');
        this.syncCurrencies();
        this.syncTitleScreen();
        this.syncSettings();
      } else {
        this.showToast('Invalid Save JSON!');
      }
    });
    document.getElementById('btn-reset-save').addEventListener('click', () => {
      if (window.confirm('Reset all Campaign, Weapons, Stats, and Stars?')) {
        this.store.resetAll();
        this.syncCurrencies();
        this.syncTitleScreen();
        this.syncSettings();
        this.showToast('Progress reset.');
      }
    });

    window.addEventListener('keydown', () => {
      if (this.el.hintBar) this.el.hintBar.classList.add('is-faded');
    }, { once: true });
  }

  attachEngine(engine) {
    this.engine = engine;
  }

  toggleMute() {
    this.store.save.muted = !this.store.save.muted;
    this.store.persist();
    this.syncMuteButton();
  }

  cycleTouchSetting() {
    const cur = this.store.save.showTouchControls;
    this.store.save.showTouchControls = cur === 'auto' ? 'on' : cur === 'on' ? 'off' : 'auto';
    this.store.persist();
    this.syncTouchVisibility();
  }

  syncMuteButton() {
    this.sound.setMuted(Boolean(this.store.save.muted));
    this.el.titleMuteBtn.textContent = this.store.save.muted ? 'SFX OFF' : 'SFX ON';
  }

  syncTouchVisibility() {
    const mode = this.store.save.showTouchControls;
    this.el.titleTouchBtn.textContent = `PAD ${mode.toUpperCase()}`;
    const inCombat = this.engine && this.engine.mode !== 'title';
    const isTouchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 920;
    const visible = Boolean(inCombat) && (mode === 'on' ? true : mode === 'off' ? false : isTouchCapable);

    this.el.touchControls.classList.toggle('hidden', !visible);
    if (this.el.hintBar) {
      this.el.hintBar.classList.toggle('hidden', !inCombat || visible);
    }
  }

  onModeChanged(mode) {
    const isTitle = mode === 'title';
    this.el.titleScreen.classList.toggle('hidden', !isTitle);
    this.el.topHud.classList.toggle('hidden', isTitle);
    if (isTitle) {
      this.syncTitleScreen();
    }
    this.syncTouchVisibility();
  }

  syncTitleScreen() {
    const curLvl = this.store.save.unlockedLevel || 1;
    const actId = Math.ceil(curLvl / 10);
    this.el.titleContinueSub.textContent = `ACT ${actId} • LV ${curLvl}`;
    this.el.titleStarsBadge.textContent = `${this.store.getTotalStars()} / 150 ★`;
    this.el.titleWalletBadge.textContent = `${this.store.save.coins}c • ${this.store.save.gems}g`;

    if (this.store.isEndlessUnlocked()) {
      this.el.titleEndlessBadge.textContent = `BEST WAVE ${this.store.save.endless.bestWave} • ${this.store.save.endless.totalKOs} KOs`;
    } else {
      this.el.titleEndlessBadge.textContent = 'LOCKED (CLEAR LV 50)';
    }

    const readyClaims = MILESTONE_CHALLENGES.filter(
      (c) => !this.store.save.claimedChallenges.includes(c.id) && this.store.getChallengeProgress(c) >= c.target
    ).length;
    this.el.titleChalBadge.textContent =
      readyClaims > 0
        ? `${readyClaims} READY!`
        : `${this.store.save.claimedChallenges.length}/${MILESTONE_CHALLENGES.length}`;
  }

  syncCurrencies() {
    this.el.coinsVal.textContent = this.store.save.coins;
    this.el.gemsVal.textContent = this.store.save.gems;
    this.el.storeCoins.textContent = this.store.save.coins;
    this.el.storeGems.textContent = this.store.save.gems;
    this.el.levelsCoins.textContent = this.store.save.coins;
    this.el.levelsGems.textContent = this.store.save.gems;
  }

  showToast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.classList.remove('visible');
    }, 2000);
  }

  showWaveBanner(text) {
    this.el.waveBanner.textContent = text;
    this.el.waveBanner.classList.add('visible');
    clearTimeout(this.waveBannerTimer);
    this.waveBannerTimer = setTimeout(() => {
      this.el.waveBanner.classList.remove('visible');
    }, 1800);
  }

  onMatchStart(level, activeBuffs = []) {
    this.el.levelTag.textContent = this.engine.mode === 'endless' ? `ENDLESS • W${level.id}` : `ACT ${level.actId} • LV ${level.id}`;
    this.el.actName.textContent = level.act.name;
    this.syncCurrencies();

    this.el.hudBuffs.innerHTML = '';
    for (const id of activeBuffs) {
      const def = CONSUMABLES.find((c) => c.id === id);
      if (!def) continue;
      const pill = document.createElement('span');
      pill.className = 'buff-pill';
      pill.textContent = def.short;
      this.el.hudBuffs.appendChild(pill);
    }

    // Boss bar phase markers
    if (level.isBoss) {
      const ticks = level.id === 50 ? [33, 66] : [50];
      this.el.bossMarkers.innerHTML = ticks
        .map((pct) => `<span class="boss-tick" style="left:${pct}%"></span>`)
        .join('');
    }
  }

  updateHud({ player, boss, enemiesAlive, waveIndex, waveTotal }) {
    if (!player) return;
    const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
    this.el.hpFill.style.width = `${hpPct}%`;
    this.el.hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;

    const guardPct = Math.max(0, Math.min(100, (player.guard / player.maxGuard) * 100));
    this.el.guardFill.style.width = `${guardPct}%`;

    const spPct = Math.max(0, Math.min(100, player.special));
    this.el.spFill.style.width = `${spPct}%`;
    const spReady = spPct >= 100;
    this.el.spReadyTag.classList.toggle('hidden', !spReady);
    if (this.el.touchSpecialBtn) {
      this.el.touchSpecialBtn.classList.toggle('ready', spReady);
      this.el.touchSpecialBtn.disabled = !spReady;
    }

    this.el.waveTag.textContent = `W${waveIndex}/${waveTotal} • ${enemiesAlive} FOE${enemiesAlive === 1 ? '' : 'S'}`;

    if (player.comboCount >= 2) {
      this.el.comboBox.classList.remove('hidden');
      this.el.comboNum.textContent = `${player.comboCount}x`;
    } else {
      this.el.comboBox.classList.add('hidden');
    }

    if (boss) {
      this.el.bossBarWrap.classList.remove('hidden');
      this.el.bossName.textContent = `${boss.name.toUpperCase()} — PHASE ${boss.bossPhase}`;
      this.el.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    } else {
      this.el.bossBarWrap.classList.add('hidden');
    }
  }

  togglePause() {
    if (this.activeModal === 'pause') {
      this.closeModal();
    } else if (!this.activeModal && this.engine && this.engine.mode !== 'title') {
      this.openModal('pause');
    }
  }

  openModal(name) {
    this.activeModal = name;
    if (this.engine) this.engine.setPaused(true);

    this.el.modalBackdrop.classList.remove('hidden');
    this.el.storeModal.classList.toggle('hidden', name !== 'store');
    this.el.levelsModal.classList.toggle('hidden', name !== 'levels');
    this.el.challengesModal.classList.toggle('hidden', name !== 'challenges');
    this.el.settingsModal.classList.toggle('hidden', name !== 'settings');
    this.el.pauseModal.classList.toggle('hidden', name !== 'pause');
    this.el.resultModal.classList.toggle('hidden', name !== 'result');

    if (name === 'store') {
      this.renderStore();
      this.previewStage.start();
    } else {
      this.previewStage.stop();
    }

    if (name === 'levels') {
      this.campaignAct = Math.ceil((this.store.save.selectedLevel || 1) / 10);
      this.selectedPreviewLevel = this.store.save.selectedLevel || 1;
      this.renderLevels();
    }
    if (name === 'challenges') this.renderChallenges();
    if (name === 'settings') this.syncSettings();
    if (name === 'pause') this.syncPauseModal();
  }

  closeModal() {
    this.activeModal = null;
    this.previewStage.stop();
    this.el.modalBackdrop.classList.add('hidden');
    this.el.storeModal.classList.add('hidden');
    this.el.levelsModal.classList.add('hidden');
    this.el.challengesModal.classList.add('hidden');
    this.el.settingsModal.classList.add('hidden');
    this.el.pauseModal.classList.add('hidden');
    this.el.resultModal.classList.add('hidden');
    this.syncTitleScreen();
    if (this.engine && !this.engine.matchEnded && this.engine.mode !== 'title') {
      this.engine.setPaused(false);
    }
  }

  syncPauseModal() {
    const lvl = this.engine.level;
    this.el.pauseObjective.textContent = `${lvl.title} • ${lvl.act.hazardLabel || ''}`;
    const slots = this.store.getActiveLoadoutIds();
    this.el.pauseConsumables.innerHTML = slots.length
      ? slots.map((id) => `<span class="buff-pill">${CONSUMABLES.find((c) => c.id === id)?.name}</span>`).join('')
      : '<span class="modal-sub">No consumables equipped</span>';
  }

  syncSettings() {
    this.el.endlessPreviewBtn.textContent = this.store.save.endless.previewUnlocked ? 'ON' : 'OFF';
    this.el.endlessPreviewBtn.className = `btn ${this.store.save.endless.previewUnlocked ? 'btn-active' : 'btn-secondary'}`;
  }

  showVictory(data) {
    this.syncCurrencies();
    this.el.resultTitle.textContent = data.level.id === 50 ? 'VICTORY FINALE!' : 'STAGE CLEARED!';
    this.el.resultTitle.className = 'modal-title victory';
    this.el.resultStars.textContent = '★'.repeat(data.stars) + '☆'.repeat(3 - data.stars);
    this.el.resultSub.textContent = `${data.level.title} • Rank ${data.rank}`;

    if (data.unlockedSignature) {
      this.el.resultAlert.textContent = `BOSS REWARD UNLOCKED: ${data.unlockedSignature}!`;
      this.el.resultAlert.classList.remove('hidden');
    } else if (data.level.id === 50) {
      this.el.resultAlert.textContent = 'ENDLESS SURVIVAL MODE UNLOCKED!';
      this.el.resultAlert.classList.remove('hidden');
    } else {
      this.el.resultAlert.classList.add('hidden');
    }

    this.el.resultStats.innerHTML = `
      <div class="stat-pill"><span>Clear Time</span><strong>${data.time.toFixed(1)}s</strong></div>
      <div class="stat-pill"><span>Max Combo</span><strong>${data.maxCombo}x</strong></div>
      <div class="stat-pill"><span>Coins Earned</span><strong>+${data.coinsEarned}</strong></div>
      <div class="stat-pill"><span>Gems Earned</span><strong>+${data.gemsEarned}</strong></div>
    `;
    this.el.resultNextBtn.classList.toggle('hidden', data.level.id >= 50);
    this.openModal('result');
  }

  showDefeat(data) {
    this.el.resultTitle.textContent = 'DEFEATED';
    this.el.resultTitle.className = 'modal-title defeat';
    this.el.resultStars.textContent = '';
    this.el.resultSub.textContent = data.bossHpPct !== null
      ? `${data.level.act.bossName} had ${data.bossHpPct}% HP left.`
      : `Fell on Wave ${data.waveReached}/${data.waveTotal}.`;
    this.el.resultAlert.textContent = `TIP: ${data.level.tip}`;
    this.el.resultAlert.classList.remove('hidden');
    this.el.resultStats.innerHTML = `
      <div class="stat-pill"><span>Max Combo</span><strong>${data.maxCombo}x</strong></div>
      <div class="stat-pill"><span>Stage</span><strong>LV ${data.level.id} / 50</strong></div>
    `;
    this.el.resultNextBtn.classList.add('hidden');
    this.openModal('result');
  }

  showEndlessSummary(data) {
    this.syncCurrencies();
    this.el.resultTitle.textContent = 'ENDLESS RUN OVER';
    this.el.resultTitle.className = 'modal-title victory';
    this.el.resultStars.textContent = '';
    this.el.resultSub.textContent = `Reached Wave ${data.waveReached} • Cleared ${data.wavesCleared} Waves`;
    this.el.resultAlert.classList.add('hidden');
    this.el.resultStats.innerHTML = `
      <div class="stat-pill"><span>Total KOs</span><strong>${data.kos}</strong></div>
      <div class="stat-pill"><span>Max Combo</span><strong>${data.maxCombo}x</strong></div>
      <div class="stat-pill"><span>Coins Earned</span><strong>+${data.coinsEarned}</strong></div>
      <div class="stat-pill"><span>Gems Earned</span><strong>+${data.gemsEarned}</strong></div>
    `;
    this.el.resultNextBtn.classList.add('hidden');
    this.openModal('result');
  }

  updatePreviewStage() {
    const wId = this.hoveredWeaponId || this.store.save.equippedWeapon;
    const wTier = this.store.getWeaponTier(wId);
    const cosId = this.hoveredCosmeticId || this.store.save.equippedCosmetic;
    const cos = COSMETICS.find((c) => c.id === cosId) || this.store.getEquippedCosmetic();
    const wName = WEAPONS.find((w) => w.id === wId)?.name || 'Bare Fists';

    this.previewStage.setLoadout(wId, wTier, cos);
    this.el.previewCaption.textContent = `${wName} (Lv.${wTier}) • ${cos.name}`;

    const slots = this.store.save.loadoutSlots;
    this.el.previewSlots.innerHTML = slots
      .map((id, idx) => {
        if (!id || (this.store.save.consumables[id] || 0) <= 0) {
          return `<div class="slot-chip">SLOT ${idx + 1}: EMPTY</div>`;
        }
        const def = CONSUMABLES.find((c) => c.id === id);
        return `<div class="slot-chip filled">${def.short} (x${this.store.save.consumables[id]})</div>`;
      })
      .join('');
  }

  renderStore() {
    this.syncCurrencies();
    this.updatePreviewStage();
    const root = this.el.storeContent;
    root.innerHTML = '';

    if (this.storeTab === 'weapons') {
      WEAPONS.forEach((w) => {
        const owned = this.store.save.ownedWeapons.includes(w.id);
        const equipped = this.store.save.equippedWeapon === w.id;
        const tier = this.store.getWeaponTier(w.id);
        const unlockedStage = this.store.save.unlockedLevel >= w.unlockLevel;
        const upgCost = owned && tier < 5 ? getWeaponUpgradeCost(w.id, tier) : null;

        const card = document.createElement('div');
        card.className = `store-card ${equipped ? 'equipped' : ''}`;
        card.innerHTML = `
          <div class="store-card-head">
            <div>
              <div class="item-name">${w.name}
                ${owned ? `<span class="tier-badge">LV ${tier}/5</span>` : ''}
                ${owned && tier >= 5 ? `<span class="tier-badge element-badge">${w.elementalTrail}</span>` : ''}
              </div>
              <div class="item-sub">${w.subtitle} • Finisher: ${w.finisher.name}</div>
            </div>
            <span class="swatch" style="background:${w.trailColor}"></span>
          </div>
          <div class="stat-bars">
            <span>Reach ${w.stats.reach}/10</span>
            <span>Speed ${w.stats.speed}/10</span>
            <span>Power ${w.stats.power}/10</span>
          </div>
          <div class="store-card-actions">
            <button class="btn ${equipped ? 'btn-active' : 'btn-primary'}" data-w-act="${w.id}" ${!owned && !unlockedStage ? 'disabled' : ''}>
              ${
                equipped
                  ? 'EQUIPPED'
                  : owned
                  ? 'EQUIP'
                  : !unlockedStage
                  ? `UNLOCKS AT LV ${w.unlockLevel}`
                  : `BUY (${w.unlockCoins}c${w.unlockGems ? ` + ${w.unlockGems}g` : ''})`
              }
            </button>
            ${
              owned
                ? `<button class="btn btn-secondary" data-w-upg="${w.id}" ${tier >= 5 ? 'disabled' : ''}>
                    ${tier >= 5 ? 'MAX LV 5' : `UPGRADE (${upgCost.coins}c${upgCost.gems ? ` + ${upgCost.gems}g` : ''})`}
                   </button>`
                : ''
            }
          </div>
        `;
        card.addEventListener('mouseenter', () => {
          this.hoveredWeaponId = w.id;
          this.updatePreviewStage();
        });
        card.addEventListener('mouseleave', () => {
          this.hoveredWeaponId = null;
          this.updatePreviewStage();
        });
        root.appendChild(card);
      });

      root.querySelectorAll('[data-w-act]').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.store.buyOrEquipWeapon(b.getAttribute('data-w-act'));
          this.showToast(res.msg);
          if (res.ok) this.sound.coin();
          this.renderStore();
        });
      });
      root.querySelectorAll('[data-w-upg]').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.store.upgradeWeapon(b.getAttribute('data-w-upg'));
          this.showToast(res.msg);
          if (res.ok) this.sound.coin();
          this.renderStore();
        });
      });
    } else if (this.storeTab === 'stats') {
      STAT_UPGRADES.forEach((st) => {
        const lvl = this.store.save.stats[st.id] || 0;
        const cost = this.store.getStatUpgradeCost(st.id);
        const segs = Array.from({ length: st.maxLevel }, (_, i) => `<span class="seg ${i < lvl ? 'filled' : ''}"></span>`).join('');
        const card = document.createElement('div');
        card.className = 'store-card';
        card.innerHTML = `
          <div class="store-card-head">
            <div>
              <div class="item-name">${st.name} <span class="tier-badge">+${lvl * st.bonusPct}% TOTAL</span></div>
              <div class="item-sub">${st.desc} (${st.bonusPerLevel})</div>
            </div>
          </div>
          <div class="seg-bar">${segs}</div>
          <div class="store-card-actions">
            <button class="btn btn-primary" data-stat-upg="${st.id}" ${cost === null ? 'disabled' : ''}>
              ${cost === null ? 'MAXED' : `UPGRADE (${cost} Coins)`}
            </button>
          </div>
        `;
        root.appendChild(card);
      });

      root.querySelectorAll('[data-stat-upg]').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.store.upgradeStat(b.getAttribute('data-stat-upg'));
          this.showToast(res.msg);
          if (res.ok) this.sound.coin();
          this.renderStore();
        });
      });
    } else if (this.storeTab === 'consumables') {
      CONSUMABLES.forEach((c) => {
        const count = this.store.save.consumables[c.id] || 0;
        const slotted = this.store.save.loadoutSlots.includes(c.id);
        const card = document.createElement('div');
        card.className = `store-card ${slotted ? 'equipped' : ''}`;
        card.innerHTML = `
          <div class="store-card-head">
            <div>
              <div class="item-name">${c.name} <span class="tier-badge">${c.badge}</span></div>
              <div class="item-sub">${c.desc}</div>
            </div>
            <div class="stock-pill">x${count}</div>
          </div>
          <div class="store-card-actions">
            <button class="btn btn-primary" data-cons-buy="${c.id}">BUY (${c.costCoins} Coins)</button>
            <button class="btn ${slotted ? 'btn-active' : 'btn-secondary'}" data-cons-slot="${c.id}" ${count <= 0 ? 'disabled' : ''}>
              ${slotted ? 'EQUIPPED IN SLOT' : 'EQUIP TO SLOT'}
            </button>
          </div>
        `;
        root.appendChild(card);
      });

      root.querySelectorAll('[data-cons-buy]').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.store.buyConsumable(b.getAttribute('data-cons-buy'));
          this.showToast(res.msg);
          if (res.ok) this.sound.coin();
          this.renderStore();
        });
      });
      root.querySelectorAll('[data-cons-slot]').forEach((b) => {
        b.addEventListener('click', () => {
          this.store.toggleConsumableSlot(b.getAttribute('data-cons-slot'));
          this.sound.uiClick();
          this.renderStore();
        });
      });
    } else if (this.storeTab === 'cosmetics') {
      COSMETICS.forEach((cos) => {
        const owned = this.store.save.ownedCosmetics.includes(cos.id);
        const equipped = this.store.save.equippedCosmetic === cos.id;
        const card = document.createElement('div');
        card.className = `store-card ${equipped ? 'equipped' : ''}`;
        card.innerHTML = `
          <div class="store-card-head">
            <div>
              <div class="item-name">${cos.name} <span class="tier-badge">${cos.category}</span></div>
              <div class="item-sub">${cos.desc}</div>
            </div>
            <span class="swatch" style="background:${cos.scarf}"></span>
          </div>
          <div class="store-card-actions">
            <button class="btn ${equipped ? 'btn-active' : 'btn-primary'}" data-cos-act="${cos.id}">
              ${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `UNLOCK (${cos.costGems} Gems)`}
            </button>
          </div>
        `;
        card.addEventListener('mouseenter', () => {
          this.hoveredCosmeticId = cos.id;
          this.updatePreviewStage();
        });
        card.addEventListener('mouseleave', () => {
          this.hoveredCosmeticId = null;
          this.updatePreviewStage();
        });
        root.appendChild(card);
      });

      root.querySelectorAll('[data-cos-act]').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.store.buyOrEquipCosmetic(b.getAttribute('data-cos-act'));
          this.showToast(res.msg);
          if (res.ok) this.sound.coin();
          this.renderStore();
        });
      });
    }
  }

  renderLevels() {
    this.syncCurrencies();
    this.el.levelsTotalStars.textContent = `${this.store.getTotalStars()} / 150 ★`;
    this.el.levelsActTabs.innerHTML = '';

    ACTS.forEach((act) => {
      const tab = document.createElement('button');
      const actStars = this.store.getActStars(act.id);
      const actUnlocked = this.store.save.unlockedLevel >= (act.id - 1) * 10 + 1;
      tab.className = `tab-btn ${this.campaignAct === act.id ? 'active' : ''}`;
      tab.textContent = `Act ${act.id}: ${act.name} (${actStars}/30 ★)${actUnlocked ? '' : ' 🔒'}`;
      tab.addEventListener('click', () => {
        this.campaignAct = act.id;
        this.renderLevels();
      });
      this.el.levelsActTabs.appendChild(tab);
    });

    const actLevels = LEVELS.filter((l) => l.actId === this.campaignAct);
    this.el.levelsGrid.innerHTML = '';
    const act = ACTS[this.campaignAct - 1];

    const header = document.createElement('div');
    header.className = 'act-banner';
    header.style.borderColor = act.accent;
    header.innerHTML = `<div><strong>${act.name}</strong><span> • ${act.subtitle}</span></div><span>Hazard: ${act.hazardLabel}</span>`;
    this.el.levelsGrid.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'level-cards';

    actLevels.forEach((lvl) => {
      const unlocked = lvl.id <= this.store.save.unlockedLevel;
      const rec = this.store.save.completedLevels[lvl.id];
      const stars = rec ? rec.stars : 0;
      const selected = this.selectedPreviewLevel === lvl.id;

      const btn = document.createElement('button');
      btn.className = `level-btn ${lvl.isBoss ? 'boss' : ''} ${selected ? 'selected' : ''}`;
      btn.disabled = !unlocked;
      const badge =
        lvl.stageType === 'BOSS' ? `BOSS: ${act.bossName}` :
        lvl.stageType === 'MINIBOSS' ? 'ELITE DUEL' :
        lvl.stageType === 'SURVIVAL' ? 'SURVIVAL' :
        lvl.stageType === 'GAUNTLET' ? 'GAUNTLET' : 'STAGE';

      btn.innerHTML = `
        <span class="lvl-num">${lvl.isBoss ? 'LV ' + lvl.id : 'LV ' + lvl.id}</span>
        <span class="lvl-badge">${badge}</span>
        <span class="lvl-stars">${unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'LOCKED'}</span>
        <span class="lvl-time">${rec ? `${rec.bestTime.toFixed(1)}s` : `${lvl.waves.length} Wave${lvl.waves.length > 1 ? 's' : ''}`}</span>
      `;
      btn.addEventListener('click', () => {
        this.selectedPreviewLevel = lvl.id;
        this.renderLevels();
      });
      grid.appendChild(btn);
    });

    this.el.levelsGrid.appendChild(grid);

    // Stage Preview & Launch Footer
    const sel = getLevel(this.selectedPreviewLevel);
    const unlocked = sel.id <= this.store.save.unlockedLevel;
    const activeSlots = this.store.getActiveLoadoutIds()
      .map((id) => CONSUMABLES.find((c) => c.id === id)?.short)
      .join(', ') || 'None';

    this.el.stageFooter.innerHTML = `
      <div class="stage-footer-info">
        <strong>LV ${sel.id}: ${sel.title}</strong>
        <span class="stage-footer-meta">Hazards: ${sel.act.hazardLabel} • Stars: Clear, &le;${sel.timeTarget}s, ${sel.comboTarget}x Combo / No-Hit • Loadout: ${activeSlots}</span>
      </div>
      <button id="btn-launch-stage" class="btn btn-primary" type="button" ${unlocked ? '' : 'disabled'}>FIGHT STAGE ${sel.id}</button>
    `;

    document.getElementById('btn-launch-stage').addEventListener('click', () => {
      this.closeModal();
      this.engine.startCampaignLevel(sel.id);
    });
  }

  renderChallenges() {
    const root = this.el.challengesContent;
    root.innerHTML = '';

    MILESTONE_CHALLENGES.forEach((ch) => {
      const prog = Math.min(ch.target, this.store.getChallengeProgress(ch));
      const claimed = this.store.save.claimedChallenges.includes(ch.id);
      const ready = prog >= ch.target && !claimed;

      const card = document.createElement('div');
      card.className = `store-card ${ready ? 'equipped' : ''}`;
      card.innerHTML = `
        <div class="store-card-head">
          <div>
            <div class="item-name">${ch.title}</div>
            <div class="item-sub">${ch.desc}</div>
          </div>
          <div class="stock-pill">${prog} / ${ch.target}</div>
        </div>
        <div class="store-card-actions">
          <button class="btn ${claimed ? 'btn-active' : ready ? 'btn-primary' : 'btn-secondary'}" data-claim-ch="${ch.id}" ${ready ? '' : 'disabled'}>
            ${claimed ? 'CLAIMED' : ready ? `CLAIM (+${ch.rewardCoins}c, +${ch.rewardGems}g)` : `REWARD: ${ch.rewardCoins}c + ${ch.rewardGems}g`}
          </button>
        </div>
      `;
      root.appendChild(card);
    });

    root.querySelectorAll('[data-claim-ch]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = this.store.claimChallenge(b.getAttribute('data-claim-ch'));
        this.showToast(res.msg);
        if (res.ok) this.sound.coin();
        this.syncCurrencies();
        this.renderChallenges();
      });
    });
  }
}
