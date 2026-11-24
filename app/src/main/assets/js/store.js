import { CONSUMABLES, COSMETICS, MILESTONE_CHALLENGES, STAT_UPGRADES } from './constants.js';
import { getWeaponTierMultiplier, getWeaponUpgradeCost, WEAPON_MAP } from './weapons.js';

const SAVE_KEY = 'stickman_fighter_save_v1';
const LEGACY_SAVE_KEY = 'ink_blade_save_v1';

export function createDefaultSave() {
  return {
    version: 1,
    unlockedLevel: 1,
    selectedLevel: 1,
    completedLevels: {}, // { [levelId]: { stars: 1..3, bestTime: number, rank: 'S'|'A'|'B' } }
    coins: 120,
    gems: 6,
    ownedWeapons: ['fists'],
    weaponTiers: { fists: 1 },
    equippedWeapon: 'fists',
    stats: {
      vitality: 0,
      force: 0,
      agility: 0,
      focus: 0,
    },
    consumables: {
      healing_scroll: 1,
      rage_elixir: 0,
      iron_tonic: 0,
      shadow_vial: 0,
      lucky_charm: 0,
    },
    loadoutSlots: ['healing_scroll', null], // 2 active pre-match consumable slots
    ownedCosmetics: ['crimson'],
    equippedCosmetic: 'crimson',
    endless: {
      unlocked: false,
      previewUnlocked: false,
      bestWave: 0,
      bestCombo: 0,
      totalKOs: 0,
    },
    records: {
      totalParries: 0,
      bestComboEver: 0,
      bossesNoHit: 0,
    },
    claimedChallenges: [],
    muted: false,
    showTouchControls: 'auto', // 'auto' | 'on' | 'off'
  };
}

export class StoreManager {
  constructor() {
    this.save = this.load();
  }

