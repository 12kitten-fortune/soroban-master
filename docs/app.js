const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
// そろばんの桁：整数11桁＋小数4桁。桁を減らしたぶん、1桁を大きく表示できる
const COLS = 15, ONES_COL = 10;
const isUnitPoint = (c) => (c - ONES_COL) % 3 === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepUntil = (t) => new Promise((r) => setTimeout(r, Math.max(0, t - performance.now()))); // 絶対時刻まで待つ（ドリフト防止）
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// onQuizChange が初期化時（makeSoroban生成時）に参照するため、先に宣言してTDZを回避
let session = null, playTimer = null;
// 効果音のON/OFF（localStorageに保存）
const SOUND_KEY = "soroban_sound";
let soundOn = localStorage.getItem(SOUND_KEY) !== "off";
const BUILD = "2026-09-05-44"; // 最新反映の確認用

/* ============================================================ 検定基準（級） */
// 珠算（日本計算技能連盟サンプルに準拠）。かけ算は9級から、わり算は7級から、10級以下は見取算のみ
// 珠算：日本計算技能連盟の公式サンプル問題から抽出した実測値（★＝全級サンプルで確認済み）。
// 13〜10級のみとりが同じ2桁5口なのは公式サンプルどおり（級の差はかけ算・わり算で付く）。
const SOROBAN_STD = {
  1: { mitori: { digits: 6, terms: 10 }, kake: { a: 5, b: 4 }, wari: { D: 8, dv: 4, qd: 4 } }, // 全て★
  2: { mitori: { digits: 5, terms: 10 }, kake: { a: 4, b: 4 }, wari: { D: 7, dv: 3, qd: 4 } }, // 全て★（みとりは3級と同じ5桁10口。差は乗除算で付く）
  3: { mitori: { digits: 5, terms: 10 }, kake: { a: 4, b: 3 }, wari: { D: 6, dv: 3, qd: 3 } }, // 全て★
  4: { mitori: { digits: 4, terms: 10 }, kake: { a: 4, b: 3 }, wari: { D: 5, dv: 2, qd: 3 } }, // 全て★
  5: { mitori: { digits: 4, terms: 10 }, kake: { a: 3, b: 3 }, wari: { D: 4, dv: 2, qd: 2 } }, // 全て★
  6: { mitori: { digits: 3, terms: 10 }, kake: { a: 3, b: 2 }, wari: { D: 4, dv: 1, qd: 3 } }, // 全て★
  7: { mitori: { digits: 2, terms: 10 }, kake: { a: 2, b: 2 }, wari: { D: 3, dv: 1, qd: 2 } }, // 全て★
  8: { mitori: { digits: 2, terms: 8 }, kake: { a: 3, b: 1 }, wari: null },                    // ★
  9: { mitori: { digits: 2, terms: 8 }, kake: { a: 2, b: 1 }, wari: null },                    // ★
  // 10〜15級は「桁と口数の組み合わせ」がサンプルで決まっている。桁と口数を別々に振ると
  // サンプルに無い組み合わせ（例：10級の2桁7口）が出てしまうため、必ず variants で対にする。
  // 1枚の中で1〜5番=5口・6〜10番=6口と変わる級は termsMax で表す。
  10: { mitori: { variants: [{ digits: 1, terms: 7 }, { digits: 2, terms: 5 }] }, kake: null, wari: null },        // ★A=1桁7口／B・C=2桁5口
  11: { mitori: { digits: 2, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★A・Bとも2桁
  12: { mitori: { digits: 2, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★A・Bとも2桁
  13: { mitori: { digits: 2, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★2桁
  14: { mitori: { variants: [{ digits: 1, terms: 5, termsMax: 6 }, { digits: 2, terms: 5, termsMax: 6 }] }, kake: null, wari: null }, // ★A=1桁／B=2桁
  15: { mitori: { digits: 1, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★A・Bとも1桁
};
// 暗算（みとり暗算）：同じく公式サンプルの実測値。低い級はサンプルどおり ひき算を含めない
const ANZAN_STD = {
  10: { digits: 1, terms: 3, sub: false }, //★
  9: { digits: 1, terms: 4, sub: false },  //★
  8: { digits: 2, terms: 3, sub: false },  //★
  7: { digits: 2, terms: 3, sub: false },  //★
  6: { digits: 2, terms: 4, sub: true },   //△（7級と5級から補間）
  5: { digits: 2, terms: 5, sub: true },   //★
  4: { digits: 2, terms: 6, sub: true },   //★
  3: { digits: 2, terms: 8, sub: true },   //★
  2: { digits: 2, terms: 12, sub: true },  //★
  1: { digits: 3, terms: 5, sub: true },   //★
};
// 11〜20級は公式に無い当アプリ独自の入門ラダー
// 11〜20級は公式に無い当アプリ独自の入門ラダー。
// そろばんの学習順（5の友 → くり上がりなし → 10の友 → くり上がり）に合わせて
// 「答えがいくつになるか」を決め打ちで出題する。
const ANZAN_LOW = {
  20: { digits: 1, terms: 2, sub: false, sumMax: 5, label: "こたえが5まで" },
  19: { digits: 1, terms: 2, sub: false, sumMax: 9, label: "こたえが9まで（くり上がりなし）" },
  18: { digits: 1, terms: 2, sub: false, sumMin: 6, sumMax: 10, label: "こたえが6〜10（五玉をつかう）" },
  17: { digits: 1, terms: 2, sub: false, sumMin: 11, sumMax: 18, label: "くり上がり（こたえ11〜18）" },
  16: { digits: 1, terms: 3, sub: false, sumMax: 9, label: "3口・くり上がりなし" },
  15: { digits: 1, terms: 3, sub: false, sumMax: 18, label: "3口" },
  14: { digits: 1, terms: 3, sub: false },
  13: { digits: 1, terms: 3, sub: false },
  12: { digits: 1, terms: 3, sub: false },
  11: { digits: 1, terms: 3, sub: false },
};
// フラッシュ暗算 10〜1級（1桁→2桁→3桁の段階式。1個あたり約0.8秒で一定）
const FLASH_STD = {
  10: { digits: 1, terms: 3, sec: 2.4 }, 9: { digits: 1, terms: 4, sec: 3.2 }, 8: { digits: 1, terms: 5, sec: 4.0 },
  7: { digits: 1, terms: 7, sec: 5.6 }, 6: { digits: 2, terms: 3, sec: 2.4 }, 5: { digits: 2, terms: 4, sec: 3.2 },
  4: { digits: 2, terms: 5, sec: 4.0 }, 3: { digits: 2, terms: 7, sec: 5.6 }, 2: { digits: 2, terms: 10, sec: 8.0 },
  1: { digits: 3, terms: 5, sec: 4.0 },
};
// フラッシュ暗算 段位（全珠連基準。初段/二/五/七/十段は指定値、三・四・八・九段は補間、六段=3桁12口8秒）
const FLASH_DAN = {
  1: { digits: 2, terms: 15, sec: 10 }, 2: { digits: 3, terms: 4, sec: 4 }, 3: { digits: 3, terms: 6, sec: 5 },
  4: { digits: 3, terms: 8, sec: 6 }, 5: { digits: 3, terms: 10, sec: 7 }, 6: { digits: 3, terms: 12, sec: 8 },
  7: { digits: 3, terms: 15, sec: 8 }, 8: { digits: 3, terms: 15, sec: 6 }, 9: { digits: 3, terms: 15, sec: 4 },
  10: { digits: 3, terms: 15, sec: 3 },
};
// フラッシュ暗算 11〜20級（練習級。すべて1桁＝10級(2桁)より易しい入門ラダー）
const FLASH_KYU_LOW = {
  20: { digits: 1, terms: 2, sec: 8 }, 19: { digits: 1, terms: 2, sec: 6 }, 18: { digits: 1, terms: 3, sec: 7 },
  17: { digits: 1, terms: 3, sec: 6 }, 16: { digits: 1, terms: 4, sec: 6 }, 15: { digits: 1, terms: 4, sec: 5 },
  14: { digits: 1, terms: 5, sec: 6 }, 13: { digits: 1, terms: 5, sec: 5 }, 12: { digits: 1, terms: 6, sec: 5 },
  11: { digits: 1, terms: 6, sec: 4 },
};
// 1個あたりの表示時間(ms)。級で滑らかに変化＝全体のテンポを一定にする（秒÷口のバラつきを解消）
function flashPaceMs(g) {
  if (g.band === "dan") return Math.max(300, 620 - g.dan * 32); // 初段≈588 … 十段≈300（速い）
  return Math.round(650 + (g.kyu - 1) / 19 * 400); // 1級≈650 … 20級≈1050（易しいほどゆっくり）
}
const SUBJECT = {
  mitori: { name: "みとり算", answer: "soroban", N: 10, per: 10, pass: 70, limit: 420 },
  kake: { name: "かけ算", answer: "soroban", N: 15, per: 10, pass: 100, limit: 420 },
  wari: { name: "わり算", answer: "soroban", N: 15, per: 10, pass: 100, limit: 420 },
  anzan: { name: "あんざん", answer: "input", N: 10, per: 10, pass: 70, limit: 180 },
  flash: { name: "フラッシュ暗算", answer: "flash" },
};

/* ---------- 級・段ラダー（20級〜十段） ---------- */
const GRADES = [];
for (let k = 20; k >= 1; k--) GRADES.push({ key: `${k}級`, band: "kyu", kyu: k });
["初段", "二段", "三段", "四段", "五段", "六段", "七段", "八段", "九段", "十段"].forEach((n, i) => GRADES.push({ key: n, band: "dan", dan: i + 1 }));
let gradeIdx = GRADES.findIndex((g) => g.key === "10級");
let subject = "mitori";
const currentGrade = () => GRADES[gradeIdx];

function difficulty(g, subj) {
  if (g.band === "kyu") {
    const k = g.kyu;
    if (k <= 15) {
      const s = SOROBAN_STD[k];
      if (subj === "mitori") return s.mitori;
      if (subj === "kake") return s.kake;
      if (subj === "wari") return s.wari;
      if (subj === "anzan") return ANZAN_STD[k] || ANZAN_LOW[k]; // 暗算は暗算検定の基準を使う（見取からの代用をやめた）
      if (subj === "flash") return k <= 10 ? FLASH_STD[k] : FLASH_KYU_LOW[k];
    } else {
      // 16〜20級：導入（見取・暗算・フラッシュのみ）
      if (subj === "anzan" || subj === "mitori") return ANZAN_LOW[k]; // 入門帯は みとり も同じラダー
      if (subj === "flash") return FLASH_KYU_LOW[k];
      return null;
    }
  } else {
    const d = g.dan; // 段位は目安（実際の検定は小数混じり50問）
    if (subj === "mitori") return { digits: 5 + Math.floor((d - 1) / 3), terms: 15 };
    if (subj === "kake") return { a: 5 + Math.floor((d - 1) / 3), b: 4 + Math.floor((d - 1) / 4) };
    if (subj === "wari") return { D: 8 + Math.floor(d / 2), dv: 4 + Math.floor((d - 1) / 4), qd: null };
    if (subj === "anzan") return { digits: 4 + Math.floor((d - 1) / 3), terms: 15 };
    if (subj === "flash") return FLASH_DAN[d];
  }
}

/* ============================================================ ジェネレータ */
function randDigits(d) { const min = d === 1 ? 1 : Math.pow(10, d - 1); return Math.floor(Math.random() * (Math.pow(10, d) - 1 - min + 1)) + min; }
// variants がある級は「桁と口数の組み合わせ」を丸ごと1つ選ぶ（桁と口数を別々に振らない）
const pickVariant = (s) => (s && s.variants ? s.variants[Math.floor(Math.random() * s.variants.length)] : s);
// 入門級用：答えがいくつになるかを決めて、そこから各項を作る（例：たして5＝1+4, 2+3…）
function genBySum(sp) {
  const T = sp.terms, MAX = 9;
  const lo = sp.sumExact != null ? sp.sumExact : (sp.sumMin != null ? sp.sumMin : T);
  const hi = sp.sumExact != null ? sp.sumExact : (sp.sumMax != null ? sp.sumMax : T * MAX);
  for (let tries = 0; tries < 300; tries++) {
    const S = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (S < T || S > T * MAX) continue;             // 各項1〜9では作れない合計
    const cuts = [];
    for (let i = 1; i < S; i++) cuts.push(i);        // Sを T個に分ける切れ目の候補
    for (let i = cuts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cuts[i], cuts[j]] = [cuts[j], cuts[i]]; }
    const sel = cuts.slice(0, T - 1).sort((a, b) => a - b);
    const nums = []; let prev = 0;
    for (const c of sel) { nums.push(c - prev); prev = c; }
    nums.push(S - prev);
    if (nums.length === T && nums.every((v) => v >= 1 && v <= MAX)) return { nums, answer: S };
  }
  return null;
}
function genMitori(spec) {
  const v = pickVariant(spec);
  if (v.sumExact != null || v.sumMin != null || v.sumMax != null) {   // 入門級：合計を決めて作る
    const r = genBySum(v); if (r) return r;
  }
  const { digits, terms, termsMax, sub } = v;
  const D = digits, lo = Math.max(1, D - 2); // 各項の桁数を lo〜D で混在（連盟サンプルに準拠してやさしめに）
  // 公式サンプルは1枚の中で口数が変わる級があるため terms〜termsMax から選ぶ
  const T = termsMax && termsMax > terms ? terms + Math.floor(Math.random() * (termsMax - terms + 1)) : terms;
  // sub:false の級（暗算7〜10級など）はサンプルどおり ひき算を出さない
  const allowSub = sub !== false && T >= 3; const nums = []; let total = 0;
  // 公式サンプルは必ずその級の桁数の数が入っているので、1つは必ずD桁にする
  // （これが無いと「4桁10口」のはずが偶然すべて3桁以下になり、級より易しい問題が出てしまう）
  const forceIdx = Math.floor(Math.random() * T);
  for (let i = 0; i < T; i++) {
    const dg = i === forceIdx ? D : lo + Math.floor(Math.random() * (D - lo + 1));
    const v = randDigits(dg);
    if (i > 0 && allowSub && Math.random() < 0.35 && total > v) { nums.push(-v); total -= v; }
    else { nums.push(v); total += v; }
  }
  return { nums, answer: total };
}
function genFlashNums({ digits, terms }) { const nums = []; let t = 0; for (let i = 0; i < terms; i++) { const v = randDigits(digits); nums.push(v); t += v; } return { nums, answer: t }; }
function genKake({ a, b }) { const f1 = randDigits(a), f2 = randDigits(b); return { display: `${f1.toLocaleString()} × ${f2.toLocaleString()}`, answer: f1 * f2, fa: f1, fb: f2 }; }
function genWari({ D, dv, qd }) {
  for (let t = 0; t < 300; t++) {
    const divisor = randDigits(dv);
    let qLow = Math.ceil(Math.pow(10, D - 1) / divisor), qHigh = Math.floor((Math.pow(10, D) - 1) / divisor);
    if (qd) { qLow = Math.max(qLow, Math.pow(10, qd - 1)); qHigh = Math.min(qHigh, Math.pow(10, qd) - 1); } else qLow = Math.max(qLow, 1);
    if (qLow > qHigh) continue;
    const q = Math.floor(Math.random() * (qHigh - qLow + 1)) + qLow;
    return { display: `${(divisor * q).toLocaleString()} ÷ ${divisor.toLocaleString()}`, answer: q, dividend: divisor * q, divisor, quotient: q };
  }
  return { display: "0 ÷ 1", answer: 0, dividend: 0, divisor: 1, quotient: 0 };
}
function mitoriDisplay(nums) { const fmt = (x) => x.toLocaleString(); return nums.map((v, i) => (i === 0 ? fmt(v) : `${v < 0 ? "−" : "+"} ${fmt(Math.abs(v))}`)).join("\n") + "\n――――\n= ?"; }
function genProblemFor(g, subj) {
  const diff = difficulty(g, subj); if (!diff) return null;
  if (subj === "mitori" || subj === "anzan") {
    const p = genMitori(diff);
    const compact = p.nums.map((v, i) => (i === 0 ? String(v) : (v < 0 ? "−" : "+") + Math.abs(v))).join("");
    return { display: mitoriDisplay(p.nums), compact, answer: p.answer, nums: p.nums };
  }
  if (subj === "kake") { const p = genKake(diff); return { ...p, compact: p.display }; }
  if (subj === "wari") { const p = genWari(diff); return { ...p, compact: p.display }; }
}
const groupInt = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/* ============================================================ 保存データ */
const STAT = "soroban_stats", RANK = "soroban_rank", TIMES = "soroban_times", LOG = "soroban_log", PROFILE = "soroban_profile";
const loadStat = () => JSON.parse(localStorage.getItem(STAT) || '{"streak":0,"lastDate":""}');
const saveStat = (s) => localStorage.setItem(STAT, JSON.stringify(s));
const today = () => new Date().toISOString().slice(0, 10);
function touchStreak() {
  const s = loadStat(), t = today();
  if (s.lastDate !== t) { const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10); s.streak = s.lastDate === y ? s.streak + 1 : 1; s.lastDate = t; saveStat(s); }
}
function certify(gradeKey) {
  const idx = GRADES.findIndex((g) => g.key === gradeKey);
  const cur = JSON.parse(localStorage.getItem(RANK) || "null");
  if (!cur || idx > cur.idx) localStorage.setItem(RANK, JSON.stringify({ key: gradeKey, idx }));
  renderProfile();
}
const rankText = () => { const r = JSON.parse(localStorage.getItem(RANK) || "null"); return r ? r.key : "未取得"; };
function saveTime(gradeKey, subj, sec) { const t = JSON.parse(localStorage.getItem(TIMES) || "{}"); const k = `${gradeKey}_${subj}`; const prev = t[k]; const improved = prev == null || sec < prev; if (improved) { t[k] = sec; localStorage.setItem(TIMES, JSON.stringify(t)); } return { improved, prev }; }
const allTimes = () => JSON.parse(localStorage.getItem(TIMES) || "{}");
const bestTime = (gradeKey, subj) => allTimes()[`${gradeKey}_${subj}`];
function bestPerSubject() { const t = allTimes(), r = {}; for (const [k, sec] of Object.entries(t)) { const subj = k.split("_")[1]; if (r[subj] == null || sec < r[subj]) r[subj] = sec; } return r; }
function fmtClock(sec) { sec = Math.max(0, sec); const m = Math.floor(sec / 60), s = sec - m * 60; return `${m}:${s.toFixed(1).padStart(4, "0")}`; }
function logStudy(sec) { const l = JSON.parse(localStorage.getItem(LOG) || "[]"); l.push({ d: today(), s: Math.round(sec) }); localStorage.setItem(LOG, JSON.stringify(l.slice(-800))); }
function monthStats() { const l = JSON.parse(localStorage.getItem(LOG) || "[]"); const ym = today().slice(0, 7); const m = l.filter((e) => e.d.startsWith(ym)); return { days: new Set(m.map((e) => e.d)).size, sec: m.reduce((a, e) => a + e.s, 0) }; }
function last7() { const l = JSON.parse(localStorage.getItem(LOG) || "[]"); const a = []; for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); a.push({ d, sec: l.filter((e) => e.d === d).reduce((x, e) => x + e.s, 0) }); } return a; }
const profile = () => JSON.parse(localStorage.getItem(PROFILE) || '{"name":"そろ太くん","avatar":"🧒"}');
const saveProfile = (p) => localStorage.setItem(PROFILE, JSON.stringify(p));
function fmtMin(sec) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h}時間${m}分` : `${m}分`; }
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/* ============================================================ GOLD・王国（キングダム層） */
// GOLDは「学習の成果」としてのみ入手（王国では消費のみ）＝ゲームだけで稼げない設計
const KINGDOM = "soroban_kingdom";
function loadKingdom() {
  const d = JSON.parse(localStorage.getItem(KINGDOM) || "null");
  if (!d) return { gold: 0, land: 1, b: { house: 1, road: 0, bridge: 0, school: 0, library: 0, dojo: 0 } };
  d.b = Object.assign({ house: 1, road: 0, bridge: 0, school: 0, library: 0, dojo: 0 }, d.b || {});
  if (d.gold == null) d.gold = 0; if (d.land == null) d.land = 1;
  return d;
}
const saveKingdom = (k) => localStorage.setItem(KINGDOM, JSON.stringify(k));
const getGold = () => loadKingdom().gold;
function addGold(n) { const k = loadKingdom(); k.gold = Math.max(0, Math.round((k.gold || 0) + n)); saveKingdom(k); renderGoldPill(); return k.gold; }
function kingdomLevel() { try { if (!craft) craft = loadCraft(); return 1 + Math.floor(craftBuiltCount() / 50); } catch (e) { return 1; } }
// 学習成果に応じたGOLD（正解・正答率・自己ベスト・完走）
// 級が上がるほど1問に時間がかかるので、報酬に級の倍率をかける（20級=1.0倍 … 十段=4.2倍）
function gradeGoldMult(grade) {
  if (!grade) return 1;
  const i = GRADES.findIndex((x) => x.key === grade.key);
  return i < 0 ? 1 : +(1 + i * 0.11).toFixed(2);
}
function goldForSection({ correct, N, bestUpdated, completed, grade }) {
  let g = correct * 2; const lines = [`正解 ${correct}問 ＋${correct * 2}`];
  const acc = N ? correct / N : 0;
  if (acc >= 0.9) { g += 20; lines.push("高正答率(90%↑) ＋20"); }
  else if (acc >= 0.7) { g += 10; lines.push("正答率(70%↑) ＋10"); }
  if (bestUpdated) { g += 30; lines.push("⏱ 自己ベスト更新 ＋30"); }
  if (completed) { g += 10; lines.push("完走 ＋10"); }
  const m = gradeGoldMult(grade);
  if (m > 1) { g = Math.round(g * m); lines.push(`${grade.key}ボーナス ×${m}`); }
  return { g, lines };
}
// 1日1回の連続学習ボーナス（その日の最初の学習で付与）
function dailyBonusOnce() {
  const s = loadStat(), t = today();
  if (s.goldDate === t) return null;
  s.goldDate = t; saveStat(s);
  const streak = Math.max(1, s.streak || 1);
  return { amt: 5 * Math.min(10, streak), label: `連続学習${streak}日ボーナス` };
}
// 次に買える建物までの目標（モチベーション表示）
function nextGoalHint() {
  const gold = getGold();
  let best = null;
  for (let i = 1; i < BLOCKS.length; i++) if (BLOCKS[i].cost > gold && (!best || BLOCKS[i].cost < best.cost)) best = BLOCKS[i];
  if (!best) return "🧱 クラフトで 世界を つくろう！";
  return "あと " + (best.cost - gold) + " GOLD で「" + best.n + "」が おけるよ！";
}

/* ---------- 学習セッションの記録（保護者画面・成績用） ---------- */
const SESSIONS = "soroban_sessions";
function logSession(subj, N, correct, sumSec, pauses, results) {
  const l = JSON.parse(localStorage.getItem(SESSIONS) || "[]");
  const e = { d: today(), subj, N, correct, sec: Math.round(sumSec), avg: N ? +(sumSec / N).toFixed(2) : 0, pauses: pauses || 0 };
  // まちがえた問題は「何をどう間違えたか」まで残す（あとで週ごとのクセを出すため）
  const miss = (results || []).filter((r) => !r.ok).slice(0, 8).map((r) => ({ q: r.compact, u: r.user, a: r.ans, k: missKind(r) }));
  if (miss.length) e.miss = miss;
  l.push(e);
  localStorage.setItem(SESSIONS, JSON.stringify(l.slice(-1500)));
}
const allSessions = () => JSON.parse(localStorage.getItem(SESSIONS) || "[]");
function sessionsBetween(from, to) { return allSessions().filter((e) => e.d >= from && e.d <= to); }

/* ============================================================ そろばん部品 */
let audioCtx;
function ensureAudio() { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function tone(freq, t0, dur, type = "sine", vol = 0.15) {
  if (!soundOn) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
/* ============================================================ 音
   ・音の材料（mp3）が assets/sfx/ にあれば それを鳴らす
   ・無ければ その場で波形を作って鳴らす（今までどおり／材料が増えるほど良くなる）
   ・音階は ペンタトニック（ヨナ抜き）に そろえるので、どう鳴らしても濁らない */
const SFX_DIR = "assets/sfx/";
const SFX_LIST = {
  click: "click", correct: "correct", wrong: "wrong", coin: "coin",
  pop: "pop", rocket: "rocket", boom: "boom", clear: "clear", levelup: "levelup", star: "star",
  // 玉の色ごとの音（消えたときに 鳴る）
  sparkle: "sparkle",       // 金の星
  drop: "drop",             // 水色（青いしずく）
  tile_red: "tile_red",     // 赤
  tile_purple: "tile_purple", // 紫
  tile_green: "tile_green",   // 緑
};
const sfxBuf = {};                       // 読みこんだ音
let sfxTried = false;
// 音の材料は mp3 / ogg / wav のどれでもよい（Kenney など海外の素材は ogg・wav が多い）
const SFX_EXT = ["mp3", "ogg", "wav"];
function sfxTry(name, k) {
  if (k >= SFX_EXT.length) return;
  try {
    const a = new Audio(SFX_DIR + name + "." + SFX_EXT[k]);
    a.preload = "auto";
    a.addEventListener("canplaythrough", function () { if (!sfxBuf[name]) sfxBuf[name] = a; }, { once: true });
    a.addEventListener("error", function () { sfxTry(name, k + 1); }, { once: true });   // 無ければ 次の形式を試す
    a.load();
  } catch (e) { sfxTry(name, k + 1); }
}
function sfxPreload() {
  if (sfxTried) return; sfxTried = true;
  Object.values(SFX_LIST).forEach(function (n) { sfxTry(n, 0); });
}
// 材料があれば それを、無ければ 合成音を鳴らす
function sfx(name, fallback, rate) {
  if (!soundOn) return;
  const a = sfxBuf[name];
  if (a) {
    try {
      const c = a.cloneNode();
      c.volume = sfxVol;
      if (rate) c.playbackRate = Math.max(0.5, Math.min(2.4, rate));   // 高さを変える（連鎖で上がる）
      c.play().catch(function () { });
      const lim = SFX_MAX[name];
      if (lim) setTimeout(function () { try { c.pause(); } catch (e) { } }, lim * 1000);
      return;
    } catch (e) { }
  }
  if (fallback) { try { fallback(); } catch (e) { } }
}
// 長い音は 途中で止める（玉が消えるたびに 数秒鳴ると 音が重なって濁るため）
const SFX_MAX = { tile_red: 0.7, tile_purple: 0.6, tile_green: 0.6, drop: 0.6, sparkle: 0.9 };
// 音量を 指定して鳴らす（下じきの音を 小さくするため）
function sfxAt(name, vol, rate) {
  if (!soundOn) return;
  const a = sfxBuf[name];
  if (!a) return;
  try {
    const c = a.cloneNode();
    c.volume = Math.max(0, Math.min(1, sfxVol * vol));
    if (rate) c.playbackRate = Math.max(0.5, Math.min(2.4, rate));
    c.play().catch(function () { });
    const lim = SFX_MAX[name];
    if (lim) setTimeout(function () { try { c.pause(); } catch (e) { } }, lim * 1000);
  } catch (e) { }
}
// ペンタトニックの音程ぶんだけ 再生速度を上げる＝音が階段状に上がる
const sfxRateFor = (step) => Math.pow(2, SCALE_PENTA[Math.max(0, Math.min(SCALE_PENTA.length - 1, step | 0))] / 12);
let sfxVol = 0.8;
/* ---- 音階（ペンタトニック）。どの段でも きれいに上がっていく ---- */
const SCALE_PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const noteHz = (step, base) => (base || 523.25) * Math.pow(2, SCALE_PENTA[Math.max(0, Math.min(SCALE_PENTA.length - 1, step | 0))] / 12);
/* ---- 合成音を すこし厚くする（2声＋やわらかい減衰） ---- */
function tone2(freq, t0, dur, type, vol) {
  tone(freq, t0, dur, type || "triangle", vol == null ? 0.14 : vol);
  tone(freq * 2.005, t0 + 0.012, dur * 0.7, "sine", (vol == null ? 0.14 : vol) * 0.35);   // 倍音を すこし足す
}
function chord(t0, root, kind, dur, vol) {
  const c = ensureAudio();
  const set = kind === "maj7" ? [0, 4, 7, 11] : kind === "maj" ? [0, 4, 7] : [0, 3, 7];
  set.forEach(function (semi, i) {
    tone2(root * Math.pow(2, semi / 12), t0 + i * 0.012, dur, "triangle", (vol || 0.12) * (1 - i * 0.12));
  });
}

/* ---- BGM（材料があれば鳴る。無ければ 何も起きない） ---- */
const BGM_KEY = "soroban_bgm", VOL_KEY = "soroban_vol", BGML_KEY = "soroban_bgmlv";
// BGMの音量：0=切 1=小 2=中 3=大
const BGM_STEPS = [0, 0.10, 0.22, 0.38];
let bgmLevel = (function () { const v = parseInt(localStorage.getItem(BGML_KEY), 10); return isFinite(v) && v >= 0 && v <= 3 ? v : 2; })();
let bgmOn = bgmLevel > 0;
let bgmEl = null, bgmName = "";
const bgmCache = {};        // よみこんだ曲を とっておく入れもの
// 効果音の音量：0=切 1=小 2=中 3=大
const SFX_STEPS = [0, 0.35, 0.7, 1.0];
let sfxLevel = (function () { const v = parseInt(localStorage.getItem(VOL_KEY), 10); return isFinite(v) && v >= 0 && v <= 3 ? v : 2; })();
sfxVol = SFX_STEPS[sfxLevel];
function setSfxLevel(n) {
  sfxLevel = Math.max(0, Math.min(3, n | 0));
  sfxVol = SFX_STEPS[sfxLevel];
  soundOn = sfxLevel > 0;
  try { localStorage.setItem(VOL_KEY, String(sfxLevel)); localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) { }
  if (!soundOn) bgmStop(); else { sfxPreload(); }
  renderVolSegs();
}
// 上のバーと 設定画面、どちらのボタンも 同じ状態にする
function renderVolSegs() {
  $$(".vol-seg").forEach(function (seg) {
    const lv = seg.dataset.kind === "bgm" ? bgmLevel : sfxLevel;
    seg.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", +b.dataset.lv === lv); });
  });
}
function bgmPlay(name) {
  if (!bgmOn || !soundOn) return bgmStop();
  if (bgmName === name && bgmEl) return;
  bgmStop();
  // 一度よみこんだ曲は とっておく（ステージを行き来しても 読み直さない＝通信の無駄をなくす）
  if (bgmCache[name]) {
    bgmEl = bgmCache[name]; bgmName = name; bgmEl.loop = true; bgmEl.volume = 0;
    try { bgmEl.currentTime = 0; } catch (e) { }
    const pc = bgmEl.play(); if (pc && pc.catch) pc.catch(function () { });
  } else {
  let ext = 0;
  const tryNext = function () {
    if (ext >= SFX_EXT.length) {
      bgmEl = null; bgmName = "";
      if (name !== "bgm_study") bgmPlay("bgm_study");     // その曲が無ければ 練習用を流す
      return;
    }
    bgmEl = new Audio(SFX_DIR + name + "." + SFX_EXT[ext++]);
    bgmEl.loop = true; bgmEl.volume = 0; bgmName = name;
    bgmEl.addEventListener("error", tryNext, { once: true });
    bgmEl.addEventListener("canplay", function () { bgmCache[name] = bgmEl; }, { once: true });
    const p2 = bgmEl.play(); if (p2 && p2.catch) p2.catch(function () { });
  };
  tryNext();
  }
  try {
    const target = BGM_STEPS[bgmLevel] || 0;
    let v = 0;                                  // そっと 音を上げる
    const id = setInterval(function () {
      if (!bgmEl) return clearInterval(id);
      v = Math.min(target, v + 0.02); bgmEl.volume = v;
      if (v >= target) clearInterval(id);
    }, 90);
  } catch (e) { bgmEl = null; }
}
function bgmStop() { if (bgmEl) { try { bgmEl.pause(); } catch (e) { } } bgmEl = null; bgmName = ""; }
function setBgm(on) { setBgmLevel(on ? (bgmLevel || 2) : 0); }
// BGMの音量を 切・小・中・大 から えらぶ
function setBgmLevel(n) {
  bgmLevel = Math.max(0, Math.min(3, n | 0));
  bgmOn = bgmLevel > 0;
  try { localStorage.setItem(BGML_KEY, String(bgmLevel)); localStorage.setItem(BGM_KEY, bgmOn ? "on" : "off"); } catch (e) { }
  if (!bgmOn) bgmStop();
  else if (bgmEl) bgmEl.volume = BGM_STEPS[bgmLevel];
  else { sfxPreload(); bgmPlay(bgmName || "bgm_study"); }
}

/* パズルの曲は ステージごとに 入れかわる（同じ曲ばかり聞かないように） */
const BGM_LIST = [
  { f: "bgm1", n: "ファンタジー1" },
  { f: "bgm2", n: "ファンタジー2" },
  { f: "bgm3", n: "アコースティック1" },
  { f: "bgm4", n: "アコースティック2" },
  { f: "bgm_study", n: "ピアノ" },
];
const MAIN_KEY = "soroban_bgmmain", TURN_KEY = "soroban_bgmturn";
let bgmMain = localStorage.getItem(MAIN_KEY) || "bgm_study";      // メインの曲（設定で えらべる）
const bgmName2 = (f) => (BGM_LIST.find((b) => b.f === f) || {}).n || f;
function setBgmMain(f) {
  bgmMain = f;
  try { localStorage.setItem(MAIN_KEY, f); } catch (e) { }
  bgmStop(); bgmPlay(f);
}
/* ステージが始まるたびに 曲を送る。
   メインの曲を 1回おきに挟むので、メインが いちばん多くかかりつつ 毎回ちがう曲になる。 */
function bgmNextStage() {
  let t = parseInt(localStorage.getItem(TURN_KEY), 10); if (!isFinite(t)) t = 0;
  t++;
  try { localStorage.setItem(TURN_KEY, String(t)); } catch (e) { }
  if (t % 2 === 1) return bgmMain;                                  // 奇数回は メインの曲
  const others = BGM_LIST.filter((b) => b.f !== bgmMain);
  if (!others.length) return bgmMain;
  return others[((t / 2 | 0) - 1 + others.length) % others.length].f;
}
// 画面に合わせて BGM を切りかえる
function bgmForView(v, next) {
  if (v === "puzzle") bgmPlay(next ? bgmNextStage() : (bgmName || bgmMain));
  else if (v === "play" || v === "today") bgmPlay(bgmMain);         // 練習中は メインの曲
  else bgmStop();
}

function clickSnd() { // 珠が弾く「パチ」
  if (!soundOn) return;
  if (sfxBuf["click"]) return sfx("click");
  try {
    const c = ensureAudio(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.03);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.07);
  } catch {}
}
// ピンポン♪（ドとソ→高いド：長調で 明るく）
function correctSnd() {
  sfx("correct", function () {
    const c = ensureAudio(), t = c.currentTime;
    tone2(783.99, t, 0.12, "triangle", 0.16);
    tone2(1046.5, t + 0.1, 0.24, "triangle", 0.18);
  });
}
// ブー（責めすぎない やわらかい低音。2音下がるだけ）
function wrongSnd() {
  sfx("wrong", function () {
    const c = ensureAudio(), t = c.currentTime;
    tone2(311.13, t, 0.16, "triangle", 0.12);
    tone2(261.63, t + 0.13, 0.26, "triangle", 0.12);
  });
}
function neutralSnd() { try { const c = ensureAudio(), t = c.currentTime; tone(680, t, 0.08, "triangle", 0.1); } catch {} }
// 小さいファンファーレ（ドミソド → 最後に和音）
function fanfareSnd() {
  sfx("clear", function () {
    const c = ensureAudio(), t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone2(f, t + i * 0.09, 0.2, "triangle", 0.16));
    chord(t + 0.38, 523.25, "maj", 0.5, 0.11);
  });
}
// GOLDをもらったとき「チャリーン♪」
// GOLDが入ったときの音（レジスター）。GOLDを使うときは 鳴らさない
function coinSnd(delay = 0) {
  if (delay > 0) { setTimeout(function () { coinSnd(0); }, delay * 1000); return; }
  sfx("coin", function () {
    const c = ensureAudio(), t = c.currentTime;
    [1568, 2093, 2637].forEach((f, i) => tone(f, t + i * 0.045, 0.20, "triangle", 0.12));
    tone(3136, t + 0.10, 0.34, "sine", 0.06); // きらめきの余韻
  });
}
// 大きな達成のとき「タタタ ターン！」
function bigFanfareSnd() {
  sfx("levelup", function () {
    const c = ensureAudio(), t = c.currentTime;
    // タタタ ターン！（ド・ド・ド → ミ → ソ → 高いドの和音）
    [[523.25, 0], [523.25, 0.12], [523.25, 0.24], [659.25, 0.38], [783.99, 0.54]]
      .forEach(function (p) { tone2(p[0], t + p[1], 0.16, "triangle", 0.16); });
    chord(t + 0.72, 1046.5, "maj", 0.7, 0.13);
    chord(t + 0.72, 523.25, "maj", 0.9, 0.08);
  });
}

function makeSoroban(root, onChange) {
  const state = Array.from({ length: COLS }, () => ({ heaven: false, earth: 0 }));
  const refs = []; let typed = ""; root.innerHTML = "";
  for (let c = 0; c < COLS; c++) {
    const col = document.createElement("div"); col.className = "col";
    let inner = `<div class="rod"></div><div class="bar"></div>`;
    if (isUnitPoint(c)) inner += `<div class="unit-dot${c === ONES_COL ? " ones" : ""}"></div>`;
    col.innerHTML = inner;
    const heaven = document.createElement("div"); heaven.className = "bead";
    heaven.dataset.col = c; heaven.dataset.type = "heaven";
    col.appendChild(heaven);
    const earth = [];
    for (let j = 0; j < 4; j++) { const b = document.createElement("div"); b.className = "bead"; b.dataset.col = c; b.dataset.type = "earth"; b.dataset.j = j; col.appendChild(b); earth.push(b); }
    refs.push({ heaven, earth }); root.appendChild(col); renderCol(c);
  }
  // 珠の位置は CSS の --bh に合わせて計算する（画面の広さで そろばんが大きくなっても ずれない）
  function renderCol(c) {
    const { heaven, earth } = refs[c];
    heaven.style.top = state[c].heaven ? "calc(var(--bh) + 2px)" : "2px";
    for (let j = 0; j < 4; j++) {
      const k = 2 + (j < state[c].earth ? j : j + 1);
      earth[j].style.top = "calc(var(--bh) * " + k + " + 9px)";
    }
  }
  function setDigit(c, d) { state[c].heaven = d >= 5; state[c].earth = d % 5; renderCol(c); }
  function digitAt(c) { return (state[c].heaven ? 5 : 0) + state[c].earth; }
  function parts() { let i = "", f = ""; for (let c = 0; c <= ONES_COL; c++) i += digitAt(c); for (let c = ONES_COL + 1; c < COLS; c++) f += digitAt(c); i = i.replace(/^0+/, "") || "0"; f = f.replace(/0+$/, ""); return { intStr: i, fracStr: f, disp: groupInt(i) + (f ? "." + f : "") }; }
  const emit = () => onChange && onChange(parts());
  function applyBead(c, type, j) {
    let changed = false;
    if (type === "heaven") { state[c].heaven = !state[c].heaven; changed = true; }
    else { const ne = j < state[c].earth ? j : j + 1; if (ne !== state[c].earth) { state[c].earth = ne; changed = true; } }
    renderCol(c);
    if (changed) { typed = syncTyped(); clickSnd(); emit(); }
  }
  // 指／マウスのドラッグで珠を弾く（なぞった珠が順に動く）
  let dragging = false, lastKey = null;
  function beadAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.classList && el.classList.contains("bead"))
      return { c: +el.dataset.col, type: el.dataset.type, j: el.dataset.j != null ? +el.dataset.j : 0, key: el.dataset.col + el.dataset.type + (el.dataset.j || "") };
    return null;
  }
  root.addEventListener("pointerdown", (e) => { if (e.button > 0) return; const b = beadAt(e.clientX, e.clientY); if (!b) return; dragging = true; lastKey = b.key; applyBead(b.c, b.type, b.j); e.preventDefault(); });
  root.addEventListener("pointermove", (e) => { if (!dragging) return; const b = beadAt(e.clientX, e.clientY); if (!b || b.key === lastKey) return; lastKey = b.key; applyBead(b.c, b.type, b.j); });
  window.addEventListener("pointerup", () => { dragging = false; lastKey = null; });
  function syncTyped() { const p = parts(); let s = p.intStr === "0" ? "" : p.intStr; if (p.fracStr) s = (s || "0") + "." + p.fracStr; return s; }
  function renderTyped() { for (let c = 0; c < COLS; c++) setDigit(c, 0); const [ip = "", fp = ""] = (typed || "").split("."); for (let k = 0; k < ip.length; k++) { const col = ONES_COL - (ip.length - 1 - k); if (col >= 0 && col <= ONES_COL) setDigit(col, +ip[k]); } for (let k = 0; k < fp.length; k++) { const col = ONES_COL + 1 + k; if (col < COLS) setDigit(col, +fp[k]); } emit(); }
  function handleKey(e) {
    if (/^[0-9]$/.test(e.key)) { if (typed === "0") typed = ""; const [ip = "", fp = ""] = typed.split("."); if (typed.includes(".")) { if (fp.length < COLS - 1 - ONES_COL) typed += e.key; } else { if (ip.length < ONES_COL + 1) typed += e.key; } renderTyped(); clickSnd(); e.preventDefault(); }
    else if (e.key === ".") { if (!typed.includes(".")) typed = (typed || "0") + "."; e.preventDefault(); }
    else if (e.key === "Backspace") { typed = typed.slice(0, -1); renderTyped(); e.preventDefault(); }
    else if (e.key === "Escape") { typed = ""; renderTyped(); e.preventDefault(); }
  }
  function clear() { typed = ""; for (let c = 0; c < COLS; c++) setDigit(c, 0); emit(); }
  emit();
  return { clear, handleKey, value: () => parts() };
}
let sorobanParts = { intStr: "0", fracStr: "" };
const sorobanQuiz = makeSoroban($("#soroban2"), onQuizChange);
$("#clearSoroban2").addEventListener("click", () => sorobanQuiz.clear());
// たいせん用のそろばん（みとり算・かけ算・わり算のとき使う）
let battleParts = { intStr: "0", fracStr: "" };
const sorobanBattle = makeSoroban($("#soroban3"), (p) => { $("#soroban3Value").textContent = p.disp; battleParts = p; });
$("#clearSoroban3").addEventListener("click", () => sorobanBattle.clear());
const currentBattleAnswer = () => (battleParts.fracStr === "" ? Number(battleParts.intStr) : NaN);

/* ============================================================ 画面ルーティング */
const TITLES = { home: "ホーム", grades: "級・段を選ぶ", play: "れんしゅう", today: "本日の練習", battle: "たいせん", puzzle: "そろばんパズル", craft: "クラフト王国", parent: "保護者", records: "記録を見る", settings: "設定・プロフィール", lesson: "検定内容・解き方" };
function showView(v) {
  sfxPreload(); bgmForView(v);
  $$(".view").forEach((el) => el.classList.toggle("hidden", el.id !== "view-" + v));
  $("#pageTitle").textContent = TITLES[v] || "";
  if (v === "home") renderHome();
  if (v === "records") renderRecords();
  if (v === "settings") renderSettings();
  if (v === "today") renderToday();
  if (v === "battle") renderBattle();
  if (v === "puzzle") renderPuzzle();
  if (v === "craft") renderCraft();
  if (v === "parent") renderParent();
}
function setActiveNav(el) { $$(".nav").forEach((n) => n.classList.remove("active")); if (el) el.classList.add("active"); }
// 画面を離れるときは進行中のものをすべて破棄する（採点・GOLD付与・記録保存はしない）
function abandonActivity() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  session = null;                              // 練習・検定：セッションを破棄（採点しない）
  routineState = null; routineActive = false;  // 本日の練習：中断（時間経過で練習画面に戻さない）
  battle = null;                               // たいせん：不戦敗（GOLDなし）
  $("#playRest").classList.add("hidden");
  hidePauseUI();
}
$$(".nav").forEach((n) => n.addEventListener("click", () => {
  abandonActivity(); // 画面切り替え前に、走っているタイマーを止めて破棄する
  setActiveNav(n);
  if (n.dataset.subj) { subject = n.dataset.subj; showView("grades"); updateInfo(); }
  else showView(n.dataset.view);
}));
$("#examInfoBtn").addEventListener("click", () => showView("lesson"));
$("#startBtn").addEventListener("click", () => startSession(subject));
$("#quitBtn").addEventListener("click", quitSession);
// 効果音のON/OFF
function renderSound() { renderVolSegs(); }

// 上のバー・設定画面の どちらのボタンでも 音量を変えられる
document.addEventListener("click", function (e) {
  const b = e.target.closest ? e.target.closest(".vol-seg button") : null;
  if (!b) return;
  const kind = b.parentNode.dataset.kind, lv = +b.dataset.lv;
  if (kind === "bgm") { setBgmLevel(lv); renderVolSegs(); }
  else { setSfxLevel(lv); if (lv > 0) sfx("click", function () { clickSnd(); }); }
});

/* ---------- グリッド ---------- */
function gradeColor(g) { if (g.band === "dan") return "g-dan"; return g.kyu <= 10 ? "g-kyu-a" : "g-kyu-b"; }
function renderGrid() {
  const grid = $("#gradeGrid"); grid.innerHTML = "";
  for (let i = GRADES.length - 1; i >= 0; i--) {
    const g = GRADES[i];
    const cell = document.createElement("button");
    cell.className = `grade-cell ${gradeColor(g)}` + (i === gradeIdx ? " sel" : "");
    cell.textContent = g.key;
    cell.onclick = () => { gradeIdx = i; renderGrid(); updateInfo(); };
    grid.appendChild(cell);
  }
}
function moveGrade(d) { gradeIdx = clamp(gradeIdx + d, 0, GRADES.length - 1); renderGrid(); updateInfo(); }
function specText(g, subj) {
  const d = difficulty(g, subj);
  if (!d) return "（この級にはありません）";
  if (subj === "flash") return `${d.digits}桁 ${d.terms}口 / 約${(d.terms * flashPaceMs(g) / 1000).toFixed(1)}秒（1個 ${(flashPaceMs(g) / 1000).toFixed(1)}秒）`;
  if (subj === "kake") return `${d.a}桁 × ${d.b}桁`;
  if (subj === "wari") return `${d.D}桁 ÷ ${d.dv}桁`;
  const one = (v) => `${v.digits}桁 ${v.termsMax && v.termsMax > v.terms ? `${v.terms}〜${v.termsMax}` : v.terms}口`;
  if (d.label) return `${one(d)}　<b>${d.label}</b>`; // 入門級は「たして5」などの狙いを出す
  return d.variants ? d.variants.map(one).join(" ／ ") : one(d);
}
function updateInfo() {
  const g = currentGrade();
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.subj === subject));
  $$(".chip").forEach((c) => (c.disabled = !difficulty(g, c.dataset.subj)));
  if (!difficulty(g, subject)) { subject = "mitori"; return updateInfo(); }
  const cf = SUBJECT[subject];
  let info = `<b>${g.key}／${cf.name}</b>：${specText(g, subject)}`;
  if (cf.answer !== "flash") info += `　｜ ${cf.N}問・制限${cf.limit / 60}分・合格${cf.pass}点`;
  if (g.band === "dan" || g.kyu > 15) info += ` <span class="note">※目安</span>`;
  $("#gradeInfo").innerHTML = info;
  $("#timerToggleWrap").style.display = cf.answer === "flash" ? "none" : "";
}
$$(".chip").forEach((c) => c.addEventListener("click", () => { if (c.disabled) return; subject = c.dataset.subj; updateInfo(); }));

/* ---------- プロフィール／記録の描画 ---------- */
function renderProfile() {
  const p = profile();
  $("#avatarMini").textContent = p.avatar; $("#nameMini").textContent = p.name; $("#rankMini").textContent = rankText();
  $("#avatarBig").textContent = p.avatar; $("#nameBig").textContent = p.name; $("#rankBig").textContent = rankText();
  const ms = monthStats();
  $("#effortDays").textContent = ms.days; $("#effortTotal").textContent = fmtMin(ms.sec);
  const w = last7(); const max = Math.max(60, ...w.map((x) => x.sec));
  $("#effortChart").innerHTML = w.map((x, i) => `<div class="bar${i === 6 ? " today" : ""}" style="height:${Math.max(2, (x.sec / max) * 46)}px" title="${x.d}: ${fmtMin(x.sec)}"></div>`).join("");
  const bp = bestPerSubject();
  $("#bestList").innerHTML = ["mitori", "kake", "wari", "anzan"].map((s) => `<div class="brow"><span>${SUBJECT[s].name}</span><b>${bp[s] != null ? fmtClock(bp[s]) : "—"}</b></div>`).join("");
  renderGoldPill();
}

/* ---------- ホーム / 王国 / 保護者 の描画 ---------- */
function renderGoldPill() { const el = $("#goldPill"); if (el) el.innerHTML = `<img class="ico-coin" src="assets/coin.png" alt="" /> <b>${getGold().toLocaleString()}</b>`; }
function homeGrade() { const rk = JSON.parse(localStorage.getItem(RANK) || "null"); return rk ? GRADES[rk.idx] : currentGrade(); }
function routineMenuSummary(grade) {
  const steps = buildSteps(grade), cnt = {};
  steps.forEach((s) => { if (s.subj) cnt[s.subj] = (cnt[s.subj] || 0) + s.N; });
  return ["anzan", "kake", "wari", "mitori"].filter((s) => cnt[s]).map((s) => `<div class="menu-row"><span>${SUBJECT[s].name}</span><b>${cnt[s]}問</b></div>`).join("");
}
function renderHome() {
  const p = profile(), k = loadKingdom(), s = loadStat(), ms = monthStats(), g = homeGrade();
  $("#homeAvatar").textContent = p.avatar; $("#homeName").textContent = p.name; $("#homeRank").textContent = rankText();
  $("#homeMenu").innerHTML = routineMenuSummary(g) || '<div class="sub">この級では暗算・見取りを練習します</div>';
  $("#homeGold").textContent = k.gold.toLocaleString();
  $("#homeKingdomLv").textContent = kingdomLevel(k);
  $("#homeStreak").textContent = `${s.streak || 0}日`;
  $("#homeMonth").textContent = `${ms.days}日`;
  const doneToday = JSON.parse(localStorage.getItem(ROUTINE) || "[]").some((h) => h.date === today());
  $("#homeStatus").innerHTML = doneToday ? "✅ 今日の練習：<b>完了！</b>　えらい！" : "今日の練習：<b>0 / 1</b>　さあ始めよう！";
  renderWeakMenu();
  renderGoldPill();
}
/* ---------- にがて克服メニュー（その子のまちがえ方から作る） ---------- */
// 最近の記録から「どのクセで何回まちがえたか」を数える（新しい記録ほど重く見る）
function weakProfile(days) {
  const from = new Date(Date.now() - (days || 14) * 86400000).toISOString().slice(0, 10);
  const tally = {};
  allSessions().forEach((e) => {
    if (!e.miss || e.d < from) return;
    const fresh = e.d >= new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) ? 2 : 1;  // 直近3日は2倍
    e.miss.forEach((mm) => { const k = mm.k || "other"; tally[k] = (tally[k] || 0) + fresh; });
  });
  return Object.keys(tally).filter((k) => k !== "other")
    .map((k) => ({ k, n: tally[k] })).sort((a, b) => b.n - a.n);
}
function renderWeakMenu() {
  const el = $("#weakMenu"); if (!el) return;
  const w = weakProfile(14);
  if (!w.length) { el.innerHTML = '<div class="wm-none">まちがえた記録が たまると、ここに <b>にがて克服メニュー</b> が出ます。</div>'; return; }
  const rows = w.slice(0, 3).map((x) => {
    const K = MISS_KINDS[x.k] || MISS_KINDS.other;
    return `<div class="wm-row"><span class="wm-em">${K.em}</span><span class="wm-n">${K.n}</span>` +
      `<span class="wm-c">${x.n}回</span><button class="wm-go" data-k="${x.k}">▶ 5問 やる</button></div>`;
  }).join("");
  el.innerHTML = `<div class="wm-h">🎯 きみの にがて克服メニュー</div>${rows}` +
    `<div class="sub">まちがえたクセと同じ形の問題だけを 出します。正解すると GOLD ももらえるよ。</div>`;
  $$("#weakMenu .wm-go").forEach((b) => { b.onclick = () => startWeakSession(b.dataset.k, 5); });
}
function accBySubject(sessions) {
  const m = {};
  sessions.forEach((e) => { const s = (m[e.subj] = m[e.subj] || { N: 0, correct: 0 }); s.N += e.N; s.correct += e.correct; });
  return m;
}
function renderParent() {
  const s = loadStat(), rk = rankText();
  const to = today(), from = daysAgo(6), pfrom = daysAgo(13), pto = daysAgo(7);
  const thisWeek = sessionsBetween(from, to), lastWeek = sessionsBetween(pfrom, pto);
  const sum = (a, f) => a.reduce((x, e) => x + f(e), 0);
  const tN = sum(thisWeek, (e) => e.N), tC = sum(thisWeek, (e) => e.correct), lN = sum(lastWeek, (e) => e.N);
  const acc = tN ? Math.round((tC / tN) * 100) : 0;
  const timed = thisWeek.filter((e) => e.avg > 0);
  const avgT = timed.length ? sum(timed, (e) => e.avg * e.N) / sum(timed, (e) => e.N) : 0;
  const days = new Set(thisWeek.map((e) => e.d)).size;
  const diff = tN - lN, diffTxt = lN ? (diff >= 0 ? `先週より +${diff}問 📈` : `先週より ${diff}問`) : "先週の記録はまだありません";
  $("#parentSummary").innerHTML =
    '<div class="pgrid">' +
    `<div class="pcell"><span>現在の級</span><b>${rk}</b></div>` +
    `<div class="pcell"><span>連続学習</span><b>${s.streak || 0}日</b></div>` +
    `<div class="pcell"><span>今週の学習日数</span><b>${days}日</b></div>` +
    `<div class="pcell"><span>今週の問題数</span><b>${tN}問</b></div>` +
    `<div class="pcell"><span>今週の正答率</span><b>${acc}%</b></div>` +
    `<div class="pcell"><span>平均回答時間</span><b>${avgT ? avgT.toFixed(1) + "秒" : "—"}</b></div>` +
    `</div><div class="sub">${diffTxt}</div>`;
  const bars = [], wk = ["日", "月", "火", "水", "木", "金", "土"];
  for (let i = 6; i >= 0; i--) { const d = daysAgo(i); bars.push({ d, n: sum(sessionsBetween(d, d), (e) => e.N) }); }
  const maxN = Math.max(10, ...bars.map((b) => b.n));
  $("#parentWeek").innerHTML = '<div class="pbars">' + bars.map((b) => {
    const lbl = wk[new Date(b.d + "T00:00:00").getDay()];
    return `<div class="pbar-col"><span class="pbar-n">${b.n}</span><div class="pbar" style="height:${Math.max(3, (b.n / maxN) * 90)}px"></div><span class="pbar-l">${lbl}</span></div>`;
  }).join("") + "</div>";
  const m = accBySubject(sessionsBetween(daysAgo(29), to));
  const rows = ["mitori", "kake", "wari", "anzan", "flash"].filter((x) => m[x]).map((x) => ({ x, a: Math.round((m[x].correct / m[x].N) * 100), N: m[x].N }));
  if (!rows.length) { $("#parentSubjects").innerHTML = '<p class="sub">練習を重ねると、得意・苦手が分かります。</p>'; return; }
  const best = rows.slice().sort((a, b) => b.a - a.a)[0], worst = rows.slice().sort((a, b) => a.a - b.a)[0];
  $("#parentSubjects").innerHTML = rows.map((r) => `<div class="psub"><span>${SUBJECT[r.x].name}</span><div class="psub-bar"><div style="width:${r.a}%"></div></div><b>${r.a}%</b></div>`).join("") +
    `<div class="sub">得意：<b>${SUBJECT[best.x].name}</b>（${best.a}%）／ これから：<b>${SUBJECT[worst.x].name}</b>（${worst.a}%）</div>`;
}
function routineGraphSVG(hist) {
  if (!hist.length) return '<p class="sub">「本日の練習」を完了すると、正答率の推移グラフがここに出ます。</p>';
  const data = hist.slice(-20), n = data.length, W = 560, H = 180, pad = 28;
  const x = (i) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (n - 1));
  const y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${pad}" y1="${y(v)}" x2="${W - pad}" y2="${y(v)}" stroke="#eee"/><text x="4" y="${y(v) + 3}" font-size="9" fill="#999">${v}</text>`).join("");
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.acc).toFixed(1)}`).join(" ");
  const dots = data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.acc).toFixed(1)}" r="3.5" fill="#c0392b"><title>${d.date} ${d.grade} ${d.acc}%</title></circle>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="graph">${grid}<polyline points="${pts}" fill="none" stroke="#c0392b" stroke-width="2"/>${dots}</svg><p class="sub">正答率(%)の推移・直近${n}回</p>`;
}
function renderRecords() {
  const ms = monthStats();
  $("#recEffort").textContent = `学習日数 ${ms.days}日　／　合計 ${fmtMin(ms.sec)}`;
  const hist = JSON.parse(localStorage.getItem(ROUTINE) || "[]");
  $("#routineGraph").innerHTML = routineGraphSVG(hist);
  const hrows = hist.slice(-15).reverse().map((h) => `<tr><td>${h.date}</td><td>${h.grade}</td><td>${h.acc}%</td><td>${h.totalCorrect}/${h.totalN}</td><td>${fmtClock(h.timeSec)}</td></tr>`).join("");
  $("#routineList").innerHTML = hrows
    ? `<table class="rec-table"><tr><th>日付</th><th>級・段</th><th>正答率</th><th>正解</th><th>時間</th></tr>${hrows}</table>`
    : "";
  const t = allTimes(), subs = ["mitori", "kake", "wari", "anzan"];
  const rows = GRADES.filter((g) => subs.some((s) => t[`${g.key}_${s}`] != null))
    .map((g) => `<tr><td>${g.key}</td>${subs.map((s) => `<td>${t[`${g.key}_${s}`] != null ? fmtClock(t[`${g.key}_${s}`]) : "—"}</td>`).join("")}</tr>`).join("");
  $("#recordsTable").innerHTML = rows
    ? `<table class="rec-table"><tr><th>級・段</th><th>みとり</th><th>かけ</th><th>わり</th><th>あんざん</th></tr>${rows}</table>`
    : `<p class="sub">まだ種目別の記録がありません。練習を完走するとタイムが記録されます。</p>`;
}
function renderToday() {
  const sel = $("#todayGrade");
  if (!sel.dataset.filled) {
    sel.innerHTML = GRADES.map((g, i) => `<option value="${i}">${g.key}</option>`).join("");
    sel.dataset.filled = "1";
  }
  const rk = JSON.parse(localStorage.getItem(RANK) || "null");
  sel.value = rk ? rk.idx : gradeIdx;
}
$("#todayStart").addEventListener("click", () => startRoutine(GRADES[+$("#todayGrade").value]));
const AVATARS = ["🧒", "👦", "👧", "🧑", "👩‍🦰", "🦊", "🐼", "🐯", "🐰", "🦉"];
// 音の設定（効果音・BGM・音量）
function renderSound2() {
  renderVolSegs();
  const songs = $("#bgmSongs"), n = $("#sfxNote");
  if (songs) {
    songs.innerHTML = BGM_LIST.map(function (b) {
      const main = b.f === bgmMain, now = b.f === bgmName;
      return '<div class="song' + (main ? " main" : "") + '">' +
        '<button class="song-play" data-f="' + b.f + '">▶</button>' +
        '<span class="song-n">' + b.n + (now ? ' <small>♪いま</small>' : "") + "</span>" +
        (main ? '<span class="song-badge">メイン</span>'
          : '<button class="song-main" data-f="' + b.f + '">メインにする</button>') +
        "</div>";
    }).join("");
  }
  if (n) n.innerHTML = "メインの曲は 練習中に流れ、パズルでは 1ステージおきに かかります。" +
    "ほかの曲は ステージごとに 順ぐりで 入れかわります。";
}
// 曲を ためし聞き／メインに する
document.addEventListener("click", function (e) {
  if (!e.target.closest) return;
  const p = e.target.closest(".song-play");
  if (p) { bgmStop(); bgmPlay(p.dataset.f); renderSound2(); return; }
  const m = e.target.closest(".song-main");
  if (m) { setBgmMain(m.dataset.f); renderSound2(); }
});
function renderSettings() {
  renderSound2();
  const p = profile();
  $("#nameInput").value = p.name;
  $("#avatarPicker").innerHTML = AVATARS.map((a) => `<button data-a="${a}" class="${a === p.avatar ? "sel" : ""}">${a}</button>`).join("");
  $$("#avatarPicker button").forEach((b) => b.addEventListener("click", () => { $$("#avatarPicker button").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); }));
}
$("#saveProfileBtn").addEventListener("click", () => {
  const name = ($("#nameInput").value || "そろ太くん").trim();
  const sel = $("#avatarPicker button.sel");
  saveProfile({ name, avatar: sel ? sel.dataset.a : "🧒" });
  renderProfile();
  $("#saveMsg").textContent = "保存しました ✓";
  setTimeout(() => ($("#saveMsg").textContent = ""), 1500);
});

