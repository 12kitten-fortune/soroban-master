const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const COLS = 23, ONES_COL = 11, BH = 20;
const isUnitPoint = (c) => (c - ONES_COL) % 3 === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepUntil = (t) => new Promise((r) => setTimeout(r, Math.max(0, t - performance.now()))); // 絶対時刻まで待つ（ドリフト防止）
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// onQuizChange が初期化時（makeSoroban生成時）に参照するため、先に宣言してTDZを回避
let session = null, playTimer = null;
// 効果音のON/OFF（localStorageに保存）
const SOUND_KEY = "soroban_sound";
let soundOn = localStorage.getItem(SOUND_KEY) !== "off";
const BUILD = "2026-09-04-17"; // 最新反映の確認用

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
const BUILD_DEFS = {
  land:    { name: "土地",        icon: "🟩", base: 100, grow: 60, max: 12, lvl: true, desc: "王国を広げる" },
  house:   { name: "家",          icon: "🏠", base: 60,  grow: 70, max: 5,  lvl: true, desc: "アップグレードで大きく" },
  road:    { name: "道",          icon: "🛣️", base: 80,  max: 1, desc: "王国をつなぐ" },
  bridge:  { name: "橋",          icon: "🌉", base: 150, max: 1, desc: "川をわたる" },
  school:  { name: "学校",        icon: "🏫", base: 300, max: 1, desc: "みんなが学ぶ" },
  library: { name: "図書館",      icon: "📚", base: 500, max: 1, desc: "知恵をたくわえる" },
  dojo:    { name: "そろばん道場", icon: "⛩️", base: 800, max: 1, desc: "王国のシンボル" },
};
const BUILD_ORDER = ["land", "house", "road", "bridge", "school", "library", "dojo"];
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
function ownedOf(key, k) { k = k || loadKingdom(); if (key === "land") return k.land; if (BUILD_DEFS[key].lvl) return k.b[key] || 0; return k.b[key] ? 1 : 0; }
function priceOf(key, k) { k = k || loadKingdom(); const d = BUILD_DEFS[key]; if (key === "land") return d.base + (k.land - 1) * d.grow; if (d.lvl) return d.base + Math.max(0, (k.b[key] - 1)) * d.grow; return d.base; }
const maxedOf = (key) => ownedOf(key) >= BUILD_DEFS[key].max;
function kingdomLevel(k) { k = k || loadKingdom(); const b = k.b || {}; return 1 + (k.land - 1) + Math.max(0, (b.house || 1) - 1) + (b.road || 0) + (b.bridge || 0) + (b.school || 0) + (b.library || 0) + (b.dojo || 0); }
function buyBuild(key) {
  const k = loadKingdom(), d = BUILD_DEFS[key];
  if (maxedOf(key)) return { ok: false, why: "max" };
  const p = priceOf(key, k); if (k.gold < p) return { ok: false, why: "gold", need: p - k.gold };
  k.gold -= p;
  if (key === "land") k.land++; else if (d.lvl) k.b[key] = (k.b[key] || 0) + 1; else k.b[key] = 1;
  saveKingdom(k); return { ok: true, spent: p };
}
// 学習成果に応じたGOLD（正解・正答率・自己ベスト・完走）
function goldForSection({ correct, N, bestUpdated, completed }) {
  let g = correct * 2; const lines = [`正解 ${correct}問 ＋${correct * 2}`];
  const acc = N ? correct / N : 0;
  if (acc >= 0.9) { g += 20; lines.push("高正答率(90%↑) ＋20"); }
  else if (acc >= 0.7) { g += 10; lines.push("正答率(70%↑) ＋10"); }
  if (bestUpdated) { g += 30; lines.push("⏱ 自己ベスト更新 ＋30"); }
  if (completed) { g += 10; lines.push("完走 ＋10"); }
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
  const k = loadKingdom(); let best = null;
  for (const key of BUILD_ORDER) { if (maxedOf(key)) continue; const p = priceOf(key, k); if (best == null || p < best.p) best = { p, name: BUILD_DEFS[key].name }; }
  if (!best) return "王国はすべて完成！すごい！";
  const need = best.p - k.gold;
  return need > 0 ? `あと ${need} GOLD で「${best.name}」が買えるよ！` : `「${best.name}」が買えるよ！🏰 王国を見よう`;
}

