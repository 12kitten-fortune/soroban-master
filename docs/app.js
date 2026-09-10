const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
// そろばんの桁：整数11桁＋小数4桁。桁を減らしたぶん、1桁を大きく表示できる
const COLS = 15, ONES_COL = 10;
const isUnitPoint = (c) => (c - ONES_COL) % 3 === 0;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// onQuizChange が初期化時（makeSoroban生成時）に参照するため、先に宣言してTDZを回避
let session = null, playTimer = null;
// 効果音のON/OFF（localStorageに保存）
const SOUND_KEY = "soroban_sound";
let soundOn = localStorage.getItem(SOUND_KEY) !== "off";
const BUILD = "2026-09-11-300"; // 最新反映の確認用

/* ============================================================ 検定基準（級） */
// 珠算（公開されている珠算検定の出題例に準拠）。かけ算は9級から、わり算は7級から、10級以下は見取算のみ
// 珠算：公開されている珠算検定の出題例から抽出した実測値（★＝全級の出題例で確認済み）。
// 13〜10級のみとりが同じ2桁5口なのは出題例どおり（級の差はかけ算・わり算で付く）。
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
  // 10〜15級は「桁と口数の組み合わせ」が出題例で決まっている。桁と口数を別々に振ると
  // 出題例に無い組み合わせ（例：10級の2桁7口）が出てしまうため、必ず variants で対にする。
  // 1枚の中で1〜5番=5口・6〜10番=6口と変わる級は termsMax で表す。
  10: { mitori: { variants: [{ digits: 1, terms: 7 }, { digits: 2, terms: 5 }] }, kake: null, wari: null },        // ★A=1桁7口／B・C=2桁5口
  11: { mitori: { digits: 2, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★A・Bとも2桁
  12: { mitori: { digits: 2, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★A・Bとも2桁
  13: { mitori: { digits: 2, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★2桁
  14: { mitori: { variants: [{ digits: 1, terms: 5, termsMax: 6 }, { digits: 2, terms: 5, termsMax: 6 }] }, kake: null, wari: null }, // ★A=1桁／B=2桁
  15: { mitori: { digits: 1, terms: 5, termsMax: 6 }, kake: null, wari: null },                                    // ★A・Bとも1桁
};
// 暗算（みとり暗算）：同じく出題例の実測値。低い級は出題例どおり ひき算を含めない
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
// フラッシュ暗算 段位（一般的な段位の基準。初段/二/五/七/十段は指定値、三・四・八・九段は補間、六段=3桁12口8秒）
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
/* SK検定（このサイト独自の 検定）。珠算＝みとり・かけ・わり を つづけて、暗算＝あんざん 1しゅもく */
const EXAMS = "soroban_exams";
const EXAM_TRACKS = {
  soroban: { name: "珠算", subjs: ["mitori", "kake", "wari"] },
  anzan: { name: "暗算", subjs: ["anzan"] },
};
let examState = null, examTimer = null;

/* ---------- 級・段ラダー（20級〜十段） ---------- */
const GRADES = [];
for (let k = 20; k >= 1; k--) GRADES.push({ key: `${k}級`, band: "kyu", kyu: k });
["初段", "二段", "三段", "四段", "五段", "六段", "七段", "八段", "九段", "十段"].forEach((n, i) => GRADES.push({ key: n, band: "dan", dan: i + 1 }));
let gradeIdx = GRADES.findIndex((g) => g.key === "20級");   // はじめての子は いちばん やさしい級から
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
  const D = digits, lo = Math.max(1, D - 2); // 各項の桁数を lo〜D で混在（出題例に準拠してやさしめに）
  // 出題例は1枚の中で口数が変わる級があるため terms〜termsMax から選ぶ
  const T = termsMax && termsMax > terms ? terms + Math.floor(Math.random() * (termsMax - terms + 1)) : terms;
  // sub:false の級（暗算7〜10級など）は出題例どおり ひき算を出さない
  const allowSub = sub !== false && T >= 3; const nums = []; let total = 0;
  // 出題例は必ずその級の桁数の数が入っているので、1つは必ずD桁にする
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
/* 保存データの版。中身の形を変えたときは この番号を上げる。
   版が違うデータが残っていると 表示が壊れるので、古い版は 一度だけ ぜんぶ消す。 */
const DATA_VER = "2";
const VER_KEY = "soroban_ver";
(function () {
  try {
    if (localStorage.getItem(VER_KEY) === DATA_VER) return;
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("soroban_") === 0) dead.push(k); }
    dead.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(VER_KEY, DATA_VER);
  } catch (e) { console.error("保存データの版の確認に失敗", e); }
})();
const STAT = "soroban_stats", RANK = "soroban_rank", TIMES = "soroban_times", LOG = "soroban_log", PROFILE = "soroban_profile";
const loadStat = () => JSON.parse(localStorage.getItem(STAT) || '{"streak":0,"lastDate":""}');
const saveStat = (s) => localStorage.setItem(STAT, JSON.stringify(s));
const today = () => new Date().toISOString().slice(0, 10);
function touchStreak() {
  const s = loadStat(), t = today();
  if (s.lastDate !== t) { const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10); s.streak = s.lastDate === y ? s.streak + 1 : 1; s.lastDate = t; saveStat(s); }
}
const CERTS = "soroban_certs";
const allCerts = () => { try { return JSON.parse(localStorage.getItem(CERTS) || "[]"); } catch (e) { return []; } };
function certify(gradeKey, subj) {
  const idx = GRADES.findIndex((g) => g.key === gradeKey);
  const cur = JSON.parse(localStorage.getItem(RANK) || "null");
  if (!cur || idx > cur.idx) localStorage.setItem(RANK, JSON.stringify({ key: gradeKey, idx }));
  // 合格証（同じ級・同じ種目は 1枚）
  const list = allCerts();
  let c = list.find((x) => x.g === gradeKey && x.subj === subj);
  if (!c) { c = { g: gradeKey, subj: subj || "mitori", d: today(), no: list.length + 1 }; list.push(c); try { localStorage.setItem(CERTS, JSON.stringify(list)); } catch (e) { console.error("合格証の保存に失敗", e); } }
  renderProfile();
  setTimeout(() => showCert(c), 1800);          // お祝いの花火のあとに 出す
}
/* 合格証を 大きく出す。印刷して かべに はれる／LINE などで おくれる */
function showCert(c) {
  const p = profile();
  const old = $("#certLayer"); if (old) old.remove();
  const d = document.createElement("div");
  d.id = "certLayer";
  const dateJa = (() => { const [y, m, dd] = c.d.split("-"); return y + "年" + (+m) + "月" + (+dd) + "日"; })();
  d.innerHTML = '<div class="cert">' +
    '<div class="cert-top"><img class="cert-crown" src="assets/crown.png" alt=""><div class="cert-title">合 格 証</div></div>' +
    '<div class="cert-name">' + p.name + '<small>殿</small></div>' +
    '<div class="cert-body">そろばんキングダム <b>' + c.g + '</b>（' + subjName(c.subj) + '）の けんていに<br>ごうかくしたことを ここに 証します。</div>' +
    '<div class="cert-date">' + dateJa + '　第 ' + (c.no || 1) + ' 号</div>' +
    '<div class="cert-king"><img src="assets/king_celebrate.png" alt="レオ王"><span>そろばんキングダム 国王 レオ</span></div>' +
    '</div>' +
    '<div class="cert-btns"><button id="certPrint">🖨 いんさつ する</button><button id="certShare">📤 おくる</button><button id="certClose" class="ghost">とじる</button></div>';
  document.body.appendChild(d);
  $("#certClose").onclick = () => d.remove();
  $("#certPrint").onclick = () => {
    document.body.classList.add("print-cert");
    try { window.print(); } catch (e) { console.error("印刷に失敗", e); }
    setTimeout(() => document.body.classList.remove("print-cert"), 500);
  };
  $("#certShare").onclick = async () => {
    const text = p.name + " が そろばんキングダム " + c.g + "（" + subjName(c.subj) + "）の けんていに ごうかくしました！🎓 " + dateJa;
    try {
      if (navigator.share) await navigator.share({ title: "合格証", text: text, url: location.href.split("#")[0] });
      else { await navigator.clipboard.writeText(text + " " + location.href.split("#")[0]); alert("文を コピーしたよ。LINE などに はりつけて おくってね"); }
    } catch (e) { }
  };
  try { fxConfetti(40); } catch (e) { }
}
// 記録画面：これまでの 合格証
function renderCerts() {
  const box = $("#recCerts"); if (!box) return;
  const list = allCerts().slice().reverse();
  if (!list.length) { box.innerHTML = '<p class="sub">けんていモード（ぜんぶ こたえてから ◎×）で ごうかくすると、ここに 合格証が ならぶよ。</p>'; return; }
  box.innerHTML = '<div class="cert-list">' + list.map((c, i) => '<button class="cert-chip" data-i="' + i + '">🎓 ' + c.g + '<small>' + subjName(c.subj) + "・" + c.d + "</small></button>").join("") + "</div>";
  $$("#recCerts .cert-chip").forEach((b) => { b.onclick = () => showCert(list[+b.dataset.i]); });
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

// いまの級（合格ずみの いちばん上）の 番号。まだ無ければ -1
function myRankIdx() { try { const r = JSON.parse(localStorage.getItem(RANK) || "null"); return r ? r.idx : -1; } catch (e) { return -1; } }

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
// 王国レベル：これまでに 正解した数で 上がる（100問ごとに 1）
function kingdomLevel() { try { const c = allSessions().reduce((a, e) => a + (e.correct || 0), 0); return 1 + Math.floor(c / 100); } catch (e) { return 1; } }
// 学習成果に応じたGOLD（正解・正答率・自己ベスト・完走）
// 級が上がるほど1問に時間がかかるので、報酬に級の倍率をかける（20級=1.0倍 … 十段=4.2倍）
function gradeGoldMult(grade) {
  if (!grade) return 1;
  const i = GRADES.findIndex((x) => x.key === grade.key);
  // 上の級ほど 1問に時間がかかるので、報酬も それに近づける（20級=1.0 … 五段=6.3）
  return i < 0 ? 1 : +(1 + i * 0.22).toFixed(2);
}
/* ---- かんたんな級ばかり回して GOLDを稼ぐのを ふせぐ ----
   ① 自分の級より下は 報酬が減る（合格ずみの級は 練習にはなるが 稼ぎにはならない）
   ② 同じ級・同じ種目を その日に くり返すほど 減る
   どちらも「ちょうどよい難しさを 少しずつ」に 報酬を寄せるための仕組み。 */
const gradeIdxOf = (grade) => GRADES.findIndex((x) => x.key === (grade && grade.key));
// ★いまは 動作確認のため 制限を止めている。GOLD_RULES を true にすると 効くようになる
const GOLD_RULES = false;
function fitMult(grade) {
  if (!GOLD_RULES) return { m: 1, label: "" };
  const gi = gradeIdxOf(grade); if (gi < 0) return { m: 1, label: "" };
  const aim = myRankIdx() + 1;                    // つぎに目指す級＝いまの適正
  const d = gi - aim;
  if (d >= 1) return { m: 1.2, label: "上の級に ちょうせん ×1.2" };
  if (d === 0) return { m: 1, label: "" };
  if (d === -1) return { m: 0.75, label: "合格ずみの級 ×0.75" };
  if (d === -2) return { m: 0.5, label: "やさしい級 ×0.5" };
  return { m: 0.15, label: "ずっと下の級 ×0.15" };
}
const DAILY_KEY = "soroban_daily";
function dailyCount(key, add) {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(DAILY_KEY) || "{}"); } catch (e) { }
  if (d.d !== today()) d = { d: today(), c: {} };
  d.c = d.c || {};
  const n = d.c[key] || 0;
  if (add) { d.c[key] = n + 1; try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) { } }
  return n;
}
function repeatMult(subj, grade, count) {
  if (!GOLD_RULES) return { m: 1, label: "" };
  const t = [1, 0.7, 0.5, 0.3];
  const m = t[Math.min(count, t.length - 1)];
  return { m: m, label: m < 1 ? "きょう " + (count + 1) + "回目 ×" + m : "" };
}
function goldForSection({ correct, N, bestUpdated, completed, grade, subj, count }) {
  let g = correct * 2; const lines = [`正解 ${correct}問 ＋${correct * 2}`];
  const acc = N ? correct / N : 0;
  if (acc >= 0.9) { g += 20; lines.push("高正答率(90%↑) ＋20"); }
  else if (acc >= 0.7) { g += 10; lines.push("正答率(70%↑) ＋10"); }
  if (bestUpdated) { g += 30; lines.push("⏱ 自己ベスト更新 ＋30"); }
  if (completed) { g += 10; lines.push("完走 ＋10"); }
  const m = gradeGoldMult(grade);
  if (m > 1) { g = Math.round(g * m); lines.push(`${grade.key}ボーナス ×${m}`); }
  const fit = fitMult(grade);
  if (fit.m !== 1) { g = Math.round(g * fit.m); if (fit.label) lines.push(fit.label); }
  const rep = repeatMult(subj, grade, count || 0);
  if (rep.m !== 1) { g = Math.round(g * rep.m); if (rep.label) lines.push(rep.label); }
  return { g: Math.max(1, g), lines };
}
// 1日1回の連続学習ボーナス（その日の最初の学習で付与）
function dailyBonusOnce() {
  const s = loadStat(), t = today();
  if (s.goldDate === t) return null;
  s.goldDate = t; saveStat(s);
  const streak = Math.max(1, s.streak || 1);
  return { amt: 5 * Math.min(10, streak), label: `連続学習${streak}日ボーナス` };
}
/* ---- れんしゅう・たいせんの おわりに、ときどき パズルの道具が もらえる ----
   さいごまで やって 正答率70%以上のとき、35% の確率。1日 3回まで（かんたんな級で 稼ぐのを ふせぐ） */
const DROP_ITEMS = [["rocket", 40], ["prop", 25], ["tnt", 20], ["moves5", 15]];
function maybeDropItem(acc, completed) {
  try {
    if (!completed || acc < 70) return "";
    if (dailyCount("drop") >= 3) return "";
    if (Math.random() > 0.35) return "";
    let r = Math.random() * 100, pick = DROP_ITEMS[0][0];
    for (const [id, w] of DROP_ITEMS) { if (r < w) { pick = id; break; } r -= w; }
    const it = PZ_ITEMS.find((i) => i.id === pick); if (!it) return "";
    const d = pzLoad(); pzGiveItem(d, pick, 1); pzSave(d);
    dailyCount("drop", true);
    setTimeout(function () { try { sfx("star", function () { coinSnd(0); }); } catch (e) { } }, 700);
    return '<div class="drop-box">🎁 <b>' + it.em + " " + it.n + '</b> を みつけた！<small>パズルの もちものに 入ったよ</small></div>';
  } catch (e) { console.error("道具のプレゼントに失敗", e); return ""; }
}
// 次に買える建物までの目標（モチベーション表示）
function nextGoalHint() {
  const gold = getGold();
  if (gold >= 100) return "🧩 パズルで あそべるよ！（1回 30 GOLD）";
  if (gold >= 30) return "🧩 あと " + Math.floor(gold / 30) + " 回 パズルが あそべる";
  return "あと " + (30 - gold) + " GOLD で パズルが 1回 あそべる！";
}

/* ---------- 学習セッションの記録（保護者画面・成績用） ---------- */
const SESSIONS = "soroban_sessions";
function logSession(subj, N, correct, sumSec, pauses, results) {
  const l = JSON.parse(localStorage.getItem(SESSIONS) || "[]");
  const g = (typeof currentGrade === "function" && currentGrade()) || null;
  const e = { d: today(), t: Date.now(), g: (session && session.grade && session.grade.key) || (g && g.key) || "",
    subj, N, correct, sec: Math.round(sumSec), avg: N ? +(sumSec / N).toFixed(2) : 0, pauses: pauses || 0 };
  // まちがえた問題は「何をどう間違えたか」まで残す（あとで週ごとのクセを出すため）
  const miss = (results || []).filter((r) => !r.ok).slice(0, 8).map((r) => ({ q: r.compact, u: r.user, a: r.ans, k: missKind(r) }));
  if (miss.length) e.miss = miss;
  l.push(e);
  // 1件はおよそ200バイト。6000件でも 約1.2MB で、ブラウザの上限(5MB前後)に とどかない。
  // 1日4セットなら 4年分のこる。
  try { localStorage.setItem(SESSIONS, JSON.stringify(l.slice(-6000))); }
  catch (err) { try { localStorage.setItem(SESSIONS, JSON.stringify(l.slice(-2000))); } catch (e2) { console.error("記録の保存に失敗", e2); } }
  try { if (typeof schedulePush === "function") schedulePush(); } catch (e) { }
}
const allSessions = () => JSON.parse(localStorage.getItem(SESSIONS) || "[]");
function sessionsBetween(from, to) { return allSessions().filter((e) => e.d >= from && e.d <= to); }

