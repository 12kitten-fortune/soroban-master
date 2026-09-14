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
const BUILD = "2026-09-14-400"; // 最新反映の確認用

/* ============================================================ 検定基準（級）＝ 級体系（カリキュラム）
   級ごとの「何桁 何口・どの しゅもくが あるか・合格の きまり」は、プログラムの 中には 持たない。
   docs/curriculum/sk.js（JSON の 表）を 読んで、GRADES / SUBJECT / EXAM_TRACKS / difficulty() を 作る。
   別の 級体系（教室の 独自基準・海外の レベル体系）は 同じ 形の 表を 足して applyCurriculum() で 切りかえる。 */
const CURRICULA = window.SK_CURRICULA || {};
let CUR = null;                    // いま 使っている 級体系
const GRADES = [];                 // [{ key, band, kyu|dan, n }]。中身は applyCurriculum が 入れかえる
const SUBJECT = {};                // しゅもく：name / answer / N / per / pass / limit
const EXAM_TRACKS = {};            // SK検定の 組み合わせ（珠算＝みとり・かけ・わり、暗算＝あんざん）
const EXAMS = "soroban_exams";
let examState = null, examTimer = null;
function applyCurriculum(c) {
  if (!c || !Array.isArray(c.grades)) { alert(T("級の表（curriculum/sk.js）が 読みこめませんでした。ページを 更新してください。")); throw new Error("no curriculum"); }
  CUR = c;
  GRADES.length = 0;
  c.grades.forEach((g) => { const row = { key: g.key, band: g.band, n: g.n }; if (g.band === "dan") row.dan = g.n; else row.kyu = g.n; GRADES.push(row); });
  Object.keys(SUBJECT).forEach((k) => delete SUBJECT[k]); Object.assign(SUBJECT, JSON.parse(JSON.stringify(c.subjects || {})));
  Object.values(SUBJECT).forEach((s) => { if (s && s.name) s.name = T(s.name); });   // しゅもくの 名前は 表に あるが、言葉の しくみを 通す
  Object.keys(EXAM_TRACKS).forEach((k) => delete EXAM_TRACKS[k]); Object.assign(EXAM_TRACKS, JSON.parse(JSON.stringify(c.exams || {})));
}
// どの 級体系を 使うか：教室に 入っている子は 教室の「級の基準」（参加したとき 端末に 覚える）。それ以外は 標準
function pickCurriculum() {
  try {
    const cl = JSON.parse(localStorage.getItem("soroban_classlink") || "null");
    if (cl && cl.preset === "custom" && cl.curriculum) {   // 教室だけの 表（先生が 直したもの）。こわれていたら 標準
      const ok = window.SK_CURRICULUM_CHECK ? window.SK_CURRICULUM_CHECK(cl.curriculum) : null;
      if (ok) return ok;
    }
    if (cl && cl.preset && CURRICULA[cl.preset]) return CURRICULA[cl.preset];
  } catch (e) { }
  return CURRICULA.sk;
}
applyCurriculum(pickCurriculum());
// その級の その しゅもくの きまり。無い しゅもくは null（例：10級の かけ算）
function difficulty(g, subj) {
  if (!g || !CUR) return null;
  const row = CUR.grades.find((x) => x.key === g.key);
  return row && row[subj] ? row[subj] : null;
}
// しゅもくの きまり（問題数・1問の点・合格点・制限秒）。級の表に exam が あれば その級だけ 上書き（例：日商風の 7〜10級は 20分）
function subjectCfg(g, subj) {
  const base = SUBJECT[subj]; if (!base) return base;
  const d = difficulty(g, subj);
  return d && d.exam ? Object.assign({}, base, d.exam) : base;
}
// フラッシュ暗算：1個あたりの 表示時間(ms)。表の pace を 使う。無ければ 級から なめらかに 決める
function flashPaceMs(g) {
  const d = difficulty(g, "flash"); if (d && d.pace) return d.pace;
  if (g.band === "dan") return Math.max(300, 620 - g.dan * 32);
  return Math.round(650 + ((g.kyu || 1) - 1) / 19 * 400);
}

/* ---------- 級・段ラダー（20級〜十段） ---------- */
let gradeIdx = Math.max(0, GRADES.findIndex((g) => g.key === "20級"));   // はじめての子は いちばん やさしい級から
let subject = "mitori";
const currentGrade = () => GRADES[gradeIdx];

/* ============================================================ 🔊 読み上げ（文字が まだ 読めない子の ため。ブラウザ内蔵の 読み上げを 使う。外部サービスなし）
   sayBtn(文) で 🔊 ボタンの HTML を 作り、押すと その文を 読む。読み上げが 使えない ブラウザでは ボタンを 出さない */
function speakJa(text) {
  if (!("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const plain = String(text).replace(/<[^>]*>/g, " ").replace(/[▶◎×✓🔊📖]/gu, " ").replace(/\s+/g, " ").trim();   // u＝絵文字を こわさない
    if (!plain) return false;
    const u = new SpeechSynthesisUtterance(plain);
    const lang = (window.SK_I18N && SK_I18N.lang !== "ja") ? SK_I18N.lang : "ja-JP";
    u.lang = lang; u.rate = 0.92; u.pitch = 1;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
const canSpeakJa = () => "speechSynthesis" in window;
const sayBtn = (text, cls) => canSpeakJa()
  ? '<button type="button" class="say-btn ' + (cls || "") + '" data-say="' + String(text).replace(/<[^>]*>/g, " ").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") + '" title="' + T("よみあげる") + '" aria-label="' + T("よみあげる") + '">🔊</button>'
  : "";
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest ? e.target.closest(".say-btn") : null; if (!b) return;
  e.preventDefault(); e.stopPropagation();
  speakJa(b.dataset.say || (b.parentNode ? b.parentNode.textContent : ""));
});

/* ============================================================ ジェネレータ */
function randDigits(d) { const min = d === 1 ? 1 : Math.pow(10, d - 1); return Math.floor(Math.random() * (Math.pow(10, d) - 1 - min + 1)) + min; }
// variants がある級は「桁と口数の組み合わせ」を丸ごと1つ選ぶ（桁と口数を別々に振らない）
const pickVariant = (s) => (s && s.variants ? s.variants[Math.floor(Math.random() * s.variants.length)] : s);
// 入門級用：答えがいくつになるかを決めて、そこから各項を作る（例：たして5＝1+4, 2+3…）
function genBySum(sp) {
  const TT = sp.terms, MAX = 9;
  const lo = sp.sumExact != null ? sp.sumExact : (sp.sumMin != null ? sp.sumMin : TT);
  const hi = sp.sumExact != null ? sp.sumExact : (sp.sumMax != null ? sp.sumMax : TT * MAX);
  for (let tries = 0; tries < 300; tries++) {
    const S = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (S < TT || S > TT * MAX) continue;             // 各項1〜9では作れない合計
    const cuts = [];
    for (let i = 1; i < S; i++) cuts.push(i);        // Sを T個に分ける切れ目の候補
    for (let i = cuts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cuts[i], cuts[j]] = [cuts[j], cuts[i]]; }
    const sel = cuts.slice(0, TT - 1).sort((a, b) => a - b);
    const nums = []; let prev = 0;
    for (const c of sel) { nums.push(c - prev); prev = c; }
    nums.push(S - prev);
    if (nums.length === TT && nums.every((v) => v >= 1 && v <= MAX)) return { nums, answer: S };
  }
  return null;
}
function genMitori(spec) {
  const v = pickVariant(spec);
  if (v.sumExact != null || v.sumMin != null || v.sumMax != null) {   // 入門級：合計を決めて作る
    const r = genBySum(v); if (r) return r;
  }
  const { digits, terms, termsMax, sub } = v;
  const D = digits, lo = v.minDigits ? Math.min(D, Math.max(1, v.minDigits)) : Math.max(1, D - 2); // 各項の桁数を lo〜D で混在。minDigits＝いちばん小さい桁（「3〜5桁」など）
  // 出題例は1枚の中で口数が変わる級があるため terms〜termsMax から選ぶ
  const TT = termsMax && termsMax > terms ? terms + Math.floor(Math.random() * (termsMax - terms + 1)) : terms;
  // sub:false の級（暗算7〜10級など）は出題例どおり ひき算を出さない
  const allowSub = sub !== false && TT >= 3; const nums = []; let total = 0;
  // 出題例は必ずその級の桁数の数が入っているので、1つは必ずD桁にする
  // （これが無いと「4桁10口」のはずが偶然すべて3桁以下になり、級より易しい問題が出てしまう）
  const forceIdx = Math.floor(Math.random() * TT);
  for (let i = 0; i < TT; i++) {
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
  if (subj === "kake") { const p = genKake(pickVariant(diff)); return { ...p, compact: p.display }; }   // variants＝桁の 組み合わせを 1つ えらぶ
  if (subj === "wari") { const p = genWari(pickVariant(diff)); return { ...p, compact: p.display }; }
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
  const dateJa = (() => { const [y, m, dd] = c.d.split("-"); return y + T("年") + (+m) + T("月") + (+dd) + T("日"); })();
  d.innerHTML = '<div class="cert">' +
    T('<div class="cert-top"><img class="cert-crown" src="assets/crown.png" alt=""><div class="cert-title">合 格 証</div></div>') +
    '<div class="cert-name">' + p.name + T('<small>殿</small></div>') +
    T('<div class="cert-body">そろばんキングダム <b>') + c.g + T('</b>（') + subjName(c.subj) + T('）の けんていに<br>ごうかくしたことを ここに 証します。</div>') +
    '<div class="cert-date">' + dateJa + T('　第 ') + (c.no || 1) + T(' 号</div>') +
    T('<div class="cert-king"><img src="assets/king_celebrate.png" alt="レオ王"><span>そろばんキングダム 国王 レオ</span></div>') +
    '</div>' +
    T('<div class="cert-btns"><button id="certPrint">🖨 いんさつ する</button><button id="certShare">📤 おくる</button><button id="certClose" class="ghost">とじる</button></div>');
  document.body.appendChild(d);
  $("#certClose").onclick = () => d.remove();
  $("#certPrint").onclick = () => {
    document.body.classList.add("print-cert");
    try { window.print(); } catch (e) { console.error("印刷に失敗", e); }
    setTimeout(() => document.body.classList.remove("print-cert"), 500);
  };
  $("#certShare").onclick = async () => {
    const text = p.name + T(" が そろばんキングダム ") + c.g + T("（") + subjName(c.subj) + T("）の けんていに ごうかくしました！🎓 ") + dateJa;
    try {
      if (navigator.share) await navigator.share({ title: T("合格証"), text: text, url: location.href.split("#")[0] });
      else { await navigator.clipboard.writeText(text + " " + location.href.split("#")[0]); alert(T("文を コピーしたよ。LINE などに はりつけて おくってね")); }
    } catch (e) { }
  };
  try { fxConfetti(40); } catch (e) { }
}
// 記録画面：これまでの 合格証
function renderCerts() {
  const box = $("#recCerts"); if (!box) return;
  const list = allCerts().slice().reverse();
  if (!list.length) { box.innerHTML = T('<p class="sub">けんていモード（ぜんぶ こたえてから ◎×）で ごうかくすると、ここに 合格証が ならぶよ。</p>'); return; }
  box.innerHTML = '<div class="cert-list">' + list.map((c, i) => '<button class="cert-chip" data-i="' + i + '">🎓 ' + c.g + '<small>' + subjName(c.subj) + T("・") + c.d + "</small></button>").join("") + "</div>";
  $$("#recCerts .cert-chip").forEach((b) => { b.onclick = () => showCert(list[+b.dataset.i]); });
}
const rankText = () => { const r = JSON.parse(localStorage.getItem(RANK) || "null"); return r ? r.key : T("未取得"); };
function saveTime(gradeKey, subj, sec) { const t = JSON.parse(localStorage.getItem(TIMES) || "{}"); const k = `${gradeKey}_${subj}`; const prev = t[k]; const improved = prev == null || sec < prev; if (improved) { t[k] = sec; localStorage.setItem(TIMES, JSON.stringify(t)); } return { improved, prev }; }
const allTimes = () => JSON.parse(localStorage.getItem(TIMES) || "{}");
const bestTime = (gradeKey, subj) => allTimes()[`${gradeKey}_${subj}`];
function bestPerSubject() { const t = allTimes(), r = {}; for (const [k, sec] of Object.entries(t)) { const subj = k.split("_")[1]; if (r[subj] == null || sec < r[subj]) r[subj] = sec; } return r; }
function fmtClock(sec) { sec = Math.max(0, sec); const m = Math.floor(sec / 60), s = sec - m * 60; return `${m}:${s.toFixed(1).padStart(4, "0")}`; }
function logStudy(sec) { const l = JSON.parse(localStorage.getItem(LOG) || "[]"); l.push({ d: today(), s: Math.round(sec) }); localStorage.setItem(LOG, JSON.stringify(l.slice(-800))); }
function monthStats() { const l = JSON.parse(localStorage.getItem(LOG) || "[]"); const ym = today().slice(0, 7); const m = l.filter((e) => e.d.startsWith(ym)); return { days: new Set(m.map((e) => e.d)).size, sec: m.reduce((a, e) => a + e.s, 0) }; }
function last7() { const l = JSON.parse(localStorage.getItem(LOG) || "[]"); const a = []; for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); a.push({ d, sec: l.filter((e) => e.d === d).reduce((x, e) => x + e.s, 0) }); } return a; }
const profile = () => JSON.parse(localStorage.getItem(PROFILE) || T('{"name":"そろ太くん","avatar":"🧒"}'));
const saveProfile = (p) => localStorage.setItem(PROFILE, JSON.stringify(p));
function fmtMin(sec) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? T("{h}時間{m}分", { h, m }) : T("{m}分", { m }); }
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
  if (d >= 1) return { m: 1.2, label: T("上の級に ちょうせん ×1.2") };
  if (d === 0) return { m: 1, label: "" };
  if (d === -1) return { m: 0.75, label: T("合格ずみの級 ×0.75") };
  if (d === -2) return { m: 0.5, label: T("やさしい級 ×0.5") };
  return { m: 0.15, label: T("ずっと下の級 ×0.15") };
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
  return { m: m, label: m < 1 ? T("きょう ") + (count + 1) + T("回目 ×") + m : "" };
}
function goldForSection({ correct, N, bestUpdated, completed, grade, subj, count }) {
  let g = correct * 2; const lines = [T("正解 {correct}問 ＋{v2}", { correct, v2: correct * 2 })];
  const acc = N ? correct / N : 0;
  if (acc >= 0.9) { g += 20; lines.push(T("高正答率(90%↑) ＋20")); }
  else if (acc >= 0.7) { g += 10; lines.push(T("正答率(70%↑) ＋10")); }
  if (bestUpdated) { g += 30; lines.push(T("⏱ 自己ベスト更新 ＋30")); }
  if (completed) { g += 10; lines.push(T("完走 ＋10")); }
  const m = gradeGoldMult(grade);
  if (m > 1) { g = Math.round(g * m); lines.push(T("{v1}ボーナス ×{m}", { v1: grade.key, m })); }
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
  return { amt: 5 * Math.min(10, streak), label: T("連続学習{streak}日ボーナス", { streak }) };
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
    return '<div class="drop-box">🎁 <b>' + it.em + " " + it.n + T('</b> を みつけた！<small>パズルの もちものに 入ったよ</small></div>');
  } catch (e) { console.error("道具のプレゼントに失敗", e); return ""; }
}
// 次に買える建物までの目標（モチベーション表示）
function nextGoalHint() {
  const gold = getGold();
  if (gold >= 100) return T("🧩 パズルで あそべるよ！（1回 30 GOLD）");
  if (gold >= 30) return T("🧩 あと ") + Math.floor(gold / 30) + T(" 回 パズルが あそべる");
  return T("あと ") + (30 - gold) + T(" GOLD で パズルが 1回 あそべる！");
}

/* ---------- 学習セッションの記録（保護者画面・成績用） ---------- */
const SESSIONS = "soroban_sessions";
// src："battle"（たいせん）・"exam"（SK検定）の 記録には 印を つける。無印＝ふつうの 練習。
// ソロモンの 成長は 無印の 記録だけで 数える（たいせん・検定を いくら やっても 成長しない）
function logSession(subj, N, correct, sumSec, pauses, results, src) {
  const l = JSON.parse(localStorage.getItem(SESSIONS) || "[]");
  const g = (typeof currentGrade === "function" && currentGrade()) || null;
  const e = { d: today(), t: Date.now(), g: (session && session.grade && session.grade.key) || (g && g.key) || "",
    subj, N, correct, sec: Math.round(sumSec), avg: N ? +(sumSec / N).toFixed(2) : 0, pauses: pauses || 0 };
  if (src) e.src = src;
  // まちがえた問題は「何をどう間違えたか」まで残す（あとで週ごとのクセを出すため）
  const miss = (results || []).filter((r) => !r.ok).slice(0, 8).map((r) => ({ q: r.compact, u: r.user, a: r.ans, k: missKind(r) }));
  if (miss.length) e.miss = miss;
  // 🔍 弱点診断の 材料：問題ごとの「使う技（5の友・10の友…）・桁・口数」ごとの 正解／出題／秒
  try { const ft = sessionFeatures(results); if (Object.keys(ft).length) e.ft = ft; } catch (err) { }
  try { if (miss.length && src !== "battle") noteAddFromMiss(miss, subj); } catch (err) { }   // 📒 まちがいノートへ
  l.push(e);
  // 1件はおよそ200バイト。6000件でも 約1.2MB で、ブラウザの上限(5MB前後)に とどかない。
  // 1日4セットなら 4年分のこる。
  try { localStorage.setItem(SESSIONS, JSON.stringify(l.slice(-6000))); }
  catch (err) { try { localStorage.setItem(SESSIONS, JSON.stringify(l.slice(-2000))); } catch (e2) { console.error("記録の保存に失敗", e2); } }
  try { if (typeof schedulePush === "function") schedulePush(); } catch (e) { }
  try { if (typeof rankSyncSoon === "function") rankSyncSoon(); } catch (e) { }   // 🏆 参加中なら ランキングの 行を 新しく
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
// はじめて開いた人には「流しますか？」と きいてから 鳴らす（いきなり 大きな音を 出さない）。
// まだ 決めていない あいだは 切（0）にしておく。
const BGML_SAVED = (function () { try { return localStorage.getItem(BGML_KEY); } catch (e) { return null; } })();
let bgmLevel = (function () { const v = parseInt(BGML_SAVED, 10); return isFinite(v) && v >= 0 && v <= 3 ? v : 0; })();
let bgmOn = bgmLevel > 0;
let bgmEl = null, bgmName = "";
const bgmCache = {};        // よみこんだ曲を とっておく入れもの
/* iPhone / iPad は 曲の volume を 変えられない（いつも最大で 鳴る）。
   そこで 曲を「音の道（Web Audio）」に通し、その途中の つまみ（gain）で 音量を しぼる。
   道が作れない端末では 今までどおり volume を使う。 */
let bgmGain = null;
function bgmRoute(el) {
  try {
    const c = ensureAudio();
    if (!bgmGain) { bgmGain = c.createGain(); bgmGain.gain.value = 0; bgmGain.connect(c.destination); }
    if (!el._routed) { c.createMediaElementSource(el).connect(bgmGain); el._routed = true; }
    el.volume = 1;                                 // 音量は つまみのほうで 決める
    return true;
  } catch (e) { return false; }
}
function bgmSetVol(v) {
  v = Math.max(0, Math.min(1, v));
  if (!bgmEl) return;
  if (bgmGain && bgmEl._routed) { try { bgmGain.gain.value = v; } catch (e) { } }
  else { try { bgmEl.volume = v; } catch (e) { } }
}
// 実際に 鳴りはじめた ときから そっと 音を上げる（鳴る前に 上げきってしまうと いきなり 大きな音になる）
function bgmFadeIn() {
  const el = bgmEl; if (!el) return;
  bgmSetVol(0);
  let v = 0;
  const id = setInterval(function () {
    if (bgmEl !== el) return clearInterval(id);
    const target = BGM_STEPS[bgmLevel] || 0;
    v = Math.min(target, v + 0.02); bgmSetVol(v);
    if (v >= target) clearInterval(id);
  }, 90);
}
function bgmArmFade(el) {
  if (el._fadeArmed) return;
  el._fadeArmed = true;
  el.addEventListener("playing", function () { el._fadeArmed = false; bgmFadeIn(); }, { once: true });
}
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
    bgmEl = bgmCache[name]; bgmName = name; bgmEl.loop = true;
    bgmRoute(bgmEl); bgmSetVol(0); bgmArmFade(bgmEl);
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
    bgmRoute(bgmEl); bgmSetVol(0); bgmArmFade(bgmEl);
    const p2 = bgmEl.play(); if (p2 && p2.catch) p2.catch(function () { });
  };
  tryNext();
  }
}
function bgmStop() { if (bgmEl) { try { bgmEl.pause(); } catch (e) { } } bgmEl = null; bgmName = ""; }
// BGMの音量を 切・小・中・大 から えらぶ
function setBgmLevel(n) {
  bgmLevel = Math.max(0, Math.min(3, n | 0));
  bgmOn = bgmLevel > 0;
  try { localStorage.setItem(BGML_KEY, String(bgmLevel)); localStorage.setItem(BGM_KEY, bgmOn ? "on" : "off"); } catch (e) { }
  if (!bgmOn) bgmStop();
  else if (bgmEl) bgmSetVol(BGM_STEPS[bgmLevel]);
  else { sfxPreload(); bgmArea = ""; bgmForView(curView); }   // いまの画面に合った曲を 鳴らす
  bgmAskHide();                      // 一度でも 決めたら「流しますか？」は もう出さない
  renderVolSegs();
}
/* BGM は はじめから 切（2026-09-13 ユーザー決定：新しい曲は 作らない・ほしい人だけ 🎵 で 入れる）。
   以前は はじめて開いたとき「音楽を 流しますか？」を 出していたが、やめた（軽く・静かに） */
function bgmAskHide() { const a = $("#bgmAsk"); if (a) a.classList.add("hidden"); }

/* パズルの曲は ステージごとに 入れかわる（同じ曲ばかり聞かないように） */
const BGM_LIST = [
  { f: "bgm1", n: T("ファンタジー1") },
  { f: "bgm2", n: T("ファンタジー2") },
  { f: "bgm3", n: T("アコースティック1") },
  { f: "bgm4", n: T("アコースティック2") },
  { f: "bgm_study", n: T("ピアノ") },
];
const BGM_BATTLE = { f: "bgm_battle", n: T("たいせん（サイバー）") };   // ⚔️たいせん 専用
const MAIN_KEY = "soroban_bgmmain", TURN_KEY = "soroban_bgmturn";
let bgmMain = localStorage.getItem(MAIN_KEY) || "bgm2";           // ホームの曲（設定で えらべる）。はじめは ファンタジー2
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
let curView = "home";                              // いま 開いている画面（音楽を あとから つけるときに 使う）
function bgmForView(v, next) {
  const area = bgmAreaOf(v);
  if (area === "study" && document.body.classList.contains("flashmode")) return bgmStop();   // フラッシュ暗算中は 鳴らさない（🎵を あとから 入れても）
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
const TITLES = { home: T("ホーム"), solomon: T("ソロモン"), grades: T("級・段を選ぶ"), play: T("れんしゅう"), today: T("本日の練習"), battle: T("たいせん"), puzzle: T("そろばんパズル"), parent: T("保護者"), records: T("記録を見る"), ranking: T("ランキング"), asobu: T("あそぶ"), notes: T("まちがいノート"), settings: T("設定・プロフィール"), lesson: T("そろばんの きほん"), sheet: T("プリントを 作る"), kentei: T("SK検定"), join: T("教室に 参加") };
function showView(v) {
  curView = v;
  bgmForView(v);
  $$(".view").forEach((el) => el.classList.toggle("hidden", el.id !== "view-" + v));
  $("#pageTitle").textContent = TITLES[v] || "";
  if (v === "home") { renderHome(); tipFirstOpen(); }
  if (v === "solomon") renderSolomon();
  if (v === "play") renderBridge();   // 📖 物語の練習のときだけ 橋を 出す（ほかの練習では しまう）
  if (v === "lesson") renderLesson();
  if (v === "records") { renderRecords(); renderSkillTree(); }
  if (v === "settings") renderSettings();
  if (v === "today") renderToday();
  if (v === "battle") renderBattle();
  if (v === "puzzle") renderPuzzle();
  if (v === "parent") renderParent();
  if (v === "sheet") renderSheet();
  if (v === "kentei") renderKentei();
  if (v === "ranking") renderRanking();
  if (v === "parent") { renderParentTech(); renderParentReady(); }
  if (v === "notes") renderNotes();
  if (v === "join") renderJoin();
  // 練習・たいせん中は スマホの上のバーを しまう（そのぶん 問題とそろばんを 大きく使う）
  // たいせんは「はじめる前の画面」では 上のバーを 残す（そこから 出られなくなるため）
  document.body.classList.toggle("playing", v === "play" || (v === "battle" && !!(battle && battle.running)));
  if (v !== "play") document.body.classList.remove("flashmode");   // フラッシュ暗算の 詰めた画面は 練習画面だけ
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
function setActiveNav(el) {
  $$(".nav").forEach((n) => n.classList.remove("active"));
  if (el) { el.classList.add("active"); const d = el.closest && el.closest("details.nav-more"); if (d) d.open = true; }   // たたんだ 中の 画面なら ひらく
}
/* 🎮 あそぶ：たいせん／パズル を えらぶ 画面（子どもの メニューを 4つに するため） */
$$(".asobu-btn").forEach((b) => b.addEventListener("click", () => { showView(b.dataset.go); setActiveNav(document.querySelector('.nav[data-view="asobu"]')); }));
// 画面を離れるときは進行中のものをすべて破棄する（採点・GOLD付与・記録保存はしない）
function abandonActivity() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  session = null;                              // 練習・検定：セッションを破棄（採点しない）
  routineState = null; routineActive = false;  // 本日の練習：中断（時間経過で練習画面に戻さない）
  battle = null;                               // たいせん：不戦敗（GOLDなし）
  flashSpec = null; flashAnswer = null; flashBusy = false; flashRun++;   // フラッシュ暗算：表示を止める
  document.body.classList.remove("flashmode");
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
const LV_MARK = [T("切"), T("小"), T("中"), T("大")];
function renderSndMini() {
  $$(".snd-btn").forEach(function (b) {
    const bgm = b.dataset.kind === "bgm";
    const lv = bgm ? bgmLevel : sfxLevel;
    b.innerHTML = (bgm ? "🎵" : "🔊") + '<i>' + LV_MARK[lv] + "</i>";
    b.classList.toggle("off", lv === 0);
    b.title = (bgm ? "BGM" : T("効果音")) + T("：") + LV_MARK[lv] + T("（おすと かわる）");
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
  if (!d) return T("（この級にはありません）");
  if (subj === "flash") return T("{v1}桁 {v2}口 / 約{v3}秒（1個 {v4}秒）", { v1: d.digits, v2: d.terms, v3: (d.terms * flashPaceMs(g) / 1000).toFixed(1), v4: (flashPaceMs(g) / 1000).toFixed(1) });
  if (subj === "kake") return (d.variants || [d]).map((v) => T("{v1}桁 × {v2}桁", { v1: v.a, v2: v.b })).join(T(" ／ "));
  if (subj === "wari") return (d.variants || [d]).map((v) => T("{v1}桁 ÷ {v2}桁", { v1: v.D, v2: v.dv })).join(T(" ／ "));
  const one = (v) => `${v.digits}桁 ${v.termsMax && v.termsMax > v.terms ? `${v.terms}〜${v.termsMax}` : v.terms}口`;
  if (d.label) return `${one(d)}　<b>${d.label}</b>`; // 入門級は「たして5」などの狙いを出す
  return d.variants ? d.variants.map(one).join(T(" ／ ")) : one(d);
}
function updateInfo() {
  const g = currentGrade();
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.subj === subject));
  $$(".chip").forEach((c) => (c.disabled = !difficulty(g, c.dataset.subj)));
  if (!difficulty(g, subject)) {
    // その級に 無い しゅもくなら、ある しゅもくの 最初のものへ（暗算だけの 級体系では みとり算が 無い）
    const first = ["mitori", "kake", "wari", "anzan", "flash"].find((s) => difficulty(g, s));
    if (!first) { $("#gradeInfo").innerHTML = T("<b>{v1}</b>：この級には しゅもくが ありません", { v1: g.key }); return; }
    subject = first; return updateInfo();
  }
  const cf = subjectCfg(g, subject);
  let info = T("<b>{v1}／{em}{v2}</b>：{v3}", { v1: g.key, em: (SUBJ_EM[subject] || "") + " ", v2: cf.name, v3: specText(g, subject) });
  if (cf.answer !== "flash") info += T("　｜ {v1}もん・{v2}分いない・{v3}点で ごうかく", { v1: cf.N, v2: cf.limit / 60, v3: cf.pass });
  if (g.band === "dan" || g.kyu > 15) info += T(` <span class="note">※目安</span>`);
  const say = info;   // 🔊 で 読むのは 級の 説明だけ（ボタンの 文字は 読まない）
  const L = lessonFor(g, subject);
  if (L) info += T(' <button id="lessonBtn" class="ghost lesson-btn">📖 この級の 解きかたを 見る</button>');
  $("#gradeInfo").innerHTML = info + sayBtn(say);   // 🔊 読み上げ（文字が 読めない子の ため）
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
  // 今日の 組み立てを 順番どおりに（まちがい直し → 練習 → にがて特訓 → フラッシュ）
  const steps = buildSteps(grade).filter((s) => s.rest == null);
  return steps.map((s) => {
    const em = s.flash ? "⚡" : (SUBJ_EM[s.subj] || "");
    const name = s.retry ? T("きのうの まちがい直し") : s.weak ? T("にがて特訓") : s.flash ? T("フラッシュ暗算") : SUBJECT[s.subj].name;
    return T("<div class=\"menu-row{v4}\"><span>{em} {v1}</span><b>{v2}問</b></div>", { em: s.retry ? "🔁" : s.weak ? "🎯" : em, v1: name, v2: s.N, v4: (s.retry || s.weak) ? " auto" : "" });
  }).join("");
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
  if (!st) { box.innerHTML = T('<div class="sp-h">⚡ 1もんの はやさ</div><div class="sub">れんしゅうすると、ここに「1もんに かかる時間」が 出るよ。きのうの じぶんに 勝とう！</div>'); return; }
  const name = subjName(st.subj), now = st.todayAvg != null ? st.todayAvg : st.thisWeek;
  let cmp = "";
  if (st.lastWeek != null && now != null) {
    const diff = st.lastWeek - now;
    cmp = diff > 0.05 ? T('<span class="sp-up">先週 ') + st.lastWeek.toFixed(1) + T('秒 → <b>') + diff.toFixed(1) + T('秒 はやくなった！</b></span>')
      : diff < -0.05 ? T('<span class="sp-dn">先週 ') + st.lastWeek.toFixed(1) + T('秒。きょうは ゆっくり ていねいに</span>')
      : T('<span class="sp-eq">先週と 同じくらい。あと 0.1秒！</span>');
  } else cmp = T('<span class="sp-eq">あしたも はかって、きょうの じぶんに 勝とう</span>');
  box.innerHTML = '<div class="sp-h">⚡ ' + name + T("の はやさ</div>") +
    T('<div class="sp-row"><div class="sp-big">1もん <b>') + (now != null ? now.toFixed(1) : "—") + T('</b><small>秒</small></div>') + sparkSVG(st.spark) + "</div>" +
    '<div class="sp-cmp">' + cmp + (st.best != null ? T('<span class="sp-best">🏆 じこベスト ') + st.best.toFixed(1) + T("秒</span>") : "") + "</div>";
}
function renderHome() {
  renderSpeed();
  const p = profile(), k = loadKingdom(), s = loadStat(), ms = monthStats(), g = homeGrade();
  $("#homeAvatar").innerHTML = avatarHTML(p.avatar); $("#homeName").textContent = p.name; $("#homeRank").textContent = rankText();
  $("#homeMenu").innerHTML = routineMenuSummary(g) || T('<div class="sub">この級では暗算・見取りを練習します</div>');
  $("#homeGold").textContent = k.gold.toLocaleString();
  $("#homeKingdomLv").textContent = kingdomLevel(k);
  $("#homeStreak").textContent = T("{v1}日", { v1: s.streak || 0 });
  $("#homeMonth").textContent = T("{v1}日", { v1: ms.days });
  const doneToday = JSON.parse(localStorage.getItem(ROUTINE) || "[]").some((h) => h.date === today());
  $("#homeStatus").innerHTML = doneToday ? T("✅ 今日の練習：<b>完了！</b>　えらい！") : T("今日の練習：<b>0 / 1</b>　さあ始めよう！");
  renderWeakMenu();
  renderWeakDiag();   // 🔍 弱点しんだん（技ごとの 正答率）
  renderNoteHome();   // 📒 まちがいノートの 数
  renderReadyHome();  // 🎯 進級の めやす
  renderHomework();                  // 教室に 入っている子：先生からの 宿題
  renderSolomonCard();               // 🐣 ソロモン
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

/* ============================================================ 📒 まちがいノート（フェーズB-3）
   まちがえた 問題を ノートに とっておき、型（10の友 など）を つけ、同じ 桁・口数・同じ 技の 類題 3問で 克服を ためす。
   3問 ぜんぶ 正解 →「✅ 克服」（日付つきで 残る）。何回 ためしたかも 残す＝「克服の 記録」が 見える */
const NOTES_KEY = "soroban_notes";
const notesAll = () => { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); } catch (e) { return []; } };
const notesSave = (l) => { try { localStorage.setItem(NOTES_KEY, JSON.stringify(l.slice(-150))); } catch (e) { } };
// 1セットの まちがい（logSession の miss）を ノートへ。同じ 問題が まだ 克服前なら 回数だけ 増やす
function noteAddFromMiss(miss, subj) {
  if (!miss || !miss.length) return;
  const l = notesAll();
  miss.forEach((m) => {
    if (!m.q) return;
    const ex = l.find((n) => n.q === m.q && !n.done);
    if (ex) { ex.seen = (ex.seen || 1) + 1; ex.d = today(); return; }
    l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), d: today(), q: String(m.q), u: m.u, a: m.a, k: m.k || "other", subj: subj || "mitori", tries: [], done: "", seen: 1 });
  });
  notesSave(l);
}
function noteAfterDrill(id, correct, N) {
  const l = notesAll(), n = l.find((x) => x.id === id); if (!n) return "";
  n.tries.push({ d: today(), c: correct, n: N });
  if (N > 0 && correct >= N) n.done = today();
  notesSave(l);
  return n.done ? "done" : "try";
}
// 類題：同じ 桁・口数で、同じ 技（5の友・10の友）を 使う 問題を 作る
function similarProblems(note, n) {
  const r = problemFromMiss({ q: note.q }, note.subj); if (!r) return [];
  const out = [], seen = {};
  if (r.subj === "kake") {
    const a = String(r.p.fa).length, b = String(r.p.fb).length;
    for (let g = 0; g < 200 && out.length < n; g++) { const p = genKake({ a, b }); if (seen[p.display] || p.display === r.p.display) continue; seen[p.display] = 1; out.push({ ...p, compact: p.display }); }
    return out;
  }
  if (r.subj === "wari") {
    const dv = String(r.p.divisor).length, qd = String(r.p.quotient).length;
    for (let g = 0; g < 200 && out.length < n; g++) { const p = genWari({ D: dv + qd, dv, qd }); if (seen[p.display] || p.display === r.p.display) continue; seen[p.display] = 1; out.push({ ...p, compact: p.display }); }
    return out;
  }
  const nums = r.p.nums, digits = Math.max(...nums.map((v) => String(Math.abs(v)).length)), terms = nums.length, sub = nums.some((v) => v < 0);
  const needle = note.k === "five" ? T("5の友") : note.k === "ten" ? T("10の友") : "";
  const spec = sub ? { digits, terms } : { digits, terms, sub: false };
  for (let g = 0; g < 400 && out.length < n; g++) {
    const p = genMitori(spec);
    if (needle && !needsTech(p.nums, needle)) continue;
    const q = mitoriProblem(p.nums); if (seen[q.compact] || q.compact === note.q) continue; seen[q.compact] = 1; out.push(q);
  }
  for (let g = 0; g < 60 && out.length < n; g++) { const q = mitoriProblem(genMitori(spec).nums); if (!seen[q.compact]) { seen[q.compact] = 1; out.push(q); } }
  return out;
}
function startNoteDrill(id) {
  const n = notesAll().find((x) => x.id === id); if (!n) return;
  const qs = similarProblems(n, 3); if (!qs.length) { alert(T("類題を うまく 作れませんでした")); return; }
  const subj = /[×x]/.test(n.q) ? "kake" : /÷/.test(n.q) ? "wari" : (n.subj === "anzan" ? "anzan" : "mitori");
  const cf = SUBJECT[subj], K = MISS_KINDS[n.k] || MISS_KINDS.other;
  session = {
    subj, grade: currentGrade(), cf, N: qs.length, idx: 0, correct: 0, answerBy: answerModeFor(cf),
    timed: false, mode: "each", results: [], locking: false, start: performance.now(), cur: null,
    paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0, queue: qs.slice(), note: id,
    weak: ["five", "ten", "kuku"].includes(n.k) ? n.k : "", weakN: 3,
  };
  document.body.classList.remove("flashmode");
  $("#playMark").classList.add("hidden");
  $("#pauseBtn").classList.remove("hidden"); setPauseUI(false);
  showView("play");
  bgmForStudy(true);
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.toggle("hidden", session.answerBy !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", session.answerBy !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#anzanTip").classList.add("hidden");
  $("#stepsRow").classList.toggle("hidden", !["mitori", "kake", "wari"].includes(subj));
  $("#playGrade").textContent = T("📒 まちがいノート：類題 3問（{v1}）", { v1: K.n });
  $("#playTimer").textContent = ""; $("#playProgress").textContent = "";
  $("#playResult").innerHTML = T("<div class=\"mr-tip\">{em} もとの 問題：<b>{q}</b>　3問 ぜんぶ 正解で 克服！</div>", { em: K.em, q: jesc(n.q) }); $("#playResult").className = "result";
  $("#steps").classList.add("hidden");
  startPlayTimer();
  nextPlayProblem();
}
function renderNotes() {
  const box = $("#notesBox"); if (!box) return;
  const l = notesAll().slice().reverse(), open = l.filter((n) => !n.done), done = l.filter((n) => n.done);
  const row = (n) => {
    const K = MISS_KINDS[n.k] || MISS_KINDS.other, tries = (n.tries || []).length;
    return `<div class="nt-row${n.done ? " done" : ""}"><div class="nt-q">${jesc(n.q)}</div>` +
      T('<div class="nt-a">きみ：<s>{u}</s>　→　こたえ <b>{a}</b></div>', { u: jesc(n.u == null ? "—" : n.u), a: jesc(n.a) }) +
      `<div class="nt-k">${K.em} ${K.n}</div>` +
      (n.done ? T('<div class="nt-done">✅ 克服 {d}</div>', { d: n.done })
        : T('<div class="nt-try">{v1}回 ためした</div><button class="nt-go" data-id="{id}">▶ 類題 3問</button>', { v1: tries, id: n.id })) +
      `<div class="nt-d">${n.d}</div></div>`;
  };
  box.innerHTML = (open.length ? T('<h4>まだ 克服していない（{n}）</h4>', { n: open.length }) + open.map(row).join("") : T('<p class="sub">まちがえた問題は ここに たまります。いまは 空っぽ！</p>')) +
    (done.length ? T('<h4>克服した（{n}）</h4>', { n: done.length }) + done.slice(0, 40).map(row).join("") : "");
  $$("#notesBox .nt-go").forEach((b) => { b.onclick = () => startNoteDrill(b.dataset.id); });
}
function renderNoteHome() {
  const el = $("#noteHome"); if (!el) return;
  const l = notesAll(), open = l.filter((n) => !n.done).length, done = l.filter((n) => n.done).length;
  if (!l.length) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML = T('<span>📒 まちがいノート：まだ <b>{open}</b>問・克服 <b>{done}</b>問</span><button class="nt-open">ノートを ひらく</button>', { open, done });
  el.querySelector(".nt-open").onclick = () => { showView("notes"); setActiveNav(document.querySelector('.nav[data-view="notes"]')); };
}

