const { consumeApUnlessFree, spendCoin, addCoinWithMultiplier } = require("./economy");
const { unlockMany } = require("./achievements");

const HORSE_COUNT = 8;
// 人気順（1番人気〜8番人気）の勝率テーブル。人気ごとにオッズが変わる仕様を反映する。
const WIN_PROBABILITY_BY_POPULARITY = [0.3, 0.2, 0.15, 0.1, 0.08, 0.07, 0.06, 0.04];

const BET_TYPES = {
  TANSHO: { label: "単勝", picks: 1, rtp: 0.99 },
  FUKUSHO: { label: "複勝", picks: 1, rtp: 0.97 },
  WAKUREN: { label: "枠連", picks: 2, rtp: 0.94 },
  UMAREN: { label: "馬連", picks: 2, rtp: 0.95 },
  UMATAN: { label: "馬単", picks: 2, ordered: true, rtp: 0.94 },
  WIDE: { label: "ワイド", picks: 2, rtp: 0.96 },
  SANRENPUKU: { label: "3連複", picks: 3, rtp: 0.93 },
  SANRENTAN: { label: "3連単", picks: 3, ordered: true, rtp: 0.93 },
};

const MONTE_CARLO_TRIALS = 4000;
const RACE_WINDOW_MS = 5 * 60 * 1000;

// サーバー単位で1レースを共有する。プロセスメモリ管理のため再起動を跨ぐと消える簡易実装。
const activeRaces = new Map();

function bracketOf(horseNumber) {
  return Math.ceil(horseNumber / 2);
}

function generateRace() {
  const popularityOrder = [...Array(HORSE_COUNT)].map((_, i) => i + 1);
  for (let i = popularityOrder.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [popularityOrder[i], popularityOrder[j]] = [popularityOrder[j], popularityOrder[i]];
  }

  const horses = popularityOrder.map((horseNumber, index) => ({
    number: horseNumber,
    popularity: index + 1,
    winProbability: WIN_PROBABILITY_BY_POPULARITY[index],
  }));

  horses.sort((a, b) => a.number - b.number);
  return horses;
}

// Plackett-Luceモデル: 勝率に基づき順に「まだ確定していない馬」から重み付き抽選して着順を決める。
function simulateFinishOrder(horses) {
  const remaining = horses.map((h) => ({ number: h.number, weight: h.winProbability }));
  const order = [];

  while (remaining.length > 0) {
    const total = remaining.reduce((sum, h) => sum + h.weight, 0);
    let roll = Math.random() * total;
    let pickedIndex = remaining.length - 1;

    for (let i = 0; i < remaining.length; i += 1) {
      roll -= remaining[i].weight;
      if (roll <= 0) {
        pickedIndex = i;
        break;
      }
    }

    order.push(remaining[pickedIndex].number);
    remaining.splice(pickedIndex, 1);
  }

  return order;
}

function judge(betType, picks, finishOrder) {
  const top1 = finishOrder[0];
  const top2 = finishOrder.slice(0, 2);
  const top3 = finishOrder.slice(0, 3);

  switch (betType) {
    case "TANSHO":
      return top1 === picks[0];
    case "FUKUSHO":
      return top3.includes(picks[0]);
    case "WAKUREN": {
      const targetBrackets = picks.map(bracketOf).sort().join(",");
      const actualBrackets = top2.map(bracketOf).sort().join(",");
      return targetBrackets === actualBrackets;
    }
    case "UMAREN":
      return [...picks].sort().join(",") === [...top2].sort().join(",");
    case "UMATAN":
      return picks[0] === top2[0] && picks[1] === top2[1];
    case "WIDE":
      return picks.every((p) => top3.includes(p));
    case "SANRENPUKU":
      return [...picks].sort().join(",") === [...top3].sort().join(",");
    case "SANRENTAN":
      return picks[0] === top3[0] && picks[1] === top3[1] && picks[2] === top3[2];
    default:
      return false;
  }
}

// 実際の着順とは独立に、同一の確率モデルでモンテカルロ試行して的中確率を推定し、そこからオッズを算出する。
function estimateOdds(horses, betType, picks) {
  let hits = 0;

  for (let i = 0; i < MONTE_CARLO_TRIALS; i += 1) {
    const order = simulateFinishOrder(horses);
    if (judge(betType, picks, order)) {
      hits += 1;
    }
  }

  const probability = Math.max(hits / MONTE_CARLO_TRIALS, 1 / MONTE_CARLO_TRIALS);
  const fairOdds = 1 / probability;
  const odds = Math.max(1.1, Math.round(fairOdds * BET_TYPES[betType].rtp * 10) / 10);

  return odds;
}