/* ---------- じぶんのそろばんを使うか（画面のそろばんを出すか） ---------- */
const MYSORO = "soroban_mysoroban";
const useMySoroban = () => localStorage.getItem(MYSORO) === "1";
// 自分のそろばんを使う子は、画面のそろばんを出さずに数字で答える（問題が見切れないようにするため）
const answerModeFor = (cf) => (cf.answer === "soroban" && useMySoroban() ? "input" : cf.answer);
(function () {
  const el = $("#mySoroban"); if (!el) return;
  el.checked = useMySoroban();
  el.addEventListener("change", () => { localStorage.setItem(MYSORO, el.checked ? "1" : "0"); updateInfo(); });
})();
// 口数が多い級（5級・4級など）でも1画面に収まるよう、行数に合わせて字の大きさを変える
// 問題の字は「のこっている高さ」に合わせて決める。
// 口数が少ないときは 大きく、多いときだけ 小さくして 見切れを防ぐ。
let fitLast = "";
function fitProblem(text) {
  const el = $("#playProblem"); if (!el) return;
  if (text != null) fitLast = String(text);
  const lines = Math.max(1, fitLast.split(String.fromCharCode(10)).length);
  const soroOn = $("#playSorobanWrap") && !$("#playSorobanWrap").classList.contains("hidden");
  const vh = window.innerHeight || 800;
  const avail = Math.max(150, vh - (soroOn ? 430 : 250));   // そろばん・ボタン・上の表示のぶんを のぞく
  const size = Math.max(20, Math.min(46, Math.floor(avail / (lines * 1.42))));
  el.style.fontSize = size + "px";
  el.style.lineHeight = "1.42";
}
window.addEventListener("resize", function () { if (fitLast) fitProblem(null); });