/* ============================================================ 🔍 弱点診断（フェーズB-1）
   「正答率 83%」で 終わらせず、「10の友が 72%」まで 分ける。
   1問ごとに、その問題を 解くのに 使う 技（5の友・10の友・くり上がり2回以上・ひき算）と 桁・口数を 調べ、
   記録（soroban_sessions の ft）に「技ごとの 正解／出題／秒」を ためる。診断は 直近30日を 合計して 出す。
   技の 有無は 解き方の 手順（solveSteps）から 数える＝「解き方をみる」と 同じ ものさし */
const FEAT = {
  five:   { n: T("5の友（五玉）"), em: "🖐", weak: "five" },
  ten:    { n: T("10の友（くり上がり・くり下がり）"), em: "🔟", weak: "ten" },
  carry2: { n: T("くり上がりが 2回以上"), em: "🔁", weak: "ten" },
  sub:    { n: T("ひき算が まざる"), em: "➖", weak: "" },
  plain:  { n: T("技を 使わない たし算"), em: "🟢", weak: "" },
  dg1: { n: T("1桁の 数"), em: "1️⃣", weak: "" }, dg2: { n: T("2桁の 数"), em: "2️⃣", weak: "" }, dg3: { n: T("3桁の 数"), em: "3️⃣", weak: "" }, dg4: { n: T("4桁以上の 数"), em: "4️⃣", weak: "" },
  tm_s: { n: T("口数 2〜3"), em: "📏", weak: "" }, tm_m: { n: T("口数 4〜6"), em: "📏", weak: "" }, tm_l: { n: T("口数 7以上"), em: "📏", weak: "" },
  kuku: { n: T("九九（1桁×1桁）"), em: "✖", weak: "kuku" }, kk1: { n: T("かけ算（×1桁）"), em: "✏️", weak: "" }, kk2: { n: T("かけ算（×2桁以上）"), em: "✏️", weak: "" },
  wr: { n: T("わり算"), em: "➗", weak: "" },
};
// 1問の 特徴（技・桁・口数）。r＝結果 { subj, nums, compact }
function problemFeatures(r) {
  const f = [];
  if (r.nums && r.nums.length) {
    let five = 0, ten = 0;
    try { solveSteps(r.nums).forEach((t) => t.moves.forEach((m) => { if (m.indexOf(T("5の友")) >= 0) five++; if (m.indexOf(T("10の友")) >= 0) ten++; })); } catch (e) { }
    if (five) f.push("five"); if (ten) f.push("ten"); if (ten >= 2) f.push("carry2"); if (!five && !ten) f.push("plain");
    if (r.nums.some((v) => v < 0)) f.push("sub");
    const dg = Math.max(...r.nums.map((v) => String(Math.abs(v)).length)); f.push(dg >= 4 ? "dg4" : "dg" + dg);
    const tm = r.nums.length; f.push(tm <= 3 ? "tm_s" : tm <= 6 ? "tm_m" : "tm_l");
  } else if (r.subj === "kake") {
    const m = /^([\d,]+)\s*[×x]\s*([\d,]+)/.exec(r.compact || "");
    if (m) { const a = m[1].replace(/,/g, "").length, b = m[2].replace(/,/g, "").length; f.push(a === 1 && b === 1 ? "kuku" : (a >= 2 && b >= 2 ? "kk2" : "kk1")); }
  } else if (r.subj === "wari") f.push("wr");
  return f;
}
// 1セットぶん：技ごとに [正解, 出題, 秒の合計]
function sessionFeatures(results) {
  const ft = {};
  (results || []).forEach((r) => { problemFeatures(r).forEach((k) => { const a = ft[k] || (ft[k] = [0, 0, 0]); a[1]++; if (r.ok) a[0]++; if (typeof r.t === "number" && isFinite(r.t)) a[2] = Math.round((a[2] + r.t) * 10) / 10; }); });
  return ft;
}
// 直近 days 日の 診断。rows＝技ごとの { k, n, em, c, t, rate, sec, weak }（出題 5問以上のみ）。overall＝全体の 正答率
function weakDiagnosis(days) {
  const from = daysAgo(days || 30), tot = {}; let C = 0, N = 0;
  allSessions().filter((e) => e.ft && (e.d || "") >= from && e.src !== "battle").forEach((e) => {
    C += e.correct || 0; N += e.N || 0;
    Object.entries(e.ft).forEach(([k, a]) => { if (!FEAT[k]) return; const t = tot[k] || (tot[k] = [0, 0, 0]); t[0] += a[0] || 0; t[1] += a[1] || 0; t[2] += a[2] || 0; });
  });
  const rows = Object.entries(tot).filter(([k, a]) => a[1] >= 5).map(([k, a]) => ({ k, n: FEAT[k].n, em: FEAT[k].em, c: a[0], t: a[1], rate: Math.round((a[0] / a[1]) * 100), sec: a[1] ? Math.round((a[2] / a[1]) * 10) / 10 : 0, weak: FEAT[k].weak }));
  rows.sort((x, y) => x.rate - y.rate || y.t - x.t);
  const overall = N ? Math.round((C / N) * 100) : null;
  // 「にがて」＝全体より 10ポイント以上 低い、または 70% 未満
  rows.forEach((r) => { r.isWeak = overall != null ? (r.rate <= overall - 10 || r.rate < 70) : r.rate < 70; });
  return { rows, overall, N };
}
function weakDiagHTML(d, opts) {
  const o = opts || {};
  if (!d.rows.length) return T('<div class="wd-none">れんしゅうが たまると、ここに「どの技が にがてか」が 出ます（技ごとに 5問 以上 やってから）。</div>');
  const top = o.all ? d.rows : d.rows.slice(0, o.max || 4);
  return top.map((r) => {
    const cls = r.isWeak ? " weak" : (r.rate >= 90 ? " good" : "");
    return `<div class="wd-row${cls}"><span class="wd-em">${r.em}</span><span class="wd-n">${r.n}</span>` +
      `<div class="wd-bar"><div style="width:${r.rate}%"></div></div><b class="wd-rate">${r.rate}%</b>` +
      T('<span class="wd-c">{c}／{t}問</span>', { c: r.c, t: r.t }) +
      (r.isWeak ? T('<span class="wd-tag">ここが にがて</span>') : "") +
      (r.isWeak && r.weak && !o.noBtn ? T('<button class="wd-go" data-k="{v1}">▶ 5問 やる</button>', { v1: r.weak }) : "") +
      "</div>";
  }).join("");
}
function renderWeakDiag() {
  const el = $("#weakDiag"); if (!el) return;
  const d = weakDiagnosis(30);
  if (!d.rows.length) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const w = d.rows.filter((r) => r.isWeak)[0];
  const head = w ? T("いま いちばん にがてなのは <b>{n}</b>（{rate}%）", { n: w.n, rate: w.rate }) : T("にがてな 技は ありません。この調子！");
  el.innerHTML = T('<div class="wd-h">🔍 弱点しんだん（30日）<span class="wd-all">ぜんぶ {overall}%</span></div>', { overall: d.overall == null ? "—" : d.overall }) +
    '<div class="wd-lead">' + head + " " + sayBtn(head) + "</div>" + weakDiagHTML(d, { max: 4 });
  $$("#weakDiag .wd-go").forEach((b) => { b.onclick = () => startWeakSession(b.dataset.k, 5); });
}
/* ============================================================ 🌳 スキルツリー（フェーズB-4）
   級とは べつの 軸。技ごとの できぐあいを ★1〜5 で 見せる（記録の ft から。直近 半年）。
   級体系が 国や 教室で ちがっても、技の ものさしは 共通 */
const SKILL_GROUPS = [
  { n: T("たし算・ひき算の 技"), keys: ["plain", "five", "ten", "carry2", "sub"] },
  { n: T("大きな 数"), keys: ["dg1", "dg2", "dg3", "dg4"] },
  { n: T("口数（たす 数の 数）"), keys: ["tm_s", "tm_m", "tm_l"] },
  { n: T("かけ算・わり算"), keys: ["kuku", "kk1", "kk2", "wr"] },
  { n: T("フラッシュ暗算"), keys: ["flash"] },
];
// ★の きめ方：10問 未満は「？」。★5 は 95% 以上 かつ 30問 以上
function starsOf(c, t) {
  if (!t || t < 10) return 0;
  const r = c / t;
  if (r >= 0.95 && t >= 30) return 5;
  if (r >= 0.85) return 4;
  if (r >= 0.75) return 3;
  if (r >= 0.6) return 2;
  return 1;
}
function skillStats(days) {
  const from = daysAgo(days || 180), tot = {};
  allSessions().filter((e) => (e.d || "") >= from && e.src !== "battle").forEach((e) => {
    if (e.subj === "flash") { const t = tot.flash || (tot.flash = [0, 0]); t[0] += e.correct || 0; t[1] += e.N || 0; }
    if (e.ft) Object.entries(e.ft).forEach(([k, a]) => { if (!FEAT[k]) return; const t = tot[k] || (tot[k] = [0, 0]); t[0] += a[0] || 0; t[1] += a[1] || 0; });
  });
  return tot;
}
function renderSkillTree() {
  const el = $("#skillTree"); if (!el) return;
  const tot = skillStats(180);
  const node = (k) => {
    const f = k === "flash" ? { n: T("フラッシュ暗算"), em: "⚡" } : FEAT[k];
    const a = tot[k] || [0, 0], st = starsOf(a[0], a[1]);
    const stars = st ? "★".repeat(st) + "☆".repeat(5 - st) : "？";
    return `<div class="sk-node s${st}"><span class="sk-em">${f.em}</span><span class="sk-n">${f.n}</span><span class="sk-st">${stars}</span>` +
      (a[1] ? T('<span class="sk-c">{v1}%（{v2}問）</span>', { v1: Math.round((a[0] / a[1]) * 100), v2: a[1] }) : T('<span class="sk-c">まだ</span>')) + "</div>";
  };
  const any = Object.values(tot).some((a) => a[1] > 0);
  el.innerHTML = SKILL_GROUPS.map((g) => `<div class="sk-group"><div class="sk-gh">${g.n}</div><div class="sk-row">${g.keys.map(node).join('<span class="sk-ar">→</span>')}</div></div>`).join("") +
    (any ? "" : T('<p class="sub">れんしゅうすると ★が ついていくよ（技の 記録は 今日からの 練習で たまります）。</p>'));
}
/* ============================================================ 🎯 進級の めやす（フェーズB-5）
   直近30日の その級の 練習（最新 5セットまで）から、SK検定に 受かりそうかを しゅもくごとに 見る。
     正答率 ＝ 合格点 ÷ 満点 と くらべる／速さ ＝ 1問の 秒 × 問題数 が 制限時間に 入るか
   「めやす」であって 予測では ない（データが 揃うまで AI予測とは 名乗らない）。 */
function readiness(grade, track) {
  const steps = examSteps(grade, track); if (!steps.length) return null;
  const from = daysAgo(30), all = allSessions();
  const rows = steps.map(({ subj, cf }) => {
    const ss = all.filter((e) => e.g === grade.key && e.subj === subj && (e.d || "") >= from && e.src !== "battle" && (e.N || 0) >= 3).slice(-5);
    if (!ss.length) return { subj, name: cf.name, none: true };
    const N = ss.reduce((a, e) => a + (e.N || 0), 0), C = ss.reduce((a, e) => a + (e.correct || 0), 0), sec = ss.reduce((a, e) => a + (e.sec || 0), 0);
    const acc = N ? C / N : 0, need = cf.per && cf.N ? cf.pass / (cf.N * cf.per) : 0.7;
    const perQ = N ? sec / N : 0, needPerQ = cf.limit && cf.N ? cf.limit / cf.N : 0;
    const accScore = need ? acc / need : 1, spScore = needPerQ && perQ > 0 ? needPerQ / perQ : 1;
    return { subj, name: cf.name, sessions: ss.length, acc: Math.round(acc * 100), need: Math.round(need * 100), perQ, needPerQ,
      accOk: acc >= need, speedOk: !needPerQ || perQ <= needPerQ, score: Math.min(1.2, Math.min(accScore, spScore)) };
  });
  const have = rows.filter((r) => !r.none);
  const overall = have.length ? Math.min(...have.map((r) => r.score)) : null;
  return { grade, track, rows, overall, pct: overall == null ? null : Math.round(Math.min(100, overall * 100)),
    ready: have.length === rows.length && have.every((r) => r.accOk && r.speedOk && r.sessions >= 2) };
}
function readinessHTML(R, opts) {
  const o = opts || {};
  if (!R) return "";
  const chips = R.rows.map((r) => {
    if (r.none) return T('<span class="rd-chip none">{name}：まだ この級の 記録なし</span>', { name: r.name });
    const parts = [];
    parts.push((r.accOk ? "✅ " : "⚠ ") + T("正答率 {acc}%", { acc: r.acc }) + (r.accOk ? "" : T("（合格は {need}%）", { need: r.need })));
    if (r.needPerQ) parts.push((r.speedOk ? "✅ " : "⚠ ") + T("速さ 1問 {v1}秒", { v1: r.perQ.toFixed(1) }) + (r.speedOk ? "" : T("（{v2}秒 以内に）", { v2: r.needPerQ.toFixed(1) })));
    return `<span class="rd-chip ${r.accOk && r.speedOk ? "ok" : "ng"}"><b>${r.name}</b> ${parts.join("　")}</span>`;
  }).join("");
  const head = R.pct == null ? T("まだ この級の 記録が ありません。れんしゅうすると めやすが 出ます。")
    : R.ready ? T("いつでも 受けられそう！ 合格の めやす <b>{pct}%</b>", { pct: R.pct })
    : T("合格の めやす <b>{pct}%</b>", { pct: R.pct });
  return `<div class="rd-head">🎯 ${T("{g} {t}：", { g: R.grade.key, t: (EXAM_TRACKS[R.track] || {}).name || "" })}${head} ${sayBtn(String(head).replace(/<[^>]*>/g, ""))}</div><div class="rd-chips">${chips}</div>` +
    (R.ready && !o.noBtn ? T('<button class="rd-go">🏅 SK検定を 受けてみる</button>') : "") +
    (o.note === false ? "" : T('<div class="rd-note">直近30日の 練習からの めやす（予測では ありません）</div>'));
}
// めやすを 出す 級＝直近30日で いちばん 練習している 級（無ければ ホームの 級）
function readyTargetGrade() {
  const from = daysAgo(30), cnt = {}, last = {};
  allSessions().forEach((e) => { if (!e.g || (e.d || "") < from || e.src === "battle") return; cnt[e.g] = (cnt[e.g] || 0) + 1; last[e.g] = e.t || 0; });
  const key = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || last[b] - last[a])[0];
  return (key && GRADES.find((g) => g.key === key)) || homeGrade();
}
function renderReadyHome() {
  const el = $("#gradeReady"); if (!el) return;
  const g = readyTargetGrade(); if (!g) { el.classList.add("hidden"); return; }
  const track = examSteps(g, "soroban").length ? "soroban" : examSteps(g, "anzan").length ? "anzan" : "";
  const R = track ? readiness(g, track) : null;
  if (!R || R.pct == null) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML = readinessHTML(R, {});
  const b = el.querySelector(".rd-go"); if (b) b.onclick = () => { showView("kentei"); setActiveNav(document.querySelector('.nav[data-view="kentei"]')); const sel = $("#exGrade"); if (sel) { sel.value = String(gradeIdxOf(g)); $("#exTrack").value = track; examUpdateSpec(); } };
}
function renderParentReady() {
  const el = $("#parentReady"); if (!el) return;
  const g = readyTargetGrade(); if (!g) { el.innerHTML = ""; return; }
  const parts = ["soroban", "anzan"].map((t) => readiness(g, t)).filter(Boolean).map((R) => readinessHTML(R, { noBtn: true, note: false }));
  el.innerHTML = parts.length ? parts.join("") + T('<p class="sub">直近30日の その級の 練習（最新5セット）から。正答率は 合格点÷満点、速さは 1問の 秒×問題数 が 制限時間に 入るか、で 見ています。予測では なく めやすです。</p>') : T('<p class="sub">この級の 記録が たまると 出ます。</p>');
}
function renderParentTech() {
  const el = $("#parentTech"); if (!el) return;
  const d = weakDiagnosis(30);
  el.innerHTML = (d.overall != null ? T('<p class="sub">直近30日 ぜんぶで {overall}%（{N}問）。技ごとに 見ると：</p>', { overall: d.overall, N: d.N }) : "") + weakDiagHTML(d, { all: true, noBtn: true }) +
    T('<p class="sub">「にがて」＝ ぜんたいより 10ポイント以上 低い、または 70% 未満。1問あたりの 秒は 記録に 残しています（今後の「速度が 落ちる所」の 診断に 使います）。</p>');
}
function renderWeakMenu() {
  const el = $("#weakMenu"); if (!el) return;
  const w = weakProfile(14);
  if (!w.length) { el.innerHTML = T('<div class="wm-none">まちがえた記録が たまると、ここに <b>にがて克服メニュー</b> が出ます。</div>'); return; }
  const rows = w.slice(0, 3).map((x) => {
    const K = MISS_KINDS[x.k] || MISS_KINDS.other;
    return `<div class="wm-row"><span class="wm-em">${K.em}</span><span class="wm-n">${K.n}</span>` +
      T("<span class=\"wm-c\">{v1}回</span><button class=\"wm-go\" data-k=\"{v2}\">▶ 5問 やる</button></div>", { v1: x.n, v2: x.k });
  }).join("");
  el.innerHTML = T("<div class=\"wm-h\">🎯 きみの にがて克服メニュー</div>{rows}", { rows }) +
    T(`<div class="sub">まちがえたクセと同じ形の問題だけを 出します。正解すると GOLD ももらえるよ。</div>`);
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
  const diff = tN - lN, diffTxt = lN ? (diff >= 0 ? T("先週より +{diff}問 📈", { diff }) : T("先週より {diff}問", { diff })) : T("先週の記録はまだありません");
  $("#parentSummary").innerHTML =
    '<div class="pgrid">' +
    T("<div class=\"pcell\"><span>現在の級</span><b>{rk}</b></div>", { rk }) +
    T("<div class=\"pcell\"><span>連続学習</span><b>{v1}日</b></div>", { v1: s.streak || 0 }) +
    T("<div class=\"pcell\"><span>今週の学習日数</span><b>{days}日</b></div>", { days }) +
    T("<div class=\"pcell\"><span>今週の問題数</span><b>{tN}問</b></div>", { tN }) +
    T("<div class=\"pcell\"><span>今週の正答率</span><b>{acc}%</b></div>", { acc }) +
    T("<div class=\"pcell\"><span>平均回答時間</span><b>{v1}</b></div>", { v1: avgT ? avgT.toFixed(1) + "秒" : "—" }) +
    `</div><div class="sub">${diffTxt}</div>`;
  const bars = [], wk = [T("日"), T("月"), T("火"), T("水"), T("木"), T("金"), T("土")];
  for (let i = 6; i >= 0; i--) { const d = daysAgo(i); bars.push({ d, n: sum(sessionsBetween(d, d), (e) => e.N) }); }
  const maxN = Math.max(10, ...bars.map((b) => b.n));
  $("#parentWeek").innerHTML = '<div class="pbars">' + bars.map((b) => {
    const lbl = wk[new Date(b.d + "T00:00:00").getDay()];
    return `<div class="pbar-col"><span class="pbar-n">${b.n}</span><div class="pbar" style="height:${Math.max(3, (b.n / maxN) * 90)}px"></div><span class="pbar-l">${lbl}</span></div>`;
  }).join("") + "</div>";
  const m = accBySubject(sessionsBetween(daysAgo(29), to));
  const rows = ["mitori", "kake", "wari", "anzan", "flash"].filter((x) => m[x]).map((x) => ({ x, a: Math.round((m[x].correct / m[x].N) * 100), N: m[x].N }));
  if (!rows.length) { $("#parentSubjects").innerHTML = T('<p class="sub">練習を重ねると、得意・苦手が分かります。</p>'); return; }
  const best = rows.slice().sort((a, b) => b.a - a.a)[0], worst = rows.slice().sort((a, b) => a.a - b.a)[0];
  $("#parentSubjects").innerHTML = rows.map((r) => `<div class="psub"><span>${SUBJECT[r.x].name}</span><div class="psub-bar"><div style="width:${r.a}%"></div></div><b>${r.a}%</b></div>`).join("") +
    T("<div class=\"sub\">得意：<b>{v1}</b>（{v2}%）／ これから：<b>{v3}</b>（{v4}%）</div>", { v1: SUBJECT[best.x].name, v2: best.a, v3: SUBJECT[worst.x].name, v4: worst.a });
}
function routineGraphSVG(hist) {
  if (!hist.length) return T('<p class="sub">「本日の練習」を さいごまで やると、ここに グラフが 出るよ。</p>');
  const data = hist.slice(-20), n = data.length, W = 560, H = 180, pad = 28;
  const x = (i) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (n - 1));
  const y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${pad}" y1="${y(v)}" x2="${W - pad}" y2="${y(v)}" stroke="#eee"/><text x="4" y="${y(v) + 3}" font-size="9" fill="#999">${v}</text>`).join("");
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.acc).toFixed(1)}`).join(" ");
  const dots = data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.acc).toFixed(1)}" r="3.5" fill="#c0392b"><title>${d.date} ${d.grade} ${d.acc}%</title></circle>`).join("");
  return T("<svg viewBox=\"0 0 {W} {H}\" class=\"graph\">{grid}<polyline points=\"{pts}\" fill=\"none\" stroke=\"#c0392b\" stroke-width=\"2\"/>{dots}</svg><p class=\"sub\">正答率(%)の推移・直近{n}回</p>", { W, H, grid, pts, dots, n });
}
function renderRecords() {
  const ms = monthStats();
  $("#recEffort").textContent = T("学習日数 {v1}日　／　合計 {v2}", { v1: ms.days, v2: fmtMin(ms.sec) });
  const hist = JSON.parse(localStorage.getItem(ROUTINE) || "[]");
  $("#routineGraph").innerHTML = routineGraphSVG(hist);
  const hrows = hist.slice(-15).reverse().map((h) => `<tr><td>${h.date}</td><td>${h.grade}</td><td>${h.acc}%</td><td>${h.totalCorrect}/${h.totalN}</td><td>${fmtClock(h.timeSec)}</td></tr>`).join("");
  $("#routineList").innerHTML = hrows
    ? T("<table class=\"rec-table\"><tr><th>日づけ</th><th>級・段</th><th>正答率</th><th>正解</th><th>タイム</th></tr>{hrows}</table>", { hrows })
    : "";
  const t = allTimes(), subs = ["mitori", "kake", "wari", "anzan"];
  const rows = GRADES.filter((g) => subs.some((s) => t[`${g.key}_${s}`] != null))
    .map((g) => `<tr><td>${g.key}</td>${subs.map((s) => `<td>${t[`${g.key}_${s}`] != null ? fmtClock(t[`${g.key}_${s}`]) : "—"}</td>`).join("")}</tr>`).join("");
  $("#recordsTable").innerHTML = rows
    ? T("<table class=\"rec-table\"><tr><th>級・段</th><th>みとり</th><th>かけ</th><th>わり</th><th>あんざん</th></tr>{rows}</table>", { rows })
    : T(`<p class="sub">まだ きろくが ないよ。れんしゅうを さいごまで やると、タイムが のこるよ。</p>`);
  renderWeekRank();
  renderRecLog();
  renderCerts();
}

/* ============================================================ やった記録（ぜんぶ）
   これまで logSession で ためていたのに どこにも出していなかった。
   1回ずつ ぜんぶ 見られるようにする。 */