  load() {
    try {
      let raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) {
        raw = window.localStorage.getItem(LEGACY_SAVE_KEY);
      }
      if (!raw) return createDefaultSave();
      const parsed = JSON.parse(raw);
      return this.sanitizeSave(parsed);
    } catch {
      return createDefaultSave();
    }
  }

  sanitizeSave(parsed) {
    const def = createDefaultSave();
    const completed = {};
    if (parsed.completedLevels && typeof parsed.completedLevels === 'object') {
      for (const [k, v] of Object.entries(parsed.completedLevels)) {
        if (typeof v === 'string') {
          completed[k] = {
            stars: v === 'S' ? 3 : v === 'A' ? 2 : 1,
            bestTime: 45,
            rank: v,
          };
        } else if (v && typeof v === 'object') {
          completed[k] = {
            stars: Math.max(1, Math.min(3, Number(v.stars) || 1)),
            bestTime: Number(v.bestTime) || 60,
            rank: v.rank || 'B',
          };
        }
      }
    }

    const slots = Array.isArray(parsed.loadoutSlots)
      ? [parsed.loadoutSlots[0] || null, parsed.loadoutSlots[1] || null]
      : [...def.loadoutSlots];

    return {
      ...def,
      ...parsed,
      version: 1,
      unlockedLevel: Math.max(1, Math.min(50, Number(parsed.unlockedLevel) || 1)),
      selectedLevel: Math.max(1, Math.min(50, Number(parsed.selectedLevel) || 1)),
      coins: Math.max(0, Number(parsed.coins) || 0),
      gems: Math.max(0, Number(parsed.gems) || 0),
      completedLevels: completed,
      stats: { ...def.stats, ...(parsed.stats || {}) },
      weaponTiers: { ...def.weaponTiers, ...(parsed.weaponTiers || {}) },
      consumables: { ...def.consumables, ...(parsed.consumables || {}) },
      loadoutSlots: slots,
      ownedWeapons: Array.isArray(parsed.ownedWeapons) && parsed.ownedWeapons.length ? parsed.ownedWeapons : ['fists'],
      ownedCosmetics: Array.isArray(parsed.ownedCosmetics) && parsed.ownedCosmetics.length ? parsed.ownedCosmetics : ['crimson'],
      endless: { ...def.endless, ...(parsed.endless || {}) },
      records: { ...def.records, ...(parsed.records || {}) },
      claimedChallenges: Array.isArray(parsed.claimedChallenges) ? parsed.claimedChallenges : [],
    };
  }

  persist() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }

  exportJson() {
    return JSON.stringify(this.save, null, 2);
  }

  importJson(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return false;
      this.save = this.sanitizeSave(parsed);
      this.persist();
      return true;
    } catch {
      return false;
    }
  }

  resetAll() {
    this.save = createDefaultSave();
    this.persist();
  }

  getTotalStars() {
    return Object.values(this.save.completedLevels).reduce((sum, e) => sum + (e.stars || 0), 0);
  }

  getActStars(actId) {
    let sum = 0;
    const start = (actId - 1) * 10 + 1;
    for (let i = start; i < start + 10; i++) {
      sum += this.save.completedLevels[i]?.stars || 0;
    }
    return sum;
  }

  isEndlessUnlocked() {
    return Boolean(this.save.endless.unlocked || this.save.endless.previewUnlocked || this.save.completedLevels[50]);
  }

  getEquippedWeapon() {
    return WEAPON_MAP[this.save.equippedWeapon] || WEAPON_MAP.fists;
  }

  getWeaponTier(weaponId) {
    return this.save.weaponTiers[weaponId] || 1;
  }

  getEquippedCosmetic() {
    return COSMETICS.find((c) => c.id === this.save.equippedCosmetic) || COSMETICS[0];
  }

  getStatUpgradeCost(statId) {
    const def = STAT_UPGRADES.find((s) => s.id === statId);
    const lvl = this.save.stats[statId] || 0;
    if (!def || lvl >= def.maxLevel) return null;
    return Math.round(def.baseCost * Math.pow(def.costScale, lvl));
  }

  getActiveLoadoutIds() {
    return this.save.loadoutSlots.filter((id) => id && (this.save.consumables[id] || 0) > 0);
  }

  getPlayerModifiers() {
    const s = this.save.stats;
    const weapon = this.getEquippedWeapon();
    const tier = this.getWeaponTier(weapon.id);
    const activeIds = this.getActiveLoadoutIds();
    const has = (id) => activeIds.includes(id);

    return {
      maxHp: 120 + (s.vitality || 0) * 18,
      damageMult:
        weapon.damageMult *
        getWeaponTierMultiplier(tier) *
        (1 + (s.force || 0) * 0.08) *
        (has('rage_elixir') ? 1.25 : 1),
      speedMult: 1 + (s.agility || 0) * 0.04,
      dashCooldownMult: Math.max(0.55, 1 - (s.agility || 0) * 0.04),
      meterGainMult: (1 + (s.focus || 0) * 0.1) * (has('rage_elixir') ? 1.2 : 1),
      guardRegenMult: 1 + (s.focus || 0) * 0.1,
      maxGuard: Math.round(100 * (has('iron_tonic') ? 1.35 : 1)),
      damageTakenMult: has('iron_tonic') ? 0.75 : 1,
      parryWindowBonus: has('shadow_vial') ? 0.07 : 0,
      dashIframeBonus: has('shadow_vial') ? 0.08 : 0,
      hasHealingScroll: has('healing_scroll'),
      hasLuckyCharm: has('lucky_charm'),
      activeConsumables: activeIds,
    };
  }

  consumeArmedForMatch() {
    const consumed = {};
    for (let i = 0; i < this.save.loadoutSlots.length; i++) {
      const id = this.save.loadoutSlots[i];
      if (id && (this.save.consumables[id] || 0) > 0) {
        consumed[id] = true;
        this.save.consumables[id] -= 1;
        if (this.save.consumables[id] <= 0) {
          this.save.loadoutSlots[i] = null;
        }
      }
    }
    this.persist();
    return consumed;
  }

  buyOrEquipWeapon(weaponId) {
    const w = WEAPON_MAP[weaponId];
    if (!w) return { ok: false, msg: 'Unknown weapon' };
    if (this.save.ownedWeapons.includes(weaponId)) {
      this.save.equippedWeapon = weaponId;
      this.persist();
      return { ok: true, msg: `Equipped ${w.name}` };
    }
    if (this.save.unlockedLevel < w.unlockLevel) {
      return { ok: false, msg: `Unlocks at Level ${w.unlockLevel}` };
    }
    if (this.save.coins < w.unlockCoins || this.save.gems < w.unlockGems) {
      return { ok: false, msg: 'Not enough Coins or Gems' };
    }
    this.save.coins -= w.unlockCoins;
    this.save.gems -= w.unlockGems;
    this.save.ownedWeapons.push(weaponId);
    this.save.weaponTiers[weaponId] = 1;
    this.save.equippedWeapon = weaponId;
    this.persist();
    return { ok: true, msg: `Unlocked & equipped ${w.name}!` };
  }

  upgradeWeapon(weaponId) {
    if (!this.save.ownedWeapons.includes(weaponId)) return { ok: false, msg: 'Unlock weapon first' };
    const tier = this.getWeaponTier(weaponId);
    if (tier >= 5) return { ok: false, msg: 'Max tier reached' };
    const cost = getWeaponUpgradeCost(weaponId, tier);
    if (this.save.coins < cost.coins || this.save.gems < cost.gems) {
      return { ok: false, msg: 'Insufficient resources' };
    }
    this.save.coins -= cost.coins;
    this.save.gems -= cost.gems;
    this.save.weaponTiers[weaponId] = tier + 1;
    this.persist();
    return { ok: true, msg: `${WEAPON_MAP[weaponId].name} upgraded to Lv.${tier + 1}` };
  }

  upgradeStat(statId) {
    const cost = this.getStatUpgradeCost(statId);
    if (cost === null) return { ok: false, msg: 'Stat maxed out' };
    if (this.save.coins < cost) return { ok: false, msg: 'Not enough Coins' };
    this.save.coins -= cost;
    this.save.stats[statId] = (this.save.stats[statId] || 0) + 1;
    this.persist();
    return { ok: true, msg: 'Stat upgraded!' };
  }

  buyConsumable(id) {
    const item = CONSUMABLES.find((c) => c.id === id);
    if (!item) return { ok: false, msg: 'Invalid item' };
    if (this.save.coins < item.costCoins || this.save.gems < item.costGems) {
      return { ok: false, msg: 'Not enough Coins or Gems' };
    }
    this.save.coins -= item.costCoins;
    this.save.gems -= item.costGems;
    this.save.consumables[id] = (this.save.consumables[id] || 0) + 1;
    // Auto-slot if a slot is free and not already slotted
    if (!this.save.loadoutSlots.includes(id)) {
      const emptyIdx = this.save.loadoutSlots.findIndex((s) => s === null);
      if (emptyIdx !== -1) this.save.loadoutSlots[emptyIdx] = id;
    }
    this.persist();
    return { ok: true, msg: `Purchased ${item.name}` };
  }

  toggleConsumableSlot(id) {
    if ((this.save.consumables[id] || 0) <= 0) return false;
    const idx = this.save.loadoutSlots.indexOf(id);
    if (idx !== -1) {
      this.save.loadoutSlots[idx] = null;
    } else {
      const emptyIdx = this.save.loadoutSlots.findIndex((s) => s === null);
      if (emptyIdx !== -1) {
        this.save.loadoutSlots[emptyIdx] = id;
      } else {
        // Rotate slot 1 -> slot 0
        this.save.loadoutSlots[0] = this.save.loadoutSlots[1];
        this.save.loadoutSlots[1] = id;
      }
    }
    this.persist();
    return true;
  }

  buyOrEquipCosmetic(id) {
    const cos = COSMETICS.find((c) => c.id === id);
    if (!cos) return { ok: false, msg: 'Unknown style' };
    if (this.save.ownedCosmetics.includes(id)) {
      this.save.equippedCosmetic = id;
      this.persist();
      return { ok: true, msg: `Equipped ${cos.name}` };
    }
    if (this.save.coins < cos.costCoins || this.save.gems < cos.costGems) {
      return { ok: false, msg: 'Not enough Coins or Gems' };
    }
    this.save.coins -= cos.costCoins;
    this.save.gems -= cos.costGems;
    this.save.ownedCosmetics.push(id);
    this.save.equippedCosmetic = id;
    this.persist();
    return { ok: true, msg: `Unlocked ${cos.name}!` };
  }

  getChallengeProgress(ch) {
    if (ch.statKey === 'totalStars') return this.getTotalStars();
    if (ch.statKey === 'maxWeaponTier') {
      return Math.max(1, ...Object.values(this.save.weaponTiers));
    }
    if (ch.statKey === 'endlessBestWave') return this.save.endless.bestWave || 0;
    return this.save.records[ch.statKey] || 0;
  }

  claimChallenge(challengeId) {
    const ch = MILESTONE_CHALLENGES.find((c) => c.id === challengeId);
    if (!ch || this.save.claimedChallenges.includes(challengeId)) return { ok: false, msg: 'Already claimed' };
    const prog = this.getChallengeProgress(ch);
    if (prog < ch.target) return { ok: false, msg: 'Not yet completed' };
    this.save.claimedChallenges.push(challengeId);
    this.save.coins += ch.rewardCoins;
    this.save.gems += ch.rewardGems;
    this.persist();
    return { ok: true, msg: `Claimed +${ch.rewardCoins} Coins & +${ch.rewardGems} Gems!` };
  }

  recordParry() {
    this.save.records.totalParries = (this.save.records.totalParries || 0) + 1;
    this.persist();
  }

  recordCombo(combo) {
    if (combo > (this.save.records.bestComboEver || 0)) {
      this.save.records.bestComboEver = combo;
      this.persist();
    }
  }

  recordVictory(levelObj, timeSec, maxCombo, tookDamage, hasLuckyCharm) {
    const isFirstClear = !this.save.completedLevels[levelObj.id];
    const metTime = timeSec <= levelObj.timeTarget;
    const metStyle = !tookDamage || maxCombo >= levelObj.comboTarget;
    const stars = 1 + (metTime ? 1 : 0) + (metStyle ? 1 : 0);
    const rank = stars === 3 ? 'S' : stars === 2 ? 'A' : 'B';

    const prev = this.save.completedLevels[levelObj.id];
    this.save.completedLevels[levelObj.id] = {
      stars: Math.max(prev?.stars || 0, stars),
      bestTime: prev ? Math.min(prev.bestTime, timeSec) : timeSec,
      rank: prev && prev.rank === 'S' ? 'S' : rank,
    };

    if (levelObj.id >= this.save.unlockedLevel && levelObj.id < 50) {
      this.save.unlockedLevel = levelObj.id + 1;
    }

    let unlockedSignature = null;
    if (levelObj.isBoss && levelObj.act.bossSignatureCosmetic) {
      const sigId = levelObj.act.bossSignatureCosmetic;
      if (!this.save.ownedCosmetics.includes(sigId)) {
        this.save.ownedCosmetics.push(sigId);
        unlockedSignature = COSMETICS.find((c) => c.id === sigId)?.name || null;
      }
      if (!tookDamage) {
        this.save.records.bossesNoHit = (this.save.records.bossesNoHit || 0) + 1;
      }
      if (levelObj.id === 50) {
        this.save.endless.unlocked = true;
      }
    }

    const comboBonus = Math.min(85, maxCombo * 4);
    let coinsEarned = levelObj.rewardCoins + comboBonus;
    let gemsEarned = levelObj.rewardGems + (isFirstClear ? levelObj.firstClearBonusGems : 0);
    if (stars === 3) {
      coinsEarned = Math.round(coinsEarned * 1.25);
      gemsEarned += 1;
    }
    if (hasLuckyCharm) {
      coinsEarned = Math.round(coinsEarned * 1.5);
      gemsEarned += 2;
    }

    this.save.coins += coinsEarned;
    this.save.gems += gemsEarned;
    this.persist();

    return {
      stars,
      rank,
      metTime,
      metStyle,
      coinsEarned,
      gemsEarned,
      isFirstClear,
      unlockedSignature,
    };
  }

  recordEndlessRun(wavesCleared, maxCombo, kos) {
    if (wavesCleared > (this.save.endless.bestWave || 0)) {
      this.save.endless.bestWave = wavesCleared;
    }
    if (maxCombo > (this.save.endless.bestCombo || 0)) {
      this.save.endless.bestCombo = maxCombo;
    }
    this.save.endless.totalKOs = (this.save.endless.totalKOs || 0) + kos;

    const coinsEarned = wavesCleared * 65 + kos * 12;
    const gemsEarned = Math.floor(wavesCleared / 2) + (wavesCleared >= 5 ? 3 : 0);
    this.save.coins += coinsEarned;
    this.save.gems += gemsEarned;
    this.persist();
    return { coinsEarned, gemsEarned };
  }
}
