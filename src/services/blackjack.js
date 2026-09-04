const { consumeApUnlessFree, spendCoin, addCoin, addCoinWithMultiplier } = require("./economy");
const { consumeOneShot, BJ_WIN_CONFIRM } = require("./buffs");
const { unlockMany } = require("./achievements");

const CHIP_VALUES = [5, 10, 30];
const MAX_BET_CHIPS = 200;

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// ゲームは単一プロセス内メモリで保持する（再起動でハンドは失われる簡易実装）。
const games = new Map();

function gameKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank) {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return Number(rank);
}

function handValue(cards) {
  let total = cards.reduce((sum, c) => sum + cardValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === "A").length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function formatHand(cards) {
  return cards.map((c) => `${c.rank}${c.suit}`).join(" ");
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

function createHand(cards, bet) {
  return { cards, bet, doubled: false, surrendered: false, busted: false, done: false };
}

function getGame(guildId, userId) {
  return games.get(gameKey(guildId, userId)) ?? null;
}

function activeHand(game) {
  return game.hands[game.activeHandIndex];
}

// 現在のハンドが完了した後、次に操作可能なハンドへ進める。無ければラウンドを終了する。
async function advance(game) {
  for (let i = game.activeHandIndex + 1; i < game.hands.length; i += 1) {
    if (!game.hands[i].done) {
      game.activeHandIndex = i;
      return { finished: false, game };
    }
  }

  return settleRound(game);
}

// 各ハンドの勝敗が出揃った後、ディーラーのプレイ・清算・実績付与をまとめて行う。
async function settleRound(game) {
  games.delete(gameKey(game.guildId, game.userId));

  const dealerMustPlay = game.hands.some((h) => !h.busted && !h.surrendered);
  if (dealerMustPlay) {
    while (handValue(game.dealerHand) < 17) {
      game.dealerHand.push(game.deck.pop());
    }
  }

  const dealerValue = handValue(game.dealerHand);
  const dealerBJ = game.hands.length === 1 && isBlackjack(game.dealerHand);

  for (const hand of game.hands) {
    if (hand.surrendered) {
      hand.outcome = "SURRENDER";
      hand.payout = Math.floor(hand.bet / 2);
    } else if (hand.busted) {
      hand.outcome = "LOSE";
      hand.payout = 0;
    } else if (game.hands.length === 1 && isBlackjack(hand.cards) && !hand.doubled) {
      hand.outcome = dealerBJ ? "PUSH" : "BLACKJACK";
      hand.payout = dealerBJ ? hand.bet : Math.round(hand.bet * 2.5);
    } else if (dealerBJ) {
      hand.outcome = "LOSE";
      hand.payout = 0;
    } else {
      const value = handValue(hand.cards);
      if (dealerValue > 21 || value > dealerValue) {
        hand.outcome = "WIN";
        hand.payout = hand.bet * 2;
      } else if (value === dealerValue) {
        hand.outcome = "PUSH";
        hand.payout = hand.bet;
      } else {
        hand.outcome = "LOSE";
        hand.payout = 0;
      }
    }
  }

  // 勝利確定チケットは、負けているハンドが1つあればそのうち最初の1つだけに適用する。
  let forcedWin = false;
  const losingHand = game.hands.find((h) => h.outcome === "LOSE");
  if (losingHand && (await consumeOneShot(game.guildId, game.userId, BJ_WIN_CONFIRM))) {
    losingHand.outcome = "WIN";
    losingHand.payout = losingHand.bet * 2;
    forcedWin = true;
  }

  const winnings = game.hands
    .filter((h) => h.outcome === "WIN" || h.outcome === "BLACKJACK")
    .reduce((sum, h) => sum + h.payout, 0);
  const refunds = game.hands
    .filter((h) => h.outcome === "PUSH" || h.outcome === "SURRENDER")
    .reduce((sum, h) => sum + h.payout, 0);

  let creditedWinnings = 0;
  if (winnings > 0) {
    const coinGain = await addCoinWithMultiplier(game.guildId, game.userId, winnings);
    creditedWinnings = coinGain.amount || 0;
  }
  if (refunds > 0) {
    await addCoin(game.guildId, game.userId, refunds);
  }

  const hasWin = game.hands.some((h) => h.outcome === "WIN" || h.outcome === "BLACKJACK");
  const unlockedAchievements = hasWin ? await unlockMany(game.guildId, game.userId, ["FIRST_BJ_WIN"]) : [];

  return {
    finished: true,
    game,
    hands: game.hands,
    totalPayout: creditedWinnings + refunds,
    forcedWin,
    unlockedAchievements,
  };
}

async function startGame(guildId, userId, chipValue, betChips) {
  if (!CHIP_VALUES.includes(chipValue)) {
    throw new Error(`チップは${CHIP_VALUES.join("/")}のいずれかを指定してください。`);
  }

  if (!Number.isInteger(betChips) || betChips <= 0 || betChips > MAX_BET_CHIPS) {
    throw new Error(`賭けチップ数は1〜${MAX_BET_CHIPS}枚で指定してください。`);
  }

  if (games.has(gameKey(guildId, userId))) {
    throw new Error("既に進行中のBJがあります。");
  }

  const betCoin = chipValue * betChips;

  const apResult = await consumeApUnlessFree(guildId, userId, 1);
  if (!apResult.success) {
    return { success: false, reason: "INSUFFICIENT_AP" };
  }

  const spendResult = await spendCoin(guildId, userId, betCoin);
  if (!spendResult.success) {
    return { success: false, reason: "INSUFFICIENT_COIN", user: spendResult.user };
  }

  const deck = createDeck();
  const playerCards = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  const hand = createHand(playerCards, betCoin);

  const game = { guildId, userId, deck, dealerHand, hands: [hand], activeHandIndex: 0, chipValue };

  if (isBlackjack(playerCards) || isBlackjack(dealerHand)) {
    hand.done = true;
    const result = await settleRound(game);
    return { success: true, ...result };
  }

  games.set(gameKey(guildId, userId), game);
  return { success: true, finished: false, game };
}

async function hit(guildId, userId) {
  const game = getGame(guildId, userId);
  if (!game) return null;

  const hand = activeHand(game);
  hand.cards.push(game.deck.pop());
  const value = handValue(hand.cards);

  if (value >= 21) {
    hand.busted = value > 21;
    hand.done = true;
    return advance(game);
  }

  return { finished: false, game };
}

async function stand(guildId, userId) {
  const game = getGame(guildId, userId);
  if (!game) return null;

  activeHand(game).done = true;
  return advance(game);
}

function canDouble(game) {
  const hand = activeHand(game);
  return hand.cards.length === 2 && !hand.doubled;
}

async function doubleDown(guildId, userId) {
  const game = getGame(guildId, userId);
  if (!game) return null;

  const hand = activeHand(game);
  if (!canDouble(game)) {
    throw new Error("ダブルダウンは最初の2枚のときだけ選べます。");
  }

  const spendResult = await spendCoin(guildId, userId, hand.bet);
  if (!spendResult.success) {
    return { insufficientCoin: true, user: spendResult.user };
  }

  hand.bet *= 2;
  hand.doubled = true;
  hand.cards.push(game.deck.pop());
  hand.busted = handValue(hand.cards) > 21;
  hand.done = true;

  return advance(game);
}

function canSplit(game) {
  if (game.hands.length !== 1) return false;
  const hand = activeHand(game);
  return hand.cards.length === 2 && hand.cards[0].rank === hand.cards[1].rank;
}

async function split(guildId, userId) {
  const game = getGame(guildId, userId);
  if (!game) return null;

  if (!canSplit(game)) {
    throw new Error("スプリットは同じ数字が2枚のときだけ選べます。");
  }

  const hand = activeHand(game);

  const spendResult = await spendCoin(guildId, userId, hand.bet);
  if (!spendResult.success) {
    return { insufficientCoin: true, user: spendResult.user };
  }

  const splitRank = hand.cards[0].rank;
  const secondCard = hand.cards.pop();
  const newHand = createHand([secondCard], hand.bet);

  hand.cards.push(game.deck.pop());
  newHand.cards.push(game.deck.pop());
  game.hands.splice(game.activeHandIndex + 1, 0, newHand);

  if (splitRank === "A") {
    // エース同士のスプリットは各1枚のみで強制スタンド（一般的なカジノルール）。
    hand.done = true;
    newHand.done = true;
    return advance(game);
  }

  return { finished: false, game };
}

function canSurrender(game) {
  if (game.hands.length !== 1) return false;
  const hand = activeHand(game);
  return hand.cards.length === 2 && !hand.doubled;
}

async function surrender(guildId, userId) {
  const game = getGame(guildId, userId);
  if (!game) return null;

  if (!canSurrender(game)) {
    throw new Error("サレンダーは最初の2枚のときだけ選べます。");
  }

  const hand = activeHand(game);
  hand.surrendered = true;
  hand.done = true;

  return advance(game);
}

module.exports = {
  CHIP_VALUES,
  MAX_BET_CHIPS,
  startGame,
  getGame,
  hit,
  stand,
  doubleDown,
  split,
  surrender,
  canDouble,
  canSplit,
  canSurrender,
  activeHand,
  handValue,
  formatHand,
};