let recFilter = "all";
const SUBJ_EM = { mitori: "🧮", kake: "✏️", wari: "➗", anzan: "💭", flash: "⚡" };
const subjName = (k) => (SUBJECT[k] ? SUBJECT[k].name : (String(k).startsWith("sk-") && EXAM_TRACKS[k.slice(3)] ? T("SK検定・") + EXAM_TRACKS[k.slice(3)].name + T("・自宅受験") : k));
function renderRecLog() {
  const box = $("#recLog"); if (!box) return;
  const all = allSessions().slice().reverse();          // 新しいものが 上
  // しぼりこみボタン
  const counts = {};
  all.forEach((e) => { counts[e.subj] = (counts[e.subj] || 0) + 1; });
  const kinds = ["mitori", "kake", "wari", "anzan", "flash"].filter((k) => counts[k]);
  $("#recFilter").innerHTML =
    '<button class="chip' + (recFilter === "all" ? " active" : "") + T('" data-rf="all">ぜんぶ ') + all.length + T("回</button>") +
    kinds.map((k) => '<button class="chip' + (recFilter === k ? " active" : "") + '" data-rf="' + k + '">' +
      SUBJ_EM[k] + " " + subjName(k) + " " + counts[k] + T("回</button>")).join("");
  $$("#recFilter .chip").forEach((b) => { b.onclick = () => { recFilter = b.dataset.rf; renderRecLog(); }; });

  const list = recFilter === "all" ? all : all.filter((e) => e.subj === recFilter);
  // まとめ
  const N = list.reduce((a, e) => a + e.N, 0), C = list.reduce((a, e) => a + e.correct, 0);
  const totalSec = list.reduce((a, e) => a + (e.sec || 0), 0);
  $("#recSummary").innerHTML = list.length
    ? T("ぜんぶで <b>{v1}回</b>　といた問題 <b>{N}問</b>　正解 <b>{C}問</b>（正答率 {v4}%）　合計 <b>{v5}</b>", { v1: list.length, N, C, v4: N ? Math.round((C / N) * 100) : 0, v5: fmtMin(totalSec) })
    : T("まだ きろくが ないよ。");
  const show = list.slice(0, 80);
  box.innerHTML = recLogTable(show) +
    (list.length > show.length ? T("<p class=\"sub\">新しい {v1}回 を出しています（ぜんぶで {v2}回）</p>", { v1: show.length, v2: list.length }) : "");
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
  return T("<table class=\"rec-table\"><tr><th>日付</th><th>種目</th><th>級・段</th><th>正解</th><th>正答率</th><th>時間</th><th>1問</th><th>まちがい</th></tr>{trs}</table>", { trs });
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
  if (!ws.length) { box.innerHTML = T('<p class="sub">練習すると ここに ランキングが 出ます。</p>'); return; }
  const thisWeek = weekKeyOf(today());
  const idx = ws.findIndex((x) => x.k === thisWeek);
  const me = idx >= 0 ? ws[idx] : null;
  const head = me
    ? T("<div class=\"rank-now\">今週は 歴代 <b>{v1}位</b> ／ {v2}週　<span class=\"rank-pt\">{v3} ポイント</span></div>", { v1: idx + 1, v2: ws.length, v3: me.pt }) +
      (idx === 0 ? T('<div class="rank-cheer">🏆 じぶんの 最高記録を こうしん中！</div>')
        : T("<div class=\"rank-cheer\">あと <b>{v1}</b> ポイントで {idx}位！</div>", { v1: ws[idx - 1].pt - me.pt, idx }))
    : T('<div class="rank-now">今週は まだ 0ポイント。1セットやると のります。</div>');
  const rows = ws.slice(0, 8).map(function (x, i) {
    const now = x.k === thisWeek;
    return T("<tr class=\"{v1}\"><td>{v2}位</td><td>{v3} の週{v4}</td>", { v1: now ? "rank-me" : "", v2: i + 1, v3: x.k, v4: now ? "（今週）" : "" }) +
      T("<td><b>{v1}</b></td><td>{v2}セット</td><td>{v3}問</td><td>{v4}%</td><td>{v5}日</td></tr>", { v1: x.pt, v2: x.sets, v3: x.N, v4: x.acc, v5: x.days });
  }).join("");
  const sk = skillRank();
  const skHTML = sk.length
    ? T('<h4 class="rank-h">🎖 実力ランク（検定の 制限時間と くらべて）</h4>') +
      T('<table class="rec-table"><tr><th>級・段</th><th>種目</th><th>じぶんのタイム</th><th>検定の制限</th><th>ランク</th></tr>') +
      sk.map((x) => `<tr><td>${x.g}</td><td>${subjName(x.sj)}</td><td>${fmtClock(x.best)}</td><td>${fmtClock(x.lim)}</td>` +
        `<td><span class="rk rk-${x.rank}">${x.rank}</span></td></tr>`).join("") + "</table>" +
      T('<p class="sub">S＝制限時間の35%以内　A＝55%以内　B＝80%以内　C＝それ以上。検定は「時間内に とける」ことが 合格の めやすです。</p>')
    : "";
  box.innerHTML = head +
    T('<table class="rec-table"><tr><th></th><th>週</th><th>ポイント</th><th>セット</th><th>問題</th><th>正答率</th><th>日数</th></tr>') + rows + "</table>" +
    T('<p class="sub">ポイント＝といた数 ＋ 正解×2 ＋ 正答率 ＋ つづけた日数×30</p>') + skHTML;
}
function renderToday() {
  const sel = $("#todayGrade");
  const lv = routineLevel(), d = practiceDays();
  const steps = buildSteps(homeGrade());
  const lines = steps.map((st) => st.rest != null ? T("きゅうけい ") + st.rest + T("びょう") : st.label).join(" → ");
  const note = $("#todayNote");
  if (note) note.innerHTML = (lv === 0 ? T("はじめての日は <b>3もん</b>だけ。まずは「できた！」で おわろう。")
    : lv < 4 ? T("れんしゅうした日が <b>") + d + T("日</b>。少しずつ 長くなるよ（7日で 本番のメニュー）。") : T("本番のメニューだよ。")) +
    '<div class="today-flow">' + lines + T(" → 🎉 せいせき はっぴょう</div>");
  sel.innerHTML = GRADES.map((g, i) => `<option value="${i}">${g.key}</option>`).join("");
  sel.dataset.filled = "1";
  const rk = JSON.parse(localStorage.getItem(RANK) || "null");
  sel.value = rk ? rk.idx : gradeIdx;
}
$("#todayStart").addEventListener("click", () => { const g = GRADES[+$("#todayGrade").value]; tipOnce("first-routine", TIP_ROUTINE.t, TIP_ROUTINE.b, () => startRoutine(g)); });
// アバター。"img:名前" は assets/名前.png の絵、それ以外は 顔文字
const AVATARS = ["img:hero_1", "img:hero_2", "img:hero_3", "img:hero_4", "img:hero_5", "img:hero_6", "🧒", "👦", "👧", "🦊", "🐼", "🦉"];
const AVATAR_NAMES = { hero_1: T("けんし"), hero_2: T("まほうつかい"), hero_3: T("ゆみつかい"), hero_4: T("おひめさま"), hero_5: T("けんじゃ"), hero_6: T("ぶとうか") };
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
    sb.innerHTML = T('<option value="off">鳴らさない</option><option value="rotate">毎回かえる（おすすめ）</option>') +
      BGM_LIST.map((b) => '<option value="' + b.f + '">' + b.n + T(" だけ</option>")).join("");
    sb.value = bgmStudy;
    sb.onchange = function () { setBgmStudy(sb.value); renderSound2(); };
  }
  const songs = $("#bgmSongs"), n = $("#sfxNote");
  if (songs) {
    songs.innerHTML = BGM_LIST.concat([BGM_BATTLE]).map(function (b) {
      const main = b.f === bgmMain, now = b.f === bgmName, off = !!bgmOff[b.f], batt = b.f === BGM_BATTLE.f;
      const st = bgmLoaded[b.f] === false ? T(' <small class="ng">読めない</small>') : "";
      return '<div class="song' + (main ? " main" : "") + (off ? " off" : "") + '">' +
        '<button class="song-play" data-f="' + b.f + '">▶</button>' +
        '<span class="song-n">' + b.n + (now ? T(' <small>♪いま</small>') : "") + st + "</span>" +
        (batt ? T('<span class="song-badge fixed">たいせん専用</span>')
          : '<button class="song-use" data-f="' + b.f + '">' + (off ? T("つかわない") : T("つかう")) + "</button>" +
            (main ? T('<span class="song-badge">ホームの曲</span>')
              : '<button class="song-main" data-f="' + b.f + T('">ホームの曲に</button>'))) +
        "</div>";
    }).join("");
  }
  if (n) n.innerHTML = T("メインの曲は 練習中に流れ、パズルでは 1ステージおきに かかります。") +
    T("ほかの曲は ステージごとに 順ぐりで 入れかわります。");
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
  const stg = $("#storyToggle"); if (stg) { stg.checked = storyOn(); stg.onchange = () => { setStoryOn(stg.checked); }; }
  const cr = $("#setCredit"); if (cr) cr.innerHTML = creditHTML();
  const p = profile();
  $("#nameInput").value = p.name;
  $("#avatarPicker").innerHTML = AVATARS.map((a) => `<button data-a="${a}" class="${a === p.avatar ? "sel" : ""}" title="${a.indexOf("img:") === 0 ? (AVATAR_NAMES[a.slice(4)] || "") : ""}">${avatarHTML(a)}</button>`).join("");
  $$("#avatarPicker button").forEach((b) => b.addEventListener("click", () => { $$("#avatarPicker button").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); }));
}
$("#saveProfileBtn").addEventListener("click", () => {
  const name = ($("#nameInput").value || T("そろ太くん")).trim();
  const sel = $("#avatarPicker button.sel");
  saveProfile({ name, avatar: sel ? sel.dataset.a : "img:hero_1" });
  renderProfile();
  $("#saveMsg").textContent = T("保存しました ✓");
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
  document.body.classList.remove("flashmode");
  if (!difficulty(grade, subj)) { alert(T("この級にはこの種目がありません")); return; }
  const cf = subjectCfg(grade, subj);
  session = { subj, grade, cf, N: cf.N, idx: 0, correct: 0, answerBy: answerModeFor(cf), timed: $("#timerToggle").checked, mode: $("#examMode").checked ? "end" : "each", results: [], locking: false, start: performance.now(), cur: null, paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0 };
  // 📖 物語の中の 練習（数問だけ・タイマーなし・1問ずつ ◎×）。問題の作り方・採点は ふつうと 同じ
  if (pendingStory) { session.N = pendingStory.n; session.timed = false; session.mode = "each"; session.story = pendingStory; pendingStory = null; }
  // 🌉 クエスト：ふつうの練習にも「壊れた橋を 直せ！」などの 演出を つける（問題は そのまま。物語オフなら 出さない）
  // けんてい方式（最後に まとめて 採点）は 正解が その場で わからないので、クエストは 出さない
  if (storyOn() && session.mode === "each") session.quest = { key: (session.story && session.story.quest) || questOfToday(), n: session.N, hits: 0 };   // 物語が 場面を 指定していれば それ（例：こわれた橋）
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
  $("#playGrade").textContent = session.story ? "📖 " + session.story.label : T("{v1}／{em}{v2}", { v1: grade.key, em: (SUBJ_EM[subj] || "") + " ", v2: cf.name }) + (session.timed ? T("（検定）") : T("（記録）"));
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  renderBridge();
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
  $("#pauseBtn").textContent = on ? T("▶ さいかい") : T("⏸ 一時停止");
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
  const prog = session.mode === "end" ? T("回答 {v1} / {v2}", { v1: Math.min(session.idx + 1, session.N), v2: session.N }) : T("{v1} / {v2}　正解 {v3}", { v1: Math.min(session.idx + 1, session.N), v2: session.N, v3: session.correct });
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
  return T("<div class=\"section-score\">{v1}：<b>{v2} / {v3}</b>　タイム {v4}</div><div class=\"qlist\">{rows}</div>", { v1: sec.label, v2: sec.correct, v3: sec.N, v4: fmtClock(sec.sec), rows });
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
    if (session.quest && ok) session.quest.hits++;                       // 🌉 橋が 1つ のびる
    let wait = 850;
    if (session.story) wait = storyOnAnswer(ok);                          // 📖 物語の中では 仲間が 反応する
    else if (session.quest) renderBridge(ok ? "" : T("だいじょうぶ。つぎの 石を 取りに いこう。"), ok ? "" : "sad");
    setTimeout(() => { session.locking = false; advance(); }, wait);
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
  msg += T("タイム <b>{v1}</b>　正解 {v2} / {v3}", { v1: fmtClock(el), v2: session.correct, v3: session.N });
  const report = missReportHTML(session.results);   // 正答率と「まちがえ方のクセ」の図解
  let cls = "ok", bestUpdated = false;
  touchStreak(); // streak更新（GOLD連続ボーナスの前に）
  if (completed && (session.weak || session.story)) {
    // にがて克服・物語の中の練習は 問題数がちがうので、自己ベストには入れない（記録とGOLDだけ）
    logStudy(el); logSession(session.subj, session.N, session.correct, el, session.pauseCount, session.results);
    if (session.story) {
      msg += `<br>📖 <b>${session.story.label}</b>`;
      if (session.correct === session.N) msg += T(`　<b class="hl">✨ ぜんぶ せいかい！</b>`);
    } else {
      const K = MISS_KINDS[session.weak] || MISS_KINDS.other;
      msg += T("<br>🎯 <b>{v1}</b> の 克服れんしゅう", { v1: K.n });
      if (session.correct === session.N) msg += T(`　<b class="hl">✨ ぜんぶ せいかい！ このクセ、なおってきたよ</b>`);
    }
  } else if (completed) {
    const r = saveTime(session.grade.key, session.subj, el); bestUpdated = r.improved;
    logStudy(el); logSession(session.subj, session.N, session.correct, el, session.pauseCount, session.results);
    msg += T("<br>⏱ 自己ベスト：{v1}", { v1: fmtClock(bestTime(session.grade.key, session.subj)) });
    if (bestUpdated) msg += T(`　<b class="hl">✨自己ベスト更新！</b>`);
    else if (r.prev != null && el > r.prev) msg += T("　<span class=\"sub\">あと {v1}秒で自己ベスト！</span>", { v1: (el - r.prev).toFixed(1) });
    const ts = session.results.map((x) => x.t).filter((x) => x != null);
    if (ts.length) { const avg = ts.reduce((a, b) => a + b, 0) / ts.length, fast = Math.min(...ts); msg += T("<br>平均回答 <b>{v1}秒</b> ／ 最速 {v2}秒", { v1: avg.toFixed(1), v2: fast.toFixed(1) }); }
    if (session.pauseCount) msg += T("<br><span class=\"sub\">⏸ 一時停止 {v1}回（タイムには含めていません）</span>", { v1: session.pauseCount });
  }
  if (session.timed) {
    const score = session.correct * cf.per, pass = score >= cf.pass;
    msg += T("<br>{v1}（{score} / {v3}点・合格{v4}）", { v1: pass ? "🎉 合格！" : "不合格", score, v3: cf.per * session.N, v4: cf.pass });
    cls = pass ? "ok" : "ng";
    if (pass) { certify(session.grade.key, session.subj); msg += T("<br>🎓 {v1} 認定！ 合格証が もらえるよ", { v1: session.grade.key }); }
  }
  msg += report;
  if (completed && session.quest && storyOn()) { const q = QUESTS[session.quest.key] || QUESTS.bridge; msg += `<div class="quest-done">${q.em || "🌉"} ${q.name}　${q.done}</div>`; }
  if (completed) { // GOLDは学習の成果としてのみ付与
    // 合格ずみの級は「級ごと」に数える（種目を変えて 回数をリセットできないように）
    const below = gradeIdxOf(session.grade) <= myRankIdx();
    const dkey = below ? session.grade.key + "_low" : session.grade.key + "_" + session.subj;
    const { g, lines } = goldForSection({ correct: session.correct, N: session.N, bestUpdated, completed,
      grade: session.grade, subj: session.subj, count: dailyCount(dkey) });
    dailyCount(dkey, true);
    let earned = g; const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; lines.push(T("🔥 {v1} ＋{v2}", { v1: daily.label, v2: daily.amt })); }
    addGold(earned);
    msg += T("<div class=\"gold-earn\"><img class=\"ico-coin\" src=\"assets/coin.png\" alt=\"\" /> <b>＋{earned} GOLD</b><div class=\"gold-lines\">{v2}</div><div class=\"goal\">{v3}</div></div>", { earned, v2: lines.join("・"), v3: nextGoalHint() });
  }
  renderProfile();
  if (completed) { if (session.story) storyResume(session.story); else solomonAfterStudy(); }   // 🐣 練習を やりきった → 物語の つづき／ソロモンの 成長
  // 音だけでなく、画面いっぱいに ねぎらいと祝福を出す
  const acc100 = session.N ? Math.round(session.correct / session.N * 100) : 0;
  if (session.timed) {
    const pass2 = session.correct * cf.per >= cf.pass;
    if (pass2) fxCelebrate(3, "🎓 " + session.grade.key + T(" ごうかく！"), T("おめでとう！ よく がんばったね"));
    else fxCheer(T("あと すこし…"), T("合格は ") + cf.pass + T("点。もう一度 いこう！"));
  } else if (completed) {
    if (bestUpdated) fxCelebrate(3, T("⏱ 自己ベスト こうしん！"), T("いままでで いちばん 速かった！"));
    else if (acc100 === 100) fxCelebrate(3, T("💯 ぜんもん せいかい！"), T("パーフェクト！"));
    else if (acc100 >= 80) fxCelebrate(2, T("よくできました！"), T("正答率 ") + acc100 + "%");
    else fxCelebrate(1, T("おつかれさま！"), T("さいごまで やりきったね"));
  } else {
    fxCheer(T("とちゅうまで やったね"), T("つづきは いつでも できるよ"));
  }
  if (completed) coinSnd(1.0); // GOLD獲得の「チャリーン」はファンファーレの後に
  msg += maybeDropItem(acc100, completed);
  msg += T(`<br><button id="againBtn">もう一度</button> <button id="toKingdomBtn">🧩 パズルへ</button> <button id="homeBtn" class="ghost">級・段選択へ</button>`);
  const passed = session.timed ? (session.correct * cf.per >= cf.pass) : completed;
  const face = passed ? "king_celebrate.png" : "king_wave.png";
  const badge = bestUpdated ? T('<span class="badge-chip best">⏱ 自己ベスト更新！</span>')
    : (session.timed && passed ? T('<span class="badge-chip perfect">🎓 ごうかく！</span>') : "");
  msg = `<div class="result-hero"><img class="rh-face" src="assets/${face}" alt="レオ王" />${badge ? `<span class="rh-badge">${badge}</span>` : ""}</div>` + msg;
  $("#playResult").innerHTML = msg; $("#playResult").className = "result " + cls;
  $("#playProblem").textContent = T("おつかれさま！");
  // 📒 まちがいノートの 類題なら、結果を ノートに 書く（3問 ぜんぶ 正解 → 克服）
  if (session.note) { const r = noteAfterDrill(session.note, session.correct, session.N); if (r === "done") setTimeout(() => fxCelebrate(2, T("📒 克服！"), T("この まちがいは もう だいじょうぶ")), 1200); }
  const subj = session.subj, weak = session.weak, weakN = session.weakN, noteId = session.note; session = null;
  $("#againBtn").onclick = () => (noteId ? startNoteDrill(noteId) : weak ? startWeakSession(weak, weakN) : startSession(subj));
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
  { subj: "anzan", N: 15, timed: true, label: T("暗算 ①（3分）") },
  { rest: 60, next: T("暗算 ②") },
  { subj: "anzan", N: 15, timed: true, label: T("暗算 ②（3分）") },
  { rest: 60, next: T("暗算 ③") },
  { subj: "anzan", N: 15, timed: true, label: T("暗算 ③（3分）") },
  { rest: 120, next: T("かけ算") },
  { subj: "kake", N: 15, timed: false, label: T("かけ算 15問") },
  { rest: 60, next: T("わり算") },
  { subj: "wari", N: 15, timed: false, label: T("わり算 15問") },
  { rest: 60, next: T("みとり算") },
  { subj: "mitori", N: 10, timed: false, label: T("みとり算 10問") },
];
/* 練習した日数（きょうを ふくまない）。はじめの数日は 短いメニューにして「続く」ことを 最優先にする */
function practiceDays() {
  try { const t = today(); return new Set(allSessions().map((e) => e.d).filter((d) => d && d !== t)).size; } catch (e) { return 0; }
}
// 日数 → メニューの段階（0＝はじめての日 … 4＝本番のメニュー）
function routineLevel() { const d = practiceDays(); return d <= 0 ? 0 : d <= 1 ? 1 : d <= 3 ? 2 : d <= 6 ? 3 : 4; }
const ROUTINE_LEVELS = [
  // 0：はじめての日は 3問だけ。「できた！」で 終わる
  [{ subj: "anzan", N: 3, timed: false, label: T("きょうの 3もん") }],
  // 1：2日目
  [{ subj: "anzan", N: 5, timed: false, label: T("あんざん 5もん") }, { rest: 30, next: T("みとり算") }, { subj: "mitori", N: 3, timed: false, label: T("みとり算 3もん") }],
  // 2：3〜4日目
  [{ subj: "anzan", N: 10, timed: true, label: T("あんざん 10もん（3分）") }, { rest: 45, next: T("かけ算") },
   { subj: "kake", N: 5, timed: false, label: T("かけ算 5もん") }, { rest: 30, next: T("わり算") }, { subj: "wari", N: 5, timed: false, label: T("わり算 5もん") },
   { rest: 45, next: T("みとり算") }, { subj: "mitori", N: 5, timed: false, label: T("みとり算 5もん") }],
  // 3：5〜7日目
  [{ subj: "anzan", N: 15, timed: true, label: T("あんざん 15もん（3分）") }, { rest: 60, next: T("かけ算") },
   { subj: "kake", N: 10, timed: false, label: T("かけ算 10もん") }, { rest: 45, next: T("わり算") }, { subj: "wari", N: 10, timed: false, label: T("わり算 10もん") },
   { rest: 60, next: T("みとり算") }, { subj: "mitori", N: 10, timed: false, label: T("みとり算 10もん") }],
];
/* ============================================================ 今日の練習の 自動編成（フェーズB-2）
   子どもに えらばせない。3日目からは、
     🔁 きのうの まちがい直し（直近3日の まちがえた 問題を そのまま・5問まで）
     → 現級の 練習（いままでの メニュー）
     → 🎯 にがて特訓（弱点診断で いちばん 低い 技の 問題 5問）
     → ⚡ フラッシュ暗算 5問（5日目から・その級に あれば）
   ボス戦（たいせん）は 成績発表の ボタンから。 */
// まちがえた 記録（q＝問題の 文字列）から、同じ 問題を もう一度 作る
function problemFromMiss(m, subj) {
  const q = String(m.q || "").trim(); if (!q) return null;
  if (/[×x]/.test(q)) {
    const p = q.split(/\s*[×x]\s*/).map((s) => Number(String(s).replace(/,/g, "")));
    if (p.length !== 2 || !p.every((v) => Number.isFinite(v) && v > 0)) return null;
    return { subj: "kake", p: { display: `${p[0].toLocaleString()} × ${p[1].toLocaleString()}`, compact: q, answer: p[0] * p[1], fa: p[0], fb: p[1] } };
  }
  if (/÷/.test(q)) {
    const p = q.split(/\s*÷\s*/).map((s) => Number(String(s).replace(/,/g, "")));
    if (p.length !== 2 || !p.every((v) => Number.isFinite(v) && v > 0) || p[0] % p[1] !== 0) return null;
    return { subj: "wari", p: { display: `${p[0].toLocaleString()} ÷ ${p[1].toLocaleString()}`, compact: q, answer: p[0] / p[1], dividend: p[0], divisor: p[1], quotient: p[0] / p[1] } };
  }
  const parts = q.match(/[+−-]?\d+/g); if (!parts || parts.length < 2) return null;
  const nums = parts.map((s) => Number(s.replace("−", "-"))); if (nums.some((v) => !Number.isFinite(v))) return null;
  return { subj: subj === "anzan" ? "anzan" : "mitori", p: mitoriProblem(nums) };
}
function retryStep() {
  const from = daysAgo(3), seen = {}, by = {};
  allSessions().filter((e) => e.miss && (e.d || "") >= from && e.src !== "battle").reverse().forEach((e) => {
    e.miss.forEach((m) => { if (!m.q || seen[m.q]) return; seen[m.q] = 1; const r = problemFromMiss(m, e.subj); if (r) (by[r.subj] = by[r.subj] || []).push(r.p); });
  });
  const subj = Object.keys(by).sort((a, b) => by[b].length - by[a].length)[0];
  if (!subj || !SUBJECT[subj]) return null;
  const queue = by[subj].slice(0, 5);
  return { subj, N: queue.length, queue, timed: false, retry: true, label: T("🔁 きのうの まちがい直し {n}問", { n: queue.length }) };
}
function weakStep() {
  let kind = "";
  try { const d = weakDiagnosis(30); kind = (d.rows.find((r) => r.isWeak && r.weak) || {}).weak || ""; } catch (e) { }
  if (!kind) { const w = weakProfile(14)[0]; if (w && ["five", "ten", "kuku", "skip", "minus", "keta"].includes(w.k)) kind = w.k; }
  if (!kind) return null;
  const qs = genWeakSet(kind, 5); if (!qs.length) return null;
  const K = MISS_KINDS[kind] || MISS_KINDS.other;
  return { subj: kind === "kuku" ? "kake" : "mitori", N: qs.length, queue: qs, timed: false, weak: kind, label: T("🎯 にがて特訓：{n} {v}問", { n: K.n, v: qs.length }) };
}
function flashStep(grade) { return difficulty(grade, "flash") ? { flash: true, N: 5, label: T("⚡ フラッシュ暗算 5問") } : null; }
// 同じ日は 同じ 組み立て（ホームの 表示と 実際の 練習が ずれないよう、1分ほど 覚える）
let stepsMemo = null;
function buildSteps(grade) {
  const lv = routineLevel();
  if (stepsMemo && stepsMemo.key === grade.key && stepsMemo.lv === lv && Date.now() - stepsMemo.at < 60000) return stepsMemo.steps;
  const base = lv >= 4 ? ROUTINE_TEMPLATE : ROUTINE_LEVELS[lv];
  let list = base.slice();
  if (lv >= 2) {
    const retry = retryStep(); if (retry) list = [retry, { rest: 20, next: T("きょうの 練習") }].concat(list);
    const weak = weakStep(); if (weak) list = list.concat([{ rest: 30, next: T("にがて特訓") }, weak]);
    if (lv >= 3) { const fl = flashStep(grade); if (fl) list = list.concat([{ rest: 20, next: T("フラッシュ暗算") }, fl]); }
  }
  const kept = list.filter((s) => s.rest != null || s.queue || s.flash || difficulty(grade, s.subj));
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    if (s.rest != null) { const nx = kept[i + 1]; if (out.length === 0 || !nx || nx.rest != null) continue; }
    out.push(s);
  }
  stepsMemo = { key: grade.key, lv, at: Date.now(), steps: out };
  return out;
}
function startRoutine(grade) {
  const steps = buildSteps(grade);
  if (!steps.length) { alert(T("この級では本日の練習を実施できません")); return; }
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
/* ⚡ 本日の練習の 中の フラッシュ暗算：ふつうの フラッシュの 画面を 使い、1セット 終わったら つぎの 段へ（finishFlashSet の 中で つなぐ） */
function startRoutineFlash(step) {
  const grade = routineState.grade;
  startFlash(grade);
  flashExam = { on: false, idx: 0, N: step.N, correct: 0, times: [] };
  routineState.flashStep = { label: step.label };
  const total = routineState.steps.filter((s) => s.rest == null).length, done = routineState.steps.slice(0, routineState.stepIdx).filter((s) => s.rest == null).length;
  $("#playGrade").textContent = T("本日の練習 {v1}/{total}：{v3}", { v1: done + 1, total, v3: step.label });
  $("#flashExamMode").disabled = true; $("#flashCustom").classList.add("hidden");
  flashIdle(true, T("▶ スタート（{N}問）", { N: step.N }));
}
function startQuizSection(step) {
  if (step.flash) return startRoutineFlash(step);
  document.body.classList.remove("flashmode");
  const grade = routineState.grade, cf = subjectCfg(grade, step.subj);
  // 採点は最後にまとめて（mode:end）。暗算は入力式（そろばんを出さない）、かけ/わり/みとりはそろばん
  session = { subj: step.subj, grade, cf, N: step.N, idx: 0, correct: 0, answerBy: answerModeFor(cf), timed: !!step.timed, mode: "end", results: [], locking: false, start: performance.now(), cur: null, routine: true, label: step.label, paused: false, pausedMs: 0, pauseAt: 0, pauseCount: 0 };
  if (step.queue) session.queue = step.queue.slice();   // まちがい直し・にがて特訓は 用意した 問題を 順に 出す
  // まちがい直しは その場で ◎× を 見せる（同じ まちがいを くりかえさない）
  if (step.retry || step.weak) session.mode = "each";
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
  $("#playGrade").textContent = T("本日の練習 {v1}/{total}：{v3}", { v1: done + 1, total, v3: step.label });
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
  document.body.classList.remove("flashmode");
  $("#anzanTip").classList.add("hidden"); // 休憩中は消す
  showView("play");
  $("#playProblemWrap").classList.add("hidden");
  $("#playSorobanWrap").classList.add("hidden");
  $("#playInputWrap").classList.add("hidden");
  $("#playFlashWrap").classList.add("hidden");
  $("#playResult").textContent = ""; $("#playGrade").textContent = T("本日の練習：休憩"); $("#playProgress").textContent = ""; $("#playTimer").textContent = "";
  $("#playRest").classList.remove("hidden");
  const last = routineState.sections[routineState.sections.length - 1];
  $("#restResult").innerHTML = last ? missReportHTML(last.items) + sectionResultHTML(last) : "";
  $("#restNext").textContent = step.next ? T("つぎは：{v1}（自動で始まります）", { v1: step.next }) : "";
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
  const goldLines = [T("練習でためた ＋{sectionsGold}", { sectionsGold }), T("本日の練習 完了 ＋{completeBonus}", { completeBonus }), T("🏁 やりきった ＋{routineBonus}", { routineBonus })];
  let earned = sectionsGold + completeBonus + routineBonus;
  const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; goldLines.push(T("🔥 {v1} ＋{v2}", { v1: daily.label, v2: daily.amt })); }
  addGold(earned);
  renderProfile(); bigFanfareSnd(); coinSnd(1.4);
  solomonAfterStudy();               // 🐣 本日の練習 完了 → ソロモンの 成長を たしかめる
  document.body.classList.remove("flashmode");   // 最後が フラッシュでも 成績発表は ふつうの 画面で
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden"); $("#playFlashWrap").classList.add("hidden");
  $("#playProblem").textContent = T("🎉 本日の練習 完了！");
  $("#playGrade").textContent = T("成績発表（{v1}）", { v1: rs.grade.key }); $("#playTimer").textContent = ""; $("#playProgress").textContent = "";
  const rows = rs.sections.map((s) => `<div class="brow"><span>${s.label}</span><b>${s.correct}/${s.N}　${fmtClock(s.sec)}</b></div>`).join("");
  const last = rs.sections[rs.sections.length - 1];
  const detail = last ? sectionResultHTML(last) : "";
  $("#playResult").className = "result ok";
  const goldBlock = T("<div class=\"gold-earn\"><img class=\"ico-coin\" src=\"assets/coin.png\" alt=\"\" /> <b>＋{earned} GOLD</b><div class=\"gold-lines\">{v2}</div><div class=\"goal\">{v3}</div></div>", { earned, v2: goldLines.join("・"), v3: nextGoalHint() });
  const routineBadge = acc >= 90 ? T('<span class="badge-chip perfect">★ パーフェクト！</span>') : T('<span class="badge-chip">🏁 コンプリート！</span>');
  fxCelebrate(3, T("🏁 本日の練習 かんりょう！"), acc >= 90 ? T("正答率 ") + acc + T("%　パーフェクト！") : T("毎日 つづけているのが すごい"));
  const routineHero = T("<div class=\"result-hero\"><img class=\"rh-face\" src=\"assets/king_celebrate.png\" alt=\"レオ王\" /><span class=\"rh-badge\">{routineBadge}</span></div>", { routineBadge });
  const allItems = rs.sections.reduce((a, s) => a.concat(s.items || []), []);   // 本日の練習ぜんぶ分のクセ
  $("#playResult").innerHTML = T("{routineHero}<div class=\"marks\">正答率 {acc}%（{totalCorrect}/{totalN}）</div>{rows}<div class=\"sub\">合計タイム {v6}</div>{v7}{goldBlock}{v9}{detail}<br><button id=\"toBossBtn\">⚔️ ボス戦へ（たいせん）</button> <button id=\"toKingdomBtn2\" class=\"ghost\">🧩 パズルへ</button> <button id=\"toRecordsBtn\" class=\"ghost\">📊 グラフを見る</button> <button id=\"routineHomeBtn\" class=\"ghost\">本日の練習へ</button>", { routineHero, acc, totalCorrect, totalN, rows, v6: fmtClock(totalTime), v7: missReportHTML(allItems), goldBlock, v9: maybeDropItem(acc, true), detail });
  $("#toBossBtn").onclick = () => { showView("battle"); setActiveNav(document.querySelector('.nav[data-view="asobu"]')); };
  $("#toKingdomBtn2").onclick = () => { showView("puzzle"); setActiveNav(document.querySelector('.nav[data-view="asobu"]')); };
  $("#toRecordsBtn").onclick = () => { showView("records"); setActiveNav(document.querySelector('.nav[data-view="records"]')); };
  $("#routineHomeBtn").onclick = () => { showView("today"); setActiveNav(document.querySelector('.nav[data-view="today"]')); };
  tipOnce("first-result", TIP_RESULT.t, TIP_RESULT.b);
}