/* ============================================================ そろばん部品 */
let audioCtx;
function ensureAudio() { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
/* iPhone / iPad は「画面を さわるまで 音を鳴らしてはいけない」きまりになっている。
   最初にさわった一度だけ 音の準備をして、以降は ふつうに鳴るようにする。 */
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfxPreload();                                // 効果音は ここで はじめて 読みこむ（起動直後の通信を へらす）
  try {
    const c = ensureAudio();
    if (c.state !== "running" && c.resume) c.resume();
    // 音のない ごく短い音を1回鳴らして、音の道を開く
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination); s.start(0);
  } catch (e) { }
  // mp3 のほうも 同じように 一度だけ 開いておく
  try {
    Object.keys(sfxBuf).forEach(function (k) {
      const a = sfxBuf[k]; if (!a) return;
      const v = a.volume; a.volume = 0;
      const p = a.play();
      if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; a.volume = v; }).catch(function () { a.volume = v; });
      else { a.pause(); a.currentTime = 0; a.volume = v; }
    });
  } catch (e) { }
  // 画面を開いた直後にBGMを鳴らそうとして 止められていた場合は ここで鳴らし直す
  try { if (bgmEl && bgmEl.paused) { const p = bgmEl.play(); if (p && p.catch) p.catch(function () { }); } } catch (e) { }
}
["pointerdown", "touchend", "keydown"].forEach(function (ev) {
  window.addEventListener(ev, unlockAudio, { once: false, passive: true });
});
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
  // ⚔️ たいせん：敵のやられ声（たおすたびに 変わる）と ほめ言葉
  down1: "down1", down2: "down2", down3: "down3", down4: "down4", praise: "praise",
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
  sfxPreload();                     // 効果音を切っても BGMは そのまま（別々に決められる）
  renderVolSegs();
}
// 上のバーと 設定画面、どちらのボタンも 同じ状態にする
function renderVolSegs() {
  $$(".vol-seg").forEach(function (seg) {
    const lv = seg.dataset.kind === "bgm" ? bgmLevel : sfxLevel;
    seg.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", +b.dataset.lv === lv); });
  });
  if (typeof renderSndMini === "function") renderSndMini();   // れんしゅう中の ちいさなボタンも そろえる
}
function bgmPlay(name) {
  if (!bgmOn) return bgmStop();     // BGMは 自分の設定だけで 決まる
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
      bgmLoaded[name] = false;
      const use = bgmUsable().map((b) => b.f).filter((f) => f !== name && bgmLoaded[f] !== false);
      if (use.length) bgmPlay(use[0]);                    // その曲が読めなければ 次の曲へ
      return;
    }
    bgmEl = new Audio(SFX_DIR + name + "." + SFX_EXT[ext++]);
    bgmEl.loop = true; bgmEl.volume = 0; bgmName = name;
    bgmEl.addEventListener("error", tryNext, { once: true });
    bgmEl.addEventListener("canplay", function () { bgmCache[name] = bgmEl; bgmLoaded[name] = true; }, { once: true });
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
// BGMの音量を 切・小・中・大 から えらぶ
function setBgmLevel(n) {
  bgmLevel = Math.max(0, Math.min(3, n | 0));
  bgmOn = bgmLevel > 0;
  try { localStorage.setItem(BGML_KEY, String(bgmLevel)); localStorage.setItem(BGM_KEY, bgmOn ? "on" : "off"); } catch (e) { }
  if (!bgmOn) bgmStop();
  else if (bgmEl) bgmEl.volume = BGM_STEPS[bgmLevel];
  else { sfxPreload(); bgmPlay(bgmName || bgmMain || "bgm_study"); }
  renderVolSegs();
}

/* パズルの曲は ステージごとに 入れかわる（同じ曲ばかり聞かないように） */
const BGM_LIST = [
  { f: "bgm1", n: "ファンタジー1" },
  { f: "bgm2", n: "ファンタジー2" },
  { f: "bgm3", n: "アコースティック1" },
  { f: "bgm4", n: "アコースティック2" },
  { f: "bgm_study", n: "ピアノ" },
];
const BGM_BATTLE = { f: "bgm_battle", n: "たいせん（サイバー）" };   // ⚔️たいせん 専用
const MAIN_KEY = "soroban_bgmmain", TURN_KEY = "soroban_bgmturn";
let bgmMain = localStorage.getItem(MAIN_KEY) || "bgm1";           // ホームの曲（設定で えらべる）
const OFF_KEY = "soroban_bgmoff";
let bgmOff = (function () { try { return JSON.parse(localStorage.getItem(OFF_KEY) || "{}"); } catch (e) { return {}; } })();
const bgmUsable = () => BGM_LIST.filter((b) => !bgmOff[b.f]);
// ローテーション用：ホームの曲は のぞく（画面を移ったのに 同じ曲、を なくすため）
function bgmRotList() {
  const use = bgmUsable().map((b) => b.f), rest = use.filter((f) => f !== bgmMain);
  return rest.length ? rest : use;
}
function toggleBgmUse(f) {
  bgmOff[f] = !bgmOff[f];
  if (bgmUsable().length === 0) bgmOff[f] = false;                 // ぜんぶ外すのは できない
  try { localStorage.setItem(OFF_KEY, JSON.stringify(bgmOff)); } catch (e) { }
}
const bgmLoaded = {};                                              // 読めた曲の記録
function setBgmMain(f) {
  bgmMain = f;
  try { localStorage.setItem(MAIN_KEY, f); } catch (e) { }
  bgmArea = ""; bgmStop(); bgmPlay(f);
}
/* ステージが始まるたびに 曲を送る。
   メインの曲を 1回おきに挟むので、メインが いちばん多くかかりつつ 毎回ちがう曲になる。 */
function bgmNextStage() {
  let t = parseInt(localStorage.getItem(TURN_KEY), 10); if (!isFinite(t)) t = 0;
  try { localStorage.setItem(TURN_KEY, String(t + 1)); } catch (e) { }
  const order = bgmRotList();
  return order[t % order.length] || bgmMain;
}
/* ---- れんしゅう中（みとり算・かけ算など）の BGM ----
   "off"＝鳴らさない／"rotate"＝セットごとに 曲がかわる／それ以外＝その曲だけ */
const STUDY_KEY = "soroban_bgmstudy", STURN_KEY = "soroban_bgmsturn";
let bgmStudy = localStorage.getItem(STUDY_KEY) || "rotate";
function setBgmStudy(v) {
  bgmStudy = v;
  try { localStorage.setItem(STUDY_KEY, v); } catch (e) { }
  bgmArea = ""; bgmStop();
  const pv = $("#view-play");
  if (pv && !pv.classList.contains("hidden")) bgmForStudy(true);   // れんしゅう中なら すぐ 切りかえる
}
function bgmNextStudy() {
  let t = parseInt(localStorage.getItem(STURN_KEY), 10); if (!isFinite(t)) t = 0;
  try { localStorage.setItem(STURN_KEY, String(t + 1)); } catch (e) { }
  const order = bgmRotList();
  return order[t % order.length] || bgmMain;
}
function bgmForStudy(next) {
  if (bgmStudy === "off") return bgmStop();
  if (bgmStudy !== "rotate") return bgmPlay(bgmStudy);
  let f = bgmNextStudy();
  if (f === bgmName) f = bgmNextStudy();          // いま鳴っている曲と 同じなら もう1つ 送る
  bgmPlay(f);
}
/* 画面ごとに 曲を かえると、メニューを タップするたびに 曲が 切れて うるさい。
   そこで「場所（エリア）」で わけ、場所が 変わったときだけ 切りかえる。
     たいせん … 専用の曲（固定）
     パズル   … ステージごとに かわる
     れんしゅう… 学習用（設定：鳴らさない／毎回かえる／曲を指定）
     きろく   … 記録・保護者。おちついて 読む画面なので 別の曲
     そのほか … ホームの曲（ホーム・級えらび・設定・きほん）
   場所が ちがえば かならず 曲も ちがうよう、ローテーションからは ホームの曲を のぞいてある。 */