/* ---------- 学習セッションの記録（保護者画面・成績用） ---------- */
const SESSIONS = "soroban_sessions";
function logSession(subj, N, correct, sumSec, pauses) {
  const l = JSON.parse(localStorage.getItem(SESSIONS) || "[]");
  l.push({ d: today(), subj, N, correct, sec: Math.round(sumSec), avg: N ? +(sumSec / N).toFixed(2) : 0, pauses: pauses || 0 });
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
function clickSnd() { // 珠が弾く「パチ」
  if (!soundOn) return;
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
function correctSnd() { try { const c = ensureAudio(), t = c.currentTime; tone(880, t, 0.12, "sine", 0.2); tone(1174, t + 0.12, 0.2, "sine", 0.2); } catch {} } // ピンポン♪
function wrongSnd() { try { const c = ensureAudio(), t = c.currentTime; tone(196, t, 0.3, "square", 0.13); tone(184, t, 0.3, "square", 0.1); } catch {} } // ブブー
function neutralSnd() { try { const c = ensureAudio(), t = c.currentTime; tone(680, t, 0.08, "triangle", 0.1); } catch {} }
function fanfareSnd() { try { const c = ensureAudio(), t = c.currentTime;[523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.1, 0.18, "sine", 0.17)); } catch {} }
// GOLDをもらったとき「チャリーン♪」
function coinSnd(delay = 0) {
  try {
    const c = ensureAudio(), t = c.currentTime + delay;
    [1568, 2093, 2637].forEach((f, i) => tone(f, t + i * 0.045, 0.20, "triangle", 0.12));
    tone(3136, t + 0.10, 0.34, "sine", 0.06); // きらめきの余韻
  } catch {}
}
// 大きな達成のとき「タタタ ターン！」
function bigFanfareSnd() {
  try {
    const c = ensureAudio(), t = c.currentTime;
    [[523, 0], [523, 0.13], [523, 0.26], [659, 0.40], [784, 0.58]].forEach(([f, d]) => tone(f, t + d, 0.15, "triangle", 0.16));
    tone(1047, t + 0.76, 0.55, "triangle", 0.18);
    tone(784, t + 0.76, 0.55, "sine", 0.10);  // 和音でぶ厚く
    tone(659, t + 0.76, 0.55, "sine", 0.08);
  } catch {}
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
  function renderCol(c) { const { heaven, earth } = refs[c]; heaven.style.top = (state[c].heaven ? BH + 2 : 2) + "px"; const e0 = BH * 2 + 9; for (let j = 0; j < 4; j++) earth[j].style.top = e0 + (j < state[c].earth ? j : j + 1) * BH + "px"; }
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
const TITLES = { home: "ホーム", grades: "級・段を選ぶ", play: "れんしゅう", today: "本日の練習", kingdom: "王国", battle: "たいせん", parent: "保護者", records: "記録を見る", settings: "設定・プロフィール", lesson: "検定内容・解き方" };
function showView(v) {
  $$(".view").forEach((el) => el.classList.toggle("hidden", el.id !== "view-" + v));
  $("#pageTitle").textContent = TITLES[v] || "";
  if (v === "home") renderHome();
  if (v === "records") renderRecords();
  if (v === "settings") renderSettings();
  if (v === "today") renderToday();
  if (v === "kingdom") renderKingdom();
  if (v === "battle") renderBattle();
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
function renderSound() { $("#soundToggle").textContent = soundOn ? "🔊 音あり" : "🔇 音なし"; }
$("#soundToggle").addEventListener("click", () => {
  soundOn = !soundOn;
  localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
  renderSound();
  if (soundOn) clickSnd(); // ONにしたら確認音
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
function renderGoldPill() { const el = $("#goldPill"); if (el) el.textContent = `👑 ${getGold().toLocaleString()} G`; }
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
  renderGoldPill();
}
const imgTile = (src, label) => `<div class="ktile bld"><img class="kimg" src="assets/${src}" alt="${label}" /><span class="kl">${label}</span></div>`;
const emojiTile = (ic, label) => `<div class="ktile bld"><span class="ki">${ic}</span><span class="kl">${label}</span></div>`;
function kingdomBoardHTML(k) {
  const t = [];
  t.push(imgTile("castle.png", "王城"));
  t.push(imgTile(k.b.house >= 3 ? "house_brown.png" : "house_green.png", `家 Lv.${k.b.house}`));
  if (k.b.road) t.push(emojiTile("🛣️", "道"));
  if (k.b.bridge) t.push(emojiTile("🌉", "橋"));
  if (k.b.school) t.push(imgTile("school.png", "学校"));
  if (k.b.library) t.push(emojiTile("📚", "図書館"));
  if (k.b.dojo) t.push(imgTile("dojo.png", "そろばん道場"));
  for (let i = 0; i < Math.max(0, k.land - 1); i++) t.push('<div class="ktile grass">🌳</div>');
  return t.join("");
}
function renderShop() {
  const k = loadKingdom();
  $("#shopList").innerHTML = BUILD_ORDER.map((key) => {
    const d = BUILD_DEFS[key], own = ownedOf(key, k), max = maxedOf(key), p = priceOf(key, k), afford = k.gold >= p;
    const ownTxt = (d.lvl || key === "land") ? `Lv.${own}/${d.max}` : (own ? "建設ずみ" : "未建設");
    const btn = max ? "<button disabled>MAX</button>" : `<button class="buy" data-key="${key}"${afford ? "" : " disabled"}>${p} G</button>`;
    return `<div class="shop-item"><span class="si-ic">${d.icon}</span><div class="si-main"><b>${d.name}</b><span class="sub">${d.desc}・${ownTxt}</span></div>${btn}</div>`;
  }).join("");
  $$("#shopList .buy").forEach((b) => b.addEventListener("click", () => {
    const r = buyBuild(b.dataset.key);
    if (r.ok) { coinSnd(); fanfareSnd(); $("#shopMsg").textContent = `「${BUILD_DEFS[b.dataset.key].name}」を建てました！🎉`; renderKingdom(); }
    else if (r.why === "gold") $("#shopMsg").textContent = `GOLDが ${r.need} たりません。そろばんを練習しよう！`;
  }));
}
function renderKingdom() {
  const k = loadKingdom();
  $("#kdLevel").textContent = kingdomLevel(k);
  $("#kdGold").textContent = k.gold.toLocaleString();
  $("#kingdomBoard").innerHTML = kingdomBoardHTML(k);
  $("#shopMsg").textContent = "";
  renderShop(); renderGoldPill();
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
function renderSettings() {
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

/* ============================================================ セッション */
function startSession(subj) {
  const grade = currentGrade();
  if (subj === "flash") return startFlash(grade);
  if (!difficulty(grade, subj)) { alert("この級にはこの種目がありません"); return; }
  const cf = SUBJECT[subj];
  session = { subj, grade, cf, N: cf.N, idx: 0, correct: 0, answerBy: cf.answer, timed: $("#timerToggle").checked, mode: $("#examMode").checked ? "end" : "each", results: [], locking: false, start: performance.now(), cur: null, paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0 };
  $("#playMark").classList.add("hidden");
  $("#pauseBtn").classList.remove("hidden"); setPauseUI(false);
  showView("play");
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", cf.answer !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", cf.answer !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.toggle("hidden", subj !== "anzan"); // あんざんのときだけコツを出す
  $("#showSteps").style.display = ["mitori", "kake", "wari"].includes(subj) ? "" : "none";
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
  session.cur = genProblemFor(session.grade, session.subj);
  stepCtx = { subj: session.subj, cur: session.cur }; // 解き方用（完了後も参照できるよう保持）
  $("#playProblem").textContent = session.cur.display;
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
  session.results.push({ ok, compact: session.cur.compact || "", user: Number.isFinite(val) ? val : "—", ans: session.cur.answer, t: qt });
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
  let cls = "ok", bestUpdated = false;
  touchStreak(); // streak更新（GOLD連続ボーナスの前に）
  if (completed) {
    const r = saveTime(session.grade.key, session.subj, el); bestUpdated = r.improved;
    logStudy(el); logSession(session.subj, session.N, session.correct, el, session.pauseCount);
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
  if (completed) { // GOLDは学習の成果としてのみ付与
    const { g, lines } = goldForSection({ correct: session.correct, N: session.N, bestUpdated, completed });
    let earned = g; const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; lines.push(`🔥 ${daily.label} ＋${daily.amt}`); }
    addGold(earned);
    msg += `<div class="gold-earn">👑 <b>＋${earned} GOLD</b><div class="gold-lines">${lines.join("・")}</div><div class="goal">${nextGoalHint()}</div></div>`;
  }
  renderProfile();
  if (session.timed) { (session.correct * cf.per >= cf.pass) ? bigFanfareSnd() : wrongSnd(); }
  else if (completed) fanfareSnd();
  if (completed) coinSnd(1.0); // GOLD獲得の「チャリーン」はファンファーレの後に
  msg += `<br><button id="againBtn">もう一度</button> <button id="toKingdomBtn">🏰 王国を見る</button> <button id="homeBtn" class="ghost">級・段選択へ</button>`;
  const passed = session.timed ? (session.correct * cf.per >= cf.pass) : completed;
  const face = passed ? "king_celebrate.png" : "king_wave.png";
  const badge = bestUpdated ? '<span class="badge-chip best">⏱ 自己ベスト更新！</span>'
    : (session.timed && passed ? '<span class="badge-chip perfect">🎓 ごうかく！</span>' : "");
  msg = `<div class="result-hero"><img class="rh-face" src="assets/${face}" alt="レオ王" />${badge ? `<span class="rh-badge">${badge}</span>` : ""}</div>` + msg;
  $("#playResult").innerHTML = msg; $("#playResult").className = "result " + cls;
  $("#playProblem").textContent = "おつかれさま！";
  const subj = session.subj; session = null;
  $("#againBtn").onclick = () => startSession(subj);
  const tk = $("#toKingdomBtn"); if (tk) tk.onclick = () => { showView("kingdom"); setActiveNav(document.querySelector('.nav[data-view="kingdom"]')); };
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
  session = { subj: step.subj, grade, cf, N: step.N, idx: 0, correct: 0, answerBy: cf.answer, timed: !!step.timed, mode: "end", results: [], locking: false, start: performance.now(), cur: null, routine: true, label: step.label, paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0 };
  $("#playMark").classList.add("hidden");
  $("#pauseBtn").classList.remove("hidden"); setPauseUI(false);
  showView("play");
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", cf.answer !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", cf.answer !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.toggle("hidden", step.subj !== "anzan");
  $("#showSteps").style.display = ["mitori", "kake", "wari"].includes(step.subj) ? "" : "none";
  const total = routineState.steps.filter((s) => s.rest == null).length;
  const done = routineState.steps.slice(0, routineState.stepIdx).filter((s) => s.rest == null).length;
  $("#playGrade").textContent = `本日の練習 ${done + 1}/${total}：${step.label}`;
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  playTimer = setInterval(tickPlay, 150);
  nextPlayProblem();
}
function finishRoutineSection() {
  const el = playElapsed();
  routineState.sections.push({ label: session.label, correct: session.correct, N: session.N, sec: el, items: session.results });
  logSession(session.subj, session.N, session.correct, el, session.pauseCount);
  const { g } = goldForSection({ correct: session.correct, N: session.N, bestUpdated: false, completed: true });
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
  $("#restResult").innerHTML = last ? sectionResultHTML(last) : "";
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
  const goldBlock = `<div class="gold-earn">👑 <b>＋${earned} GOLD</b><div class="gold-lines">${goldLines.join("・")}</div><div class="goal">${nextGoalHint()}</div></div>`;
  const routineBadge = acc >= 90 ? '<span class="badge-chip perfect">★ パーフェクト！</span>' : '<span class="badge-chip">🏁 コンプリート！</span>';
  const routineHero = `<div class="result-hero"><img class="rh-face" src="assets/king_celebrate.png" alt="レオ王" /><span class="rh-badge">${routineBadge}</span></div>`;
  $("#playResult").innerHTML = `${routineHero}<div class="marks">正答率 ${acc}%（${totalCorrect}/${totalN}）</div>${rows}<div class="sub">合計タイム ${fmtClock(totalTime)}</div>${goldBlock}${detail}<br><button id="toKingdomBtn2">🏰 王国を見る</button> <button id="toRecordsBtn">📊 グラフを見る</button> <button id="routineHomeBtn" class="ghost">本日の練習へ</button>`;
  $("#toKingdomBtn2").onclick = () => { showView("kingdom"); setActiveNav(document.querySelector('.nav[data-view="kingdom"]')); };
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
let flashExam = { on: false, idx: 0, N: 20, correct: 0 };
function startFlash(grade) {
  flashSpec = difficulty(grade, "flash"); flashGrade = grade; session = null;
  hidePauseUI();
  showView("play");
  $("#playRest").classList.add("hidden"); $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden"); $("#playFlashWrap").classList.remove("hidden");
  $("#anzanTip").classList.remove("hidden"); // フラッシュ暗算でもコツを出す
  $("#playGrade").textContent = `${grade.key}／フラッシュ暗算`; $("#playTimer").textContent = ""; $("#playProgress").textContent = ""; $("#playProblem").textContent = "";
  $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashInfo").textContent = `${grade.key}：${flashSpec.digits}桁 ${flashSpec.terms}口 / 1個 ${(flashPaceMs(grade) / 1000).toFixed(1)}秒ずつ`;
  $("#flashMeasure").textContent = ""; $("#flashSignal").classList.add("hidden"); $("#flashDots").innerHTML = "";
  $("#flashDisplay").textContent = "▶ を押してスタート"; $("#flashDisplay").className = "flash-display"; $("#flashForm").classList.add("hidden");
  flashExam = { on: $("#flashExamMode").checked, idx: 0, N: 20, correct: 0 };
}
$("#flashStart").addEventListener("click", () => { flashExam.on = $("#flashExamMode").checked; runFlash(); });
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
  $("#flashProgress").textContent = flashExam.on ? `検定 ${flashExam.idx + 1} / ${flashExam.N}　正解 ${flashExam.correct}` : "";

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
  $("#flashStart").disabled = false; flashBusy = false;
}
$("#flashForm").addEventListener("submit", (e) => {
  e.preventDefault(); if (flashAnswer === null) return;
  const ok = parseInt($("#flashInput").value, 10) === flashAnswer; const res = $("#playResult"); $("#flashForm").classList.add("hidden");
  // 上の「= ?」を消して、大きく○×＋音（達成感）
  $("#flashDisplay").textContent = ok ? "⭕" : "❌";
  $("#flashDisplay").className = "flash-display " + (ok ? "ok" : "ng");
  ok ? correctSnd() : wrongSnd();
  if (flashExam.on) {
    if (ok) flashExam.correct++; flashExam.idx++;
    if (flashExam.idx < flashExam.N) { res.textContent = ok ? "正解！" : `おしい（答え: ${flashAnswer.toLocaleString()}）`; res.className = "result " + (ok ? "ok" : "ng"); setTimeout(runFlash, 900); }
    else {
      const score = flashExam.correct * 10, pass = score >= 140;
      let msg = `検定結果：${flashExam.correct}/20 正解　<b>${score}点 / 200点</b><br>${pass ? "🎉 合格！" : "不合格（140点以上で合格）"}`;
      if (pass) { touchStreak(); certify(flashGrade.key); msg += `<br>🎓 ${flashGrade.key} 認定！`; bigFanfareSnd(); }
      logSession("flash", 20, flashExam.correct, 0);
      const { g } = goldForSection({ correct: flashExam.correct, N: 20, bestUpdated: false, completed: true });
      let earned = g + (pass ? 50 : 0); const daily = dailyBonusOnce(); if (daily) earned += daily.amt;
      addGold(earned);
      msg += `<div class="gold-earn">👑 ＋${earned} GOLD<div class="goal">${nextGoalHint()}</div></div>`;
      renderProfile(); res.innerHTML = msg; res.className = "result " + (pass ? "ok" : "ng"); $("#flashProgress").textContent = "";
    }
  } else { res.textContent = ok ? "正解！すごい！" : `おしい（答え: ${flashAnswer.toLocaleString()}）`; res.className = "result " + (ok ? "ok" : "ng"); if (ok) touchStreak(); }
});

/* ============================================================ たいせん（CPU対戦ゲーム／レオ王） */
let battle = null, battleTimer = null;
// 敵のHPは級によらず一定（難易度は出題される問題そのもので調整済み）
const ENEMY_HP = 3;
const PLAYER_HP = 4; // まちがえると♥が1つへる。0になったらアウト
// 1匹たおすごとに次の敵へ（6体を順番にくり返す）
const ENEMIES = [
  { file: "enemy_slime.png", name: "スライムおう" },
  { file: "enemy_bat.png", name: "こうもり" },
  { file: "enemy_rock.png", name: "いわゴーレム" },
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
      battleFx(`たおした！ ＋${GOLD_PER_KILL} GOLD`, "kill");
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
  let earned = kills * GOLD_PER_KILL;
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
    (battle.you > 0 ? `<div class="gold-earn">👑 ＋${earned} GOLD<div class="gold-lines">${kills}ぴき × ${GOLD_PER_KILL} GOLD</div><div class="goal">${nextGoalHint()}</div></div>` : '<p class="sub">3回せいかいすると てきを たおせるよ！</p>') +
    `<br><button id="battleAgain">もう一度</button> <button id="battleToKingdom" class="ghost">🏰 王国を見る</button>`;
  renderProfile();
  $("#battleAgain").onclick = () => renderBattle();
  $("#battleToKingdom").onclick = () => { showView("kingdom"); setActiveNav(document.querySelector('.nav[data-view="kingdom"]')); };
}
$("#battleStart").addEventListener("click", startBattle);
$("#battleForm").addEventListener("submit", (e) => { e.preventDefault(); battleAnswer(parseInt($("#battleInput").value, 10)); });
$("#battleAnswerBtn").addEventListener("click", () => battleAnswer(currentBattleAnswer()));
$("#battleQuit").addEventListener("click", () => { if (battleTimer) { clearInterval(battleTimer); battleTimer = null; } battle = null; renderBattle(); });

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
$("#homeToKingdom").addEventListener("click", () => { showView("kingdom"); setActiveNav(document.querySelector('.nav[data-view="kingdom"]')); });
$("#homeToRecords").addEventListener("click", () => { showView("records"); setActiveNav(document.querySelector('.nav[data-view="records"]')); });

/* ---------- 初期化 ---------- */
renderGrid();
updateInfo();
renderProfile();
renderSound();
renderGoldPill();
showView("home");
setActiveNav(document.querySelector('.nav[data-view="home"]'));