/* ---------- 解き方（みとり算） ---------- */
const PLACE = [T("一の位"), T("十の位"), T("百の位"), T("千の位"), T("万の位"), T("十万の位"), T("百万の位")];
const placeName = (p) => PLACE[p] || T("{v1}桁目", { v1: p + 1 });
function addToPlace(board, place, d, out) {
  if (d === 0) return; const v = board[place] || 0;
  if (v + d <= 9) { if (d <= 4 && (v % 5) + d <= 4) out.push(T("{v1}に一玉を{d}個入れる", { v1: placeName(place), d })); else if (d === 5) out.push(T("{v1}に五玉を入れる", { v1: placeName(place) })); else if (d < 5) out.push(T("{v1}で五玉を入れて{v2}を払う（5の友：{d}は{v4}）", { v1: placeName(place), v2: 5 - d, d, v4: 5 - d })); else out.push(T("{v1}に五玉と一玉で{d}を入れる", { v1: placeName(place), d })); board[place] = v + d; }
  else { const comp = 10 - d; out.push(T("<span class=\"hint\">くり上がり</span>：{v1}に1を入れて、{v2}から{comp}を払う（10の友：{d}は{comp_}）", { v1: placeName(place + 1), v2: placeName(place), comp, d, comp_: comp })); board[place] = v - comp; addToPlace(board, place + 1, 1, out); }
}
function subToPlace(board, place, d, out) {
  if (d === 0) return; const v = board[place] || 0;
  if (v - d >= 0) { if (d <= 4 && v % 5 >= d) out.push(T("{v1}の一玉を{d}個払う", { v1: placeName(place), d })); else if (d === 5) out.push(T("{v1}の五玉を払う", { v1: placeName(place) })); else if (d < 5) out.push(T("{v1}で五玉を払って{v2}を入れる（5の友：{d}は{v4}）", { v1: placeName(place), v2: 5 - d, d, v4: 5 - d })); else out.push(T("{v1}から五玉と一玉で{d}を払う", { v1: placeName(place), d })); board[place] = v - d; }
  else { const comp = 10 - d; out.push(T("<span class=\"hint\">くり下がり</span>：{v1}から1を払って、{v2}に{comp}を入れる（10の友：{d}は{comp_}）", { v1: placeName(place + 1), v2: placeName(place), comp, d, comp_: comp })); board[place] = v + comp; subToPlace(board, place + 1, 1, out); }
}
function boardValue(board) { let n = 0; for (let p = board.length - 1; p >= 0; p--) n = n * 10 + (board[p] || 0); return n; }
function solveSteps(nums) {
  const board = new Array(14).fill(0), terms = [];
  nums.forEach((v, i) => { const abs = Math.abs(v), digits = String(abs).split("").reverse().map(Number), out = []; for (let p = 0; p < digits.length; p++) v < 0 ? subToPlace(board, p, digits[p], out) : addToPlace(board, p, digits[p], out); terms.push({ label: i === 0 ? T("{v1} を置く", { v1: abs.toLocaleString() }) : `${v < 0 ? "ひく" : "たす"} ${abs.toLocaleString()}`, moves: out, running: boardValue(board) }); });
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
  return T(`<div class="soro-legend">🟠 入っている玉　🟡 この手で動いた位（ここが違えばそこで間違い）</div>`) + body;
}
/* ============================================================ まちがえ方のクセを見つける
   1問ごとの「出した数・答えた数・正解」から、そろばんのどの技でつまずいたのかを判定する。
   言い方は解き方の説明（solveSteps）と同じ「5の友」「10の友」でそろえる。 */
const MISS_KINDS = {
  five: { n: T("五玉（5の友）"), em: "🖐", tip: T("5の友は 1と4 ／ 2と3。<b>4をたす</b>ときは 一玉が たりないので〈<b>五玉を入れて 1を払う</b>〉。"), ex: [3, 4] },
  ten: { n: T("くり上がり・くり下がり（10の友）"), em: "🔟", tip: T("10の友は 1と9 ／ 2と8 ／ 3と7 ／ 4と6。<b>となりの位に 1を入れて</b>、この位から 友だちの数を 払う。"), ex: [8, 5] },
  keta: { n: T("位（くらい）の ずれ"), em: "📏", tip: T("答えが 10倍 や 10分の1 になっているよ。<b>一の位を どこに 置いたか</b>を たしかめよう。"), ex: null },
  skip: { n: T("数を 1つ とばした"), em: "👀", tip: T("読む数を 1つ 飛ばしたみたい。<b>ゆびで おさえながら</b> 上から順に 読もう。"), ex: null },
  minus: { n: T("たす・ひく の とりちがえ"), em: "➕", tip: T("たすところを ひいてしまったみたい。<b>＋と − を 声に出して</b> 読もう。"), ex: null },
  kuku: { n: T("九九の おぼえまちがい"), em: "✖", tip: T("答えが 九九ひとつぶん ずれているよ。その段を もう一度 声に出そう。"), ex: null },
  other: { n: T("そのほか"), em: "🤔", tip: T("もう一度 ゆっくり 計算してみよう。どこまで 合っていたかを たしかめると 見つかるよ。"), ex: null },
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
  if (Math.abs(diff) % 10 === 0 && needsTech(nums, T("10の友"))) return "ten";
  if (nums) {
    for (const v of nums) if (v !== 0 && a - u === v) return "skip";            // 1つ とばした
    for (const v of nums) if (v !== 0 && a - u === 2 * v) return "minus";       // たすところを ひいた
  }
  if (r.subj === "kake" || r.subj === "wari") return Math.abs(diff) < a * 0.5 ? "kuku" : "other";
  if (Math.abs(diff) <= 6 && needsTech(nums, T("5の友"))) return "five";
  if (Math.abs(diff) % 10 === 0) return "ten";
  return "other";
}
// クセの図解：その子が実際にまちがえた問題の中から、つまずいた1手を取り出して そろばんの絵で見せる
function techFigHTML(kind, nums) {
  const K = MISS_KINDS[kind], needle = kind === "five" ? T("5の友") : T("10の友");
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
    const comp = 5 - d, right = T("{pn}で 五玉を 入れて {comp} を 払う（5の友：{d}は{comp_}）", { pn, comp, d, comp_: comp });
    out.push({ kind: "five", delta: -5 * u, wrong: T("{pn}で <b>五玉を 入れないで</b>、{comp} を 払ってしまった", { pn, comp }), right });
    out.push({ kind: "five", delta: comp * u, wrong: T("{pn}で 五玉は 入れたけど、<b>{comp} を 払いわすれた</b>", { pn, comp }), right });
    // 友だちの数をまちがえる（4の友は1なのに2を払う、など）
    for (let c = 1; c <= 4; c++) if (c !== comp) out.push({ kind: "five", rank: 2.5, delta: (comp - c) * u, wrong: T("<b>5の友を まちがえた</b>：{d} の友は {comp} なのに、{pn}で {c} を 払ってしまった", { d, comp, pn, c }), right });
  } else if (s.tech === "five" && s.op === "-") {
    const comp = 5 - d, right = T("{pn}で 五玉を 払って {comp} を 入れる（5の友：{d}は{comp_}）", { pn, comp, d, comp_: comp });
    out.push({ kind: "five", delta: 5 * u, wrong: T("{pn}で <b>五玉を 払わないで</b>、{comp} を 入れてしまった", { pn, comp }), right });
    out.push({ kind: "five", delta: -comp * u, wrong: T("{pn}で 五玉は 払ったけど、<b>{comp} を 入れわすれた</b>", { pn, comp }), right });
    for (let c = 1; c <= 4; c++) if (c !== comp) out.push({ kind: "five", rank: 2.5, delta: (c - comp) * u, wrong: T("<b>5の友を まちがえた</b>：{d} の友は {comp} なのに、{pn}に {c} を 入れてしまった", { d, comp, pn, c }), right });
  } else if (s.tech === "carry" && s.op === "+") {
    const comp = 10 - d, nx = placeName(s.place + 1), right = T("{nx}に 1を 入れて、{pn}から {comp} を 払う（10の友：{d}は{comp_}）", { nx, pn, comp, d, comp_: comp });
    out.push({ kind: "ten", delta: -10 * u, wrong: T("<b>となりの {nx}に 1を 入れわすれた</b>（くり上がり忘れ）", { nx }), right });
    out.push({ kind: "ten", delta: comp * u, wrong: T("となりに 1は 入れたけど、<b>{pn}の {comp} を 払いわすれた</b>", { pn, comp }), right });
    for (let c = 1; c <= 9; c++) if (c !== comp) out.push({ kind: "ten", rank: 2.5, delta: (comp - c) * u, wrong: T("<b>10の友を まちがえた</b>：{d} の友は {comp} なのに、{pn}で {c} を 払ってしまった", { d, comp, pn, c }), right });
  } else if (s.tech === "carry" && s.op === "-") {
    const comp = 10 - d, nx = placeName(s.place + 1), right = T("{nx}から 1を 払って、{pn}に {comp} を 入れる（10の友：{d}は{comp_}）", { nx, pn, comp, d, comp_: comp });
    out.push({ kind: "ten", delta: 10 * u, wrong: T("<b>となりの {nx}から 1を 借りわすれた</b>（くり下がり忘れ）", { nx }), right });
    out.push({ kind: "ten", delta: -comp * u, wrong: T("1は 借りたけど、<b>{pn}に {comp} を 入れわすれた</b>", { pn, comp }), right });
    for (let c = 1; c <= 9; c++) if (c !== comp) out.push({ kind: "ten", rank: 2.5, delta: (c - comp) * u, wrong: T("<b>10の友を まちがえた</b>：{d} の友は {comp} なのに、{pn}に {c} を 入れてしまった", { d, comp, pn, c }), right });
  } else {
    out.push({ kind: "other", delta: -d * u, wrong: T("{pn}の {d} を <b>動かしわすれた</b>", { pn, d }), right: T("{pn}に {d} を {v3}", { pn, d, v3: s.op === "+" ? "入れる" : "払う" }) });
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
    if (-t.v === need) cands.push({ t, s: null, kind: "skip", rank: 2, wrong: T("この <b>{v1}</b> を まるごと たしわすれた（読みとばし）", { v1: Math.abs(t.v) }), right: T("{v1} を {v2}", { v1: Math.abs(t.v), v2: t.v < 0 ? "ひく" : "たす" }) });
    // 1つめは「置く」なので、たす・ひくの取りちがえは2つめ以降だけ。盤面がマイナスになる動きも除く
    if (t.i > 0 && -2 * t.v === need && t.before - t.v >= 0) cands.push({ t, s: null, kind: "minus", rank: 2, wrong: T("<b>{v1}</b> しまった", { v1: t.v < 0 ? "ひくところを たして" : "たすところを ひいて" }), right: T("{v1} を {v2}", { v1: Math.abs(t.v), v2: t.v < 0 ? "ひく" : "たす" }) });
    if (9 * t.v === need) cands.push({ t, s: null, kind: "keta", rank: 2, wrong: T("<b>{v1} を ひとつ上の位に 置いてしまった</b>（位のずれ）", { v1: Math.abs(t.v) }), right: T("{v1} の 一の位を 定位点に そろえて 置く", { v1: Math.abs(t.v) }) });
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
  return T(`<div class="tb"><div class="tb-side ok"><div class="tb-h">◎ 正しい 玉の動き</div><div class="tb-row">`) +
    `<div class="tb-1"><div class="tb-cap">${before.toLocaleString()}</div>${sorobanSVG(before, cols)}</div><span class="tb-ar">▶</span>${fig(right, before)}</div></div>` +
    T(`<div class="tb-side ng"><div class="tb-h">✗ きみの 玉の動き（たぶん）</div><div class="tb-row">`) +
    `<div class="tb-1"><div class="tb-cap">${before.toLocaleString()}</div>${sorobanSVG(before, cols)}</div><span class="tb-ar">▶</span>${fig(wrong, before)}</div></div></div>`;
}
function explainOneHTML(r, no) {
  const K = MISS_KINDS[r.k || missKind(r)] || MISS_KINDS.other;
  const head = T("<div class=\"ex-head\"><span class=\"ex-no\">{no}問目</span><span class=\"ex-q\">{v2}</span>", { no, v2: r.compact }) +
    T("<span class=\"ex-a\">きみの答え <b class=\"ng\">{v1}</b> ／ 正解 <b class=\"ok\">{v2}</b></span></div>", { v1: r.user, v2: r.ans });
  if (!r.nums) return T("<div class=\"ex-card\">{head}<div class=\"ex-diag\">{v2} {v3}：{v4}</div></div>", { head, v2: K.em, v3: K.n, v4: K.tip });
  const dg = diagnose(r.nums, Number(r.user));
  let body = "";
  if (dg) {
    body += T("<div class=\"ex-diag\">🔍 <b>{v1}つめの「{v2}{v3}」</b> で つまずいたよ<br>", { v1: dg.termNo, v2: dg.term < 0 ? "−" : "+", v3: Math.abs(dg.term) }) +
      `<span class="ex-wrong">✗ ${dg.wrongText}</span><br><span class="ex-right">◎ ${dg.rightText}</span></div>` +
      twoBoards(dg.before, dg.right, dg.wrong) +
      `<div class="ex-fix">💡 ${(MISS_KINDS[dg.kind] || MISS_KINDS.other).tip}</div>`;
  } else {
    body += T(`<div class="ex-diag">🔍 どの1手で ずれたかは 見つけられなかったよ。下の 手順を 上から 声に出して たしかめよう。<br>`) +
      T("<span class=\"ex-wrong\">答えの ちがい：{v1}{v2}</span></div>", { v1: Number(r.user) - Number(r.ans) > 0 ? "＋" : "−", v2: Math.abs(Number(r.user) - Number(r.ans)) });
  }
  body += T("<div class=\"ex-all\"><div class=\"ex-all-h\">この問題の 玉の動き（ぜんぶ）</div><div class=\"steps\">{v1}</div></div>", { v1: mitoriStepsHTML(r.nums) });
  return `<div class="ex-card">${head}${body}</div>`;
}
/* まとめの見立て（アセスメント）と、次にやることの提案 */
function assessmentHTML(items) {
  const all = items || [], wrong = all.filter((x) => !x.ok), right = all.filter((x) => x.ok);
  const avg = (a) => { const t = a.map((x) => x.t).filter((x) => x != null); return t.length ? t.reduce((p, c) => p + c, 0) / t.length : null; };
  const wt = avg(wrong), rt = avg(right);
  const tally = {}; wrong.forEach((r) => { const k = r.k || missKind(r); tally[k] = (tally[k] || 0) + 1; });
  const order = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
  const rows = order.map((k) => { const K = MISS_KINDS[k] || MISS_KINDS.other; return T("<li>{v1} <b>{v2}</b> … {v3}回</li>", { v1: K.em, v2: K.n, v3: tally[k] }); }).join("");
  const tips = [];
  const top = order[0];
  if (top && top !== "other") tips.push(T("いちばん多いのは <b>{v1}</b>。下の 🎯ボタンで、この技だけの問題を 5問 やろう。", { v1: (MISS_KINDS[top] || MISS_KINDS.other).n }));
  if (wt != null && rt != null) {
    if (wt > rt * 1.6) tips.push(T("まちがえた問題は 正解した問題より <b>{v1}倍 時間が かかっている</b>。手が止まる＝技を 思い出せていないサイン。あわてず、口に出して 玉を動かそう。", { v1: (wt / rt).toFixed(1) }));
    else if (wt < rt * 0.7) tips.push(T(`まちがえた問題の方が <b>速い</b>。あわてて 手が先に 動いているかも。1つ 息を ついてから 始めよう。`));
  }
  const one = wrong.filter((r) => { const d = diagnose(r.nums, Number(r.user)); return d && d.termNo === 1; }).length;
  if (one >= 2) tips.push(T("さいしょの 数で つまずくことが {one}回。<b>始める前に 0（ご破算）</b>に なっているか たしかめよう。", { one }));
  if (!tips.length) tips.push(T(`まちがえ方が バラバラだよ。まずは ゆっくり、1手ずつ 声に出して やってみよう。`));
  return T(`<div class="as-box"><div class="as-h">📋 きょうの 見立て</div>`) +
    `<ul class="as-list">${rows}</ul>` +
    T("<div class=\"as-time\">1問の 平均：正解 {v1} ／ まちがい {v2}</div>", { v1: rt != null ? rt.toFixed(1) + "秒" : "—", v2: wt != null ? wt.toFixed(1) + "秒" : "—" }) +
    `<div class="as-h2">つぎに やること</div><ol class="as-tips">${tips.map((t) => `<li>${t}</li>`).join("")}</ol></div>`;
}
/* 1セット終わったときに出す「正答率＋クセの図解」 */
function missReportHTML(items) {
  const list = (items || []).filter((x) => x && !x.ok);
  const N = (items || []).length, ok = N - list.length;
  const acc = N ? Math.round(ok / N * 100) : 0;
  const head = T("<div class=\"mr-acc\">正答率 <b>{acc}%</b>　<span class=\"sub\">({ok} / {N})</span></div>", { acc, ok, N });
  if (!list.length) return T("<div class=\"miss-report all-ok\">{head}<div class=\"mr-top\">🎉 <b>全問せいかい！</b> まちがえた クセは ありません。</div></div>", { head });
  const tally = {};
  list.forEach((r) => { const k = r.k || missKind(r); (tally[k] = tally[k] || []).push(r); });
  const order = Object.keys(tally).sort((a, b) => tally[b].length - tally[a].length);
  const top = order[0], K = MISS_KINDS[top] || MISS_KINDS.other, sample = tally[top][0];
  const others = order.slice(1).map((k) => T("{v1} {v2}回", { v1: (MISS_KINDS[k] || MISS_KINDS.other).n, v2: tally[k].length })).join("　");
  // まちがえた問題は「全問」ていねいに解説する（1問ずつ、正しい動きと きみの動きを並べて）
  const details = list.map((r, i) => explainOneHTML(r, r.no || (i + 1))).join("");
  return `<div class="miss-report">${head}` +
    T(`<div class="mr-h">🔍 きみの まちがえ方の クセ</div>`) +
    T("<div class=\"mr-top\">{v1} <b>{v2}</b> で <b>{v3}回</b> まちがえたよ</div>", { v1: K.em, v2: K.n, v3: tally[top].length }) +
    `<div class="mr-tip">${K.tip}</div>` +
    techFigHTML(top, sample.nums) +
    (others ? T("<div class=\"mr-others\">ほかに：{others}</div>", { others }) : "") +
    assessmentHTML(items) +
    T("<button type=\"button\" class=\"mr-drill\" data-k=\"{top}\">🎯 この クセの もんだいを 5問 やる</button>", { top }) +
    T("<div class=\"ex-h\">📖 まちがえた {v1}問の 解説（ぜんぶ）</div>{details}", { v1: list.length, details }) +
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
    if (kind === "five" && (!needsTech(nums, T("5の友")) || needsTech(nums, T("10の友")))) continue;
    if (kind === "ten" && !needsTech(nums, T("10の友"))) continue;
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
  if (!qs.length) { alert(T("この にがての問題を うまく作れませんでした")); return; }
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
  $("#playGrade").textContent = T("🎯 にがて克服：{v1}", { v1: K.n });
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
  b.textContent = box.classList.contains("hidden") ? T("この問題の 解き方を ぜんぶ見る") : T("解き方を とじる");
});
function kakeStepsHTML(a, b, ans) {
  const bs = String(b).split("").reverse();
  const moves = [];
  bs.forEach((ch, i) => {
    const dig = +ch; if (dig === 0) return;
    const pp = a * dig * Math.pow(10, i);
    moves.push(`${a.toLocaleString()} × ${dig}${i ? "（" + "0".repeat(i) + "をつける）" : ""} = ${pp.toLocaleString()}`);
  });
  return T(`<div class="term"><div class="term-head">部分積をたして計算</div>`) + moves.map((m) => `<div class="move">${m}</div>`).join("") + `<div class="move run">→ ${ans.toLocaleString()}</div></div>`;
}
function wariStepsHTML(dividend, divisor, q) {
  return T(`<div class="term"><div class="term-head">わり算の考え方</div>`) +
    T("<div class=\"move\">{v1} ÷ {v2} を、上の位から順に計算します。</div>", { v1: dividend.toLocaleString(), v2: divisor.toLocaleString() }) +
    T("<div class=\"move\">たしかめ：答え × わる数 ＝ {v1} × {v2} = {v3}</div>", { v1: q.toLocaleString(), v2: divisor.toLocaleString(), v3: (q * divisor).toLocaleString() }) +
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
/* ---- じぶんで きめる：何桁・何口・1個の秒・問数。null なら 級の設定どおり ---- */
let flashCustom = null;
const flashPaceNow = () => flashCustom ? flashCustom.pace * 1000 : flashPaceMs(flashGrade);
/* むずかしさの 点数＝けた×10 ＋ 口×0.8 ＋ 速さ（1秒に 何個）×3。
   級の表と くらべて いちばん近い級を「だいたい ○級」と出す。まったく同じ設定なら「＝○級」 */
const flashScore = (digits, terms, pace) => digits * 10 + terms * 0.8 + 3 / pace;
function flashLevelOf(digits, terms, pace) {
  const rows = GRADES.map((g) => { const s = difficulty(g, "flash"); return { g, s, p: flashPaceMs(g) / 1000 }; }).filter((r) => r.s);
  const same = rows.filter((r) => r.s.digits === digits && r.s.terms === terms && Math.abs(r.p - pace) < 0.06)
    .sort((a, b) => Math.abs(a.p - pace) - Math.abs(b.p - pace));
  if (same.length) return { g: same[0].g, exact: true };
  const sc = flashScore(digits, terms, pace);
  // 10級より やさしいときだけ 11〜20級（練習級）で くらべる。それ以外は 10級〜十段で
  const std = rows.filter((r) => r.g.band === "dan" || r.g.kyu <= 10);
  const low = rows.filter((r) => r.g.band === "kyu" && r.g.kyu > 10);
  const g10 = GRADES.find((g) => g.key === "10級"), f10 = g10 && difficulty(g10, "flash");
  const s10 = f10 ? flashScore(f10.digits, f10.terms, flashPaceMs(g10) / 1000) : 16;
  const cands = sc < s10 ? low : std;
  // 上の級ほど 点数が 大きくなるよう ならす（表の ばらつきで 順番が 逆にならないように）
  let run = -1; const list = cands.map((r) => { run = Math.max(run + 0.01, flashScore(r.s.digits, r.s.terms, r.p)); return { g: r.g, v: run }; });
  let best = list[0]; for (const it of list) if (Math.abs(it.v - sc) < Math.abs(best.v - sc)) best = it;
  return { g: best.g, exact: false };
}
function fcFill() {   // セレクトの 中身（1回だけ）
  const opt = (sel, vals, fmt) => { const el = $(sel); if (el.options.length) return; el.innerHTML = vals.map((v) => `<option value="${v}">${fmt ? fmt(v) : v}</option>`).join(""); };
  opt("#fcDigits", [1, 2, 3, 4]);
  opt("#fcTerms", Array.from({ length: 19 }, (_, i) => i + 2));
  opt("#fcPace", [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.5, 2, 3], (v) => v.toFixed(v < 1 && v * 100 % 10 ? 2 : 1));
  opt("#fcN", [5, 10, 20]);
}
const fcRead = () => ({ digits: +$("#fcDigits").value, terms: +$("#fcTerms").value, pace: +$("#fcPace").value, N: +$("#fcN").value });
function fcShowLevel() {
  const c = fcRead(); const lv = flashLevelOf(c.digits, c.terms, c.pace);
  const spec = difficulty(lv.g, "flash");
  $("#fcLevel").innerHTML = (lv.exact ? T("＝ <b>{v1}</b> と 同じ設定", { v1: lv.g.key }) : T("だいたい <b>{v1}</b> 相当", { v1: lv.g.key })) +
    T("<span class=\"sub\">（{v1}は {v2}けた {v3}口・1個 {v4}秒）</span>", { v1: lv.g.key, v2: spec.digits, v3: spec.terms, v4: (flashPaceMs(lv.g) / 1000).toFixed(2) });
  return lv;
}
// 級の設定を セレクトに 入れる（級を かえたとき）
function fcSync(spec, paceMs) {
  fcFill();
  $("#fcDigits").value = Math.min(4, spec.digits); $("#fcTerms").value = Math.min(20, Math.max(2, spec.terms));
  // 級の速さが 選択肢に 無ければ 足す（1.05秒など）。丸めると となりの級に なってしまうため
  const sec = +(paceMs / 1000).toFixed(2), sel = $("#fcPace");
  if (![...sel.options].some((o) => Math.abs(+o.value - sec) < 0.005)) {
    const o = document.createElement("option"); o.value = sec; o.textContent = sec.toFixed(2);
    const after = [...sel.options].find((x) => +x.value > sec); sel.insertBefore(o, after || null);
  }
  sel.value = sec;
  $("#fcN").value = FLASH_SET;
  fcShowLevel();
}
["#fcDigits", "#fcTerms", "#fcPace", "#fcN"].forEach((s) => $(s).addEventListener("change", fcShowLevel));
$("#fcStart").addEventListener("click", () => {
  if (flashBusy) return;
  const c = fcRead(); const lv = flashLevelOf(c.digits, c.terms, c.pace);
  flashCustom = { ...c, eq: lv.g, exact: lv.exact };
  flashSpec = { digits: c.digits, terms: c.terms };
  $("#flashExamMode").checked = false; $("#flashExamMode").disabled = true;   // じぶんで きめた練習は 検定に ならない
  $("#fcReset").classList.remove("hidden");
  $("#flashInfo").textContent = T("⚙ じぶんで きめた：{v1}けた {v2}口 / 1個 {v3}秒ずつ（{v4}{v5}{v6}）", { v1: c.digits, v2: c.terms, v3: c.pace, v4: lv.exact ? "＝" : "だいたい ", v5: lv.g.key, v6: lv.exact ? " と同じ" : " 相当" });
  flashExam = { on: false, idx: 0, N: c.N, correct: 0, times: [] };
  $("#flashCustom").open = false;
  runFlash();
});
$("#fcReset").addEventListener("click", () => { if (!flashBusy) startFlash(flashGrade); });
function startFlash(grade) {
  flashSpec = difficulty(grade, "flash"); flashGrade = grade; session = null;
  flashCustom = null; $("#flashExamMode").disabled = false; $("#fcReset").classList.add("hidden"); $("#flashCustom").open = false;
  fcSync(flashSpec, flashPaceMs(grade));
  hidePauseUI();
  showView("play");
  // フラッシュ暗算は BGM なし。数字の音と BGM が 同じ音の道（AudioContext）を 通るので、
  // まざって 音が 乱れる。画面を 出たら（bgmArea が かわるので）また 鳴る
  bgmStop(); bgmArea = "flash";
  $("#playRest").classList.add("hidden");
  // フラッシュ暗算は 数字を #flashDisplay に出すので、上の問題の場所は 使わない（すきまが空くだけ）
  $("#playProblemWrap").classList.add("hidden");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden"); $("#playFlashWrap").classList.remove("hidden");
  $("#anzanTip").classList.remove("hidden"); // フラッシュ暗算でもコツを出す（ボタンより下に置いてある）
  $("#stepsRow").classList.add("hidden"); $("#steps").classList.add("hidden");
  $("#playGrade").textContent = T("{v1}／フラッシュ暗算", { v1: grade.key }); $("#playTimer").textContent = ""; $("#playProgress").textContent = ""; $("#playProblem").textContent = "";
  $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashInfo").textContent = T("{v1}：{v2}桁 {v3}口 / 1個 {v4}秒ずつ", { v1: grade.key, v2: flashSpec.digits, v3: flashSpec.terms, v4: (flashPaceMs(grade) / 1000).toFixed(1) });
  $("#flashMeasure").textContent = ""; $("#flashSignal").classList.add("hidden"); $("#flashDots").innerHTML = "";
  // 数字ではなく 言葉を出すときは 小さめの字にする（大きいままだと 画面からはみ出す）
  flashIdle(true, T("▶ スタート")); $("#flashForm").classList.add("hidden");
  document.body.classList.add("flashmode");   // スマホで 画面を 詰める（そろばんの帯の すきま・ネコの説明を しまう）
  const ex = $("#flashExamMode").checked;
  flashExam = { on: ex, idx: 0, N: ex ? 20 : FLASH_SET, correct: 0, times: [] };
}
/* まん中の 大きな 表示が そのまま スタートボタン（待っているときだけ 押せる）。
   左上に 小さな ボタンを 置くと、スマホで スクロールして もどる間に 数字が 出おわってしまうため */
function flashIdle(on, text) {
  const d = $("#flashDisplay");
  if (on) { d.textContent = text || T("▶ スタート"); d.className = "flash-display msg btn"; }
  else d.classList.remove("btn");
}
function flashStartClick() {
  if (flashBusy || !flashSpec || !$("#flashDisplay").classList.contains("btn")) return;
  const ex = !flashCustom && $("#flashExamMode").checked;
  if (ex !== flashExam.on || flashExam.idx >= flashExam.N) flashExam = { on: ex, idx: 0, N: ex ? 20 : (flashCustom ? flashCustom.N : FLASH_SET), correct: 0, times: [] };
  runFlash();
}
$("#flashDisplay").addEventListener("click", flashStartClick);
$("#flashDisplay").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flashStartClick(); } });
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
  flashIdle(false); $("#flashForm").classList.add("hidden"); $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashProgress").textContent = T("{v1} {v2} / {v3}　正解 {v4}", { v1: flashExam.on ? "検定" : "れんしゅう", v2: Math.min(flashExam.idx + 1, flashExam.N), v3: flashExam.N, v4: flashExam.correct });

  const ctx = ensureAudio();
  try { if (ctx.state !== "running") await ctx.resume(); } catch {}

  const p = genFlashNums(flashSpec); flashAnswer = p.answer;
  const nums = p.nums, N = nums.length;
  const disp = $("#flashDisplay");
  disp.className = "flash-display"; // 前回の○×の色をリセット
  $("#flashDots").innerHTML = Array.from({ length: N }, () => `<span class="dot"></span>`).join("");
  const dots = $("#flashDots").querySelectorAll(".dot");

  // すべての時刻をこの1点から計算（＝ドリフトしない）
  const slot = flashPaceNow() / 1000; // 秒（じぶんで きめた速さが あれば それ）
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
  if (myRun !== flashRun || !flashSpec) { flashBusy = false; if (flashSpec) flashIdle(true, T("▶ もう一回")); return; }   // 途中で 画面を離れた
  $("#flashDots").innerHTML = ""; sigBox.classList.add("hidden");

  // 実測の間隔を別欄に表示（「何桁何口」の欄は消さない）
  if (onsets.length >= 2) {
    const g = onsets.slice(1).map((t, i) => t - onsets[i]);
    const mn = Math.min(...g), mx = Math.max(...g), avg = g.reduce((a, b) => a + b, 0) / g.length;
    $("#flashMeasure").textContent = T("実測間隔：平均{v1}秒（最短{v2}〜最長{v3}秒）／ build {BUILD}", { v1: (avg / 1000).toFixed(2), v2: (mn / 1000).toFixed(2), v3: (mx / 1000).toFixed(2), BUILD });
  }
  $("#flashForm").classList.remove("hidden"); $("#flashInput").value = ""; $("#flashInput").focus();
  flashAskAt = performance.now();   // ここから「考えている時間」
  flashBusy = false;
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
    res.innerHTML = (ok ? T("正解！") : T("おしい（答え: {v1}）", { v1: flashAnswer.toLocaleString() })) +
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
  // じぶんで きめた練習は 級の自己ベストに 混ぜない（設定が ちがうので くらべられない）
  const r = flashCustom ? { improved: false, prev: null }
    : okRate >= 0.7 ? saveTime(flashGrade.key, "flash", avg)
    : { improved: false, prev: bestTime(flashGrade.key, "flash") };
  const pass = flashExam.on && correct * 10 >= 140;
  // GOLD の 級の倍率は、じぶんで きめた練習なら「相当する級」で 計算する
  const gradeFor = flashCustom ? flashCustom.eq : flashGrade;
  let msg = "";
  if (flashExam.on) {
    msg += T("検定結果：{correct}/{N} 正解　<b>{v3}点 / 200点</b><br>{v4}", { correct, N, v3: correct * 10, v4: pass ? "🎉 合格！" : "不合格（140点以上で合格）" });
    if (pass) { certify(flashGrade.key, "flash"); msg += T("<br>🎓 {v1} 認定！ 合格証が もらえるよ", { v1: flashGrade.key }); }
  } else if (flashCustom) {
    msg += T("⚙ {v1}けた {v2}口・1個 {v3}秒（{v4}{v5}{v6}）{N}問 おわり！", { v1: flashCustom.digits, v2: flashCustom.terms, v3: flashCustom.pace, v4: flashCustom.exact ? "＝" : "だいたい ", v5: gradeFor.key, v6: flashCustom.exact ? "" : " 相当", N });
  } else {
    msg += T("⚡ {N}問 おわり！", { N });
  }
  touchStreak();
  msg += T("<div class=\"fs-stats\"><div class=\"fs-acc\">正答率 <b>{acc}%</b> <span class=\"sub\">({correct} / {N})</span></div>", { acc, correct, N }) +
    T("<div class=\"fs-row\"><span>1問の 平均</span><b>{v1}秒</b></div>", { v1: avg.toFixed(1) }) +
    T("<div class=\"fs-row\"><span>いちばん速かった</span><b>{v1}秒</b></div>", { v1: fast.toFixed(1) }) +
    (okTs.length ? T("<div class=\"fs-row\"><span>正解できた問題の平均</span><b>{v1}秒</b></div>", { v1: okAvg.toFixed(1) }) : "") +
    T("<div class=\"fs-row\"><span>合計の 考えた時間</span><b>{v1}秒</b></div>", { v1: sum.toFixed(1) }) +
    (r.improved ? T("<div class=\"fs-best\">✨ 1問の平均で 自己ベスト更新！（{v1}）</div>", { v1: flashGrade.key })
      : flashCustom ? T(`<div class="fs-best sub">じぶんで きめた練習は 自己ベストに 入らないよ</div>`)
      : (r.prev != null ? T("<div class=\"fs-best sub\">{v1}の 自己ベスト {v2}秒／問　あと {v3}秒 はやく</div>", { v1: flashGrade.key, v2: r.prev.toFixed(1), v3: (avg - r.prev).toFixed(1) })
        : T(`<div class="fs-best sub">正答率70%以上で 自己ベストに 記録されるよ</div>`))) +
    `</div>`;
  // 報酬は他の種目とまったく同じ計算（正解・正答率・自己ベスト・完走 × 級の倍率）
  const fkey = (gradeIdxOf(gradeFor) <= myRankIdx() ? gradeFor.key + "_low" : gradeFor.key + "_flash") + (flashCustom ? "_c" : "");
  const { g, lines } = goldForSection({ correct, N, bestUpdated: r.improved, completed: true,
    grade: gradeFor, subj: "flash", count: dailyCount(fkey) });
  dailyCount(fkey, true);
  let earned = g;
  if (pass) { earned += 50; lines.push(T("🎓 検定合格 ＋50")); }
  const daily = dailyBonusOnce(); if (daily) { earned += daily.amt; lines.push(T("🔥 {v1} ＋{v2}", { v1: daily.label, v2: daily.amt })); }
  addGold(earned);
  logSession("flash", N, correct, sum, 0);   // 記録に残す（保護者画面のグラフに乗る）
  solomonAfterStudy();               // 🐣 フラッシュ暗算も 練習のうち
  msg += T("<div class=\"gold-earn\"><img class=\"ico-coin\" src=\"assets/coin.png\" alt=\"\" /> <b>＋{earned} GOLD</b><div class=\"gold-lines\">{v2}</div><div class=\"goal\">{v3}</div></div>", { earned, v2: lines.join("・"), v3: nextGoalHint() });
  msg += maybeDropItem(acc, true);
  // ⭕❌ を 見せたあと、まん中を「▶ つぎ」の ボタンに もどす
  const nextLabel = flashExam.on ? T("▶ つぎの 検定") : T("▶ つぎの {N}問", { N });
  setTimeout(() => { if (flashSpec && !flashBusy && $("#flashForm").classList.contains("hidden")) flashIdle(true, nextLabel); }, 1200);
  if (flashExam.on) {
    if (pass) fxCelebrate(3, "🎓 " + flashGrade.key + T(" ごうかく！"), correct + " / " + N + T(" 正解"));
    else fxCheer(T("あと すこし…"), T("合格は 140点。もう一度 いこう！"));
  } else if (r.improved) fxCelebrate(3, T("⏱ 自己ベスト こうしん！"), T("1問 ") + avg.toFixed(1) + T("秒"));
  else if (acc === 100) fxCelebrate(3, T("💯 ぜんもん せいかい！"), T("1問 ") + avg.toFixed(1) + T("秒"));
  else if (acc >= 80) fxCelebrate(2, T("よくできました！"), T("正答率 ") + acc + "%");
  else fxCelebrate(1, T("おつかれさま！"), T("正答率 ") + acc + "%");
  coinSnd(1.0);
  renderProfile();
  res.innerHTML = msg; res.className = "result " + (flashExam.on && !pass ? "ng" : "ok");
  $("#flashProgress").textContent = "";
  // 本日の練習の 中の フラッシュなら、成績を 段に 記録して つぎへ
  if (routineState && routineState.flashStep) {
    routineState.sections.push({ label: routineState.flashStep.label, subj: "flash", correct, N, sec: sum, items: [] });
    routineState.gold = (routineState.gold || 0) + g;
    routineState.flashStep = null; routineState.stepIdx++;
    $("#flashExamMode").disabled = false; $("#flashCustom").classList.remove("hidden");
    res.innerHTML += T('<div class="sub">つぎへ すすみます…</div>');
    setTimeout(() => { if (routineState) runStep(); }, 2500);
  }
}