/* ============================================================ セッション */
function startSession(subj) {
  const grade = currentGrade();
  if (subj === "flash") return startFlash(grade);
  if (!difficulty(grade, subj)) { alert("この級にはこの種目がありません"); return; }
  const cf = SUBJECT[subj];
  session = { subj, grade, cf, N: cf.N, idx: 0, correct: 0, answerBy: answerModeFor(cf), timed: $("#timerToggle").checked, mode: $("#examMode").checked ? "end" : "each", results: [], locking: false, start: performance.now(), cur: null, paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0 };
  $("#playMark").classList.add("hidden");
  $("#pauseBtn").classList.remove("hidden"); setPauseUI(false);
  showView("play");
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", session.answerBy !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", session.answerBy !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.toggle("hidden", subj !== "anzan"); // あんざんのときだけコツを出す
  $("#stepsRow").classList.toggle("hidden", !["mitori", "kake", "wari"].includes(subj));
  $("#playGrade").textContent = `${grade.key}／${cf.name}` + (session.timed ? "（検定）" : "（記録）");
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  playTimer = setInterval(tickPlay, 150);
  nextPlayProblem();
}
// 一時停止していた時間を差し引いた「実際の経過時間」（停止中は止めた時点で固定）
const playElapsed = () => ((session.paused ? session.pauseAt : performance.now()) - session.start - (session.pausedMs || 0)) / 1000;
function tickPlay() {
  if (!session || session.paused) return; // 一時停止中はタイマーを進めない
  const el = playElapsed();
  if (session.timed) { const rem = session.cf.limit - el; $("#playTimer").textContent = "⏱ " + fmtClock(rem); if (rem <= 0) finishSession(); }
  else $("#playTimer").textContent = "⏱ " + fmtClock(el);
}
/* ---------- 一時停止 / さいかい ---------- */
function setPauseUI(on) {
  $("#playPause").classList.toggle("hidden", !on);
  $("#pauseBtn").textContent = on ? "▶ さいかい" : "⏸ 一時停止";
}
function hidePauseUI() { $("#pauseBtn").classList.add("hidden"); $("#playPause").classList.add("hidden"); }
function pausePlay() {
  if (!session || session.paused) return;
  session.paused = true; session.pauseAt = performance.now(); session.pauseCount = (session.pauseCount || 0) + 1;
  // 一時停止中に問題を考えられないよう、問題と解答欄を隠す
  $("#playProblemWrap").classList.add("hidden");
  $("#playSorobanWrap").classList.add("hidden");
  $("#playInputWrap").classList.add("hidden");
  setPauseUI(true);
}
function resumePlay() {
  if (!session || !session.paused) return;
  const d = performance.now() - session.pauseAt;
  session.pausedMs = (session.pausedMs || 0) + d;
  if (session.qStart) session.qStart += d; // 1問ごとの回答時間にも停止分を含めない
  session.paused = false;
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", session.answerBy !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", session.answerBy !== "input");
  setPauseUI(false);
  if (session.answerBy === "input") $("#playInput").focus();
}
$("#pauseBtn").addEventListener("click", () => (session && session.paused ? resumePlay() : pausePlay()));
$("#resumeBtn").addEventListener("click", resumePlay);
function nextPlayProblem() {
  // にがて克服のときは、あらかじめ作っておいた問題を順に出す
  session.cur = (session.queue && session.queue.length) ? session.queue.shift() : genProblemFor(session.grade, session.subj);
  stepCtx = { subj: session.subj, cur: session.cur }; // 解き方用（完了後も参照できるよう保持）
  $("#playProblem").textContent = session.cur.display;
  fitProblem(session.cur.display);       // 口数が多くても1画面に収める
  $("#playMark").classList.add("hidden");
  const prog = session.mode === "end" ? `回答 ${Math.min(session.idx + 1, session.N)} / ${session.N}` : `${Math.min(session.idx + 1, session.N)} / ${session.N}　正解 ${session.correct}`;
  $("#playProgress").textContent = prog;
  $("#steps").classList.add("hidden");
  session.qStart = performance.now(); // 1問ごとの回答時間を計測
  if (session.answerBy === "soroban") sorobanQuiz.clear();
  else { $("#playInput").value = ""; $("#playInput").focus(); }
}
function onQuizChange(p) {
  $("#soroban2Value").textContent = p.disp;
  sorobanParts = p;
}
function sectionResultHTML(sec) {
  const rows = sec.items.map((it, i) =>
    `<div class="qrow"><span class="qn">${i + 1}</span><span class="qq">${it.compact}</span>` +
    `<span class="qa">=${it.user}${it.ok ? "" : ` <s>${it.ans}</s>`}</span>` +
    `<span class="qm ${it.ok ? "ok" : "ng"}">${it.ok ? "◎" : "×"}</span></div>`).join("");
  return `<div class="section-score">${sec.label}：<b>${sec.correct} / ${sec.N}</b>　タイム ${fmtClock(sec.sec)}</div><div class="qlist">${rows}</div>`;
}
function currentSorobanAnswer() {
  return sorobanParts.fracStr === "" ? Number(sorobanParts.intStr) : NaN;
}
// 答え合わせ（◎／×表示、採点方式に応じて進行）
function submitAnswer(val) {
  if (!session || session.locking || session.paused) return;
  const ok = val === session.cur.answer;
  if (ok) session.correct++;
  const qt = session.qStart ? (performance.now() - session.qStart) / 1000 : null;
  // 1問ごとに「何を出して・何と答えて・正解は何か」を残す（まちがえ方のクセを調べるため）
  session.results.push({ no: session.idx + 1, ok, compact: session.cur.compact || "", user: Number.isFinite(val) ? val : "—", ans: session.cur.answer, t: qt, nums: session.cur.nums || null, subj: session.subj });
  if (session.mode === "end") {
    neutralSnd(); // 検定方式：正誤を明かさず最後にまとめて採点
    advance();
  } else {
    session.locking = true;
    ok ? correctSnd() : wrongSnd();
    showMark(ok);
    setTimeout(() => { session.locking = false; advance(); }, 850);
  }
}
function showMark(ok) {
  const m = $("#playMark");
  m.textContent = ok ? "◎" : "×";
  m.className = "mark " + (ok ? "ok" : "ng");
  clearTimeout(showMark._t);
  showMark._t = setTimeout(() => m.classList.add("hidden"), 800);
}
$("#answerBtn").addEventListener("click", () => submitAnswer(currentSorobanAnswer()));
$("#playInputWrap").addEventListener("submit", (e) => { e.preventDefault(); submitAnswer(parseInt($("#playInput").value, 10)); });
function advance() { session.idx++; if (session.idx >= session.N) finishSession(); else nextPlayProblem(); }
function finishSession() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (!session) return;
  if (session.routine) return finishRoutineSection();
  hidePauseUI();
  const el = playElapsed();
  const completed = session.idx >= session.N, cf = session.cf;
  let msg = "";
  if (session.mode === "end" && session.results.length) {
    msg += `<div class="marks">` + session.results.map((r) => `<span class="mk ${r.ok ? "ok" : "ng"}">${r.ok ? "◎" : "×"}</span>`).join("") + `</div>`;
  }
  msg += `タイム <b>${fmtClock(el)}</b>　正解 ${session.correct} / ${session.N}`;
  const report = missReportHTML(session.results);   // 正答率と「まちがえ方のクセ」の図解
  let cls = "ok", bestUpdated = false;
  touchStreak(); // streak更新（GOLD連続ボーナスの前に）
  if (completed && session.weak) {
    // にがて克服は問題の形がちがうので、自己ベストには入れない（記録とGOLDだけ）
    logStudy(el); logSession(session.subj, session.N, session.correct, el, session.pauseCount, session.results);
    const K = MISS_KINDS[session.weak] || MISS_KINDS.other;
    msg += `<br>🎯 <b>${K.n}</b> の 克服れんしゅう`;
    if (session.correct === session.N) msg += `　<b class="hl">✨ ぜんぶ せいかい！ このクセ、なおってきたよ</b>`;
  } else if (completed) {
    const r = saveTime(session.grade.key, session.subj, el); bestUpdated = r.improved;
    logStudy(el); logSession(session.subj, session.N, session.correct, el, session.pauseCount, session.results);
    msg += `<br>⏱ 自己ベスト：${fmtClock(bestTime(session.grade.key, session.subj))}`;
    if (bestUpdated) msg += `　<b class="hl">✨自己ベスト更新！</b>`;
    else if (r.prev != null && el > r.prev) msg += `　<span class="sub">あと ${(el - r.prev).toFixed(1)}秒で自己ベスト！</span>`;
    const ts = session.results.map((x) => x.t).filter((x) => x != null);
    if (ts.length) { const avg = ts.reduce((a, b) => a + b, 0) / ts.length, fast = Math.min(...ts); msg += `<br>平均回答 <b>${avg.toFixed(1)}秒</b> ／ 最速 ${fast.toFixed(1)}秒`; }
    if (session.pauseCount) msg += `<br><span class="sub">⏸ 一時停止 ${session.pauseCount}回（タイムには含めていません）</span>`;
  }
  if (session.timed) {
    const score = session.correct * cf.per, pass = score >= cf.pass;
    msg += `<br>${pass ? "🎉 合格！" : "不合格"}（${score} / ${cf.per * session.N}点・合格${cf.pass}）`;
    cls = pass ? "ok" : "ng";
    if (pass) { certify(session.grade.key); msg += `<br>🎓 ${session.grade.key} 認定！`; }
  }
  msg += report;
  if (completed) { // GOLDは学習の成果としてのみ付与
    const { g, lines } = goldForSection({ correct: session.correct, N: session.N, bestUpdated, completed, grade: session.grade });
    let earned = g; const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; lines.push(`🔥 ${daily.label} ＋${daily.amt}`); }
    addGold(earned);
    msg += `<div class="gold-earn"><img class="ico-coin" src="assets/coin.png" alt="" /> <b>＋${earned} GOLD</b><div class="gold-lines">${lines.join("・")}</div><div class="goal">${nextGoalHint()}</div></div>`;
  }
  renderProfile();
  // 音だけでなく、画面いっぱいに ねぎらいと祝福を出す
  const acc100 = session.N ? Math.round(session.correct / session.N * 100) : 0;
  if (session.timed) {
    const pass2 = session.correct * cf.per >= cf.pass;
    if (pass2) fxCelebrate(3, "🎓 " + session.grade.key + " ごうかく！", "おめでとう！ よく がんばったね");
    else fxCheer("あと すこし…", "合格は " + cf.pass + "点。もう一度 いこう！");
  } else if (completed) {
    if (bestUpdated) fxCelebrate(3, "⏱ 自己ベスト こうしん！", "いままでで いちばん 速かった！");
    else if (acc100 === 100) fxCelebrate(3, "💯 ぜんもん せいかい！", "パーフェクト！");
    else if (acc100 >= 80) fxCelebrate(2, "よくできました！", "正答率 " + acc100 + "%");
    else fxCelebrate(1, "おつかれさま！", "さいごまで やりきったね");
  } else {
    fxCheer("とちゅうまで やったね", "つづきは いつでも できるよ");
  }
  if (completed) coinSnd(1.0); // GOLD獲得の「チャリーン」はファンファーレの後に
  msg += `<br><button id="againBtn">もう一度</button> <button id="toKingdomBtn">🧩 パズルへ</button> <button id="homeBtn" class="ghost">級・段選択へ</button>`;
  const passed = session.timed ? (session.correct * cf.per >= cf.pass) : completed;
  const face = passed ? "king_celebrate.png" : "king_wave.png";
  const badge = bestUpdated ? '<span class="badge-chip best">⏱ 自己ベスト更新！</span>'
    : (session.timed && passed ? '<span class="badge-chip perfect">🎓 ごうかく！</span>' : "");
  msg = `<div class="result-hero"><img class="rh-face" src="assets/${face}" alt="レオ王" />${badge ? `<span class="rh-badge">${badge}</span>` : ""}</div>` + msg;
  $("#playResult").innerHTML = msg; $("#playResult").className = "result " + cls;
  $("#playProblem").textContent = "おつかれさま！";
  const subj = session.subj, weak = session.weak, weakN = session.weakN; session = null;
  $("#againBtn").onclick = () => (weak ? startWeakSession(weak, weakN) : startSession(subj));
  const tk = $("#toKingdomBtn"); if (tk) tk.onclick = () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="puzzle"]')); };
  $("#homeBtn").onclick = () => { showView("grades"); setActiveNav(document.querySelector('.nav[data-view="grades"]')); updateInfo(); };
}
function quitSession() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  session = null; routineState = null;
  hidePauseUI();
  const back = routineActive ? "today" : "grades";
  routineActive = false;
  showView(back); setActiveNav(document.querySelector(`.nav[data-view="${back}"]`)); updateInfo();
}

/* ============================================================ 本日の練習（ルーティン） */
const ROUTINE = "soroban_routine";
let routineState = null, restTimer = null, routineActive = false;
const ROUTINE_TEMPLATE = [
  { subj: "anzan", N: 15, timed: true, label: "暗算 ①（3分）" },
  { rest: 60, next: "暗算 ②" },
  { subj: "anzan", N: 15, timed: true, label: "暗算 ②（3分）" },
  { rest: 60, next: "暗算 ③" },
  { subj: "anzan", N: 15, timed: true, label: "暗算 ③（3分）" },
  { rest: 120, next: "かけ算" },
  { subj: "kake", N: 15, timed: false, label: "かけ算 15問" },
  { rest: 60, next: "わり算" },
  { subj: "wari", N: 15, timed: false, label: "わり算 15問" },
  { rest: 60, next: "みとり算" },
  { subj: "mitori", N: 10, timed: false, label: "みとり算 10問" },
];
function buildSteps(grade) {
  const kept = ROUTINE_TEMPLATE.filter((s) => s.rest != null || difficulty(grade, s.subj));
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    if (s.rest != null) { const nx = kept[i + 1]; if (out.length === 0 || !nx || nx.rest != null) continue; }
    out.push(s);
  }
  return out;
}
function startRoutine(grade) {
  const steps = buildSteps(grade);
  if (!steps.length) { alert("この級では本日の練習を実施できません"); return; }
  routineState = { grade, steps, stepIdx: 0, sections: [], gold: 0 };
  routineActive = true;
  runStep();
}
function runStep() {
  if (!routineState) return;
  const step = routineState.steps[routineState.stepIdx];
  if (!step) return finishRoutine();
  if (step.rest != null) showRest(step); else startQuizSection(step);
}
function startQuizSection(step) {
  const grade = routineState.grade, cf = SUBJECT[step.subj];
  // 採点は最後にまとめて（mode:end）。暗算は入力式（そろばんを出さない）、かけ/わり/みとりはそろばん
  session = { subj: step.subj, grade, cf, N: step.N, idx: 0, correct: 0, answerBy: answerModeFor(cf), timed: !!step.timed, mode: "end", results: [], locking: false, start: performance.now(), cur: null, routine: true, label: step.label, paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0 };
  $("#playMark").classList.add("hidden");
  $("#pauseBtn").classList.remove("hidden"); setPauseUI(false);
  showView("play");
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", session.answerBy !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", session.answerBy !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.toggle("hidden", step.subj !== "anzan");
  $("#stepsRow").classList.toggle("hidden", !["mitori", "kake", "wari"].includes(step.subj));
  const total = routineState.steps.filter((s) => s.rest == null).length;
  const done = routineState.steps.slice(0, routineState.stepIdx).filter((s) => s.rest == null).length;
  $("#playGrade").textContent = `本日の練習 ${done + 1}/${total}：${step.label}`;
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  playTimer = setInterval(tickPlay, 150);
  nextPlayProblem();
}
function finishRoutineSection() {
  const el = playElapsed();
  routineState.sections.push({ label: session.label, subj: session.subj, correct: session.correct, N: session.N, sec: el, items: session.results });
  logSession(session.subj, session.N, session.correct, el, session.pauseCount, session.results);
  const { g } = goldForSection({ correct: session.correct, N: session.N, bestUpdated: false, completed: true, grade: session.grade });
  routineState.gold = (routineState.gold || 0) + g;
  correctSnd();
  session = null;
  routineState.stepIdx++;
  runStep(); // 自動で次（休憩 or 次セット）へ
}
function showRest(step) {
  session = null;
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  hidePauseUI();
  $("#anzanTip").classList.add("hidden"); // 休憩中は消す
  showView("play");
  $("#playProblemWrap").classList.add("hidden");
  $("#playSorobanWrap").classList.add("hidden");
  $("#playInputWrap").classList.add("hidden");
  $("#playFlashWrap").classList.add("hidden");
  $("#playResult").textContent = ""; $("#playGrade").textContent = "本日の練習：休憩"; $("#playProgress").textContent = ""; $("#playTimer").textContent = "";
  $("#playRest").classList.remove("hidden");
  const last = routineState.sections[routineState.sections.length - 1];
  $("#restResult").innerHTML = last ? missReportHTML(last.items) + sectionResultHTML(last) : "";
  $("#restNext").textContent = step.next ? `つぎは：${step.next}（自動で始まります）` : "";
  let left = step.rest;
  const render = () => ($("#restTimer").textContent = fmtClock(left));
  render();
  restTimer = setInterval(() => { left--; render(); if (left <= 0) endRest(); }, 1000);
}
function endRest() {
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  $("#playRest").classList.add("hidden");
  routineState.stepIdx++; runStep();
}
// 休憩の「スキップ ▶」で、待たずに次のセットへ
$("#restSkip").addEventListener("click", () => { if (routineState) endRest(); });
function finishRoutine() {
  const rs = routineState; routineState = null; routineActive = false;
  const totalCorrect = rs.sections.reduce((a, s) => a + s.correct, 0);
  const totalN = rs.sections.reduce((a, s) => a + s.N, 0);
  const totalTime = rs.sections.reduce((a, s) => a + s.sec, 0);
  const acc = totalN ? Math.round((totalCorrect / totalN) * 100) : 0;
  const hist = JSON.parse(localStorage.getItem(ROUTINE) || "[]");
  hist.push({ date: today(), grade: rs.grade.key, totalCorrect, totalN, acc, timeSec: Math.round(totalTime), sections: rs.sections.map((s) => ({ label: s.label, correct: s.correct, N: s.N, sec: Math.round(s.sec) })) });
  localStorage.setItem(ROUTINE, JSON.stringify(hist.slice(-200)));
  logStudy(totalTime); touchStreak();
  const sectionsGold = rs.gold || 0, completeBonus = 100;
  const goldLines = [`練習でためた ＋${sectionsGold}`, `本日の練習 完了 ＋${completeBonus}`];
  let earned = sectionsGold + completeBonus;
  const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; goldLines.push(`🔥 ${daily.label} ＋${daily.amt}`); }
  addGold(earned);
  renderProfile(); bigFanfareSnd(); coinSnd(1.4);
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden"); $("#playFlashWrap").classList.add("hidden");
  $("#playProblem").textContent = "🎉 本日の練習 完了！";
  $("#playGrade").textContent = `成績発表（${rs.grade.key}）`; $("#playTimer").textContent = ""; $("#playProgress").textContent = "";
  const rows = rs.sections.map((s) => `<div class="brow"><span>${s.label}</span><b>${s.correct}/${s.N}　${fmtClock(s.sec)}</b></div>`).join("");
  const last = rs.sections[rs.sections.length - 1];
  const detail = last ? sectionResultHTML(last) : "";
  $("#playResult").className = "result ok";
  const goldBlock = `<div class="gold-earn"><img class="ico-coin" src="assets/coin.png" alt="" /> <b>＋${earned} GOLD</b><div class="gold-lines">${goldLines.join("・")}</div><div class="goal">${nextGoalHint()}</div></div>`;
  const routineBadge = acc >= 90 ? '<span class="badge-chip perfect">★ パーフェクト！</span>' : '<span class="badge-chip">🏁 コンプリート！</span>';
  fxCelebrate(3, "🏁 本日の練習 かんりょう！", acc >= 90 ? "正答率 " + acc + "%　パーフェクト！" : "毎日 つづけているのが すごい");
  const routineHero = `<div class="result-hero"><img class="rh-face" src="assets/king_celebrate.png" alt="レオ王" /><span class="rh-badge">${routineBadge}</span></div>`;
  const allItems = rs.sections.reduce((a, s) => a.concat(s.items || []), []);   // 本日の練習ぜんぶ分のクセ
  $("#playResult").innerHTML = `${routineHero}<div class="marks">正答率 ${acc}%（${totalCorrect}/${totalN}）</div>${rows}<div class="sub">合計タイム ${fmtClock(totalTime)}</div>${missReportHTML(allItems)}${goldBlock}${detail}<br><button id="toKingdomBtn2">🧩 パズルへ</button> <button id="toRecordsBtn">📊 グラフを見る</button> <button id="routineHomeBtn" class="ghost">本日の練習へ</button>`;
  $("#toKingdomBtn2").onclick = () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="puzzle"]')); };
  $("#toRecordsBtn").onclick = () => { showView("records"); setActiveNav(document.querySelector('.nav[data-view="records"]')); };
  $("#routineHomeBtn").onclick = () => { showView("today"); setActiveNav(document.querySelector('.nav[data-view="today"]')); };
}

/* ---------- 解き方（みとり算） ---------- */
const PLACE = ["一の位", "十の位", "百の位", "千の位", "万の位", "十万の位", "百万の位"];
const placeName = (p) => PLACE[p] || `${p + 1}桁目`;
function addToPlace(board, place, d, out) {
  if (d === 0) return; const v = board[place] || 0;
  if (v + d <= 9) { if (d <= 4 && (v % 5) + d <= 4) out.push(`${placeName(place)}に一玉を${d}個入れる`); else if (d === 5) out.push(`${placeName(place)}に五玉を入れる`); else if (d < 5) out.push(`${placeName(place)}で五玉を入れて${5 - d}を払う（5の友：${d}は${5 - d}）`); else out.push(`${placeName(place)}に五玉と一玉で${d}を入れる`); board[place] = v + d; }
  else { const comp = 10 - d; out.push(`<span class="hint">くり上がり</span>：${placeName(place + 1)}に1を入れて、${placeName(place)}から${comp}を払う（10の友：${d}は${comp}）`); board[place] = v - comp; addToPlace(board, place + 1, 1, out); }
}
function subToPlace(board, place, d, out) {
  if (d === 0) return; const v = board[place] || 0;
  if (v - d >= 0) { if (d <= 4 && v % 5 >= d) out.push(`${placeName(place)}の一玉を${d}個払う`); else if (d === 5) out.push(`${placeName(place)}の五玉を払う`); else if (d < 5) out.push(`${placeName(place)}で五玉を払って${5 - d}を入れる（5の友：${d}は${5 - d}）`); else out.push(`${placeName(place)}から五玉と一玉で${d}を払う`); board[place] = v - d; }
  else { const comp = 10 - d; out.push(`<span class="hint">くり下がり</span>：${placeName(place + 1)}から1を払って、${placeName(place)}に${comp}を入れる（10の友：${d}は${comp}）`); board[place] = v + comp; subToPlace(board, place + 1, 1, out); }
}
function boardValue(board) { let n = 0; for (let p = board.length - 1; p >= 0; p--) n = n * 10 + (board[p] || 0); return n; }
function solveSteps(nums) {
  const board = new Array(14).fill(0), terms = [];
  nums.forEach((v, i) => { const abs = Math.abs(v), digits = String(abs).split("").reverse().map(Number), out = []; for (let p = 0; p < digits.length; p++) v < 0 ? subToPlace(board, p, digits[p], out) : addToPlace(board, p, digits[p], out); terms.push({ label: i === 0 ? `${abs.toLocaleString()} を置く` : `${v < 0 ? "ひく" : "たす"} ${abs.toLocaleString()}`, moves: out, running: boardValue(board) }); });
  return terms;
}
let stepCtx = null;
// そろばんの図（SVG）。value を cols 桁で表示し、changed の位は黄色で強調
function beadEl(x, y, active) {
  return `<ellipse cx="${x}" cy="${y}" rx="8.5" ry="4.6" fill="${active ? "#d1782f" : "#cdbda2"}" stroke="#7a3b16" stroke-width="0.6"/>`;
}
function sorobanSVG(value, cols, changed) {
  const digits = String(Math.abs(value)).padStart(cols, "0").slice(-cols).split("").map(Number);
  const cw = 22, bh = 12, top = 2, barY = top + 2 * bh, earthTop = barY + 4, H = earthTop + 5 * bh + 2, W = cols * cw;
  let g = "";
  for (let c = 0; c < cols; c++) if (changed && changed.has(c)) g += `<rect x="${c * cw}" y="0" width="${cw}" height="${H}" fill="#fff3c4"/>`;
  for (let c = 0; c < cols; c++) {
    const x = c * cw + cw / 2, d = digits[c], heaven = d >= 5, earth = d % 5;
    g += `<line x1="${x}" y1="${top}" x2="${x}" y2="${H - 2}" stroke="#c9c9c9" stroke-width="2"/>`;
    g += beadEl(x, heaven ? top + bh + bh / 2 : top + bh / 2, heaven);
    for (let j = 0; j < 4; j++) {
      const active = j < earth;
      g += beadEl(x, (active ? earthTop + j * bh : earthTop + (j + 1) * bh) + bh / 2, active);
    }
  }
  g += `<line x1="0" y1="${barY}" x2="${W}" y2="${barY}" stroke="#333" stroke-width="3"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="soro-fig">${g}</svg>`;
}
function changedCols(prevV, curV, cols) {
  const a = String(Math.abs(prevV)).padStart(cols, "0").slice(-cols);
  const b = String(Math.abs(curV)).padStart(cols, "0").slice(-cols);
  const s = new Set();
  for (let i = 0; i < cols; i++) if (a[i] !== b[i]) s.add(i);
  return s;
}
function mitoriStepsHTML(nums) {
  const terms = solveSteps(nums);
  const finalVal = terms.length ? terms[terms.length - 1].running : 0;
  const cols = Math.max(3, String(Math.abs(finalVal)).length);
  let prev = 0;
  const body = terms.map((t) => {
    const changed = changedCols(prev, t.running, cols);
    prev = t.running;
    return `<div class="term"><div class="term-head">${t.label}</div>` +
      t.moves.map((m) => `<div class="move">${m}</div>`).join("") +
      `<div class="soro-wrap">${sorobanSVG(t.running, cols, changed)}<span class="soro-val">= ${t.running.toLocaleString()}</span></div></div>`;
  }).join("");
  return `<div class="soro-legend">🟠 入っている玉　🟡 この手で動いた位（ここが違えばそこで間違い）</div>` + body;
}
/* ============================================================ まちがえ方のクセを見つける
   1問ごとの「出した数・答えた数・正解」から、そろばんのどの技でつまずいたのかを判定する。
   言い方は解き方の説明（solveSteps）と同じ「5の友」「10の友」でそろえる。 */
const MISS_KINDS = {
  five: { n: "五玉（5の友）", em: "🖐", tip: "5の友は 1と4 ／ 2と3。<b>4をたす</b>ときは 一玉が たりないので〈<b>五玉を入れて 1を払う</b>〉。", ex: [3, 4] },
  ten: { n: "くり上がり・くり下がり（10の友）", em: "🔟", tip: "10の友は 1と9 ／ 2と8 ／ 3と7 ／ 4と6。<b>となりの位に 1を入れて</b>、この位から 友だちの数を 払う。", ex: [8, 5] },
  keta: { n: "位（くらい）の ずれ", em: "📏", tip: "答えが 10倍 や 10分の1 になっているよ。<b>一の位を どこに 置いたか</b>を たしかめよう。", ex: null },
  skip: { n: "数を 1つ とばした", em: "👀", tip: "読む数を 1つ 飛ばしたみたい。<b>ゆびで おさえながら</b> 上から順に 読もう。", ex: null },
  minus: { n: "たす・ひく の とりちがえ", em: "➕", tip: "たすところを ひいてしまったみたい。<b>＋と − を 声に出して</b> 読もう。", ex: null },
  kuku: { n: "九九の おぼえまちがい", em: "✖", tip: "答えが 九九ひとつぶん ずれているよ。その段を もう一度 声に出そう。", ex: null },
  other: { n: "そのほか", em: "🤔", tip: "もう一度 ゆっくり 計算してみよう。どこまで 合っていたかを たしかめると 見つかるよ。", ex: null },
};
// その問題を解くのに「5の友」「10の友」が必要だったかを、解き方の手順から調べる
function needsTech(nums, needle) {
  if (!nums) return false;
  try { return solveSteps(nums).some((t) => t.moves.some((m) => m.indexOf(needle) >= 0)); } catch (e) { return false; }
}
function missKind(r) {
  const u = Number(r.user), a = Number(r.ans);
  if (!Number.isFinite(u) || !Number.isFinite(a) || u === a) return "other";
  const diff = u - a, nums = r.nums;
  // 1手ずつ調べて「どこで玉を動かし間違えたか」が特定できたら、それを採用する（いちばん確か）
  if (nums) { const dg = diagnose(nums, u); if (dg && dg.kind !== "other") return dg.kind; }
  if (a !== 0 && (u === a * 10 || a === u * 10)) return "keta";                 // 桁ずれ
  // ちょうど10ずれていて、その問題にくり上がりがあるなら、まず「くり上がり忘れ」を疑う
  if (Math.abs(diff) % 10 === 0 && needsTech(nums, "10の友")) return "ten";
  if (nums) {
    for (const v of nums) if (v !== 0 && a - u === v) return "skip";            // 1つ とばした
    for (const v of nums) if (v !== 0 && a - u === 2 * v) return "minus";       // たすところを ひいた
  }
  if (r.subj === "kake" || r.subj === "wari") return Math.abs(diff) < a * 0.5 ? "kuku" : "other";
  if (Math.abs(diff) <= 6 && needsTech(nums, "5の友")) return "five";
  if (Math.abs(diff) % 10 === 0) return "ten";
  return "other";
}
// クセの図解：その子が実際にまちがえた問題の中から、つまずいた1手を取り出して そろばんの絵で見せる
function techFigHTML(kind, nums) {
  const K = MISS_KINDS[kind], needle = kind === "five" ? "5の友" : "10の友";
  let use = needsTech(nums, needle) ? nums : (K.ex || null);
  if (!use) return "";
  let prev = 0, hit = null;
  for (const t of solveSteps(use)) {
    if (t.moves.some((m) => m.indexOf(needle) >= 0)) { hit = { before: prev, after: t.running, label: t.label, moves: t.moves }; break; }
    prev = t.running;
  }
  if (!hit) return "";
  const cols = Math.max(2, String(hit.after).length);
  return `<div class="mr-fig">` +
    `<div class="mr-fig-1"><div class="mr-cap">${hit.before.toLocaleString()}</div>${sorobanSVG(hit.before, cols)}</div>` +
    `<div class="mr-arrow"><b>${hit.label}</b><span>▶</span></div>` +
    `<div class="mr-fig-1"><div class="mr-cap">${hit.after.toLocaleString()}</div>${sorobanSVG(hit.after, cols, changedCols(hit.before, hit.after, cols))}</div>` +
    `</div><div class="mr-moves">${hit.moves.map((m) => `<div class="move">${m}</div>`).join("")}</div>`;
}
/* ============================================================ まちがえた1手を つきとめる
   1手ずつ「どの位で・いくつを・どの技で」動かしたかを記録し、
   そこで起こりうる まちがい（五玉の入れ忘れ・くり上がり忘れ など）が
   その子の答えとぴったり一致するかを調べる。＝どこで玉を動かし間違えたかの特定。 */
