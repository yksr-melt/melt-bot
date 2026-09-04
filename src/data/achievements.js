// 実績定義。基本60石、内容によって最大120石まで（仕様の「実績は基本60石、最大120石」に準拠）。
const ACHIEVEMENTS = {
  FIRST_GACHA_PULL: { name: "ガチャデビュー", description: "ガチャを1回引く", stoneReward: 60 },
  FIRST_TEN_PULL: { name: "10連デビュー", description: "ガチャを10連引く", stoneReward: 60 },
  FIRST_SSR: { name: "SSR初獲得", description: "ガチャでSSRを引き当てる", stoneReward: 80 },
  FIRST_PICKUP: { name: "PU獲得", description: "ガチャでピックアップアイテムを引き当てる", stoneReward: 120 },
  GACHA_100_PULLS: { name: "ガチャ中毒", description: "累計100連ガチャを引く", stoneReward: 100 },
  FIRST_COLLECTION_PULL: { name: "コレクター見習い", description: "コレクションガチャを1回引く", stoneReward: 60 },
  COLLECTION_50: { name: "お菓子博士", description: "お菓子図鑑を50種類集める", stoneReward: 80 },
  COLLECTION_COMPLETE: { name: "図鑑コンプリート", description: "お菓子図鑑を200種類すべて集める", stoneReward: 120 },
  LEVEL_10: { name: "レベル10到達", description: "レベル10に到達する", stoneReward: 60 },
  LEVEL_30: { name: "レベル30到達", description: "レベル30に到達する", stoneReward: 100 },
  FIRST_SLOT_BONUS: { name: "ペカり初体験", description: "スロットでボーナス(REG/BIG)に当選する", stoneReward: 60 },
  FIRST_SLOT_BIG: { name: "BIG初当選", description: "スロットでBIGボーナスに当選する", stoneReward: 80 },
  FIRST_KEIBA_WIN: { name: "馬券的中", description: "競馬で馬券を的中させる", stoneReward: 60 },
  FIRST_BJ_WIN: { name: "ブラックジャック勝利", description: "BJで勝利する", stoneReward: 60 },
  WORK_10_TIMES: { name: "働き者", description: "仕事を10回こなす", stoneReward: 60 },
};

module.exports = { ACHIEVEMENTS };