/* ============================================================ たいせん（CPU対戦ゲーム／レオ王） */
let battle = null, battleTimer = null;
// 敵のHPは級によらず一定（難易度は出題される問題そのもので調整済み）
const ENEMY_HP = 3;
const PLAYER_HP = 4; // まちがえると♥が1つへる。0になったらアウト
// 1匹たおすごとに次の敵へ（6体を順番にくり返す）
/* たいせんの敵：ミスモンスター（たおした数で 順に 出てくる）。
   絵の形に できるだけ 合わせてある（コンマ形＝カンピロバクター、らせん＝ヘリコバクター など）。 */
/* 敵は「ミスモンスター」＝王国に「数の乱れ」を起こす いたずらもの。
   それぞれ 子どもの まちがえ方（MISS_KINDS）と 対応している。絵は いまのものを そのまま使う */
const ENEMIES = [
  { file: "miss_1.png", name: T("ケタズレ"), d: T("桁を まちがえさせる いたずらっ子") },
  { file: "miss_2.png", name: T("オクリマチガイ"), d: T("くり上がりを こんらんさせる") },
  { file: "miss_3.png", name: T("アセリーヌ"), d: T("いそがせて ミスを さそう") },
  { file: "miss_4.png", name: T("ボーットン"), d: T("しゅうちゅうを うばう のんびり屋") },
  { file: "miss_5.png", name: T("ミスラ"), d: T("計算の とちゅうで まちがえさせる") },
  { file: "miss_6.png", name: T("フリーズン"), d: T("頭を まっ白に する 冷たい 敵") },
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
      battleFx(T("たおした！ ＋{v1} GOLD", { v1: Math.round(GOLD_PER_KILL * gradeGoldMult(battle.grade)) }), "kill");
      enemyDownSnd();                 // 敵の やられ声（毎回ちがう）
      coinSnd(0.55);                  // GOLDの音は 声のあとに
      if (battle.kills % 3 === 0) setTimeout(function () { sfx("praise"); }, 1000);   // 3匹ごとに ほめてくれる
      const img = $("#enemyImg"); img.className = "down";
      setTimeout(() => { if (!battle || !battle.running) return; img.className = "appear"; setEnemyIdentity(); }, 650);
    } else {                                    // こうげき命中
      battleFx(T("こうげき！ HP−1"), "ok");
      enemyAnim("hit", 300); clickSnd();
    }
    renderEnemy();
  } else {
    battle.life--;                                   // まちがえたら自分もダメージ
    renderEnemy();
    if (battle.life <= 0) { battleFx(T("♥がなくなった！"), "miss"); wrongSnd(); return finishBattle("out"); }
    battleFx(T("はずれた！ ♥ のこり {v1}", { v1: battle.life }), "miss"); // 責めない言い方にする
    neutralSnd();
  }
  battleProblem();
}
function finishBattle(reason) {
  battle.running = false; if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  const kills = battle.kills, isOut = reason === "out";
  logSession(battleSubjOf(), battle.atts, battle.you, battle.dur, 0, null, "battle"); // 記録には残す（印つき＝ソロモンは数えない）
  const gm = gradeGoldMult(battle.grade);          // たいせんも級で報酬が増える
  const perKill = Math.round(GOLD_PER_KILL * gm);
  let earned = kills * perKill;
  const daily = dailyBonusOnce(); if (daily) earned += daily.amt;
  if (battle.you > 0) { touchStreak(); addGold(earned); }
  (kills > 0 && !isOut) ? bigFanfareSnd() : neutralSnd();
  if (battle.you > 0 && earned > 0) coinSnd(kills > 0 && !isOut ? 1.4 : 0.2);
  const badge = (kills > 0 && !isOut) ? T('<span class="badge-chip win">WIN！</span>') : T('<span class="badge-chip">🏁 コンプリート！</span>');
  const face = (kills > 0 && !isOut) ? "king_celebrate.png" : "king_wave.png";
  const verdict = isOut
    ? T("💫 アウト！ {kills}ぴき たおしたよ", { kills })
    : (kills > 0 ? T("🎉 {kills}ぴき たおした！", { kills }) : T("つぎは1ぴき たおそう！"));
  const outNote = isOut ? T('<p class="sub">4回まちがえたので おしまい。ゆっくり たしかめて こたえると ♥ がへらないよ。</p>') : "";
  $("#battleArena").classList.add("hidden");
  const rbox = $("#battleResult"); rbox.classList.remove("hidden");
  rbox.innerHTML =
    `<div class="battle-verdict"><img class="bv-face" src="assets/${face}" alt="" /><div><span class="bv-badge">${badge}</span><h3>${verdict}</h3></div></div>` +
    T("<div class=\"battle-score-final\">たおした数 <b>{kills}</b><span class=\"bs-sub\">せいかい {v2} / {v3}問　♥のこり {v4}</span></div>", { kills, v2: battle.you, v3: battle.atts, v4: Math.max(0, battle.life) }) + outNote +
    (battle.you > 0 ? T("<div class=\"gold-earn\"><img class=\"ico-coin\" src=\"assets/coin.png\" alt=\"\" /> <b>＋{earned} GOLD</b><div class=\"gold-lines\">{kills}ぴき × {perKill} GOLD（{v4} ×{gm}）</div><div class=\"goal\">{v6}</div></div>", { earned, kills, perKill, v4: battle.grade.key, gm, v6: nextGoalHint() }) : T('<p class="sub">3回せいかいすると てきを たおせるよ！</p>')) +
    maybeDropItem(battle.atts ? Math.round((battle.you / battle.atts) * 100) : 0, !isOut && battle.atts >= 5) +
    T(`<br><button id="battleAgain">もう一度</button> <button id="battleToKingdom" class="ghost">🧩 パズルへ</button>`);
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
  [T("よくできました！"), T("その調子だよ")],
  [T("すごい！"), T("よく がんばったね")],
  [T("だいせいこう！"), T("レオ王も おどろいてる")],
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
  [T("おしい！"), T("あと ちょっとだったね")],
  [T("ドンマイ！"), T("つぎは いけるよ")],
  [T("よく ちょうせんした！"), T("やめずに つづけたのが えらい")],
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
    T('<button class="tip-ok">わかった！</button></div>');
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
  { k: "bead", s: T("そろばん玉"), c: "#d99a2b", g: "#f0c364" },
];
// アイテム（GOLDで買って、はじめから盤に置く）
const PZ_ITEMS = [
  // 盤に置かず、はじめの手数を ふやすもの（手数が たりないときの たすけ）
  { id: "moves5", n: T("手数 ＋5"), em: "⏱", moves: 5, cost: 30, tip: T("はじめから 手数が 5 多い（かさねて 買える）") },
  { id: "rocket", n: T("ロケット"), em: "🚀", sp: "rh", cost: 40, tip: T("はじめから 盤にある。となりと 入れかえると たて か よこ 1れつ 消す") },
  { id: "prop", n: T("プロペラ"), em: "🚁", sp: "prop", cost: 50, tip: T("はじめから 盤にある。入れかえると 目あての玉へ とんでいって 消す") },
  { id: "tnt", n: "TNT", em: "💣", sp: "tnt", cost: 60, tip: T("はじめから 盤にある。入れかえると まわり 3×3 を ばくはつ") },
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
const PZ_BLOCK = { box: { n: T("木箱"), hp: 1 }, stone: { n: T("石の箱"), hp: 2 } };
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
  if (sa === "disco" && sb === "disco") { for (let j = 0; j < c.length; j++) out.add(j); return T("全部 消えた！"); }
  if (sa === "disco" || sb === "disco") {
    const other = sa === "disco" ? B : A, at = sa === "disco" ? a : b;
    if (other.sp) {                                   // 光の玉 × 特殊 → 同じ色が ぜんぶ その特殊になって 一斉発動
      const kind = other.k;
      const list = pzTargetsOf(c, kind);
      out.add(at); out.add(sa === "disco" ? b : a);
      list.forEach((j) => { if (c[j]) pzBlast(c, j, out, fired, { as: other.sp, force: true }); });
      return T("光の玉 × ") + (other.sp === "tnt" ? "TNT" : other.sp === "prop" ? T("プロペラ") : T("ロケット")) + T("！");
    }
    pzBlast(c, at, out, fired, { as: "disco", color: other.k });      // 光の玉 × ふつう → その色 ぜんぶ
    out.add(sa === "disco" ? b : a);
    return T("同じ色を ぜんぶ 消した！");
  }
  if (isR(sa) && isR(sb)) { pzBlast(c, b, out, fired, { as: "cross", force: true }); out.add(a); return T("ロケット × ロケット！"); }
  if (sa === "tnt" && sb === "tnt") { pzBlast(c, b, out, fired, { as: "tnt", big: true, force: true }); out.add(a); return T("TNT × TNT！"); }
  if (sa === "prop" && sb === "prop") { pzBlast(c, b, out, fired, { as: "prop", count: 3, force: true }); out.add(a); return T("プロペラが 3機！"); }
  if ((isR(sa) && sb === "tnt") || (sa === "tnt" && isR(sb))) {        // ロケット × TNT → 3れつ ＋ 3ぎょう
    const x = b % PZ_W, y = (b / PZ_W) | 0;
    for (let d = -1; d <= 1; d++) {
      for (let k = 0; k < PZ_W; k++) if (pzIn(k, y + d)) out.add(pzIdx(k, y + d));
      for (let k = 0; k < PZ_H; k++) if (pzIn(x + d, k)) out.add(pzIdx(x + d, k));
    }
    out.add(a);
    return T("ロケット × TNT！");
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
  rh: [T("🚀 ロケットが できた！"), T("<p><b>4つ ならべる</b>と ロケットが できるよ。</p><p>ロケットを <b>となりの玉と 入れかえる</b>と、<b>たて か よこ 1れつ</b>を ぜんぶ 消す！</p><p>ロケットどうしを 入れかえると <b>十字</b>に 消えるよ。</p>")],
  tnt: [T("💣 TNTが できた！"), T("<p><b>T字 か L字</b>に ならべると TNTが できるよ。</p><p>TNTを <b>となりの玉と 入れかえる</b>と、<b>まわり 3×3</b> が ばくはつ！</p><p>TNTどうしなら もっと 大きく ばくはつするよ。</p>")],
  prop: [T("🚁 プロペラが できた！"), T("<p><b>2×2 の四角</b>に ならべると プロペラが できるよ。</p><p>プロペラを <b>となりの玉と 入れかえる</b>と、<b>目あての玉</b>へ とんでいって 消す！</p><p>草や 箱が のこっているときにも べんり。</p>")],
  disco: [T("✨ 光の玉が できた！"), T("<p><b>5つ ならべる</b>と 光の玉が できるよ。</p><p>光の玉を <b>どれかの玉と 入れかえる</b>と、<b>その色の玉を ぜんぶ</b> 消す！</p><p>ロケットや TNTと 入れかえると、その色が ぜんぶ ロケット／TNTに なるよ。</p>")],
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
  if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return { ok: false, why: T("となり どうしだけ") };
  if (!pzWouldMatch(pz.cells, a, b)) return { ok: false, why: T("そろわないよ") };
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
    if (pzReshuffle()) { try { pzMsg(T("手づまり！ ならべ直したよ"), "ok"); } catch (e) { } }
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
  $("#pzMoves").innerHTML = T("のこり <b>") + Math.max(0, pz.moves) + T("</b> 手");
  const sc = $("#pzScore"); if (sc) sc.textContent = (pz.score || 0).toLocaleString();
  pzKingFace();
  $("#pzLv").textContent = T("レベル ") + pz.lv.n;
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
const PZ_PRAISE = ["", "", T("いいね！"), T("すごい！"), T("さいこう！"), T("でんせつ！"), T("しんきろく！")];
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
    pzMsg(chain + T("れんさ！"), "ok");
  }
  await pzWait(Math.max(chain > 1 ? 150 : 175, maxD + 190));
  pzApply(pz.cells, r);
  pzFall(pz.cells, pz.lv.kinds);
  const got = pzGotFrom(r);
  pz.got += got;
  pzScoreAdd(pts, mid);
  if (got) pzGoalPop();
  const left = pz.lv.need - pz.got;
  if (left > 0 && left <= 2) pzMsg(T("あと ") + left + T(" こ！"), "ok");
  pzSync();
  pzRenderHud();
  await pzWait(200);
  return r;
}
/* ---- 手数が余ってクリアしたとき：のこりが ロケットになって 自動で発射（フィナーレ） ---- */
async function pzFinale() {
  const left = Math.min(pz.moves, 8);
  if (left <= 0) return;
  pzMsg(T("のこり ") + pz.moves + T(" 手が ロケットに！"), "ok");
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
  { id: "moves", n: T("手数+5"), em: "⏱", cost: 30, tip: T("のこり手数を 5 ふやす"), now: true },
  { id: "hammer", n: T("ハンマー"), em: "🔨", cost: 25, tip: T("タップした玉を 1つ こわす（手数は へらない）") },
  { id: "rocket", n: T("ロケット"), em: "🚀", cost: 40, tip: T("タップした場所を ロケットにして すぐ 発射（たて か よこ 1れつ）") },
  { id: "prop", n: T("プロペラ"), em: "🚁", cost: 50, tip: T("タップした場所を プロペラにして すぐ 発射（目あての玉へ）") },
  { id: "tnt", n: "TNT", em: "💣", cost: 60, tip: T("タップした場所を TNTにして すぐ ばくはつ（まわり 3×3）") },
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
  if (!pzToolStock(id) && getGold() < t.cost) { pzMsg(T("GOLDが たりない。そろばんで かせごう！"), "ng"); return; }
  pzArmed = id;
  pzRenderTools();
  $("#pzToolTip").textContent = t.n + T("：") + t.tip + (pzToolStock(id) ? "" : T("（つかうと ") + t.cost + T("G）"));
}
// マスをえらばずに すぐ効く道具（手数+5）
function pzUseNow(t) {
  const stock = pzToolStock(t.id);
  if (!stock) {
    if (getGold() < t.cost) { pzMsg(T("GOLDが たりないよ"), "ng"); return; }
    addGold(-t.cost);
  } else { const d = pzLoad(); d.items[t.id] = stock - 1; pzSave(d); }
  if (t.id === "moves") {
    pz.moves += 5;
    pzMsg(T("手数を 5 ふやした！"), "ok");
    try { sfx("coin", function () { coinSnd(0); }); } catch (e) { }
  }
  pzRenderHud(); pzRenderTools();
}
// 道具をつかう（手数は へらない）
async function pzUseTool(i) {
  const id = pzArmed, t = PZ_TOOLS.find((x) => x.id === id);
  if (!t || !pz || pz.busy || pz.done) return false;
  if (!pz.cells[i]) { pzMsg(T("そこには つかえないよ"), "ng"); return true; }
  const stock = pzToolStock(id);
  if (!stock) {
    if (getGold() < t.cost) { pzMsg(T("GOLDが たりないよ"), "ng"); return true; }
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
    if (pzReshuffle()) { try { pzMsg(T("手づまり！ ならべ直したよ"), "ok"); } catch (e) { } }
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
    if (chain >= 2) pzMsg(chain + T("れんさ！"), "ok");
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
    (cleared ? T("レベル ") + pz.lv.n + T(" クリア！") : T("手数ぎれ…")) + "</div>" +
    '<div class="pz-stars" id="pzStarRow"></div>' +
    '<div class="pz-tally" id="pzTally"></div>' +
    '<div class="pz-gifts" id="pzGifts"></div>' +
    '<div class="pz-res-btns" id="pzBtns"></div>';
  if (!cleared) {
    $("#pzTally").innerHTML = T('あと <b>') + Math.max(0, pz.lv.need - pz.got) + T("</b> こ だったね<br><span class=\"sub\">スコア ") + (pz.score || 0).toLocaleString() + "</span>" +
      (getGold() >= PZ_CONT_COST
        ? T('<button id="pzCont" class="big-cta pz-cont">⏱ ＋5手 つづける（') + PZ_CONT_COST + T('G）</button>') +
          T('<div class="sub">いまの ばんめんの まま つづきます</div>')
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
  tal.innerHTML = T('スコア <b id="pzCount">0</b>');
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
  tal.innerHTML += T('<div class="pz-meter"><span>あつめた ★</span><b>') + d.star + "</b>" +
    '<i class="pz-meter-bar"><u style="width:' + Math.round((d.star % 9) / 9 * 100) + '%"></u></i>' +
    T("<small>つぎの ごほうびまで あと ") + Math.max(1, nextAt - d.star) + " ★</small></div>" +
    (gotBonus > 0 ? T('<div class="pz-gift-item">★9こ たまった！ ⏱ <b>手数 ＋5 ×') + gotBonus + T("</b> を もらった！</div>") : "");
  await pzWait(gotBonus > 0 ? 700 : 420);
  // ⑤ たからばこ（3レベルごと）
  if (pz.lv.n % PZ_CHEST_EVERY === 0) {
    const gif = $("#pzGifts");
    gif.innerHTML = T('<div class="pz-chest" id="pzChest">🎁</div><div class="sub">たからばこ！</div>');
    try { bigFanfareSnd(); } catch (e) { }
    await pzWait(700);
    const pick = PZ_ITEMS[Math.floor(Math.random() * PZ_ITEMS.length)];
    const num = 1 + (st >= 3 ? 1 : 0);
    pzGiveItem(d, pick.id, num); pzSave(d);
    $("#pzChest").classList.add("open");
    gif.innerHTML = '<div class="pz-chest open">🎁</div>' +
      '<div class="pz-gift-item">' + pick.em + " <b>" + pick.n + " ×" + num + T("</b> を もらった！</div>") +
      T('<div class="sub">つぎのレベルで タダで つかえるよ</div>');
    try { coinSnd(0); } catch (e) { }
    await pzWait(500);
  } else if (st >= 3) {
    pzGiveItem(d, "rocket", 1); pzSave(d);
    $("#pzGifts").innerHTML = T('<div class="pz-gift-item">★3 ボーナス！ 🚀 <b>ロケット ×1</b> を もらった！</div>');
    await pzWait(400);
  }
  pzCeremonyButtons(true);
}
function pzCeremonyButtons(cleared) {
  const g = getGold();
  $("#pzBtns").innerHTML =
    (g >= PZ_PLAY_COST ? '<button id="pzAgain" class="big-cta">▶ ' + (cleared ? T("つぎの レベル") : T("もう一度")) + T("（") + PZ_PLAY_COST + T("G）</button>")
      : T('<div class="pz-need">GOLDが たりない。そろばんで かせごう！</div>')) +
    T(' <button id="pzHome" class="ghost">やめる</button>');
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
  pzMsg(T("＋5手！ もうひとふんばり"), "ok");
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
    fxCelebrate(st, T("レベル ") + pz.lv.n + T(" クリア！"), st >= 3 ? T("パーフェクト！ ★★★") : T("よく がんばったね"));
  } else {
    fxCheer(T("あと ") + Math.max(0, pz.lv.need - pz.got) + T(" こ だった…"), T("つぎは いけるよ！"));
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
        (done === "win" ? T("レベル ") + pz.lv.n + T(" クリア！") : T("手数ぎれ…")) + '</div><div class="pz-res-btns" id="pzBtns"></div>';
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
  const face = lv.goal === "grass" ? T('<i class="pz-fl sm"></i> 草を')
    : lv.goal === "box" ? T('<i class="pz-bk box sm"></i> 箱を')
    : '<img class="pz-mini" src="assets/' + (PZ_IMG[lv.target] || PZ_IMG.dia) + T('.png" alt=""> を');
  const items = PZ_ITEMS.map((it) => {
    const n = pzBuy[it.id] || 0;
    const stock = (d.items && d.items[it.id]) || 0;
    return '<div class="pz-item"><span class="pz-em">' + it.em + '</span><span class="pz-in"><b>' + it.n + "</b><small>" + it.tip + "</small></span>" +
      (stock ? T('<span class="pz-stock">もっている ') + stock + '</span>' : '<span class="pz-ic">' + it.cost + "G</span>") +
      '<button class="pz-buy" data-it="' + it.id + '"' + (!stock && g < it.cost ? " disabled" : "") + T(">＋</button>") +
      '<span class="pz-have">' + (n ? "×" + n : "") + "</span></div>";
  }).join("");
  const total = PZ_PLAY_COST + pzBuyCost();
  const stars = [];
  for (let i = Math.max(1, d.lv - 4); i < d.lv; i++) stars.push('<span class="pz-past">' + i + T("：") + "★".repeat(d.stars[i] || 0) + "</span>");
  $("#pzLobby").innerHTML =
    T('<div class="pz-lv-big">レベル <b>') + lv.n + "</b></div>" +
    '<div class="pz-goal-big">' + face + " <b>" + lv.need + T("</b> こ　／　<b>") + lv.moves + T("</b> 手 いない</div>") +
    (stars.length ? '<div class="pz-past-row">' + stars.join("") + "</div>" : "") +
    T('<div class="pz-items-h">アイテム（GOLDで 買うと はじめから 盤に あるよ）</div>') +
    T('<div class="sub pz-howto">つかい方：特殊な玉を <b>となりの玉と 入れかえる</b>と はっしゃ！　4つならべ＝🚀　T字・L字＝💣　2×2＝🚁　5つならべ＝✨</div>') + items +
    T('<div class="pz-total">つかう GOLD：<b>') + total + T("</b>　（もっている ") + g.toLocaleString() + T("）</div>") +
    (g >= total ? T('<button id="pzGo" class="big-cta">▶ はじめる</button>')
      : T('<div class="pz-need">GOLDが ') + (total - g) + T(" たりない。そろばんの れんしゅうで かせごう！</div>")) +
    T('<p class="sub">※ パズルでは GOLDは 増えません。GOLDが 増えるのは そろばんの れんしゅうと ランキングの ごほうびだけ。</p>');
  $$("#pzLobby .pz-buy").forEach((b) => {
    b.onclick = () => {
      const it = PZ_ITEMS.find((i) => i.id === b.dataset.it), rec = pzLoad();
      const stock = (rec.items && rec.items[it.id]) || 0;
      const used = pzBuy[it.id] || 0;
      if (used < stock) { pzBuy[it.id] = used + 1; return pzRenderLobby(); }   // もらった分は タダ
      const cur = pzBuyCost();
      if (getGold() < PZ_PLAY_COST + cur + it.cost) return pzMsg(T("GOLDが たりないよ"), "ng");
      pzBuy[it.id] = Math.min(3, used + 1);
      pzRenderLobby();
    };
  });
  const go = $("#pzGo");
  if (go) go.onclick = () => {
    const cost = PZ_PLAY_COST + pzBuyCost();
    if (getGold() < cost) return pzMsg(T("GOLDが たりないよ"), "ng");
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
    tipOnce("pz-grass", T("🌿 みどりの 草を はがそう"),
      '<div class="tip-demo"><i class="pz-fl big"></i><span class="tip-ar">▶</span><i class="pz-fl big gone"></i></div>' +
      T("<p><b>草のマスの上で、玉を3つ そろえる</b>と 草が はがれます。</p>") +
      T("<p>草そのものを 動かすことは できません。<b>草の上に ある玉</b>を そろえるのが コツ。</p>") +
      T("<p>ロケットや TNT で ふきとばしても はがれます。</p>"));
  } else if (lv.goal === "box") {
    tipOnce("pz-box", T("📦 木箱を こわそう"),
      '<div class="tip-demo"><i class="pz-bk box big"></i><span class="tip-ar">▶</span><i class="pz-bk box big gone"></i></div>' +
      T("<p><b>箱の となりで 玉を そろえる</b>と こわれます。箱の上では そろえられません。</p>") +
      T("<p>箱は 動かせず、玉も 通りぬけできません。</p>") +
      T("<p><b>石の箱</b>は かたいので <b>2回</b> こわす ひつようが あります。</p>"));
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
  if (pz && !pz.done && !confirm(T("やめる？（つかった GOLDは もどりません）"))) return;
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
  return T("<p><b>BGM</b>：魔王魂（https://maou.audio/）<br>") +
    T("魔王魂の素材は 商用利用できますが、<b>クレジット表記が 必要</b>です。この表示を 消さないでください。</p>") +
    T("<p><b>効果音</b>：効果音ラボ（https://soundeffect-lab.info/）<br>") +
    T("商用利用・クレジット表記なしで つかえます（音源ファイルそのものの 再配布は できません）。</p>") +
    T("<p><b>イラスト</b>：生成AIで 作ったものを つかっています。</p>") +
    T('<p><a href="legal.html#tokushoho" target="_blank" rel="noopener">特定商取引法に基づく表記</a>　<a href="legal.html#privacy" target="_blank" rel="noopener">プライバシーポリシー</a>　<a href="legal.html#terms" target="_blank" rel="noopener">利用規約</a></p>') +
    T("<p><b>問題の内容</b>：出題の形式（桁数・口数）は、公開されている 珠算検定の 出題例を 参考にした <b>このアプリ独自</b>の めやすです。問題は すべて このアプリが その場で 作っています（数字を どこかから 写して いません）。") +
    T("当アプリは 個人が 作った 非公式の 練習アプリで、珠算の 検定を 行う 団体とは 一切 関係ありません。</p>");
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
const TIP_OPEN = { t: T("👑 そろばんキングダムへ ようこそ！"),
  b: T('<ol class="tip-steps"><li><b>そろばん</b>で れんしゅうすると</li><li><b>GOLD</b>（きんか）が たまって</li><li><b>パズル</b>や <b>たいせん</b>で あそべるよ</li></ol>') +
     T('<p>まずは <b>「今日の練習を始める」</b>を おしてみよう。はじめは <b>20級</b>からだよ。</p>') };
const TIP_PLAY = { t: T("🧮 そろばんの つかいかた"),
  b: sbStep(0, 3, T("たまを <b>ゆびで なぞる</b>と うごくよ。上に よせると「入る」")) +
     T('<p>🔴 <b>あかい点</b>の れつが「一のくらい」。<br>できたら <b>「こたえる」</b>を おそう。まちがえても だいじょうぶ！</p>') };
const TIP_ROUTINE = { t: T("🔥 本日の練習って？"),
  b: T('<p>きょうの ぶんを <b>じゅんばんに</b> やる メニューだよ。</p>') +
     T('<ol class="tip-steps"><li>いくつかの セットを とく</li><li>あいだに <b>きゅうけい</b>が 入る（とばしても いい）</li><li>さいごに <b>せいせき はっぴょう</b>！</li></ol>') +
     T('<p>とちゅうで やめても、また はじめから できるよ。</p>') };
const TIP_RESULT = { t: T("🔍 ここが いちばん だいじ"),
  b: T('<p>この下に、<b>まちがえた もんだい</b>が 1つずつ、<b>たまの うごき</b>で せつめいされているよ。</p>') +
     T('<p>「どこで まちがえたか」が わかると、つぎは できるようになる。<br>ゆっくり 見てみよう。</p>') };
const TIP_PUZZLE = { t: T("🧩 パズルの あそびかた"),
  b: T('<p>となりの たまと <b>入れかえて</b>、おなじ たまを <b>3つ ならべる</b>と きえるよ。</p>') +
     T('<p>1回 あそぶのに <b>GOLD</b>を つかうよ。GOLDは <b>そろばんの れんしゅう</b>で たまる。<br>パズルでは ふえないよ。</p>') };
function tipFirstOpen() { tipOnce("first-open", TIP_OPEN.t, TIP_OPEN.b, soloIntro); }   // 説明のあと、ソロモンが あらわれる（第1話）

/* ============================================================ 入門級（20〜15級）の 絵つき説明
   級体系の表（curriculum/sk.js の 20〜16級）に決めた 学習の順（5の友 → くり上がりなし → 10の友 → くり上がり）に そって、
   その級を はじめる前に 1回だけ 見せる。 */
const LESSON_LOW = {
  20: { t: T("20級：たまの いみ"),
    b: T('<p><b>一玉（いちだま）</b>は 1。上に よせると 入るよ。<br><b>五玉（ごだま）</b>は 5。下に よせると 入るよ。</p>') +
       sbStep(0, 3, T("1 + 2 ＝ 3　一玉を 1つ、また 2つ 入れる")) + sbStep(0, 5, T("5 は 五玉 1つ")) +
       T('<p class="un-note">本物の そろばんを つかうときは、<b>おやゆび</b>で 一玉を 上げ、<b>ひとさしゆび</b>で 下げます。') +
       T('くわしくは 上の 📖「そろばんの きほん」を 見てね。</p>') +
       T('<p>こたえが <b>5まで</b>の もんだいを やってみよう！</p>') },
  19: { t: T("19級：5の友（とも）"),
    b: T('<p>一玉が たりないときは、<b>五玉を 入れて</b> あまりを <b>はらう</b>よ。</p>') +
       T('<p class="ls-key"><b>5の友</b>：1と4 ／ 2と3</p>') +
       sbStep(3, 7, T("3 + 4：一玉が たりない → 五玉を 入れて、4の友の <b>1</b>を はらう")) +
       T('<p>こたえが <b>9まで</b>。くり上がりは まだ ないよ。</p>') },
  18: { t: T("18級：五玉を つかう"),
    b: T('<p>6・7・8・9 は <b>五玉 ＋ 一玉</b>だよ。</p>') +
       sbStep(6, 9, T("6 + 3 ＝ 9　一玉を 3つ 入れる")) + sbStep(4, 8, T("4 + 4：一玉が たりない → 五玉を 入れて 1を はらう")) +
       T('<p>こたえが <b>6〜10</b>の もんだいだよ。</p>') },
  17: { t: T("17級：くり上がり（10の友）"),
    b: T('<p>9より 大きくなるときは、<b>となりの くらいに 1</b>を 入れて、<b>10の友</b>を はらうよ。</p>') +
       T('<p class="ls-key"><b>10の友</b>：1と9 ／ 2と8 ／ 3と7 ／ 4と6 ／ 5と5</p>') +
       sbStep(8, 13, T("8 + 5：十のくらいに 1 を 入れて、5の友の <b>5</b>を はらう → 13")) +
       T('<p>こたえが <b>11〜18</b>の もんだいだよ。</p>') },
  16: { t: T("16級：3つの かず"),
    b: T('<p>かずが <b>3つ</b>に なるよ。<b>じゅんばんに</b> たしていこう。</p>') +
       sbStep(2, 5, T("2 + 3 ＝ 5")) + sbStep(5, 9, T("つづけて + 4 ＝ 9")) +
       T('<p>くり上がりは ないよ。1つずつ たしかめながら 進もう。</p>') },
  15: { t: T("15級：3つの かず と くり上がり"),
    b: T('<p>3つの かずで、<b>くり上がり</b>も 出てくるよ。</p>') +
       sbStep(7, 11, T("7 + 4：十のくらいに 1、6を はらう → 11")) + sbStep(11, 18, T("つづけて + 7 ＝ 18")) +
       T('<p>あわてなくて いいよ。1つずつ たしかめよう。</p>') },
  14: { t: T("14級：5の友で ひく"),
    b: T('<p>ひき算も 同じ。一玉が <b>たりないとき</b>は、<b>五玉を はらって</b> 友の かずを <b>入れる</b>よ。</p>') +
       T('<p class="ls-key"><b>5の友</b>：1と4 ／ 2と3</p>') +
       sbStep(7, 4, T("7 − 3：一玉が たりない → 五玉を はらって、3の友の <b>2</b>を 入れる")) +
       sbStep(6, 2, T("6 − 4：五玉を はらって、4の友の <b>1</b>を 入れる")) },
  13: { t: T("13級：くり下がり（10の友で ひく）"),
    b: T('<p>ひけないときは、<b>十のくらいから 1 を はらって</b>、<b>10の友</b>を 入れるよ。</p>') +
       T('<p class="ls-key"><b>10の友</b>：1と9 ／ 2と8 ／ 3と7 ／ 4と6 ／ 5と5</p>') +
       sbStep(13, 7, T("13 − 6：十のくらいの 1 を はらって、6の友の <b>4</b>を 入れる → 7")) +
       sbStep(15, 8, T("15 − 7：十のくらいの 1 を はらって、7の友の <b>3</b>を 入れる → 8")) },
  12: { t: T("12級：たしたり ひいたり"),
    b: T('<p>3つの かずを、<b>上から じゅんばんに</b>。たし算と ひき算が まざっても、1つずつ やれば だいじょうぶ。</p>') +
       sbStep(9, 13, T("9 + 4 ＝ 13（くり上がり）")) + sbStep(13, 8, T("つづけて − 5 ＝ 8（五玉を はらう）")) },
  11: { t: T("11級：はやく、せいかくに"),
    b: T('<p>やり方は もう ぜんぶ 知っているよ。ここからは <b>手を 止めない</b>れんしゅう。</p>') +
       T('<ul><li>かずを 見たら <b>すぐ</b> 玉を 動かす</li><li>まよったら 🔴 <b>一のくらい</b>を 見る</li><li>まちがえても <b>ご破算（0にする）</b>で やり直せる</li></ul>') +
       sbStep(6, 14, T("6 + 8 ＝ 14")) + sbStep(14, 5, T("つづけて − 9 ＝ 5")) },
  10: { t: T("10級：2けたの かず"),
    b: T('<p>2けたに なっても 同じ。<b>左（十のくらい）から</b> 入れていくよ。</p>') +
       sbStep(23, 68, T("23 + 45：十のくらい 2+4、一のくらい 3+5 → 68")) +
       sbStep(47, 85, T("47 + 38：十のくらい 4+3=7、一のくらい 7+8 は くり上がり → 十に 1、8の友 2を はらう → 85")) +
       T('<p>かずが 5つ つづくよ。<b>1つ たすごとに</b> そろばんを 見て たしかめよう。</p>') },
};
// かけ算（9級から）・わり算（7級から）の はじめての説明
const LESSON_KAKE = { t: T("9級：かけ算の やりかた"),
  b: T('<p>かけ算は <b>九九を 1つずつ</b> そろばんに たしていくよ。</p>') +
     T('<p class="ls-key">23 × 4 → <b>20×4</b> と <b>3×4</b> に わける</p>') +
     sbStep(0, 80, T("まず 20 × 4 ＝ 80 を 入れる"), 3) + sbStep(80, 92, T("つぎに 3 × 4 ＝ 12 を たす → 92"), 3) +
     T('<p>コツ：九九の答えが 1けたのときは「<b>0</b>6」のように 0を つけて、<b>2けたぶんの 場所</b>に 入れる。</p>') };
const LESSON_WARI = { t: T("7級：わり算の やりかた"),
  b: T('<p>わり算は <b>大きい くらいから</b>「いくつ 入るか」を 考えるよ。</p>') +
     T('<p class="ls-key">84 ÷ 4 → 十のくらいの <b>8</b> から</p>') +
     sbStep(84, 21, T("8 に 4 は 2つ → 十のくらいに <b>2</b>。のこりの 4 に 4 は 1つ → 一のくらいに <b>1</b>。こたえ 21")) +
     T('<p>コツ：入る数を 大きく とりすぎたら、1つ もどして やり直す。<b>あまり</b>は 出ないように 作ってあるよ。</p>') };
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
    sec(true, T("① たまの なまえ"),
      T('<p><b>一玉（いちだま）</b>＝1。上に よせると 入る。<br><b>五玉（ごだま）</b>＝5。下に よせると 入る。<br>') +
      T('まん中の 黒い ぼうが <b>はり</b>。🔴 あかい点の れつが <b>一のくらい</b>。</p>') +
      '<div class="sb-pair">' + sbSVG(0) + '<span class="sb-ar">→</span>' + sbSVG(7, 0) + T('</div><div class="sb-cap">7 ＝ 五玉 1つ ＋ 一玉 2つ</div>')) +
    sec(true, T("② ゆびの つかいかた（運指）"), unshiHTML(true)) +
    sec(false, T("③ 5の友（とも）"),
      T('<p>一玉が たりないときは、<b>五玉を 入れて</b> 友の かずを <b>はらう</b>。</p><p class="ls-key">1と4 ／ 2と3</p>') +
      sbStep(3, 7, T("3 + 4 → 五玉を 入れて 1を はらう")) + sbStep(7, 4, T("7 − 3 → 五玉を はらって 2を 入れる（ひき算は ぎゃく）"))) +
    sec(false, T("④ 10の友（くり上がり・くり下がり）"),
      T('<p>10を こえるときは、<b>となりの くらいに 1</b>を 入れて、10の友を はらう。</p><p class="ls-key">1と9 ／ 2と8 ／ 3と7 ／ 4と6 ／ 5と5</p>') +
      sbStep(8, 13, T("8 + 5 → 十のくらいに 1、5を はらう")) + sbStep(13, 7, T("13 − 6 → 十のくらいの 1を はらって、4を 入れる"))) +
    sec(false, T("⑤ かけ算（9級から）"), LESSON_KAKE.b) +
    sec(false, T("⑥ わり算（7級から）"), LESSON_WARI.b) +
    sec(false, T("⑦ けんていの きまり（めやす）"),
      T('<p>珠算（そろばん）：1しゅもく 15もん・7分・150点まん点で <b>100点いじょう</b> ごうかく。<br>') +
      T('暗算：20もん・3分・100点まん点で <b>70点いじょう</b>。<br>フラッシュ暗算：20もん・200点まん点で <b>140点いじょう</b>。</p>') +
      T('<p class="sub">公開されている 珠算検定の 出題例を 参考にした、このアプリ独自の めやすです。よその 検定とは 関係ありません。</p>')) +
    // おうちの人・先生が じっくり 読める、印刷しやすい 解説ページ（検索からも 来られる）
    T('<div class="lesson-links"><b>くわしい解説（べつのページ）</b>') +
    T('<a href="soroban-yubi.html">✋ 指づかい（運指）</a>') +
    T('<a href="soroban-tomo.html">🖐 5の友・10の友</a>') +
    T('<a href="soroban-kyu.html">📘 級のレベルの めやす</a></div>');
}


/* ============================================================ 運指（うんし）＝ ゆびの つかいかた
   そろばんの「型」。かぎられた時間で 速く 正確に はじくために、むだな動きを なくす。
     ① 1珠（下の4つ）を 上げる  … おやゆび（青）
     ② 1珠を 下げる            … ひとさしゆび（赤）
     ③ 5珠（上の1つ）を 動かす  … ひとさしゆび（赤・上げも下げも）
   1桁ぶんの そろばんを 描き、動く珠の よこに「どの指で・どっち向きか」の 矢印を つける。 */
const FINGER = { thumb: { n: T("おやゆび"), c: "#2b6fd0", em: "👍" }, index: { n: T("ひとさしゆび"), c: "#c0392b", em: "☝" } };
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
    '<div class="un-tags">' + tags + (flat.length > 1 ? T('<span class="un-both">同時に！</span>') : "") + "</div>" +
    '<div class="un-cap">' + cap + "</div>" + (note ? '<div class="un-why">' + note + "</div>" : "") + "</div>";
}
/* 運指の説明。本物の そろばんを つかうときの ゆびの動かし方 */
function unshiHTML(full) {
  let o = T('<p class="un-lead">どんな 習いごとにも <b>「型（かた）」</b>が あります。') +
    T('そろばんの 型は、まさに この <b>指づかい</b>です。</p>') +
    T('<p class="un-lead">そろばんは <b>かぎられた時間で、速く 正確に</b> はじくもの。') +
    T('そのために <b>むだな 動きを しない</b> きれいな 指づかいが 必要です。') +
    T('つかうのは <b>右手の おやゆび と ひとさしゆび の 2本だけ</b>。</p>') +
    T('<p class="un-h">指づかいの ルールは 3つだけ</p>') +
    '<div class="un-rule"><span class="un-no">①</span><span class="un-tag" style="background:' + FINGER.thumb.c + T('">👍 おやゆび</span>') +
    T('<span class="un-txt"><b>1珠</b>（下の4つの珠）を <b>上げる</b>とき</span></div>') +
    unshiStep(0, 3, T("3 を 入れる … <b>おやゆび</b>で 下から 上へ")) +
    '<div class="un-rule"><span class="un-no">②</span><span class="un-tag" style="background:' + FINGER.index.c + T('">☝ ひとさしゆび</span>') +
    T('<span class="un-txt"><b>1珠</b>を <b>下げる</b>とき</span></div>') +
    unshiStep(3, 0, T("3 を はらう … <b>ひとさしゆび</b>で 上から 下へ")) +
    '<div class="un-rule"><span class="un-no">③</span><span class="un-tag" style="background:' + FINGER.index.c + T('">☝ ひとさしゆび</span>') +
    T('<span class="un-txt"><b>5珠</b>（上の1つの珠）を <b>動かす</b>とき（上げるのも 下げるのも）</span></div>') +
    unshiStep(0, 5, T("5 を 入れる … <b>ひとさしゆび</b>で 下げる")) +
    unshiStep(5, 0, T("5 を はらう … <b>ひとさしゆび</b>で 上げる"));
  if (full) {
    o += T('<p class="un-h">なぜ この ルールなのか</p>') +
      T('<p class="un-lead">ルールには <b>ちゃんと 理由</b>が あります。やってみると わかります。</p>') +
      T('<p class="un-ex">れい ①　<b>3 ＋ 2</b>　（5をたして、3をひく）</p>') +
      unshiStep(3, 5, T("5珠を 下げる と 1珠を 下げる。<b>どちらも ひとさしゆび</b>"),
        1, T("ひとさしゆびを <b>上から下へ 1回 すべらせる</b>だけで おわります。<br>") +
        T("もし 3を <b>おやゆび</b>で ひこうとすると、指を もちかえる ぶん 手間と 時間が かかります。")) +
      T('<p class="un-ex">れい ②　<b>1 ＋ 9</b>　（1をひいて、10をたす）</p>') +
      unshiStep(1, 10, T("1珠を 下げる（ひとさしゆび）と、となりに 10を 入れる（おやゆび）"),
        2, T("<b>ひとさしゆびで 1を 下げながら、同時に おやゆびで 10を たせます。</b><br>") +
        T("もし 1を <b>おやゆび</b>で ひくと、ひき終わるまで 10を たせません。<br>") +
        T("ぎゃくに 1を おやゆび・10を ひとさしゆび に すると、<b>指が 交差して</b> もっと 手間で、つぎの 動きも おそくなります。")) +
      T('<p class="un-note">桁の多い 問題を はじくように なると よく わかります。このルールで 動かすと、指が とても なめらかで むだが 少ないのです。') +
      T('<br><b>この 基礎を ばかにせず、しっかり 身につけたか どうかで、そのあとの のびが 確実に 変わります。</b></p>') +
      T('<p class="un-h">はじめる まえの かまえ</p>') +
      T('<ul class="un-list"><li>そろばんは <b>体の まん中</b>に、まっすぐ おく</li>') +
      T('<li><b>左手</b>で そろばんの 左はしを おさえる（ずれない ように）</li>') +
      T('<li>えんぴつは <b>くすりゆび と こゆび</b>で はさんで もつ。おやゆびと ひとさしゆびが 自由に なり、はじきながら 書ける</li>') +
      T('<li>珠は 指の <b>つめの ちかく</b>で、かるく はじく</li></ul>') +
      T('<p class="un-h">ご破算（ごわさん）＝ 0に もどす</p>') +
      T('<ul class="un-list"><li><b>ひとさしゆび</b>を 梁（はり）の 上に あてて、左から右へ すべらせる → 5珠が ぜんぶ 上がる</li>') +
      T('<li>つづけて <b>おやゆび</b>を 梁の 下に あてて、左から右へ すべらせる → 1珠が ぜんぶ 下がる</li>') +
      T('<li>なれてきたら、2本の 指で <b>はさむように</b> 一回で すべらせる</li></ul>') +
      T('<p class="un-note">かなりの 有段者に なると「1珠は おやゆびだけ、5珠は ひとさしゆびだけ」という 人も いますが、') +
      T('<b>基本は 上の 3つ</b>です。<br><br>') +
      T('このアプリの 画面の そろばんは、ゆびで <b>なぞる</b>だけで うごきます。') +
      T('でも <b>本物の そろばん</b>を つかうときは、上の 指づかいに してください。') +
      T('「級・段を選ぶ」で <b>「じぶんの そろばんを つかう」</b>に すると、本物で れんしゅうできます。</p>');
  }
  return o;
}
const TIP_FINGER = { t: T("✋ 指づかいが そろばんの「型」"), b: unshiHTML(false) +
  T('<p class="un-note">なぜ この ルールなのか、かまえ、ご破算の しかたは') +
  T('<b>「そろばんの きほん」</b>（上の 📖 ボタン）で 見られます。</p>') };


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
    '<div class="sh-akey"><b>' + (pages.length > 1 ? (pi + 1) + T("枚目の ") : "") + T("こたえ</b>") +
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
  if (note) note.textContent = difficulty(g, ss.value) ? g.key + T("／") + SUBJECT[ss.value].name + T("：") + String(specText(g, ss.value)).replace(/<[^>]*>/g, "") : "";
}
function sheetBuild() {
  const g = GRADES[+$("#sheetGrade").value], subj = $("#sheetSubj").value;
  const n = +$("#sheetN").value, pages = +$("#sheetPages").value;
  if (!difficulty(g, subj)) { $("#sheetMsg").textContent = T("この級には この種目が ありません"); return; }
  sheetSave({ subj, n, pages });
  const p = profile();
  const list = [];
  for (let k = 0; k < pages; k++) list.push(sheetMake(g, subj, n));
  sheetData = { grade: g, subj, n, pages: list };
  const line = subj === "kake" || subj === "wari";
  $("#sheetOut").innerHTML = list.map((pg, pi) =>
    '<section class="sh-page">' +
    '<div class="sh-head"><div class="sh-title">' + g.key + "　" + SUBJECT[subj].name +
    (list.length > 1 ? T('<small>（') + (pi + 1) + " / " + list.length + T("枚）</small>") : "") + "</div>" +
    T('<div class="sh-fields"><span>なまえ<i></i></span><span>日づけ<i></i></span><span>タイム<i></i></span><span>とくてん<i></i></span></div></div>') +
    (line ? sheetLineHTML(pg) : sheetMitoriHTML(pg)) +
    T('<div class="sh-foot">そろばんキングダム　sorobankingdom.com</div></section>')).join("") +
    '<section class="sh-page sh-akey-page"><div class="sh-head"><div class="sh-title">' + g.key + "　" + SUBJECT[subj].name +
    T('　こたえ<small>（おうちの人・先生用）</small></div></div>') + sheetAnswerHTML(list) +
    T('<div class="sh-foot">そろばんキングダム　sorobankingdom.com</div></section>');
  $("#sheetOut").classList.remove("hidden");
  $("#sheetPrint").classList.remove("hidden");
  $("#sheetMsg").textContent = T("できました！ 下に 出ています。「印刷する」で 紙に 出せます。");
  $("#sheetOut").scrollIntoView({ behavior: "smooth", block: "start" });
}
/* 用紙の 大きさ（A4 ／ US Letter）。@page は CSS の 中でしか きめられないので、印刷の 直前に <style> を 入れかえる。
   えらんだ 用紙は 覚える。はじめは、ブラウザの 言語が アメリカ英語なら レター、それ以外は A4 */
const PAPER_KEY = "soroban_paper";
function sheetPaper() {
  let v = ""; try { v = localStorage.getItem(PAPER_KEY) || ""; } catch (e) { }
  if (v !== "A4" && v !== "letter") v = (navigator.language || "").toLowerCase() === "en-us" ? "letter" : "A4";
  return v;
}
function applyPaper(v) {
  let st = document.getElementById("pageSizeStyle");
  if (!st) { st = document.createElement("style"); st.id = "pageSizeStyle"; document.head.appendChild(st); }
  st.textContent = "@media print { @page { size: " + (v === "letter" ? "letter" : "A4") + "; } }";
}
function sheetPrint() {
  const v = sheetPaper(); applyPaper(v);
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
  const paper = $("#sheetPaper");
  if (paper) { paper.value = sheetPaper(); applyPaper(paper.value); paper.addEventListener("change", () => { try { localStorage.setItem(PAPER_KEY, paper.value); } catch (e) { } applyPaper(paper.value); }); }
})();


/* ============================================================ SK検定（そろばんキングダム検定）
   このサイト独自の 検定。本番の検定と 同じ形（しゅもくごとに 制限時間・◎×は さいごに まとめて）で、
   いつでも 受けられる。自宅で受けたものは 合格証に「自宅受験」と 明記する（先生の監督つきは 今後）。
   ※ EXAM_TRACKS / examState は SUBJECT の すぐ下で 定義している */
const allExams = () => { try { return JSON.parse(localStorage.getItem(EXAMS) || "[]"); } catch (e) { return []; } };
function examSteps(grade, track) {
  const t = EXAM_TRACKS[track]; if (!t) return [];
  return t.subjs.filter((s) => difficulty(grade, s)).map((s) => ({ subj: s, cf: subjectCfg(grade, s) }));
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
  if (!steps.length) { box.innerHTML = T('<p class="sub">この級には この検定が ありません。</p>'); $("#exGo").disabled = true; return; }
  $("#exGo").disabled = false;
  box.innerHTML = T('<table class="rec-table ex-table"><tr><th>しゅもく</th><th>もんだい</th><th>時間</th><th>ごうかく点</th></tr>') +
    steps.map((s) => "<tr><td>" + s.cf.name + "</td><td>" + s.cf.N + T("問</td><td>") + Math.round(s.cf.limit / 60) + T("分</td><td>") + s.cf.pass + T("点／") + (s.cf.N * s.cf.per) + T("点</td></tr>")).join("") +
    '</table><p class="sub">' + (steps.length > 1 ? T("ぜんぶの しゅもくで ごうかく点を とると ") : "") + g.key + " " + EXAM_TRACKS[track].name + T(" 合格。") +
    (steps.length > 1 ? T("しゅもくの あいだに 30秒の 休けいが あります。") : "") + "</p>";
  // 🎯 進級の めやす：この級の 直近の 練習から 受かりそうかを 出す
  const R = readiness(g, track);
  if (R) box.innerHTML += '<div class="rd-box">' + readinessHTML(R, { noBtn: true }) + "</div>";
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
  $("#playGrade").textContent = T("🏅 SK検定 ") + grade.key + " " + EXAM_TRACKS[examState.track].name + "　" + (examState.idx + 1) + "/" + examState.steps.length + T("：") + cf.name + T("（") + Math.round(cf.limit / 60) + T("分）");
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  startPlayTimer();
  nextPlayProblem();
}
function finishExamSection() {
  hidePauseUI();
  const el = playElapsed();
  const score = session.correct * session.cf.per;
  examState.sections.push({ subj: session.subj, name: session.cf.name, correct: session.correct, N: session.N, score, full: session.N * session.cf.per, pass: session.cf.pass, ok: score >= session.cf.pass, sec: el, items: session.results });
  logSession(session.subj, session.N, session.correct, el, 0, session.results, "exam");   // 検定の 印（ソロモンの ★には 数えない）
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
  $("#playResult").textContent = ""; $("#playGrade").textContent = T("🏅 SK検定：休けい"); $("#playProgress").textContent = ""; $("#playTimer").textContent = "";
  $("#playRest").classList.remove("hidden");
  $("#restResult").innerHTML = T('<p class="sub">けっかは さいごに まとめて 出ます。</p>');
  $("#restNext").textContent = T("つぎは：") + next.cf.name + T("（") + Math.round(next.cf.limit / 60) + T("分）　自動で 始まります");
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
  const rows = ex.sections.map((s) => "<tr><td>" + s.name + "</td><td>" + s.correct + " / " + s.N + "</td><td><b>" + s.score + T("</b>／") + s.full + T("<small>（合格 ") + s.pass + T("）</small></td><td>") + fmtClock(s.sec) + '</td><td class="' + (s.ok ? "ok" : "ng") + '">' + (s.ok ? T("◎ 合格") : "×") + "</td></tr>").join("");
  let msg = '<div class="ex-result-h">' + (pass ? "🎉 <b>" + ex.grade.key + " " + track.name + T(" ごうかく！</b>") : T("<b>不合格</b>　もう少し！")) + "</div>" +
    T('<table class="rec-table ex-table"><tr><th>しゅもく</th><th>せいかい</th><th>点</th><th>タイム</th><th></th></tr>') + rows + "</table>" +
    T('<p class="sub">自宅受験（') + rec.d + T("）。") + (pass ? T("合格証には「自宅受験」と 入ります。") : T("まちがえ方は 下に 出ます。にがてを 直して もう一度！")) + "</p>";
  ex.sections.forEach((s) => { msg += '<div class="ex-sec"><b>' + s.name + "</b>" + missReportHTML(s.items) + "</div>"; });
  let gold = 0;
  ex.sections.forEach((s) => { gold += goldForSection({ correct: s.correct, N: s.N, bestUpdated: false, completed: true, grade: ex.grade, subj: s.subj, count: dailyCount("exam_" + ex.grade.key) }).g; });
  dailyCount("exam_" + ex.grade.key, true);
  if (pass) gold += Math.round(100 * gradeGoldMult(ex.grade));
  addGold(gold);
  solomonAfterStudy();               // 🐣 SK検定 合格は Lv.5 の 条件（★には 数えない）
  msg += T('<div class="gold-earn"><img class="ico-coin" src="assets/coin.png" alt="" /> <b>＋') + gold + " GOLD</b>" + (pass ? T('<div class="gold-lines">🏅 検定 合格 ボーナス</div>') : "") + "</div>";
  msg += T('<br><button id="exAgainBtn">もう一度</button> <button id="exBackBtn" class="ghost">検定の 画面へ</button>');
  msg = '<div class="result-hero"><img class="rh-face" src="assets/' + (pass ? "king_celebrate.png" : "king_wave.png") + T('" alt="レオ王" />') +
    (pass ? T('<span class="rh-badge"><span class="badge-chip perfect">🏅 SK検定 ごうかく！</span></span>') : "") + "</div>" + msg;
  $("#playRest").classList.add("hidden");
  $("#playProblemWrap").classList.remove("hidden");
  $("#playProblem").textContent = T("おつかれさま！");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden");
  $("#playResult").innerHTML = msg; $("#playResult").className = "result " + (pass ? "ok" : "ng");
  $("#playGrade").textContent = T("🏅 SK検定 ") + ex.grade.key + " " + track.name + T("：けっか"); $("#playProgress").textContent = ""; $("#playTimer").textContent = "";
  renderProfile();
  if (pass) { fxCelebrate(3, "🏅 " + ex.grade.key + " " + track.name + T(" ごうかく！"), T("SK検定 合格 おめでとう！")); bigFanfareSnd(); certify(ex.grade.key, "sk-" + ex.track); }
  else fxCheer(T("あと すこし…"), T("ぜんぶの しゅもくで 合格点を とろう"));
  coinSnd(1.0);
  $("#exAgainBtn").onclick = () => { examState = { grade: ex.grade, track: ex.track, steps: ex.steps, idx: 0, sections: [] }; runExamStep(); };
  $("#exBackBtn").onclick = () => { showView("kentei"); setActiveNav(document.querySelector('.nav[data-view="kentei"]')); };
}
function renderExamHistory() {
  const box = $("#exHist"); if (!box) return;
  const list = allExams().slice().reverse().slice(0, 30);
  if (!list.length) { box.innerHTML = T('<p class="sub">まだ 受けていません。合格すると 合格証が もらえて、「記録を見る」にも ならびます。</p>'); return; }
  box.innerHTML = T('<table class="rec-table ex-table"><tr><th>日</th><th>級</th><th>検定</th><th>けっか</th><th>点</th></tr>') +
    list.map((r) => "<tr><td>" + r.d + "</td><td>" + r.g + "</td><td>" + ((EXAM_TRACKS[r.track] || {}).name || r.track) + '</td><td class="' + (r.pass ? "ok" : "ng") + '">' + (r.pass ? T("◎ 合格") : "×") + "</td><td>" +
      r.sections.map((s) => subjName(s.subj) + " " + s.score).join(T("／")) + "</td></tr>").join("") + "</table>";
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
  if (!v) { try { localStorage.removeItem(HW_KEY); } catch (e) { } }   // 教室を ぬけたら 宿題も 消す
  renderJoin();
  renderHomework();
  if (!v && CUR && CUR.id !== "sk") setTimeout(() => location.reload(), 800);   // 教室を ぬけたら 標準の 級に もどす
}
/* 教室の「級の基準」が 先生の 画面で 変わっていたら、端末に 覚えなおして 読みなおす（練習中は 待つ） */
async function syncClassPreset(S) {
  const cl = classLink(); if (!cl) return;
  try {
    const c = await S.getClass(cl.cid); if (!c) return;
    const preset = c.preset || "sk", curr = preset === "custom" ? (c.curriculum || null) : null;
    if (preset === (cl.preset || "sk") && JSON.stringify(curr) === JSON.stringify(cl.curriculum || null)) return;
    cl.preset = preset; cl.curriculum = curr; localStorage.setItem(CLASSLINK, JSON.stringify(cl));
    if (!session && !document.body.classList.contains("playing")) location.reload();
  } catch (e) { }
}
/* ---------- 先生からの 宿題 ----------
   先生画面で 出した 宿題を 読んで、この端末に とっておく（通信できない ときも 見える）。
   できた数は この端末の 記録から 数え、記録と いっしょに 先生へ おくる。 */
const HW_KEY = "soroban_hw";
const hwCache = () => { try { return JSON.parse(localStorage.getItem(HW_KEY) || "[]"); } catch (e) { return []; } };
function hwDoneLocal(h) { return allSessions().filter((e) => (e.t || 0) >= (h.createdAt || 0) && e.subj === h.subj && e.g === h.g).length; }
async function fetchHomework() {
  const cl = classLink(); if (!cl) return [];
  try {
    const S = await loadStore();
    const list = await S.listHomework(cl.cid);
    try { localStorage.setItem(HW_KEY, JSON.stringify(list)); } catch (e) { }
    renderHomework();
    return list;
  } catch (e) { console.error("宿題を 読めませんでした", e); return hwCache(); }
}
// 宿題の「▶ やる」：その級・しゅもくに 合わせて、ふつうの 練習を 始める（記録も ふつうに 残る）
function hwStart(h) {
  const gi = GRADES.findIndex((g) => g.key === h.g);
  if (gi >= 0) gradeIdx = gi;
  subject = h.subj;
  if (!difficulty(currentGrade(), subject)) { alert(T("この級には ") + ((SUBJECT[subject] && SUBJECT[subject].name) || subject) + T(" が ありません。先生に つたえてね。")); return; }
  renderGrid(); updateInfo();
  setActiveNav(document.querySelector('.nav[data-view="grades"]'));
  startWithTips(subject);
}
function renderHomework() {
  const boxes = [$("#homeHw"), $("#joinHw")].filter(Boolean);
  const list = classLink() ? hwCache() : [];
  const td = today();
  boxes.forEach((box) => {
    if (!list.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    box.classList.remove("hidden");
    box.innerHTML = T('<div class="hw-h">📨 先生からの 宿題</div>') + list.map((h, i) => {
      const done = hwDoneLocal(h), ok = done >= h.sets;
      const name = (SUBJECT[h.subj] && SUBJECT[h.subj].name) || h.subj;
      let due = "";
      if (h.due && !ok) { const m = h.due.split("-"); due = "　" + (+m[1]) + "/" + (+m[2]) + T(" まで") + (h.due < td ? T(' <span class="hw-late">きげん すぎ！</span>') : ""); }
      return '<div class="hw-row' + (ok ? " ok" : "") + '"><span class="hw-t"><b>' + jesc(name) + " " + jesc(h.g) + T("</b> を ") + h.sets + T(" セット") +
        (h.note ? T("<br><small>先生から：") + jesc(h.note) + "</small>" : "") + "</span>" +
        '<span class="hw-p">' + (ok ? T("✅ できた！") : T("あと ") + (h.sets - done) + T(" セット") + due) + "</span>" +
        (ok ? "" : '<button class="hw-go" data-i="' + i + T('">▶ やる</button>')) + "</div>";
    }).join("") + T('<div class="hw-sub">やった ぶんは 自動で 先生に とどくよ。</div>');
    box.querySelectorAll(".hw-go").forEach((b) => { b.onclick = () => hwStart(list[+b.dataset.i]); });
  });
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
    s.onload = ok; s.onerror = () => ng(new Error(T("読みこめません：") + src));
    document.head.appendChild(s);
  });
  storeLoading = FB_SRC.reduce((p, src) => p.then(() => one(src)), Promise.resolve())
    .then(() => window.SKStore)
    .catch((e) => { storeLoading = null; throw e; });
  return storeLoading;
}
/* ============================================================ 🏆 ランキング（月ごと・世界／国内／教室）
   ・出すのは「今月の 正解数」（級に 関係なく 同じ ものさし）。本名は 集めない。教室名は 任意
   ・参加は 本人（保護者）が このページで オンに したときだけ。Firestore ranking/{月}/rows/{端末のuid}
   ・自分の 行は この端末の 記録から 毎回 計算して 送る（ズルが しにくい・二重に 数えない） */