function addStep2(board, place, d, out) {
  const s = { place, d, op: "+", before: boardValue(board) }, cur = board[place] || 0;
  if (cur + d <= 9) {
    s.tech = (d <= 4 && (cur % 5) + d <= 4) ? "one" : d === 5 ? "fiveBead" : d < 5 ? "five" : "both";
    board[place] = cur + d;
  } else { s.tech = "carry"; board[place] = cur - (10 - d); addToPlace(board, place + 1, 1, []); }
  s.after = boardValue(board); out.push(s);
}
function subStep2(board, place, d, out) {
  const s = { place, d, op: "-", before: boardValue(board) }, cur = board[place] || 0;
  if (cur - d >= 0) {
    s.tech = (d <= 4 && cur % 5 >= d) ? "one" : d === 5 ? "fiveBead" : d < 5 ? "five" : "both";
    board[place] = cur - d;
  } else { s.tech = "carry"; board[place] = cur + (10 - d); subToPlace(board, place + 1, 1, []); }
  s.after = boardValue(board); out.push(s);
}
// 各項を「1手ずつ」に分解する
function termMoves(nums) {
  const board = new Array(14).fill(0), terms = [];
  nums.forEach((v, i) => {
    const steps = [], abs = Math.abs(v), ds = String(abs).split("").reverse().map(Number);
    const before = boardValue(board);
    for (let p = 0; p < ds.length; p++) { if (!ds[p]) continue; v < 0 ? subStep2(board, p, ds[p], steps) : addStep2(board, p, ds[p], steps); }
    terms.push({ i, v, steps, before, after: boardValue(board) });
  });
  return terms;
}
const placeUnit = (p) => Math.pow(10, p);
// その1手で起こりうる「玉の動かしまちがい」を並べる（答えのズレ＝delta）
function stepMistakes(t, s) {
  const u = placeUnit(s.place), pn = placeName(s.place), d = s.d, out = [];
  if (s.tech === "five" && s.op === "+") {
    const comp = 5 - d, right = `${pn}で 五玉を 入れて ${comp} を 払う（5の友：${d}は${comp}）`;
    out.push({ kind: "five", delta: -5 * u, wrong: `${pn}で <b>五玉を 入れないで</b>、${comp} を 払ってしまった`, right });
    out.push({ kind: "five", delta: comp * u, wrong: `${pn}で 五玉は 入れたけど、<b>${comp} を 払いわすれた</b>`, right });
    // 友だちの数をまちがえる（4の友は1なのに2を払う、など）
    for (let c = 1; c <= 4; c++) if (c !== comp) out.push({ kind: "five", rank: 2.5, delta: (comp - c) * u, wrong: `<b>5の友を まちがえた</b>：${d} の友は ${comp} なのに、${pn}で ${c} を 払ってしまった`, right });
  } else if (s.tech === "five" && s.op === "-") {
    const comp = 5 - d, right = `${pn}で 五玉を 払って ${comp} を 入れる（5の友：${d}は${comp}）`;
    out.push({ kind: "five", delta: 5 * u, wrong: `${pn}で <b>五玉を 払わないで</b>、${comp} を 入れてしまった`, right });
    out.push({ kind: "five", delta: -comp * u, wrong: `${pn}で 五玉は 払ったけど、<b>${comp} を 入れわすれた</b>`, right });
    for (let c = 1; c <= 4; c++) if (c !== comp) out.push({ kind: "five", rank: 2.5, delta: (c - comp) * u, wrong: `<b>5の友を まちがえた</b>：${d} の友は ${comp} なのに、${pn}に ${c} を 入れてしまった`, right });
  } else if (s.tech === "carry" && s.op === "+") {
    const comp = 10 - d, nx = placeName(s.place + 1), right = `${nx}に 1を 入れて、${pn}から ${comp} を 払う（10の友：${d}は${comp}）`;
    out.push({ kind: "ten", delta: -10 * u, wrong: `<b>となりの ${nx}に 1を 入れわすれた</b>（くり上がり忘れ）`, right });
    out.push({ kind: "ten", delta: comp * u, wrong: `となりに 1は 入れたけど、<b>${pn}の ${comp} を 払いわすれた</b>`, right });
    for (let c = 1; c <= 9; c++) if (c !== comp) out.push({ kind: "ten", rank: 2.5, delta: (comp - c) * u, wrong: `<b>10の友を まちがえた</b>：${d} の友は ${comp} なのに、${pn}で ${c} を 払ってしまった`, right });
  } else if (s.tech === "carry" && s.op === "-") {
    const comp = 10 - d, nx = placeName(s.place + 1), right = `${nx}から 1を 払って、${pn}に ${comp} を 入れる（10の友：${d}は${comp}）`;
    out.push({ kind: "ten", delta: 10 * u, wrong: `<b>となりの ${nx}から 1を 借りわすれた</b>（くり下がり忘れ）`, right });
    out.push({ kind: "ten", delta: -comp * u, wrong: `1は 借りたけど、<b>${pn}に ${comp} を 入れわすれた</b>`, right });
    for (let c = 1; c <= 9; c++) if (c !== comp) out.push({ kind: "ten", rank: 2.5, delta: (c - comp) * u, wrong: `<b>10の友を まちがえた</b>：${d} の友は ${comp} なのに、${pn}に ${c} を 入れてしまった`, right });
  } else {
    out.push({ kind: "other", delta: -d * u, wrong: `${pn}の ${d} を <b>動かしわすれた</b>`, right: `${pn}に ${d} を ${s.op === "+" ? "入れる" : "払う"}` });
  }
  return out;
}
// その子の答えになる「1か所だけのまちがい」を探す
function diagnose(nums, userAns) {
  if (!nums || !Number.isFinite(userAns)) return null;
  const terms = termMoves(nums), S = nums.reduce((a, b) => a + b, 0), need = userAns - S;
  if (need === 0) return null;
  const cands = [];
  terms.forEach((t) => {
    t.steps.forEach((s) => {
      stepMistakes(t, s).forEach((mk) => {
        // そろばんで起こりえない（途中でマイナスになる）動きは候補にしない
        if (mk.delta === need && s.after + need >= 0) {
          cands.push({ t, s, kind: mk.kind, wrong: mk.wrong, right: mk.right, rank: mk.rank || (mk.kind === "other" ? 3 : 1) });
        }
      });
    });
    // 項まるごとのまちがい
    if (-t.v === need) cands.push({ t, s: null, kind: "skip", rank: 2, wrong: `この <b>${Math.abs(t.v)}</b> を まるごと たしわすれた（読みとばし）`, right: `${Math.abs(t.v)} を ${t.v < 0 ? "ひく" : "たす"}` });
    // 1つめは「置く」なので、たす・ひくの取りちがえは2つめ以降だけ。盤面がマイナスになる動きも除く
    if (t.i > 0 && -2 * t.v === need && t.before - t.v >= 0) cands.push({ t, s: null, kind: "minus", rank: 2, wrong: `<b>${t.v < 0 ? "ひくところを たして" : "たすところを ひいて"}</b> しまった`, right: `${Math.abs(t.v)} を ${t.v < 0 ? "ひく" : "たす"}` });
    if (9 * t.v === need) cands.push({ t, s: null, kind: "keta", rank: 2, wrong: `<b>${Math.abs(t.v)} を ひとつ上の位に 置いてしまった</b>（位のずれ）`, right: `${Math.abs(t.v)} の 一の位を 定位点に そろえて 置く` });
  });
  if (!cands.length) return null;
  cands.sort((a, b) => (a.rank - b.rank) || (a.t.i - b.t.i));
  const c = cands[0];
  const before = c.s ? c.s.before : c.t.before;
  const right = c.s ? c.s.after : c.t.after;
  return { kind: c.kind, termNo: c.t.i + 1, term: c.t.v, before, right, wrong: right + need, wrongText: c.wrong, rightText: c.right, terms };
}
/* 1問ぶんの「ていねいな解説」＝ 問題文・正しい玉の動き・その子の玉の動き・直しかた */
function twoBoards(before, right, wrong) {
  const cols = Math.max(2, String(Math.abs(right)).length, String(Math.abs(wrong)).length);
  const fig = (v, base) => `<div class="tb-1"><div class="tb-cap">${v.toLocaleString()}</div>${sorobanSVG(v, cols, changedCols(base, v, cols))}</div>`;
  return `<div class="tb"><div class="tb-side ok"><div class="tb-h">◎ 正しい 玉の動き</div><div class="tb-row">` +
    `<div class="tb-1"><div class="tb-cap">${before.toLocaleString()}</div>${sorobanSVG(before, cols)}</div><span class="tb-ar">▶</span>${fig(right, before)}</div></div>` +
    `<div class="tb-side ng"><div class="tb-h">✗ きみの 玉の動き（たぶん）</div><div class="tb-row">` +
    `<div class="tb-1"><div class="tb-cap">${before.toLocaleString()}</div>${sorobanSVG(before, cols)}</div><span class="tb-ar">▶</span>${fig(wrong, before)}</div></div></div>`;
}
function explainOneHTML(r, no) {
  const K = MISS_KINDS[r.k || missKind(r)] || MISS_KINDS.other;
  const head = `<div class="ex-head"><span class="ex-no">${no}問目</span><span class="ex-q">${r.compact}</span>` +
    `<span class="ex-a">きみの答え <b class="ng">${r.user}</b> ／ 正解 <b class="ok">${r.ans}</b></span></div>`;
  if (!r.nums) return `<div class="ex-card">${head}<div class="ex-diag">${K.em} ${K.n}：${K.tip}</div></div>`;
  const dg = diagnose(r.nums, Number(r.user));
  let body = "";
  if (dg) {
    body += `<div class="ex-diag">🔍 <b>${dg.termNo}つめの「${dg.term < 0 ? "−" : "+"}${Math.abs(dg.term)}」</b> で つまずいたよ<br>` +
      `<span class="ex-wrong">✗ ${dg.wrongText}</span><br><span class="ex-right">◎ ${dg.rightText}</span></div>` +
      twoBoards(dg.before, dg.right, dg.wrong) +
      `<div class="ex-fix">💡 ${(MISS_KINDS[dg.kind] || MISS_KINDS.other).tip}</div>`;
  } else {
    body += `<div class="ex-diag">🔍 どの1手で ずれたかは 見つけられなかったよ。下の 手順を 上から 声に出して たしかめよう。<br>` +
      `<span class="ex-wrong">答えの ちがい：${Number(r.user) - Number(r.ans) > 0 ? "＋" : "−"}${Math.abs(Number(r.user) - Number(r.ans))}</span></div>`;
  }
  body += `<div class="ex-all"><div class="ex-all-h">この問題の 玉の動き（ぜんぶ）</div><div class="steps">${mitoriStepsHTML(r.nums)}</div></div>`;
  return `<div class="ex-card">${head}${body}</div>`;
}
/* まとめの見立て（アセスメント）と、次にやることの提案 */
function assessmentHTML(items) {
  const all = items || [], wrong = all.filter((x) => !x.ok), right = all.filter((x) => x.ok);
  const avg = (a) => { const t = a.map((x) => x.t).filter((x) => x != null); return t.length ? t.reduce((p, c) => p + c, 0) / t.length : null; };
  const wt = avg(wrong), rt = avg(right);
  const tally = {}; wrong.forEach((r) => { const k = r.k || missKind(r); tally[k] = (tally[k] || 0) + 1; });
  const order = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
  const rows = order.map((k) => { const K = MISS_KINDS[k] || MISS_KINDS.other; return `<li>${K.em} <b>${K.n}</b> … ${tally[k]}回</li>`; }).join("");
  const tips = [];
  const top = order[0];
  if (top && top !== "other") tips.push(`いちばん多いのは <b>${(MISS_KINDS[top] || MISS_KINDS.other).n}</b>。下の 🎯ボタンで、この技だけの問題を 5問 やろう。`);
  if (wt != null && rt != null) {
    if (wt > rt * 1.6) tips.push(`まちがえた問題は 正解した問題より <b>${(wt / rt).toFixed(1)}倍 時間が かかっている</b>。手が止まる＝技を 思い出せていないサイン。あわてず、口に出して 玉を動かそう。`);
    else if (wt < rt * 0.7) tips.push(`まちがえた問題の方が <b>速い</b>。あわてて 手が先に 動いているかも。1つ 息を ついてから 始めよう。`);
  }
  const one = wrong.filter((r) => { const d = diagnose(r.nums, Number(r.user)); return d && d.termNo === 1; }).length;
  if (one >= 2) tips.push(`さいしょの 数で つまずくことが ${one}回。<b>始める前に 0（ご破算）</b>に なっているか たしかめよう。`);
  if (!tips.length) tips.push(`まちがえ方が バラバラだよ。まずは ゆっくり、1手ずつ 声に出して やってみよう。`);
  return `<div class="as-box"><div class="as-h">📋 きょうの 見立て</div>` +
    `<ul class="as-list">${rows}</ul>` +
    `<div class="as-time">1問の 平均：正解 ${rt != null ? rt.toFixed(1) + "秒" : "—"} ／ まちがい ${wt != null ? wt.toFixed(1) + "秒" : "—"}</div>` +
    `<div class="as-h2">つぎに やること</div><ol class="as-tips">${tips.map((t) => `<li>${t}</li>`).join("")}</ol></div>`;
}
/* 1セット終わったときに出す「正答率＋クセの図解」 */
function missReportHTML(items) {
  const list = (items || []).filter((x) => x && !x.ok);
  const N = (items || []).length, ok = N - list.length;
  const acc = N ? Math.round(ok / N * 100) : 0;
  const head = `<div class="mr-acc">正答率 <b>${acc}%</b>　<span class="sub">(${ok} / ${N})</span></div>`;
  if (!list.length) return `<div class="miss-report all-ok">${head}<div class="mr-top">🎉 <b>全問せいかい！</b> まちがえた クセは ありません。</div></div>`;
  const tally = {};
  list.forEach((r) => { const k = r.k || missKind(r); (tally[k] = tally[k] || []).push(r); });
  const order = Object.keys(tally).sort((a, b) => tally[b].length - tally[a].length);
  const top = order[0], K = MISS_KINDS[top] || MISS_KINDS.other, sample = tally[top][0];
  const others = order.slice(1).map((k) => `${(MISS_KINDS[k] || MISS_KINDS.other).n} ${tally[k].length}回`).join("　");
  // まちがえた問題は「全問」ていねいに解説する（1問ずつ、正しい動きと きみの動きを並べて）
  const details = list.map((r, i) => explainOneHTML(r, r.no || (i + 1))).join("");
  return `<div class="miss-report">${head}` +
    `<div class="mr-h">🔍 きみの まちがえ方の クセ</div>` +
    `<div class="mr-top">${K.em} <b>${K.n}</b> で <b>${tally[top].length}回</b> まちがえたよ</div>` +
    `<div class="mr-tip">${K.tip}</div>` +
    techFigHTML(top, sample.nums) +
    (others ? `<div class="mr-others">ほかに：${others}</div>` : "") +
    assessmentHTML(items) +
    `<button type="button" class="mr-drill" data-k="${top}">🎯 この クセの もんだいを 5問 やる</button>` +
    `<div class="ex-h">📖 まちがえた ${list.length}問の 解説（ぜんぶ）</div>${details}` +
    `</div>`;
}
/* ============================================================ にがて克服の問題づくり
   「そのクセが必ず出る形」だけを作る。作った候補を解き方エンジンにかけて、
   5の友／10の友が本当に必要かを確かめてから採用する（＝ねらいが外れない）。 */
function mitoriProblem(nums) {
  const compact = nums.map((v, i) => (i === 0 ? String(v) : (v < 0 ? "−" : "+") + Math.abs(v))).join("");
  return { display: mitoriDisplay(nums), compact, answer: nums.reduce((a, b) => a + b, 0), nums };
}
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function weakCandidate(kind) {
  if (kind === "five") return [rnd(1, 8), rnd(1, 8)];                     // 五玉の出し入れ
  if (kind === "ten") return [rnd(2, 9), rnd(2, 9)];                      // くり上がり
  if (kind === "skip") return [rnd(1, 9), rnd(1, 9), rnd(1, 9), rnd(1, 9)]; // 口数を増やして読む練習
  if (kind === "minus") return [rnd(5, 9), -rnd(1, 4), rnd(1, 4)];        // ＋と−が混ざる
  if (kind === "keta") return [rnd(11, 89), rnd(1, 9), rnd(11, 89)];      // 位をそろえる練習
  return [rnd(1, 9), rnd(1, 9), rnd(1, 9)];
}
function genWeakSet(kind, n) {
  if (kind === "kuku") {                                                   // 九九は かけ算で出す
    const out = [], seen = {};
    for (let g = 0; g < 200 && out.length < n; g++) {
      const a = rnd(2, 9), b = rnd(2, 9), key = a + "x" + b;
      if (seen[key]) continue; seen[key] = 1;
      out.push({ display: `${a} × ${b}`, compact: `${a}×${b}`, answer: a * b, fa: a, fb: b });
    }
    return out;
  }
  const out = [], seen = {};
  for (let g = 0; g < 3000 && out.length < n; g++) {
    const nums = weakCandidate(kind);
    let run = 0, ok = true;
    for (const v of nums) { run += v; if (run < 0) ok = false; }           // 途中で0より小さくならない
    if (!ok) continue;
    if (kind === "five" && (!needsTech(nums, "5の友") || needsTech(nums, "10の友"))) continue;
    if (kind === "ten" && !needsTech(nums, "10の友")) continue;
    const p = mitoriProblem(nums);
    if (seen[p.compact]) continue; seen[p.compact] = 1;
    out.push(p);
  }
  return out;
}
// にがて克服セッション（自己ベストや検定には影響させない。GOLDは正解のぶんだけ出る）
function startWeakSession(kind, n) {
  const K = MISS_KINDS[kind] || MISS_KINDS.other;
  const qs = genWeakSet(kind, n || 5);
  if (!qs.length) { alert("この にがての問題を うまく作れませんでした"); return; }
  const subj = kind === "kuku" ? "kake" : "mitori", cf = SUBJECT[subj];
  session = {
    subj, grade: currentGrade(), cf, N: qs.length, idx: 0, correct: 0, answerBy: cf.answer,
    timed: false, mode: "each", results: [], locking: false, start: performance.now(), cur: null,
    paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0, queue: qs.slice(), weak: kind, weakN: qs.length,
  };
  $("#playMark").classList.add("hidden");
  $("#pauseBtn").classList.remove("hidden"); setPauseUI(false);
  showView("play");
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", cf.answer !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", cf.answer !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.add("hidden");
  $("#stepsRow").classList.remove("hidden");
  $("#playGrade").textContent = `🎯 にがて克服：${K.n}`;
  $("#playTimer").textContent = ""; $("#playProgress").textContent = "";
  $("#playResult").innerHTML = `<div class="mr-tip">${K.em} ${K.tip}</div>`; $("#playResult").className = "result";
  $("#steps").classList.add("hidden");
  playTimer = setInterval(tickPlay, 150);
  nextPlayProblem();
}
// 「解き方をぜんぶ見る」の開け閉め（結果画面は毎回作りなおすので、まとめて受ける）
document.addEventListener("click", function (e) {
  if (!e.target.closest) return;
  const drill = e.target.closest(".mr-drill");
  if (drill) { startWeakSession(drill.dataset.k, 5); return; }
  const b = e.target.closest(".mr-more"); if (!b) return;
  const box = b.parentNode.querySelector(".mr-steps"); if (!box) return;
  box.classList.toggle("hidden");
  b.textContent = box.classList.contains("hidden") ? "この問題の 解き方を ぜんぶ見る" : "解き方を とじる";
});
function kakeStepsHTML(a, b, ans) {
  const bs = String(b).split("").reverse();
  const moves = [];
  bs.forEach((ch, i) => {
    const dig = +ch; if (dig === 0) return;
    const pp = a * dig * Math.pow(10, i);
    moves.push(`${a.toLocaleString()} × ${dig}${i ? "（" + "0".repeat(i) + "をつける）" : ""} = ${pp.toLocaleString()}`);
  });
  return `<div class="term"><div class="term-head">部分積をたして計算</div>` + moves.map((m) => `<div class="move">${m}</div>`).join("") + `<div class="move run">→ ${ans.toLocaleString()}</div></div>`;
}
function wariStepsHTML(dividend, divisor, q) {
  return `<div class="term"><div class="term-head">わり算の考え方</div>` +
    `<div class="move">${dividend.toLocaleString()} ÷ ${divisor.toLocaleString()} を、上の位から順に計算します。</div>` +
    `<div class="move">たしかめ：答え × わる数 ＝ ${q.toLocaleString()} × ${divisor.toLocaleString()} = ${(q * divisor).toLocaleString()}</div>` +
    `<div class="move run">→ ${q.toLocaleString()}</div></div>`;
}
$("#showSteps").addEventListener("click", () => {
  const box = $("#steps");
  if (!box.classList.contains("hidden")) return box.classList.add("hidden");
  if (!stepCtx || !stepCtx.cur) return;
  const c = stepCtx.cur, subj = stepCtx.subj;
  let html = "";
  if (subj === "mitori" || subj === "anzan") { if (!c.nums) return; html = mitoriStepsHTML(c.nums); }
  else if (subj === "kake") html = kakeStepsHTML(c.fa, c.fb, c.answer);
  else if (subj === "wari") html = wariStepsHTML(c.dividend, c.divisor, c.quotient);
  else return;
  box.innerHTML = html;
  box.classList.remove("hidden");
});

/* ============================================================ フラッシュ暗算 */
let flashAnswer = null, flashBusy = false, flashSpec = null, flashGrade = null;
let flashExam = { on: false, idx: 0, N: 10, correct: 0, times: [] };
let flashAskAt = 0;   // 数字が消えてから答えるまでの時間をはかる
const FLASH_SET = 10;  // ふつうの練習の1セット（検定は20問）
function startFlash(grade) {
  flashSpec = difficulty(grade, "flash"); flashGrade = grade; session = null;
  hidePauseUI();
  showView("play");
  $("#playRest").classList.add("hidden"); $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden"); $("#playFlashWrap").classList.remove("hidden");
  $("#anzanTip").classList.remove("hidden"); // フラッシュ暗算でもコツを出す（ボタンより下に置いてある）
  $("#stepsRow").classList.add("hidden"); $("#steps").classList.add("hidden");
  $("#playGrade").textContent = `${grade.key}／フラッシュ暗算`; $("#playTimer").textContent = ""; $("#playProgress").textContent = ""; $("#playProblem").textContent = "";
  $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashInfo").textContent = `${grade.key}：${flashSpec.digits}桁 ${flashSpec.terms}口 / 1個 ${(flashPaceMs(grade) / 1000).toFixed(1)}秒ずつ`;
  $("#flashMeasure").textContent = ""; $("#flashSignal").classList.add("hidden"); $("#flashDots").innerHTML = "";
  $("#flashDisplay").textContent = "▶ を押してスタート"; $("#flashDisplay").className = "flash-display"; $("#flashForm").classList.add("hidden");
  const ex = $("#flashExamMode").checked;
  flashExam = { on: ex, idx: 0, N: ex ? 20 : FLASH_SET, correct: 0, times: [] };
}
$("#flashStart").addEventListener("click", () => {
  const ex = $("#flashExamMode").checked;
  if (ex !== flashExam.on || flashExam.idx >= flashExam.N) flashExam = { on: ex, idx: 0, N: ex ? 20 : FLASH_SET, correct: 0, times: [] };
  runFlash();
});
// 数字1個ごとの音（1個目・2個目…とドレミで上がっていく＝リズムが分かる）
const FLASH_SCALE = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319];
function flashBeep(i) { if (!soundOn) return; try { const c = ensureAudio(); tone(FLASH_SCALE[i % FLASH_SCALE.length], c.currentTime, 0.1, "triangle", 0.18); } catch {} }
function flashTick(freq) { if (!soundOn) return; try { const c = ensureAudio(); tone(freq, c.currentTime, 0.09, "square", 0.14); } catch {} }
function flashReadySnd() { if (!soundOn) return; try { const c = ensureAudio(), t = c.currentTime; tone(392, t, 0.14, "sine", 0.18); tone(330, t + 0.1, 0.22, "sine", 0.18); } catch {} } // 「＝？」の合図（下降）
// 絶対時刻(audioCtxの秒)で音を予約（ズレない）。soundOff時は無音だが時計は進む
function flashScheduleTone(ctx, t0, freq, dur = 0.1, type = "triangle", vol = 0.18) {
  if (!soundOn) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
async function runFlash() {
  if (flashBusy || !flashSpec) return; flashBusy = true;
  $("#flashStart").disabled = true; $("#flashForm").classList.add("hidden"); $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashProgress").textContent = `${flashExam.on ? "検定" : "れんしゅう"} ${Math.min(flashExam.idx + 1, flashExam.N)} / ${flashExam.N}　正解 ${flashExam.correct}`;

  const ctx = ensureAudio();
  try { if (ctx.state !== "running") await ctx.resume(); } catch {}

  const p = genFlashNums(flashSpec); flashAnswer = p.answer;
  const nums = p.nums, N = nums.length;
  const disp = $("#flashDisplay");
  disp.className = "flash-display"; // 前回の○×の色をリセット
  $("#flashDots").innerHTML = Array.from({ length: N }, () => `<span class="dot"></span>`).join("");
  const dots = $("#flashDots").querySelectorAll(".dot");

  // すべての時刻をこの1点から計算（＝ドリフトしない）
  const slot = flashPaceMs(flashGrade) / 1000; // 秒
  const show = slot - Math.min(0.12, slot * 0.22);
  const step = 0.6;                       // 信号 赤・黄 の各時間
  const cdStart = ctx.currentTime + 0.2;
  const start = cdStart + 2 * step;       // 青になったら数字スタート
  const end = start + N * slot;
  const sigBox = $("#flashSignal"), lamps = sigBox.querySelectorAll(".lamp");
  sigBox.classList.remove("hidden");

  // 音は全部まとめて絶対時刻で予約（後からズレない）
  flashScheduleTone(ctx, cdStart, 300, 0.1, "sine", 0.14);          // 赤
  flashScheduleTone(ctx, cdStart + step, 440, 0.1, "sine", 0.14);   // 黄
  flashScheduleTone(ctx, start, 680, 0.14, "sine", 0.16);          // 青＝スタート
  for (let i = 0; i < N; i++) flashScheduleTone(ctx, start + i * slot, FLASH_SCALE[i % FLASH_SCALE.length], 0.1, "triangle", 0.18);
  flashScheduleTone(ctx, end, 392, 0.14, "sine", 0.18);
  flashScheduleTone(ctx, end + 0.1, 330, 0.22, "sine", 0.18);

  // 画面は毎フレーム「今どの状態か」を audioCtx.currentTime から計算して描く（自己補正）
  const onsets = [];
  let lastText = null, lastSig = null, shownIdx = -1, aborted = false;
  const onHide = () => { if (document.hidden) aborted = true; };
  document.addEventListener("visibilitychange", onHide);
  await new Promise((resolve) => {
    const draw = () => {
      if (aborted) return resolve();
      const t = ctx.currentTime;
      let text = "", numIdx = -1, sig = "";
      if (t < cdStart + step) sig = "red";
      else if (t < start) sig = "yellow";
      else if (t < end) {
        sig = "green";
        const i = Math.floor((t - start) / slot);
        const phase = (t - start) - i * slot;
        if (phase < show) { text = nums[i].toLocaleString(); numIdx = i; }
      } else {
        lamps.forEach((l) => l.classList.remove("on")); sigBox.classList.add("hidden");
        disp.textContent = "= ?"; return resolve();
      }
      if (sig !== lastSig) { lamps.forEach((l) => l.classList.toggle("on", l.dataset.c === sig)); lastSig = sig; }
      if (text !== lastText) {
        disp.textContent = text;
        if (numIdx >= 0) { onsets.push(performance.now()); if (numIdx > shownIdx) { shownIdx = numIdx; dots[numIdx] && dots[numIdx].classList.add("on"); } }
        lastText = text;
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  document.removeEventListener("visibilitychange", onHide);
  $("#flashDots").innerHTML = ""; sigBox.classList.add("hidden");

  // 実測の間隔を別欄に表示（「何桁何口」の欄は消さない）
  if (onsets.length >= 2) {
    const g = onsets.slice(1).map((t, i) => t - onsets[i]);
    const mn = Math.min(...g), mx = Math.max(...g), avg = g.reduce((a, b) => a + b, 0) / g.length;
    $("#flashMeasure").textContent = `実測間隔：平均${(avg / 1000).toFixed(2)}秒（最短${(mn / 1000).toFixed(2)}〜最長${(mx / 1000).toFixed(2)}秒）／ build ${BUILD}`;
  }
  $("#flashForm").classList.remove("hidden"); $("#flashInput").value = ""; $("#flashInput").focus();
  flashAskAt = performance.now();   // ここから「考えている時間」
  $("#flashStart").disabled = false; flashBusy = false;
}
$("#flashForm").addEventListener("submit", (e) => {
  e.preventDefault(); if (flashAnswer === null) return;
  const ok = parseInt($("#flashInput").value, 10) === flashAnswer, res = $("#playResult");
  $("#flashForm").classList.add("hidden");
  // 上の「= ?」を消して、大きく○×＋音（達成感）
  $("#flashDisplay").textContent = ok ? "⭕" : "❌";
  $("#flashDisplay").className = "flash-display " + (ok ? "ok" : "ng");
  ok ? correctSnd() : wrongSnd();
  const th = flashAskAt ? (performance.now() - flashAskAt) / 1000 : null;   // 考えていた時間
  if (th != null) flashExam.times.push({ ok, t: th });
  if (ok) flashExam.correct++;
  flashExam.idx++;
  if (flashExam.idx < flashExam.N) {
    res.innerHTML = (ok ? "正解！" : `おしい（答え: ${flashAnswer.toLocaleString()}）`) +
      `<span class="sub">　${th != null ? th.toFixed(1) + "秒" : ""}</span>`;
    res.className = "result " + (ok ? "ok" : "ng");
    setTimeout(runFlash, 900);
    return;
  }
  finishFlashSet(res);
});
// 1セット（ふつうの練習10問／検定20問）が終わったときの成績と報酬
function finishFlashSet(res) {
  const N = flashExam.N, correct = flashExam.correct, acc = Math.round(correct / N * 100);
  const ts = flashExam.times.map((x) => x.t), sum = ts.reduce((a, b) => a + b, 0);
  const avg = ts.length ? sum / ts.length : 0, fast = ts.length ? Math.min(...ts) : 0;
  const okTs = flashExam.times.filter((x) => x.ok).map((x) => x.t);
  const okAvg = okTs.length ? okTs.reduce((a, b) => a + b, 0) / okTs.length : 0;
  // 自己ベストは「1問あたりの考えた時間」で見る（練習10問と検定20問を同じものさしで比べるため）。
  // ただし わざと速く まちがえて記録を作れないよう、正答率70%以上のときだけ更新する。
  const okRate = N ? correct / N : 0;
  const r = okRate >= 0.7 ? saveTime(flashGrade.key, "flash", avg)
    : { improved: false, prev: bestTime(flashGrade.key, "flash") };
  const pass = flashExam.on && correct * 10 >= 140;
  let msg = "";
  if (flashExam.on) {
    msg += `検定結果：${correct}/${N} 正解　<b>${correct * 10}点 / 200点</b><br>${pass ? "🎉 合格！" : "不合格（140点以上で合格）"}`;
    if (pass) { certify(flashGrade.key); msg += `<br>🎓 ${flashGrade.key} 認定！`; }
  } else {
    msg += `⚡ ${N}問 おわり！`;
  }
  touchStreak();
  msg += `<div class="fs-stats"><div class="fs-acc">正答率 <b>${acc}%</b> <span class="sub">(${correct} / ${N})</span></div>` +
    `<div class="fs-row"><span>1問の 平均</span><b>${avg.toFixed(1)}秒</b></div>` +
    `<div class="fs-row"><span>いちばん速かった</span><b>${fast.toFixed(1)}秒</b></div>` +
    (okTs.length ? `<div class="fs-row"><span>正解できた問題の平均</span><b>${okAvg.toFixed(1)}秒</b></div>` : "") +
    `<div class="fs-row"><span>合計の 考えた時間</span><b>${sum.toFixed(1)}秒</b></div>` +
    (r.improved ? `<div class="fs-best">✨ 1問の平均で 自己ベスト更新！（${flashGrade.key}）</div>`
      : (r.prev != null ? `<div class="fs-best sub">${flashGrade.key}の 自己ベスト ${r.prev.toFixed(1)}秒／問　あと ${(avg - r.prev).toFixed(1)}秒 はやく</div>`
        : `<div class="fs-best sub">正答率70%以上で 自己ベストに 記録されるよ</div>`)) +
    `</div>`;
  // 報酬は他の種目とまったく同じ計算（正解・正答率・自己ベスト・完走 × 級の倍率）
  const { g, lines } = goldForSection({ correct, N, bestUpdated: r.improved, completed: true, grade: flashGrade });
  let earned = g;
  if (pass) { earned += 50; lines.push("🎓 検定合格 ＋50"); }
  const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; lines.push(`🔥 ${daily.label} ＋${daily.amt}`); }
  addGold(earned);
  logSession("flash", N, correct, sum, 0);   // 記録に残す（保護者画面のグラフに乗る）
  msg += `<div class="gold-earn"><img class="ico-coin" src="assets/coin.png" alt="" /> <b>＋${earned} GOLD</b><div class="gold-lines">${lines.join("・")}</div><div class="goal">${nextGoalHint()}</div></div>`;
  msg += `<div class="sub">▶ スタート で つぎの ${flashExam.on ? "検定" : FLASH_SET + "問"} が はじまるよ</div>`;
  if (flashExam.on) {
    if (pass) fxCelebrate(3, "🎓 " + flashGrade.key + " ごうかく！", correct + " / " + N + " 正解");
    else fxCheer("あと すこし…", "合格は 140点。もう一度 いこう！");
  } else if (r.improved) fxCelebrate(3, "⏱ 自己ベスト こうしん！", "1問 " + avg.toFixed(1) + "秒");
  else if (acc === 100) fxCelebrate(3, "💯 ぜんもん せいかい！", "1問 " + avg.toFixed(1) + "秒");
  else if (acc >= 80) fxCelebrate(2, "よくできました！", "正答率 " + acc + "%");
  else fxCelebrate(1, "おつかれさま！", "正答率 " + acc + "%");
  coinSnd(1.0);
  renderProfile();
  res.innerHTML = msg; res.className = "result " + (flashExam.on && !pass ? "ng" : "ok");
  $("#flashProgress").textContent = "";
}

/* ============================================================ たいせん（CPU対戦ゲーム／レオ王） */
let battle = null, battleTimer = null;
// 敵のHPは級によらず一定（難易度は出題される問題そのもので調整済み）
const ENEMY_HP = 3;
const PLAYER_HP = 4; // まちがえると♥が1つへる。0になったらアウト
// 1匹たおすごとに次の敵へ（6体を順番にくり返す）
const ENEMIES = [
  { file: "enemy_slime.png", name: "マスカット王" },
  { file: "enemy_bat.png", name: "こうもり" },
  { file: "enemy_rock.png", name: "りょくのうきん" },
  { file: "enemy_tree.png", name: "モリのぬし" },
  { file: "enemy_wizard.png", name: "まほうつかい" },
  { file: "enemy_box.png", name: "たからばこオバケ" },
];
const GOLD_PER_KILL = 8; // 3正解＝1匹。旧「正解×2＋勝敗ボーナス」とほぼ同水準になる額
function renderBattle() {
  const sel = $("#battleGrade");
  if (!sel.dataset.filled) { sel.innerHTML = GRADES.map((g, i) => `<option value="${i}">${g.key}</option>`).join(""); sel.dataset.filled = "1"; }
  const rk = JSON.parse(localStorage.getItem(RANK) || "null"); sel.value = rk ? rk.idx : gradeIdx;
  $("#battleSetup").classList.remove("hidden"); $("#battleArena").classList.add("hidden"); $("#battleResult").classList.add("hidden");
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; } battle = null;
}
function battleSubjOf() { return difficulty(battle.grade, battle.subj) ? battle.subj : "anzan"; }
// あんざん以外（みとり算・かけ算・わり算）は そろばんで答える
const battleUsesSoroban = () => battleSubjOf() !== "anzan";
function battleProblem() {
  const p = genProblemFor(battle.grade, battleSubjOf()) || genProblemFor(battle.grade, "anzan");
  battle.cur = p; $("#battleProblem").textContent = p.display;
  if (battleUsesSoroban()) sorobanBattle.clear();
  else { $("#battleInput").value = ""; $("#battleInput").focus(); }
}
function startBattle() {
  const grade = GRADES[+$("#battleGrade").value], subj = $("#battleSubj").value, dur = +$("#battleTime").value;
  battle = { grade, subj, dur, you: 0, atts: 0, kills: 0, hp: ENEMY_HP, life: PLAYER_HP, cur: null, endAt: performance.now() + dur * 1000, running: true };
  $("#battleSetup").classList.add("hidden"); $("#battleResult").classList.add("hidden"); $("#battleArena").classList.remove("hidden");
  $("#battleFx").textContent = ""; $("#battleFx").className = "battle-fx";
  $("#enemyImg").className = "";
  // みとり算・かけ算・わり算はそろばん、あんざんは入力欄
  const useSoro = battleUsesSoroban();
  $("#battleSorobanWrap").classList.toggle("hidden", !useSoro);
  $("#battleForm").classList.toggle("hidden", useSoro);
  setEnemyIdentity(); renderEnemy();
  battleProblem();
  battleTimer = setInterval(tickBattle, 100);
}
function tickBattle() {
  if (!battle || !battle.running) return;
  const rem = Math.max(0, battle.endAt - performance.now());
  $("#battleTimer").textContent = fmtClock(rem / 1000);
  if (rem <= 0) finishBattle();
}
// いま出ている敵（たおした数ぶん進む）
const currentEnemy = () => ENEMIES[battle.kills % ENEMIES.length];
function setEnemyIdentity() {
  const e = currentEnemy();
  $("#enemyImg").src = "assets/" + e.file;
  $("#enemyName").textContent = e.name;
}
// 敵のHPバーと、たおした数の表示
function renderEnemy() {
  $("#killCount").textContent = battle.kills;
  $("#enemyHpText").textContent = `HP ${battle.hp} / ${ENEMY_HP}`;
  const fill = $("#enemyHp");
  fill.style.width = (battle.hp / ENEMY_HP) * 100 + "%";
  fill.className = "hpfill" + (battle.hp === 1 ? " low" : "");
  const my = $("#myHp");
  my.textContent = "♥".repeat(battle.life) + "♡".repeat(PLAYER_HP - battle.life);
  my.className = "myhp" + (battle.life === 1 ? " danger" : "");
}
function battleFx(text, kind) { const fx = $("#battleFx"); fx.textContent = text; fx.className = "battle-fx " + kind; }
// 敵の画像に一瞬アニメを付ける（当たった／たおれた）
function enemyAnim(cls, ms) {
  const img = $("#enemyImg"); img.className = cls;
  setTimeout(() => { if (img.className === cls) img.className = ""; }, ms);
}
function battleAnswer(val) {
  if (!battle || !battle.running) return;
  battle.atts++;
  if (val === battle.cur.answer) {
    battle.you++; battle.hp--;
    if (battle.hp <= 0) {                       // たおした → たおれてから次の敵が登場
      battle.kills++; battle.hp = ENEMY_HP;
      battleFx(`たおした！ ＋${Math.round(GOLD_PER_KILL * gradeGoldMult(battle.grade))} GOLD`, "kill");
      correctSnd(); coinSnd(0.18); // 1匹たおす＝GOLD獲得なのでチャリーン
      const img = $("#enemyImg"); img.className = "down";
      setTimeout(() => { if (!battle || !battle.running) return; img.className = "appear"; setEnemyIdentity(); }, 650);
    } else {                                    // こうげき命中
      battleFx("こうげき！ HP−1", "ok");
      enemyAnim("hit", 300); clickSnd();
    }
    renderEnemy();
  } else {
    battle.life--;                                   // まちがえたら自分もダメージ
    renderEnemy();
    if (battle.life <= 0) { battleFx("♥がなくなった！", "miss"); wrongSnd(); return finishBattle("out"); }
    battleFx(`はずれた！ ♥ のこり ${battle.life}`, "miss"); // 責めない言い方にする
    neutralSnd();
  }
  battleProblem();
}
function finishBattle(reason) {
  battle.running = false; if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  const kills = battle.kills, isOut = reason === "out";
  logSession(battleSubjOf(), battle.atts, battle.you, battle.dur); // 学習記録の仕組みは従来どおり
  const gm = gradeGoldMult(battle.grade);          // たいせんも級で報酬が増える
  const perKill = Math.round(GOLD_PER_KILL * gm);
  let earned = kills * perKill;
  const daily = dailyBonusOnce(); if (daily) earned += daily.amt;
  if (battle.you > 0) { touchStreak(); addGold(earned); }
  (kills > 0 && !isOut) ? bigFanfareSnd() : neutralSnd();
  if (battle.you > 0 && earned > 0) coinSnd(kills > 0 && !isOut ? 1.4 : 0.2);
  const badge = (kills > 0 && !isOut) ? '<span class="badge-chip win">WIN！</span>' : '<span class="badge-chip">🏁 コンプリート！</span>';
  const face = (kills > 0 && !isOut) ? "king_celebrate.png" : "king_wave.png";
  const verdict = isOut
    ? `💫 アウト！ ${kills}ぴき たおしたよ`
    : (kills > 0 ? `🎉 ${kills}ぴき たおした！` : "つぎは1ぴき たおそう！");
  const outNote = isOut ? '<p class="sub">4回まちがえたので おしまい。ゆっくり たしかめて こたえると ♥ がへらないよ。</p>' : "";
  $("#battleArena").classList.add("hidden");
  const rbox = $("#battleResult"); rbox.classList.remove("hidden");
  rbox.innerHTML =
    `<div class="battle-verdict"><img class="bv-face" src="assets/${face}" alt="" /><div><span class="bv-badge">${badge}</span><h3>${verdict}</h3></div></div>` +
    `<div class="battle-score-final">たおした数 <b>${kills}</b><span class="bs-sub">せいかい ${battle.you} / ${battle.atts}問　♥のこり ${Math.max(0, battle.life)}</span></div>` + outNote +
    (battle.you > 0 ? `<div class="gold-earn"><img class="ico-coin" src="assets/coin.png" alt="" /> <b>＋${earned} GOLD</b><div class="gold-lines">${kills}ぴき × ${perKill} GOLD（${battle.grade.key} ×${gm}）</div><div class="goal">${nextGoalHint()}</div></div>` : '<p class="sub">3回せいかいすると てきを たおせるよ！</p>') +
    `<br><button id="battleAgain">もう一度</button> <button id="battleToKingdom" class="ghost">🧩 パズルへ</button>`;
  renderProfile();
  $("#battleAgain").onclick = () => renderBattle();
  $("#battleToKingdom").onclick = () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="puzzle"]')); };
}
$("#battleStart").addEventListener("click", startBattle);
$("#battleForm").addEventListener("submit", (e) => { e.preventDefault(); battleAnswer(parseInt($("#battleInput").value, 10)); });
$("#battleAnswerBtn").addEventListener("click", () => battleAnswer(currentBattleAnswer()));
$("#battleQuit").addEventListener("click", () => { if (battleTimer) { clearInterval(battleTimer); battleTimer = null; } battle = null; renderBattle(); });



/* ============================================================ クラフト王国（広い世界をブロックで作る）
   ブロックの絵もキャラクターも地形も、すべてこのコードで描いている。既存ゲームの絵・素材は一切使わない。
   借りたのは「マス目に積んで世界を作る」という遊び方の枠組みだけ。 */
/* ============================================================ そろばんの町（組み立てキット）
   ブロックを自由に積む砂場ではなく、「設計図の部品を はめて 建物を完成させる」方式。
   完成すると住民が引っ越してきて、町が育つ。部品を買うGOLDは学習からしか出ない。 */
const CRAFT_KEY = "soroban_town";                // 旧「soroban_craft」は消さずに残してある
const CW_ = 16, CH_ = 16, CD_ = 6;               // 町の区画（空き地を作らない広さ）
const CTW = 46, CTH = 23, CBH = 27;              // ひし形タイルの幅・高さ・部品1つぶんの厚み
const ERAS = [
  { n: "むらの はじまり", need: -1, cond: "さいしょから" },
  { n: "しゅくば町", need: 5, cond: "15級に ごうかく" },
  { n: "城下町", need: 10, cond: "10級に ごうかく" },
  { n: "みなと町", need: 14, cond: "6級に ごうかく" },
  { n: "大きな 城", need: 18, cond: "2級に ごうかく" },
  { n: "そろばん王国", need: 21, cond: "二段に ごうかく" },
];
/* ---- 部品（ブロックではなく「建物のパーツ」）。色も模様もコードで作る ---- */
const BLOCKS = [
  null,
  { n: "どだい", top: "#b9b4a6", lf: "#7f7b70", rt: "#9c9789", cost: 2, pat: "stone", era: 0 },
  { n: "はしら", top: "#b5813f", lf: "#7a5227", rt: "#996b33", cost: 3, pat: "wood", era: 0 },
  { n: "つちかべ", top: "#e6dcc4", lf: "#b0a68c", rt: "#cfc4a8", cost: 3, pat: "plaster", era: 0 },
  { n: "しょうじ", top: "#f6f1e2", lf: "#c8c0aa", rt: "#e2dbc6", cost: 4, pat: "shoji", era: 0 },
  { n: "とびら", top: "#a9793c", lf: "#6f4e24", rt: "#8c6330", cost: 4, pat: "door", era: 0 },
  { n: "わらやね", top: "#dcc26a", lf: "#a08b41", rt: "#c0a653", cost: 5, pat: "straw", era: 0 },
  { n: "朱のはしら", top: "#d5523f", lf: "#8e3123", rt: "#b3402f", cost: 5, pat: "redwood", era: 0 },
  { n: "かさぎ", top: "#c9452f", lf: "#87291a", rt: "#a83725", cost: 6, pat: "redwood", era: 0 },
  { n: "いしだたみ", top: "#c3bfb4", lf: "#89857c", rt: "#a6a299", cost: 2, pat: "stone", era: 0 },
  { n: "かわらやね", top: "#4a6fa5", lf: "#2f4a73", rt: "#3c5c8c", cost: 6, pat: "tile", era: 1 },
  { n: "しろかべ", top: "#f4f1ea", lf: "#c3bfb4", rt: "#dedad1", cost: 5, pat: "white", era: 1 },
  { n: "ちょうちん", top: "#ffd98a", lf: "#c9a04a", rt: "#e6bd68", cost: 6, pat: "glow", era: 1 },
  { n: "まつの木", top: "#57ab3e", lf: "#2f6321", rt: "#3f8a2d", cost: 4, pat: "leaf", era: 0 },
  { n: "じめん", top: "#8fd06a", lf: "#5c8f3e", rt: "#74b052", cost: 0, pat: "grass", era: 99 },   // 町の地面（買えない）
];
const bId = (n) => { for (let i = 1; i < BLOCKS.length; i++) if (BLOCKS[i].n === n) return i; return 0; };
const P_BASE = bId("どだい"), P_PILLAR = bId("はしら"), P_WALL = bId("つちかべ"), P_WIN = bId("しょうじ"),
  P_DOOR = bId("とびら"), P_STRAW = bId("わらやね"), P_TORII = bId("朱のはしら"), P_BEAM = bId("かさぎ"),
  P_STONE = bId("いしだたみ"), P_TILE = bId("かわらやね"), P_WHITE = bId("しろかべ"), P_LAMP = bId("ちょうちん"), P_PINE = bId("まつの木"), P_GROUND = bId("じめん");
// 立方体をやめて それらしい形で描く部品
const SHAPE = {};
[[P_BASE, "slab"], [P_STONE, "slab"], [P_PILLAR, "pillar"], [P_TORII, "pillar"], [P_BEAM, "beam"],
[P_STRAW, "roof"], [P_TILE, "roof"], [P_LAMP, "glow"], [P_PINE, "canopy"]].forEach(function (p) { if (p[0]) SHAPE[p[0]] = p[1]; });
// うしろが透けて見える部品（かくれ判定から外す）
const SEETHRU = {}; [P_PILLAR, P_TORII, P_BEAM, P_LAMP, P_PINE, P_WIN].forEach(function (i) { if (i) SEETHRU[i] = 1; });

/* ---- 設計図（部品を はめる場所が決まっている）----
   cells: [左右, 奥手前, 高さ, 部品]。完成すると住民が引っ越してくる。 */
const BPS = [
  {
    id: "torii", n: "鳥居", era: 0, ttl: "むらの 見はり", who: "こぎつね", tip: "2本の 朱のはしら の上に かさぎ を のせよう",
    cells: [[0, 0, 0, P_TORII], [0, 0, 1, P_TORII], [2, 0, 0, P_TORII], [2, 0, 1, P_TORII],
    [0, 0, 2, P_BEAM], [1, 0, 2, P_BEAM], [2, 0, 2, P_BEAM]],
  },
  {
    id: "terakoya", n: "寺子屋", era: 0, ttl: "むらの 先生", who: "そろばんの弟子", tip: "土台 → 柱・とびら → やね の順に はめよう",
    cells: [[0, 0, 0, P_BASE], [1, 0, 0, P_BASE], [2, 0, 0, P_BASE],
    [0, 1, 0, P_BASE], [1, 1, 0, P_BASE], [2, 1, 0, P_BASE],
    [0, 0, 1, P_PILLAR], [2, 0, 1, P_PILLAR], [0, 1, 1, P_PILLAR], [2, 1, 1, P_PILLAR],
    [1, 0, 1, P_DOOR], [1, 1, 1, P_WALL],
    [0, 0, 2, P_STRAW], [1, 0, 2, P_STRAW], [2, 0, 2, P_STRAW],
    [0, 1, 2, P_STRAW], [1, 1, 2, P_STRAW], [2, 1, 2, P_STRAW]],
  },
  {
    id: "kura", n: "蔵", era: 1, ttl: "町の 番頭さん", who: "蔵ばん", tip: "白いかべ と かわらやね の りっぱな蔵",
    cells: [[0, 0, 0, P_BASE], [1, 0, 0, P_BASE], [0, 1, 0, P_BASE], [1, 1, 0, P_BASE],
    [0, 0, 1, P_WHITE], [1, 0, 1, P_DOOR], [0, 1, 1, P_WHITE], [1, 1, 1, P_WHITE],
    [0, 0, 2, P_WHITE], [1, 0, 2, P_WIN], [0, 1, 2, P_WHITE], [1, 1, 2, P_WHITE],
    [0, 0, 3, P_TILE], [1, 0, 3, P_TILE], [0, 1, 3, P_TILE], [1, 1, 3, P_TILE]],
  },
];
const bpById = (id) => { for (const b of BPS) if (b.id === id) return b; return null; };
function myRankIdx() { try { const r = JSON.parse(localStorage.getItem(RANK) || "null"); return r ? r.idx : -1; } catch (e) { return -1; } }
function eraOpen(e) { return myRankIdx() >= ERAS[e].need; }
function myEra() { let m = 0; for (let e = 0; e < ERAS.length; e++) if (eraOpen(e)) m = e; return m; }
let craft = null, craftSel = 1, craftPick = null, craftHover = -1;
let craftSite = null;      // いま組み立て中の場所 { bp, x, y }
let ghostPhase = 0, ghostNext = null;   // 次にはめる場所の点めつ
let craftHist = [];   // はめた順（もどす用）

/* ---- 町をつくる（平らな区画。空き地を作らない広さにしてある） ---- */
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, sc) {
  const fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}
function makeTown() {
  return { w: CW_, h: CH_, d: CD_, cells: new Array(CW_ * CH_ * CD_).fill(0), built: 0, placed: {}, done: [], sites: [], people: [] };
}
const cIdx = (x, y, z) => (z * CH_ + y) * CW_ + x;
const cGet = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= CW_ || y >= CH_ || z >= CD_) ? 0 : craft.cells[cIdx(x, y, z)];
function colTop(x, y) { for (let z = CD_ - 1; z >= 0; z--) if (cGet(x, y, z)) return z; return -1; }
const solidAt = (x, y, z) => { const v = cGet(x, y, z); return v && !SEETHRU[v] ? v : 0; };
function occluded(x, y, z) {
  if (z + 1 >= CD_) return false;
  if (!solidAt(x, y, z + 1)) return false;
  if (x + 1 < CW_ && !solidAt(x + 1, y, z)) return false;
  if (y + 1 < CH_ && !solidAt(x, y + 1, z)) return false;
  return true;
}
function packCells(a) { const o = []; let v = a[0], c = 0; for (let i = 0; i < a.length; i++) { if (a[i] === v) c++; else { o.push(v, c); v = a[i]; c = 1; } } o.push(v, c); return o; }
function unpackCells(o) { const a = []; for (let i = 0; i < o.length; i += 2) for (let k = 0; k < o[i + 1]; k++) a.push(o[i]); return a; }
function loadCraft() {
  try {
    const d = JSON.parse(localStorage.getItem(CRAFT_KEY) || "null");
    if (d && d.w === CW_ && d.h === CH_ && d.d === CD_ && d.rle) {
      const cells = unpackCells(d.rle);
      if (cells.length === CW_ * CH_ * CD_) {
        return { w: CW_, h: CH_, d: CD_, cells, built: d.built || 0, placed: d.placed || {}, done: d.done || [], sites: d.sites || [], people: d.people || [] };
      }
    }
  } catch (e) { }
  return makeTown();
}
function saveCraft() {
  try {
    localStorage.setItem(CRAFT_KEY, JSON.stringify({
      v: 1, w: CW_, h: CH_, d: CD_, built: craft.built || 0, placed: craft.placed || {},
      done: craft.done || [], sites: craft.sites || [], people: craft.people || [], rle: packCells(craft.cells)
    }));
  } catch (e) { craftMsg("ほぞんに しっぱいしました"); }
}

