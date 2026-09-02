const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const COLS = 23, ONES_COL = 11, BH = 28;
const isUnitPoint = (c) => (c - ONES_COL) % 3 === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// onQuizChange が初期化時（makeSoroban生成時）に参照するため、先に宣言してTDZを回避
let session = null, playTimer = null;

/* ============================================================ 検定基準（級） */
const SOROBAN_STD = {
  10: { mitori: { digits: 2, terms: 5 }, kake: { a: 2, b: 1 }, wari: null },
  9: { mitori: { digits: 2, terms: 5 }, kake: { a: 2, b: 1 }, wari: null },
  8: { mitori: { digits: 2, terms: 10 }, kake: { a: 3, b: 1 }, wari: { D: 3, dv: 1, qd: 2 } },
  7: { mitori: { digits: 2, terms: 15 }, kake: { a: 2, b: 2 }, wari: { D: 4, dv: 1, qd: 3 } },
  6: { mitori: { digits: 3, terms: 10 }, kake: { a: 3, b: 2 }, wari: { D: 4, dv: 2, qd: 2 } },
  5: { mitori: { digits: 3, terms: 15 }, kake: { a: 4, b: 2 }, wari: { D: 5, dv: 2, qd: 3 } },
  4: { mitori: { digits: 4, terms: 10 }, kake: { a: 4, b: 3 }, wari: { D: 5, dv: 3, qd: 2 } },
  3: { mitori: { digits: 4, terms: 15 }, kake: { a: 4, b: 3 }, wari: { D: 6, dv: 3, qd: 3 } },
  2: { mitori: { digits: 5, terms: 15 }, kake: { a: 5, b: 3 }, wari: { D: 6, dv: 3, qd: 3 } },
  1: { mitori: { digits: 5, terms: 20 }, kake: { a: 5, b: 4 }, wari: { D: 7, dv: 3, qd: 4 } },
};
const ANZAN_STD = {
  10: { digits: 1, terms: 3 }, 9: { digits: 1, terms: 4 }, 8: { digits: 2, terms: 4 }, 7: { digits: 2, terms: 5 },
  6: { digits: 2, terms: 3 }, 5: { digits: 2, terms: 4 }, 4: { digits: 2, terms: 5 }, 3: { digits: 2, terms: 6 },
  2: { digits: 2, terms: 8 }, 1: { digits: 3, terms: 5 },
};
// フラッシュ暗算 10〜1級（全珠連。10/7/5/3/1級は指定値、他は補間。すべて2桁）
const FLASH_STD = {
  10: { digits: 2, terms: 2, sec: 4 }, 9: { digits: 2, terms: 3, sec: 5 }, 8: { digits: 2, terms: 4, sec: 7 },
  7: { digits: 2, terms: 5, sec: 8 }, 6: { digits: 2, terms: 6, sec: 9 }, 5: { digits: 2, terms: 7, sec: 10 },
  4: { digits: 2, terms: 8, sec: 11 }, 3: { digits: 2, terms: 10, sec: 12 }, 2: { digits: 2, terms: 12, sec: 13 },
  1: { digits: 2, terms: 15, sec: 13 },
};
// フラッシュ暗算 段位（全珠連基準。初段/二/五/七/十段は指定値、三・四・八・九段は補間、六段=3桁12口8秒）
const FLASH_DAN = {
  1: { digits: 2, terms: 15, sec: 10 }, 2: { digits: 3, terms: 4, sec: 4 }, 3: { digits: 3, terms: 6, sec: 5 },
  4: { digits: 3, terms: 8, sec: 6 }, 5: { digits: 3, terms: 10, sec: 7 }, 6: { digits: 3, terms: 12, sec: 8 },
  7: { digits: 3, terms: 15, sec: 8 }, 8: { digits: 3, terms: 15, sec: 6 }, 9: { digits: 3, terms: 15, sec: 4 },
  10: { digits: 3, terms: 15, sec: 3 },
};
// フラッシュ暗算 11〜20級（練習級・加盟教室の目安。総秒数）
const FLASH_KYU_LOW = {
  20: { digits: 1, terms: 2, sec: 7 }, 19: { digits: 1, terms: 3, sec: 7 }, 18: { digits: 1, terms: 4, sec: 8 },
  17: { digits: 1, terms: 5, sec: 9 }, 16: { digits: 1, terms: 6, sec: 9 }, 15: { digits: 1, terms: 7, sec: 10 },
  14: { digits: 1, terms: 8, sec: 11 }, 13: { digits: 1, terms: 10, sec: 12 }, 12: { digits: 1, terms: 12, sec: 12 },
  11: { digits: 2, terms: 10, sec: 12 },
};
const SUBJECT = {
  mitori: { name: "みとり算", answer: "soroban", N: 15, per: 10, pass: 100, limit: 420 },
  kake: { name: "かけ算", answer: "soroban", N: 15, per: 10, pass: 100, limit: 420 },
  wari: { name: "わり算", answer: "soroban", N: 15, per: 10, pass: 100, limit: 420 },
  anzan: { name: "あんざん", answer: "input", N: 20, per: 5, pass: 70, limit: 180 },
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
    if (k <= 10) {
      if (subj === "mitori") return SOROBAN_STD[k].mitori;
      if (subj === "kake") return SOROBAN_STD[k].kake;
      if (subj === "wari") return SOROBAN_STD[k].wari;
      if (subj === "anzan") return ANZAN_STD[k];
      if (subj === "flash") return FLASH_STD[k];
    } else {
      // 11〜20級：入門（自動目安）。かけ・わりは無し
      const terms = Math.max(2, 5 - Math.floor((k - 10) / 2));
      if (subj === "mitori" || subj === "anzan") return { digits: 1, terms };
      if (subj === "flash") return FLASH_KYU_LOW[k];
      return null;
    }
  } else {
    const d = g.dan;
    if (subj === "mitori") return { digits: 4 + Math.floor((d - 1) / 5), terms: 20 + d };
    if (subj === "kake") return { a: 5 + Math.floor((d - 1) / 4), b: 4 + Math.floor((d - 1) / 5) };
    if (subj === "wari") return { D: 7 + Math.floor(d / 2), dv: 3 + Math.floor((d - 1) / 4), qd: null };
    if (subj === "anzan") return { digits: 3, terms: 5 + d };
    if (subj === "flash") return FLASH_DAN[d];
  }
}

