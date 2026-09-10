/* 先生の画面。保存は store.js（SKStore）に 任せる。 */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const S = window.SKStore;
  const SITE = "sorobankingdom.com";
  const SUBJ = { mitori: "みとり算", kake: "かけ算", wari: "わり算", anzan: "あんざん", flash: "フラッシュ暗算" };
  const MISS = { five: "五玉（5の友）", ten: "10の友（くり上がり）", keta: "位の ずれ", skip: "数を とばした", minus: "＋−の とりちがえ", kuku: "九九", other: "そのほか" };
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmtDate = (t) => { if (!t) return "—"; const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate(); };
  const daysAgo = (t) => t ? Math.floor((Date.now() - t) / 86400000) : null;
  const fmtSec = (s) => { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  let me = null, cur = null, curStudents = [], curStudent = null, signup = true;
  const screens = ["login", "classes", "class", "student"];
  function show(name) { screens.forEach((n) => $("#scr-" + n).classList.toggle("hidden", n !== name)); window.scrollTo(0, 0); updateGuide(name); }
  let lastClassCount = 0;

  /* ============================================================ 案内（つぎに やること）と 読み上げ
     どの画面でも、いま 何を すればいいかを 赤い見出しで 出す。
     押すべき ボタンを 赤く 光らせる。🔊 で ブラウザの 読み上げ（外部サービスは 使わない） */
  const STEPS = [
    { n: "①", t: "アカウントを 作る", s: "お名前、メールアドレス、自分で決めた 8文字以上の パスワードを 入れて、黒いボタン「アカウントを 作って はじめる」を 押します。2回目からは「ログインする」を 押します。" },
    { n: "②", t: "教室を 作る", s: "教室の 名前（例：月曜クラス）を 入れて、「教室を 作る」を 押します。クラスコードという 6文字が 出ます。" },
    { n: "③", t: "生徒の 名前を 入れる", s: "白い欄に、生徒の にっくねーむを 1行に 1人ずつ 書いて、「この名前を 登録する」を 押します。本名で なくて かまいません。" },
    { n: "④", t: "ログインカードを 印刷して 子どもに 渡す", s: "「ログインカードを 印刷」を 押すと、1人 1枚の カードが 出ます。子どもは カードのとおりに、アプリの「教室に 参加」で コードを 入れて、自分の 名前を えらびます。パスワードは ありません。" },
    { n: "⑤", t: "練習が 集まるのを 見る", s: "子どもが 家で 練習すると、この表に 自動で 入ります。名前を 押すと、まちがえ方の クセが 見えます。開きなおすときは「最新に」を 押します。" },
  ];
  function guideFor(name) {
    if (name === "login") return { i: 0, target: "#lgGo" };
    if (name === "classes") return lastClassCount ? { i: 1, t: "教室を ひらく", s: "一覧の 教室の 名前を 押すと、その教室の 画面に なります。新しい 教室は 下の欄から 作れます。", target: ".cls-item" } : { i: 1, target: "#ncName" };
    if (name === "class") {
      if (!curStudents.length) return { i: 2, target: "#addNicks" };
      const joined = curStudents.some((s) => (s.uids && s.uids.length) || s.lastSeen || (s.stat && s.stat.last));
      return joined ? { i: 4, target: null } : { i: 3, target: "#cardsBtn" };
    }
    if (name === "student") return { i: 4, t: "この子の 記録", s: "上は 今週と 通算の まとめ、下は 1回ごとの 記録です。「教室に もどる」で 一覧に 戻ります。", target: null };
    return null;
  }
  function updateGuide(name) {
    document.querySelectorAll(".spot").forEach((el) => el.classList.remove("spot"));
    const g = guideFor(name), bar = $("#guideBar");
    if (!g) { bar.classList.add("hidden"); return; }
    const st = STEPS[g.i];
    $("#guideStep").textContent = st.n;
    $("#guideTitle").textContent = g.t || st.t;
    $("#guideText").textContent = g.s || st.s;
    bar.classList.remove("hidden");
    if (g.target) { const el = document.querySelector(g.target); if (el) el.classList.add("spot"); }
  }
  /* ---- 読み上げ（ブラウザ内蔵） ---- */
  const canSpeak = "speechSynthesis" in window;
  function speak(text) {
    if (!canSpeak) { alert("この ブラウザは 読み上げに 対応していません"); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP"; u.rate = 0.92; u.pitch = 1;
      const v = window.speechSynthesis.getVoices().find((x) => /^ja/i.test(x.lang));
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) { console.error("読み上げに 失敗", e); }
  }
  function stopSpeak() { try { window.speechSynthesis.cancel(); } catch (e) { } }
  /* 説明文（.hint）に 🔊 を 自動で 付ける。data-say が あれば その文を 読む */
  (function addHintSpeakers() {
    if (!canSpeak) return;
    document.querySelectorAll(".hint").forEach((p) => {
      if (p.querySelector(".hint-speak")) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "hint-speak"; b.textContent = "🔊"; b.title = "読み上げる";
      b.setAttribute("aria-label", "この説明を 読み上げる");
      b.addEventListener("click", () => speak(p.dataset.say || p.textContent));
      p.appendChild(b);
    });
  })();
  $("#guideSpeak").addEventListener("click", () => speak(($("#guideStep").textContent + "。" + $("#guideTitle").textContent + "。" + $("#guideText").textContent).replace(/\s+/g, "")));
  /* ---- 使い方（ぜんぶの 手順） ---- */
  function openGuide() {
    $("#guideList").innerHTML = STEPS.map((s, i) => "<li><b>" + s.n + " " + esc(s.t) + "</b><span>" + esc(s.s) + '</span><button type="button" class="guide-speak small" data-i="' + i + '">🔊 読み上げる</button></li>').join("");
    document.querySelectorAll("#guideList .guide-speak").forEach((b) => b.addEventListener("click", () => { const s = STEPS[+b.dataset.i]; speak((s.n + "。" + s.t + "。" + s.s).replace(/\s+/g, "")); }));
    $("#guideLayer").classList.remove("hidden");
  }
  function closeGuide() { $("#guideLayer").classList.add("hidden"); stopSpeak(); }
  $("#helpBtn").addEventListener("click", openGuide);
  $("#guideAll").addEventListener("click", openGuide);
  $("#guideClose").addEventListener("click", closeGuide);
  $("#guideLayer").addEventListener("click", (e) => { if (e.target === $("#guideLayer")) closeGuide(); });
  $("#guideStop").addEventListener("click", stopSpeak);
  $("#guideReadAll").addEventListener("click", () => speak(STEPS.map((s) => s.n + "。" + s.t + "。" + s.s).join("。").replace(/\s+/g, "")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeGuide(); });

  /* ---------- モード表示 ---------- */
  if (S.mode === "local") {
    $("#modeNote").classList.remove("hidden");
    $("#modeNote").innerHTML = "<b>お試しモード</b>：Firebase の 設定が まだ 無いので、この端末の中だけで 動いています。作った教室や 生徒は この ブラウザにだけ 残ります。";
    document.querySelectorAll(".fb-only").forEach((el) => el.classList.add("hidden"));
    $("#lgEmail").required = false; $("#lgPw").required = false;
  } else {
    $("#lgEmail").required = true; $("#lgPw").required = true;
  }

  /* ---------- ログイン ---------- */
  S.onAuth(async (t) => {
    me = t;
    $("#whoami").textContent = t ? (t.name || t.email || "") : "";
    $("#logoutBtn").classList.toggle("hidden", !t);
    if (t) { await renderClasses(); show("classes"); } else show("login");
  });
  $("#lgToggle").addEventListener("click", (e) => {
    e.preventDefault();
    signup = !signup;
    $("#lgGo").textContent = signup ? "アカウントを 作って はじめる" : "ログイン";
    $("#lgToggle").textContent = signup ? "ログインする（アカウントを 持っている）" : "アカウントを 作る（はじめての先生）";
    $("#lgToggle").parentElement.firstChild.textContent = signup ? "2回目からは：" : "はじめての先生は：";
    const mt = $("#lgModeTitle"); if (mt) mt.textContent = signup ? "はじめての先生（アカウントを 作る）" : "ログイン（2回目から）";
    $("#lgName").parentElement.classList.toggle("hidden", !signup);
    $("#lgMsg").textContent = "";
    updateGuide("login");
  });
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#lgMsg").textContent = "";
    const name = $("#lgName").value.trim(), email = $("#lgEmail").value.trim(), pw = $("#lgPw").value;
    try {
      if (S.mode === "local") await S.signUp(email, pw, name || "先生");
      else if (signup) await S.signUp(email, pw, name);
      else await S.signIn(email, pw);
    } catch (err) { $("#lgMsg").textContent = friendly(err); $("#lgMsg").className = "result ng"; }
  });
  $("#logoutBtn").addEventListener("click", () => S.signOut());
  // パスワードの 目のマーク：おすたび 表示 ⇄ 非表示
  const eye = $("#lgPwEye");
  if (eye) eye.addEventListener("click", () => {
    const pw = $("#lgPw"), show = pw.type === "password";
    pw.type = show ? "text" : "password";
    eye.textContent = show ? "🙈" : "👁";
    eye.setAttribute("aria-label", show ? "パスワードを 隠す" : "パスワードを 表示する");
    pw.focus();
  });
  const rs = $("#lgReset");
  if (rs) rs.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#lgEmail").value.trim();
    if (!email) { $("#lgMsg").textContent = "上に メールアドレスを 入れてから おしてください"; $("#lgMsg").className = "result ng"; return; }
    try { await S.sendReset(email); $("#lgMsg").textContent = "パスワードを 作りなおす メールを " + email + " に 送りました。届かないときは 迷惑メールも 見てください。"; $("#lgMsg").className = "result ok"; }
    catch (err) { $("#lgMsg").textContent = friendly(err); $("#lgMsg").className = "result ng"; }
  });
  function friendly(err) {
    const c = (err && err.code) || "";
    if (c.includes("email-already-in-use")) return "その メールアドレスは 登録ずみです。「ログイン」から 入ってください。";
    if (c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("user-not-found")) return "メールアドレスか パスワードが ちがいます。";
    if (c.includes("weak-password")) return "パスワードは 8文字以上に してください。";
    if (c.includes("invalid-email")) return "メールアドレスの 形が ちがいます。";
    if (c.includes("network")) return "通信が できません。電波を たしかめてください。";
    return "うまく いきませんでした：" + ((err && err.message) || err);
  }

  /* ---------- 教室の一覧 ---------- */
  async function renderClasses() {
    const list = await S.listClasses();
    lastClassCount = list.length;
    $("#classList").innerHTML = list.length
      ? list.map((c) => '<button class="cls-item" data-id="' + c.id + '"><b>' + esc(c.name) + "</b><span>コード " + esc(c.code) + "</span><small>" + fmtDate(c.createdAt) + " 作成</small></button>").join("")
      : '<p class="cls-empty">まだ 教室が ありません。下から 作ってください。</p>';
    document.querySelectorAll(".cls-item").forEach((b) => b.addEventListener("click", () => openClass(b.dataset.id)));
  }
  $("#newClassForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#ncName").value.trim(); if (!name) return;
    $("#ncName").value = "";
    const c = await S.createClass(name);
    await openClass(c.id);
  });

  /* ---------- 教室 ---------- */
  async function openClass(cid) {
    cur = await S.getClass(cid); if (!cur) return renderClasses();
    $("#clsName").textContent = cur.name;
    $("#clsCode").textContent = cur.code;
    await renderStudents();
    $("#cardsOut").classList.add("hidden");
    show("class");
  }
  $("#backClasses").addEventListener("click", async (e) => { e.preventDefault(); await renderClasses(); show("classes"); });
  $("#reloadBtn").addEventListener("click", () => openClass(cur.id));
  $("#clsDelete").addEventListener("click", async () => {
    if (!confirm("「" + cur.name + "」を 消します。生徒と 記録も 消えます。よろしいですか？")) return;
    await S.deleteClass(cur.id); cur = null; await renderClasses(); show("classes");
  });
  async function renderStudents() {
    curStudents = await S.listStudents(cur.id);
    if (!curStudents.length) { $("#studentTable").innerHTML = '<p class="cls-empty">まだ 生徒が いません。下の欄に 名前を 入れて 追加してください。</p>'; return; }
    const rows = curStudents.map((s) => {
      const st = s.stat || {}, ago = daysAgo(st.last || s.lastSeen);
      const last = st.last ? fmtDate(st.last) + (ago >= 3 ? ' <span class="st-warn">' + ago + "日前</span>" : "") : '<span class="st-none">まだ</span>';
      const acc = st.acc7 == null ? '<span class="st-none">—</span>' : (st.acc7 >= 80 ? '<span class="st-ok">' : st.acc7 < 60 ? '<span class="st-warn">' : "<span>") + st.acc7 + "%</span>";
      const topMiss = Object.entries(st.miss7 || {}).sort((a, b) => b[1] - a[1])[0];
      return "<tr><td>" + '<button class="st-link" data-id="' + s.id + '">' + esc(s.nick) + "</button></td>" +
        '<td class="num">' + (st.n7 || 0) + "</td><td>" + acc + "</td><td>" + last + "</td><td>" + (st.lastG ? esc(st.lastG) : "") + "</td>" +
        "<td>" + (topMiss ? esc(MISS[topMiss[0]] || topMiss[0]) + " ×" + topMiss[1] : '<span class="st-none">—</span>') + "</td>" +
        '<td><button class="x" data-id="' + s.id + '" title="消す">✕</button></td></tr>';
    }).join("");
    $("#studentTable").innerHTML = '<div class="doc-table"><table class="rec-table"><tr><th>名前</th><th>今週の セット</th><th>正答率</th><th>最後に 練習</th><th>級</th><th>いちばん多い まちがい</th><th></th></tr>' + rows + "</table></div>" +
      '<p class="sub">「今週」は きょうから 7日間。生徒が アプリで 練習すると、ここに 自動で 入ります。</p>';
    document.querySelectorAll("#studentTable .st-link").forEach((b) => b.addEventListener("click", () => openStudent(b.dataset.id)));
    document.querySelectorAll("#studentTable .x").forEach((b) => b.addEventListener("click", async () => {
      const s = curStudents.find((x) => x.id === b.dataset.id);
      if (!confirm("「" + s.nick + "」を 消します。記録も 消えます。よろしいですか？")) return;
      await S.removeStudent(cur.id, s.id); await renderStudents();
    }));
  }
  $("#addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nicks = $("#addNicks").value.split(/\r?\n/).map((x) => x.trim().slice(0, 20)).filter(Boolean).slice(0, 60);
    if (!nicks.length) return;
    const have = new Set(curStudents.map((s) => s.nick));
    const fresh = nicks.filter((n) => !have.has(n));
    if (fresh.length) await S.addStudents(cur.id, fresh);
    $("#addNicks").value = "";
    await renderStudents();
    updateGuide("class");
  });

  /* ---------- ログインカード ---------- */
  $("#cardsBtn").addEventListener("click", () => {
    if (!curStudents.length) { alert("先に 生徒を 追加してください"); return; }
    const card = (s) => '<div class="lc"><div class="lc-head"><img src="../assets/logo.png" alt="">そろばんキングダム ログインカード</div>' +
      '<div class="lc-nick">' + esc(s.nick) + '</div><div class="lc-cls">' + esc(cur.name) + "</div>" +
      '<div class="lc-code">クラスコード<b>' + esc(cur.code) + "</b></div>" +
      '<div class="lc-steps">① スマホか パソコンで <span class="lc-url">' + SITE + "</span> を ひらく<br>② メニューの「🏫 教室に 参加」を おす<br>③ 上の コードを 入れて、じぶんの 名前を えらぶ</div></div>";
    const sheets = [];
    for (let i = 0; i < curStudents.length; i += 8) sheets.push('<div class="lc-sheet">' + curStudents.slice(i, i + 8).map(card).join("") + "</div>");
    $("#cardsOut").innerHTML = sheets.join("");
    $("#cardsOut").classList.remove("hidden");
    document.body.classList.add("print-cards");
    setTimeout(() => { try { window.print(); } catch (e) { } setTimeout(() => document.body.classList.remove("print-cards"), 500); }, 50);
  });

  /* ---------- 生徒 ---------- */
  async function openStudent(sid) {
    curStudent = curStudents.find((s) => s.id === sid); if (!curStudent) return;
    $("#stName").textContent = curStudent.nick;
    const list = await S.listSessions(cur.id, sid, 300);
    const st = S.statOf(list);
    const all = list.length, N = list.reduce((a, e) => a + (e.N || 0), 0), C = list.reduce((a, e) => a + (e.correct || 0), 0);
    $("#stSummary").innerHTML =
      "<div><b>" + (st.n7 || 0) + "</b><span>今週の セット</span></div>" +
      "<div><b>" + (st.acc7 == null ? "—" : st.acc7 + "%") + "</b><span>今週の 正答率</span></div>" +
      "<div><b>" + all + "</b><span>これまでの セット</span></div>" +
      "<div><b>" + (N ? Math.round((C / N) * 100) + "%" : "—") + "</b><span>通算の 正答率</span></div>" +
      "<div><b>" + (st.last ? fmtDate(st.last) : "—") + "</b><span>最後に 練習</span></div>";
    const miss = {}; list.forEach((e) => (e.miss || []).forEach((m) => { miss[m.k || "other"] = (miss[m.k || "other"] || 0) + 1; }));
    const ent = Object.entries(miss).sort((a, b) => b[1] - a[1]), mx = ent.length ? ent[0][1] : 1;
    $("#stMiss").innerHTML = ent.length
      ? "<h2>まちがえ方の クセ（通算）</h2>" + ent.map(([k, v]) => '<div class="miss-bar"><span style="width:160px">' + esc(MISS[k] || k) + '</span><i style="width:' + Math.max(6, Math.round((v / mx) * 220)) + 'px"></i><span>' + v + "回</span></div>").join("")
      : '<p class="cls-empty">まちがいの 記録は まだ ありません。</p>';
    $("#stSessions").innerHTML = list.length
      ? '<div class="doc-table"><table class="rec-table"><tr><th>日</th><th>級</th><th>しゅもく</th><th>正解</th><th>タイム</th><th>まちがい</th></tr>' +
        list.slice().reverse().slice(0, 100).map((e) => "<tr><td>" + esc(e.d || fmtDate(e.t)) + "</td><td>" + esc(e.g || "") + "</td><td>" + esc(SUBJ[e.subj] || e.subj) + '</td><td class="num">' + e.correct + " / " + e.N + '</td><td class="num">' + fmtSec(e.sec) + "</td><td>" +
          (e.miss || []).map((m) => esc(MISS[m.k] || m.k || "")).filter(Boolean).join("・") + "</td></tr>").join("") + "</table></div>"
      : '<p class="cls-empty">まだ 記録が ありません。生徒が アプリで 練習すると 入ります。</p>';
    show("student");
  }
  $("#backClass").addEventListener("click", (e) => { e.preventDefault(); openClass(cur.id); });
})();
