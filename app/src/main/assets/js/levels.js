import { ARCHETYPES } from './constants.js';

export const ACTS = [
  {
    id: 1,
    name: 'Crimson Dojo',
    subtitle: 'Act I • Rice Paper & Cedar',
    skyTop: '#261417',
    skyBottom: '#8C4339',
    horizon: '#C98F73',
    floorTop: '#231618',
    floorBottom: '#110B0C',
    floorLine: '#D97757',
    accent: '#E63946',
    particleType: 'petals',
    bossId: 'kuro',
    bossName: 'Sensei Kuro',
    bossTitle: 'Master of the Crimson Gate',
    bossWeapon: 'bo_staff',
    bossSignatureCosmetic: 'kuro_band',
    hazardLabel: 'Breakable Crates',
  },
  {
    id: 2,
    name: 'Neon Rooftops',
    subtitle: 'Act II • Midnight Rain',
    skyTop: '#080D1A',
    skyBottom: '#15253E',
    horizon: '#1E3A5F',
    floorTop: '#161E2E',
    floorBottom: '#0A0E17',
    floorLine: '#38BDF8',
    accent: '#38BDF8',
    particleType: 'rain',
    bossId: 'gale',
    bossName: 'Gale',
    bossTitle: 'Skyline Viper',
    bossWeapon: 'twin_daggers',
    bossSignatureCosmetic: 'gale_neon',
    hazardLabel: 'Rooftop Platforms & Pitfalls',
  },
  {
    id: 3,
    name: 'Iron Foundry',
    subtitle: 'Act III • Molten Forge',
    skyTop: '#160E0C',
    skyBottom: '#3B1C12',
    horizon: '#7C2D12',
    floorTop: '#261D1A',
    floorBottom: '#120D0C',
    floorLine: '#FB923C',
    accent: '#F97316',
    particleType: 'embers',
    bossId: 'titan',
    bossName: 'Titan',
    bossTitle: 'Colossus of Slag',
    bossWeapon: 'gauntlets',
    bossSignatureCosmetic: 'titan_slag',
    hazardLabel: 'Pendulums & Steam Vents',
  },
  {
    id: 4,
    name: 'Shadow Temple',
    subtitle: 'Act IV • Moonlit Shrine',
    skyTop: '#0A0D18',
    skyBottom: '#1A2036',
    horizon: '#283655',
    floorTop: '#191D2A',
    floorBottom: '#0B0D14',
    floorLine: '#34D399',
    accent: '#10B981',
    particleType: 'wisps',
    bossId: 'mirage',
    bossName: 'Mirage',
    bossTitle: 'Wraith of the Shroud',
    bossWeapon: 'kusarigama',
    bossSignatureCosmetic: 'mirage_void',
    hazardLabel: 'Phasing Platforms & Shadow Fog',
  },
  {
    id: 5,
    name: 'Obsidian Citadel',
    subtitle: 'Act V • Sovereign Spire',
    skyTop: '#08060B',
    skyBottom: '#23101F',
    horizon: '#45122B',
    floorTop: '#17121C',
    floorBottom: '#08060A',
    floorLine: '#FBBF24',
    accent: '#FBBF24',
    particleType: 'ash',
    bossId: 'grandmaster',
    bossName: 'The Grandmaster',
    bossTitle: 'Eternal Blade Sovereign',
    bossWeapon: 'halberd',
    bossSignatureCosmetic: 'grandmaster_mythic',
    hazardLabel: 'Rune Waves & Combined Hazards',
  },
];

function getStageType(localNum) {
  if (localNum === 10) return 'BOSS';
  if (localNum === 9) return 'GAUNTLET';
  if (localNum === 5) return 'MINIBOSS';
  if (localNum === 4) return 'SURVIVAL';
  return 'STANDARD';
}

function getStageTip(levelNum, stageType, act) {
  if (stageType === 'BOSS') {
    if (act.id === 1) return 'Watch Kuro’s white staff glint—bait it or shatter his guard with Heavy (K).';
    if (act.id === 2) return 'Jump or Dash through Gale’s horizontal sightline slash and avoid the rooftop edges.';
    if (act.id === 3) return 'Jump over Titan’s molten floor shockwaves and watch red slag drop markers.';
    if (act.id === 4) return 'Look for the pulsing ground shadow to identify the real Mirage among her clones.';
    return 'Save Dash i-frames for the Grandmaster’s 1.2s circular Eclipse charge, then punish his 1s recovery.';
  }
  if (act.id === 2) return 'Use elevated platforms to dodge rushers and push foes toward the rooftop drop-offs.';
  if (act.id === 3) return 'Listen for the steam hiss and watch orange vents before they erupt.';
  if (act.id === 4) return 'Shimmering platforms fade soon—keep moving out of the edge shadow fog.';
  if (act.id === 5) return 'Jump or Dash cleanly over the Citadel’s glowing floor rune waves.';
  return 'Tap Block (L/S) right before impact for a Perfect Parry stagger and +28 Special Meter!';
}