const isoX = (x, y) => (x - y) * (CTW / 2);
const isoY = (x, y, z) => (x + y) * (CTH / 2) - z * CBH;

/* ---- ブロックを描く（上面の模様も手描き） ---- */
function facePath(g, px, py) {
  g.beginPath(); g.moveTo(px, py - CTH / 2); g.lineTo(px + CTW / 2, py);
  g.lineTo(px, py + CTH / 2); g.lineTo(px - CTW / 2, py); g.closePath();
}
/* ============================================================ ブロックの絵づくり
   模様は 16×16 の「テクセル（ドット）」で作り、ひし形の面にぴったり貼る。
   1個ずつ絵を焼いておいて（bakeBlocks）、世界を描くときは貼るだけにする。   */
const TEXN = 16;                       // 1面あたりのドットの数（細かいほど精密）
let craftDPR = 1, BAKE = 3;            // 画面の細かさ／焼き込みの倍率
const SPR = {}, SIL = {}, CHIP = {};   // 焼いた絵／白いシルエット／パレット用の小さい絵
const TEXC = {};                       // テクスチャの使いまわし
let craftAnim = null;

const newCv = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const cl255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const hx2n = (h) => { const s = h.replace("#", ""); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
const tint = (c, f) => [cl255(c[0] * f), cl255(c[1] * f), cl255(c[2] * f)];
const mixc = (a, b, t) => [cl255(a[0] + (b[0] - a[0]) * t), cl255(a[1] + (b[1] - a[1]) * t), cl255(a[2] + (b[2] - a[2]) * t)];
const css = (c) => "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
const stepq = (v, n) => Math.floor(v * n) / (n - 1);   // 0〜1を n段の階調にする（ドット絵らしさ）
const C_SOIL = [138, 95, 58], C_MORTAR = [239, 228, 214], C_WHITE = [255, 255, 255];

/* ドット1個の色を決める。face 0=上面 1=左面 2=右面 */
function texel(b, id, face, i, j, ph) {
  const N = TEXN, base = hx2n(face === 0 ? b.top : face === 1 ? b.lf : b.rt);
  const sd = id * 37 + face * 11;
  const r1 = hash2(i + sd, j * 3 + sd), r2 = hash2(i * 5 + sd * 7, j + sd);
  let f = 1, c = null, a = 255;
  switch (b.pat) {
    case "grass":
      if (face > 0) {                                        // 側面は「上が草・下は土」。境目はドット単位でギザギザ
        const e = 3 + Math.floor(hash2(i + sd, 7) * 2.6);
        if (j >= e) { c = tint(C_SOIL, 0.8 + stepq(r1, 4) * 0.32); break; }
      }
      f = 0.86 + stepq(r1, 5) * 0.3; if (r2 > 0.9) f -= 0.12;
      break;
    case "leaf":
      f = 0.78 + stepq(r1, 5) * 0.44; if (r2 > 0.9) f -= 0.16;
      break;
    case "dirt":
      f = 0.88 + stepq(r1, 4) * 0.22; if (r2 > 0.94) c = tint(base, 1.28);   // ときどき小石
      break;
    case "sand":
      f = 0.94 + stepq(r1, 4) * 0.13; if (r2 > 0.94) f -= 0.08;
      break;
    case "stone": {
      f = 0.9 + stepq(r1, 4) * 0.16;
      const n = vnoise(i + sd, j, 6); if (n > 0.58 && n < 0.64) f -= 0.22;   // ひび
      break;
    }
    case "concrete":
      f = 0.96 + stepq(r1, 3) * 0.07; if (r2 > 0.95) f -= 0.13;
      break;
    case "metal":
      f = 0.92 + stepq(hash2(i + sd, 3), 4) * 0.16;                          // たてのヘアライン
      if ((i === 2 || i === N - 3) && (j === 2 || j === N - 3)) c = tint(base, 0.72);  // びょう
      break;
    case "marble": {
      f = 0.98 + stepq(r1, 3) * 0.04;
      const n = vnoise(i * 1.6 + sd, j * 0.6, 9);
      if (n > 0.52 && n < 0.58) c = mixc(base, [120, 118, 128], 0.5);        // すじ模様
      break;
    }
    case "wood":                                                            // 木の幹：たての溝と ふしめ
      f = 0.9 + stepq(hash2(i + sd, 1), 4) * 0.2;
      if ((i + Math.floor(hash2(0, j + sd) * 2)) % 5 === 0) f -= 0.15;
      if (hash2(i >> 2, j >> 3) > 0.93) f -= 0.1;
      break;
    case "plank": {                                                         // いた：よこ板＋木目
      const row = Math.floor(j / 5);
      f = 0.93 + stepq(hash2(i + row * 13 + sd, row), 4) * 0.14;
      if (j % 5 === 0) f -= 0.2;
      break;
    }
    case "straw": {
      const s0 = (i + j * 2 + sd) % 5;
      f = s0 === 0 ? 0.84 : 0.9 + stepq(r1, 3) * 0.2;
      break;
    }
    case "brick": case "sbrick": {
      const rh = b.pat === "brick" ? 4 : 8, bw = 8, row = Math.floor(j / rh), ii = (i + (row % 2) * (bw / 2)) % bw;
      if (j % rh === 0 || ii === 0) { c = mixc(base, C_MORTAR, b.pat === "brick" ? 0.55 : 0.3); break; }
      f = 0.92 + stepq(hash2(row * 31 + Math.floor((i + (row % 2) * (bw / 2)) / bw) + sd, row), 3) * 0.16 + (r1 - 0.5) * 0.06;
      break;
    }
    case "tile": {                                                          // やねがわら：かまぼこ形のならび
      const row = Math.floor(j / 4), t = (i + (row % 2) * 2) % 4;
      f = t === 0 ? 0.8 : t === 1 ? 1.14 : t === 2 ? 1.02 : 0.92;
      if (j % 4 === 3) f -= 0.14;
      break;
    }
    case "glass":
      a = 46; c = mixc(base, C_WHITE, 0.35);
      if (i === 0 || j === 0 || i === N - 1 || j === N - 1) { a = 215; c = tint(base, 0.9); }   // わく
      if (i - j === 3 || i - j === 4) { a = 120; c = C_WHITE; }                                 // 反射
      break;
    case "water": {
      const w = Math.sin(i * 0.8 + j * 0.42 + ph * 2.1);
      f = 1 + w * 0.09; a = 232;
      if (w > 0.93 && r2 > 0.55) { c = mixc(base, C_WHITE, 0.6); a = 245; }
      break;
    }
    case "gold":
      f = 0.9 + stepq(r1, 3) * 0.16;
      if ((i + j + sd) % 9 === 0) f += 0.16;
      if (r2 > 0.95) c = mixc(base, [255, 255, 240], 0.7);
      break;
    case "glow": {
      const d0 = Math.hypot(i - 7.5, j - 7.5);
      f = 1.14 - d0 * 0.028 + (r1 - 0.5) * 0.05;
      if (d0 < 2.6) c = mixc(base, [255, 255, 235], 0.55);
      break;
    }
    case "neon":
      f = 0.86 + stepq(r1, 3) * 0.1;
      if ((i + j * 2) % 6 < 2) c = mixc(base, C_WHITE, 0.55);
      break;
    case "crystal":
      f = (((i * 2 + j) % 8) < 4 ? 1.1 : 0.88) + stepq(r1, 3) * 0.06;
      if ((i + j) % 11 === 0) c = mixc(base, C_WHITE, 0.7);
      break;
    case "plaster":                                                         // つちかべ：ざらざらした土壁
      f = 0.95 + stepq(r1, 4) * 0.1;
      if (r2 > 0.93) f -= 0.07;
      if (face === 0 && (j === 0 || j === N - 1)) f -= 0.05;
      break;
    case "white":                                                           // 蔵のしっくい壁：なめらかで白い
      f = 0.98 + stepq(r1, 3) * 0.04;
      if (j % 7 === 0) f -= 0.04;
      break;
    case "shoji": {                                                         // しょうじ：格子と やわらかい紙
      const gx = i % 5 === 0, gy = j % 5 === 0;
      if (gx || gy) { c = tint(hx2n("#8c6330"), 0.95 + stepq(r1, 3) * 0.1); break; }   // 桟（さん）
      f = 1.0 + stepq(r1, 3) * 0.05;
      break;
    }
    case "door": {                                                          // とびら：たて板と 引き手
      f = 0.92 + stepq(hash2(Math.floor(i / 4) + sd, 2), 4) * 0.16;
      if (i % 4 === 0) f -= 0.16;                                           // 板のさかい目
      if (face === 0) break;
      if (i >= N - 5 && i <= N - 4 && j >= 6 && j <= 9) c = tint(hx2n("#2b2b2b"), 1);  // 引き手
      break;
    }
    case "redwood":                                                         // 鳥居の朱塗り：つやのある赤
      f = 0.94 + stepq(r1, 3) * 0.1;
      if (i % 6 === 0) f += 0.06;
      if (j < 2) f += 0.06;
      break;
    case "rainbow": {
      const RB = [[255, 138, 168], [255, 196, 120], [255, 240, 140], [150, 224, 150], [130, 196, 255], [190, 160, 240]];
      c = tint(RB[(Math.floor((i + j) / 3) + sd) % 6], face === 0 ? 1 : face === 1 ? 0.76 : 0.9);
      c = tint(c, 0.94 + stepq(r1, 3) * 0.1);
      break;
    }
    default: f = 0.94 + stepq(r1, 4) * 0.12;
  }
  const o = c || tint(base, f);
  return [o[0], o[1], o[2], a];
}
function buildTex(id, face, ph) {
  const b = BLOCKS[id], N = TEXN, cv = newCv(N, N), g = cv.getContext("2d");
  const img = g.createImageData(N, N), d = img.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = texel(b, id, face, i, j, ph || 0), o = (j * N + i) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
  }
  g.putImageData(img, 0, 0); return cv;
}
const tex = (id, face, ph) => { const k = id + "_" + face + "_" + (ph || 0); return TEXC[k] || (TEXC[k] = buildTex(id, face, ph)); };

