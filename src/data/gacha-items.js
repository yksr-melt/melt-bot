// 通常ガチャの排出アイテム定義。
// 効果の自動適用（AP/コイン倍率バフ等）は未実装で、現状は付与・保有数の記録のみ行う。
const ITEMS_R = [
  { key: "r_coin20", name: "コイン20枚" },
  { key: "r_ap_drink1", name: "AP1回復ドリンク" },
  { key: "r_coin_boost_10m", name: "10分コイン獲得量1.1倍" },
  { key: "r_ap_free_5m", name: "5分間AP使い放題チケット" },
];

const ITEMS_SR = [
  { key: "sr_coin40", name: "コイン40枚" },
  { key: "sr_ap_drink3", name: "AP3回復ドリンク" },
  { key: "sr_coin_boost_1h", name: "1時間コイン獲得量1.1倍" },
  { key: "sr_coin_boost_3m", name: "3分コイン獲得量1.5倍" },
  { key: "sr_slot_check", name: "スロット設定確認チケット" },
  { key: "sr_slot_plus1", name: "スロット設定+1チケット" },
  { key: "sr_slot_456", name: "スロット設定456確定チケット" },
];

const ITEMS_SSR = [
  { key: "ssr_slot_6", name: "設定6確定チケット" },
  { key: "ssr_coin_boost_10m_x2", name: "10分間コイン獲得量2倍" },
  { key: "ssr_ap_free_1h", name: "1時間AP使い放題チケット" },
  { key: "ssr_bonus_confirm", name: "ボーナス1回確定チケット" },
  { key: "ssr_bj_win_confirm", name: "BJ勝利確定チケット" },
];

const PICKUP_ITEMS = [
  { key: "pu_favor", name: "私に好きなことをさせることができる" },
  { key: "pu_title", name: "お好みの独自称号" },
];

const RATES = {
  SSR: 0.03,
  SSR_PICKUP: 0.003,
  SSR_THROUGH: 0.027,
  SR: 0.185,
  R: 0.785,
};

const PITY_LIMIT = 300;
const SINGLE_PULL_STONE_COST = 150;
const TEN_PULL_STONE_COST = 1200;
const COLLECTION_TICKETS_PER_10_PULL = 10;

function pickRandom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  ITEMS_R,
  ITEMS_SR,
  ITEMS_SSR,
  PICKUP_ITEMS,
  RATES,
  PITY_LIMIT,
  SINGLE_PULL_STONE_COST,
  TEN_PULL_STONE_COST,
  COLLECTION_TICKETS_PER_10_PULL,
  pickRandom,
};