const RANK_KEY = "soroban_ranking";   // { on, country, cls }（"soroban_rank" は 認定級の 保存に 使っているので 別の名前）
const RANK_COUNTRIES = [["JP", T("日本")], ["US", T("アメリカ")], ["CA", T("カナダ")], ["MY", T("マレーシア")], ["SG", T("シンガポール")], ["IN", T("インド")],
  ["AE", "UAE"], ["SA", T("サウジアラビア")], ["GB", T("イギリス")], ["AU", T("オーストラリア")], ["TH", T("タイ")], ["PH", T("フィリピン")],
  ["ID", T("インドネシア")], ["VN", T("ベトナム")], ["KR", T("韓国")], ["TW", T("台湾")], ["CN", T("中国")], ["BR", T("ブラジル")], ["MX", T("メキシコ")], ["ES", T("スペイン")], ["ZZ", T("そのほか")]];
const rankCfg = () => { try { return Object.assign({ on: false, country: "JP", cls: "" }, JSON.parse(localStorage.getItem(RANK_KEY) || "{}")); } catch (e) { return { on: false, country: "JP", cls: "" }; } };
const rankSave = (c) => { try { localStorage.setItem(RANK_KEY, JSON.stringify(c)); } catch (e) { } };
const rankMonth = () => today().slice(0, 7);
const rankFlag = (cc) => (cc && cc !== "ZZ" && /^[A-Z]{2}$/.test(cc)) ? String.fromCodePoint(...[...cc].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65)) : "🌐";
const rankCountryName = (cc) => (RANK_COUNTRIES.find((x) => x[0] === cc) || ["", cc])[1];
// 自分の 行（今月の 記録から。たいせんは 数えない）
function rankMine() {
  const c = rankCfg(), m = rankMonth();
  const ss = allSessions().filter((e) => (e.d || "").startsWith(m) && e.src !== "battle");
  const fb = bestPerSubject().flash;
  let r = null; try { r = JSON.parse(localStorage.getItem(RANK) || "null"); } catch (e) { }
  return {
    nick: String(profile().name || "").trim().slice(0, 20) || T("そろ太くん"),
    country: /^[A-Z]{2}$/.test(c.country) ? c.country : "JP",
    cls: String(c.cls || "").trim().slice(0, 30),
    correct: ss.reduce((a, e) => a + (e.correct || 0), 0),
    sessions: ss.length,
    days: new Set(ss.map((e) => e.d)).size,
    flashBest: fb != null ? Math.round(fb * 100) / 100 : 0,
    grade: r && r.key ? String(r.key).slice(0, 4) : "",
    updatedAt: Date.now(),
  };
}
let rankTimer = null, rankLastSent = "";
// 練習が 終わるたびに 呼ぶ。少し 待ってから まとめて 送る（連続で 終わっても 1回）
function rankSyncSoon() { if (!rankCfg().on) return; clearTimeout(rankTimer); rankTimer = setTimeout(rankSync, 1500); }
async function rankSync() {
  if (!rankCfg().on) return false;
  try {
    const S = await loadStore(); const d = rankMine();
    const key = JSON.stringify([d.nick, d.country, d.cls, d.correct, d.sessions, d.days, d.flashBest, d.grade]);
    if (key === rankLastSent) return true;
    await S.rankUpsert(rankMonth(), d); rankLastSent = key; return true;
  } catch (e) { console.warn("ランキングに 送れませんでした", e); return false; }
}
let rankTab = "world";
function rankSetupHTML(c) {
  const opts = RANK_COUNTRIES.map((x) => `<option value="${x[0]}"${x[0] === c.country ? " selected" : ""}>${rankFlag(x[0])} ${x[1]}</option>`).join("");
  const fields = T("<label>国 <select id=\"rankCountry\">{opts}</select></label>", { opts }) +
    T("<label>教室名（なくても よい）<input id=\"rankCls\" maxlength=\"30\" placeholder=\"例：○○そろばん教室\" value=\"{v1}\" /></label>", { v1: jesc(c.cls || "") });
  if (!c.on) return T("<div class=\"rank-setup\"><div class=\"rank-setup-t\">🏆 参加すると、あなたの にっくねーむ「<b>{v1}</b>」と 今月の 正解数が、世界の みんなと ならびます。</div>{fields}<button id=\"rankJoin\">参加する</button></div>", { v1: jesc(profile().name || ""), fields });
  return T("<div class=\"rank-setup\"><div class=\"rank-setup-t\">✅ 参加中：<b>{v1}</b></div>{fields}<button id=\"rankSaveBtn\" class=\"ghost\">変更を 保存</button><button id=\"rankLeave\" class=\"ghost\">やめる（行を 消す）</button></div>", { v1: jesc(profile().name || ""), fields });
}
async function renderRanking() {
  const box = $("#rankList"), setup = $("#rankSetup"), me = $("#rankMe"); if (!box) return;
  const c = rankCfg();
  setup.innerHTML = rankSetupHTML(c);
  const readCfg = () => ({ on: c.on, country: $("#rankCountry").value, cls: String($("#rankCls").value || "").trim().slice(0, 30) });
  const join = $("#rankJoin"); if (join) join.onclick = async () => { const n = readCfg(); n.on = true; rankSave(n); rankLastSent = ""; join.disabled = true; join.textContent = T("送っています…"); const ok = await rankSync(); if (!ok) { alert(T("いま つながりません。あとで もう一度 ためしてください")); } renderRanking(); };
  const sv = $("#rankSaveBtn"); if (sv) sv.onclick = async () => { rankSave(readCfg()); rankLastSent = ""; sv.textContent = T("保存しました"); await rankSync(); renderRanking(); };
  const lv = $("#rankLeave"); if (lv) lv.onclick = async () => { if (!confirm(T("ランキングから 抜けますか？（あなたの 行を 消します。記録は 消えません）"))) return; const n = readCfg(); n.on = false; rankSave(n); try { const S = await loadStore(); await S.rankRemove(rankMonth()); } catch (e) { } rankLastSent = ""; renderRanking(); };
  $$("#rankTabs button").forEach((b) => { b.classList.toggle("on", b.dataset.t === rankTab); b.onclick = () => { rankTab = b.dataset.t; renderRanking(); }; });
  const cb = $('#rankTabs button[data-t="country"]'); if (cb) cb.textContent = rankFlag(c.country) + T(" 国内");
  box.innerHTML = T('<div class="sub">読みこみ中…</div>'); me.textContent = "";
  let rows = [], uid = "";
  try { const S = await loadStore(); if (c.on) await rankSync(); rows = await S.rankTop(rankMonth(), 300); uid = S.rankUid(); }
  catch (e) { box.innerHTML = T('<div class="sub">いま ランキングを 読めません（通信を 確かめてください）</div>'); return; }
  if (rankTab === "country") rows = rows.filter((r) => r.country === c.country);
  if (rankTab === "cls") {
    if (!c.cls) { box.innerHTML = T('<div class="sub">上の「教室名」を 入れて 保存すると、同じ 教室名の 子と くらべられます。</div>'); return; }
    rows = rows.filter((r) => (r.cls || "") === c.cls);
  }
  rows.sort((a, b) => (b.correct || 0) - (a.correct || 0) || (a.updatedAt || 0) - (b.updatedAt || 0));
  const myIdx = rows.findIndex((r) => r.uid === uid);
  if (c.on) me.textContent = myIdx >= 0 ? T("あなたは {v1}位（今月 {v2}問 正解）", { v1: myIdx + 1, v2: rows[myIdx].correct }) : T("あなたは まだ 300位より 下（今月 {v1}問 正解）。れんしゅうすると 上がるよ", { v1: rankMine().correct });
  else me.textContent = "";
  if (!rows.length) { box.innerHTML = T('<div class="sub">まだ だれも いません。いちばん 最初に 参加してみよう！</div>'); return; }
  box.innerHTML = rows.slice(0, 100).map((r, i) => {
    const no = i + 1, medal = no === 1 ? "🥇" : no === 2 ? "🥈" : no === 3 ? "🥉" : no + T("位");
    return `<div class="rank-row${r.uid === uid ? " me" : ""}"><span class="rank-no${no <= 3 ? " top" : ""}">${medal}</span><span class="rank-flag" title="${jesc(rankCountryName(r.country))}">${rankFlag(r.country)}</span>` +
      `<span class="rank-nick">${jesc(r.nick || "")}${r.grade ? `<small>${jesc(r.grade)}</small>` : ""}${r.cls ? `<small>🏫 ${jesc(r.cls)}</small>` : ""}</span><span class="rank-val">${(r.correct || 0).toLocaleString()}問</span></div>`;
  }).join("");
}
// 開いたとき 参加中なら 今月の 行を 新しくしておく（前の月の ぶんは 送らない＝月が かわると 0から）
setTimeout(() => { if (rankCfg().on) rankSyncSoon(); }, 5000);