/* ひし形（平行四辺形）の面にテクセル画像をぴったり貼る。o=起点 a,b=2辺のベクトル */
function paintFace(g, t, ox, oy, ax, ay, bx, by, path) {
  g.save(); path(); g.clip();
  g.imageSmoothingEnabled = false;
  g.transform(ax / TEXN, ay / TEXN, bx / TEXN, by / TEXN, ox, oy);
  g.drawImage(t, -0.6, -0.6, TEXN + 1.2, TEXN + 1.2);   // 面のつなぎ目に すきまが出ないよう少し大きめに
  g.restore();
}
/* 立方体。(0,0) がそのマスの基準点（上面の中心） */
function drawCube(g, id, tw, th, bh, flat, ph) {
  const hw = tw / 2, hh = th / 2;
  const pTop = () => { g.beginPath(); g.moveTo(0, -hh); g.lineTo(hw, 0); g.lineTo(0, hh); g.lineTo(-hw, 0); g.closePath(); };
  const pLf = () => { g.beginPath(); g.moveTo(-hw, 0); g.lineTo(0, hh); g.lineTo(0, hh + bh); g.lineTo(-hw, bh); g.closePath(); };
  const pRt = () => { g.beginPath(); g.moveTo(hw, 0); g.lineTo(0, hh); g.lineTo(0, hh + bh); g.lineTo(hw, bh); g.closePath(); };
  if (flat) { g.fillStyle = flat; pLf(); g.fill(); pRt(); g.fill(); pTop(); g.fill(); return; }
  paintFace(g, tex(id, 1, ph), -hw, 0, hw, hh, 0, bh, pLf);
  paintFace(g, tex(id, 2, ph), 0, hh, hw, -hh, 0, bh, pRt);
  paintFace(g, tex(id, 0, ph), 0, -hh, hw, hh, -hw, hh, pTop);
  // 足もとを暗くして、面のさかい目に光を入れる（角が立って見える）
  const sh = g.createLinearGradient(0, hh, 0, hh + bh);
  sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(8,18,38,.32)");
  g.save(); g.fillStyle = sh; pLf(); g.fill(); pRt(); g.fill(); g.restore();
  g.save(); g.lineWidth = 1;
  g.strokeStyle = "rgba(255,255,255,.4)";
  g.beginPath(); g.moveTo(-hw, 0); g.lineTo(0, -hh); g.lineTo(hw, 0); g.stroke();
  g.strokeStyle = "rgba(0,0,0,.18)";
  g.beginPath(); g.moveTo(0, hh); g.lineTo(0, hh + bh); g.stroke();
  g.restore();
  g.strokeStyle = "rgba(18,28,48,.34)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -hh); g.lineTo(hw, 0); g.lineTo(hw, bh); g.lineTo(0, hh + bh);
  g.lineTo(-hw, bh); g.lineTo(-hw, 0); g.closePath(); g.stroke();
}
/* 葉のかたまり。ドットを1個ずつ置き、ふちを間引いて木らしいギザギザにする */
function drawCanopy(g, id, flat) {
  const b = BLOCKS[id], t = CTW / TEXN, cy = CTH / 2 + CBH * 0.22;
  const rx = CTW * 0.72, ry = (CTH + CBH) * 0.58;
  const base = hx2n(b.top), dark = hx2n(b.lf);
  for (let py = -ry - t; py <= ry + t; py += t) {
    for (let px = -rx - t; px <= rx + t; px += t) {
      const gx = Math.round(px / t), gy = Math.round(py / t);
      const n = hash2(gx * 7 + id, gy * 13 + id);
      const d = (px / rx) * (px / rx) + (py / ry) * (py / ry) - (n - 0.5) * 0.24;
      if (d > 1 || (d > 0.78 && n < 0.4)) continue;
      if (flat) { g.fillStyle = flat; g.fillRect(px, cy + py, t + 0.6, t + 0.6); continue; }
      let f = 1.12 - (py / ry) * 0.34 - (px / rx) * 0.07;                    // 上と左が明るい
      f *= 0.86 + stepq(hash2(gx * 3 + id, gy * 5), 5) * 0.3;
      if (n > 0.93) f *= 0.8;                                                // 影になる葉
      g.fillStyle = css(tint(d > 0.62 ? mixc(base, dark, 0.4) : base, f));
      g.fillRect(px, cy + py, t + 0.6, t + 0.6);
    }
  }
}
/* やね：四方に流れる寄棟。前の2面だけが見える */
function drawRoof(g, id, flat, ph) {
  const b = BLOCKS[id], hw = CTW / 2 + 4, hh = CTH / 2 + 2, eave = 3, apex = -hh - 14;
  const top = hx2n(b.top), lf = hx2n(b.lf), rt = hx2n(b.rt);
  // 軒（のき）の厚み
  g.fillStyle = flat || css(tint(lf, 0.9));
  g.beginPath(); g.moveTo(-hw, 0); g.lineTo(0, hh); g.lineTo(0, hh + eave); g.lineTo(-hw, eave); g.closePath(); g.fill();
  g.fillStyle = flat || css(tint(rt, 0.9));
  g.beginPath(); g.moveTo(hw, 0); g.lineTo(0, hh); g.lineTo(0, hh + eave); g.lineTo(hw, eave); g.closePath(); g.fill();
  // 手前の2面（左は暗く、右は明るく）
  const face = (x1, y1, x2, y2, col) => {
    g.fillStyle = flat || css(col);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(0, apex); g.closePath(); g.fill();
  };
  face(-hw, 0, 0, hh, tint(lf, 1.02));
  face(0, hh, hw, 0, tint(rt, 1.12));
  if (!flat) {
    // かわら・わらの筋を、軒から むね に向かって引く
    g.save(); g.globalAlpha = .45; g.lineWidth = 1; g.strokeStyle = "rgba(0,0,0,.5)";
    for (let s = 1; s <= 4; s++) {
      const t = s / 5;
      g.beginPath(); g.moveTo(-hw * (1 - t), hh * t); g.lineTo(0, apex); g.stroke();          // 左の面
      g.beginPath(); g.moveTo(hw * (1 - t), hh * t); g.lineTo(0, apex); g.stroke();           // 右の面
    }
    g.restore();
    // むね（頂上の線）
    g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-hw, 0); g.lineTo(0, apex); g.lineTo(hw, 0); g.stroke();
    g.strokeStyle = "rgba(20,30,50,.4)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-hw, 0); g.lineTo(0, hh); g.lineTo(hw, 0); g.stroke();
    g.fillStyle = css(tint(top, 1.15));   // むね瓦
    g.beginPath(); g.ellipse(0, apex + 2, 5, 2.4, 0, 0, 7); g.fill();
  }
}
/* 鳥居の横木（かさぎ）：横に長い角材 */
function drawBeam(g, id, flat, ph) {
  drawCube(g, id, CTW, CTH * 0.7, 9, flat, ph);
  if (flat) return;
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-CTW / 2, 0); g.lineTo(0, -CTH * 0.35); g.lineTo(CTW / 2, 0); g.stroke();
}
/* とがったクリスタル */
function drawCrystal(g, id, flat, ph) {
  drawCube(g, id, CTW * 0.68, CTH * 0.68, CBH * 0.8, flat, ph);
  const b = BLOCKS[id], hw = CTW * 0.34, hh = CTH * 0.34, apex = -hh - 21;
  const face = (x1, y1, x2, y2, col) => {
    g.fillStyle = flat || css(col);
    g.beginPath(); g.moveTo(0, apex); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath(); g.fill();
  };
  face(-hw, 0, 0, hh, tint(hx2n(b.lf), 1.08));
  face(0, hh, hw, 0, tint(hx2n(b.rt), 1.16));
  face(hw, 0, 0, -hh, tint(hx2n(b.top), 1.18));
  face(0, -hh, -hw, 0, tint(hx2n(b.top), 0.98));
}
/* 光るブロックのにじみ */
function drawGlow(g, id) {
  const c = hx2n(BLOCKS[id].top), cy = CTH / 2 + CBH * 0.4, r = CTW * 0.7;
  const gr = g.createRadialGradient(0, cy, 2, 0, cy, r);
  gr.addColorStop(0, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",.55)");
  gr.addColorStop(1, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0)");
  g.fillStyle = gr; g.beginPath(); g.arc(0, cy, r, 0, 7); g.fill();
}
/* 1個ぶんの絵を焼く。flat を渡すとその色1色のシルエットになる */
function bakeOne(id, flat, ph, k) {
  const sh = SHAPE[id] || "cube", P = sh === "glow" ? 18 : 0;   // 葉や光は マスからはみ出すので、そのぶんの余白をとる
  let w = CTW, h = CTH + CBH, ox = CTW / 2, oy = CTH / 2;
  if (sh === "canopy") { w = CTW * 1.8; h = CTH + CBH + 30; ox = w / 2; oy = CTH / 2 + 14; }
  if (sh === "crystal") { h = CTH + CBH + 24; oy = CTH / 2 + 24; }
  if (sh === "roof") { w = CTW + 12; h = CTH + CBH + 22; ox = w / 2; oy = CTH / 2 + 19; }
  w += P * 2; h += P * 2; ox += P; oy += P;
  const cv = newCv(w * k, h * k), g = cv.getContext("2d");
  g.setTransform(k, 0, 0, k, ox * k, oy * k);
  if (sh === "canopy") drawCanopy(g, id, flat);
  else if (sh === "pillar") drawCube(g, id, CTW * 0.42, CTH * 0.42, CBH, flat, ph);   // 柱：細い
  else if (sh === "slab") drawCube(g, id, CTW, CTH, 7, flat, ph);                     // 土台・石だたみ：うすい
  else if (sh === "beam") drawBeam(g, id, flat, ph);                                  // 鳥居の横木
  else if (sh === "roof") drawRoof(g, id, flat, ph);                                  // やね
  else if (sh === "crystal") drawCrystal(g, id, flat, ph);
  else {
    if (sh === "glow" && !flat) drawGlow(g, id);
    drawCube(g, id, CTW, CTH, CBH, flat, ph);
  }
  return { cv: cv, ox: ox, oy: oy, w: w, h: h };
}
function bakeBlocks() {
  for (const k in TEXC) delete TEXC[k];
  const sk = Math.max(1, BAKE >> 1);
  for (let id = 1; id < BLOCKS.length; id++) {
    SPR[id] = bakeOne(id, null, 0, BAKE);
    SIL[id] = bakeOne(id, "#ffffff", 0, sk);
    CHIP[id] = chipURL(id);
  }

}
// パレットの見本も、置いたときとまったく同じ絵にする
function chipURL(id) {
  const s = SPR[id], w = 36, sc = Math.min(w / s.w, w / s.h) * 0.96;
  const cv = newCv(w, w), g = cv.getContext("2d");
  g.drawImage(s.cv, (w - s.w * sc) / 2, (w - s.h * sc) / 2, s.w * sc, s.h * sc);
  try { return cv.toDataURL(); } catch (e) { return ""; }
}
// 上に物があると、上面に影が落ちる（光は左うしろから）
function topShade(x, y, z) {
  let s = 0;
  if (x > 0 && colTop(x - 1, y) > z) s += 0.12 + Math.min(0.12, (colTop(x - 1, y) - z) * 0.03);
  if (y > 0 && colTop(x, y - 1) > z) s += 0.1;
  if (x > 0 && y > 0 && colTop(x - 1, y - 1) > z + 1) s += 0.06;
  return Math.min(0.32, s);
}
function drawBlockAt(g, x, y, z, id) {
  const s = SPR[id]; if (!s) return;
  const px = isoX(x, y), py = isoY(x, y, z);
  g.drawImage(s.cv, px - s.ox, py - s.oy, s.w, s.h);
  if (!SHAPE[id] && (z + 1 >= CD_ || !cGet(x, y, z + 1))) {          // 上面が見えている立方体だけ影をのせる
    const sh = topShade(x, y, z);
    if (sh > 0.02) { g.save(); g.globalAlpha = sh; g.fillStyle = "#16305c"; facePath(g, px, py); g.fill(); g.restore(); }
  }
  const fog = Math.min(0.15, Math.max(0, (30 - (x + y)) * 0.006));   // 遠くはうっすら空にとける
  if (fog > 0.01 && SIL[id]) { g.save(); g.globalAlpha = fog; g.drawImage(SIL[id].cv, px - s.ox, py - s.oy, s.w, s.h); g.restore(); }
}
/* ---- 世界を描く（見えている所だけ・奥から手前へ） ---- */
function drawCraft() {
  const cv = $("#craftCanvas"); if (!cv || !cv.getContext) return;
  const g = cv.getContext("2d"); if (!g) return;
  if (!SPR[1]) bakeBlocks();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, cv.height);
  sky.addColorStop(0, "#8ec8f6"); sky.addColorStop(.55, "#bfe3ff"); sky.addColorStop(1, "#eef9ff");
  g.fillStyle = sky; g.fillRect(0, 0, cv.width, cv.height);
  if (!craftPick) craftPick = document.createElement("canvas");
  craftPick.width = cv.width; craftPick.height = cv.height;
  const pg = craftPick.getContext ? craftPick.getContext("2d") : null;
  if (pg) { pg.setTransform(1, 0, 0, 1, 0, 0); pg.clearRect(0, 0, craftPick.width, craftPick.height); }
  const S = camScale();
  g.setTransform(S, 0, 0, S, camX, camY);
  if (pg) pg.setTransform(S, 0, 0, S, camX, camY);
  // 画面に入っている範囲だけ描く
  const L = -camX / S - CTW, R = (cv.width - camX) / S + CTW;
  const T = -camY / S - CBH * CD_, B = (cv.height - camY) / S + CTH + CBH;
  for (let s = 0; s <= (CW_ - 1) + (CH_ - 1); s++) {
    for (let x = 0; x < CW_; x++) {
      const y = s - x; if (y < 0 || y >= CH_) continue;
      const px = isoX(x, y); if (px < L || px > R) continue;
      const pyBase = isoY(x, y, 0); if (pyBase < T || pyBase - CBH * CD_ > B) continue;
      drawBlockAt(g, x, y, -1, P_GROUND);                 // 町の地面
      for (let z = 0; z < CD_; z++) {
        const id = cGet(x, y, z);
        if (id && !occluded(x, y, z)) drawBlockAt(g, x, y, z, id);
      }
      // 組み立て中なら、部品が入る場所を うすく見せる（次に入れる1つは 点めつする）
      if (craftSite) {
        const nx = ghostNext;
        siteCells(craftSite).forEach(function (c) {
          if (c.x !== x || c.y !== y || cGet(c.x, c.y, c.z) === c.id) return;
          const sp = SPR[c.id], sl = SIL[c.id]; if (!sp) return;
          const isNext = nx && nx.x === c.x && nx.y === c.y && nx.z === c.z;
          g.save();
          g.globalAlpha = isNext ? .55 + Math.sin(ghostPhase) * .2 : .22;
          g.drawImage(sp.cv, px - sp.ox, isoY(x, y, c.z) - sp.oy, sp.w, sp.h);
          if (isNext && sl) { g.globalAlpha = .35 + Math.sin(ghostPhase) * .2; g.drawImage(sl.cv, px - sp.ox, isoY(x, y, c.z) - sp.oy, sp.w, sp.h); }
          g.restore();
        });
      }
      const tz = colTop(x, y), col = x + y * CW_;
      if (pg) {
        pg.fillStyle = "rgb(" + ((col + 1) & 255) + "," + (((col + 1) >> 8) & 255) + ",7)";
        facePath(pg, px, isoY(x, y, tz < 0 ? -1 : tz)); pg.fill();
      }
      if (craftHover === col) {
        const hz = tz < 0 ? -1 : tz, hid = tz < 0 ? P_GROUND : cGet(x, y, tz), hs = SIL[hid], sp = SPR[hid];
        if (hs && sp) { g.save(); g.globalAlpha = .3; g.drawImage(hs.cv, px - sp.ox, isoY(x, y, hz) - sp.oy, sp.w, sp.h); g.restore(); }
      }
      (craft.people || []).forEach(function (pp) { if (Math.round(pp.x) === x && Math.round(pp.y) === y) drawPerson(g, pp); });
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
// 水面をゆっくり動かす（クラフト画面を見ているときだけ）
function craftAnimStart() {
  if (craftAnim) return;
  craftAnim = setInterval(function () {
    const v = $("#view-craft");
    if (document.hidden || !v || v.classList.contains("hidden") || !craft) return;
    ghostPhase += 0.9;
    ghostNext = craftSite ? nextNeed(craftSite) : null;
    movePeople();
    drawCraft();
  }, 380);
}
/* ---- 住民（完成した建物に引っ越してくる。町がうごいて見える） ---- */
function drawPerson(g, p) {
  const px = isoX(p.x, p.y), py = isoY(p.x, p.y, colTop(Math.round(p.x), Math.round(p.y)) + 1) + 2;
  const c = PEOPLE_COLORS[p.c % PEOPLE_COLORS.length], bob = Math.sin((p.ph || 0) * 1.7) * 1.6;
  g.save();
  g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(px, py + 2, 7, 3.2, 0, 0, 7); g.fill();
  g.fillStyle = c.b; g.beginPath();                                  // 体（着物）
  g.moveTo(px - 6, py + bob); g.lineTo(px + 6, py + bob); g.lineTo(px + 4, py - 13 + bob); g.lineTo(px - 4, py - 13 + bob); g.closePath(); g.fill();
  g.fillStyle = c.o; g.fillRect(px - 6, py - 6 + bob, 12, 2.5);      // 帯
  g.fillStyle = "#ffe0bd"; g.beginPath(); g.arc(px, py - 18 + bob, 6, 0, 7); g.fill();   // 顔
  g.fillStyle = c.h; g.beginPath(); g.arc(px, py - 20 + bob, 6, Math.PI, 0); g.fill();   // 髪
  g.fillStyle = "#2b2b2b";
  g.beginPath(); g.arc(px - 2.2, py - 18 + bob, 0.9, 0, 7); g.fill();
  g.beginPath(); g.arc(px + 2.2, py - 18 + bob, 0.9, 0, 7); g.fill();
  g.restore();
}
const PEOPLE_COLORS = [{ b: "#4a6fa5", o: "#d4af37", h: "#2b2b2b" }, { b: "#8e5a3b", o: "#e6dcc4", h: "#3b2a1c" },
{ b: "#5b8c5a", o: "#f4f1ea", h: "#2b2b2b" }, { b: "#a8556b", o: "#ffd98a", h: "#4a2b2b" }];
// 住民をすこし歩かせる（自分の家のまわりをうろうろする）
function movePeople() {
  if (!craft || !craft.people) return;
  craft.people.forEach(function (p) {
    p.ph = (p.ph || 0) + 1;
    if (p.ph % 3) return;
    const nx = p.x + [0, 1, 0, -1][p.d || 0], ny = p.y + [1, 0, -1, 0][p.d || 0];
    const near = Math.abs(nx - p.hx) <= 2 && Math.abs(ny - p.hy) <= 2;
    if (near && nx >= 0 && ny >= 0 && nx < CW_ && ny < CH_ && colTop(nx, ny) < 1) { p.x = nx; p.y = ny; }
    else p.d = (p.d + 1 + Math.floor(hash2(p.x + p.ph, p.y) * 3)) % 4;
  });
}

/* ---- クリックの受け取り ---- */
function craftPickAt(ev) {
  const cv = $("#craftCanvas"); if (!cv || !cv.getBoundingClientRect) return null;
  const r = cv.getBoundingClientRect();
  const x = Math.round((ev.clientX - r.left) * (cv.width / r.width));
  const y = Math.round((ev.clientY - r.top) * (cv.height / r.height));
  const pg = craftPick && craftPick.getContext ? craftPick.getContext("2d") : null; if (!pg) return null;
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return null;
  pg.setTransform(1, 0, 0, 1, 0, 0);
  const d = pg.getImageData(x, y, 1, 1).data;
  pg.setTransform(camScale(), 0, 0, camScale(), camX, camY);
  if (d[2] !== 7) return null;
  const col = (d[0] | (d[1] << 8)) - 1; if (col < 0) return null;
  return { x: col % CW_, y: Math.floor(col / CW_), col: col };
}
function craftMsg(t) {
  const el = $("#craftMsg"); if (!el) return;
  el.textContent = t; clearTimeout(craftMsg._t);
  craftMsg._t = setTimeout(function () { el.textContent = ""; }, 2600);
}
/* ---- 設計図：どこに何の部品が入るか ---- */
function siteCells(site) {
  return site.bp.cells.map(function (c) { return { x: site.x + c[0], y: site.y + c[1], z: c[2], id: c[3] }; });
}
function siteFits(bp, x, y) {
  return bp.cells.every(function (c) {
    const cx = x + c[0], cy = y + c[1];
    return cx >= 0 && cy >= 0 && cx < CW_ && cy < CH_ && !cGet(cx, cy, c[2]);
  });
}
const siteLeft = (site) => siteCells(site).filter(function (c) { return cGet(c.x, c.y, c.z) !== c.id; });
// いま組み立て中の場所で、次に入れるべき部品（下から順に）
function nextNeed(site) {
  const left = siteLeft(site);
  left.sort(function (a, b) { return (a.z - b.z) || (a.y - b.y) || (a.x - b.x); });
  return left[0] || null;
}
/* ---- マスをクリックしたとき ---- */
function craftClick(ev) {
  if (dragMoved) return;
  const p = craftPickAt(ev); if (!p) return;
  if (!craftSite) { craftMsg("上の「設計図」を えらんでね"); return; }
  // クリックした場所に入るべき部品をさがす（同じ列の下から順に）
  const want = siteCells(craftSite).filter(function (c) { return c.x === p.x && c.y === p.y && cGet(c.x, c.y, c.z) !== c.id; })
    .sort(function (a, b) { return a.z - b.z; })[0];
  if (!want) { craftMsg("そのマスは もう できているよ"); return; }
  const b = BLOCKS[craftSel];
  if (craftSel !== want.id) {
    craftMsg("ここは「" + BLOCKS[want.id].n + "」だよ（いま持っているのは「" + b.n + "」）");
    wrongSnd(); return;
  }
  const have = getGold();
  if (!eraOpen(b.era)) { craftMsg("「" + b.n + "」は " + ERAS[b.era].cond + "すると つかえるよ"); return; }
  if (have < b.cost) { craftMsg("GOLDが " + (b.cost - have) + " たりない…そろばんで かせごう！"); return; }
  craft.cells[cIdx(want.x, want.y, want.z)] = want.id;
  craft.built = (craft.built || 0) + 1;
  craft.placed = craft.placed || {}; craft.placed[b.n] = (craft.placed[b.n] || 0) + 1;
  craftHist.push({ x: want.x, y: want.y, z: want.z, id: want.id });
  if (craftHist.length > 300) craftHist.shift();
  addGold(-b.cost); clickSnd();   // GOLDを つかうときは レジの音を鳴らさない（入ったときだけ）
  const left = siteLeft(craftSite);
  if (!left.length) finishBuilding();
  else {
    const nx = nextNeed(craftSite);
    if (nx && nx.id !== craftSel) { craftSel = nx.id; craftMsg("つぎは「" + BLOCKS[nx.id].n + "」！（じどうで もちかえたよ）"); }
  }
  saveCraft(); renderCraft();
}
/* ---- 建物が完成した ---- */
function finishBuilding() {
  const bp = craftSite.bp, x = craftSite.x, y = craftSite.y;
  craft.sites = (craft.sites || []).concat([{ id: bp.id, x: x, y: y }]);
  if ((craft.done || []).indexOf(bp.id) < 0) craft.done = (craft.done || []).concat([bp.id]);
  // 住民が引っ越してくる
  let px = x, py = y + 2;
  for (let t = 0; t < 12 && (py >= CH_ || colTop(px, py) >= 1); t++) { py = (py + 1) % CH_; }
  craft.people = (craft.people || []).concat([{ x: px, y: py, hx: x, hy: y, d: 0, ph: 0, c: craft.people.length, name: bp.who }]);
  craftSite = null;
  craftMsg("🎉 「" + bp.n + "」 かんせい！ " + bp.who + " が ひっこして きた！　称号『" + bp.ttl + "』");
  try { bigFanfareSnd(); } catch (e) { }
}
/* ---- 設計図パネル ---- */
function renderCraftQuest() {
  const el = $("#craftQuest"); if (!el) return;
  const e = myEra();
  if (craftSite) {
    const bp = craftSite.bp, left = siteLeft(craftSite), all = bp.cells.length, done = all - left.length;
    const need = {};
    left.forEach(function (c) { need[c.id] = (need[c.id] || 0) + 1; });
    const list = Object.keys(need).map(function (id) { return `<span class="cq-need${+id === craftSel ? " on" : ""}">${BLOCKS[id].n} × ${need[id]}</span>`; }).join("");
    const nx = nextNeed(craftSite);
    el.innerHTML = `<div class="cq-h">🏗 <b>${bp.n}</b> を 組み立て中　<span class="cq-c">${done} / ${all}</span>` +
      `<button id="cqCancel" class="ghost cq-cancel">やめる</button></div>` +
      `<div class="cq-bar"><i style="width:${Math.round(done / all * 100)}%"></i></div>` +
      `<div class="cq-tip">${nx ? "つぎは <b>" + BLOCKS[nx.id].n + "</b>。ひかっている マスを クリック！" : ""}</div>` +
      `<div class="cq-needs">のこり：${list}</div>`;
    const cc = $("#cqCancel"); if (cc) cc.onclick = function () { craftSite = null; renderCraft(); };
    return;
  }
  const cards = BPS.map(function (bp) {
    const open = bp.era <= e, made = (craft.done || []).indexOf(bp.id) >= 0;
    const cost = bp.cells.reduce(function (a, c) { return a + BLOCKS[c[3]].cost; }, 0);
    return `<button class="bp-card${open ? "" : " lock"}" data-bp="${bp.id}"${open ? "" : " disabled"}>` +
      `<span class="bp-n">${open ? "" : "🔒 "}${bp.n}${made ? " ✅" : ""}</span>` +
      `<span class="bp-sub">${open ? bp.cells.length + "部品・" + cost + "G" : ERAS[bp.era].cond}</span></button>`;
  }).join("");
  const badges = (craft.done || []).map(function (id) { const b = bpById(id); return b ? `<span class="cq-badge">🏅 ${b.ttl}</span>` : ""; }).join("");
  el.innerHTML = `<div class="cq-h">📜 レオ王：<b>つぎは 何を 建てる？</b>　<small>設計図を えらぶと、はめる場所が ひかるよ</small></div>` +
    `<div class="bp-list">${cards}</div>` + (badges ? `<div class="cq-badges">${badges}</div>` : "") +
    `<div class="cq-people">町のひと ${(craft.people || []).length}人 ／ たてもの ${(craft.sites || []).length}けん</div>`;
  $$("#craftQuest .bp-card").forEach(function (btn) {
    btn.onclick = function () { startBuilding(btn.dataset.bp); };
  });
}
/* ---- 建てる場所を さがして 組み立てを始める ---- */
function startBuilding(id) {
  const bp = bpById(id); if (!bp) return;
  let spot = null;
  for (let r = 0; r < 9 && !spot; r++) {
    for (let y = 1; y < CH_ - 3 && !spot; y++) for (let x = 1; x < CW_ - 3 && !spot; x++) {
      if (siteFits(bp, x, y)) spot = { x: x, y: y };
    }
  }
  if (!spot) { craftMsg("町が いっぱいだよ"); return; }
  craftSite = { bp: bp, x: spot.x, y: spot.y };
  craftSel = nextNeed(craftSite).id;
  craftMsg("「" + bp.n + "」の 場所を とったよ。" + bp.tip);
  craftCenterOn(spot.x, spot.y);
  renderCraft();
}
function craftCenterOn(x, y) {
  const cv = $("#craftCanvas"); if (!cv) return;
  camX = cv.width / 2 - isoX(x, y) * camScale();
  camY = cv.height / 2 - isoY(x, y, 3) * camScale();
}
function craftCenterOnHero() { craftCenterOn(craftSite ? craftSite.x : CW_ >> 1, craftSite ? craftSite.y : CH_ >> 1); }
/* ---- 部品のパレット ---- */
function renderCraftPalette() {
  const el = $("#craftPalette"); if (!el) return;
  const need = {};
  if (craftSite) siteLeft(craftSite).forEach(function (c) { need[c.id] = (need[c.id] || 0) + 1; });
  let html = "";
  for (let e = 0; e < ERAS.length; e++) {
    const open = eraOpen(e), inEra = [];
    for (let i = 1; i < BLOCKS.length; i++) if (BLOCKS[i].era === e) inEra.push(i);
    if (!inEra.length) continue;
    html += '<div class="era' + (open ? "" : " locked") + '"><div class="era-h">' +
      (open ? "" : "🔒 ") + ERAS[e].n + '<small>' + (open ? "つかえる" : ERAS[e].cond) + '</small></div><div class="era-b">';
    inEra.forEach(function (i) {
      const bk = BLOCKS[i];
      html += '<button class="blk' + (i === craftSel ? " sel" : "") + (open ? "" : " lock") + (need[i] ? " need" : "") + '" data-b="' + i + '">' +
        '<span class="blk-chip" style="background-image:url(' + (CHIP[i] || "") + ')"></span>' +
        '<span class="blk-n">' + bk.n + '</span><span class="blk-c">' + (open ? bk.cost + "G" : "🔒") + '</span>' +
        (need[i] ? '<span class="blk-need">あと' + need[i] + '</span>' : "") + '</button>';
    });
    html += '</div></div>';
  }
  el.innerHTML = html;
  $$("#craftPalette .blk").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const i = +btn.dataset.b, bk = BLOCKS[i];
      if (!eraOpen(bk.era)) return craftMsg("「" + bk.n + "」は " + ERAS[bk.era].cond + "すると つかえるよ");
      craftSel = i; renderCraft();
    });
  });
}
function craftBuiltCount() { return (craft && craft.built) || 0; }
function renderCraft() {
  const fresh = !craft;
  if (fresh) craft = loadCraft();
  resizeCraftCanvas();
  if (!SPR[1]) bakeBlocks();
  if (fresh) craftCenterOnHero();
  craftAnimStart();
  $("#craftGold").textContent = getGold().toLocaleString();
  $("#craftCount").textContent = craftBuiltCount().toLocaleString();
  const el2 = $("#craftEra"); if (el2) el2.textContent = ERAS[myEra()].n;
  const md = $("#craftMode"); if (md) { md.textContent = craftSite ? "🏗 組み立て中" : "📜 設計図から えらぶ"; md.className = "pill"; }
  renderCraftQuest(); renderCraftPalette(); drawCraft(); renderGoldPill();
}

function craftZoom(f) { const cv = $("#craftCanvas"); if (!cv) return; const cx = cv.width / 2, cy = cv.height / 2;
  const ns = Math.max(0.35, Math.min(1.8, camS * f));
  camX = cx - (cx - camX) * (ns / camS); camY = cy - (cy - camY) * (ns / camS); camS = ns; drawCraft(); }
$("#craftCanvas").addEventListener("pointerdown", function (ev) { dragging = true; dragMoved = false; dragSX = ev.clientX; dragSY = ev.clientY; });
$("#craftCanvas").addEventListener("pointermove", function (ev) {
  if (dragging) {
    const dx = ev.clientX - dragSX, dy = ev.clientY - dragSY;
    if (Math.abs(dx) + Math.abs(dy) > 4) { dragMoved = true; camX += dx * craftDPR; camY += dy * craftDPR; dragSX = ev.clientX; dragSY = ev.clientY; drawCraft(); }
    return;
  }
  const p = craftPickAt(ev), c = p ? p.col : -1;
  if (c !== craftHover) { craftHover = c; drawCraft(); }
});
$("#craftCanvas").addEventListener("pointerup", function () { dragging = false; setTimeout(function () { dragMoved = false; }, 0); });
$("#craftCanvas").addEventListener("pointerleave", function () { dragging = false; craftHover = -1; drawCraft(); });
$("#craftCanvas").addEventListener("click", craftClick);
$("#craftMode").addEventListener("click", function () { craftSite = null; renderCraft(); });   // 設計図えらびに もどる
$("#craftIn").addEventListener("click", function () { craftZoom(1.25); });
$("#craftOut").addEventListener("click", function () { craftZoom(0.8); });
$("#craftHome").addEventListener("click", function () { craftCenterOnHero(); drawCraft(); });
$("#craftUndo").addEventListener("click", function () {
  const a = craftHist.pop(); if (!a) return craftMsg("もどせる ものが ないよ");
  craft.cells[cIdx(a.x, a.y, a.z)] = 0;
  craft.built = Math.max(0, (craft.built || 0) - 1);
  const nm = BLOCKS[a.id].n; craft.placed[nm] = Math.max(0, (craft.placed[nm] || 0) - 1);
  addGold(BLOCKS[a.id].cost);                      // はめ直せるよう、代金はぜんぶ返す
  craftMsg("「" + nm + "」を もどした（" + BLOCKS[a.id].cost + "G かえってきた）");
  saveCraft(); renderCraft();
});
$("#craftReset").addEventListener("click", function () {
  if (!confirm("町を さらちに もどす？（つかったGOLDは もどりません）")) return;
  localStorage.removeItem(CRAFT_KEY); craft = null; craftHist = []; craftSite = null; renderCraft(); craftCenterOnHero(); drawCraft();
});
/* ---- 画面いっぱいにする（没入モード）----
   ブラウザの全画面にできればそれを使い、できない環境では画面いっぱいに広げるだけにする。 */
function craftFullOn() { return document.body.classList.contains("craft-full"); }
function setCraftFull(on) {
  document.body.classList.toggle("craft-full", !!on);
  const b = $("#craftFull"); if (b) b.textContent = on ? "⛶ もどす" : "⛶ 大きくする";
  setTimeout(function () { if (craft) { resizeCraftCanvas(); drawCraft(); } }, 60);   // 大きさが変わってから描き直す
}
$("#craftFull").addEventListener("click", function () {
  const v = $("#view-craft");
  if (!craftFullOn()) {
    setCraftFull(true);
    if (v.requestFullscreen) v.requestFullscreen().catch(function () {});
  } else {
    setCraftFull(false);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }
});
// Escで全画面を抜けたときも、表示を元に戻す
document.addEventListener("fullscreenchange", function () {
  if (!document.fullscreenElement && craftFullOn()) setCraftFull(false);
});
// 画面の大きさが変わったら、canvasも作りなおす（ぼやけ防止）
(function () {
  const cv = $("#craftCanvas"); if (!cv) return;
  const on = function () { if (craft && resizeCraftCanvas()) drawCraft(); };
  window.addEventListener("resize", on);
  if (window.ResizeObserver) new ResizeObserver(on).observe(cv);
})();

/* ============================================================ 祝福とねぎらい（アプリ全体で使う）
   「音だけで しらせる」のをやめて、画面に大きく出す。
   できたときは 花火と大きな文字、できなかったときも ねぎらいの言葉を出す。 */
