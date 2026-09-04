const { prisma } = require("../db");
const { consumeApUnlessFree, addCoinWithMultiplier, addCoin, spendCoin } = require("./economy");
const { consumeOneShot, SLOT_BONUS_CONFIRM } = require("./buffs");
const { unlockMany } = require("./achievements");

// 設定ごとのBIG/REG確率（分母）と、それを踏まえたRTP目標（未記載の base 小役ペイアウトで帳尻を合わせる）。
// 還元率が渋いというフィードバックを受け、当初のRTP目標(94〜96%)より引き上げている。
const SETTINGS = {
  1: { big: 273.1, reg: 439.8, rtpTarget: 0.97 },
  2: { big: 269.7, reg: 399.6, rtpTarget: 0.974 },
  3: { big: 269.7, reg: 331.0, rtpTarget: 0.978 },
  4: { big: 259.0, reg: 315.1, rtpTarget: 0.982 },
  5: { big: 259.0, reg: 255.0, rtpTarget: 0.986 },
  6: { big: 255.0, reg: 255.0, rtpTarget: 0.99 },
};

const COIN_PER_UNIT = 20; // 20コイン=1枚
const MAX_BET_UNITS = 3; // MAXベット(3枚)。BIG/REG抽選はMAXベット時のみ行われる。
const SPIN_UNIT_COST = MAX_BET_UNITS; // RTPキャリブレーションはMAXベット基準
const PEKA_UNIT_COST = 1; // ペカり後は当たるまで1枚で回せる
const SPIN_COIN_COST = SPIN_UNIT_COST * COIN_PER_UNIT;
const PEKA_COIN_COST = PEKA_UNIT_COST * COIN_PER_UNIT;
// BB/RBの獲得枚数を引き上げ（RB: 96→130枚、BB: 252→320枚）。
const REG_PAYOUT_UNITS = 130;
const BIG_PAYOUT_UNITS = 320;
const RENCHAN_CHANCE = 0.25;
const RENCHAN_GAMES_REG = 10;
const RENCHAN_GAMES_BIG = 20;
const RENCHAN_MULTIPLIER = 2;
const MAX_PEKA_SUSPENSE_SPINS = 3; // ペカり後、実際に当たりが揃うまでの1枚回転回数（0〜3）

// リプレイ（次回無料）は実機同様、設定によらずほぼ一定の確率で成立する。
const REPLAY_PROBABILITY = 1 / 7.3;
// ぶどう（小役コイン獲得）の払い出しは固定額とし、確率だけを設定ごとのRTP不足分から逆算する。
const GRAPE_PAYOUT_COIN = 8 * COIN_PER_UNIT;