function buildWavesForLevel(levelNum, localNum, stageType, act) {
  const scale = 1 + (levelNum - 1) * 0.085;

  if (stageType === 'BOSS') {
    const bossHp = Math.round(280 * (1 + (act.id - 1) * 0.62));
    const bossDmg = 1 + (act.id - 1) * 0.24;
    return [
      {
        enemies: [
          {
            archetype: ARCHETYPES.BOSS,
            bossId: act.bossId,
            name: act.bossName,
            title: act.bossTitle,
            weaponId: act.bossWeapon,
            maxHp: bossHp,
            dmgMult: bossDmg,
            speedMult: 1 + (act.id - 1) * 0.05,
            scarfColor: act.accent,
            scale: act.id === 3 ? 1.22 : 1.09,
            actId: act.id,
          },
        ],
      },
    ];
  }

  if (stageType === 'MINIBOSS') {
    return [
      {
        enemies: [
          {
            archetype: ARCHETYPES.RUSHER,
            name: 'Vanguard Disciple',
            weaponId: act.id >= 2 ? 'twin_daggers' : 'fists',
            maxHp: Math.round(80 * scale),
            dmgMult: 0.8 + (levelNum - 1) * 0.03,
            speedMult: 1.0 + act.id * 0.04,
            scarfColor: act.accent,
            scale: 1.0,
          },
          {
            archetype: ARCHETYPES.BRUTE,
            name: `${act.name} Champion`,
            weaponId: act.bossWeapon,
            maxHp: Math.round(165 * scale),
            dmgMult: 0.96 + (levelNum - 1) * 0.034,
            speedMult: 0.94 + act.id * 0.035,
            scarfColor: '#FACC15',
            scale: 1.15,
            isElite: true,
          },
        ],
      },
    ];
  }

  const waveCount =
    stageType === 'SURVIVAL' ? 3 :
    stageType === 'GAUNTLET' ? 4 :
    localNum <= 2 ? 1 :
    localNum <= 7 ? 2 : 3;

  const waves = [];
  for (let w = 0; w < waveCount; w++) {
    const count =
      levelNum === 1 && w === 0 ? 1 :
      stageType === 'SURVIVAL' ? (w === 2 ? 3 : 2) :
      stageType === 'GAUNTLET' ? (w >= 2 ? 3 : 2) :
      localNum <= 3 ? 2 :
      w === waveCount - 1 ? 3 : 2;

    const enemies = [];
    for (let i = 0; i < count; i++) {
      let archetype = ARCHETYPES.RUSHER;
      let weaponId = 'fists';
      let hpBase = 92;
      let speedMult = 1.04 + act.id * 0.045;
      let enemyScale = 1.0;

      const roll = (levelNum * 7 + w * 3 + i * 5) % 6;
      if (levelNum === 1 && i === 0) {
        archetype = ARCHETYPES.RUSHER;
        weaponId = 'fists';
        hpBase = 78;
      } else if (roll === 2 || roll === 4) {
        archetype = ARCHETYPES.ZONER;
        weaponId = act.id >= 4 ? 'kusarigama' : 'bo_staff';
        hpBase = 86;
      } else if (roll === 5 && levelNum >= 2) {
        archetype = ARCHETYPES.BRUTE;
        weaponId = act.id >= 3 ? 'gauntlets' : 'halberd';
        hpBase = 138;
        speedMult = 0.88 + act.id * 0.035;
        enemyScale = 1.14;
      } else {
        archetype = ARCHETYPES.RUSHER;
        weaponId = act.id >= 2 ? 'twin_daggers' : 'fists';
        if (act.id >= 4 && i % 2 === 1) weaponId = 'katana';
      }

      enemies.push({
        archetype,
        name:
          archetype === ARCHETYPES.BRUTE
            ? 'Iron Brute'
            : archetype === ARCHETYPES.ZONER
            ? 'Shadow Lancer'
            : 'Disciple',
        weaponId,
        maxHp: Math.round(hpBase * scale),
        dmgMult: 0.98 + (levelNum - 1) * 0.038,
        speedMult,
        scarfColor:
          archetype === ARCHETYPES.BRUTE
            ? '#F97316'
            : archetype === ARCHETYPES.ZONER
            ? '#38BDF8'
            : act.accent,
        scale: enemyScale,
      });
    }
    waves.push({ enemies });
  }

  return waves;
}

export const LEVELS = Array.from({ length: 50 }, (_, idx) => {
  const num = idx + 1;
  const actIndex = Math.floor(idx / 10);
  const act = ACTS[actIndex];
  const localNum = (idx % 10) + 1;
  const stageType = getStageType(localNum);
  const isBoss = stageType === 'BOSS';
  const waves = buildWavesForLevel(num, localNum, stageType, act);

  const labelByType = {
    BOSS: `BOSS: ${act.bossName}`,
    GAUNTLET: `${act.name} Gauntlet`,
    MINIBOSS: `${act.name} Elite Duel`,
    SURVIVAL: `${act.name} Survival`,
    STANDARD: `${act.name} ${localNum}`,
  };

  const bonusMult =
    stageType === 'BOSS' ? 2.4 :
    stageType === 'GAUNTLET' ? 1.55 :
    stageType === 'MINIBOSS' ? 1.45 :
    stageType === 'SURVIVAL' ? 1.35 : 1.0;

  return {
    id: num,
    actId: act.id,
    act,
    localNum,
    stageType,
    isBoss,
    title: labelByType[stageType],
    tip: getStageTip(num, stageType, act),
    waves,
    timeTarget: Math.round(28 + waves.length * 16 + (isBoss ? 34 : 0)),
    comboTarget: isBoss ? 6 : 4,
    rewardCoins: Math.round((55 + num * 14) * bonusMult),
    rewardGems: isBoss ? 7 + act.id * 2 : stageType === 'GAUNTLET' || stageType === 'MINIBOSS' ? 3 : 1,
    firstClearBonusGems: isBoss ? 8 : 2,
    maxTokens: act.id >= 4 || stageType === 'GAUNTLET' ? 3 : num >= 2 ? 2 : 1,
  };
});

export function getLevel(levelId) {
  return LEVELS[Math.max(0, Math.min(49, levelId - 1))];
}