function bgmAreaOf(v) {
  if (v === "battle") return "battle";
  if (v === "puzzle") return "puzzle";
  if (v === "play" || v === "today") return "study";
  if (v === "records" || v === "parent") return "record";
  return "menu";
}
// きろく画面の曲：ホームの曲 いがいから、いつも 同じものを えらぶ
function bgmRecordSong() { const r = bgmRotList(); return r[r.length - 1] || bgmMain; }
let bgmArea = "";
function bgmForView(v, next) {
  const area = bgmAreaOf(v);
  if (area === bgmArea && bgmEl && !next) return;   // 同じ場所の中では 曲を そのままにする
  bgmArea = area;
  if (area === "battle") return bgmPlay(BGM_BATTLE.f);
  if (area === "puzzle") return bgmPlay(bgmNextStage());
  if (area === "study") return bgmForStudy(true);
  if (area === "record") return bgmPlay(bgmRecordSong());
  bgmPlay(bgmMain);
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
    // --ty ＝ 上からの ずらし量。CSS の --bh に合わせて 計算する
    heaven.style.setProperty("--ty", state[c].heaven ? "calc(var(--bh))" : "0px");
    for (let j = 0; j < 4; j++) {
      const k = 2 + (j < state[c].earth ? j : j + 1);
      earth[j].style.setProperty("--ty", "calc(var(--bh) * " + k + " + 7px)");
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
  window.addEventListener("pointercancel", () => { dragging = false; lastKey = null; });  // スマホで指がはずれたとき
  // スマホでは そろばんが 画面より広い。開いたとき「一の位」が見えている所まで 横にずらす
  function centerOnes() {
    if (root.scrollWidth <= root.clientWidth + 4) return;
    const col = root.children[ONES_COL]; if (!col) return;
    const x = col.offsetLeft + col.offsetWidth / 2 - root.clientWidth * 0.72;
    root.scrollLeft = Math.max(0, Math.min(root.scrollWidth - root.clientWidth, x));
  }
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
  return { clear, handleKey, value: () => parts(), centerOnes };
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
const TITLES = { home: "ホーム", grades: "級・段を選ぶ", play: "れんしゅう", today: "本日の練習", battle: "たいせん", puzzle: "そろばんパズル", parent: "保護者", records: "記録を見る", settings: "設定・プロフィール", lesson: "そろばんの きほん", sheet: "プリントを 作る", kentei: "SK検定", join: "教室に 参加" };
function showView(v) {
  bgmForView(v);
  $$(".view").forEach((el) => el.classList.toggle("hidden", el.id !== "view-" + v));
  $("#pageTitle").textContent = TITLES[v] || "";
  if (v === "home") { renderHome(); tipFirstOpen(); }
  if (v === "lesson") renderLesson();
  if (v === "records") renderRecords();
  if (v === "settings") renderSettings();
  if (v === "today") renderToday();
  if (v === "battle") renderBattle();
  if (v === "puzzle") renderPuzzle();
  if (v === "parent") renderParent();
  if (v === "sheet") renderSheet();
  if (v === "kentei") renderKentei();
  if (v === "join") renderJoin();
  // 練習・たいせん中は スマホの上のバーを しまう（そのぶん 問題とそろばんを 大きく使う）
  // たいせんは「はじめる前の画面」では 上のバーを 残す（そこから 出られなくなるため）
  document.body.classList.toggle("playing", v === "play" || (v === "battle" && !!(battle && battle.running)));
  // スマホでは そろばんが 画面より広い。開いたとき 一の位が見える位置にしておく
  if (v === "play" || v === "battle") setTimeout(function () { try { sorobanQuiz.centerOnes(); sorobanBattle.centerOnes(); } catch (e) { } fitSoroPad(); }, 30);
}
/* 画面の下にすえつけた そろばんの高さぶん、本文の下に すきまを空ける */
function fitSoroPad() {
  const w = [$("#playSorobanWrap"), $("#battleSorobanWrap")].find((e) => e && !e.classList.contains("hidden"));
  const h = w ? Math.round(w.getBoundingClientRect().height) : 0;
  document.body.style.setProperty("--soroPad", (h || 0) + "px");
  if (fitLast) fitProblem(null);
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
  flashSpec = null; flashAnswer = null; flashBusy = false; flashRun++;   // フラッシュ暗算：表示を止める
  if (pz && !pz.done) pz = null;               // パズル：途中なら 捨てる（つづきは できない）
  $("#playRest").classList.add("hidden");
  hidePauseUI();
}
$$(".nav").forEach((n) => n.addEventListener("click", () => {
  abandonActivity(); // 画面切り替え前に、走っているタイマーを止めて破棄する
  setActiveNav(n);
  closeNavDrawer();  // スマホ：えらんだら メニューを しまう
  if (n.dataset.subj) { subject = n.dataset.subj; showView("grades"); updateInfo(); }
  else showView(n.dataset.view);
}));
/* ---------- スマホのメニュー（☰ で 開いたり しまったり） ---------- */
function closeNavDrawer() {
  const nav = $("#sideNav"), t = $("#navToggle");
  if (!nav) return;
  nav.classList.remove("open");
  if (t) { t.textContent = "☰"; t.setAttribute("aria-expanded", "false"); }
}
(function () {
  const t = $("#navToggle"), nav = $("#sideNav");
  if (!t || !nav) return;
  t.addEventListener("click", function () {
    const open = nav.classList.toggle("open");
    t.textContent = open ? "✕" : "☰";
    t.setAttribute("aria-expanded", open ? "true" : "false");
    clickSnd();
  });
})();
$("#examInfoBtn").addEventListener("click", () => showView("lesson"));
$("#startBtn").addEventListener("click", () => startWithTips(subject));
$("#quitBtn").addEventListener("click", quitSession);
// 効果音のON/OFF
function renderSound() { renderVolSegs(); renderSndMini(); }

/* ---- れんしゅう中・たいせん中の ちいさな音ボタン（上のバーが しまわれていても 切れる） ----
   おすたびに 大 → 中 → 小 → 切 → 大 と まわる。いまの状態は 文字で見えるようにする。 */
const LV_MARK = ["切", "小", "中", "大"];
function renderSndMini() {
  $$(".snd-btn").forEach(function (b) {
    const bgm = b.dataset.kind === "bgm";
    const lv = bgm ? bgmLevel : sfxLevel;
    b.innerHTML = (bgm ? "🎵" : "🔊") + '<i>' + LV_MARK[lv] + "</i>";
    b.classList.toggle("off", lv === 0);
    b.title = (bgm ? "BGM" : "効果音") + "：" + LV_MARK[lv] + "（おすと かわる）";
  });
}
document.addEventListener("click", function (e) {
  const b = e.target.closest ? e.target.closest(".snd-btn") : null;
  if (!b) return;
  const bgm = b.dataset.kind === "bgm";
  const lv = bgm ? bgmLevel : sfxLevel;
  const next = lv === 0 ? 3 : lv - 1;                  // 大→中→小→切→大
  bgm ? setBgmLevel(next) : setSfxLevel(next);
  renderSound();
});

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
  if (cf.answer !== "flash") info += `　｜ ${cf.N}もん・${cf.limit / 60}分いない・${cf.pass}点で ごうかく`;
  if (g.band === "dan" || g.kyu > 15) info += ` <span class="note">※目安</span>`;
  const L = lessonFor(g, subject);
  if (L) info += ' <button id="lessonBtn" class="ghost lesson-btn">📖 この級の 解きかたを 見る</button>';
  $("#gradeInfo").innerHTML = info;
  $("#timerToggleWrap").style.display = cf.answer === "flash" ? "none" : "";
  const lb = $("#lessonBtn"); if (lb && L) lb.onclick = () => tipShow(L.t, L.b);
}
$$(".chip").forEach((c) => c.addEventListener("click", () => { if (c.disabled) return; subject = c.dataset.subj; updateInfo(); }));

/* ---------- プロフィール／記録の描画 ---------- */
function renderProfile() {
  const p = profile();
  $("#avatarMini").innerHTML = avatarHTML(p.avatar); $("#nameMini").textContent = p.name; $("#rankMini").textContent = rankText();
  $("#avatarBig").innerHTML = avatarHTML(p.avatar); $("#nameBig").textContent = p.name; $("#rankBig").textContent = rankText();
  const yi = $("#youImg"); if (yi) yi.src = youImageSrc();
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
/* 1問にかかる時間の うつりかわり。「きのうの じぶん」に 勝つのが いちばん 夢中になる */
function speedStats() {
  const ses = allSessions().filter((e) => e.avg > 0 && e.N >= 3 && (e.subj === "anzan" || e.subj === "mitori" || e.subj === "kake" || e.subj === "wari"));
  if (!ses.length) return null;
  const t = today(), d7 = daysAgo(6), d14 = daysAgo(13);
  const recent = ses.filter((e) => e.d >= d7);
  const pick = (list) => { const c = {}; list.forEach((e) => { c[e.subj] = (c[e.subj] || 0) + e.N; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
  const subj = pick(recent.length ? recent : ses);
  const of = (list) => list.filter((e) => e.subj === subj);
  const avg = (list) => { const n = list.reduce((a, e) => a + e.N, 0); return n ? list.reduce((a, e) => a + e.avg * e.N, 0) / n : null; };
  const thisWeek = avg(of(ses.filter((e) => e.d >= d7))), lastWeek = avg(of(ses.filter((e) => e.d >= d14 && e.d < d7)));
  const todayAvg = avg(of(ses.filter((e) => e.d === t)));
  // 日ごとの平均（14日ぶん）。ベストは 日単位で
  const byDay = {};
  of(ses).forEach((e) => { (byDay[e.d] = byDay[e.d] || []).push(e); });
  const days = Object.keys(byDay).sort();
  const daily = days.map((d) => ({ d, v: avg(byDay[d]) }));
  const best = daily.reduce((m, x) => (m == null || x.v < m ? x.v : m), null);
  const spark = [];
  for (let i = 13; i >= 0; i--) { const d = daysAgo(i); spark.push(byDay[d] ? avg(byDay[d]) : null); }
  return { subj, thisWeek, lastWeek, todayAvg, best, spark, n: of(ses).length };
}
function sparkSVG(vals) {
  const pts = vals.map((v, i) => [i, v]).filter((x) => x[1] != null);
  if (pts.length < 2) return "";
  const W = 220, H = 44, lo = Math.min.apply(null, pts.map((x) => x[1])) * 0.9, hi = Math.max.apply(null, pts.map((x) => x[1])) * 1.05 || 1;
  const X = (i) => 6 + (i / 13) * (W - 12), Y = (v) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const line = pts.map((x, i) => (i ? "L" : "M") + X(x[0]).toFixed(1) + " " + Y(x[1]).toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><path d="' + line + '" fill="none" stroke="#d4af37" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + X(last[0]).toFixed(1) + '" cy="' + Y(last[1]).toFixed(1) + '" r="4" fill="#c0392b"/></svg>';
}
function renderSpeed() {
  const box = $("#speedBox"); if (!box) return;
  const st = speedStats();
  if (!st) { box.innerHTML = '<div class="sp-h">⚡ 1もんの はやさ</div><div class="sub">れんしゅうすると、ここに「1もんに かかる時間」が 出るよ。きのうの じぶんに 勝とう！</div>'; return; }
  const name = subjName(st.subj), now = st.todayAvg != null ? st.todayAvg : st.thisWeek;
  let cmp = "";
  if (st.lastWeek != null && now != null) {
    const diff = st.lastWeek - now;
    cmp = diff > 0.05 ? '<span class="sp-up">先週 ' + st.lastWeek.toFixed(1) + '秒 → <b>' + diff.toFixed(1) + '秒 はやくなった！</b></span>'
      : diff < -0.05 ? '<span class="sp-dn">先週 ' + st.lastWeek.toFixed(1) + '秒。きょうは ゆっくり ていねいに</span>'
      : '<span class="sp-eq">先週と 同じくらい。あと 0.1秒！</span>';
  } else cmp = '<span class="sp-eq">あしたも はかって、きょうの じぶんに 勝とう</span>';
  box.innerHTML = '<div class="sp-h">⚡ ' + name + "の はやさ</div>" +
    '<div class="sp-row"><div class="sp-big">1もん <b>' + (now != null ? now.toFixed(1) : "—") + '</b><small>秒</small></div>' + sparkSVG(st.spark) + "</div>" +
    '<div class="sp-cmp">' + cmp + (st.best != null ? '<span class="sp-best">🏆 じこベスト ' + st.best.toFixed(1) + "秒</span>" : "") + "</div>";
}
function renderHome() {
  renderSpeed();
  const p = profile(), k = loadKingdom(), s = loadStat(), ms = monthStats(), g = homeGrade();
  $("#homeAvatar").innerHTML = avatarHTML(p.avatar); $("#homeName").textContent = p.name; $("#homeRank").textContent = rankText();
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
  if (!hist.length) return '<p class="sub">「本日の練習」を さいごまで やると、ここに グラフが 出るよ。</p>';
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
    ? `<table class="rec-table"><tr><th>日づけ</th><th>級・段</th><th>正答率</th><th>正解</th><th>タイム</th></tr>${hrows}</table>`
    : "";
  const t = allTimes(), subs = ["mitori", "kake", "wari", "anzan"];
  const rows = GRADES.filter((g) => subs.some((s) => t[`${g.key}_${s}`] != null))
    .map((g) => `<tr><td>${g.key}</td>${subs.map((s) => `<td>${t[`${g.key}_${s}`] != null ? fmtClock(t[`${g.key}_${s}`]) : "—"}</td>`).join("")}</tr>`).join("");
  $("#recordsTable").innerHTML = rows
    ? `<table class="rec-table"><tr><th>級・段</th><th>みとり</th><th>かけ</th><th>わり</th><th>あんざん</th></tr>${rows}</table>`
    : `<p class="sub">まだ きろくが ないよ。れんしゅうを さいごまで やると、タイムが のこるよ。</p>`;
  renderWeekRank();
  renderRecLog();
  renderCerts();
}

/* ============================================================ やった記録（ぜんぶ）
   これまで logSession で ためていたのに どこにも出していなかった。
   1回ずつ ぜんぶ 見られるようにする。 */
let recFilter = "all";
const SUBJ_EM = { mitori: "🧮", kake: "✏️", wari: "➗", anzan: "💭", flash: "⚡" };
const subjName = (k) => (SUBJECT[k] ? SUBJECT[k].name : (String(k).startsWith("sk-") && EXAM_TRACKS[k.slice(3)] ? "SK検定・" + EXAM_TRACKS[k.slice(3)].name + "・自宅受験" : k));
function renderRecLog() {
  const box = $("#recLog"); if (!box) return;
  const all = allSessions().slice().reverse();          // 新しいものが 上
  // しぼりこみボタン
  const counts = {};
  all.forEach((e) => { counts[e.subj] = (counts[e.subj] || 0) + 1; });
  const kinds = ["mitori", "kake", "wari", "anzan", "flash"].filter((k) => counts[k]);
  $("#recFilter").innerHTML =
    '<button class="chip' + (recFilter === "all" ? " active" : "") + '" data-rf="all">ぜんぶ ' + all.length + "回</button>" +
    kinds.map((k) => '<button class="chip' + (recFilter === k ? " active" : "") + '" data-rf="' + k + '">' +
      SUBJ_EM[k] + " " + subjName(k) + " " + counts[k] + "回</button>").join("");
  $$("#recFilter .chip").forEach((b) => { b.onclick = () => { recFilter = b.dataset.rf; renderRecLog(); }; });

  const list = recFilter === "all" ? all : all.filter((e) => e.subj === recFilter);
  // まとめ
  const N = list.reduce((a, e) => a + e.N, 0), C = list.reduce((a, e) => a + e.correct, 0);
  const T = list.reduce((a, e) => a + (e.sec || 0), 0);
  $("#recSummary").innerHTML = list.length
    ? `ぜんぶで <b>${list.length}回</b>　といた問題 <b>${N}問</b>　正解 <b>${C}問</b>（正答率 ${N ? Math.round((C / N) * 100) : 0}%）　合計 <b>${fmtMin(T)}</b>`
    : "まだ きろくが ないよ。";
  const show = list.slice(0, 80);
  box.innerHTML = recLogTable(show) +
    (list.length > show.length ? `<p class="sub">新しい ${show.length}回 を出しています（ぜんぶで ${list.length}回）</p>` : "");
}
function recLogTable(rows) {
  if (!rows.length) return "";
  const trs = rows.map(function (e) {
    const acc = e.N ? Math.round((e.correct / e.N) * 100) : 0;
    const miss = (e.miss || []).length;
    return `<tr><td>${e.d}</td><td>${SUBJ_EM[e.subj] || ""} ${subjName(e.subj)}</td><td>${e.g || "—"}</td>` +
      `<td>${e.correct}/${e.N}</td><td class="${acc >= 90 ? "acc-hi" : acc < 70 ? "acc-lo" : ""}">${acc}%</td>` +
      `<td>${e.sec ? fmtClock(e.sec) : "—"}</td><td>${e.avg ? e.avg.toFixed(1) + "秒" : "—"}</td>` +
      `<td>${miss ? '<span class="rec-miss">' + miss + "問</span>" : "—"}</td></tr>`;
  }).join("");
  return `<table class="rec-table"><tr><th>日付</th><th>種目</th><th>級・段</th><th>正解</th><th>正答率</th><th>時間</th><th>1問</th><th>まちがい</th></tr>${trs}</table>`;
}

/* ============================================================ 今週のランキング
   サーバーが要らない やり方にする：
   ・その週に かせいだ「がんばりポイント」を 週ごとに ならべて 順位をつける（自分の中の 歴代ランキング）
   ・級ごとの 検定の 制限時間と くらべて 実力ランク（S/A/B/C）を出す＝「全国の目安」との くらべ方 */
function weekKeyOf(dstr) {
  const d = new Date(dstr + "T00:00:00");
  const day = (d.getDay() + 6) % 7;                       // 月曜はじまり
  d.setDate(d.getDate() - day);
  // toISOString だと 時差のぶん 1日ずれるので、その土地の日付で 組み立てる
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function weekPoints() {
  const w = {};
  allSessions().forEach(function (e) {
    const k = weekKeyOf(e.d);
    if (!w[k]) w[k] = { k, N: 0, C: 0, sec: 0, sets: 0, days: {} };
    w[k].N += e.N; w[k].C += e.correct; w[k].sec += e.sec || 0; w[k].sets++; w[k].days[e.d] = 1;
  });
  return Object.values(w).map(function (x) {
    const acc = x.N ? x.C / x.N : 0;
    // といた数 ＋ 正解×2 ＋ 正答率ボーナス ＋ つづけた日数ボーナス
    x.days = Object.keys(x.days).length;
    x.pt = Math.round(x.N + x.C * 2 + acc * 100 + x.days * 30);
    x.acc = Math.round(acc * 100);
    return x;
  }).sort((a, b) => b.pt - a.pt);
}
// 検定の制限時間と くらべた 実力ランク
function skillRank() {
  const t = allTimes(), out = [];
  GRADES.forEach(function (g) {
    ["mitori", "kake", "wari", "anzan"].forEach(function (sj) {
      const best = t[`${g.key}_${sj}`]; if (best == null) return;
      const lim = (SUBJECT[sj] || {}).limit || 420;
      const r = best / lim;                                 // 小さいほど 速い
      const rank = r <= 0.35 ? "S" : r <= 0.55 ? "A" : r <= 0.8 ? "B" : "C";
      out.push({ g: g.key, sj, best, lim, rank, r });
    });
  });
  return out.sort((a, b) => a.r - b.r).slice(0, 6);
}
function renderWeekRank() {
  const box = $("#recRank"); if (!box) return;
  const ws = weekPoints();
  if (!ws.length) { box.innerHTML = '<p class="sub">練習すると ここに ランキングが 出ます。</p>'; return; }
  const thisWeek = weekKeyOf(today());
  const idx = ws.findIndex((x) => x.k === thisWeek);
  const me = idx >= 0 ? ws[idx] : null;
  const head = me
    ? `<div class="rank-now">今週は 歴代 <b>${idx + 1}位</b> ／ ${ws.length}週　<span class="rank-pt">${me.pt} ポイント</span></div>` +
      (idx === 0 ? '<div class="rank-cheer">🏆 じぶんの 最高記録を こうしん中！</div>'
        : `<div class="rank-cheer">あと <b>${ws[idx - 1].pt - me.pt}</b> ポイントで ${idx}位！</div>`)
    : '<div class="rank-now">今週は まだ 0ポイント。1セットやると のります。</div>';
  const rows = ws.slice(0, 8).map(function (x, i) {
    const now = x.k === thisWeek;
    return `<tr class="${now ? "rank-me" : ""}"><td>${i + 1}位</td><td>${x.k} の週${now ? "（今週）" : ""}</td>` +
      `<td><b>${x.pt}</b></td><td>${x.sets}セット</td><td>${x.N}問</td><td>${x.acc}%</td><td>${x.days}日</td></tr>`;
  }).join("");
  const sk = skillRank();
  const skHTML = sk.length
    ? '<h4 class="rank-h">🎖 実力ランク（検定の 制限時間と くらべて）</h4>' +
      '<table class="rec-table"><tr><th>級・段</th><th>種目</th><th>じぶんのタイム</th><th>検定の制限</th><th>ランク</th></tr>' +
      sk.map((x) => `<tr><td>${x.g}</td><td>${subjName(x.sj)}</td><td>${fmtClock(x.best)}</td><td>${fmtClock(x.lim)}</td>` +
        `<td><span class="rk rk-${x.rank}">${x.rank}</span></td></tr>`).join("") + "</table>" +
      '<p class="sub">S＝制限時間の35%以内　A＝55%以内　B＝80%以内　C＝それ以上。検定は「時間内に とける」ことが 合格の めやすです。</p>'
    : "";
  box.innerHTML = head +
    '<table class="rec-table"><tr><th></th><th>週</th><th>ポイント</th><th>セット</th><th>問題</th><th>正答率</th><th>日数</th></tr>' + rows + "</table>" +
    '<p class="sub">ポイント＝といた数 ＋ 正解×2 ＋ 正答率 ＋ つづけた日数×30</p>' + skHTML;
}
function renderToday() {
  const sel = $("#todayGrade");
  const lv = routineLevel(), d = practiceDays();
  const steps = buildSteps(homeGrade());
  const lines = steps.map((st) => st.rest != null ? "きゅうけい " + st.rest + "びょう" : st.label).join(" → ");
  const note = $("#todayNote");
  if (note) note.innerHTML = (lv === 0 ? "はじめての日は <b>3もん</b>だけ。まずは「できた！」で おわろう。"
    : lv < 4 ? "れんしゅうした日が <b>" + d + "日</b>。少しずつ 長くなるよ（7日で 本番のメニュー）。" : "本番のメニューだよ。") +
    '<div class="today-flow">' + lines + " → 🎉 せいせき はっぴょう</div>";
  sel.innerHTML = GRADES.map((g, i) => `<option value="${i}">${g.key}</option>`).join("");
  sel.dataset.filled = "1";
  const rk = JSON.parse(localStorage.getItem(RANK) || "null");
  sel.value = rk ? rk.idx : gradeIdx;
}
$("#todayStart").addEventListener("click", () => { const g = GRADES[+$("#todayGrade").value]; tipOnce("first-routine", TIP_ROUTINE.t, TIP_ROUTINE.b, () => startRoutine(g)); });
// アバター。"img:名前" は assets/名前.png の絵、それ以外は 顔文字
const AVATARS = ["img:hero_1", "img:hero_2", "img:hero_3", "img:hero_4", "img:hero_5", "img:hero_6", "🧒", "👦", "👧", "🦊", "🐼", "🦉"];
const AVATAR_NAMES = { hero_1: "けんし", hero_2: "まほうつかい", hero_3: "ゆみつかい", hero_4: "おひめさま", hero_5: "けんじゃ", hero_6: "ぶとうか" };
function avatarHTML(a) {
  if (a && a.indexOf("img:") === 0) { const n = a.slice(4); return '<img class="av-img" src="assets/' + n + '.png" alt="' + (AVATAR_NAMES[n] || "") + '">'; }
  return a || "🧒";
}
// たいせんの「あなた」は えらんだアバターの絵（顔文字のときは レオ王）
function youImageSrc() { const a = profile().avatar || ""; return a.indexOf("img:") === 0 ? "assets/" + a.slice(4) + ".png" : "assets/king.png"; }
// 音の設定（効果音・BGM・音量）
function renderSound2() {
  renderVolSegs(); renderSndMini();
  const sb = $("#studyBgm");
  if (sb) {
    sb.innerHTML = '<option value="off">鳴らさない</option><option value="rotate">毎回かえる（おすすめ）</option>' +
      BGM_LIST.map((b) => '<option value="' + b.f + '">' + b.n + " だけ</option>").join("");
    sb.value = bgmStudy;
    sb.onchange = function () { setBgmStudy(sb.value); renderSound2(); };
  }
  const songs = $("#bgmSongs"), n = $("#sfxNote");
  if (songs) {
    songs.innerHTML = BGM_LIST.concat([BGM_BATTLE]).map(function (b) {
      const main = b.f === bgmMain, now = b.f === bgmName, off = !!bgmOff[b.f], batt = b.f === BGM_BATTLE.f;
      const st = bgmLoaded[b.f] === false ? ' <small class="ng">読めない</small>' : "";
      return '<div class="song' + (main ? " main" : "") + (off ? " off" : "") + '">' +
        '<button class="song-play" data-f="' + b.f + '">▶</button>' +
        '<span class="song-n">' + b.n + (now ? ' <small>♪いま</small>' : "") + st + "</span>" +
        (batt ? '<span class="song-badge fixed">たいせん専用</span>'
          : '<button class="song-use" data-f="' + b.f + '">' + (off ? "つかわない" : "つかう") + "</button>" +
            (main ? '<span class="song-badge">ホームの曲</span>'
              : '<button class="song-main" data-f="' + b.f + '">ホームの曲に</button>')) +
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
  const u = e.target.closest(".song-use");
  if (u) { toggleBgmUse(u.dataset.f); renderSound2(); return; }
  const m = e.target.closest(".song-main");
  if (m) { setBgmMain(m.dataset.f); renderSound2(); }
});
function renderSettings() {
  renderSound2();
  const cr = $("#setCredit"); if (cr) cr.innerHTML = creditHTML();
  const p = profile();
  $("#nameInput").value = p.name;
  $("#avatarPicker").innerHTML = AVATARS.map((a) => `<button data-a="${a}" class="${a === p.avatar ? "sel" : ""}" title="${a.indexOf("img:") === 0 ? (AVATAR_NAMES[a.slice(4)] || "") : ""}">${avatarHTML(a)}</button>`).join("");
  $$("#avatarPicker button").forEach((b) => b.addEventListener("click", () => { $$("#avatarPicker button").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); }));
}
$("#saveProfileBtn").addEventListener("click", () => {
  const name = ($("#nameInput").value || "そろ太くん").trim();
  const sel = $("#avatarPicker button.sel");
  saveProfile({ name, avatar: sel ? sel.dataset.a : "img:hero_1" });
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
  const wrap = $("#playSorobanWrap");
  const soroOn = wrap && !wrap.classList.contains("hidden");
  // 画面の高さは iPhoneの下のバーで 変わるので、そのときの実寸を使う
  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 800;
  // そろばんの高さは 画面の広さで変わる（スマホでは小さい）ので、決め打ちにせず 実際にはかる
  // スマホの縦・横どちらも「せまい画面」として あつかう（CSSと同じ条件にそろえる）
  const narrow = window.innerWidth <= 640 || (window.innerHeight <= 520 && window.innerWidth > window.innerHeight);
  let soroH = soroOn ? Math.round(wrap.getBoundingClientRect().height) : 0;
  if (soroOn && soroH < 60) soroH = narrow ? 290 : 400;     // まだ表示されていないときの めやす
  // 問題が始まる高さを 実際にはかる（スマホでは 上のバーを しまうので そのぶん広くなる）
  const top = Math.round(el.getBoundingClientRect().top);
  const head = top > 20 && top < vh ? top : (narrow ? 100 : 250);
  // そろばんを 画面の下にすえつけているときは「こたえる」も その中にあるので 足さない
  const playing = document.body.classList.contains("playing");
  const pinned = narrow && playing && soroOn;
  // 横長で 縦がみじかい画面では、問題の右に そろばんを 置いている（＝縦に場所を取らない）
  const side = !narrow && playing && window.innerWidth >= 1000 && vh <= 900;
  const foot = pinned ? 54 : (narrow ? 96 : 120);   // 「解き方をみる」のぶんを のこす
  const avail = Math.max(100, vh - head - (side ? 0 : soroH) - (side ? 70 : foot));
  const size = Math.max(18, Math.min(narrow ? 40 : 46, Math.floor(avail / (lines * 1.42))));
  el.style.fontSize = size + "px";
  el.style.lineHeight = "1.42";
}
function onViewportChange() {
  if (fitLast) fitProblem(null);
  try { sorobanQuiz.centerOnes(); sorobanBattle.centerOnes(); } catch (e) { }
}
window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", function () { setTimeout(onViewportChange, 250); });
if (window.visualViewport) window.visualViewport.addEventListener("resize", onViewportChange);
// そろばんが 出たり消えたりするたび、下のすきまを 測りなおす
(function () {
  const targets = [$("#playSorobanWrap"), $("#battleSorobanWrap")].filter(Boolean);
  if (!targets.length || !window.MutationObserver) return;
  const mo = new MutationObserver(function () { setTimeout(fitSoroPad, 0); });
  targets.forEach(function (t) { mo.observe(t, { attributes: true, attributeFilter: ["class"] }); });
})();

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
  bgmForStudy(true);                 // セットごとに 曲をかえる（同じ曲で あきないように）
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", session.answerBy !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", session.answerBy !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.toggle("hidden", subj !== "anzan"); // あんざんのときだけコツを出す
  $("#stepsRow").classList.toggle("hidden", !["mitori", "kake", "wari"].includes(subj));
  $("#playGrade").textContent = `${grade.key}／${cf.name}` + (session.timed ? "（検定）" : "（記録）");
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  startPlayTimer();
  nextPlayProblem();
}
// 一時停止していた時間を差し引いた「実際の経過時間」（停止中は止めた時点で固定）
const playElapsed = () => ((session.paused ? session.pauseAt : performance.now()) - session.start - (session.pausedMs || 0)) / 1000;
// タイマーは 必ず 前のを止めてから 始める（二重に走らせない）
function startPlayTimer() { if (playTimer) clearInterval(playTimer); playTimer = setInterval(tickPlay, 150); }
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
  if (session.exam) return finishExamSection();
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
    if (pass) { certify(session.grade.key, session.subj); msg += `<br>🎓 ${session.grade.key} 認定！ 合格証が もらえるよ`; }
  }
  msg += report;
  if (completed) { // GOLDは学習の成果としてのみ付与
    // 合格ずみの級は「級ごと」に数える（種目を変えて 回数をリセットできないように）
    const below = gradeIdxOf(session.grade) <= myRankIdx();
    const dkey = below ? session.grade.key + "_low" : session.grade.key + "_" + session.subj;
    const { g, lines } = goldForSection({ correct: session.correct, N: session.N, bestUpdated, completed,
      grade: session.grade, subj: session.subj, count: dailyCount(dkey) });
    dailyCount(dkey, true);
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
  msg += maybeDropItem(acc100, completed);
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
  tipOnce("first-result", TIP_RESULT.t, TIP_RESULT.b);
}
function quitSession() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  if (examTimer) { clearInterval(examTimer); examTimer = null; }
  const wasExam = !!examState;
  session = null; routineState = null; examState = null;
  hidePauseUI();
  const back = routineActive ? "today" : wasExam ? "kentei" : "grades";
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
/* 練習した日数（きょうを ふくまない）。はじめの数日は 短いメニューにして「続く」ことを 最優先にする */
function practiceDays() {
  try { const t = today(); return new Set(allSessions().map((e) => e.d).filter((d) => d && d !== t)).size; } catch (e) { return 0; }
}
// 日数 → メニューの段階（0＝はじめての日 … 4＝本番のメニュー）
function routineLevel() { const d = practiceDays(); return d <= 0 ? 0 : d <= 1 ? 1 : d <= 3 ? 2 : d <= 6 ? 3 : 4; }
const ROUTINE_LEVELS = [
  // 0：はじめての日は 3問だけ。「できた！」で 終わる
  [{ subj: "anzan", N: 3, timed: false, label: "きょうの 3もん" }],
  // 1：2日目
  [{ subj: "anzan", N: 5, timed: false, label: "あんざん 5もん" }, { rest: 30, next: "みとり算" }, { subj: "mitori", N: 3, timed: false, label: "みとり算 3もん" }],
  // 2：3〜4日目
  [{ subj: "anzan", N: 10, timed: true, label: "あんざん 10もん（3分）" }, { rest: 45, next: "かけ算" },
   { subj: "kake", N: 5, timed: false, label: "かけ算 5もん" }, { rest: 30, next: "わり算" }, { subj: "wari", N: 5, timed: false, label: "わり算 5もん" },
   { rest: 45, next: "みとり算" }, { subj: "mitori", N: 5, timed: false, label: "みとり算 5もん" }],
  // 3：5〜7日目
  [{ subj: "anzan", N: 15, timed: true, label: "あんざん 15もん（3分）" }, { rest: 60, next: "かけ算" },
   { subj: "kake", N: 10, timed: false, label: "かけ算 10もん" }, { rest: 45, next: "わり算" }, { subj: "wari", N: 10, timed: false, label: "わり算 10もん" },
   { rest: 60, next: "みとり算" }, { subj: "mitori", N: 10, timed: false, label: "みとり算 10もん" }],
];
function buildSteps(grade) {
  const lv = routineLevel();
  const base = lv >= 4 ? ROUTINE_TEMPLATE : ROUTINE_LEVELS[lv];
  const kept = base.filter((s) => s.rest != null || difficulty(grade, s.subj));
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
  bgmForStudy(true);                 // セットごとに 曲をかえる（同じ曲で あきないように）
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
  startPlayTimer();
  nextPlayProblem();
  // はじめて そろばんが出たときは 珠の動かし方を 見せる（そのあいだ タイマーは 止める）
  if (session.answerBy === "soroban" && !(tipsSeen()["first-play"] && tipsSeen()["first-finger"])) {
    pausePlay(); session.pauseCount = Math.max(0, (session.pauseCount || 1) - 1);
    tipOnce("first-play", TIP_PLAY.t, TIP_PLAY.b, () => tipOnce("first-finger", TIP_FINGER.t, TIP_FINGER.b, resumePlay));
  }
}
function finishRoutineSection() {
  const el = playElapsed();
  routineState.sections.push({ label: session.label, subj: session.subj, correct: session.correct, N: session.N, sec: el, items: session.results });
  logSession(session.subj, session.N, session.correct, el, session.pauseCount, session.results);
  // 本日の練習は メニューどおりなので 反復のへらしは かけない（1日1回の想定）
  const { g } = goldForSection({ correct: session.correct, N: session.N, bestUpdated: false, completed: true,
    grade: session.grade, subj: session.subj, count: 0 });
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
$("#restSkip").addEventListener("click", () => { if (routineState) endRest(); else if (examState) endExamBreak(); });
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
  const sectionsGold = rs.gold || 0, completeBonus = [20, 35, 60, 80, 100][Math.min(4, routineLevel())];   // 短いメニューの日は ひかえめ
  const routineBonus = Math.round(60 * gradeGoldMult(rs.grade));   // 本日の練習を やりきったごほうび
  const goldLines = [`練習でためた ＋${sectionsGold}`, `本日の練習 完了 ＋${completeBonus}`, `🏁 やりきった ＋${routineBonus}`];
  let earned = sectionsGold + completeBonus + routineBonus;
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
  $("#playResult").innerHTML = `${routineHero}<div class="marks">正答率 ${acc}%（${totalCorrect}/${totalN}）</div>${rows}<div class="sub">合計タイム ${fmtClock(totalTime)}</div>${missReportHTML(allItems)}${goldBlock}${maybeDropItem(acc, true)}${detail}<br><button id="toKingdomBtn2">🧩 パズルへ</button> <button id="toRecordsBtn">📊 グラフを見る</button> <button id="routineHomeBtn" class="ghost">本日の練習へ</button>`;
  $("#toKingdomBtn2").onclick = () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="puzzle"]')); };
  $("#toRecordsBtn").onclick = () => { showView("records"); setActiveNav(document.querySelector('.nav[data-view="records"]')); };
  $("#routineHomeBtn").onclick = () => { showView("today"); setActiveNav(document.querySelector('.nav[data-view="today"]')); };
  tipOnce("first-result", TIP_RESULT.t, TIP_RESULT.b);
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
  bgmForStudy(true);                 // セットごとに 曲をかえる（同じ曲で あきないように）
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
  startPlayTimer();
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
let flashRun = 0;   // 何回目の表示か。画面を離れたら 番号を進めて 古い表示を止める
let flashExam = { on: false, idx: 0, N: 10, correct: 0, times: [] };
let flashAskAt = 0;   // 数字が消えてから答えるまでの時間をはかる
const FLASH_SET = 10;  // ふつうの練習の1セット（検定は20問）
function startFlash(grade) {
  flashSpec = difficulty(grade, "flash"); flashGrade = grade; session = null;
  hidePauseUI();
  showView("play");
  bgmForStudy(true);                 // セットごとに 曲をかえる（同じ曲で あきないように）
  $("#playRest").classList.add("hidden");
  // フラッシュ暗算は 数字を #flashDisplay に出すので、上の問題の場所は 使わない（すきまが空くだけ）
  $("#playProblemWrap").classList.add("hidden");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden"); $("#playFlashWrap").classList.remove("hidden");
  $("#anzanTip").classList.remove("hidden"); // フラッシュ暗算でもコツを出す（ボタンより下に置いてある）
  $("#stepsRow").classList.add("hidden"); $("#steps").classList.add("hidden");
  $("#playGrade").textContent = `${grade.key}／フラッシュ暗算`; $("#playTimer").textContent = ""; $("#playProgress").textContent = ""; $("#playProblem").textContent = "";
  $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashInfo").textContent = `${grade.key}：${flashSpec.digits}桁 ${flashSpec.terms}口 / 1個 ${(flashPaceMs(grade) / 1000).toFixed(1)}秒ずつ`;
  $("#flashMeasure").textContent = ""; $("#flashSignal").classList.add("hidden"); $("#flashDots").innerHTML = "";
  // 数字ではなく 言葉を出すときは 小さめの字にする（大きいままだと 画面からはみ出す）
  $("#flashDisplay").textContent = "▶ を押してスタート"; $("#flashDisplay").className = "flash-display msg"; $("#flashForm").classList.add("hidden");
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
  const myRun = ++flashRun;
  let lastText = null, lastSig = null, shownIdx = -1, aborted = false;
  const onHide = () => { if (document.hidden) aborted = true; };
  document.addEventListener("visibilitychange", onHide);
  await new Promise((resolve) => {
    // 見はり役：画面の描き直し（rAF）が 止まっても、表示の時間が過ぎたら 必ず 先へ進める
    // （iPhone は 画面が暗くなると rAF を止めるため、これが無いと ずっと「表示中」のままになる）
    const guard = setTimeout(() => { aborted = true; try { resolve(); } catch (e) { } }, Math.max(1000, (end - ctx.currentTime + 1.2) * 1000));
    const draw = () => {
      if (aborted || myRun !== flashRun || !flashSpec) { clearTimeout(guard); return resolve(); }
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
        disp.textContent = "= ?"; clearTimeout(guard); return resolve();
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
  if (myRun !== flashRun || !flashSpec) { flashBusy = false; $("#flashStart").disabled = false; return; }   // 途中で 画面を離れた
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
    if (pass) { certify(flashGrade.key, "flash"); msg += `<br>🎓 ${flashGrade.key} 認定！ 合格証が もらえるよ`; }
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
  const fkey = (gradeIdxOf(flashGrade) <= myRankIdx() ? flashGrade.key + "_low" : flashGrade.key + "_flash");
  const { g, lines } = goldForSection({ correct, N, bestUpdated: r.improved, completed: true,
    grade: flashGrade, subj: "flash", count: dailyCount(fkey) });
  dailyCount(fkey, true);
  let earned = g;
  if (pass) { earned += 50; lines.push("🎓 検定合格 ＋50"); }
  const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; lines.push(`🔥 ${daily.label} ＋${daily.amt}`); }
  addGold(earned);
  logSession("flash", N, correct, sum, 0);   // 記録に残す（保護者画面のグラフに乗る）
  msg += `<div class="gold-earn"><img class="ico-coin" src="assets/coin.png" alt="" /> <b>＋${earned} GOLD</b><div class="gold-lines">${lines.join("・")}</div><div class="goal">${nextGoalHint()}</div></div>`;
  msg += maybeDropItem(acc, true);
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
/* たいせんの敵：ほんとうに いる ばいきん・きせいちゅう（たおした数で 順に 出てくる）。
   絵の形に できるだけ 合わせてある（コンマ形＝カンピロバクター、らせん＝ヘリコバクター など）。 */
const ENEMIES = [
  { file: "germ_1.png", name: "ノロウイルス" },
  { file: "germ_2.png", name: "アニサキス" },
  { file: "germ_3.png", name: "インフルエンザウイルス" },
  { file: "germ_4.png", name: "カンピロバクター" },
  { file: "germ_5.png", name: "ヘリコバクター" },
  { file: "germ_6.png", name: "ブドウきゅうきん" },
];
const GOLD_PER_KILL = 8; // 3正解＝1匹。旧「正解×2＋勝敗ボーナス」とほぼ同水準になる額
function renderBattle() {
  const sel = $("#battleGrade");
  sel.innerHTML = GRADES.map((g, i) => `<option value="${i}">${g.key}</option>`).join("");
  const rk = JSON.parse(localStorage.getItem(RANK) || "null"); sel.value = rk ? rk.idx : gradeIdx;
  $("#battleSetup").classList.remove("hidden"); $("#battleArena").classList.add("hidden"); $("#battleResult").classList.add("hidden");
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; } battle = null;
  document.body.classList.remove("playing");   // 上のバーを もどす（メニューに行けるように）
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
  if (!grade) return;
  battle = { grade, subj, dur, you: 0, atts: 0, kills: 0, hp: ENEMY_HP, life: PLAYER_HP, cur: null, endAt: performance.now() + dur * 1000, running: true };
  $("#battleSetup").classList.add("hidden"); $("#battleResult").classList.add("hidden"); $("#battleArena").classList.remove("hidden");
  $("#battleFx").textContent = ""; $("#battleFx").className = "battle-fx";
  $("#enemyImg").className = "";
  const yi = $("#youImg"); if (yi) yi.src = youImageSrc();
  document.body.classList.add("playing");      // たたかい中は 上のバーを しまう
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
// 敵の やられ声。前と同じ声は 続けて出さない
let lastDown = -1;
const DOWN_SND = ["down1", "down2", "down3", "down4"];
function enemyDownSnd() {
  let i = Math.floor(Math.random() * DOWN_SND.length);
  if (i === lastDown) i = (i + 1) % DOWN_SND.length;
  lastDown = i;
  sfx(DOWN_SND[i], function () { correctSnd(); });
}
function battleAnswer(val) {
  if (!battle || !battle.running) return;
  battle.atts++;
  if (val === battle.cur.answer) {
    battle.you++; battle.hp--;
    if (battle.hp <= 0) {                       // たおした → たおれてから次の敵が登場
      battle.kills++; battle.hp = ENEMY_HP;
      battleFx(`たおした！ ＋${Math.round(GOLD_PER_KILL * gradeGoldMult(battle.grade))} GOLD`, "kill");
      enemyDownSnd();                 // 敵の やられ声（毎回ちがう）
      coinSnd(0.55);                  // GOLDの音は 声のあとに
      if (battle.kills % 3 === 0) setTimeout(function () { sfx("praise"); }, 1000);   // 3匹ごとに ほめてくれる
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
    maybeDropItem(battle.atts ? Math.round((battle.you / battle.atts) * 100) : 0, !isOut && battle.atts >= 5) +
    `<br><button id="battleAgain">もう一度</button> <button id="battleToKingdom" class="ghost">🧩 パズルへ</button>`;
  renderProfile();
  $("#battleAgain").onclick = () => renderBattle();
  $("#battleToKingdom").onclick = () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="puzzle"]')); };
}
$("#battleStart").addEventListener("click", startBattle);
$("#battleForm").addEventListener("submit", (e) => { e.preventDefault(); battleAnswer(parseInt($("#battleInput").value, 10)); });
$("#battleAnswerBtn").addEventListener("click", () => battleAnswer(currentBattleAnswer()));
$("#battleQuit").addEventListener("click", () => { if (battleTimer) { clearInterval(battleTimer); battleTimer = null; } battle = null; renderBattle(); });

/* ============================================================ 祝福とねぎらい（アプリ全体で使う）
   「音だけで しらせる」のをやめて、画面に大きく出す。
   できたときは 花火と大きな文字、できなかったときも ねぎらいの言葉を出す。 */
const FX_COLORS = ["#ffd35b", "#ff6b6b", "#4dd4ac", "#5aa9ff", "#c77dff", "#fff"];
/* スマホ（とくに iPhone）は 光の粒を たくさん出すと かくかくする。
   小さい画面・指で操作する端末では 粒の数を へらす。動きを減らす設定なら 出さない。 */
const fxLite = () => {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    const touch = window.matchMedia && window.matchMedia("(hover: none)").matches;
    return touch || window.innerWidth <= 820 ? 0.45 : 1;
  } catch (e) { return 1; }
};
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
  n = Math.round((n || 18) * fxLite());
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.className = "fx-p";
    const a = (Math.PI * 2 * i) / Math.max(1, n) + Math.random() * 0.3;
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
  const lite = fxLite();
  rounds = Math.max(lite ? 1 : 0, Math.round((rounds || 5) * (lite ? Math.max(0.5, lite) : 0)));
  for (let r = 0; r < rounds; r++) {
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
  n = Math.round((n || 40) * fxLite());
  for (let i = 0; i < n; i++) {
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
  tipShow(title, bodyHTML, function () { tipDone(key); if (onClose) onClose(); });
  return true;
}
// いつでも 出せる説明（「この級の 解きかたを 見る」ボタンなど）
function tipShow(title, bodyHTML, onClose) {
  const el = fxLayer();
  const d = document.createElement("div");
  d.className = "tip-back";
  d.innerHTML = '<div class="tip-card"><div class="tip-title">' + title + "</div>" +
    '<div class="tip-body">' + bodyHTML + "</div>" +
    '<button class="tip-ok">わかった！</button></div>';
  el.appendChild(d);
  d.querySelector(".tip-ok").onclick = function () { d.remove(); if (onClose) onClose(); };
  return d;
}

/* ============================================================ そろばんパズル
   ロイヤルマッチのような「入れかえて3つそろえる」パズル。
   ★方針：GOLDはここでは増えない（1プレイぶんのGOLDを使って遊ぶ）。
   　　　　GOLDが増えるのは そろばんの学習と ランキングの賞だけ。 */
const PZ_KEY = "soroban_puzzle";
const PZ_W = 8, PZ_H = 8;
const PZ_PLAY_COST = 30;                       // 1プレイに使うGOLD
const PZ_SP_LUCK = 0.10;                       // 3つならべで ロケットが 生まれる確率（本番の盤だけ）
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
  // 盤に置かず、はじめの手数を ふやすもの（手数が たりないときの たすけ）
  { id: "moves5", n: "手数 ＋5", em: "⏱", moves: 5, cost: 30, tip: "はじめから 手数が 5 多い（かさねて 買える）" },
  { id: "rocket", n: "ロケット", em: "🚀", sp: "rh", cost: 40, tip: "はじめから 盤にある。となりと 入れかえると たて か よこ 1れつ 消す" },
  { id: "prop", n: "プロペラ", em: "🚁", sp: "prop", cost: 50, tip: "はじめから 盤にある。入れかえると 目あての玉へ とんでいって 消す" },
  { id: "tnt", n: "TNT", em: "💣", sp: "tnt", cost: 60, tip: "はじめから 盤にある。入れかえると まわり 3×3 を ばくはつ" },
];
// レベル（目あて と 手数）。だんだん むずかしくなる
function pzLevel(n) {
  const kinds = n < 4 ? 4 : 5;                                   // はじめは4種、4面目から5種
  const target = PZ_KINDS[(n - 1) % kinds].k;                    // 集める絵がらは 面ごとに かわる
  // 手数は 上の面ほど 少しずつ増える（前は へっていって 18手で頭打ちだった）
  const moves = 24 + Math.min(12, Math.floor(n / 4));
  // 目あては「手数×割合」で決める。1手で消せる数には かぎりがあるので、
  // これを守らないと 何手あっても 届かない面ができてしまう。
  const hard = Math.min(0.30, n * 0.006);                        // 面が進むほど きつくする
  const kind = n <= 2 ? "color" : ["grass", "color", "box", "color"][(n - 3) % 4];
  // ★ここが 面がクリアできなかった 原因：
  //   前は「盤に置く草の数 ＝ 目あての数」だった。つまり 草を1枚も のこせない＝ほぼ不可能。
  //   盤には 目あてより ずっと多く置いて、そのうち いくつか 消せばよい ことにする。
  if (kind === "grass") {
    const need = Math.max(3, Math.round(moves * (0.20 + hard * 0.18)));
    return { n, kinds, target, need, moves, goal: "grass", grass: Math.min(34, need * 3), box: 0 };
  }
  if (kind === "box") {
    const need = Math.max(3, Math.round(moves * (0.13 + hard * 0.12)));
    return { n, kinds, target, need, moves, goal: "box", grass: 0, box: need + 4 };
  }
  return { n, kinds, target, need: Math.round(moves * (0.50 + hard)), moves, goal: "color", grass: 0, box: 0 };
}
/* ---- 仕掛け（障害物）----
   草：玉が その上で消えると はがれる（動きは じゃましない）
   木箱：となりで そろうと こわれる（1回）。石の箱は 2回いる。玉は通りぬけられない */
const PZ_BLOCK = { box: { n: "木箱", hp: 1 }, stone: { n: "石の箱", hp: 2 } };
function pzMakeStage(lv) {
  const floor = new Array(PZ_W * PZ_H).fill(0), block = new Array(PZ_W * PZ_H).fill(null);
  if (lv.grass) {
    // 草は ばらまかず、かたまりで置く（ねらって消せるように・芝生らしく見えるように）
    let put = 0, guard = 0;
    let cx = 1 + Math.floor(Math.random() * (PZ_W - 2)), cy = 3 + Math.floor(Math.random() * (PZ_H - 4));
    const q = [pzIdx(cx, cy)];
    while (put < lv.grass && guard++ < 900) {
      if (!q.length) {                               // かたまりが とぎれたら 別の場所から
        cx = 1 + Math.floor(Math.random() * (PZ_W - 2)); cy = 3 + Math.floor(Math.random() * (PZ_H - 4));
        q.push(pzIdx(cx, cy));
      }
      const i = q.shift();
      if (i == null || floor[i]) continue;
      floor[i] = 1; put++;
      const x = i % PZ_W, y = (i / PZ_W) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        const nx = x + d[0], ny = y + d[1];
        if (nx >= 0 && ny >= 2 && nx < PZ_W && ny < PZ_H && !floor[pzIdx(nx, ny)]) q.push(pzIdx(nx, ny));
      });
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
const pzLoad = () => { try { return JSON.parse(localStorage.getItem(PZ_KEY) || "null") || { lv: 1, stars: {}, best: 0, plays: 0 }; } catch (e) { return { lv: 1, stars: {}, best: 0, plays: 0 }; } };
const pzSave = (d) => { try { localStorage.setItem(PZ_KEY, JSON.stringify(d)); } catch (e) { console.error("パズルの保存に失敗", e); } };

let pzDelay = null, pzFxQ = [];      // 消える順番（Map）と 見せる演出のならび
function pzShow(o) { if (pzFxQ) pzFxQ.push(o); }
let pz = null;   // 進行中の盤面 { cells, lv, moves, got, sel, busy, items }
let pzUid = 1;
const pzIdx = (x, y) => y * PZ_W + x;
const pzIn = (x, y) => x >= 0 && y >= 0 && x < PZ_W && y < PZ_H;
const pzNewTile = (k) => ({ id: pzUid++, k: k, sp: null, born: true });

/* ---- 盤面をつくる（最初から そろっている所が無いようにする） ---- */
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
    // ロイヤルマッチのように 特殊な玉が よく出るよう、3つならべでも ときどき ロケットが 生まれる（本番の盤だけ）
    else if (line && line.len === 3 && typeof pz !== "undefined" && pz && pz.luck && Math.random() < PZ_SP_LUCK) { sp = line.dir === "h" ? "rh" : "rv"; at = line.cells[1]; }
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
let pzPendingSp = [];                          // この手で 生まれた特殊な玉（手が終わったら 説明を出す）
function pzApply(c, r) {
  r.gone.forEach((i) => { c[i] = null; });
  r.made.forEach((mk) => { if (!c[mk.at]) { c[mk.at] = { id: pzUid++, k: mk.k, sp: mk.sp, born: true }; if (mk.sp) pzPendingSp.push(mk.sp); } });
}
/* はじめて生まれた特殊な玉は、その手が終わったあとに つかい方を 1回だけ 説明する */
const PZ_SP_TIPS = {
  rh: ["🚀 ロケットが できた！", "<p><b>4つ ならべる</b>と ロケットが できるよ。</p><p>ロケットを <b>となりの玉と 入れかえる</b>と、<b>たて か よこ 1れつ</b>を ぜんぶ 消す！</p><p>ロケットどうしを 入れかえると <b>十字</b>に 消えるよ。</p>"],
  tnt: ["💣 TNTが できた！", "<p><b>T字 か L字</b>に ならべると TNTが できるよ。</p><p>TNTを <b>となりの玉と 入れかえる</b>と、<b>まわり 3×3</b> が ばくはつ！</p><p>TNTどうしなら もっと 大きく ばくはつするよ。</p>"],
  prop: ["🚁 プロペラが できた！", "<p><b>2×2 の四角</b>に ならべると プロペラが できるよ。</p><p>プロペラを <b>となりの玉と 入れかえる</b>と、<b>目あての玉</b>へ とんでいって 消す！</p><p>草や 箱が のこっているときにも べんり。</p>"],
  disco: ["✨ 光の玉が できた！", "<p><b>5つ ならべる</b>と 光の玉が できるよ。</p><p>光の玉を <b>どれかの玉と 入れかえる</b>と、<b>その色の玉を ぜんぶ</b> 消す！</p><p>ロケットや TNTと 入れかえると、その色が ぜんぶ ロケット／TNTに なるよ。</p>"],
};
PZ_SP_TIPS.rv = PZ_SP_TIPS.rh;
function pzFlushSpTips() {
  const list = pzPendingSp.slice(); pzPendingSp = [];
  if (typeof document === "undefined" || !$("#pzBoard")) return;
  const seen = {};
  list.forEach(function (sp) {
    const key = "sp-" + (sp === "rv" ? "rh" : sp), t = PZ_SP_TIPS[sp];
    if (!t || seen[key] || tipsSeen()[key]) return;
    seen[key] = 1;
    tipOnce(key, t[0], t[1]);
  });
}
// ロイヤルマッチのように、はじめから 盤に 特殊な玉を 置いておく（本番の盤だけ）
function pzStarterSpecials() {
  if (!pz) return;
  pz.luck = true;
  const n = pz.lv.n >= 6 ? 2 : 1, kinds = ["rh", "rv", "prop", "tnt"];
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < 80; t++) {
      const i = Math.floor(Math.random() * PZ_W * PZ_H);
      if (pz.cells[i] && !pz.cells[i].sp) { pz.cells[i].sp = kinds[Math.floor(Math.random() * kinds.length)]; break; }
    }
  }
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
  // 「手数＋5」のような 盤に置かない道具は、はじめの手数に 足す
  let extra = 0;
  (items || []).forEach(function (it) {
    const d = PZ_ITEMS.find((q) => q.id === it);
    if (d && d.moves) extra += d.moves;
  });
  pz = {
    cells: new Array(PZ_W * PZ_H).fill(null), lv: lv, moves: lv.moves + extra, got: 0, sel: -1,
    busy: false, done: false, combo: 0, score: 0, floor: stage.floor, block: stage.block,
    extraMoves: extra,
  };
  pzFillBoard(lv.kinds);                       // 箱をよけて、そろっていない盤を作る
  if (!pzHasMove(pz.cells)) pzReshuffle();     // 動かせる手が無ければ 作り直す
  // 買ったアイテムを 盤に置く
  (items || []).forEach(function (it) {
    const d = PZ_ITEMS.find((q) => q.id === it);
    if (!d || !d.sp) return;                       // 手数の道具は 盤に置かない
    for (let t = 0; t < 80; t++) {
      const i = Math.floor(Math.random() * PZ_W * PZ_H);
      if (pz.cells[i] && !pz.cells[i].sp) {
        pz.cells[i].sp = d.sp === "rh" ? (Math.random() < 0.5 ? "rh" : "rv") : d.sp;
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
// ※画面からは呼ばない。自動テスト（何百回も遊ばせて むずかしさを測る）が使う 同期版
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
  { id: "moves", n: "手数+5", em: "⏱", cost: 30, tip: "のこり手数を 5 ふやす", now: true },
  { id: "hammer", n: "ハンマー", em: "🔨", cost: 25, tip: "タップした玉を 1つ こわす（手数は へらない）" },
  { id: "rocket", n: "ロケット", em: "🚀", cost: 40, tip: "タップした場所を ロケットにして すぐ 発射（たて か よこ 1れつ）" },
  { id: "prop", n: "プロペラ", em: "🚁", cost: 50, tip: "タップした場所を プロペラにして すぐ 発射（目あての玉へ）" },
  { id: "tnt", n: "TNT", em: "💣", cost: 60, tip: "タップした場所を TNTにして すぐ ばくはつ（まわり 3×3）" },
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
  if (t && t.now) return pzUseNow(t);                 // 手数+5 のように その場で効く道具
  if (pzArmed === id) { pzArmed = null; pzRenderTools(); $("#pzToolTip").textContent = ""; return; }
  if (!pzToolStock(id) && getGold() < t.cost) { pzMsg("GOLDが たりない。そろばんで かせごう！", "ng"); return; }
  pzArmed = id;
  pzRenderTools();
  $("#pzToolTip").textContent = t.n + "：" + t.tip + (pzToolStock(id) ? "" : "（つかうと " + t.cost + "G）");
}
// マスをえらばずに すぐ効く道具（手数+5）
function pzUseNow(t) {
  const stock = pzToolStock(t.id);
  if (!stock) {
    if (getGold() < t.cost) { pzMsg("GOLDが たりないよ", "ng"); return; }
    addGold(-t.cost);
  } else { const d = pzLoad(); d.items[t.id] = stock - 1; pzSave(d); }
  if (t.id === "moves") {
    pz.moves += 5;
    pzMsg("手数を 5 ふやした！", "ok");
    try { sfx("coin", function () { coinSnd(0); }); } catch (e) { }
  }
  pzRenderHud(); pzRenderTools();
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
  else pzFlushSpTips();                        // はじめての特殊な玉なら つかい方を 見せる
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
    $("#pzTally").innerHTML = 'あと <b>' + Math.max(0, pz.lv.need - pz.got) + "</b> こ だったね<br><span class=\"sub\">スコア " + (pz.score || 0).toLocaleString() + "</span>" +
      (getGold() >= PZ_CONT_COST
        ? '<button id="pzCont" class="big-cta pz-cont">⏱ ＋5手 つづける（' + PZ_CONT_COST + 'G）</button>' +
          '<div class="sub">いまの ばんめんの まま つづきます</div>'
        : "");
    try { wrongSnd(); } catch (e) { }
    pzCeremonyButtons(false);
    const ct = $("#pzCont"); if (ct) ct.onclick = pzContinue;
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
  const before = d.star || 0;
  d.star = before + st;
  // 9個ためるごとに ごほうび（画面に「あと n ★」と出している約束を 守る）
  const gotBonus = Math.floor(d.star / 9) - Math.floor(before / 9);
  if (gotBonus > 0) pzGiveItem(d, "moves5", gotBonus);
  pzSave(d);
  const nextAt = Math.ceil((d.star + 1) / 9) * 9;
  tal.innerHTML += '<div class="pz-meter"><span>あつめた ★</span><b>' + d.star + "</b>" +
    '<i class="pz-meter-bar"><u style="width:' + Math.round((d.star % 9) / 9 * 100) + '%"></u></i>' +
    "<small>つぎの ごほうびまで あと " + Math.max(1, nextAt - d.star) + " ★</small></div>" +
    (gotBonus > 0 ? '<div class="pz-gift-item">★9こ たまった！ ⏱ <b>手数 ＋5 ×' + gotBonus + "</b> を もらった！</div>" : "");
  await pzWait(gotBonus > 0 ? 700 : 420);
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
    pzGiveItem(d, "rocket", 1); pzSave(d);
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
// 手数ぎれから GOLDを払って つづける（盤はそのまま）
const PZ_CONT_COST = 40;
function pzContinue() {
  if (!pz || getGold() < PZ_CONT_COST) return;
  addGold(-PZ_CONT_COST);
  pz.moves = 5; pz.done = false; pz.busy = false;
  if (!pzHasMove(pz.cells)) pzReshuffle();
  const ov = $("#pzOver"); ov.classList.add("hidden"); ov.innerHTML = "";
  pzSync(); pzRenderHud(); pzRenderTools();
  pzMsg("＋5手！ もうひとふんばり", "ok");
  try { sfx("coin", function () { coinSnd(0); }); } catch (e) { }
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
    '<div class="pz-items-h">アイテム（GOLDで 買うと はじめから 盤に あるよ）</div>' +
    '<div class="sub pz-howto">つかい方：特殊な玉を <b>となりの玉と 入れかえる</b>と はっしゃ！　4つならべ＝🚀　T字・L字＝💣　2×2＝🚁　5つならべ＝✨</div>' + items +
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
    pzStart(pzLoad().lv, list); pzStarterSpecials();
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
  if (!pz) tipOnce("first-puzzle", TIP_PUZZLE.t, TIP_PUZZLE.b);
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
$("#homeStartBtn").addEventListener("click", () => { const g = homeGrade(); tipOnce("first-routine", TIP_ROUTINE.t, TIP_ROUTINE.b, () => startRoutine(g)); });
$("#homeToKingdom").addEventListener("click", () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="puzzle"]')); });
$("#homeToRecords").addEventListener("click", () => { showView("records"); setActiveNav(document.querySelector('.nav[data-view="records"]')); });

/* ============================================================ つかっている素材の 出どころ（魔王魂は 表記が きまり） */
function creditHTML() {
  return "<p><b>BGM</b>：魔王魂（https://maou.audio/）<br>" +
    "魔王魂の素材は 商用利用できますが、<b>クレジット表記が 必要</b>です。この表示を 消さないでください。</p>" +
    "<p><b>効果音</b>：効果音ラボ（https://soundeffect-lab.info/）<br>" +
    "商用利用・クレジット表記なしで つかえます（音源ファイルそのものの 再配布は できません）。</p>" +
    "<p><b>イラスト</b>：生成AIで 作ったものを つかっています。</p>" +
    "<p><b>問題の内容</b>：出題の形式（桁数・口数）は、公開されている 珠算検定の 出題例を 参考にした <b>このアプリ独自</b>の めやすです。問題は すべて このアプリが その場で 作っています（数字を どこかから 写して いません）。" +
    "当アプリは 個人が 作った 非公式の 練習アプリで、珠算の 検定を 行う 団体とは 一切 関係ありません。</p>";
}

/* ============================================================ 説明用の そろばんの絵（SVG）
   画像ファイルを 足さずに、コードで そろばんを描く。num は 0〜99。
   prev を渡すと「動いた珠」を 橙色にして 目立たせる。 */
function sbSVG(num, prev, scale, colsWanted) {
  const need = Math.max(String(Math.max(num || 0, prev || 0)).length, 2);
  const cols = colsWanted || need, W = 46, BH = 16, pad = 8;
  const digits = (n) => { const a = []; for (let c = cols - 1; c >= 0; c--) a.push(Math.floor((n / Math.pow(10, c)) % 10)); return a; };
  const cur = digits(num), old = prev == null ? null : digits(prev);
  const barY = BH * 2 + 6, H = BH * 7 + 16, TW = cols * W + pad * 2;
  const bead = (cx, y, hl) => '<polygon points="' + (cx - 17) + "," + (y + BH / 2 - 1) + " " + cx + "," + y + " " + (cx + 17) + "," + (y + BH / 2 - 1) + " " + cx + "," + (y + BH - 2) +
    '" fill="' + (hl ? "#ff9f2e" : "#a5552a") + '" stroke="' + (hl ? "#c0392b" : "#5a2d12") + '" stroke-width="1.5"/>';
  let o = '<svg class="sb-svg" viewBox="0 0 ' + TW + " " + H + '" width="' + Math.round(TW * (scale || 1)) + '" aria-hidden="true">' +
    '<rect x="2" y="2" width="' + (TW - 4) + '" height="' + (H - 4) + '" rx="6" fill="#e9e4d8" stroke="#1c1c1c" stroke-width="4"/>' +
    '<rect x="2" y="' + barY + '" width="' + (TW - 4) + '" height="4" fill="#222"/>';
  for (let c = 0; c < cols; c++) {
    const cx = pad + c * W + W / 2, d = cur[c], od = old ? old[c] : d;
    o += '<rect x="' + (cx - 1.5) + '" y="4" width="3" height="' + (H - 8) + '" fill="#aaa"/>';
    o += bead(cx, d >= 5 ? barY - BH + 2 : 5, old && (od >= 5) !== (d >= 5));            // 五玉：下に よせると 入る
    const e = d % 5, oe = od % 5;
    for (let j = 0; j < 4; j++) {                                                             // 一玉：上に よせると 入る
      const slot = j < e ? j : j + 1;
      o += bead(cx, barY + 7 + slot * BH, old && (j < e) !== (j < oe));
    }
    if (c === cols - 1) o += '<circle cx="' + cx + '" cy="' + (barY + 2) + '" r="3.2" fill="#c0392b" stroke="#fff" stroke-width="1"/>';
  }
  return o + "</svg>";
}
// 「まえ → あと」の 2枚ならべ。cap は 下の説明
function sbStep(a, b, cap, cols) {
  return '<div class="sb-step"><div class="sb-pair">' + sbSVG(a, null, 1, cols) + '<span class="sb-ar">→</span>' + sbSVG(b, a, 1, cols) + "</div>" +
    (cap ? '<div class="sb-cap">' + cap + "</div>" : "") + "</div>";
}

/* ============================================================ はじめての案内（1回だけ 出る） */
const TIP_OPEN = { t: "👑 そろばんキングダムへ ようこそ！",
  b: '<ol class="tip-steps"><li><b>そろばん</b>で れんしゅうすると</li><li><b>GOLD</b>（きんか）が たまって</li><li><b>パズル</b>や <b>たいせん</b>で あそべるよ</li></ol>' +
     '<p>まずは <b>「今日の練習を始める」</b>を おしてみよう。はじめは <b>20級</b>からだよ。</p>' };
const TIP_PLAY = { t: "🧮 そろばんの つかいかた",
  b: sbStep(0, 3, "たまを <b>ゆびで なぞる</b>と うごくよ。上に よせると「入る」") +
     '<p>🔴 <b>あかい点</b>の れつが「一のくらい」。<br>できたら <b>「こたえる」</b>を おそう。まちがえても だいじょうぶ！</p>' };
const TIP_ROUTINE = { t: "🔥 本日の練習って？",
  b: '<p>きょうの ぶんを <b>じゅんばんに</b> やる メニューだよ。</p>' +
     '<ol class="tip-steps"><li>いくつかの セットを とく</li><li>あいだに <b>きゅうけい</b>が 入る（とばしても いい）</li><li>さいごに <b>せいせき はっぴょう</b>！</li></ol>' +
     '<p>とちゅうで やめても、また はじめから できるよ。</p>' };
const TIP_RESULT = { t: "🔍 ここが いちばん だいじ",
  b: '<p>この下に、<b>まちがえた もんだい</b>が 1つずつ、<b>たまの うごき</b>で せつめいされているよ。</p>' +
     '<p>「どこで まちがえたか」が わかると、つぎは できるようになる。<br>ゆっくり 見てみよう。</p>' };
const TIP_PUZZLE = { t: "🧩 パズルの あそびかた",
  b: '<p>となりの たまと <b>入れかえて</b>、おなじ たまを <b>3つ ならべる</b>と きえるよ。</p>' +
     '<p>1回 あそぶのに <b>GOLD</b>を つかうよ。GOLDは <b>そろばんの れんしゅう</b>で たまる。<br>パズルでは ふえないよ。</p>' };
function tipFirstOpen() { tipOnce("first-open", TIP_OPEN.t, TIP_OPEN.b); }

/* ============================================================ 入門級（20〜15級）の 絵つき説明
   ANZAN_LOW に決めた 学習の順（5の友 → くり上がりなし → 10の友 → くり上がり）に そって、
   その級を はじめる前に 1回だけ 見せる。 */
const LESSON_LOW = {
  20: { t: "20級：たまの いみ",
    b: '<p><b>一玉（いちだま）</b>は 1。上に よせると 入るよ。<br><b>五玉（ごだま）</b>は 5。下に よせると 入るよ。</p>' +
       sbStep(0, 3, "1 + 2 ＝ 3　一玉を 1つ、また 2つ 入れる") + sbStep(0, 5, "5 は 五玉 1つ") +
       '<p class="un-note">本物の そろばんを つかうときは、<b>おやゆび</b>で 一玉を 上げ、<b>ひとさしゆび</b>で 下げます。' +
       'くわしくは 上の 📖「そろばんの きほん」を 見てね。</p>' +
       '<p>こたえが <b>5まで</b>の もんだいを やってみよう！</p>' },
  19: { t: "19級：5の友（とも）",
    b: '<p>一玉が たりないときは、<b>五玉を 入れて</b> あまりを <b>はらう</b>よ。</p>' +
       '<p class="ls-key"><b>5の友</b>：1と4 ／ 2と3</p>' +
       sbStep(3, 7, "3 + 4：一玉が たりない → 五玉を 入れて、4の友の <b>1</b>を はらう") +
       '<p>こたえが <b>9まで</b>。くり上がりは まだ ないよ。</p>' },
  18: { t: "18級：五玉を つかう",
    b: '<p>6・7・8・9 は <b>五玉 ＋ 一玉</b>だよ。</p>' +
       sbStep(6, 9, "6 + 3 ＝ 9　一玉を 3つ 入れる") + sbStep(4, 8, "4 + 4：一玉が たりない → 五玉を 入れて 1を はらう") +
       '<p>こたえが <b>6〜10</b>の もんだいだよ。</p>' },
  17: { t: "17級：くり上がり（10の友）",
    b: '<p>9より 大きくなるときは、<b>となりの くらいに 1</b>を 入れて、<b>10の友</b>を はらうよ。</p>' +
       '<p class="ls-key"><b>10の友</b>：1と9 ／ 2と8 ／ 3と7 ／ 4と6 ／ 5と5</p>' +
       sbStep(8, 13, "8 + 5：十のくらいに 1 を 入れて、5の友の <b>5</b>を はらう → 13") +
       '<p>こたえが <b>11〜18</b>の もんだいだよ。</p>' },
  16: { t: "16級：3つの かず",
    b: '<p>かずが <b>3つ</b>に なるよ。<b>じゅんばんに</b> たしていこう。</p>' +
       sbStep(2, 5, "2 + 3 ＝ 5") + sbStep(5, 9, "つづけて + 4 ＝ 9") +
       '<p>くり上がりは ないよ。1つずつ たしかめながら 進もう。</p>' },
  15: { t: "15級：3つの かず と くり上がり",
    b: '<p>3つの かずで、<b>くり上がり</b>も 出てくるよ。</p>' +
       sbStep(7, 11, "7 + 4：十のくらいに 1、6を はらう → 11") + sbStep(11, 18, "つづけて + 7 ＝ 18") +
       '<p>あわてなくて いいよ。1つずつ たしかめよう。</p>' },
  14: { t: "14級：5の友で ひく",
    b: '<p>ひき算も 同じ。一玉が <b>たりないとき</b>は、<b>五玉を はらって</b> 友の かずを <b>入れる</b>よ。</p>' +
       '<p class="ls-key"><b>5の友</b>：1と4 ／ 2と3</p>' +
       sbStep(7, 4, "7 − 3：一玉が たりない → 五玉を はらって、3の友の <b>2</b>を 入れる") +
       sbStep(6, 2, "6 − 4：五玉を はらって、4の友の <b>1</b>を 入れる") },
  13: { t: "13級：くり下がり（10の友で ひく）",
    b: '<p>ひけないときは、<b>十のくらいから 1 を はらって</b>、<b>10の友</b>を 入れるよ。</p>' +
       '<p class="ls-key"><b>10の友</b>：1と9 ／ 2と8 ／ 3と7 ／ 4と6 ／ 5と5</p>' +
       sbStep(13, 7, "13 − 6：十のくらいの 1 を はらって、6の友の <b>4</b>を 入れる → 7") +
       sbStep(15, 8, "15 − 7：十のくらいの 1 を はらって、7の友の <b>3</b>を 入れる → 8") },
  12: { t: "12級：たしたり ひいたり",
    b: '<p>3つの かずを、<b>上から じゅんばんに</b>。たし算と ひき算が まざっても、1つずつ やれば だいじょうぶ。</p>' +
       sbStep(9, 13, "9 + 4 ＝ 13（くり上がり）") + sbStep(13, 8, "つづけて − 5 ＝ 8（五玉を はらう）") },
  11: { t: "11級：はやく、せいかくに",
    b: '<p>やり方は もう ぜんぶ 知っているよ。ここからは <b>手を 止めない</b>れんしゅう。</p>' +
       '<ul><li>かずを 見たら <b>すぐ</b> 玉を 動かす</li><li>まよったら 🔴 <b>一のくらい</b>を 見る</li><li>まちがえても <b>ご破算（0にする）</b>で やり直せる</li></ul>' +
       sbStep(6, 14, "6 + 8 ＝ 14") + sbStep(14, 5, "つづけて − 9 ＝ 5") },
  10: { t: "10級：2けたの かず",
    b: '<p>2けたに なっても 同じ。<b>左（十のくらい）から</b> 入れていくよ。</p>' +
       sbStep(23, 68, "23 + 45：十のくらい 2+4、一のくらい 3+5 → 68") +
       sbStep(47, 85, "47 + 38：十のくらい 4+3=7、一のくらい 7+8 は くり上がり → 十に 1、8の友 2を はらう → 85") +
       '<p>かずが 5つ つづくよ。<b>1つ たすごとに</b> そろばんを 見て たしかめよう。</p>' },
};
// かけ算（9級から）・わり算（7級から）の はじめての説明
const LESSON_KAKE = { t: "9級：かけ算の やりかた",
  b: '<p>かけ算は <b>九九を 1つずつ</b> そろばんに たしていくよ。</p>' +
     '<p class="ls-key">23 × 4 → <b>20×4</b> と <b>3×4</b> に わける</p>' +
     sbStep(0, 80, "まず 20 × 4 ＝ 80 を 入れる", 3) + sbStep(80, 92, "つぎに 3 × 4 ＝ 12 を たす → 92", 3) +
     '<p>コツ：九九の答えが 1けたのときは「<b>0</b>6」のように 0を つけて、<b>2けたぶんの 場所</b>に 入れる。</p>' };
const LESSON_WARI = { t: "7級：わり算の やりかた",
  b: '<p>わり算は <b>大きい くらいから</b>「いくつ 入るか」を 考えるよ。</p>' +
     '<p class="ls-key">84 ÷ 4 → 十のくらいの <b>8</b> から</p>' +
     sbStep(84, 21, "8 に 4 は 2つ → 十のくらいに <b>2</b>。のこりの 4 に 4 は 1つ → 一のくらいに <b>1</b>。こたえ 21") +
     '<p>コツ：入る数を 大きく とりすぎたら、1つ もどして やり直す。<b>あまり</b>は 出ないように 作ってあるよ。</p>' };
function lessonFor(g, subj) {
  if (!g || g.band !== "kyu") return null;
  if (subj === "kake" && g.kyu === 9) return LESSON_KAKE;
  if (subj === "wari" && g.kyu === 7) return LESSON_WARI;
  if ((subj === "mitori" || subj === "anzan") && LESSON_LOW[g.kyu]) return LESSON_LOW[g.kyu];
  return null;
}
// はじめる前に：その級の説明 → はじめての そろばんの説明 → 開始
function startWithTips(subj) {
  const g = currentGrade();
  const cf = SUBJECT[subj] || {};
  const go = () => startSession(subj);
  const step3 = () => { if (cf.answer === "soroban") tipOnce("first-finger", TIP_FINGER.t, TIP_FINGER.b, go); else go(); };
  const step2 = () => { if (cf.answer === "soroban") tipOnce("first-play", TIP_PLAY.t, TIP_PLAY.b, step3); else go(); };
  const L = lessonFor(g, subj);
  if (L) tipOnce("lesson-" + g.kyu, L.t, L.b, step2); else step2();
}

/* ============================================================ そろばんの きほん（画面） */
function renderLesson() {
  const box = $("#lessonBody"); if (!box) return;
  const sec = (open, title, body) => "<details" + (open ? " open" : "") + "><summary>" + title + '</summary><div class="lesson-body">' + body + "</div></details>";
  box.innerHTML =
    sec(true, "① たまの なまえ",
      '<p><b>一玉（いちだま）</b>＝1。上に よせると 入る。<br><b>五玉（ごだま）</b>＝5。下に よせると 入る。<br>' +
      'まん中の 黒い ぼうが <b>はり</b>。🔴 あかい点の れつが <b>一のくらい</b>。</p>' +
      '<div class="sb-pair">' + sbSVG(0) + '<span class="sb-ar">→</span>' + sbSVG(7, 0) + '</div><div class="sb-cap">7 ＝ 五玉 1つ ＋ 一玉 2つ</div>') +
    sec(true, "② ゆびの つかいかた（運指）", unshiHTML(true)) +
    sec(false, "③ 5の友（とも）",
      '<p>一玉が たりないときは、<b>五玉を 入れて</b> 友の かずを <b>はらう</b>。</p><p class="ls-key">1と4 ／ 2と3</p>' +
      sbStep(3, 7, "3 + 4 → 五玉を 入れて 1を はらう") + sbStep(7, 4, "7 − 3 → 五玉を はらって 2を 入れる（ひき算は ぎゃく）")) +
    sec(false, "④ 10の友（くり上がり・くり下がり）",
      '<p>10を こえるときは、<b>となりの くらいに 1</b>を 入れて、10の友を はらう。</p><p class="ls-key">1と9 ／ 2と8 ／ 3と7 ／ 4と6 ／ 5と5</p>' +
      sbStep(8, 13, "8 + 5 → 十のくらいに 1、5を はらう") + sbStep(13, 7, "13 − 6 → 十のくらいの 1を はらって、4を 入れる")) +
    sec(false, "⑤ かけ算（9級から）", LESSON_KAKE.b) +
    sec(false, "⑥ わり算（7級から）", LESSON_WARI.b) +
    sec(false, "⑦ けんていの きまり（めやす）",
      '<p>珠算（そろばん）：1しゅもく 15もん・7分・150点まん点で <b>100点いじょう</b> ごうかく。<br>' +
      '暗算：20もん・3分・100点まん点で <b>70点いじょう</b>。<br>フラッシュ暗算：20もん・200点まん点で <b>140点いじょう</b>。</p>' +
      '<p class="sub">公開されている 珠算検定の 出題例を 参考にした、このアプリ独自の めやすです。よその 検定とは 関係ありません。</p>') +
    // おうちの人・先生が じっくり 読める、印刷しやすい 解説ページ（検索からも 来られる）
    '<div class="lesson-links"><b>くわしい解説（べつのページ）</b>' +
    '<a href="soroban-yubi.html">✋ 指づかい（運指）</a>' +
    '<a href="soroban-tomo.html">🖐 5の友・10の友</a>' +
    '<a href="soroban-kyu.html">📘 級のレベルの めやす</a></div>';
}


/* ============================================================ 運指（うんし）＝ ゆびの つかいかた
   そろばんの「型」。かぎられた時間で 速く 正確に はじくために、むだな動きを なくす。
     ① 1珠（下の4つ）を 上げる  … おやゆび（青）
     ② 1珠を 下げる            … ひとさしゆび（赤）
     ③ 5珠（上の1つ）を 動かす  … ひとさしゆび（赤・上げも下げも）
   1桁ぶんの そろばんを 描き、動く珠の よこに「どの指で・どっち向きか」の 矢印を つける。 */
const FINGER = { thumb: { n: "おやゆび", c: "#2b6fd0", em: "👍" }, index: { n: "ひとさしゆび", c: "#c0392b", em: "☝" } };
// 1桁ぶん：before → after で 動く珠と つかう指
function unshiColMoves(before, after) {
  const hb = before >= 5, ha = after >= 5, eb = before % 5, ea = after % 5, out = [];
  if (hb !== ha) out.push({ bead: "heaven", dir: ha ? "down" : "up", finger: "index" });   // ③ 5珠は いつも ひとさしゆび
  if (eb !== ea) out.push({ bead: "earth", dir: ea > eb ? "up" : "down", finger: ea > eb ? "thumb" : "index" });  // ①② 1珠
  return out;
}
const unshiDigits = (n, cols) => { const a = []; for (let c = cols - 1; c >= 0; c--) a.push(Math.floor(n / Math.pow(10, c)) % 10); return a; };
function unshiMovesOf(before, after, cols) {
  const b = unshiDigits(before, cols), a = unshiDigits(after, cols);
  return b.map((x, i) => unshiColMoves(x, a[i]));
}
/* そろばんの絵。cols 桁ぶん。byCol は 桁ごとの 動き（矢印を 出す） */
function unshiSVG(val, byCol, cols) {
  cols = cols || 1;
  const W = cols > 1 ? 62 : 78, BH = 20, pad = 10, barY = BH * 2 + 8, H = BH * 7 + 22, TW = cols * W + pad * 2;
  const half = W / 2 - 6;
  const bead = (cx, y, on) => '<polygon points="' + (cx - half) + "," + (y + BH / 2 - 1) + " " + cx + "," + y + " " + (cx + half) + "," + (y + BH / 2 - 1) + " " + cx + "," + (y + BH - 2) +
    '" fill="' + (on ? "#ff9f2e" : "#a5552a") + '" stroke="' + (on ? "#c0392b" : "#5a2d12") + '" stroke-width="2"/>';
  /* 動く道すじに 色の帯を しき、矢印は 珠の 上に かさねて 桁のまん中に 引く。
     こうすると「どの桁の どの珠が どっちへ 動くか」が 一目で わかる。 */
  const band = (cx, y0, y1, col) => '<rect x="' + (cx - half - 3) + '" y="' + Math.min(y0, y1) + '" width="' + (half * 2 + 6) +
    '" height="' + Math.abs(y1 - y0) + '" rx="9" fill="' + col + '" opacity=".16"/>';
  const arrow = (cx, y0, y1, col) => {
    const up = y1 < y0, base = up ? y1 + 11 : y1 - 11;
    const head = (cx - 8) + "," + base + " " + (cx + 8) + "," + base + " " + cx + "," + y1;
    return '<line x1="' + cx + '" y1="' + y0 + '" x2="' + cx + '" y2="' + base + '" stroke="#fff" stroke-width="9" stroke-linecap="round"/>' +
      '<polygon points="' + head + '" fill="#fff" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>' +
      '<line x1="' + cx + '" y1="' + y0 + '" x2="' + cx + '" y2="' + base + '" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/>' +
      '<polygon points="' + head + '" fill="' + col + '"/>';
  };
  const digs = unshiDigits(val, cols);
  let o = '<svg class="un-svg" viewBox="0 0 ' + TW + " " + H + '" width="' + TW + '" aria-hidden="true">' +
    '<rect x="2" y="2" width="' + (TW - 4) + '" height="' + (H - 4) + '" rx="7" fill="#e9e4d8" stroke="#1c1c1c" stroke-width="5"/>' +
    '<rect x="2" y="' + barY + '" width="' + (TW - 4) + '" height="5" fill="#222"/>';
  const hTop = 14, hBot = barY - 6, eTop = barY + 16, eBot = H - 14;   // 5珠／1珠が 動ける はんい
  for (let c = 0; c < cols; c++) {
    const cx = pad + c * W + W / 2, d = digs[c], mv = (byCol && byCol[c]) || [];
    const hv = mv.find((m) => m.bead === "heaven"), er = mv.find((m) => m.bead === "earth"), e = d % 5;
    o += '<rect x="' + (cx - 2) + '" y="6" width="4" height="' + (H - 12) + '" fill="#aaa"/>';
    if (hv) o += band(cx, hTop - 6, hBot + 6, FINGER[hv.finger].c);     // ①帯（いちばん下）
    if (er) o += band(cx, eTop - 6, eBot + 6, FINGER[er.finger].c);
    o += bead(cx, d >= 5 ? barY - BH + 2 : 6, !!hv);                     // ②珠
    for (let j = 0; j < 4; j++) o += bead(cx, barY + 9 + (j < e ? j : j + 1) * BH, !!er);
    if (hv) o += hv.dir === "down" ? arrow(cx, hTop, hBot, FINGER[hv.finger].c) : arrow(cx, hBot, hTop, FINGER[hv.finger].c);   // ③矢印（いちばん上）
    if (er) o += er.dir === "up" ? arrow(cx, eBot, eTop, FINGER[er.finger].c) : arrow(cx, eTop, eBot, FINGER[er.finger].c);
    if (c === cols - 1) o += '<circle cx="' + cx + '" cy="' + (barY + 2) + '" r="3.4" fill="#c0392b" stroke="#fff" stroke-width="1"/>';
  }
  return o + "</svg>";
}
/* 「◯ → ◯」の1組と、どの指を つかうかの ふだ */
function unshiStep(before, after, cap, cols, note) {
  cols = cols || Math.max(String(Math.max(before, after)).length, 1);
  const byCol = unshiMovesOf(before, after, cols), flat = byCol.reduce((a, x) => a.concat(x), []);
  const tags = Array.from(new Set(flat.map((m) => m.finger))).map((f) =>
    '<span class="un-tag" style="background:' + FINGER[f].c + '">' + FINGER[f].em + " " + FINGER[f].n + "</span>").join("");
  return '<div class="un-step"><div class="un-pair">' + unshiSVG(before, byCol, cols) + '<span class="un-ar">→</span>' + unshiSVG(after, null, cols) + "</div>" +
    '<div class="un-tags">' + tags + (flat.length > 1 ? '<span class="un-both">同時に！</span>' : "") + "</div>" +
    '<div class="un-cap">' + cap + "</div>" + (note ? '<div class="un-why">' + note + "</div>" : "") + "</div>";
}
/* 運指の説明。本物の そろばんを つかうときの ゆびの動かし方 */
function unshiHTML(full) {
  let o = '<p class="un-lead">どんな 習いごとにも <b>「型（かた）」</b>が あります。' +
    'そろばんの 型は、まさに この <b>指づかい</b>です。</p>' +
    '<p class="un-lead">そろばんは <b>かぎられた時間で、速く 正確に</b> はじくもの。' +
    'そのために <b>むだな 動きを しない</b> きれいな 指づかいが 必要です。' +
    'つかうのは <b>右手の おやゆび と ひとさしゆび の 2本だけ</b>。</p>' +
    '<p class="un-h">指づかいの ルールは 3つだけ</p>' +
    '<div class="un-rule"><span class="un-no">①</span><span class="un-tag" style="background:' + FINGER.thumb.c + '">👍 おやゆび</span>' +
    '<span class="un-txt"><b>1珠</b>（下の4つの珠）を <b>上げる</b>とき</span></div>' +
    unshiStep(0, 3, "3 を 入れる … <b>おやゆび</b>で 下から 上へ") +
    '<div class="un-rule"><span class="un-no">②</span><span class="un-tag" style="background:' + FINGER.index.c + '">☝ ひとさしゆび</span>' +
    '<span class="un-txt"><b>1珠</b>を <b>下げる</b>とき</span></div>' +
    unshiStep(3, 0, "3 を はらう … <b>ひとさしゆび</b>で 上から 下へ") +
    '<div class="un-rule"><span class="un-no">③</span><span class="un-tag" style="background:' + FINGER.index.c + '">☝ ひとさしゆび</span>' +
    '<span class="un-txt"><b>5珠</b>（上の1つの珠）を <b>動かす</b>とき（上げるのも 下げるのも）</span></div>' +
    unshiStep(0, 5, "5 を 入れる … <b>ひとさしゆび</b>で 下げる") +
    unshiStep(5, 0, "5 を はらう … <b>ひとさしゆび</b>で 上げる");
  if (full) {
    o += '<p class="un-h">なぜ この ルールなのか</p>' +
      '<p class="un-lead">ルールには <b>ちゃんと 理由</b>が あります。やってみると わかります。</p>' +
      '<p class="un-ex">れい ①　<b>3 ＋ 2</b>　（5をたして、3をひく）</p>' +
      unshiStep(3, 5, "5珠を 下げる と 1珠を 下げる。<b>どちらも ひとさしゆび</b>",
        1, "ひとさしゆびを <b>上から下へ 1回 すべらせる</b>だけで おわります。<br>" +
        "もし 3を <b>おやゆび</b>で ひこうとすると、指を もちかえる ぶん 手間と 時間が かかります。") +
      '<p class="un-ex">れい ②　<b>1 ＋ 9</b>　（1をひいて、10をたす）</p>' +
      unshiStep(1, 10, "1珠を 下げる（ひとさしゆび）と、となりに 10を 入れる（おやゆび）",
        2, "<b>ひとさしゆびで 1を 下げながら、同時に おやゆびで 10を たせます。</b><br>" +
        "もし 1を <b>おやゆび</b>で ひくと、ひき終わるまで 10を たせません。<br>" +
        "ぎゃくに 1を おやゆび・10を ひとさしゆび に すると、<b>指が 交差して</b> もっと 手間で、つぎの 動きも おそくなります。") +
      '<p class="un-note">桁の多い 問題を はじくように なると よく わかります。このルールで 動かすと、指が とても なめらかで むだが 少ないのです。' +
      '<br><b>この 基礎を ばかにせず、しっかり 身につけたか どうかで、そのあとの のびが 確実に 変わります。</b></p>' +
      '<p class="un-h">はじめる まえの かまえ</p>' +
      '<ul class="un-list"><li>そろばんは <b>体の まん中</b>に、まっすぐ おく</li>' +
      '<li><b>左手</b>で そろばんの 左はしを おさえる（ずれない ように）</li>' +
      '<li>えんぴつは <b>くすりゆび と こゆび</b>で はさんで もつ。おやゆびと ひとさしゆびが 自由に なり、はじきながら 書ける</li>' +
      '<li>珠は 指の <b>つめの ちかく</b>で、かるく はじく</li></ul>' +
      '<p class="un-h">ご破算（ごわさん）＝ 0に もどす</p>' +
      '<ul class="un-list"><li><b>ひとさしゆび</b>を 梁（はり）の 上に あてて、左から右へ すべらせる → 5珠が ぜんぶ 上がる</li>' +
      '<li>つづけて <b>おやゆび</b>を 梁の 下に あてて、左から右へ すべらせる → 1珠が ぜんぶ 下がる</li>' +
      '<li>なれてきたら、2本の 指で <b>はさむように</b> 一回で すべらせる</li></ul>' +
      '<p class="un-note">かなりの 有段者に なると「1珠は おやゆびだけ、5珠は ひとさしゆびだけ」という 人も いますが、' +
      '<b>基本は 上の 3つ</b>です。<br><br>' +
      'このアプリの 画面の そろばんは、ゆびで <b>なぞる</b>だけで うごきます。' +
      'でも <b>本物の そろばん</b>を つかうときは、上の 指づかいに してください。' +
      '「級・段を選ぶ」で <b>「じぶんの そろばんを つかう」</b>に すると、本物で れんしゅうできます。</p>';
  }
  return o;
}
const TIP_FINGER = { t: "✋ 指づかいが そろばんの「型」", b: unshiHTML(false) +
  '<p class="un-note">なぜ この ルールなのか、かまえ、ご破算の しかたは' +
  '<b>「そろばんの きほん」</b>（上の 📖 ボタン）で 見られます。</p>' };


/* ============================================================ 印刷プリント（宿題用紙）
   先生・おうちの人が いちばん 欲しがる機能。
   アプリと 同じ出題のしくみを つかうので、級の むずかしさが ずれない。
   紙で 解いて、答え合わせは 別紙（解答）で。 */
const SHEET_KEY = "soroban_sheet";
let sheetData = null;                       // いま 作ってある 用紙（印刷・作り直し用）
function sheetPrefs() {
  try { return JSON.parse(localStorage.getItem(SHEET_KEY) || "null") || { subj: "mitori", n: 10, pages: 1 }; }
  catch (e) { return { subj: "mitori", n: 10, pages: 1 }; }
}
function sheetSave(p) { try { localStorage.setItem(SHEET_KEY, JSON.stringify(p)); } catch (e) { } }

/* 1枚ぶんの 問題を 作る */
function sheetMake(grade, subj, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = genProblemFor(grade, subj);
    if (!p) break;
    out.push(p);
  }
  return out;
}
/* みとり算・あんざん：検定の用紙と 同じ「たてに 数字を ならべる」形。5問ずつ 段に分ける */
function sheetMitoriHTML(list) {
  const rows = [];
  for (let s = 0; s < list.length; s += 5) rows.push(list.slice(s, s + 5));
  return rows.map((row, ri) =>
    '<table class="sh-mt"><tr>' +
    row.map((p, i) => '<th>' + (ri * 5 + i + 1) + "</th>").join("") + "</tr><tr>" +
    row.map((p) => {
      const cells = p.nums.map((v, k) => '<div class="sh-n">' + (k === 0 ? "" : v < 0 ? "−" : "+") + " " + Math.abs(v).toLocaleString() + "</div>").join("");
      return "<td>" + cells + '<div class="sh-ans"></div></td>';
    }).join("") + "</tr></table>"
  ).join("");
}
/* かけ算・わり算：1問1行。答えは 右の わくに 書く */
function sheetLineHTML(list) {
  const half = Math.ceil(list.length / 2), cols = [list.slice(0, half), list.slice(half)];
  return '<div class="sh-cols">' + cols.map((col, c) =>
    '<div class="sh-col">' + col.map((p, i) =>
      '<div class="sh-row"><span class="sh-no">' + (c * half + i + 1) + '</span>' +
      '<span class="sh-q">' + p.display + "</span>" +
      '<span class="sh-blank"></span></div>').join("") + "</div>").join("") + "</div>";
}
/* 解答（先生・おうちの人用） */
function sheetAnswerHTML(pages) {
  return pages.map((pg, pi) =>
    '<div class="sh-akey"><b>' + (pages.length > 1 ? (pi + 1) + "枚目の " : "") + "こたえ</b>" +
    pg.map((p, i) => '<span class="sh-akey-i">' + (i + 1) + ". <b>" + p.answer.toLocaleString() + "</b></span>").join("") + "</div>"
  ).join("");
}
function renderSheet() {
  const sel = $("#sheetGrade");
  if (sel && !sel.dataset.filled) {
    sel.innerHTML = GRADES.map((g, i) => '<option value="' + i + '">' + g.key + "</option>").join("");
    sel.dataset.filled = "1";
    const rk = JSON.parse(localStorage.getItem(RANK) || "null");
    sel.value = rk ? rk.idx : gradeIdx;
  }
  const p = sheetPrefs();
  const ss = $("#sheetSubj"); if (ss) ss.value = p.subj;
  const sn = $("#sheetN"); if (sn) sn.value = String(p.n);
  const sp = $("#sheetPages"); if (sp) sp.value = String(p.pages);
  sheetUpdateSubj();
}
// その級に ない種目は えらべなくする
function sheetUpdateSubj() {
  const g = GRADES[+$("#sheetGrade").value], ss = $("#sheetSubj");
  if (!g || !ss) return;
  Array.from(ss.options).forEach((o) => { o.disabled = !difficulty(g, o.value); });
  if (ss.selectedOptions[0] && ss.selectedOptions[0].disabled) {
    const ok = Array.from(ss.options).find((o) => !o.disabled);
    if (ok) ss.value = ok.value;
  }
  const note = $("#sheetNote");
  if (note) note.textContent = difficulty(g, ss.value) ? g.key + "／" + SUBJECT[ss.value].name + "：" + String(specText(g, ss.value)).replace(/<[^>]*>/g, "") : "";
}
function sheetBuild() {
  const g = GRADES[+$("#sheetGrade").value], subj = $("#sheetSubj").value;
  const n = +$("#sheetN").value, pages = +$("#sheetPages").value;
  if (!difficulty(g, subj)) { $("#sheetMsg").textContent = "この級には この種目が ありません"; return; }
  sheetSave({ subj, n, pages });
  const p = profile();
  const list = [];
  for (let k = 0; k < pages; k++) list.push(sheetMake(g, subj, n));
  sheetData = { grade: g, subj, n, pages: list };
  const line = subj === "kake" || subj === "wari";
  $("#sheetOut").innerHTML = list.map((pg, pi) =>
    '<section class="sh-page">' +
    '<div class="sh-head"><div class="sh-title">' + g.key + "　" + SUBJECT[subj].name +
    (list.length > 1 ? '<small>（' + (pi + 1) + " / " + list.length + "枚）</small>" : "") + "</div>" +
    '<div class="sh-fields"><span>なまえ<i></i></span><span>日づけ<i></i></span><span>タイム<i></i></span><span>とくてん<i></i></span></div></div>' +
    (line ? sheetLineHTML(pg) : sheetMitoriHTML(pg)) +
    '<div class="sh-foot">そろばんキングダム　sorobankingdom.com</div></section>').join("") +
    '<section class="sh-page sh-akey-page"><div class="sh-head"><div class="sh-title">' + g.key + "　" + SUBJECT[subj].name +
    '　こたえ<small>（おうちの人・先生用）</small></div></div>' + sheetAnswerHTML(list) +
    '<div class="sh-foot">そろばんキングダム　sorobankingdom.com</div></section>';
  $("#sheetOut").classList.remove("hidden");
  $("#sheetPrint").classList.remove("hidden");
  $("#sheetMsg").textContent = "できました！ 下に 出ています。「印刷する」で 紙に 出せます。";
  $("#sheetOut").scrollIntoView({ behavior: "smooth", block: "start" });
}
function sheetPrint() {
  document.body.classList.add("print-sheet");
  try { window.print(); } catch (e) { console.error("印刷に失敗", e); }
  setTimeout(() => document.body.classList.remove("print-sheet"), 500);
}

/* ---------- プリントを作る画面の ボタン ---------- */
(function () {
  const g = $("#sheetGrade"), sj = $("#sheetSubj"), go = $("#sheetGo"), pr = $("#sheetPrint");
  if (!g || !sj || !go) return;
  g.addEventListener("change", sheetUpdateSubj);
  sj.addEventListener("change", sheetUpdateSubj);
  go.addEventListener("click", sheetBuild);
  if (pr) pr.addEventListener("click", sheetPrint);
})();


/* ============================================================ SK検定（そろばんキングダム検定）
   このサイト独自の 検定。本番の検定と 同じ形（しゅもくごとに 制限時間・◎×は さいごに まとめて）で、
   いつでも 受けられる。自宅で受けたものは 合格証に「自宅受験」と 明記する（先生の監督つきは 今後）。
   ※ EXAM_TRACKS / examState は SUBJECT の すぐ下で 定義している */
const allExams = () => { try { return JSON.parse(localStorage.getItem(EXAMS) || "[]"); } catch (e) { return []; } };
function examSteps(grade, track) {
  const t = EXAM_TRACKS[track]; if (!t) return [];
  return t.subjs.filter((s) => difficulty(grade, s)).map((s) => ({ subj: s, cf: SUBJECT[s] }));
}
function renderKentei() {
  const sel = $("#exGrade");
  if (sel && !sel.dataset.filled) {
    sel.innerHTML = GRADES.map((g, i) => '<option value="' + i + '">' + g.key + "</option>").join("");
    sel.dataset.filled = "1";
    const rk = JSON.parse(localStorage.getItem(RANK) || "null");
    sel.value = String(Math.min(GRADES.length - 1, rk ? rk.idx + 1 : gradeIdx));   // つぎの級を 受ける
  }
  examUpdateSpec();
  renderExamHistory();
}
function examUpdateSpec() {
  const g = GRADES[+$("#exGrade").value], track = $("#exTrack").value;
  const steps = examSteps(g, track), box = $("#exSpec");
  if (!g || !box) return;
  if (!steps.length) { box.innerHTML = '<p class="sub">この級には この検定が ありません。</p>'; $("#exGo").disabled = true; return; }
  $("#exGo").disabled = false;
  box.innerHTML = '<table class="rec-table ex-table"><tr><th>しゅもく</th><th>もんだい</th><th>時間</th><th>ごうかく点</th></tr>' +
    steps.map((s) => "<tr><td>" + s.cf.name + "</td><td>" + s.cf.N + "問</td><td>" + Math.round(s.cf.limit / 60) + "分</td><td>" + s.cf.pass + "点／" + (s.cf.N * s.cf.per) + "点</td></tr>").join("") +
    '</table><p class="sub">' + (steps.length > 1 ? "ぜんぶの しゅもくで ごうかく点を とると " : "") + g.key + " " + EXAM_TRACKS[track].name + " 合格。" +
    (steps.length > 1 ? "しゅもくの あいだに 30秒の 休けいが あります。" : "") + "</p>";
}
function startExam() {
  const g = GRADES[+$("#exGrade").value], track = $("#exTrack").value;
  const steps = examSteps(g, track); if (!steps.length) return;
  examState = { grade: g, track, steps, idx: 0, sections: [] };
  runExamStep();
}
function runExamStep() {
  if (!examState) return;
  const step = examState.steps[examState.idx];
  if (!step) return finishExam();
  startExamSection(step);
}
function startExamSection(step) {
  const grade = examState.grade, cf = step.cf;
  session = { subj: step.subj, grade, cf, N: cf.N, idx: 0, correct: 0, answerBy: answerModeFor(cf), timed: true, mode: "end", results: [], locking: false, start: performance.now(), cur: null, exam: true, label: cf.name };
  $("#playMark").classList.add("hidden");
  hidePauseUI();                                    // 検定は 一時停止 なし
  showView("play");
  bgmForStudy(true);
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", session.answerBy !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", session.answerBy !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.add("hidden");
  $("#stepsRow").classList.add("hidden");           // 検定中は「解き方」を 見せない
  $("#playGrade").textContent = "🏅 SK検定 " + grade.key + " " + EXAM_TRACKS[examState.track].name + "　" + (examState.idx + 1) + "/" + examState.steps.length + "：" + cf.name + "（" + Math.round(cf.limit / 60) + "分）";
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  startPlayTimer();
  nextPlayProblem();
}
function finishExamSection() {
  hidePauseUI();
  const el = playElapsed();
  const score = session.correct * session.cf.per;
  examState.sections.push({ subj: session.subj, name: session.cf.name, correct: session.correct, N: session.N, score, full: session.N * session.cf.per, pass: session.cf.pass, ok: score >= session.cf.pass, sec: el, items: session.results });
  logSession(session.subj, session.N, session.correct, el, 0, session.results);
  neutralSnd();
  session = null;
  examState.idx++;
  if (examState.idx >= examState.steps.length) return finishExam();
  showExamBreak(examState.steps[examState.idx]);
}
function showExamBreak(next) {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  $("#playProblemWrap").classList.add("hidden");
  $("#playSorobanWrap").classList.add("hidden");
  $("#playInputWrap").classList.add("hidden");
  $("#playFlashWrap").classList.add("hidden");
  $("#playResult").textContent = ""; $("#playGrade").textContent = "🏅 SK検定：休けい"; $("#playProgress").textContent = ""; $("#playTimer").textContent = "";
  $("#playRest").classList.remove("hidden");
  $("#restResult").innerHTML = '<p class="sub">けっかは さいごに まとめて 出ます。</p>';
  $("#restNext").textContent = "つぎは：" + next.cf.name + "（" + Math.round(next.cf.limit / 60) + "分）　自動で 始まります";
  let left = 30;
  const render = () => ($("#restTimer").textContent = fmtClock(left));
  render();
  if (examTimer) clearInterval(examTimer);
  examTimer = setInterval(() => { left--; render(); if (left <= 0) endExamBreak(); }, 1000);
}
function endExamBreak() {
  if (examTimer) { clearInterval(examTimer); examTimer = null; }
  $("#playRest").classList.add("hidden");
  runExamStep();
}
function finishExam() {
  const ex = examState; examState = null;
  if (examTimer) { clearInterval(examTimer); examTimer = null; }
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  const pass = ex.sections.every((s) => s.ok), track = EXAM_TRACKS[ex.track];
  const totalSec = ex.sections.reduce((a, s) => a + s.sec, 0);
  const rec = { d: today(), g: ex.grade.key, track: ex.track, pass, sections: ex.sections.map((s) => ({ subj: s.subj, correct: s.correct, N: s.N, score: s.score, ok: s.ok, sec: Math.round(s.sec) })) };
  try { const h = allExams(); h.push(rec); localStorage.setItem(EXAMS, JSON.stringify(h.slice(-300))); } catch (e) { console.error("検定の記録に失敗", e); }
  logStudy(totalSec); touchStreak();
  const rows = ex.sections.map((s) => "<tr><td>" + s.name + "</td><td>" + s.correct + " / " + s.N + "</td><td><b>" + s.score + "</b>／" + s.full + "<small>（合格 " + s.pass + "）</small></td><td>" + fmtClock(s.sec) + '</td><td class="' + (s.ok ? "ok" : "ng") + '">' + (s.ok ? "◎ 合格" : "×") + "</td></tr>").join("");
  let msg = '<div class="ex-result-h">' + (pass ? "🎉 <b>" + ex.grade.key + " " + track.name + " ごうかく！</b>" : "<b>不合格</b>　もう少し！") + "</div>" +
    '<table class="rec-table ex-table"><tr><th>しゅもく</th><th>せいかい</th><th>点</th><th>タイム</th><th></th></tr>' + rows + "</table>" +
    '<p class="sub">自宅受験（' + rec.d + "）。" + (pass ? "合格証には「自宅受験」と 入ります。" : "まちがえ方は 下に 出ます。にがてを 直して もう一度！") + "</p>";
  ex.sections.forEach((s) => { msg += '<div class="ex-sec"><b>' + s.name + "</b>" + missReportHTML(s.items) + "</div>"; });
  let gold = 0;
  ex.sections.forEach((s) => { gold += goldForSection({ correct: s.correct, N: s.N, bestUpdated: false, completed: true, grade: ex.grade, subj: s.subj, count: dailyCount("exam_" + ex.grade.key) }).g; });
  dailyCount("exam_" + ex.grade.key, true);
  if (pass) gold += Math.round(100 * gradeGoldMult(ex.grade));
  addGold(gold);
  msg += '<div class="gold-earn"><img class="ico-coin" src="assets/coin.png" alt="" /> <b>＋' + gold + " GOLD</b>" + (pass ? '<div class="gold-lines">🏅 検定 合格 ボーナス</div>' : "") + "</div>";
  msg += '<br><button id="exAgainBtn">もう一度</button> <button id="exBackBtn" class="ghost">検定の 画面へ</button>';
  msg = '<div class="result-hero"><img class="rh-face" src="assets/' + (pass ? "king_celebrate.png" : "king_wave.png") + '" alt="レオ王" />' +
    (pass ? '<span class="rh-badge"><span class="badge-chip perfect">🏅 SK検定 ごうかく！</span></span>' : "") + "</div>" + msg;
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playProblem").textContent = "おつかれさま！";
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden");
  $("#playResult").innerHTML = msg; $("#playResult").className = "result " + (pass ? "ok" : "ng");
  $("#playGrade").textContent = "🏅 SK検定 " + ex.grade.key + " " + track.name + "：けっか"; $("#playProgress").textContent = ""; $("#playTimer").textContent = "";
  renderProfile();
  if (pass) { fxCelebrate(3, "🏅 " + ex.grade.key + " " + track.name + " ごうかく！", "SK検定 合格 おめでとう！"); bigFanfareSnd(); certify(ex.grade.key, "sk-" + ex.track); }
  else fxCheer("あと すこし…", "ぜんぶの しゅもくで 合格点を とろう");
  coinSnd(1.0);
  $("#exAgainBtn").onclick = () => { examState = { grade: ex.grade, track: ex.track, steps: ex.steps, idx: 0, sections: [] }; runExamStep(); };
  $("#exBackBtn").onclick = () => { showView("kentei"); setActiveNav(document.querySelector('.nav[data-view="kentei"]')); };
}
function renderExamHistory() {
  const box = $("#exHist"); if (!box) return;
  const list = allExams().slice().reverse().slice(0, 30);
  if (!list.length) { box.innerHTML = '<p class="sub">まだ 受けていません。合格すると 合格証が もらえて、「記録を見る」にも ならびます。</p>'; return; }
  box.innerHTML = '<table class="rec-table ex-table"><tr><th>日</th><th>級</th><th>検定</th><th>けっか</th><th>点</th></tr>' +
    list.map((r) => "<tr><td>" + r.d + "</td><td>" + r.g + "</td><td>" + ((EXAM_TRACKS[r.track] || {}).name || r.track) + '</td><td class="' + (r.pass ? "ok" : "ng") + '">' + (r.pass ? "◎ 合格" : "×") + "</td><td>" +
      r.sections.map((s) => subjName(s.subj) + " " + s.score).join("／") + "</td></tr>").join("") + "</table>";
}

/* ---------- SK検定 画面の ボタン ---------- */
(function () {
  const g = $("#exGrade"), t = $("#exTrack"), go = $("#exGo");
  if (!g || !t || !go) return;
  g.addEventListener("change", examUpdateSpec);
  t.addEventListener("change", examUpdateSpec);
  go.addEventListener("click", startExam);
})();


/* ============================================================ 教室に参加（生徒側）
   先生が 作った クラスコードを 入れて、自分の にっくねーむを えらぶ。
   パスワードは 無い。メール・本名・生年月日は 集めない。
   Firebase は「参加するとき」だけ 読みこむ（ふつうに 遊ぶ子には 一切 読ませない）。 */
const CLASSLINK = "soroban_classlink";
const jesc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const classLink = () => { try { return JSON.parse(localStorage.getItem(CLASSLINK) || "null"); } catch (e) { return null; } };
function setClassLink(v) {
  try { v ? localStorage.setItem(CLASSLINK, JSON.stringify(v)) : localStorage.removeItem(CLASSLINK); } catch (e) { console.error("教室の 保存に 失敗", e); }
  renderJoin();
}
const FB_VER = "10.14.1";
const FB_SRC = [
  "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/" + FB_VER + "/firebase-firestore-compat.js",
  "firebase-config.js", "class/store.js",
];
let storeLoading = null;
function loadStore() {
  if (window.SKStore) return Promise.resolve(window.SKStore);
  if (storeLoading) return storeLoading;
  const one = (src) => new Promise((ok, ng) => {
    const s = document.createElement("script"); s.src = src; s.async = false;
    s.onload = ok; s.onerror = () => ng(new Error("読みこめません：" + src));
    document.head.appendChild(s);
  });
  storeLoading = FB_SRC.reduce((p, src) => p.then(() => one(src)), Promise.resolve())
    .then(() => window.SKStore)
    .catch((e) => { storeLoading = null; throw e; });
  return storeLoading;
}
function renderJoin() {
  const box = $("#joinBox"); if (!box) return;
  const cl = classLink();
  if (cl) {
    box.innerHTML = '<div class="join-on"><div class="join-on-h">🏫 ' + jesc(cl.className) + " に 参加中</div>" +
      "<p>あなたの 名前：<b>" + jesc(cl.nick) + "</b></p>" +
      '<p class="sub">れんしゅうの きろくは、先生の 画面に とどきます。まちがえ方の クセも 先生が 見て、つぎの 宿題を 決めます。</p>' +
      '<div id="joinSync" class="sub"></div>' +
      '<div class="btn-row"><button id="joinPush">↻ いま おくる</button><button id="joinLeave" class="ghost">教室から ぬける</button></div></div>';
    $("#joinPush").onclick = () => pushToClass(true);
    $("#joinLeave").onclick = () => { if (confirm("教室から ぬけます。この端末の れんしゅうの きろくは 消えません。よろしいですか？")) setClassLink(null); };
    return;
  }
  box.innerHTML = '<p class="sub">そろばん教室で もらった <b>クラスコード</b>（6文字）を 入れてね。おうちで れんしゅうすると、先生が 見てくれます。<br>' +
    "コードが ない人は 入らなくて だいじょうぶ。ふつうに ぜんぶ あそべます。</p>" +
    '<div class="join-row"><input id="joinCode" type="text" inputmode="latin" autocapitalize="characters" maxlength="6" placeholder="ABC123" />' +
    '<button id="joinGo">つぎへ</button></div><div id="joinMsg" class="result"></div><div id="joinPick"></div>';
  const inp = $("#joinCode");
  inp.addEventListener("input", () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#joinGo").click(); });
  $("#joinGo").onclick = joinStep1;
}
async function joinStep1() {
  const code = ($("#joinCode").value || "").trim().toUpperCase();
  const msg = $("#joinMsg"), pick = $("#joinPick");
  pick.innerHTML = ""; msg.className = "result";
  if (code.length !== 6) { msg.textContent = "コードは 6文字だよ"; msg.className = "result ng"; return; }
  msg.textContent = "しらべています…";
  let S;
  try { S = await loadStore(); } catch (e) { msg.textContent = "つうしんが できません。電波を たしかめて、もう一度 おしてね。"; msg.className = "result ng"; return; }
  try {
    const c = await S.resolveCode(code);
    if (!c) { msg.textContent = "その コードの 教室が 見つかりません。先生に たしかめてね。"; msg.className = "result ng"; return; }
    const list = await S.listStudents(c.id);
    if (!list.length) { msg.textContent = "この 教室には まだ 名前が 登録されていません。先生に たのんでね。"; msg.className = "result ng"; return; }
    msg.textContent = "🏫 " + c.name + "　じぶんの 名前を えらんでね"; msg.className = "result ok";
    pick.innerHTML = '<div class="join-names">' + list.map((s, i) => '<button class="join-name" data-i="' + i + '">' + jesc(s.nick) + "</button>").join("") + "</div>";
    $$("#joinPick .join-name").forEach((b) => {
      b.onclick = async () => {
        const s = list[+b.dataset.i];
        try {
          await S.joinClass(c.id, s.id);
          setClassLink({ cid: c.id, sid: s.id, className: c.name, nick: s.nick, sent: 0 });
          fxCelebrate(2, "🏫 " + c.name + " に 参加したよ！", s.nick + " として れんしゅうを おくります");
          pushToClass(false);
        } catch (e) { msg.textContent = "参加できませんでした：" + ((e && e.message) || e); msg.className = "result ng"; }
      };
    });
  } catch (e) { msg.textContent = "うまく いきませんでした。もう一度 おしてね。"; msg.className = "result ng"; console.error(e); }
}
/* 記録を 先生に おくる。おくったところまでを sent に 覚えて、同じものを 二度 おくらない */
let pushTimer = null, pushing = false;
async function pushToClass(loud) {
  const cl = classLink(); if (!cl || pushing) return;
  const note = $("#joinSync");
  const all = allSessions(), fresh = all.filter((e) => (e.t || 0) > (cl.sent || 0));
  if (!fresh.length) { if (loud && note) note.textContent = "おくるものは ありません（ぜんぶ とどいています）"; return; }
  pushing = true;
  if (note) note.textContent = "おくっています…";
  try {
    const S = await loadStore();
    await S.pushSessions(cl.cid, cl.sid, fresh.slice(-200), all);
    cl.sent = Math.max.apply(null, fresh.map((e) => e.t || 0));
    try { localStorage.setItem(CLASSLINK, JSON.stringify(cl)); } catch (e) { }
    if (note) note.textContent = "✓ " + fresh.length + "件 とどきました";
  } catch (e) {
    console.error("先生への 送信に 失敗", e);
    if (note) note.textContent = "いまは おくれませんでした。つぎに ひらいたとき もう一度 ためします。";
  } finally { pushing = false; }
}
// 練習が おわるたび、少し待ってから まとめて おくる（連続で 通信しない）
function schedulePush() {
  if (!classLink()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushToClass(false), 4000);
}

/* ---------- 教室に 入っている子は、ひらいたときに おくり残しを おくる ---------- */
if (classLink()) setTimeout(function () { pushToClass(false); }, 3000);

/* ---------- 初期化（必ず いちばん最後。上で定義した定数を すべて使えるようにするため） ---------- */
renderGrid();
updateInfo();
renderProfile();
renderSound();
renderGoldPill();
showView("home");
setActiveNav(document.querySelector('.nav[data-view="home"]'));