function dayKey(date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

async function getOrCreateSlotMachine(guildId, userId) {
  let machine = await prisma.slotMachine.findUnique({ where: { guildId_userId: { guildId, userId } } });

  if (!machine) {
    machine = await prisma.slotMachine.create({
      data: { guildId, userId, setting: 1 + Math.floor(Math.random() * 6) },
    });
  }

  const now = new Date();

  if (dayKey(now) !== dayKey(machine.settingResetAt)) {
    machine = await prisma.slotMachine.update({
      where: { guildId_userId: { guildId, userId } },
      data: {
        setting: 1 + Math.floor(Math.random() * 6),
        settingResetAt: now,
        renchanGamesLeft: 0,
        pendingBonus: null,
        pendingSpinsLeft: null,
      },
    });
  }

  return machine;
}

async function sit(guildId, userId) {
  const machine = await getOrCreateSlotMachine(guildId, userId);

  if (machine.seated) {
    return { success: true, machine, alreadySeated: true };
  }

  const apResult = await consumeApUnlessFree(guildId, userId, 1);

  if (!apResult.success) {
    return { success: false, reason: "INSUFFICIENT_AP" };
  }

  const updated = await prisma.slotMachine.update({
    where: { guildId_userId: { guildId, userId } },
    data: { seated: true, seatedAt: new Date() },
  });

  return { success: true, machine: updated, alreadySeated: false };
}

async function leave(guildId, userId) {
  const machine = await getOrCreateSlotMachine(guildId, userId);

  if (!machine.seated) {
    return { success: true, machine };
  }

  if (machine.pendingBonus) {
    return { success: false, reason: "PEKA_IN_PROGRESS", machine };
  }

  const updated = await prisma.slotMachine.update({
    where: { guildId_userId: { guildId, userId } },
    data: { seated: false, seatedAt: null },
  });

  return { success: true, machine: updated };
}

// 1回転分の純粋なロジック。DBに触れず状態遷移だけを計算するため、
// 本番の spin() と RTPキャリブレーション用シミュレーションの両方から使う。
// allowBonus=falseの場合（MAXベット未満）はBIG/REG抽選自体を行わない（実機同様の仕様）。
function simulateSpinStep(state, setting, { forcedBonus = false, allowBonus = true } = {}) {
  const settingConfig = SETTINGS[setting];

  if (state.pendingBonus) {
    if (state.pendingSpinsLeft > 0) {
      return {
        cost: PEKA_UNIT_COST,
        payoutUnits: 0,
        phase: "PEKA_CONTINUE",
        nextState: { pendingBonus: state.pendingBonus, pendingSpinsLeft: state.pendingSpinsLeft - 1, renchanGamesLeft: 0 },
      };
    }

    const payoutUnits = state.pendingBonus === "REG" ? REG_PAYOUT_UNITS : BIG_PAYOUT_UNITS;
    const nextGames = state.pendingBonus === "REG" ? RENCHAN_GAMES_REG : RENCHAN_GAMES_BIG;
    const enterRenchan = Math.random() < RENCHAN_CHANCE;

    return {
      cost: PEKA_UNIT_COST,
      payoutUnits,
      phase: "REVEAL",
      bonus: state.pendingBonus,
      nextState: { pendingBonus: null, pendingSpinsLeft: null, renchanGamesLeft: enterRenchan ? nextGames : 0 },
    };
  }

  const inRenchan = state.renchanGamesLeft > 0;
  const multiplier = inRenchan ? RENCHAN_MULTIPLIER : 1;
  const regProb = allowBonus ? Math.min(1, (1 / settingConfig.reg) * multiplier) : 0;
  const bigProb = allowBonus ? Math.min(1, (1 / settingConfig.big) * multiplier) : 0;

  let bonus = null;

  if (forcedBonus && allowBonus) {
    bonus = Math.random() < bigProb / (bigProb + regProb) ? "BIG" : "REG";
  } else {
    const roll = Math.random();
    if (roll < regProb) {
      bonus = "REG";
    } else if (roll < regProb + bigProb) {
      bonus = "BIG";
    }
  }

  if (bonus) {
    const suspense = Math.floor(Math.random() * (MAX_PEKA_SUSPENSE_SPINS + 1));
    return {
      cost: SPIN_UNIT_COST,
      payoutUnits: 0,
      phase: "PEKA",
      bonus,
      nextState: { pendingBonus: bonus, pendingSpinsLeft: suspense, renchanGamesLeft: 0 },
    };
  }

  const nextRenchanGamesLeft = inRenchan ? Math.max(0, state.renchanGamesLeft - 1) : 0;
  return {
    cost: SPIN_UNIT_COST,
    payoutUnits: 0,
    phase: "MISS",
    nextState: { pendingBonus: null, pendingSpinsLeft: null, renchanGamesLeft: nextRenchanGamesLeft },
  };
}

// 通常回転がハズレの場合のみ、設定表に無いRTP不足分をベース小役で埋める。
// simulateBonusRtp と同じ状態遷移(simulateSpinStep)を使うことで、ペカり後の
// 1枚継続に伴う追加コスト・追加ペイアウトも含めて長期RTPを正しく見積もる。
function simulateBonusRtp(setting, trials = 200000) {
  let state = { pendingBonus: null, pendingSpinsLeft: null, renchanGamesLeft: 0 };
  let totalCostUnits = 0;
  let totalPayoutUnits = 0;

  for (let i = 0; i < trials; i += 1) {
    const step = simulateSpinStep(state, setting);
    totalCostUnits += step.cost;
    totalPayoutUnits += step.payoutUnits;
    state = step.nextState;
  }

  return (totalPayoutUnits * COIN_PER_UNIT) / (totalCostUnits * COIN_PER_UNIT);
}

const BONUS_RTP_CACHE = new Map();

function getBonusRtp(setting) {
  if (!BONUS_RTP_CACHE.has(setting)) {
    BONUS_RTP_CACHE.set(setting, simulateBonusRtp(setting));
  }
  return BONUS_RTP_CACHE.get(setting);
}

function computeBaseWinRate(setting) {
  const { rtpTarget } = SETTINGS[setting];
  return Math.max(0, rtpTarget - getBonusRtp(setting));
}

// ベース小役のRTPのうち、リプレイ分（確率固定・払戻=コスト全額）を差し引いた残りを
// ぶどうの確率として逆算する。ぶどうの払出額は固定なので、確率だけが設定差になる。
function computeGrapeProbability(setting) {
  const baseWinRate = computeBaseWinRate(setting);
  const remainingRate = Math.max(0, baseWinRate - REPLAY_PROBABILITY);
  const probability = (remainingRate * SPIN_COIN_COST) / GRAPE_PAYOUT_COIN;
  return Math.min(1, Math.max(0, probability));
}

async function spin(guildId, userId, betUnits = MAX_BET_UNITS) {
  const machine = await getOrCreateSlotMachine(guildId, userId);

  if (!machine.seated) {
    return { success: false, reason: "NOT_SEATED" };
  }

  const isPekaContinuation = Boolean(machine.pendingBonus);
  const clampedBet = Math.min(MAX_BET_UNITS, Math.max(1, betUnits));
  const cost = isPekaContinuation ? PEKA_COIN_COST : clampedBet * COIN_PER_UNIT;
  const allowBonus = isPekaContinuation || clampedBet >= MAX_BET_UNITS;

  const spendResult = await spendCoin(guildId, userId, cost);

  if (!spendResult.success) {
    return { success: false, reason: "INSUFFICIENT_COIN", user: spendResult.user, cost };
  }

  const forcedBonus = !isPekaContinuation && allowBonus && (await consumeOneShot(guildId, userId, SLOT_BONUS_CONFIRM));
  const state = {
    pendingBonus: machine.pendingBonus,
    pendingSpinsLeft: machine.pendingSpinsLeft,
    renchanGamesLeft: machine.renchanGamesLeft,
  };
  const step = simulateSpinStep(state, machine.setting, { forcedBonus, allowBonus });

  let phase = step.phase;
  let payoutCoin = step.payoutUnits * COIN_PER_UNIT;
  let replayRefund = 0;

  if (step.phase === "MISS") {
    const grapeProbability = computeGrapeProbability(machine.setting);
    const roll = Math.random();

    if (roll < REPLAY_PROBABILITY) {
      phase = "REPLAY";
      replayRefund = cost;
    } else if (roll < REPLAY_PROBABILITY + grapeProbability) {
      phase = "GRAPE";
      payoutCoin = GRAPE_PAYOUT_COIN;
    }
  }

  await prisma.slotMachine.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      pendingBonus: step.nextState.pendingBonus,
      pendingSpinsLeft: step.nextState.pendingSpinsLeft,
      renchanGamesLeft: step.nextState.renchanGamesLeft,
    },
  });

  let coinGain = { amount: 0 };

  if (payoutCoin > 0) {
    coinGain = await addCoinWithMultiplier(guildId, userId, payoutCoin);
  }

  if (replayRefund > 0) {
    // リプレイはコインを増やす「勝利」ではなく賭け金の払い戻しなので、獲得量バフは適用しない。
    await addCoin(guildId, userId, replayRefund);
  }

  const finalMachine = await prisma.slotMachine.findUnique({ where: { guildId_userId: { guildId, userId } } });

  let unlockedAchievements = [];
  if (phase === "REVEAL") {
    const achievementIds = ["FIRST_SLOT_BONUS"];
    if (step.bonus === "BIG") achievementIds.push("FIRST_SLOT_BIG");
    unlockedAchievements = await unlockMany(guildId, userId, achievementIds);
  }

  return {
    success: true,
    phase,
    bonus: step.bonus ?? null,
    payoutCoin: (coinGain.amount || 0) + replayRefund,
    cost,
    betUnits: isPekaContinuation ? null : clampedBet,
    machine: finalMachine,
    unlockedAchievements,
  };
}

module.exports = {
  SETTINGS,
  MAX_BET_UNITS,
  COIN_PER_UNIT,
  SPIN_COIN_COST,
  PEKA_COIN_COST,
  getOrCreateSlotMachine,
  sit,
  leave,
  spin,
};