function parsePicks(betType, horsesInput, horseCount = HORSE_COUNT) {
  const config = BET_TYPES[betType];
  const numbers = horsesInput
    .split(/[-,\s]+/)
    .filter(Boolean)
    .map((s) => Number(s));

  if (numbers.length !== config.picks) {
    throw new Error(`${config.label}には馬番を${config.picks}つ指定してください（例: ${config.ordered ? "3-1" : "3,1"}）`);
  }

  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > horseCount)) {
    throw new Error(`馬番は1〜${horseCount}の整数で指定してください。`);
  }

  if (new Set(numbers).size !== numbers.length) {
    throw new Error("同じ馬番を複数回指定することはできません。");
  }

  return numbers;
}

function getActiveRace(guildId) {
  return activeRaces.get(guildId) ?? null;
}

// サーバー共有のレースを作成する（既にあれば新規作成せず既存のものを返す）。
// onResolveは5分後のレース確定時に一度だけ呼ばれるコールバック。
function createRace(guildId, channelId, onResolve) {
  const existing = activeRaces.get(guildId);

  if (existing) {
    return { horses: existing.horses, tanshoOdds: existing.tanshoOdds, resolveAt: existing.resolveAt, alreadyActive: true };
  }

  const horses = generateRace();
  const tanshoOdds = horses.map((h) => ({
    number: h.number,
    popularity: h.popularity,
    odds: estimateOdds(horses, "TANSHO", [h.number]),
  }));
  const resolveAt = Date.now() + RACE_WINDOW_MS;

  const race = { horses, tanshoOdds, channelId, bets: [], resolveAt };
  race.timer = setTimeout(() => {
    resolveRace(guildId, onResolve).catch((error) => {
      console.error(`Failed to resolve keiba race for guild ${guildId}:`, error);
    });
  }, RACE_WINDOW_MS);

  activeRaces.set(guildId, race);

  return { horses, tanshoOdds, resolveAt, alreadyActive: false };
}

async function placeBet(guildId, userId, betType, horsesInput, amount) {
  if (!BET_TYPES[betType]) {
    throw new Error("不明な賭式です。");
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("賭け金は1以上の整数で指定してください。");
  }

  const race = activeRaces.get(guildId);

  if (!race) {
    return { success: false, reason: "NO_RACE" };
  }

  const picks = parsePicks(betType, horsesInput);

  const apResult = await consumeApUnlessFree(guildId, userId, 1);
  if (!apResult.success) {
    return { success: false, reason: "INSUFFICIENT_AP" };
  }

  const spendResult = await spendCoin(guildId, userId, amount);
  if (!spendResult.success) {
    return { success: false, reason: "INSUFFICIENT_COIN", user: spendResult.user };
  }

  const odds = estimateOdds(race.horses, betType, picks);
  race.bets.push({ userId, betType, picks, amount, odds });

  return { success: true, betType, picks, amount, odds, resolveAt: race.resolveAt };
}

async function resolveRace(guildId, onResolve) {
  const race = activeRaces.get(guildId);

  if (!race) {
    return;
  }

  activeRaces.delete(guildId);

  const finishOrder = simulateFinishOrder(race.horses);
  const results = [];

  for (const bet of race.bets) {
    const won = judge(bet.betType, bet.picks, finishOrder);
    let payout = 0;
    let unlockedAchievements = [];

    if (won) {
      const rawPayout = Math.round(bet.amount * bet.odds);
      const coinGain = await addCoinWithMultiplier(guildId, bet.userId, rawPayout);
      payout = coinGain.amount || 0;
      unlockedAchievements = await unlockMany(guildId, bet.userId, ["FIRST_KEIBA_WIN"]);
    }

    results.push({ ...bet, won, payout, unlockedAchievements });
  }

  if (onResolve) {
    await onResolve({ guildId, channelId: race.channelId, horses: race.horses, finishOrder, results });
  }
}

module.exports = {
  BET_TYPES,
  HORSE_COUNT,
  RACE_WINDOW_MS,
  createRace,
  getActiveRace,
  placeBet,
};