const FX_COLORS = ["#ffd35b", "#ff6b6b", "#4dd4ac", "#5aa9ff", "#c77dff", "#fff"];
function fxLayer() {
  let el = document.getElementById("fxLayer");
  if (!el) { el = document.createElement("div"); el.id = "fxLayer"; document.body.appendChild(el); }
  return el;
}
/* 大きな文字（スーパー）を出す。kind: ok / ng / gold */
function fxBanner(main, sub, kind) {
  const el = fxLayer();
  const d = document.createElement("div");
  d.className = "fx-banner " + (kind || "ok");
  d.innerHTML = '<div class="fx-main">' + main + "</div>" + (sub ? '<div class="fx-sub">' + sub + "</div>" : "");
  el.appendChild(d);
  setTimeout(() => d.remove(), 2200);
}
/* 花火（下から上がって、はじけて 散る） */
function fxFirework(x, y, n) {
  const el = fxLayer();
  for (let i = 0; i < (n || 18); i++) {
    const p = document.createElement("i");
    p.className = "fx-p";
    const a = (Math.PI * 2 * i) / (n || 18) + Math.random() * 0.3;
    const v = 90 + Math.random() * 80;
    p.style.setProperty("--x", x + "px");
    p.style.setProperty("--y", y + "px");
    p.style.setProperty("--dx", (Math.cos(a) * v).toFixed(1) + "px");
    p.style.setProperty("--dy", (Math.sin(a) * v).toFixed(1) + "px");
    p.style.setProperty("--c", FX_COLORS[(Math.random() * FX_COLORS.length) | 0]);
    p.style.setProperty("--d", (Math.random() * 120).toFixed(0) + "ms");
    el.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}
// 何発か 順番に打ち上げる
function fxFireworks(rounds) {
  const W = window.innerWidth, H = window.innerHeight;
  for (let r = 0; r < (rounds || 5); r++) {
    setTimeout(() => {
      const x = W * (0.15 + Math.random() * 0.7), y = H * (0.15 + Math.random() * 0.35);
      fxFirework(x, y, 16 + ((Math.random() * 8) | 0));
      if (r === 0) sfx("levelup", function () { try { const c = ensureAudio(), t = c.currentTime; tone(300 + Math.random() * 500, t, 0.35, "triangle", 0.12); } catch (e) { } });
      else if (!sfxBuf["levelup"]) { try { const c = ensureAudio(), t = c.currentTime; tone(300 + Math.random() * 500, t, 0.35, "triangle", 0.12); } catch (e) { } }
    }, r * 260);
  }
}
/* 紙ふぶき */
function fxConfetti(n) {
  const el = fxLayer(), W = window.innerWidth;
  for (let i = 0; i < (n || 40); i++) {
    const p = document.createElement("i");
    p.className = "fx-cf";
    p.style.setProperty("--x", (Math.random() * W).toFixed(0) + "px");
    p.style.setProperty("--c", FX_COLORS[(Math.random() * FX_COLORS.length) | 0]);
    p.style.setProperty("--d", (Math.random() * 900).toFixed(0) + "ms");
    p.style.setProperty("--r", ((Math.random() * 2 - 1) * 720).toFixed(0) + "deg");
    p.style.setProperty("--w", (6 + Math.random() * 6).toFixed(0) + "px");
    el.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}
/* できたとき：大きさを 3段階で選ぶ（1=よくできた 2=すごい 3=大成功） */
const FX_PRAISE = [
  ["よくできました！", "その調子だよ"],
  ["すごい！", "よく がんばったね"],
  ["だいせいこう！", "レオ王も おどろいてる"],
];
function fxCelebrate(level, main, sub) {
  const L = Math.max(1, Math.min(3, level || 1));
  const p = FX_PRAISE[L - 1];
  fxBanner(main || p[0], sub || p[1], "ok");
  fxFireworks(L * 2 + 1);
  if (L >= 2) fxConfetti(L * 20);
  try { L >= 2 ? bigFanfareSnd() : fanfareSnd(); } catch (e) { }
}
/* できなかったとき：責めずに ねぎらう */
const FX_CHEER = [
  ["おしい！", "あと ちょっとだったね"],
  ["ドンマイ！", "つぎは いけるよ"],
  ["よく ちょうせんした！", "やめずに つづけたのが えらい"],
];
function fxCheer(main, sub) {
  const c = FX_CHEER[(Math.random() * FX_CHEER.length) | 0];
  fxBanner(main || c[0], sub || c[1], "ng");
  try { wrongSnd(); } catch (e) { }
}
/* ============================================================ はじめての説明（1回だけ出る） */
const TIPS_KEY = "soroban_tips";
const tipsSeen = () => { try { return JSON.parse(localStorage.getItem(TIPS_KEY) || "{}"); } catch (e) { return {}; } };
function tipDone(k) { const t = tipsSeen(); t[k] = 1; try { localStorage.setItem(TIPS_KEY, JSON.stringify(t)); } catch (e) { } }
// key が まだ見ていなければ 説明を出す。onClose は 閉じたあとに呼ぶ
function tipOnce(key, title, bodyHTML, onClose) {
  if (tipsSeen()[key]) { if (onClose) onClose(); return false; }
  const el = fxLayer();
  const d = document.createElement("div");
  d.className = "tip-back";
  d.innerHTML = '<div class="tip-card"><div class="tip-title">' + title + "</div>" +
    '<div class="tip-body">' + bodyHTML + "</div>" +
    '<button class="tip-ok">わかった！</button></div>';
  el.appendChild(d);
  d.querySelector(".tip-ok").onclick = function () {
    tipDone(key); d.remove(); if (onClose) onClose();
  };
  return true;
}

/* ============================================================ そろばんパズル
   ロイヤルマッチのような「入れかえて3つそろえる」パズル。
   ★方針：GOLDはここでは増えない（1プレイぶんのGOLDを使って遊ぶ）。
   　　　　GOLDが増えるのは そろばんの学習と ランキングの賞だけ。 */
const PZ_KEY = "soroban_puzzle";
const PZ_W = 8, PZ_H = 8;
const PZ_PLAY_COST = 30;                       // 1プレイに使うGOLD
// 玉の種類：トランプの絵がら4つ＋そろばん玉
const PZ_KINDS = [
  { k: "spade", s: "♠", c: "#3a3a46", g: "#5b5b6b" },
  { k: "heart", s: "♥", c: "#d0342c", g: "#e8695f" },
  { k: "dia", s: "♦", c: "#2b6fd0", g: "#5d9ae8" },
  { k: "club", s: "♣", c: "#2e7d5b", g: "#54a97f" },
  { k: "bead", s: "そろばん玉", c: "#d99a2b", g: "#f0c364" },
];
// アイテム（GOLDで買って、はじめから盤に置く）
const PZ_ITEMS = [
  { id: "rocket", n: "ロケット", em: "🚀", sp: "rh", cost: 40, tip: "たて か よこ を 1れつ 消す" },
  { id: "prop", n: "プロペラ", em: "🚁", sp: "prop", cost: 50, tip: "ねらいの 玉へ とんでいく" },
  { id: "tnt", n: "TNT", em: "💣", sp: "tnt", cost: 60, tip: "まわり 3×3 を ばくはつ" },
];
// レベル（目あて と 手数）。だんだん むずかしくなる
function pzLevel(n) {
  const kinds = n < 4 ? 4 : 5;                                   // はじめは4種、4面目から5種
  const target = PZ_KINDS[(n - 1) % kinds].k;                    // 集める絵がらは 面ごとに かわる
  const moves = Math.max(18, 30 - Math.floor((n - 1) * 0.6));
  // 仕掛けの面と ふつうの面を 交互に（3面目で草、5面目で箱がはじめて出る）
  const kind = n <= 2 ? "color" : ["grass", "color", "box", "color"][(n - 3) % 4];
  if (kind === "grass") {
    const need = Math.min(34, 8 + n * 2);
    return { n, kinds, target, need, moves, goal: "grass", grass: need, box: 0 };
  }
  if (kind === "box") {
    const need = Math.min(14, 3 + Math.floor(n / 2));
    return { n, kinds, target, need, moves, goal: "box", grass: 0, box: need };
  }
  return { n, kinds, target, need: 18 + Math.floor((n - 1) * 2.5), moves, goal: "color", grass: 0, box: 0 };
}
/* ---- 仕掛け（障害物）----
   草：玉が その上で消えると はがれる（動きは じゃましない）
   木箱：となりで そろうと こわれる（1回）。石の箱は 2回いる。玉は通りぬけられない */
const PZ_BLOCK = { box: { n: "木箱", hp: 1 }, stone: { n: "石の箱", hp: 2 } };
function pzMakeStage(lv) {
  const floor = new Array(PZ_W * PZ_H).fill(0), block = new Array(PZ_W * PZ_H).fill(null);
  if (lv.grass) {                                   // 草は 下のほうに かたまりで
    let put = 0, guard = 0;
    while (put < lv.grass && guard++ < 500) {
      const x = Math.floor(Math.random() * PZ_W), y = 2 + Math.floor(Math.random() * (PZ_H - 2));
      const i = pzIdx(x, y); if (floor[i]) continue;
      floor[i] = 1; put++;
    }
  }
  if (lv.box) {                                     // 箱は ばらばらに（上2段には置かない＝詰まないように）
    let put = 0, guard = 0;
    while (put < lv.box && guard++ < 500) {
      const x = Math.floor(Math.random() * PZ_W), y = 2 + Math.floor(Math.random() * (PZ_H - 3));
      const i = pzIdx(x, y); if (block[i]) continue;
      const stone = lv.n >= 9 && Math.random() < 0.35;
      block[i] = { t: stone ? "stone" : "box", hp: stone ? 2 : 1 };
      put++;
    }
  }
  return { floor, block };
}
const pzBlocked = (i) => !!(pz && pz.block && pz.block[i]);
const pzLoad = () => { try { return JSON.parse(localStorage.getItem(PZ_KEY) || "null") || { lv: 1, stars: {}, best: 0, plays: 0 }; } catch (e) { return { lv: 1, stars: {}, best: 0, plays: 0 }; } };
const pzSave = (d) => { try { localStorage.setItem(PZ_KEY, JSON.stringify(d)); } catch (e) { } };

let pzDelay = null, pzFxQ = [];      // 消える順番（Map）と 見せる演出のならび
function pzShow(o) { if (pzFxQ) pzFxQ.push(o); }
let pz = null;   // 進行中の盤面 { cells, lv, moves, got, sel, busy, items }
let pzUid = 1;
const pzIdx = (x, y) => y * PZ_W + x;
const pzIn = (x, y) => x >= 0 && y >= 0 && x < PZ_W && y < PZ_H;
const pzNewTile = (k) => ({ id: pzUid++, k: k, sp: null, born: true });

/* ---- 盤面をつくる（最初から そろっている所が無いようにする） ---- */
function pzMakeBoard(kinds) {
  const c = new Array(PZ_W * PZ_H).fill(null);
  for (let y = 0; y < PZ_H; y++) for (let x = 0; x < PZ_W; x++) {
    const bad = {};
    if (x >= 2 && c[pzIdx(x - 1, y)].k === c[pzIdx(x - 2, y)].k) bad[c[pzIdx(x - 1, y)].k] = 1;
    if (y >= 2 && c[pzIdx(x, y - 1)].k === c[pzIdx(x, y - 2)].k) bad[c[pzIdx(x, y - 1)].k] = 1;
    // 2×2 の四角も 作らない（置いたそばから 消えてしまうため）
    if (x >= 1 && y >= 1 && c[pzIdx(x - 1, y)].k === c[pzIdx(x - 1, y - 1)].k && c[pzIdx(x - 1, y)].k === c[pzIdx(x, y - 1)].k) bad[c[pzIdx(x - 1, y)].k] = 1;
    const ok = [];
    for (let i = 0; i < kinds; i++) if (!bad[PZ_KINDS[i].k]) ok.push(PZ_KINDS[i].k);
    c[pzIdx(x, y)] = pzNewTile(ok[Math.floor(Math.random() * ok.length)]);
  }
  return c;
}
/* ---- そろっている所をさがす（たて・よこ3つ以上、および 2×2の四角） ---- */
function pzRuns(c) {
  const runs = [], sq = [];
  for (let y = 0; y < PZ_H; y++) {
    let s = 0;
    for (let x = 1; x <= PZ_W; x++) {
      const same = x < PZ_W && c[pzIdx(x, y)] && c[pzIdx(s, y)] && c[pzIdx(x, y)].k === c[pzIdx(s, y)].k;
      if (!same) {
        if (x - s >= 3) { const cells = []; for (let i = s; i < x; i++) cells.push(pzIdx(i, y)); runs.push({ dir: "h", len: x - s, k: c[pzIdx(s, y)].k, cells: cells }); }
        s = x;
      }
    }
  }
  for (let x = 0; x < PZ_W; x++) {
    let s = 0;
    for (let y = 1; y <= PZ_H; y++) {
      const same = y < PZ_H && c[pzIdx(x, y)] && c[pzIdx(x, s)] && c[pzIdx(x, y)].k === c[pzIdx(x, s)].k;
      if (!same) {
        if (y - s >= 3) { const cells = []; for (let i = s; i < y; i++) cells.push(pzIdx(x, i)); runs.push({ dir: "v", len: y - s, k: c[pzIdx(x, s)].k, cells: cells }); }
        s = y;
      }
    }
  }
  // 2×2の四角（プロペラのもと）
  for (let y = 0; y + 1 < PZ_H; y++) for (let x = 0; x + 1 < PZ_W; x++) {
    const a = c[pzIdx(x, y)], b = c[pzIdx(x + 1, y)], d = c[pzIdx(x, y + 1)], e = c[pzIdx(x + 1, y + 1)];
    if (a && b && d && e && a.k === b.k && a.k === d.k && a.k === e.k)
      sq.push({ dir: "sq", len: 4, k: a.k, cells: [pzIdx(x, y), pzIdx(x + 1, y), pzIdx(x, y + 1), pzIdx(x + 1, y + 1)] });
  }
  return runs.concat(sq);
}
function pzFindMatches(c) {
  const all = pzRuns(c), hit = new Set();
  all.forEach((r) => r.cells.forEach((i) => hit.add(i)));
  return { hit: hit, runs: all };
}
/* つながっている並びを ひとかたまりにして、どの特殊ピースが生まれるか決める
   ・たて と よこ が交わる（T字・L字）→ TNT
   ・まっすぐ5つ以上           → 光の玉
   ・まっすぐ4つ               → ロケット（並びと同じ向き）
   ・2×2の四角                 → プロペラ                             */
function pzGroups(c, swapAt) {
  const runs = pzRuns(c);
  if (!runs.length) return [];
  const used = runs.map(() => false), groups = [];
  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue;
    const g = [i]; used[i] = true;
    const cells = new Set(runs[i].cells);
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < runs.length; j++) {
        if (used[j] || runs[j].k !== runs[i].k) continue;
        if (runs[j].cells.some((x) => cells.has(x))) { used[j] = true; g.push(j); runs[j].cells.forEach((x) => cells.add(x)); grew = true; }
      }
    }
    const parts = g.map((x) => runs[x]);
    const hasH = parts.some((p) => p.dir === "h"), hasV = parts.some((p) => p.dir === "v");
    const maxLen = Math.max.apply(null, parts.map((p) => p.len));
    const line = parts.filter((p) => p.dir !== "sq").sort((a, b) => b.len - a.len)[0];
    let sp = null, at = null;
    if (hasH && hasV) {                                   // T字・L字
      sp = "tnt";
      const h = parts.find((p) => p.dir === "h"), v = parts.find((p) => p.dir === "v");
      at = h.cells.find((x) => v.cells.indexOf(x) >= 0);
    } else if (line && line.len >= 5) { sp = "disco"; at = line.cells[(line.len / 2) | 0]; }
    else if (line && line.len === 4) { sp = line.dir === "h" ? "rh" : "rv"; at = line.cells[1]; }
    else if (!line && parts.some((p) => p.dir === "sq")) { sp = "prop"; at = parts[0].cells[0]; }
    if (sp && swapAt != null && cells.has(swapAt)) at = swapAt;      // 動かした玉の場所に生まれる
    groups.push({ k: runs[i].k, cells: Array.from(cells), sp: sp, at: at, size: cells.size });
  }
  return groups;
}
/* ---- 特殊ピースの効きめ ---- */
function pzTargetsOf(c, kind) {
  const list = [];
  for (let i = 0; i < c.length; i++) if (c[i] && c[i].k === kind) list.push(i);
  return list;
}
/* 消える順番（ミリ秒）も記録する。ロケットは通った所から、TNTは中心から輪のように壊れる。
   pzFx0 に「飛んでいく絵」を出す指示もためる（画面側が拾って見せる）。 */
function pzBlast(c, i, out, fired, opt) {
  fired = fired || new Set(); opt = opt || {};
  const t = c[i]; if (!t || (!t.sp && !opt.force) || fired.has(i)) return;
  fired.add(i); out.add(i);
  const x = i % PZ_W, y = Math.floor(i / PZ_W);
  const base = opt.at || 0;
  const D = pzDelay;                                   // 消える時刻の記録（Map）
  const setD = (j, d) => { if (D && (!D.has(j) || D.get(j) > d)) D.set(j, d); };
  setD(i, base);
  const add = (j, d) => {
    if (j == null || j < 0 || j >= c.length || !c[j]) return;
    out.add(j); setD(j, base + (d || 0));
    if (c[j].sp && !fired.has(j)) pzBlast(c, j, out, fired, { at: base + (d || 0) + 60 });   // 巻きこまれた物は 少し遅れて発動
  };
  const sp = opt.as || t.sp;
  if (sp === "rh" || sp === "rv") sfx("rocket", null, 1.5);      // 琴を速く＝シャーッ
  else if (sp === "tnt" || sp === "cross") sfx("boom", null, 0.9);  // 爆発は 少し低く＝重く
  if (sp === "rh") { pzShow({ fx: "rocket", dir: "h", x: x, y: y, at: base }); for (let k = 0; k < PZ_W; k++) add(pzIdx(k, y), Math.abs(k - x) * 26); }
  else if (sp === "rv") { pzShow({ fx: "rocket", dir: "v", x: x, y: y, at: base }); for (let k = 0; k < PZ_H; k++) add(pzIdx(x, k), Math.abs(k - y) * 26); }
  else if (sp === "tnt") {
    const r = opt.big ? 2 : 1;
    pzShow({ fx: "ring", x: x, y: y, r: r, at: base });
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (pzIn(x + dx, y + dy)) add(pzIdx(x + dx, y + dy), Math.max(Math.abs(dx), Math.abs(dy)) * 75);
  }
  else if (sp === "cross") {
    pzShow({ fx: "rocket", dir: "h", x: x, y: y, at: base }); pzShow({ fx: "rocket", dir: "v", x: x, y: y, at: base });
    for (let k = 0; k < PZ_W; k++) add(pzIdx(k, y), Math.abs(k - x) * 26);
    for (let k = 0; k < PZ_H; k++) add(pzIdx(x, k), Math.abs(k - y) * 26);
  }
  else if (sp === "prop") {
    const n = opt.count || 1;
    for (let p = 0; p < n; p++) {
      const want = pzTargetsOf(c, opt.aim || (pz && pz.lv ? pz.lv.target : null)).filter((j) => !out.has(j));
      const pool = want.length ? want : c.map((v, j) => j).filter((j) => c[j] && !out.has(j));
      if (!pool.length) break;
      const j = pool[Math.floor(Math.random() * pool.length)];
      const fly = 260 + p * 130;                                      // 飛んでいる時間
      pzShow({ fx: "prop", from: i, to: j, at: base + p * 130, dur: fly - p * 130 });
      add(j, fly);
      const jx = j % PZ_W, jy = (j / PZ_W) | 0;                       // 着地のまわりも すこし
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => { if (pzIn(jx + d[0], jy + d[1])) add(pzIdx(jx + d[0], jy + d[1]), fly + 60); });
    }
  }
  else if (sp === "disco") {
    const kind = opt.color || (function () {
      const cnt = {}; c.forEach((v) => { if (v && !v.sp) cnt[v.k] = (cnt[v.k] || 0) + 1; });
      return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    })();
    pzShow({ fx: "flash", at: base });
    for (let j = 0; j < c.length; j++) if (c[j] && c[j].k === kind) {
      const jx = j % PZ_W, jy = (j / PZ_W) | 0;
      add(j, 60 + (Math.abs(jx - x) + Math.abs(jy - y)) * 22);        // 光の玉から 近い順に
    }
  }
}
/* ---- 特殊ピース同士を入れかえたとき（コンボ） ---- */
function pzCombo(c, a, b, out) {
  const A = c[a], B = c[b];
  if (!A || !B) return false;
  const sa = A.sp, sb = B.sp;
  if (!sa && !sb) return false;
  const isR = (s) => s === "rh" || s === "rv";
  const fired = new Set();
  if (sa === "disco" && sb === "disco") { for (let j = 0; j < c.length; j++) out.add(j); return "全部 消えた！"; }
  if (sa === "disco" || sb === "disco") {
    const other = sa === "disco" ? B : A, at = sa === "disco" ? a : b;
    if (other.sp) {                                   // 光の玉 × 特殊 → 同じ色が ぜんぶ その特殊になって 一斉発動
      const kind = other.k;
      const list = pzTargetsOf(c, kind);
      out.add(at); out.add(sa === "disco" ? b : a);
      list.forEach((j) => { if (c[j]) pzBlast(c, j, out, fired, { as: other.sp, force: true }); });
      return "光の玉 × " + (other.sp === "tnt" ? "TNT" : other.sp === "prop" ? "プロペラ" : "ロケット") + "！";
    }
    pzBlast(c, at, out, fired, { as: "disco", color: other.k });      // 光の玉 × ふつう → その色 ぜんぶ
    out.add(sa === "disco" ? b : a);
    return "同じ色を ぜんぶ 消した！";
  }
  if (isR(sa) && isR(sb)) { pzBlast(c, b, out, fired, { as: "cross", force: true }); out.add(a); return "ロケット × ロケット！"; }
  if (sa === "tnt" && sb === "tnt") { pzBlast(c, b, out, fired, { as: "tnt", big: true, force: true }); out.add(a); return "TNT × TNT！"; }
  if (sa === "prop" && sb === "prop") { pzBlast(c, b, out, fired, { as: "prop", count: 3, force: true }); out.add(a); return "プロペラが 3機！"; }
  if ((isR(sa) && sb === "tnt") || (sa === "tnt" && isR(sb))) {        // ロケット × TNT → 3れつ ＋ 3ぎょう
    const x = b % PZ_W, y = (b / PZ_W) | 0;
    for (let d = -1; d <= 1; d++) {
      for (let k = 0; k < PZ_W; k++) if (pzIn(k, y + d)) out.add(pzIdx(k, y + d));
      for (let k = 0; k < PZ_H; k++) if (pzIn(x + d, k)) out.add(pzIdx(x + d, k));
    }
    out.add(a);
    return "ロケット × TNT！";
  }
  // 片方だけ特殊 → ふつうに発動
  [a, b].forEach((i) => { if (c[i] && c[i].sp) pzBlast(c, i, out, fired, {}); });
  return true;
}
// 消える所と 生まれるアイテムを 調べるだけ（まだ盤は変えない＝アニメーションのため）
function pzCollect(c, swapAt) {
  const groups = pzGroups(c, swapAt);
  if (!groups.length) return null;
  const gone = new Set(), made = [];
  groups.forEach((g) => {
    g.cells.forEach((i) => gone.add(i));
    if (g.sp) made.push({ at: g.at, sp: g.sp, k: g.k });
  });
  const fired = new Set();
  const keepD = pzDelay, keepQ = pzFxQ;
  pzDelay = new Map(); pzFxQ = [];
  Array.from(gone).forEach((i) => { if (c[i] && c[i].sp) pzBlast(c, i, gone, fired, {}); });   // 巻きこまれた特殊も発動
  const delay = pzDelay, fx = pzFxQ;
  pzDelay = keepD; pzFxQ = keepQ;
  const counts = {};
  gone.forEach((i) => { if (c[i]) counts[c[i].k] = (counts[c[i].k] || 0) + 1; });
  const hit = pzHitStage(gone);
  return { gone: gone, made: made, counts: counts, big: gone.size >= 6, delay: delay, fx: fx, grass: hit.grass, broke: hit.broke, dmg: hit.dmg };
}
/* 消えたマスから、草をはがし、となりの箱にダメージを与える */
function pzHitStage(gone) {
  const out = { grass: 0, broke: 0, dmg: [] };
  if (!pz || !pz.floor) return out;
  const seen = {};
  gone.forEach((i) => {
    if (pz.floor[i]) { pz.floor[i] = 0; out.grass++; }
    const x = i % PZ_W, y = (i / PZ_W) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => {
      const nx = x + d[0], ny = y + d[1]; if (!pzIn(nx, ny)) return;
      const j = pzIdx(nx, ny); if (!pz.block[j] || seen[j]) return;
      seen[j] = 1;                                   // 1回の消しで 1ダメージまで
      pz.block[j].hp--;
      out.dmg.push(j);
      if (pz.block[j].hp <= 0) { pz.block[j] = null; out.broke++; }
    });
  });
  return out;
}
// 目あてに かぞえる数（色あつめ／草はがし／箱こわし）
function pzGotFrom(r) {
  if (!pz || !pz.lv) return 0;
  if (pz.lv.goal === "grass") return r.grass || 0;
  if (pz.lv.goal === "box") return r.broke || 0;
  return (r.counts && r.counts[pz.lv.target]) || 0;
}
// 実際に消して、アイテムを置く
function pzApply(c, r) {
  r.gone.forEach((i) => { c[i] = null; });
  r.made.forEach((mk) => { if (!c[mk.at]) c[mk.at] = { id: pzUid++, k: mk.k, sp: mk.sp, born: true }; });
}
function pzResolveOnce(c, kinds, swapAt) {
  const r = pzCollect(c, swapAt); if (!r) return null;
  pzApply(c, r); pzFall(c, kinds);
  return { cleared: r.gone.size, counts: r.counts, made: r.made.length, grass: r.grass, broke: r.broke };
}
/* ---- 入れかえられるか（そろう形になるときだけ 入れかえられる） ---- */
function pzWouldMatch(c, a, b) {
  if (!c[a] || !c[b]) return false;                    // 箱のマスは 動かせない
  const t = c[a]; c[a] = c[b]; c[b] = t;
  const ok = pzFindMatches(c).hit.size > 0 || (c[a] && c[a].sp) || (c[b] && c[b].sp);
  const t2 = c[a]; c[a] = c[b]; c[b] = t2;
  return ok;
}
// 動かせる手が残っているか
function pzHasMove(c) {
  for (let y = 0; y < PZ_H; y++) for (let x = 0; x < PZ_W; x++) {
    if (x + 1 < PZ_W && pzWouldMatch(c, pzIdx(x, y), pzIdx(x + 1, y))) return true;
    if (y + 1 < PZ_H && pzWouldMatch(c, pzIdx(x, y), pzIdx(x, y + 1))) return true;
  }
  return false;
}
/* ---- 1面のはじまり ---- */
function pzStart(lvNo, items) {
  const lv = pzLevel(lvNo);
  const stage = pzMakeStage(lv);
  pz = {
    cells: new Array(PZ_W * PZ_H).fill(null), lv: lv, moves: lv.moves, got: 0, sel: -1,
    busy: false, done: false, combo: 0, score: 0, floor: stage.floor, block: stage.block,
  };
  pzFillBoard(lv.kinds);                       // 箱をよけて、そろっていない盤を作る
  if (!pzHasMove(pz.cells)) pzReshuffle();     // 動かせる手が無ければ 作り直す
  // 買ったアイテムを 盤に置く
  (items || []).forEach(function (it) {
    for (let t = 0; t < 80; t++) {
      const i = Math.floor(Math.random() * PZ_W * PZ_H);
      if (pz.cells[i] && !pz.cells[i].sp) {
        const d = PZ_ITEMS.find((q) => q.id === it);
        pz.cells[i].sp = d ? (d.sp === "rh" ? (Math.random() < 0.5 ? "rh" : "rv") : d.sp) : "rh";
        break;
      }
    }
  });
  return pz;
}
/* ---- 入れかえ（画面側は 1手ずつ 呼んで アニメーションさせる） ---- */
// ① 入れかえられるか調べて、入れかえる
function pzBeginSwap(a, b) {
  if (!pz || pz.busy || pz.done) return { ok: false };
  const ax = a % PZ_W, ay = Math.floor(a / PZ_W), bx = b % PZ_W, by = Math.floor(b / PZ_W);
  if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return { ok: false, why: "となり どうしだけ" };
  if (!pzWouldMatch(pz.cells, a, b)) return { ok: false, why: "そろわないよ" };
  const t = pz.cells[a]; pz.cells[a] = pz.cells[b]; pz.cells[b] = t;
  return { ok: true };
}
// ② アイテムを直接動かしたとき
/* ---- アイテムの爆発：先に「どこが いつ 壊れるか」を決めてから 見せる ---- */
function pzPlanSpecials(a, b) {
  const gone = new Set();
  pzDelay = new Map(); pzFxQ = [];
  const label = pzCombo(pz.cells, a, b, gone);
  const delay = pzDelay, fx = pzFxQ;
  pzDelay = null; pzFxQ = [];
  if (!gone.size) return null;
  return { gone: Array.from(gone), delay: delay, fx: fx, label: label };
}
function pzApplyPlan(plan) {
  const counts = {};
  plan.gone.forEach((i) => { if (pz.cells[i]) counts[pz.cells[i].k] = (counts[pz.cells[i].k] || 0) + 1; });
  const hit = pzHitStage(new Set(plan.gone));
  plan.gone.forEach((i) => { pz.cells[i] = null; });
  pzFall(pz.cells, pz.lv.kinds);
  const got = pzGotFrom({ counts: counts, grass: hit.grass, broke: hit.broke });
  pz.got += got;
  plan.broke = hit.broke; plan.grass = hit.grass;
  return got;
}
// まとめて1手ぶん（テストや自動プレイ用）
function pzFireSpecials(a, b) {
  const plan = pzPlanSpecials(a, b);
  if (!plan) return null;
  pz.comboText = typeof plan.label === "string" ? plan.label : "";
  const got = pzApplyPlan(plan);
  return { gone: plan.gone, cleared: plan.gone.length, got: got, delay: plan.delay, fx: plan.fx };
}
/* ---- 飛ぶ絵 ---- */
function pzFxEl(cls) {
  const el = $("#pzBoard"); if (!el) return null;
  const d = document.createElement("div");
  d.className = cls;
  el.appendChild(d);
  return d;
}
function pzShowFx(o) {
  if (o.fx === "rocket") {
    [-1, 1].forEach((s) => {
      const d = pzFxEl("pz-rk " + (o.dir === "h" ? "h" : "v"));
      if (!d) return;
      d.textContent = "🚀";
      d.style.setProperty("--x", o.x); d.style.setProperty("--y", o.y);
      d.style.setProperty("--s", s);
      d.style.setProperty("--far", (o.dir === "h" ? PZ_W : PZ_H));
      setTimeout(() => d.remove(), 460);
    });
  } else if (o.fx === "ring") {
    const d = pzFxEl("pz-ring");
    if (!d) return;
    d.style.setProperty("--x", o.x); d.style.setProperty("--y", o.y);
    d.style.setProperty("--r", (o.r || 1) * 2 + 1);
    setTimeout(() => d.remove(), 520);
  } else if (o.fx === "prop") {
    const d = pzFxEl("pz-fly");
    if (!d) return;
    d.textContent = "🚁";
    d.style.setProperty("--x", o.from % PZ_W); d.style.setProperty("--y", (o.from / PZ_W) | 0);
    d.style.setProperty("--tx", o.to % PZ_W); d.style.setProperty("--ty", (o.to / PZ_W) | 0);
    d.style.setProperty("--dur", (o.dur || 260) + "ms");
    setTimeout(() => d.remove(), (o.dur || 260) + 160);
  } else if (o.fx === "flash") {
    const d = pzFxEl("pz-flash");
    if (d) setTimeout(() => d.remove(), 420);
  }
}
/* ---- 順番に こわす（ロケットは通った所から、TNTは中心から） ---- */
/* 玉の種類ごとの音（消えたときに 1回だけ鳴る）
   bead＝金の星 → キラッ ／ dia＝水色のしずく → 涙のしずく */
const PZ_KIND_SFX = {
  bead: "sparkle",       // 金の星 → キラッ
  dia: "drop",           // 水色   → 水滴
  heart: "tile_red",     // 赤     → 目玉焼き
  spade: "tile_purple",  // 紫     → 決定音
  club: "tile_green",    // 緑     → パッ
};
function pzKindSfx(list, delay) {
  const hit = {};
  (list && list.forEach ? list : []).forEach(function (i) {
    const t = pz.cells[i]; if (!t) return;
    const n = PZ_KIND_SFX[t.k]; if (n) hit[n] = 1;
  });
  const names = Object.keys(hit);
  if (!names.length) return false;
  // いちどに いくつも消えても 音が団子にならないよう、少しずつ ずらす（多いときは 3種類まで）
  names.slice(0, 3).forEach(function (n, k) { setTimeout(function () { sfx(n); }, (delay || 0) + k * 70); });
  return true;
}
function pzHadStar(list) {
  let hit = false;
  (list && list.forEach ? list : []).forEach(function (i) { const t = pz.cells[i]; if (t && t.k === "bead") hit = true; });
  return hit;
}
async function pzPlayBlast(gone, delay, fx) {
  (fx || []).forEach((o) => setTimeout(() => pzShowFx(o), o.at || 0));
  pzKindSfx(gone, 120);          // 星＝キラッ／水色＝しずく（爆発音と重ならないよう すこし遅らせる）
  let maxD = 0;
  (gone || []).forEach((i) => {
    const d = (delay && delay.get(i)) || 0;
    if (d > maxD) maxD = d;
    const t = pz.cells[i];
    const n = t && pzNodes[t.id];
    if (n) { n.style.setProperty("--d", d + "ms"); n.classList.add("pop"); }
    setTimeout(() => { if (t) pzBurst(i, t.k, 4); }, d);
    if (d > 0) setTimeout(() => pzTone(2 + Math.min(10, d / 30), false), d);
  });
  pzShake(maxD > 150);
  await pzWait(maxD + 210);
}
// ③ そろっている所を1回ぶん消す（返り値が null になるまで くり返す＝連鎖）
function pzCascade(swapAt) {
  const before = pz.cells.map((t) => (t ? t.id : 0));
  const r = pzResolveOnce(pz.cells, pz.lv.kinds, swapAt);
  if (!r) return null;
  const got = pzGotFrom(r);
  pz.got += got;
  return { cleared: r.cleared, got: got, before: before };
}
// ④ 1手ぶん おわり
/* 盤に玉を配る。箱のマスは あけたまま、置いたそばから そろわないように 色をえらぶ。
   （でたらめに置くと ほぼ必ずどこかが そろってしまうので、1マスずつ制約を見て置く） */
function pzFillBoard(kinds) {
  const c = pz.cells;
  const at = (x, y) => { if (!pzIn(x, y)) return null; const j = pzIdx(x, y); return (pz.block && pz.block[j]) ? null : c[j]; };
  for (let y = 0; y < PZ_H; y++) for (let x = 0; x < PZ_W; x++) {
    const i = pzIdx(x, y);
    if (pz.block && pz.block[i]) { c[i] = null; continue; }
    const bad = {};
    const l1 = at(x - 1, y), l2 = at(x - 2, y), u1 = at(x, y - 1), u2 = at(x, y - 2), d1 = at(x - 1, y - 1);
    if (l1 && l2 && l1.k === l2.k) bad[l1.k] = 1;                              // よこ3つ を作らない
    if (u1 && u2 && u1.k === u2.k) bad[u1.k] = 1;                              // たて3つ を作らない
    if (l1 && u1 && d1 && l1.k === u1.k && l1.k === d1.k) bad[l1.k] = 1;        // 2×2 を作らない
    const ok = [];
    for (let t = 0; t < kinds; t++) if (!bad[PZ_KINDS[t].k]) ok.push(PZ_KINDS[t].k);
    c[i] = pzNewTile(ok.length ? ok[(Math.random() * ok.length) | 0] : PZ_KINDS[0].k);
  }
}
// 手づまりのときの 並べ直し。動かせる手ができるまで やり直す
function pzReshuffle() {
  for (let guard = 0; guard < 30; guard++) {
    pzFillBoard(pz.lv.kinds);
    if (pzHasMove(pz.cells)) return true;
  }
  return false;
}
function pzFinishTurn() {
  pz.moves--;
  if (!pzHasMove(pz.cells)) {
    if (pzReshuffle()) { try { pzMsg("手づまり！ ならべ直したよ", "ok"); } catch (e) { } }
    else pz.moves = 0;                       // どうしても手が無ければ そこで終わりにする（固まらせない）
  }
  const win = pz.got >= pz.lv.need;
  if (win || pz.moves <= 0) pz.done = win ? "win" : "lose";
  return pz.done;
}
// 上から落として すき間を埋める
function pzFall(c, kinds) {
  const blocked = (i) => !!(pz && pz.block && pz.block[i]);
  for (let x = 0; x < PZ_W; x++) {
    let end = PZ_H - 1;
    while (end >= 0) {
      if (blocked(pzIdx(x, end))) { end--; continue; }
      let top = end;
      while (top - 1 >= 0 && !blocked(pzIdx(x, top - 1))) top--;      // 箱で区切られた ひとつづき
      let w = end;
      for (let y = end; y >= top; y--) { const t = c[pzIdx(x, y)]; if (t) { c[pzIdx(x, y)] = null; c[pzIdx(x, w)] = t; w--; } }
      for (let y = w; y >= top; y--) c[pzIdx(x, y)] = pzNewTile(PZ_KINDS[Math.floor(Math.random() * kinds)].k);
      end = top - 1;
    }
  }
}
// まとめて1手（テストや自動プレイ用）
function pzSwap(a, b) {
  const s = pzBeginSwap(a, b); if (!s.ok) return s;
  let cleared = 0, got0 = pz.got, chain = 0;
  const f = pzFireSpecials(a, b); if (f) cleared += f.cleared;
  let r;
  while ((r = pzCascade(b)) !== null) { cleared += r.cleared; if (++chain > 30) break; }
  const done = pzFinishTurn();
  return { ok: true, cleared: cleared, got: pz.got - got0, chain: chain, done: done };
}
// 星（のこり手数で決まる）
function pzStars() {
  if (!pz || pz.done !== "win") return 0;
  const left = pz.moves / pz.lv.moves;
  return left >= 0.4 ? 3 : left >= 0.2 ? 2 : 1;
}