/* ============================================================ ジェネレータ */
function randDigits(d) { const min = d === 1 ? 1 : Math.pow(10, d - 1); return Math.floor(Math.random() * (Math.pow(10, d) - 1 - min + 1)) + min; }
function genMitori({ digits, terms }) {
  const allowSub = terms >= 5; const nums = []; let total = 0;
  for (let i = 0; i < terms; i++) { const v = randDigits(digits); if (i > 0 && allowSub && Math.random() < 0.35 && total > v) { nums.push(-v); total -= v; } else { nums.push(v); total += v; } }
  return { nums, answer: total };
}
function genFlashNums({ digits, terms }) { const nums = []; let t = 0; for (let i = 0; i < terms; i++) { const v = randDigits(digits); nums.push(v); t += v; } return { nums, answer: t }; }
function genKake({ a, b }) { const f1 = randDigits(a), f2 = randDigits(b); return { display: `${f1.toLocaleString()} × ${f2.toLocaleString()}`, answer: f1 * f2 }; }
function genWari({ D, dv, qd }) {
  for (let t = 0; t < 300; t++) {
    const divisor = randDigits(dv);
    let qLow = Math.ceil(Math.pow(10, D - 1) / divisor), qHigh = Math.floor((Math.pow(10, D) - 1) / divisor);
    if (qd) { qLow = Math.max(qLow, Math.pow(10, qd - 1)); qHigh = Math.min(qHigh, Math.pow(10, qd) - 1); } else qLow = Math.max(qLow, 1);
    if (qLow > qHigh) continue;
    const q = Math.floor(Math.random() * (qHigh - qLow + 1)) + qLow;
    return { display: `${(divisor * q).toLocaleString()} ÷ ${divisor.toLocaleString()}`, answer: q };
  }
  return { display: "0 ÷ 1", answer: 0 };
}
function mitoriDisplay(nums) { const fmt = (x) => x.toLocaleString(); return nums.map((v, i) => (i === 0 ? fmt(v) : `${v < 0 ? "−" : "+"} ${fmt(Math.abs(v))}`)).join("\n") + "\n――――\n= ?"; }
function genProblemFor(g, subj) {
  const diff = difficulty(g, subj); if (!diff) return null;
  if (subj === "mitori" || subj === "anzan") { const p = genMitori(diff); return { display: mitoriDisplay(p.nums), answer: p.answer, nums: p.nums }; }
  if (subj === "kake") return genKake(diff);
  if (subj === "wari") return genWari(diff);
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
function saveTime(gradeKey, subj, sec) { const t = JSON.parse(localStorage.getItem(TIMES) || "{}"); const k = `${gradeKey}_${subj}`; if (t[k] == null || sec < t[k]) { t[k] = sec; localStorage.setItem(TIMES, JSON.stringify(t)); } }
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

/* ============================================================ そろばん部品 */
let audioCtx;
function ensureAudio() { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function tone(freq, t0, dur, type = "sine", vol = 0.15) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function clickSnd() { // 珠が弾く「パチ」
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

/* ============================================================ 画面ルーティング */
const TITLES = { grades: "級・段を選ぶ", play: "れんしゅう", records: "記録を見る", settings: "設定・プロフィール", lesson: "検定内容・解き方" };
function showView(v) {
  $$(".view").forEach((el) => el.classList.toggle("hidden", el.id !== "view-" + v));
  $("#pageTitle").textContent = TITLES[v] || "";
  if (v === "records") renderRecords();
  if (v === "settings") renderSettings();
}
function setActiveNav(el) { $$(".nav").forEach((n) => n.classList.remove("active")); if (el) el.classList.add("active"); }
$$(".nav").forEach((n) => n.addEventListener("click", () => {
  setActiveNav(n);
  if (n.dataset.subj) { subject = n.dataset.subj; showView("grades"); updateInfo(); }
  else showView(n.dataset.view);
}));
$("#examInfoBtn").addEventListener("click", () => showView("lesson"));
$("#startBtn").addEventListener("click", () => startSession(subject));
$("#quitBtn").addEventListener("click", quitSession);

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
  if (subj === "flash") return `${d.digits}桁 ${d.terms}口 / 1問 ${d.sec.toFixed(1)}秒`;
  if (subj === "kake") return `${d.a}桁 × ${d.b}桁`;
  if (subj === "wari") return `${d.D}桁 ÷ ${d.dv}桁`;
  return `${d.digits}桁 ${d.terms}口`;
}
function updateInfo() {
  const g = currentGrade();
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.subj === subject));
  $$(".chip").forEach((c) => (c.disabled = !difficulty(g, c.dataset.subj)));
  if (!difficulty(g, subject)) { subject = "mitori"; return updateInfo(); }
  const cf = SUBJECT[subject];
  let info = `<b>${g.key}／${cf.name}</b>：${specText(g, subject)}`;
  if (cf.answer !== "flash") info += `　｜ ${cf.N}問・制限${cf.limit / 60}分・合格${cf.pass}点`;
  if (g.band === "dan" || g.kyu > 10) info += ` <span class="note">※目安</span>`;
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
}
function renderRecords() {
  const ms = monthStats();
  $("#recEffort").textContent = `学習日数 ${ms.days}日　／　合計 ${fmtMin(ms.sec)}`;
  const t = allTimes();
  const subs = ["mitori", "kake", "wari", "anzan"];
  const rows = GRADES.filter((g) => subs.some((s) => t[`${g.key}_${s}`] != null))
    .map((g) => `<tr><td>${g.key}</td>${subs.map((s) => `<td>${t[`${g.key}_${s}`] != null ? fmtClock(t[`${g.key}_${s}`]) : "—"}</td>`).join("")}</tr>`).join("");
  $("#recordsTable").innerHTML = rows
    ? `<table class="rec-table"><tr><th>級・段</th><th>みとり</th><th>かけ</th><th>わり</th><th>あんざん</th></tr>${rows}</table>`
    : `<p class="sub">まだ記録がありません。練習を完走するとタイムが記録されます。</p>`;
}
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
  session = { subj, grade, cf, N: cf.N, idx: 0, correct: 0, timed: $("#timerToggle").checked, mode: $("#examMode").checked ? "end" : "each", results: [], locking: false, start: performance.now(), cur: null };
  $("#playMark").classList.add("hidden");
  showView("play");
  $("#playSorobanWrap").classList.toggle("hidden", cf.answer !== "soroban");
  $("#playInputWrap").classList.toggle("hidden", cf.answer !== "input");
  $("#playFlashWrap").classList.add("hidden");
  $("#showSteps").style.display = subj === "mitori" ? "" : "none";
  $("#playGrade").textContent = `${grade.key}／${cf.name}` + (session.timed ? "（検定）" : "（記録）");
  $("#playResult").textContent = ""; $("#playResult").className = "result"; $("#steps").classList.add("hidden");
  playTimer = setInterval(tickPlay, 150);
  nextPlayProblem();
}
function tickPlay() {
  if (!session) return;
  const el = (performance.now() - session.start) / 1000;
  if (session.timed) { const rem = session.cf.limit - el; $("#playTimer").textContent = "⏱ " + fmtClock(rem); if (rem <= 0) finishSession(); }
  else $("#playTimer").textContent = "⏱ " + fmtClock(el);
}
function nextPlayProblem() {
  session.cur = genProblemFor(session.grade, session.subj);
  $("#playProblem").textContent = session.cur.display;
  $("#playMark").classList.add("hidden");
  const prog = session.mode === "end" ? `回答 ${Math.min(session.idx + 1, session.N)} / ${session.N}` : `${Math.min(session.idx + 1, session.N)} / ${session.N}　正解 ${session.correct}`;
  $("#playProgress").textContent = prog;
  $("#steps").classList.add("hidden");
  if (session.cf.answer === "soroban") sorobanQuiz.clear();
  else { $("#playInput").value = ""; $("#playInput").focus(); }
}
function onQuizChange(p) {
  $("#soroban2Value").textContent = p.disp;
  sorobanParts = p;
}
function currentSorobanAnswer() {
  return sorobanParts.fracStr === "" ? Number(sorobanParts.intStr) : NaN;
}
// 答え合わせ（◎／×表示、採点方式に応じて進行）
function submitAnswer(val) {
  if (!session || session.locking) return;
  const ok = val === session.cur.answer;
  if (ok) session.correct++;
  session.results.push(ok);
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
  const el = (performance.now() - session.start) / 1000;
  const completed = session.idx >= session.N, cf = session.cf;
  let msg = "";
  if (session.mode === "end" && session.results.length) {
    msg += `<div class="marks">` + session.results.map((r) => `<span class="mk ${r ? "ok" : "ng"}">${r ? "◎" : "×"}</span>`).join("") + `</div>`;
  }
  msg += `タイム <b>${fmtClock(el)}</b>　正解 ${session.correct} / ${session.N}`;
  let cls = "ok";
  if (completed) { saveTime(session.grade.key, session.subj, el); logStudy(el); msg += `<br>⏱ 自己ベスト：${fmtClock(bestTime(session.grade.key, session.subj))}`; }
  if (session.timed) {
    const score = session.correct * cf.per, pass = score >= cf.pass;
    msg += `<br>${pass ? "🎉 合格！" : "不合格"}（${score} / ${cf.per * session.N}点・合格${cf.pass}）`;
    cls = pass ? "ok" : "ng";
    if (pass) { certify(session.grade.key); msg += `<br>🎓 ${session.grade.key} 認定！`; }
  }
  touchStreak(); renderProfile();
  if (session.timed) { (session.correct * cf.per >= cf.pass) ? fanfareSnd() : wrongSnd(); }
  else if (completed) fanfareSnd();
  msg += `<br><button id="againBtn">もう一度</button> <button id="homeBtn" class="ghost">級・段選択へ</button>`;
  $("#playResult").innerHTML = msg; $("#playResult").className = "result " + cls;
  $("#playProblem").textContent = "おつかれさま！";
  const subj = session.subj; session = null;
  $("#againBtn").onclick = () => startSession(subj);
  $("#homeBtn").onclick = () => { showView("grades"); setActiveNav(document.querySelector('.nav[data-view="grades"]')); updateInfo(); };
}
function quitSession() { if (playTimer) { clearInterval(playTimer); playTimer = null; } session = null; showView("grades"); setActiveNav(document.querySelector('.nav[data-view="grades"]')); updateInfo(); }

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
$("#showSteps").addEventListener("click", () => {
  const box = $("#steps");
  if (!box.classList.contains("hidden")) return box.classList.add("hidden");
  if (!session || !session.cur || !session.cur.nums) return;
  box.innerHTML = solveSteps(session.cur.nums).map((t) => `<div class="term"><div class="term-head">${t.label}</div>` + t.moves.map((m) => `<div class="move">${m}</div>`).join("") + `<div class="move run">→ ${t.running.toLocaleString()}</div></div>`).join("");
  box.classList.remove("hidden");
});