function renderJoin() {
  const box = $("#joinBox"); if (!box) return;
  const cl = classLink();
  if (cl) {
    box.innerHTML = '<div class="join-on"><div class="join-on-h">🏫 ' + jesc(cl.className) + T(" に 参加中</div>") +
      T("<p>あなたの 名前：<b>") + jesc(cl.nick) + T("</b>　／　級の基準：<b>") + jesc(T((CUR && CUR.name) || "標準")) + T("</b>（") + GRADES.length + T("段階）</p>") +
      T('<p class="sub">れんしゅうの きろくは、先生の 画面に とどきます。まちがえ方の クセも 先生が 見て、つぎの 宿題を 決めます。</p>') +
      '<div id="joinSync" class="sub"></div>' +
      T('<div class="btn-row"><button id="joinPush">↻ いま おくる</button><button id="joinLeave" class="ghost">教室から ぬける</button></div></div>') +
      '<div id="joinHw" class="hw-box hidden"></div>';
    $("#joinPush").onclick = () => fetchHomework().then(() => pushToClass(true));
    renderHomework();
    $("#joinLeave").onclick = () => { if (confirm(T("教室から ぬけます。この端末の れんしゅうの きろくは 消えません。よろしいですか？"))) setClassLink(null); };
    return;
  }
  box.innerHTML = T('<p class="sub">そろばん教室で もらった <b>クラスコード</b>（6文字）を 入れてね。おうちで れんしゅうすると、先生が 見てくれます。<br>') +
    T("コードが ない人は 入らなくて だいじょうぶ。ふつうに ぜんぶ あそべます。</p>") +
    T('<p><button type="button" id="joinSpeak" class="ghost">🔊 よみあげる</button></p>') +
    '<div class="join-row"><input id="joinCode" type="text" inputmode="latin" autocapitalize="characters" maxlength="6" placeholder="ABC123" />' +
    T('<button id="joinGo">つぎへ</button></div><div id="joinMsg" class="result"></div><div id="joinPick"></div>');
  const inp = $("#joinCode");
  const js = $("#joinSpeak");
  if (js) js.onclick = () => {
    if (!("speechSynthesis" in window)) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(T("そろばん教室で もらった クラスコード 6文字を 入れて、つぎへ を おしてね。そのあと、じぶんの 名前を えらぶと、先生に れんしゅうが とどくよ。コードが ない人は 入らなくて だいじょうぶ。")); u.lang = "ja-JP"; u.rate = 0.92; window.speechSynthesis.speak(u); } catch (e) { }
  };
  inp.addEventListener("input", () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#joinGo").click(); });
  $("#joinGo").onclick = joinStep1;
}
async function joinStep1() {
  const code = ($("#joinCode").value || "").trim().toUpperCase();
  const msg = $("#joinMsg"), pick = $("#joinPick");
  pick.innerHTML = ""; msg.className = "result";
  if (code.length !== 6) { msg.textContent = T("コードは 6文字だよ"); msg.className = "result ng"; return; }
  msg.textContent = T("しらべています…");
  let S;
  try { S = await loadStore(); } catch (e) { msg.textContent = T("つうしんが できません。電波を たしかめて、もう一度 おしてね。"); msg.className = "result ng"; return; }
  try {
    const c = await S.resolveCode(code);
    if (!c) { msg.textContent = T("その コードの 教室が 見つかりません。先生に たしかめてね。"); msg.className = "result ng"; return; }
    const list = await S.listStudents(c.id);
    if (!list.length) { msg.textContent = T("この 教室には まだ 名前が 登録されていません。先生に たのんでね。"); msg.className = "result ng"; return; }
    msg.textContent = "🏫 " + c.name + T("　じぶんの 名前を えらんでね"); msg.className = "result ok";
    pick.innerHTML = '<div class="join-names">' + list.map((s, i) => '<button class="join-name" data-i="' + i + '">' + jesc(s.nick) + "</button>").join("") + "</div>";
    $$("#joinPick .join-name").forEach((b) => {
      b.onclick = async () => {
        const s = list[+b.dataset.i];
        try {
          const j = await S.joinClass(c.id, s.id);
          // サーバーに もう ある記録は 送らない（入り直しても 二重に ならない）
          setClassLink({ cid: c.id, sid: s.id, className: c.name, nick: s.nick, preset: c.preset || "sk", curriculum: c.preset === "custom" ? (c.curriculum || null) : null, sent: (j && j.latest) || 0 });
          fxCelebrate(2, "🏫 " + c.name + T(" に 参加したよ！"), s.nick + T(" として れんしゅうを おくります"));
          fetchHomework().then(() => pushToClass(false));
          // 教室の 級の基準が いまの 表と ちがえば、読みなおして その表に する
          if ((c.preset || "sk") !== (CUR && CUR.id)) setTimeout(() => location.reload(), 2500);
        } catch (e) { msg.textContent = T("参加できませんでした：") + ((e && e.message) || e); msg.className = "result ng"; }
      };
    });
  } catch (e) { msg.textContent = T("うまく いきませんでした。もう一度 おしてね。"); msg.className = "result ng"; console.error(e); }
}
/* 記録を 先生に おくる。おくったところまでを sent に 覚えて、同じものを 二度 おくらない */
let pushTimer = null, pushing = false;
async function pushToClass(loud) {
  const cl = classLink(); if (!cl || pushing) return;
  const note = $("#joinSync");
  const all = allSessions(), fresh = all.filter((e) => (e.t || 0) > (cl.sent || 0));
  // 宿題が 新しく 出ていたら、記録が 無くても「できた数」だけは おくり直す
  const hws = hwCache(), hwSig = hws.map((h) => h.id).join(",");
  if (!fresh.length && hwSig === (cl.hwSig || "")) { if (loud && note) note.textContent = T("おくるものは ありません（ぜんぶ とどいています）"); return; }
  pushing = true;
  if (note) note.textContent = T("おくっています…");
  try {
    const S = await loadStore();
    // 🎯 進級の めやす（級・合格の めやす%・受けられそうか）も 先生へ（先生画面の「要フォロー／苦戦中／進級候補」に 使う）
    let extra = {};
    try { const g = readyTargetGrade(); const tr = g && (examSteps(g, "soroban").length ? "soroban" : examSteps(g, "anzan").length ? "anzan" : ""); const R = tr ? readiness(g, tr) : null;
      if (R && R.pct != null) extra = { ready: { g: g.key, track: tr, pct: R.pct, ok: !!R.ready, rows: R.rows.map((r) => ({ s: r.subj, none: !!r.none, acc: r.acc || 0, need: r.need || 0, a: !!r.accOk, sp: !!r.speedOk })) } }; } catch (e) { }
    await S.pushSessions(cl.cid, cl.sid, fresh.slice(-200), all, hws, extra);
    if (fresh.length) cl.sent = Math.max.apply(null, fresh.map((e) => e.t || 0));
    cl.hwSig = hwSig;
    try { localStorage.setItem(CLASSLINK, JSON.stringify(cl)); } catch (e) { }
    if (note) note.textContent = fresh.length ? "✓ " + fresh.length + T("件 とどきました") : T("✓ とどいています");
  } catch (e) {
    console.error("先生への 送信に 失敗", e);
    if (note) note.textContent = T("いまは おくれませんでした。つぎに ひらいたとき もう一度 ためします。");
  } finally { pushing = false; }
}
// 練習が おわるたび、少し待ってから まとめて おくる（連続で 通信しない）
function schedulePush() {
  if (!classLink()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushToClass(false), 4000);
}

/* ---------- 教室に 入っている子は、ひらいたときに 宿題を 読んで、おくり残しを おくる ---------- */
if (classLink()) setTimeout(function () { fetchHomework().then(() => pushToClass(false)).then(() => loadStore().then(syncClassPreset)).catch(() => { }); }, 3000);

/* ============================================================ 🐣 ソロモン（そろばんの 相棒）
   ★ 成長は GOLD ではなく「そろばんの 記録」だけから、ひらくたびに 計算する。
     数えるもの  ：練習の 記録（練習の 完走・本日の練習・フラッシュ暗算）＝ src の 無い 記録
     数えないもの：パズル（記録が 無い）・たいせん（src:"battle"）・SK検定（src:"exam"。Lv.5 の 条件にだけ 使う）
   ★ 保存するのは「出会った日・読んだ話・とどいた段階・言った特別なセリフ」だけ。段階は 下がらない。
   ★ ソロモンは「ゲームの キャラ」ではなく「そろばんを いっしょに がんばる 相棒」。
     段階ごとに 性格と 言葉が 変わる（レベル上げ でなく 物語）。 */
const SOLO_KEY = "soroban_solomon";
/* オフスイッチ：物語や ゲームの 感じが いやな子は 設定で 切れる。
   切っても 記録は ふつうに 数えつづける（あとで オンに すると そのまま 成長が 出る） */
const STORY_KEY = "soroban_story";
const storyOn = () => { try { return localStorage.getItem(STORY_KEY) !== "off"; } catch (e) { return true; } };
function setStoryOn(on) {
  try { localStorage.setItem(STORY_KEY, on ? "on" : "off"); } catch (e) { }
  renderSolomonCard();
  const m = $("#saveMsg"); if (m) m.textContent = on ? T("ソロモンと 物語を つかいます") : T("ソロモンと 物語を 出さないように しました");
}
function soloState() { try { return Object.assign({ met: "", seen: {}, lv: 0, said: {} }, JSON.parse(localStorage.getItem(SOLO_KEY) || "{}")); } catch (e) { return { met: "", seen: {}, lv: 0, said: {} }; } }
function soloSave(s) { try { localStorage.setItem(SOLO_KEY, JSON.stringify(s)); } catch (e) { console.error("ソロモンの 保存に 失敗", e); } }
const SOLO_SUBJ = ["mitori", "kake", "wari", "anzan", "flash"];
const SOLO_SUBJ_NAME = { mitori: T("みとり力"), kake: T("かけ算力"), wari: T("わり算力"), anzan: T("暗算力"), flash: T("フラッシュ力") };
const SOLO_STAR = [20, 50, 100, 200, 400];                        // しゅもく別 ★：その しゅもくの 正解数
// 数えるのは「ソロモンと 出会った日」からの 記録だけ（前から 使っていた子も、みんな Lv.1 から いっしょに 始まる）
const soloMet = () => soloState().met || "";
const studySessions = () => { const met = soloMet(); return allSessions().filter((e) => !e.src && SOLO_SUBJ.includes(e.subj) && (!met || (e.d || "") >= met)); };
// いまの そろばんの 記録を まとめる（毎回 計算＝ズルが できない・二重に 数えない）
function soloStats() {
  const ss = studySessions(), met = soloMet();
  const correct = ss.reduce((a, e) => a + (e.correct || 0), 0);
  const days = new Set(ss.map((e) => e.d).filter(Boolean)).size;              // そろばんを やった 日の 数（連続でなくて よい）
  const recent = ss.slice(-30), rN = recent.reduce((a, e) => a + (e.N || 0), 0), rC = recent.reduce((a, e) => a + (e.correct || 0), 0);
  const bySubj = {}; SOLO_SUBJ.forEach((k) => { bySubj[k] = 0; }); ss.forEach((e) => { bySubj[e.subj] += e.correct || 0; });
  let routines = 0; try { routines = JSON.parse(localStorage.getItem(ROUTINE) || "[]").filter((h) => !met || (h.date || "") >= met).length; } catch (e) { }
  const rk = myRankIdx();
  return { sets: ss.length, routines, correct, days, streak: loadStat().streak || 0, acc30: rN ? Math.round((rC / rN) * 100) : 0,
    rank: rk >= 0, dan: rk >= 0 && !!GRADES[rk] && GRADES[rk].band === "dan", examPass: allExams().some((x) => x.pass), bySubj, todayDone: ss.some((e) => e.d === today()) };
}
const soloStars = (n) => SOLO_STAR.filter((t) => n >= t).length;
const starStr = (n, max) => "★".repeat(n) + "☆".repeat((max || 5) - n);
const pickToday = (arr) => arr[new Date().getDate() % arr.length];       // その日は 同じ セリフ（開くたびに 変わらない）
/* 5つの 段階。ok＝その段階に なる 条件、need＝あと どれだけか、talk＝その段階の 性格・言葉 */
const SOLO_LEVELS = [
  { lv: 1, name: T("ちいさなソロモン"), em: "🐣", cond: T("練習を 1回 やりきる"),
    ok: (s) => s.sets >= 1 || s.routines >= 1, need: () => T("練習を 1回 やりきろう"),
    talk: [T("はじめまして！ ぼく、ソロモン。"), T("数字って、ちょっと ドキドキする…でも きみと なら やってみる！")],
    after: [T("できた！ 数字、こわくなかった！"), T("また あしたも いっしょに やろうね！")] },
  { lv: 2, name: T("そろばんを おぼえた ソロモン"), em: "🧮", cond: T("練習を 3回"),
    ok: (s) => s.sets >= 3, need: (s) => T("🌲 森の奥への 道：あと ") + Math.max(1, 3 - s.sets) + T("回 練習"),
    talk: [T("そろばんって おもしろい！"), T("パチパチって 音が すき！ きょうも やろう！")],
    after: [T("きょうも パチパチ できたね！"), T("そろばんが あると 数字が わかりやすいね！")] },
  { lv: 3, name: T("計算が とくいに なった ソロモン"), em: "💪", cond: T("正解 100問 と、練習した日 3日"),
    ok: (s) => s.correct >= 100 && s.days >= 3,
    need: (s) => T("🚪 森の扉：") + [s.correct < 100 ? T("正解 あと ") + (100 - s.correct) + T("問") : "", s.days < 3 ? T("練習する日 あと ") + (3 - s.days) + T("日") : ""].filter(Boolean).join(T("・")),
    talk: [T("まちがえても、もう一回 やってみる！"), T("むずかしい 問題も、やってみたら できるかも！")],
    after: [T("できた！ まちがえても だいじょうぶ だったね！"), T("きょうの ぶんも できた！ つよくなってる！")] },
  { lv: 4, name: T("仲間を たすけられる ソロモン"), em: "🤝", cond: T("7日 つづける（または 正解300問 で 正答率85%）"),
    ok: (s) => s.streak >= 7 || (s.correct >= 300 && s.acc30 >= 85),
    need: (s) => T("🏔 山の道：つづけて あと ") + Math.max(1, 7 - s.streak) + T("日") + (s.correct < 300 ? T("（または 正解 あと ") + (300 - s.correct) + T("問 で 正答率85%）") : ""),
    talk: [T("こんどは ぼくが 仲間を たすける！"), T("きみが がんばるから、ぼくも がんばれる！")],
    after: [T("きょうも ありがとう！ 仲間が ふえた 気がする！"), T("きみと なら、数の乱れも こわくない！")] },
  { lv: 5, name: T("一人前の そろばん仲間"), em: "👑", cond: T("級に 合格（けんてい方式）か、SK検定に 合格"),
    ok: (s) => s.rank || s.examPass, need: () => T("🏰 王国の門：級に 合格しよう（けんてい方式 か SK検定）"),
    talk: [T("ぼく、一人前の そろばん仲間に なれたよ！"), T("つぎは どこへ 行こうかな！")],
    after: [T("きょうも いっしょに できて うれしい！"), T("一人前でも、れんしゅうは つづけるんだ！")] },
];
// いまの 段階：下から 順に 条件を 見て、とぎれた ところまで。前に とどいた 段階より 下がらない
function soloLevel(s, st) {
  let lv = 0;
  for (const L of SOLO_LEVELS) { if (L.ok(s)) lv = L.lv; else break; }
  return Math.max(lv, (st || soloState()).lv || 0);
}
function soloTitle(lv) { const L = SOLO_LEVELS[lv - 1]; return L ? L.em + " Lv." + lv + " " + L.name : T("🥚 まだ 出会っていない"); }
// つぎの 段階までの ヒント
function soloNext(s, lv) { const L = SOLO_LEVELS[lv]; return L ? L.need(s) : T("🌍 もう 一人前！ これからも いっしょに"); }
// ホームの 吹き出し。段階と きょうの 様子で 変わる
function soloSpeech(s, lv) {
  if (lv === 0) return T("そろばん、いっしょに やってみる？");
  const L = SOLO_LEVELS[lv - 1];
  if (s.days >= 30 && s.todayDone) return T("きみと なら、どんな 数字も だいじょうぶ！");
  if (s.streak >= 7 && s.todayDone) return T("今日も 来てくれた！ ") + s.streak + T("日 つづいてるね！");
  if (s.streak >= 7) return T("今日も 来てくれた！ いっしょに やろう！");
  return pickToday(s.todayDone ? L.after : L.talk);
}
/* 絵：docs/assets/solomon/{pose}.png（front / side / soroban / happy / cry / angry / run / friends / zukan / story）。
   無ければ 🐣 で 代わりを 出す（絵が 届いたら 置くだけで 変わる） */
const SOLO_IMG_VER = "?v=3";   // 絵（ポーズ・漫画のコマ）を 入れかえたら 上げる（端末に 残った 古い絵を 使わせない）
function soloPic(pose, cls) {
  // その ポーズの 絵が 無ければ 正面（front）を 使い、それも 無ければ 🐣
  return '<span class="solo-pic ' + (cls || "") + '"><img src="assets/solomon/' + (pose || "front") + '.png' + SOLO_IMG_VER + T('" alt="ソロモン" ') +
    'onerror="if(!this.dataset.f){this.dataset.f=1;this.src=\'assets/solomon/front.png' + SOLO_IMG_VER + '\'}else{this.parentNode.classList.add(\'nopic\')}"><i>🐣</i></span>';
}
/* 物語（1話 30秒〜1分）。lv＝その段階に なったとき 読める（0＝はじめて ホームを 開いたとき）
   scene＝場面の絵 docs/assets/solomon/scene_N.png（「はじまりの物語」の 6コマ：1出会い 2一緒に練習 3仲間が増える 4数の乱れ 5みんなで立ち向かう 6もっと大きな世界へ）。
   絵が 無い間は、空と 草原の 背景の 上に ソロモンを 置く */