/* ---------- パズルの画面（玉ひとつずつに DOM を持たせて なめらかに動かす） ---------- */
let pzBuy = {};                 // 買ったアイテム { rocket:1, bomb:0 }
let pzNodes = {};               // 玉のid → 画面の要素
const pzWait = (ms) => new Promise((r) => setTimeout(r, ms));
const pzKind = (k) => PZ_KINDS.find((x) => x.k === k) || PZ_KINDS[0];
const PZ_SP_ICON = { rh: "🚀", rv: "🚀", tnt: "💣", prop: "🚁", disco: "✨" };
// 玉の絵：いただいた素材（宝石のしずくと 金の星）を切り出して 色ちがいにしたもの
const PZ_IMG = { heart: "pz_gem_red", dia: "pz_gem", club: "pz_gem_green", spade: "pz_gem_purple", bead: "pz_star" };
function pzFaceHTML(t) {
  if (t.sp === "disco") return '<i class="pz-disco"></i>';              // 光の玉は 色を持たない見た目
  const face = '<img class="pz-img" src="assets/' + (PZ_IMG[t.k] || PZ_IMG.dia) + '.png" alt="" draggable="false">';
  const sp = t.sp ? '<b class="pz-sp sp-' + t.sp + '">' + (PZ_SP_ICON[t.sp] || "") + "</b>" : "";
  return face + sp;
}
/* 盤面を いまの状態に合わせる。位置だけ変えるので CSS が動きを付けてくれる */
function pzSync(instant) {
  const el = $("#pzBoard"); if (!el || !pz) return;
  const seen = {};
  pz.cells.forEach((t, i) => {
    if (!t) return;
    seen[t.id] = 1;
    const x = i % PZ_W, y = Math.floor(i / PZ_W);
    let n = pzNodes[t.id];
    if (!n) {
      n = document.createElement("div");
      n.className = "pz-t k-" + t.k + (t.sp ? " sp sp-" + t.sp : "");
      n.innerHTML = pzFaceHTML(t);
      n.style.setProperty("--x", x);
      n.style.setProperty("--y", instant ? y : y - PZ_H);   // 上から 落ちてくる
      el.appendChild(n);
      pzNodes[t.id] = n;
      if (!instant) requestAnimationFrame(() => requestAnimationFrame(() => n.style.setProperty("--y", y)));
    } else {
      n.style.setProperty("--x", x);
      n.style.setProperty("--y", y);
      if (t.sp && !n.classList.contains("sp")) { n.classList.add("sp", "sp-" + t.sp, "born"); n.innerHTML = pzFaceHTML(t); }
    }
    n.dataset.i = i;
    n.classList.toggle("sel", pz.sel === i);
  });
  Object.keys(pzNodes).forEach((id) => { if (!seen[id]) { pzNodes[id].remove(); delete pzNodes[id]; } });
  pzStageSync();
}
function pzResetBoard() {
  const el = $("#pzBoard"); if (el) el.innerHTML = "";
  pzNodes = {};
  pzSync(true);
}
/* 草と箱を 盤に描く（玉より下・玉より上のレイヤー） */
function pzStageSync() {
  const el = $("#pzBoard"); if (!el || !pz || !pz.floor) return;
  el.querySelectorAll(".pz-fl, .pz-bk").forEach((n) => n.remove());
  const frag = document.createDocumentFragment();
  for (let i = 0; i < pz.floor.length; i++) {
    if (!pz.floor[i]) continue;
    const d = document.createElement("i");
    d.className = "pz-fl";
    d.style.setProperty("--x", i % PZ_W); d.style.setProperty("--y", (i / PZ_W) | 0);
    frag.appendChild(d);
  }
  for (let i = 0; i < pz.block.length; i++) {
    const b = pz.block[i]; if (!b) continue;
    const d = document.createElement("i");
    d.className = "pz-bk " + b.t + (b.t === "stone" && b.hp === 1 ? " cracked" : "");
    d.style.setProperty("--x", i % PZ_W); d.style.setProperty("--y", (i / PZ_W) | 0);
    frag.appendChild(d);
  }
  el.appendChild(frag);
}
function pzGoalIcon() {
  if (!pz) return "";
  if (pz.lv.goal === "grass") return '<i class="pz-fl sm"></i>';
  if (pz.lv.goal === "box") return '<i class="pz-bk box sm"></i>';
  return '<img class="pz-mini" src="assets/' + (PZ_IMG[pz.lv.target] || PZ_IMG.dia) + '.png" alt="">';
}
function pzRenderHud() {
  if (!pz) return;
  const done = pz.got >= pz.lv.need;
  $("#pzGoal").innerHTML = pzGoalIcon() + " <b>" + Math.min(pz.got, pz.lv.need) + " / " + pz.lv.need + "</b>" + (done ? ' <span class="pz-ok">✓</span>' : "");
  $("#pzMoves").innerHTML = "のこり <b>" + Math.max(0, pz.moves) + "</b> 手";
  const sc = $("#pzScore"); if (sc) sc.textContent = (pz.score || 0).toLocaleString();
  pzKingFace();
  $("#pzLv").textContent = "レベル " + pz.lv.n;
  const bar = $("#pzBar"); if (bar) bar.style.width = Math.min(100, Math.round(pz.got / pz.lv.need * 100)) + "%";
}
function pzMsg(t, cls) {
  const el = $("#pzMsg"); if (!el) return;
  el.textContent = t; el.className = "pz-msg " + (cls || "") + " show";
  clearTimeout(pzMsg._t); pzMsg._t = setTimeout(() => { el.className = "pz-msg"; }, 1200);
}
function pzShake(strong) {
  const b = $("#pzBoard"); if (!b) return;
  b.classList.remove("shake", "shake-b"); void b.offsetWidth;
  b.classList.add(strong ? "shake-b" : "shake");
  setTimeout(() => b.classList.remove("shake", "shake-b"), 400);
}
/* ---------- 気持ちよさの演出（点数・つぶ・音・ほめ言葉） ---------- */
const PZ_PRAISE = ["", "", "いいね！", "すごい！", "さいこう！", "でんせつ！", "しんきろく！"];
function pzFx(i, html, cls, life) {
  const el = $("#pzBoard"); if (!el) return;
  const d = document.createElement("div");
  d.className = "pz-fx " + (cls || "");
  d.innerHTML = html;
  d.style.setProperty("--x", i % PZ_W);
  d.style.setProperty("--y", (i / PZ_W) | 0);
  el.appendChild(d);
  setTimeout(() => d.remove(), life || 900);
}
// 消えた所から つぶが とび散る
function pzBurst(i, kind, n) {
  const el = $("#pzBoard"); if (!el) return;
  const kd = pzKind(kind);
  for (let p = 0; p < (n || 5); p++) {
    const d = document.createElement("i");
    d.className = "pz-p";
    d.style.setProperty("--x", i % PZ_W);
    d.style.setProperty("--y", (i / PZ_W) | 0);
    d.style.setProperty("--dx", (Math.random() * 2 - 1).toFixed(2));
    d.style.setProperty("--dy", (-Math.random() * 1.4 - .3).toFixed(2));
    d.style.setProperty("--pc", kd.g);
    d.style.setProperty("--pd", (p * 18) + "ms");
    el.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }
}
// 連鎖が進むほど 音が上がる（うれしさが積み上がる）
// 連鎖の音。半音ではなく ペンタトニック（ヨナ抜き）で上げるので、何段でも濁らない
function pzTone(step, big) {
  if (!soundOn) return;
  // しゃきん！ 連鎖するほど 少しだけ高くする（上げすぎると あほっぽくなる）
  if (sfxBuf["pop"]) return sfxAt("pop", 0.45, 1 + Math.min(6, step) * 0.045);   // 色ごとの音を 主役にするため 小さめに
  try {
    const c = ensureAudio(), t = c.currentTime;
    const f = noteHz(step);
    tone2(f, t, big ? 0.24 : 0.13, "triangle", big ? 0.18 : 0.13);
    if (big) tone2(f * 1.5, t + 0.05, 0.22, "sine", 0.1);
  } catch (e) { }
}
function pzGoalPop() {
  const g = $("#pzGoal"); if (!g) return;
  g.classList.remove("pop"); void g.offsetWidth; g.classList.add("pop");
}
function pzScoreAdd(n, i) {
  pz.score = (pz.score || 0) + n;
  const s = $("#pzScore"); if (s) { s.textContent = pz.score.toLocaleString(); s.classList.remove("pop"); void s.offsetWidth; s.classList.add("pop"); }
  if (i != null) pzFx(i, "+" + n, "pz-pts");
}
/* ---- 1回ぶん消す（消える→つぶが散る→落ちる） ---- */
async function pzCascadeAnim(swapAt, chain) {
  const r = pzCollect(pz.cells, swapAt);
  if (!r) return null;
  const pts = r.gone.size * 10 * Math.min(chain, 5);
  let mid = -1, maxD = 0;
  (r.fx || []).forEach((o) => setTimeout(() => pzShowFx(o), o.at || 0));
  r.gone.forEach((i) => {
    const t = pz.cells[i]; if (!t) return;
    if (mid < 0) mid = i;
    const d = (r.delay && r.delay.get(i)) || (Math.abs(i % PZ_W - (swapAt != null ? swapAt % PZ_W : 4)) * 12);
    if (d > maxD) maxD = d;
    const n = pzNodes[t.id];
    if (n) { n.style.setProperty("--d", d + "ms"); n.classList.add("pop"); }
    setTimeout(() => pzBurst(i, t.k, r.gone.size > 12 ? 3 : 5), d);
  });
  pzTone(chain * 2, r.big);
  pzKindSfx(r.gone, 0);                        // 星＝キラッ／水色＝しずく
  if (r.big || maxD > 100) pzShake(maxD > 150);
  if (chain >= 2) {
    pzFx(mid < 0 ? 27 : mid, PZ_PRAISE[Math.min(chain, PZ_PRAISE.length - 1)], "pz-praise", 1000);
    pzMsg(chain + "れんさ！", "ok");
  }
  await pzWait(Math.max(chain > 1 ? 150 : 175, maxD + 190));
  pzApply(pz.cells, r);
  pzFall(pz.cells, pz.lv.kinds);
  const got = pzGotFrom(r);
  pz.got += got;
  pzScoreAdd(pts, mid);
  if (got) pzGoalPop();
  const left = pz.lv.need - pz.got;
  if (left > 0 && left <= 2) pzMsg("あと " + left + " こ！", "ok");
  pzSync();
  pzRenderHud();
  await pzWait(200);
  return r;
}
/* ---- 手数が余ってクリアしたとき：のこりが ロケットになって 自動で発射（フィナーレ） ---- */
async function pzFinale() {
  const left = Math.min(pz.moves, 8);
  if (left <= 0) return;
  pzMsg("のこり " + pz.moves + " 手が ロケットに！", "ok");
  await pzWait(500);
  for (let k = 0; k < left; k++) {
    const pool = [];
    for (let i = 0; i < pz.cells.length; i++) if (pz.cells[i] && !pz.cells[i].sp) pool.push(i);
    if (!pool.length) break;
    const i = pool[Math.floor(Math.random() * pool.length)];
    pz.cells[i].sp = Math.random() < 0.5 ? "rh" : "rv";
    pzSync();
    await pzWait(90);
    const gone = new Set();
    pzBlast(pz.cells, i, gone, null, {});
    gone.forEach((j) => {
      const t = pz.cells[j]; if (!t) return;
      const n = pzNodes[t.id]; if (n) n.classList.add("pop");
      pzBurst(j, t.k, 3);
    });
    pzTone(6 + k * 2, true);
    pzShake(k >= 4);
    await pzWait(150);
    gone.forEach((j) => { pz.cells[j] = null; });
    pzFall(pz.cells, pz.lv.kinds);
    pzScoreAdd(gone.size * 20, i);
    pzSync();
    await pzWait(140);
  }
  // フィナーレのあとの そろいも 片づける
  let guard = 0, r;
  while ((r = pzCollect(pz.cells, null)) && guard++ < 8) {
    pzApply(pz.cells, r); pzFall(pz.cells, pz.lv.kinds);
    pzScoreAdd(r.gone.size * 10);
    pzSync(); await pzWait(160);
  }
}
/* ---------- あそび中に使える道具バー（画面の下・ロイヤルマッチと同じ位置） ---------- */
const PZ_TOOLS = [
  { id: "hammer", n: "ハンマー", em: "🔨", cost: 25, tip: "すきな玉を 1つ こわす" },
  { id: "rocket", n: "ロケット", em: "🚀", cost: 40, tip: "その場所を ロケットにして 発射" },
  { id: "prop", n: "プロペラ", em: "🚁", cost: 50, tip: "その場所を プロペラにして 発射" },
  { id: "tnt", n: "TNT", em: "💣", cost: 60, tip: "その場所を TNTにして ばくはつ" },
];
let pzArmed = null;                    // いま かまえている道具
function pzToolStock(id) { const d = pzLoad(); return (d.items && d.items[id]) || 0; }
function pzRenderTools() {
  const el = $("#pzTools"); if (!el) return;
  el.innerHTML = PZ_TOOLS.map(function (t) {
    const n = pzToolStock(t.id);
    return '<button class="pz-tool' + (pzArmed === t.id ? " on" : "") + '" data-t="' + t.id + '" title="' + t.tip + '">' +
      '<span class="pz-tool-em">' + t.em + "</span>" +
      '<span class="pz-tool-n">' + (n ? n : t.cost + "G") + "</span></button>";
  }).join("") + '<div class="pz-tool-tip" id="pzToolTip"></div>';
  $$("#pzTools .pz-tool").forEach(function (b) { b.onclick = function () { pzArm(b.dataset.t); }; });
}
function pzArm(id) {
  if (!pz || pz.busy || pz.done) return;
  const t = PZ_TOOLS.find((x) => x.id === id);
  if (pzArmed === id) { pzArmed = null; pzRenderTools(); $("#pzToolTip").textContent = ""; return; }
  if (!pzToolStock(id) && getGold() < t.cost) { pzMsg("GOLDが たりない。そろばんで かせごう！", "ng"); return; }
  pzArmed = id;
  pzRenderTools();
  $("#pzToolTip").textContent = t.n + "：" + t.tip + (pzToolStock(id) ? "" : "（つかうと " + t.cost + "G）");
}
// 道具をつかう（手数は へらない）
async function pzUseTool(i) {
  const id = pzArmed, t = PZ_TOOLS.find((x) => x.id === id);
  if (!t || !pz || pz.busy || pz.done) return false;
  if (!pz.cells[i]) { pzMsg("そこには つかえないよ", "ng"); return true; }
  const stock = pzToolStock(id);
  if (!stock) {
    if (getGold() < t.cost) { pzMsg("GOLDが たりないよ", "ng"); return true; }
    addGold(-t.cost);
  } else { const d = pzLoad(); d.items[id] = stock - 1; pzSave(d); }
  pzArmed = null;
  pz.busy = true;
  try {
  pzRenderTools(); $("#pzToolTip").textContent = "";
  pzDelay = new Map(); pzFxQ = [];
  const gone = new Set();
  if (id === "hammer") { gone.add(i); pzDelay.set(i, 0); pzFxQ.push({ fx: "ring", x: i % PZ_W, y: (i / PZ_W) | 0, r: 1, at: 0 }); }
  else {
    pz.cells[i].sp = id === "rocket" ? (Math.random() < 0.5 ? "rh" : "rv") : id;
    pzSync();
    await pzWait(180);
    pzBlast(pz.cells, i, gone, null, {});
  }
  const plan = { gone: Array.from(gone), delay: pzDelay, fx: pzFxQ };
  pzDelay = null; pzFxQ = [];
  try { bigFanfareSnd(); } catch (e) { }
  await pzPlayBlast(plan.gone, plan.delay, plan.fx);
  pzApplyPlan(plan);
  pzScoreAdd(plan.gone.length * 15);
  pzSync(); pzRenderHud();
  await pzWait(150);
  let chain = 0;
  while (await pzCascadeAnim(i, ++chain)) { if (chain > 30) break; }
  const win = pz.got >= pz.lv.need;
  if (win) pz.done = "win";
  if (!pz.done && !pzHasMove(pz.cells)) {          // 道具のあとに 手づまりでも 固まらない
    if (pzReshuffle()) { try { pzMsg("手づまり！ ならべ直したよ", "ok"); } catch (e) { } }
    else { pz.moves = 0; pz.done = "lose"; }
  }
  pzSync(); pzRenderHud(); pzRenderTools();
  if (pz.done) setTimeout(() => pzFinish(pz.done), 260);
  } finally { pz.busy = false; }                   // 何があっても 操作できる状態にもどす
  return true;
}
/* ---- レオ王の顔（のこり手数で 表情が変わる） ---- */
function pzKingFace() {
  const k = $("#pzKing"); if (!k || !pz) return;
  const src = pz.done === "win" ? "assets/king_celebrate.png"
    : pz.moves <= 3 ? "assets/king_staff.png"
      : pz.got >= pz.lv.need ? "assets/king_celebrate.png" : "assets/king_wave.png";
  if (!k.src.endsWith(src)) k.src = src;
  k.classList.toggle("worry", pz.moves <= 3 && !pz.done);
}

/* ---- 玉をえらぶ・入れかえる ---- */
async function pzTry(a, b) {
  if (!pz || pz.busy || pz.done) return;
  const s = pzBeginSwap(a, b);
  if (!s.ok) {
    // だめな入れかえは その場で 首をふる
    [a, b].forEach((i) => { const t = pz.cells[i]; const n = t && pzNodes[t.id]; if (n) { n.classList.add("no"); setTimeout(() => n.classList.remove("no"), 380); } });
    pz.sel = -1; pzSync();
    return;
  }
  pz.busy = true; pz.sel = -1;
  try {
  try { clickSnd(); } catch (e) { }
  pzSync();                     // 入れかえが すべって見える
  await pzWait(150);
  const plan = pzPlanSpecials(a, b);
  if (plan) {
    pz.comboText = typeof plan.label === "string" ? plan.label : "";
    if (pz.comboText) pzMsg(pz.comboText, "ok");
    try { bigFanfareSnd(); } catch (e) { }
    await pzPlayBlast(plan.gone, plan.delay, plan.fx);   // 飛んで → 通った所から こわれる
    pzApplyPlan(plan);
    pzScoreAdd(plan.gone.length * 15);
    pzSync(); pzRenderHud();
    await pzWait(150);
  }
  let chain = 0;
  while (await pzCascadeAnim(b, ++chain)) {
    if (chain >= 2) pzMsg(chain + "れんさ！", "ok");
    if (chain > 30) break;
  }
  const done = pzFinishTurn();
  pzSync(); pzRenderHud();
  if (done) setTimeout(() => pzFinish(done), 260);
  } finally { pz.busy = false; }              // 何があっても 操作できる状態にもどす
}
function pzAdj(a, b) { return Math.abs(a % PZ_W - b % PZ_W) + Math.abs(((a / PZ_W) | 0) - ((b / PZ_W) | 0)) === 1; }
/* ---- クリアの ごほうびの儀式（ここが いちばん うれしい所） ---- */
const PZ_CHEST_EVERY = 3;                                  // 何レベルごとに たからばこが出るか
function pzGiveItem(d, id, n) { d.items = d.items || {}; d.items[id] = (d.items[id] || 0) + (n || 1); }
async function pzCeremony(st, cleared) {
  const ov = $("#pzOver");
  ov.classList.remove("hidden");
  const d = pzLoad();
  // ① 見出し
  ov.innerHTML = '<div class="pz-res-h ' + (cleared ? "ok" : "ng") + '">' +
    (cleared ? "レベル " + pz.lv.n + " クリア！" : "手数ぎれ…") + "</div>" +
    '<div class="pz-stars" id="pzStarRow"></div>' +
    '<div class="pz-tally" id="pzTally"></div>' +
    '<div class="pz-gifts" id="pzGifts"></div>' +
    '<div class="pz-res-btns" id="pzBtns"></div>';
  if (!cleared) {
    $("#pzTally").innerHTML = 'あと <b>' + Math.max(0, pz.lv.need - pz.got) + "</b> こ だったね<br><span class=\"sub\">スコア " + (pz.score || 0).toLocaleString() + "</span>";
    try { wrongSnd(); } catch (e) { }
    pzCeremonyButtons(false);
    return;
  }
  // ② 星が1つずつ とんでくる
  const row = $("#pzStarRow");
  for (let i = 0; i < 3; i++) {
    const on = i < st;
    const sp = document.createElement("span");
    sp.className = "pz-star" + (on ? " on" : "");
    sp.textContent = on ? "★" : "☆";
    row.appendChild(sp);
    if (on) { sfx("star", function () { pzTone(4 + i * 3, true); }); sp.classList.add("fly"); }
    await pzWait(on ? 330 : 120);
  }
  // ③ スコアを かぞえ上げる
  const tal = $("#pzTally");
  const total = pz.score || 0;
  tal.innerHTML = 'スコア <b id="pzCount">0</b>';
  const cnt = $("#pzCount");
  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    cnt.textContent = Math.round(total * i / steps).toLocaleString();
    if (i % 3 === 0) pzTone(i, false);
    await pzWait(35);
  }
  cnt.textContent = total.toLocaleString();
  cnt.classList.add("pop");
  // ④ 星のたまり具合（メーター）
  d.star = (d.star || 0) + st;
  pzSave(d);
  const nextAt = Math.ceil(d.star / 9) * 9;
  tal.innerHTML += '<div class="pz-meter"><span>あつめた ★</span><b>' + d.star + "</b>" +
    '<i class="pz-meter-bar"><u style="width:' + Math.round((d.star % 9) / 9 * 100) + '%"></u></i>' +
    "<small>つぎの ごほうびまで あと " + Math.max(1, nextAt - d.star) + " ★</small></div>";
  await pzWait(420);
  // ⑤ たからばこ（3レベルごと）
  if (pz.lv.n % PZ_CHEST_EVERY === 0) {
    const gif = $("#pzGifts");
    gif.innerHTML = '<div class="pz-chest" id="pzChest">🎁</div><div class="sub">たからばこ！</div>';
    try { bigFanfareSnd(); } catch (e) { }
    await pzWait(700);
    const pick = PZ_ITEMS[Math.floor(Math.random() * PZ_ITEMS.length)];
    const num = 1 + (st >= 3 ? 1 : 0);
    pzGiveItem(d, pick.id, num); pzSave(d);
    $("#pzChest").classList.add("open");
    gif.innerHTML = '<div class="pz-chest open">🎁</div>' +
      '<div class="pz-gift-item">' + pick.em + " <b>" + pick.n + " ×" + num + "</b> を もらった！</div>" +
      '<div class="sub">つぎのレベルで タダで つかえるよ</div>';
    try { coinSnd(0); } catch (e) { }
    await pzWait(500);
  } else if (st >= 3) {
    pzGiveItem(d, PZ_ITEMS[0].id, 1); pzSave(d);
    $("#pzGifts").innerHTML = '<div class="pz-gift-item">★3 ボーナス！ 🚀 <b>ロケット ×1</b> を もらった！</div>';
    await pzWait(400);
  }
  pzCeremonyButtons(true);
}
function pzCeremonyButtons(cleared) {
  const g = getGold();
  $("#pzBtns").innerHTML =
    (g >= PZ_PLAY_COST ? '<button id="pzAgain" class="big-cta">▶ ' + (cleared ? "つぎの レベル" : "もう一度") + "（" + PZ_PLAY_COST + "G）</button>"
      : '<div class="pz-need">GOLDが たりない。そろばんで かせごう！</div>') +
    ' <button id="pzHome" class="ghost">やめる</button>';
  const ag = $("#pzAgain"); if (ag) ag.onclick = () => { pz = null; renderPuzzle(); };
  $("#pzHome").onclick = () => { pz = null; renderPuzzle(); };
}
/* 1面の終わり（記録は すぐ／演出は そのあと） */
function pzFinish(done) {
  const d = pzLoad(), st = pzStars();
  if (done === "win") {
    d.stars[pz.lv.n] = Math.max(d.stars[pz.lv.n] || 0, st);
    d.lv = Math.max(d.lv, pz.lv.n + 1);
    d.best = Math.max(d.best || 0, pz.lv.n);
    pzSave(d);
    fxCelebrate(st, "レベル " + pz.lv.n + " クリア！", st >= 3 ? "パーフェクト！ ★★★" : "よく がんばったね");
  } else {
    fxCheer("あと " + Math.max(0, pz.lv.need - pz.got) + " こ だった…", "つぎは いけるよ！");
  }
  (async () => {
    try {
      if (done === "win") await pzFinale();
      await pzCeremony(st, done === "win");
    } catch (e) {
      // 演出でつまずいても、先へ進めなくならないようにする
      const ov = $("#pzOver");
      ov.classList.remove("hidden");
      ov.innerHTML = '<div class="pz-res-h ' + (done === "win" ? "ok" : "ng") + '">' +
        (done === "win" ? "レベル " + pz.lv.n + " クリア！" : "手数ぎれ…") + '</div><div class="pz-res-btns" id="pzBtns"></div>';
      pzCeremonyButtons(done === "win");
    }
  })();
}
/* ---- あそぶ前の画面 ---- */
// 支払う GOLD（もらった持ちものは タダ）
function pzBuyCost() {
  const rec = pzLoad();
  return Object.keys(pzBuy).reduce(function (a, k) {
    const it = PZ_ITEMS.find((i) => i.id === k) || { cost: 0 };
    const stock = (rec.items && rec.items[k]) || 0;
    return a + Math.max(0, (pzBuy[k] || 0) - stock) * it.cost;
  }, 0);
}
function pzRenderLobby() {
  const d = pzLoad(), lv = pzLevel(d.lv), g = getGold();
  const face = lv.goal === "grass" ? '<i class="pz-fl sm"></i> 草を'
    : lv.goal === "box" ? '<i class="pz-bk box sm"></i> 箱を'
    : '<img class="pz-mini" src="assets/' + (PZ_IMG[lv.target] || PZ_IMG.dia) + '.png" alt=""> を';
  const items = PZ_ITEMS.map((it) => {
    const n = pzBuy[it.id] || 0;
    const stock = (d.items && d.items[it.id]) || 0;
    return '<div class="pz-item"><span class="pz-em">' + it.em + '</span><span class="pz-in"><b>' + it.n + "</b><small>" + it.tip + "</small></span>" +
      (stock ? '<span class="pz-stock">もっている ' + stock + '</span>' : '<span class="pz-ic">' + it.cost + "G</span>") +
      '<button class="pz-buy" data-it="' + it.id + '"' + (!stock && g < it.cost ? " disabled" : "") + ">＋</button>" +
      '<span class="pz-have">' + (n ? "×" + n : "") + "</span></div>";
  }).join("");
  const total = PZ_PLAY_COST + pzBuyCost();
  const stars = [];
  for (let i = Math.max(1, d.lv - 4); i < d.lv; i++) stars.push('<span class="pz-past">' + i + "：" + "★".repeat(d.stars[i] || 0) + "</span>");
  $("#pzLobby").innerHTML =
    '<div class="pz-lv-big">レベル <b>' + lv.n + "</b></div>" +
    '<div class="pz-goal-big">' + face + " <b>" + lv.need + "</b> こ　／　<b>" + lv.moves + "</b> 手 いない</div>" +
    (stars.length ? '<div class="pz-past-row">' + stars.join("") + "</div>" : "") +
    '<div class="pz-items-h">アイテム（GOLDで 買うと はじめから 盤に あるよ）</div>' + items +
    '<div class="pz-total">つかう GOLD：<b>' + total + "</b>　（もっている " + g.toLocaleString() + "）</div>" +
    (g >= total ? '<button id="pzGo" class="big-cta">▶ はじめる</button>'
      : '<div class="pz-need">GOLDが ' + (total - g) + " たりない。そろばんの れんしゅうで かせごう！</div>") +
    '<p class="sub">※ パズルでは GOLDは 増えません。GOLDが 増えるのは そろばんの れんしゅうと ランキングの ごほうびだけ。</p>';
  $$("#pzLobby .pz-buy").forEach((b) => {
    b.onclick = () => {
      const it = PZ_ITEMS.find((i) => i.id === b.dataset.it), rec = pzLoad();
      const stock = (rec.items && rec.items[it.id]) || 0;
      const used = pzBuy[it.id] || 0;
      if (used < stock) { pzBuy[it.id] = used + 1; return pzRenderLobby(); }   // もらった分は タダ
      const cur = pzBuyCost();
      if (getGold() < PZ_PLAY_COST + cur + it.cost) return pzMsg("GOLDが たりないよ", "ng");
      pzBuy[it.id] = Math.min(3, used + 1);
      pzRenderLobby();
    };
  });
  const go = $("#pzGo");
  if (go) go.onclick = () => {
    const cost = PZ_PLAY_COST + pzBuyCost();
    if (getGold() < cost) return pzMsg("GOLDが たりないよ", "ng");
    addGold(-cost);
    const rec = pzLoad(); rec.items = rec.items || {};
    const list = [];
    Object.keys(pzBuy).forEach((k) => {
      const used = pzBuy[k] || 0;
      const take = Math.min(used, rec.items[k] || 0);
      rec.items[k] = (rec.items[k] || 0) - take;                 // もらった分から先に つかう
      for (let i = 0; i < used; i++) list.push(k);
    });
    rec.plays = (rec.plays || 0) + 1; pzSave(rec);
    pzStart(pzLoad().lv, list);
    pzBuy = {};
    renderPuzzle();
  };
}
// はじめて出てくる仕掛けは、あそぶ前に 説明する
function pzTipFor(lv) {
  if (lv.goal === "grass") {
    tipOnce("pz-grass", "🌿 みどりの 草を はがそう",
      '<div class="tip-demo"><i class="pz-fl big"></i><span class="tip-ar">▶</span><i class="pz-fl big gone"></i></div>' +
      "<p><b>草のマスの上で、玉を3つ そろえる</b>と 草が はがれます。</p>" +
      "<p>草そのものを 動かすことは できません。<b>草の上に ある玉</b>を そろえるのが コツ。</p>" +
      "<p>ロケットや TNT で ふきとばしても はがれます。</p>");
  } else if (lv.goal === "box") {
    tipOnce("pz-box", "📦 木箱を こわそう",
      '<div class="tip-demo"><i class="pz-bk box big"></i><span class="tip-ar">▶</span><i class="pz-bk box big gone"></i></div>' +
      "<p><b>箱の となりで 玉を そろえる</b>と こわれます。箱の上では そろえられません。</p>" +
      "<p>箱は 動かせず、玉も 通りぬけできません。</p>" +
      "<p><b>石の箱</b>は かたいので <b>2回</b> こわす ひつようが あります。</p>");
  }
}
function renderPuzzle() {
  const lob = $("#pzLobby"), brd = $("#pzPlay"), ov = $("#pzOver");
  if (!lob) return;
  $("#pzGold").textContent = getGold().toLocaleString();
  ov.classList.add("hidden"); ov.innerHTML = "";
  if (!pz || pz.done) {
    lob.classList.remove("hidden"); brd.classList.add("hidden");
    pzNodes = {}; const b = $("#pzBoard"); if (b) b.innerHTML = "";
    pzRenderLobby();
  } else {
    lob.classList.add("hidden"); brd.classList.remove("hidden");
    bgmForView("puzzle", true);                // ステージごとに 曲を送る
    pzArmed = null;
    pzResetBoard(); pzRenderHud(); pzRenderTools();
    pzTipFor(pz.lv);
  }
  renderGoldPill();
}
/* ---- 指でなぞって入れかえる（ロイヤルマッチと同じ感じ） ---- */
(function () {
  const el = $("#pzBoard"); if (!el) return;
  let from = -1, prev = -1, sx = 0, sy = 0, moved = false;
  const cellOf = (ev) => { const t = ev.target.closest ? ev.target.closest(".pz-t") : null; return t ? +t.dataset.i : -1; };
  el.addEventListener("pointerdown", (ev) => {
    if (!pz || pz.busy || pz.done) return;
    const i = cellOf(ev); if (i < 0) return;
    if (pzArmed) { from = -1; prev = -1; pzUseTool(i); return; }      // 道具をかまえているとき
    prev = pz.sel; from = i; sx = ev.clientX; sy = ev.clientY; moved = false;
    pz.sel = i; pzSync();
  });
  el.addEventListener("pointermove", (ev) => {
    if (from < 0 || moved || !pz || pz.busy) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
    moved = true;
    const x = from % PZ_W, y = (from / PZ_W) | 0;
    let nx = x, ny = y;
    if (Math.abs(dx) > Math.abs(dy)) nx += dx > 0 ? 1 : -1; else ny += dy > 0 ? 1 : -1;
    const f = from; from = -1; prev = -1;
    if (!pzIn(nx, ny)) { pz.sel = -1; pzSync(); return; }
    pzTry(f, pzIdx(nx, ny));                    // なぞった向きへ 入れかえ
  });
  el.addEventListener("pointerup", () => {
    if (from < 0 || moved) { from = -1; return; }
    const i = from; from = -1;
    if (prev >= 0 && prev !== i && pzAdj(prev, i)) { pzTry(prev, i); return; }   // 2回タップでも 入れかえ
    prev = -1;
  });
  el.addEventListener("pointercancel", () => { from = -1; });
})();
$("#pzQuit").addEventListener("click", function () {
  if (pz && !pz.done && !confirm("やめる？（つかった GOLDは もどりません）")) return;
  pz = null; renderPuzzle();
});

/* ---------- キーボード ---------- */
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  if (!$("#view-grades").classList.contains("hidden")) {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { moveGrade(1); e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { moveGrade(-1); e.preventDefault(); }
    else if (e.key === "Enter") { startSession(subject); e.preventDefault(); }
  } else if (!$("#view-play").classList.contains("hidden")) {
    if (session && session.paused) return; // 一時停止中はキー操作を受け付けない
    if (session && session.answerBy === "soroban") {
      if (e.key === "Enter") { submitAnswer(currentSorobanAnswer()); e.preventDefault(); }
      else sorobanQuiz.handleKey(e);
    }
  } else if (!$("#view-battle").classList.contains("hidden")) {
    // たいせん中も そろばんを数字キーで動かせる
    if (battle && battle.running && battleUsesSoroban()) {
      if (e.key === "Enter") { battleAnswer(currentBattleAnswer()); e.preventDefault(); }
      else sorobanBattle.handleKey(e);
    }
  }
});

/* ---------- ホーム操作 ---------- */
$("#homeStartBtn").addEventListener("click", () => startRoutine(homeGrade()));
$("#homeToKingdom").addEventListener("click", () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="puzzle"]')); });
$("#homeToRecords").addEventListener("click", () => { showView("records"); setActiveNav(document.querySelector('.nav[data-view="records"]')); });

/* ---------- 初期化 ---------- */
renderGrid();
updateInfo();
renderProfile();
renderSound();
renderGoldPill();
showView("home");
setActiveNav(document.querySelector('.nav[data-view="home"]'));