/* ============================================================ フラッシュ暗算 */
let flashAnswer = null, flashBusy = false, flashSpec = null, flashGrade = null;
let flashExam = { on: false, idx: 0, N: 20, correct: 0 };
function startFlash(grade) {
  flashSpec = difficulty(grade, "flash"); flashGrade = grade; session = null;
  showView("play");
  $("#playSorobanWrap").classList.add("hidden"); $("#playInputWrap").classList.add("hidden"); $("#playFlashWrap").classList.remove("hidden");
  $("#playGrade").textContent = `${grade.key}／フラッシュ暗算`; $("#playTimer").textContent = ""; $("#playProgress").textContent = ""; $("#playProblem").textContent = "";
  $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashInfo").textContent = `${grade.key}：${flashSpec.digits}桁 ${flashSpec.terms}口 / 1問 ${flashSpec.sec.toFixed(1)}秒`;
  $("#flashDisplay").textContent = "▶ を押してスタート"; $("#flashForm").classList.add("hidden");
  flashExam = { on: $("#flashExamMode").checked, idx: 0, N: 20, correct: 0 };
}
$("#flashStart").addEventListener("click", () => { flashExam.on = $("#flashExamMode").checked; runFlash(); });
async function runFlash() {
  if (flashBusy || !flashSpec) return; flashBusy = true;
  $("#flashStart").disabled = true; $("#flashForm").classList.add("hidden"); $("#playResult").textContent = ""; $("#playResult").className = "result";
  $("#flashProgress").textContent = flashExam.on ? `検定 ${flashExam.idx + 1} / ${flashExam.N}　正解 ${flashExam.correct}` : "";
  const p = genFlashNums(flashSpec); flashAnswer = p.answer;
  const interval = Math.round((flashSpec.sec / flashSpec.terms) * 1000);
  const disp = $("#flashDisplay");
  for (const n of [3, 2, 1]) { disp.textContent = n; await sleep(450); }
  for (const v of p.nums) { disp.textContent = ""; await sleep(90); disp.textContent = v.toLocaleString(); await sleep(interval); }
  disp.textContent = "= ?"; $("#flashForm").classList.remove("hidden"); $("#flashInput").value = ""; $("#flashInput").focus();
  $("#flashStart").disabled = false; flashBusy = false;
}
$("#flashForm").addEventListener("submit", (e) => {
  e.preventDefault(); if (flashAnswer === null) return;
  const ok = parseInt($("#flashInput").value, 10) === flashAnswer; const res = $("#playResult"); $("#flashForm").classList.add("hidden");
  if (flashExam.on) {
    if (ok) flashExam.correct++; flashExam.idx++;
    if (flashExam.idx < flashExam.N) { res.textContent = ok ? "⭕" : `❌（${flashAnswer.toLocaleString()}）`; res.className = "result " + (ok ? "ok" : "ng"); setTimeout(runFlash, 800); }
    else { const score = flashExam.correct * 10, pass = score >= 140; let msg = `検定結果：${flashExam.correct}/20 正解　<b>${score}点 / 200点</b><br>${pass ? "🎉 合格！" : "不合格（140点以上で合格）"}`; if (pass) { touchStreak(); certify(flashGrade.key); msg += `<br>🎓 ${flashGrade.key} 認定！`; } renderProfile(); res.innerHTML = msg; res.className = "result " + (pass ? "ok" : "ng"); $("#flashProgress").textContent = ""; }
  } else { res.textContent = ok ? "⭕ 正解！すごい！" : `❌ おしい（答え: ${flashAnswer.toLocaleString()}）`; res.className = "result " + (ok ? "ok" : "ng"); if (ok) touchStreak(); }
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
    if (session && session.cf.answer === "soroban") {
      if (e.key === "Enter") { submitAnswer(currentSorobanAnswer()); e.preventDefault(); }
      else sorobanQuiz.handleKey(e);
    }
  }
});

/* ---------- 初期化 ---------- */
renderGrid();
updateInfo();
renderProfile();