const SOLO_EPISODES = [
  // 第1話は 16コマ漫画（scene_1_1〜1_16）。「つぎへ」で 1コマずつ 進む＝アニメのように 見える
  { id: "ep1", n: T("第1話"), t: T("出会い"), lv: 0, scene: 1, lines: [
    { who: "", scene: "1_1", text: T("ある日のこと。ぼくは、そろばんの 練習道具を 持って、森の 近くまで やってきた。") },
    { who: "", scene: "1_2", text: T("森の 入り口に 足を ふみ入れると、木々の すき間から やさしい 光が 差しこんできた。") },
    { who: "", scene: "1_3", text: T("鳥の さえずり、葉っぱが ゆれる 音。森は とても 静かで、きれいだった。") },
    { who: "", scene: "1_4", text: T("少し 歩くと、切り株の 上に、小さな 生きものが すわっていた。") },
    { who: T("ソロモン"), scene: "1_5", text: T("ソロモンは、ぼくを じっと 見つめてきた。「きみ… そろばん、持ってるの？」") },
    { who: T("きみ"), scene: "1_6", text: T("ぼくは、少し どきどき しながら うなずいた。「うん！ ぼく、そろばんが 好きなんだ！」") },
    { who: T("ソロモン"), scene: "1_7", text: T("ソロモンは そろばんに きょうみを 持ったようで、前あしで そっと 玉を さわってみた。「これは… なんだろう？」") },
    { who: "", scene: "1_8", text: T("ソロモンが 玉を 動かすと、心地よい 音が 森に ひびいた。パチ、パチ。「わぁ…！ いい音…！」") },
    { who: T("きみ"), scene: "1_9", text: T("ぼくも そろばんを 手に 取り、ゆっくりと 玉を はじいてみた。「こうやって 動かすんだよ。」") },
    { who: "", scene: "1_10", text: T("ソロモンは まねを して、何度も 玉を 動かした。「すごい！ 上手だよ！」「もう一回！ もう一回！」") },
    { who: T("きみ"), scene: "1_11", text: T("ぼくは、そろばんで できることを、少しずつ 教えてあげた。「こうやって 数を 表すんだよ。1、2、3…！」") },
    // 📖 ここで 漫画が 止まり、本物の そろばんで 3問。正解するたびに ソロモンが 反応する
    { who: "", scene: "1_11", text: T("ソロモンと いっしょに、そろばんで 3問 やってみよう！ まちがえても だいじょうぶ。"),
      practice: { n: 3, subj: "mitori", label: T("ソロモンと いっしょに 3問"),
        react: [T("ソロモンが 玉を じっと 見ている…"), T("ソロモン「パチ、パチ… いい音！」"), T("ソロモン「わあ！ できた！」")],
        miss: [T("ソロモン「まちがえても だいじょうぶ。もう一回 やってみよう！」"), T("ソロモン「もう一回 やるって、すごいね！」")] } },
    { who: T("ソロモン"), scene: "1_12", text: T("ソロモンは、目を キラキラ させながら、どんどん 夢中に なっていった。「わあ！ たのしい！ もっと やりたい！」") },
    { who: "", scene: "1_13", text: T("気がつくと、まわりには 森の 仲間たちも 集まっていた。「すごいね！」「たのしそう！」") },
    { who: "", scene: "1_14", text: T("夕日が 森を オレンジ色に そめるころ——「こんなに 楽しいものを、みんなにも 伝えたいね。」「うん！ 一緒に やろう！」") },
    { who: "", scene: "1_15", text: T("こうして、ぼくと ソロモンの 特別な 出会いが 始まった。「これから たくさんのことを 一緒に 学ぼう！」「うん！ よろしく！」") },
    { who: "", scene: "1_16", text: T("ここから、ぼくらの ものがたりが はじまる——　そろばんで つながる、もっと 大きな 世界へ。") } ] },
  // 第1話つづきは 6コマ（scene_1b_1〜1b_6）
  { id: "ep1b", n: T("第1話（つづき）"), t: T("できた！"), lv: 1, scene: "1b_1", lines: [
    { who: T("ソロモン"), scene: "1b_1", text: T("「どきどき… ぼくにも できるかな…？」") },
    { who: T("ソロモン"), scene: "1b_2", text: T("「よし… やってみよう！」パチ… パチ…") },
    { who: T("ソロモン"), scene: "1b_3", text: T("「できた！ 数字が こわくなかった！」") },
    { who: T("きみ"), scene: "1b_4", text: T("「やったね、ソロモン！」") },
    { who: "", scene: "1b_5", text: T("パァァ…　ソロモンが、すこし 大きく なった！") },
    { who: "", scene: "1b_6", text: T("ソロモンは 新しい 一歩を ふみ出した。🐣「ちいさなソロモン」——これからも 一緒に ぼうけんしよう！") } ] },
  // 第2話は 16コマ＋END（scene_2_1〜2_16, 2_end）。青い子＝ルート
  { id: "ep2", n: T("第2話"), t: T("青い子の ひみつ"), lv: 2, scene: 2, lines: [
    { who: "", scene: "2_1", text: T("次の日、ぼくと ソロモンは また 森へ やってきた。「よし！ 今日も 練習しよう！」「うん！」") },
    { who: "", scene: "2_2", text: T("すると、どこからか 森に パチパチという 音が 聞こえた。「ん？ あの音は…？」") },
    { who: "", scene: "2_3", text: T("音の する方へ 行ってみると、木の かげで 青い 生きものが そろばんを はじいていた。「わぁ…！ すごい…！ とっても 速い…！」") },
    { who: T("きみ"), scene: "2_4", text: T("気づかれてしまい、青い子は そろばんを かかえて 走り去ってしまった。「まってー！ 話を させて！」") },
    { who: T("ソロモン"), scene: "2_5", text: T("ソロモンも 一緒に 追いかけた。「待ってー！ 一緒に やろうよ！」") },
    { who: T("青い子"), scene: "2_6", text: T("でも、青い子は 立ち止まり、ふり返った。「ぼくは… 一人で いい。」") },
    { who: T("ソロモン"), scene: "2_7", text: T("ソロモンは 首を かしげた。「どうして？ 一緒に やろうよ。楽しいよ！」「……だって 間違えるのが こわいんだ。」") },
    { who: T("青い子"), scene: "2_8", text: T("ぼくは、青い子の 気持ちを 聞いた。「まちがえると すごく くやしくて… せっかく 覚えたのに できなくなるのが こわくて…」") },
    { who: T("ソロモン"), scene: "2_9", text: T("ソロモンは 笑って 言った。「ぼくなんて、昨日 はじめた ばっかりだよ！ まちがえても やりなおせば いいよ！ できたときの ほうが ずっと 楽しいよ！」") },
    { who: T("きみ"), scene: "2_10", text: T("ぼくは、話した。「まちがえるのは だれでも あるよ。いっしょに やれば きっと できる。ぼくたち、仲間だから。」") },
    { who: "", scene: "2_11", text: T("そして、ぼくたちは そろばんを ならべた。「じゃあ、3人で やってみよう！」「……うん。」") },
    { who: "", scene: "2_12", text: T("一つずつ、ゆっくりと 玉を 動かす。パチ… パチ… パチ…") },
    // 📖 ここで 漫画が 止まり、本物の そろばんで 3問。1問 正解→ルートが さわる、2問→少し 笑う、3問→「できたー！！」
    { who: "", scene: "2_11", text: T("ルートと いっしょに、そろばんで 3問 やってみよう。まちがえても だいじょうぶ——それは できるように なるための 道だから。"),
      practice: { n: 3, subj: "mitori", label: T("ルートと いっしょに 3問"),
        react: [T("ルートが そっと そろばんに さわった…"), T("ルートが 少し 笑った！"), T("ルート「……できた！」")],
        miss: [T("ソロモン「だいじょうぶ！ ぼくも 昨日 いっぱい 間違えたよ！」"), T("ルート「もう一回 やるって、ちょっと 勇気が いるんだね。」")] } },
    { who: "", scene: "2_13", text: T("そして——答えが 出た！「できたー！！」") },
    { who: T("青い子"), scene: "2_14", text: T("青い子は、少し てれながら 言った。「……明日は、ぼくが 教えてあげる。もっと 速く できる コツ、教えるね。」") },
    { who: T("ソロモン"), scene: "2_15", text: T("ソロモンは 大喜びした。「やったー！ よろしくね、ルート！」「……うん。いっしょに がんばろう。」") },
    { who: "", scene: "2_16", text: T("3人は、夕ぐれの 森を 歩いて 帰った。「明日も やろうね！」「うん！」") },
    { who: "", scene: "2_end", text: T("第2章 END　空の 向こうから、大きな 何かが やってくる——。") } ] },
  // 第3話は 12コマ（scene_3_1〜3_12）。赤い ドラゴン＝カケルは 仲間に ならず 飛び去る → ホームに「🔒 カケルの谷」
  { id: "ep3", n: T("第3話"), t: T("空を たどる 赤い影"), lv: 3, scene: 3, lines: [
    { who: "", scene: "3_1", text: T("森での 練習を 終えた 帰り道、空に 大きな かげが よぎった。「わぁ…！ あれは…？」") },
    { who: T("きみ"), scene: "3_2", text: T("「すごい…！ あんなに 大きい ドラゴン、はじめて 見たよ！」") },
    { who: "", scene: "3_3", text: T("たどり着いたのは、山の ふもと。そこに 赤い ドラゴンが いた。ゴォォォ…") },
    { who: T("ドラゴン"), scene: "3_4", text: T("「……よく ここまで 来たな、小さな そろばん使いよ。」") },
    { who: T("カケル"), scene: "3_5", text: T("「きみは…？」「私は カケル。この山の 向こうで 王国の 空を 守っている ドラゴンだ。」") },
    { who: T("カケル"), scene: "3_6", text: T("「この世界には、まだ 解決できていない “数の乱れ” が ある。その先へ 行くには、もっと 強い 力が 必要だ。」") },
    { who: "", scene: "3_7", text: T("「ぼくたちも 一緒に 行きたい！」「うん…！ ぼくたち、もっと 強く なりたい！」") },
    { who: T("カケル"), scene: "3_8", text: T("「……その気持ちは うれしい。だが、いまの 力では まだ 早い。」") },
    { who: T("カケル"), scene: "3_9", text: T("「その そろばんで、ここまで 来られるか？」「……はい！」") },
    { who: T("カケル"), scene: "3_10", text: T("「ならば、また 会おう。もっと 成長したときに、その先の 世界へ 案内してやる。」バサッ…！") },
    { who: "", scene: "3_11", text: T("そう言うと、カケルは 大きく はばたき、空の 向こうへと 消えていった。「カケルー！！」「……うん。ぼくたち、がんばろう！」") },
    { who: "", scene: "3_12", text: T("それから、ホームに 新しい 場所が あらわれた。🔒 カケルの谷——あと {valley}回 練習すると この場所が ひらくよ！　カケルに また 会うために、ぼくたちの そろばんの 冒険は つづく！") } ] },
  // 第4話は「カケルの谷」の 道が 開いたら（第3話を 読んでから 練習 VALLEY_NEED 回）。16コマ（scene_4_1〜4_16）
  { id: "ep4", n: T("第4話"), t: T("カケルの谷"), gate: "valley", lv: 3, scene: 4, lines: [
    { who: "", scene: "4_1", text: T("道が 開いた。谷を 進んでいると、遠くから 大きな うなり声が 聞こえてきた。ゴォォォ…！「なに!? すごい音…！」") },
    { who: "", scene: "4_2", text: T("音の する方へ 行ってみると、岩山の 前に 大きな かげが あった。「あれは… ドラゴン…!?」") },
    { who: T("きみ"), scene: "4_3", text: T("近づくのは こわいけど、ぼくは 一歩 前に 進んだ。「でも… 逃げない！ 勇気を 出そう！」") },
    { who: "", scene: "4_4", text: T("すると、赤くて 大きな ドラゴンが すがたを あらわした。ガオォ…!!「わぁ…！ すごい…！」") },
    { who: T("カケル"), scene: "4_5", text: T("ドラゴンは 大きな 声で 言った。「……おまえたち、ほんとうに ここまで 来たのか？」") },
    { who: T("きみ"), scene: "4_6", text: T("ぼくは 少し ふるえながらも、そろばんを 見せた。「ぼくは、そろばんが 大好きです。もっと たくさんの 人に そろばんの 楽しさを 伝えたいんです！」") },
    { who: T("カケル"), scene: "4_7", text: T("カケルは ふしぎそうに そろばんを 見つめた。「……これは 小さな 珠で 大きな 力を 生み出す 道具なのか……？」") },
    { who: T("カケル"), scene: "4_8", text: T("すると、カケルの 表情が 少し やわらかくなった。「おもしろい！ そんな 夢を 持つ 子に 出会えるなんて 久しぶりだ！」") },
    { who: "", scene: "4_9", text: T("ぼくたちの 仲間も、勇気を 出して 話しかけた。「よろしく お願いします！」「一緒に 冒険しよう！」") },
    { who: T("カケル"), scene: "4_10", text: T("カケルは 大きく 笑った。ハハッ！「いいだろう！ 私は カケル。かけ算が 得意なんだ！」") },
    { who: T("カケル"), scene: "4_11", text: T("カケルは つばさを 広げ、空高く 舞い上がった。「一緒に 行こう！ 君たちと なら もっと 遠くへ 行ける！」「わぁ…！ かっこいい！」") },
    { who: "", scene: "4_12", text: T("カケルが 舞い降りて、そっと 言った。「これから よろしく！」「よろしく！ ぼくたち 一緒に がんばろう！」") },
    { who: "", scene: "4_13", text: T("こうして、カケルは ぼくたちの 仲間に なった。「やったね！ 新しい 仲間だ！」") },
    { who: T("カケル"), scene: "4_14", text: T("カケルは みんなに 話してくれた。「私は かけ算の 力で、こまっている 人の 力に なりたい。君たちの 夢を 必ず 応援するよ！」") },
    { who: "", scene: "4_15", text: T("夕日が 森を 照らす中、新しい 冒険が はじまる 予感が した。「もっと たくさんの 仲間と 出会って、みんなで 進もう！」") },
    { who: "", scene: "4_16", text: T("こうして、カケルとの 出会いは、ぼくたちの 大きな 一歩に なった——　それぞれの 得意な 力が ひとつに なると、どんな 困難も 乗り越えられる。新しい 仲間と、もっと 大きな 世界へ——") } ] },
  // 第4話つづき「こわれた橋」：第4話の すぐあと。20コマ目で 止まり、本物の そろばんで 3問（橋クエスト）→ 23コマ目へ
  { id: "ep4b", n: T("第4話（つづき）"), t: T("こわれた橋"), gate: "after-ep4", lv: 3, scene: "4b_18", lines: [
    { who: T("カケル"), scene: "4b_17", text: T("朝、カケルが みんなを 起こしに きた。「おはよう！ 今日は 次の 場所へ 行こう！」「うん！」「わくわく！」") },
    { who: "", scene: "4b_18", text: T("森を 進むと、大きな 川が 見えてきた。「あっ…！ 橋が こわれてる…！」") },
    { who: "", scene: "4b_19", text: T("向こう側には、見たことのない 町が ある。「あの町へ 行くには この橋を 直すしか ないみたいだね。」「みんなで 力を 合わせよう！」") },
    { who: T("カケル"), scene: "4b_20", text: T("カケルが 言った。「橋を 直すには 数の力が 必要だ。そろばんで 問題を 解いて 橋の石を 集めよう！」「おれも 応援するぞ！」") },
    { who: "", scene: "4b_play", text: T("さあ、きみの 番だ。そろばんで 3問 とくと、橋の石が 3つ 集まる。まちがえても だいじょうぶ、もう一回 やればいい。"),
      practice: { n: 3, subj: "mitori", label: T("橋の石を 集める 3問"), quest: "bridge",
        react: [T("カケル「いいぞ！ 石が ひとつ 集まった！」"), T("ルート「橋が つながって いってる！」"), T("ソロモン「やった！ もう少しだよ！」")],
        miss: [T("ルート「ぼくも まちがえたこと あるよ。もう一回！」"), T("カケル「あきらめなかったな。それが 数の力だ。」")] } },
    { who: "", scene: "4b_23", text: T("1問 できるごとに、橋の 一部が 直っていく。「すごい！ 橋が つながって いってる！」") },
    { who: "", scene: "4b_24", text: T("みんなで 協力して たくさんの 問題を 解いた。「やった！ もう少しだよ！」「この調子！」") },
    { who: "", scene: "4b_25", text: T("そして——ついに！「できたー！」") },
    { who: T("カケル"), scene: "4b_26", text: T("橋を 渡る前に、カケルが 言った。「よくやった！ これからも 困ったことが あったら、そろばんの 力で 乗りこえていける。おれは いつも そばに いるぞ！」") },
    { who: T("ソロモン"), scene: "4b_27", text: T("ソロモンが うれしそうに 言った。「みんなと いっしょなら どんなことも できるね！ もっと いろんな 場所へ 行こう！」") },
    { who: T("きみ"), scene: "4b_28", text: T("少年は 新しい 仲間たちを 見て、心の中で 思った。「そろばんが あれば ぼくは きっと——もっと たくさんの 冒険が できる！」") },
    { who: "", scene: "4b_29", text: T("3匹も それぞれ 決意を 新たに した。ソロモン「みんなを 元気にするよ！」ルート「まちがえても あきらめない！」カケル「もっと 強くなるために いっしょに 進もう！」") },
    { who: "", scene: "4b_30", text: T("橋の 向こうには、きらめく 王都が 待っている。「さあ！ 次の 冒険へ 出発だ！」新しい 出会いが ぼくらを 待っている——") },
    { who: "", scene: "4b_31", text: T("そろばんの 力は 一人ではなく 仲間と 一緒に あると もっと 大きくなる。これからも——たくさんの 冒険が ぼくらを 待っている！") },
    { who: "", scene: "4b_32", text: T("つぎの 世界へ——　つづく！") } ] },
  { id: "ep5", n: T("第5話"), t: T("一人前の そろばん仲間"), lv: 5, scene: 6, lines: [
    { who: T("ソロモン"), pose: "happy", text: T("ぼく、一人前の そろばん仲間に なれたよ！ ぜんぶ、きみが 毎日 いっしょに やってくれた おかげ！") },
    { who: T("きみ"), pose: "celebrate", text: T("これからも いっしょだよ。") },
    { who: T("ソロモン"), pose: "side", text: T("うん！ つぎは どこへ 行こうかな！") },
    { who: "", pose: "celebrate", text: T("👑 そして、つぎの エリアが ひらかれる……　きみの ぼうけんは まだまだ つづく！") } ] },
];
const SOLO_SPECIAL_30 = { id: "d30", n: T("とくべつな 日"), t: T("そろばんを やった日が 30日！"), lv: 0, scene: 6, lines: [
  { who: T("ソロモン"), pose: "happy", text: T("そろばんを やった日が、30日に なったよ！") },
  { who: T("ソロモン"), pose: "front", text: T("最初は 数字を 見ると こわかったけど……") },
  { who: T("ソロモン"), pose: "celebrate", text: T("いまは、きみと なら だいじょうぶ！ これからも よろしくね！") } ] };
/* ---- カケルの谷：第3話を 読んでから 練習 VALLEY_NEED 回で 道が 開く（第4話） ----
   「あと○回 練習すると 道が 開く」と 場所で 見せる（成績表の 数字に しない） */
const VALLEY_NEED = 10;
function valleyLeft() {
  const st = soloState(); if (!st.seen.ep3) return VALLEY_NEED;
  const since = typeof st.seen.ep3 === "string" ? st.seen.ep3 : (st.met || "");
  const n = studySessions().filter((e) => (e.d || "") >= since).length;
  return Math.max(0, VALLEY_NEED - n);
}
const valleyOpen = () => !!soloState().seen.ep3 && valleyLeft() === 0;
/* ============ 📖 物語の中の 練習 ============
   漫画の とちゅうで 止まり、本物の そろばんで 数問。正解するたびに 仲間が 反応し、橋が のびる。
   まちがえたら「もう一回」。もう一回 できたら 仲間が それを ほめる（まちがい＝失敗ではなく 物語の 出来事） */
let pendingStory = null;
function startStorySession(ep, idx) {
  const P = ep.lines[idx].practice; if (!P) return;
  let subj = P.subj || "mitori";
  if (!difficulty(currentGrade(), subj)) subj = difficulty(currentGrade(), "anzan") ? "anzan" : "mitori";
  const st = soloState(); st.prog = st.prog || {}; st.prog[ep.id] = idx; soloSave(st);   // とちゅうで やめても ここから 再開
  pendingStory = { ep: ep.id, idx, n: P.n || 3, hits: 0, retry: false, label: P.label || (T("いっしょに ") + (P.n || 3) + T("問")), react: P.react || [], miss: P.miss || [], quest: P.quest || "" };
  subject = subj; renderGrid(); updateInfo();
  startWithTips(subj);              // はじめての子には ゆびの 使い方の 説明が 先に 出る
}
// 答えたとき：反応の ことばを 出す。まちがえたら 同じ問題を もう一回（結果には どちらも 正直に 残る）
function storyOnAnswer(ok) {
  const S = session.story; if (!S) return 850;
  if (ok) {
    const was = S.retry; S.retry = false; S.hits++;
    const done = S.hits >= S.n;
    renderBridge(was ? S.miss[1] : S.react[Math.min(S.hits, S.react.length) - 1], was ? "cheer" : done ? "celebrate" : S.hits === 1 ? "idea" : "soroban2");
    return 1400;
  }
  if (!S.retry) {
    S.retry = true;
    session.queue = [session.cur].concat(session.queue || []); session.N++;   // 同じ問題を もう一回（1問ぶん のびる）
    renderBridge(S.miss[0] + T("　→ もう一回 やってみよう"), "sad");
    return 1800;
  }
  renderBridge(T("だいじょうぶ、つぎに いこう。"), "wave");
  return 1200;
}
/* 🌉 クエスト：練習に「意味」を つける。中身の 問題は ふつうと 同じ。
   before/after の 2枚の 絵が 同じ構図で、正解の ぶんだけ after が 左から あらわれる（＝橋が のびる） */
const QUESTS = {
  bridge: { name: T("壊れた橋を 直せ！"), em: "🌉", before: "assets/quests/bridge_before.jpg", after: "assets/quests/bridge_after.jpg",
    start: T("数の乱れで 橋が 消えちゃった！ 正解するたびに 橋が のびるよ。"), done: T("パチン！ 橋が できた！　🐣「渡れるー！！」") },
  town:   { name: T("暗い町に 灯りを ともせ！"), em: "🔦", before: "assets/quests/town_before.jpg", after: "assets/quests/town_after.jpg",
    start: T("町の 灯りが ぜんぶ 消えちゃった！ 正解するたびに 灯りが ともるよ。"), done: T("パッ！ 町が 明るくなった！　🐣「みんな 出てきたよ！」") },
  forest: { name: T("迷子の森を ぬけろ！"), em: "🐾", before: "assets/quests/forest_before.jpg", after: "assets/quests/forest_after.jpg",
    start: T("霧で 道が 見えない…。正解するたびに 霧が 晴れるよ。"), done: T("霧が 晴れて 道しるべが 見えた！　🐣「こっちだ！」") },
  ship:   { name: T("沈みそうな船を 助けろ！"), em: "⛵", before: "assets/quests/ship_before.jpg", after: "assets/quests/ship_after.jpg",
    start: T("あらしで 船が かたむいてる！ 正解するたびに 海が おだやかに なるよ。"), done: T("船が 港に 着いた！　🐣「たすかった！」") },
  valley: { name: T("カケルの谷へ 進め！"), em: "⛰️", before: "assets/quests/valley_before.jpg", after: "assets/quests/valley_after.jpg",
    start: T("数の霧で 谷の 道が 見えない！ 正解するたびに 道が あらわれるよ。"), done: T("谷の 向こうに 塔が 見えた！　🐣「もう少しだ！」") },
};
const QUEST_ORDER = ["bridge", "town", "forest", "ship", "valley"];
// きょうの クエスト：日付で かわる（同じ日は 同じ）。カケルの谷を 追いかけている あいだは 谷の 道を 多めに
function questOfToday() {
  const d = today(), n = d.split("-").reduce((a, x) => a + parseInt(x, 10), 0);
  const st = soloState();
  if (st.seen && st.seen.ep3 && !st.seen.ep4 && n % 2 === 0) return "valley";
  return QUEST_ORDER[n % QUEST_ORDER.length];
}
// 橋：正解の数だけ のびる（そろばん＝世界を 動かす 道具）。say＝ことば、pose＝そのとき の ソロモンの 絵
function renderBridge(say, pose) {
  const b = $("#storyBridge"); if (!b) return;
  const Q = session && session.quest; if (!Q || !storyOn()) { b.classList.add("hidden"); return; }
  const q = QUESTS[Q.key] || QUESTS.bridge, n = Math.max(1, Q.n), hits = Math.min(n, Q.hits), done = hits >= n;
  const pct = Math.round((hits / n) * 100);
  const wasHidden = b.classList.contains("hidden");
  b.classList.remove("hidden");
  if (wasHidden || !b.querySelector(".qscene")) {
    b.innerHTML = '<div class="qscene"><img class="q-before" src="' + q.before + '" alt="" onerror="this.parentNode.classList.add(\'noimg\')">' +
      '<img class="q-after" src="' + q.after + '" alt=""><div class="q-title"></div></div>' +
      '<div class="bridge-say"><span class="bridge-pic-wrap"></span><span class="bridge-txt"></span></div>';
  }
  b.querySelector(".q-after").style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)";
  b.querySelector(".q-title").textContent = (q.em || "🌉") + " " + q.name + "　" + hits + " / " + n;
  b.querySelector(".bridge-pic-wrap").innerHTML = soloPic(pose || (done ? "celebrate" : hits ? "soroban2" : "soroban"), "bridge-pic");
  b.querySelector(".bridge-txt").textContent = done ? q.done : (say || (hits ? "" : q.start));
}
// 練習が 終わったら、物語の つづきへ（そのあとで ソロモンの 成長を たしかめる）
function storyResume(S) {
  const ep = SOLO_EPISODES.find((e) => e.id === S.ep);
  if (!ep) return solomonAfterStudy();
  setTimeout(() => soloStory(ep, solomonAfterStudy, S.idx + 1), 1500);
}
/* 物語を 見せる（絵＋セリフ、「つぎへ」で 進む。3秒たつと「とばす」が 出る＝その漫画の 区切りまで 飛ぶ。練習は とばせない。
   startIdx＝とちゅうから（練習の あと／やめた ところから）。0 を 渡すと はじめから */
function soloStory(ep, onClose, startIdx) {
  const el = fxLayer();
  const st0 = soloState();
  let i = startIdx != null ? startIdx : ((st0.prog && st0.prog[ep.id]) || 0);
  if (i >= ep.lines.length) i = 0;
  const d = document.createElement("div"); d.className = "tip-back story-back";
  let skipTimer = null;
  const segEnd = (from) => { for (let j = from; j < ep.lines.length; j++) if (ep.lines[j].practice) return j; return ep.lines.length - 1; };
  const finish = () => { d.remove(); const st = soloState(); if (!st.seen[ep.id]) st.seen[ep.id] = today(); if (st.prog) delete st.prog[ep.id]; soloSave(st); if (onClose) onClose(); };
  const render = () => {
    clearTimeout(skipTimer);
    const L0 = ep.lines[i], last = i === ep.lines.length - 1, P = L0.practice;
    const L = Object.assign({}, L0, { text: String(L0.text).replace("{valley}", String(valleyLeft() || VALLEY_NEED)) });
    // 場面：絵（scene_N.png）が あれば それを 大きく。無ければ 空と 草原の 上に ソロモン
    const sc = L.scene || ep.scene;
    const scene = '<div class="story-scene' + (sc ? "" : " noscene") + '">' +
      (sc ? '<img class="story-scene-img" src="assets/solomon/scene_' + sc + (String(sc).endsWith("_play") ? ".jpg" : ".png") + SOLO_IMG_VER + '" alt="" onerror="this.parentNode.classList.add(\'noscene\')">' : "") +
      soloPic(L.pose, "story-pic") + "</div>";
    d.innerHTML = '<div class="tip-card story-card"><div class="story-h">' + ep.n + "　" + ep.t + "</div>" +
      scene + '<div class="story-who">' + (L.who || "") + '</div><div class="story-text">' + L.text + " " + sayBtn((L.who ? L.who + "。" : "") + L.text, "say-inline") + "</div>" +
      '<button class="tip-ok">' + (P ? T("🧮 はじめる（") + (P.n || 3) + T("問）") : last ? T("とじる") : T("つぎへ ▶")) + "</button>" +
      (P || last ? "" : T('<button class="story-skip-btn hidden">▶▶ とばす</button>')) +
      '<div class="story-skip">' + (i + 1) + " / " + ep.lines.length + "</div></div>";
    d.querySelector(".tip-ok").onclick = () => {
      try { clickSnd(); } catch (e) { }
      if (P) { d.remove(); startStorySession(ep, i); }
      else if (last) finish();
      else { i++; render(); }
    };
    const sk = d.querySelector(".story-skip-btn");
    if (sk) {
      skipTimer = setTimeout(() => sk.classList.remove("hidden"), 3000);
      sk.onclick = () => { i = segEnd(i); render(); };
    }
  };
  render(); el.appendChild(d);
}
// はじめて ホームを 開いたとき：第1話（出会い）
function soloIntro() {
  if (!storyOn()) return;
  const st = soloState();
  if (st.seen.ep1) return;
  if (!st.met) { st.met = today(); soloSave(st); }
  soloStory(SOLO_EPISODES[0], renderSolomonCard);
}
// 小さな ひとこと（画面の 下に 数秒だけ）
function soloToast(text) {
  const t = document.createElement("div"); t.className = "solo-toast"; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => { try { t.remove(); } catch (e) { } }, 5000);
}
/* 練習が 終わるたびに 呼ぶ（練習の 完走・本日の練習・フラッシュ・SK検定）。たいせん・パズルからは 呼ばない。
   段階が 上がっていたら、その話を 見せる。上がらなければ「あと どれだけ」を ひとこと。 */
function solomonAfterStudy() {
  const st = soloState(); if (!st.met) st.met = today();
  const s = soloStats(), before = st.lv || 0, lv = soloLevel(s, st);
  st.lv = lv;
  if (!storyOn()) { soloSave(st); return; }   // オフのときは 静かに 数えるだけ（お話も ひとことも 出さない）
  const queue = [];
  for (let k = before + 1; k <= lv; k++) { const ep = SOLO_EPISODES.find((e) => e.lv === k && !e.gate); if (ep && !st.seen[ep.id]) queue.push(ep); }
  if (valleyOpen() && !st.seen.ep4) queue.push(SOLO_EPISODES.find((e) => e.id === "ep4"));   // 🏔 カケルの谷の 道が 開いた
  if (st.seen.ep4 && !st.seen.ep4b) queue.push(SOLO_EPISODES.find((e) => e.id === "ep4b"));   // 🌉 第4話の つぎの 練習で「こわれた橋」
  if (s.days >= 30 && !st.said.d30) { st.said.d30 = 1; queue.push(SOLO_SPECIAL_30); }
  soloSave(st);
  const next = () => { const ep = queue.shift(); if (ep) soloStory(ep, next); else renderSolomonCard(); };
  setTimeout(() => {
    if (queue.length) { try { sfx("levelup", function () { fanfareSnd(); }); } catch (e) { } next(); }
    else { soloToast(T("🐣 ソロモン「れんしゅう ありがとう！」　つぎの 成長まで：") + soloNext(s, lv)); renderSolomonCard(); }
  }, 1600);
}
/* ホームの カード */
function renderSolomonCard() {
  const box = $("#homeSolomon"); if (!box) return;
  if (!storyOn()) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  const st = soloState(), s = soloStats(), lv = soloLevel(s, st);
  // 絵：きょう 練習ずみ→よろこぶ／まだ→手をふる（Lv.5は マント）／出会う前→正面
  box.innerHTML = '<div class="solo-top">' + soloPic(lv === 0 ? "front" : s.todayDone ? "happy" : lv >= 5 ? "zukan" : "wave") +
    T("<div><b>🐣 ソロモン</b><small>") + (lv ? "Lv." + lv + " " + SOLO_LEVELS[lv - 1].name : T("まだ 出会ったばかり")) + "</small></div></div>" +
    '<div class="solo-speech">「' + soloSpeech(s, lv) + '」</div>' +
    T('<div class="solo-row"><span>成長</span><b>') + starStr(lv, 5) + "</b></div>" +
    T('<div class="solo-next">つぎの 場所まで　') + soloNext(s, lv) + "</div>" +
    soloValleyHTML(st) +
    T('<button id="homeToSolomon" class="wide-btn">🐣 ソロモンを 見る</button>');
  $("#homeToSolomon").onclick = () => { showView("solomon"); setActiveNav(document.querySelector('.nav[data-view="solomon"]')); };
  const vg = $("#valleyGo"); if (vg) vg.onclick = () => soloStory(SOLO_EPISODES.find((e) => e.id === "ep4"), renderSolomonCard);
  const vg2 = $("#valleyGo2"); if (vg2) vg2.onclick = () => soloStory(SOLO_EPISODES.find((e) => e.id === "ep4b"), renderSolomonCard);
}
// 🔒 カケルの谷（第3話を 読んだ子にだけ 出る）
function soloValleyHTML(st) {
  if (!st.seen.ep3) return "";
  if (st.seen.ep4 && !st.seen.ep4b) return T('<div class="solo-valley open">🌉 こわれた橋　つぎの 練習で 橋を 直そう！ <button id="valleyGo2" class="hw-go">▶ 読む</button></div>');
  if (st.seen.ep4) return T('<div class="solo-valley open">🏔 カケルの谷　カケルが 仲間に なった！</div>');
  if (valleyOpen()) return T('<div class="solo-valley open">🏔 カケルの谷の 道が 開いた！ <button id="valleyGo" class="hw-go">▶ 進む</button></div>');
  return T('<div class="solo-valley">🔒 カケルの谷　あと <b>') + valleyLeft() + T('</b>回 練習すると 道が 開く</div>');
}
/* ソロモンの 画面（図鑑＋物語） */
function renderSolomon() {
  const main = $("#soloMain"), eps = $("#soloEpisodes"); if (!main) return;
  const st = soloState(), s = soloStats(), lv = soloLevel(s, st);
  const L = SOLO_LEVELS[lv - 1];
  const fmtMet = st.met ? st.met.slice(0, 4) + T("年") + (+st.met.slice(5, 7)) + T("月") + (+st.met.slice(8, 10)) + T("日") : "—";
  main.innerHTML = soloPic(lv >= 5 ? "celebrate" : lv >= 4 ? "zukan" : lv >= 3 ? "happy" : lv >= 2 ? "soroban" : lv >= 1 ? "front" : "wonder") +
    '<div class="solo-lvname">' + soloTitle(lv) + "</div>" +
    '<div class="solo-quote">「' + (L ? pickToday(L.talk) : T("そろばん、いっしょに やってみる？")) + '」</div>' +
    T('<div class="solo-row big"><span>成長</span><b>') + starStr(lv, 5) + "</b></div>" +
    '<div class="solo-stats"><div><b>' + s.sets + T('</b><span>練習した 回数</span></div><div><b>') + s.correct + T('</b><span>正解した 問題</span></div><div><b>') + s.days + T('</b><span>そろばんを やった日</span></div></div>') +
    T('<div class="sub">出会った日：') + fmtMet + (s.dan ? T("　⭐ 称号：段の ソロモン") : "") + "</div>" +
    T("<h4>そろばんの 力（しゅもく別）</h4>") +
    SOLO_SUBJ.map((k) => '<div class="solo-skill"><span>' + SOLO_SUBJ_NAME[k] + "</span><b>" + starStr(soloStars(s.bySubj[k]), 5) + '</b><small>' + s.bySubj[k] + T("問</small></div>")).join("") +
    T('<p class="sub">★は ソロモンと 出会ってから、その しゅもくの 練習で 正解した 数（20・50・100・200・400問）。パズル・たいせん・SK検定は 数えないよ。</p>') +
    T('<div class="solo-cond"><b>つぎの 場所まで</b><br>') + soloNext(s, lv) + (SOLO_LEVELS[lv] ? T('<br><small>（') + SOLO_LEVELS[lv].cond + T("）</small>") : "") + "</div>";
  const all = SOLO_EPISODES.concat(st.said.d30 ? [SOLO_SPECIAL_30] : []);
  eps.innerHTML = (storyOn() ? "" : T('<p class="sub">いま「ソロモンと 物語」は オフです（設定で オンに できます）。図鑑は 見られます。</p>')) + all.map((ep, i) => {
    const open = ep.id === "d30" || st.seen[ep.id] || (ep.gate === "valley" ? valleyOpen() : ep.gate === "after-ep4" ? !!st.seen.ep4 : lv >= ep.lv);
    const lock = ep.gate === "valley" ? (st.seen.ep3 ? T("🔒 あと ") + valleyLeft() + T("回 練習で 道が 開く") : T("🔒 第3話の あとで"))
      : ep.gate === "after-ep4" ? T("🔒 第4話の あとで") : "🔒 Lv." + ep.lv + T(" で ひらく");
    return '<div class="solo-ep' + (open ? "" : " locked") + '"><b>' + ep.n + "　" + (open ? ep.t : T("？？？")) + "</b>" +
      (open ? '<button class="ep-read" data-i="' + i + '">' + (st.seen[ep.id] ? T("もう一度 よむ") : T("▶ よむ")) + "</button>" : "<small>" + lock + "</small>") + "</div>";
  }).join("") + T('<p class="sub">物語は「そろばんの 練習」で 進みます。パズルや たいせんでは 進みません。</p>');
  eps.querySelectorAll(".ep-read").forEach((b) => { b.onclick = () => soloStory(all[+b.dataset.i], renderSolomon, 0); });   // 図鑑からは はじめから
}

/* ---------- 初期化（必ず いちばん最後。上で定義した定数を すべて使えるようにするため） ---------- */
renderGrid();
updateInfo();
renderProfile();
renderSound();
renderGoldPill();
showView("home");
setActiveNav(document.querySelector('.nav[data-view="home"]'));
