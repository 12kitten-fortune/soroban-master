/* 先生の画面。保存は store.js（SKStore）に 任せる。 */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const S = window.SKStore;
  const SITE = "sorobankingdom.com";
  const SUBJ = { mitori: T("みとり算"), kake: T("かけ算"), wari: T("わり算"), anzan: T("あんざん"), flash: T("フラッシュ暗算") };
  const MISS = { five: T("五玉（5の友）"), ten: T("10の友（くり上がり）"), keta: T("位の ずれ"), skip: T("数を とばした"), minus: T("＋−の とりちがえ"), kuku: T("九九"), other: T("そのほか") };
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmtDate = (t) => { if (!t) return "—"; const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate(); };
  const daysAgo = (t) => t ? Math.floor((Date.now() - t) / 86400000) : null;
  const fmtSec = (s) => { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  let me = null, cur = null, curStudents = [], curStudent = null, signup = true;
  // 画面：login → classes（1／4 教室の名前）→ add（2／4 生徒の名前）→ cards（3／4 印刷 → 4／4 渡す）→ class（ふだんの 画面）→ student
  const screens = ["login", "classes", "add", "cards", "class", "student"];
  function show(name) { screens.forEach((n) => $("#scr-" + n).classList.toggle("hidden", n !== name)); window.scrollTo(0, 0); updateGuide(name); }
  let lastClassCount = 0;
  let cardsPrinted = false;   // カードの 画面で 印刷したか（4／4 に 進める）

  /* ============================================================ 案内（つぎに やること）と 読み上げ
     どの画面でも、いま 何を すればいいかを 赤い見出しで 1つだけ 出す。
     押すべき ボタンを 赤く 光らせる。🔊 で ブラウザの 読み上げ（外部サービスは 使わない） */
  const STEPS = [
    { n: T("はじめに"), t: T("先生の 登録"), s: T("お名前、メールアドレス、自分で決めた 8文字以上の パスワードを 入れて、黒いボタンを 押します。2回目からは「ログインする」を 押します。") },
    { n: "1／4", t: T("教室の 名前を 入れる"), s: T("教室の 名前（例：月曜クラス）を 入れて、黒いボタンを 押します。") },
    { n: "2／4", t: T("生徒の 名前を 入れる"), s: T("白い欄に 生徒の 名前を 書いて、黒いボタンを 押します。2人以上は 1行に 1人ずつ。本名で なくて かまいません。") },
    { n: "3／4", t: T("カードを 印刷する"), s: T("「印刷する」を 押すと、1人 1枚の ログインカードが 出ます。印刷の 窓が 出たら「印刷」を 押します。") },
    { n: "4／4", t: T("カードを 子どもに 渡す"), s: T("子どもは カードのとおりに、アプリの「教室に 参加」で 6文字を 入れて、自分の 名前を えらびます。パスワードは ありません。家で 練習すると、教室の 画面に 自動で 出ます。") },
    { n: T("そのあと"), t: T("練習が 集まるのを 見る"), s: T("子どもが 家で 練習すると、生徒の 表に 自動で 入ります。名前を 押すと、まちがえ方の クセが 見えます。開きなおすときは「表を 新しくする」を 押します。") },
    { n: T("そのあと"), t: T("宿題を 出す"), s: T("「宿題を 出す」を ひらいて、しゅもくと 級、何セット やるかを えらび、黒いボタンを 押します。子どもの ホーム画面に「先生からの 宿題」として 出て、やった ぶんは 生徒の 表に 自動で 入ります。") },
  ];
  let curHw = [];
  const anyJoined = () => curStudents.some((s) => (s.uids && s.uids.length) || s.lastSeen || (s.stat && s.stat.last));
  function guideFor(name) {
    if (name === "login") return { i: 0, target: "#lgGo" };
    if (name === "classes") return lastClassCount ? { i: 1, t: T("教室を ひらく"), s: T("一覧の 教室の 名前を 押すと、その教室の 画面に なります。新しい 教室は 下の 欄から 作れます。"), target: ".cls-item" } : { i: 1, target: "#ncGo" };
    if (name === "add") return curStudents.length
      ? { i: 2, t: T("登録できました"), s: T("まだ 入れる 子が いれば「もう1人 足す」。ぜんぶ 入れたら「つぎへ：カードを 印刷する」を 押します。"), target: "#addNext" }
      : { i: 2, target: "#addNicks" };
    if (name === "cards") return cardsPrinted ? { i: 4, target: "#cardsToClass" } : { i: 3, target: "#cardsBtn" };
    if (name === "class") {
      if (!curStudents.length) return { i: 2, s: T("「＋ 生徒を 足す」を 押します。"), target: "#toAddBtn" };
      if (!anyJoined()) return { i: 4, s: T("カードを 子どもに 渡してください。子どもが 家で 練習すると、下の 表に 自動で 出ます。まだ 印刷していなければ「カードを 印刷」を 押します。"), target: null };
      return curHw.length ? { i: 5, target: null } : { i: 6, target: "#hwFold" };
    }
    if (name === "student") return { i: 5, t: T("この子の 記録"), s: T("上は 今週と 通算の まとめ、下は 1回ごとの 記録です。「教室に もどる」で 一覧に 戻ります。"), target: null };
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
    if (!canSpeak) { alert(T("この ブラウザは 読み上げに 対応していません")); return; }
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
      b.type = "button"; b.className = "hint-speak"; b.textContent = "🔊"; b.title = T("読み上げる");
      b.setAttribute("aria-label", T("この説明を 読み上げる"));
      b.addEventListener("click", () => speak(p.dataset.say || p.textContent));
      p.appendChild(b);
    });
  })();
  $("#guideSpeak").addEventListener("click", () => speak(($("#guideStep").textContent + "。" + $("#guideTitle").textContent + "。" + $("#guideText").textContent).replace(/\s+/g, "")));
  /* ---- 使い方（ぜんぶの 手順） ---- */
  function openGuide() {
    $("#guideList").innerHTML = STEPS.map((s, i) => "<li><b>" + s.n + " " + esc(s.t) + "</b><span>" + esc(s.s) + '</span><button type="button" class="guide-speak small" data-i="' + i + T('">🔊 読み上げる</button></li>')).join("");
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
    $("#modeNote").innerHTML = T("<b>お試しモード</b>：Firebase の 設定が まだ 無いので、この端末の中だけで 動いています。作った教室や 生徒は この ブラウザにだけ 残ります。");
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
    renderPlan();
    if (t) { await renderClasses(); show("classes"); } else show("login");
  });
  /* ---------- プラン（人数の 上限・のこり日数）。先生は 自分で 変えられない＝運営者が 入れる ---------- */
  function renderPlan() {
    const el = $("#planNote"); if (!el) return;
    if (!me) { el.classList.add("hidden"); return; }
    const p = S.planInfo(me);
    let s = T("<b>いまの プラン：") + esc(p.name) + T("</b>（") + (p.home ? T("お子さま ") : T("生徒 ")) + p.max + T("人まで");
    if (p.until) s += T("・") + (p.expired ? T("期限が すぎています") : T("あと ") + p.daysLeft + T("日")) ;
    s += T("）");
    if (p.key === "trial") s += T('　<a href="../kyoshitsu.html#plans" target="_blank" rel="noopener">教室プラン（40人）・スクールプラン（150人）を 見る</a>');
    // 家庭プラン：この画面は「おうちの 先生画面」。2人目からは 追加の お申し込み
    if (p.home) s += T('　<a href="../katei.html#next" target="_blank" rel="noopener">おうちでの 使い方</a>・<a href="../katei.html#plans" target="_blank" rel="noopener">2人目からの お申し込み（＋1,490円）</a>');
    if (p.expired) s += T("<br>おためしの 期間が おわりました。記録は 見られますが、生徒の 追加は できません。つづける ときは 上の プランへ。");
    el.innerHTML = s; el.classList.remove("hidden"); el.classList.toggle("over", !!p.expired);
  }
  $("#lgToggle").addEventListener("click", (e) => {
    e.preventDefault();
    signup = !signup;
    $("#lgGo").textContent = signup ? T("アカウントを 作って はじめる") : T("ログイン");
    $("#lgToggle").textContent = signup ? T("ログインする（アカウントを 持っている）") : T("アカウントを 作る（はじめての先生）");
    $("#lgToggle").parentElement.firstChild.textContent = signup ? T("2回目からは：") : T("はじめての先生は：");
    const mt = $("#lgModeTitle"); if (mt) mt.textContent = signup ? T("はじめての先生（アカウントを 作る）") : T("ログイン（2回目から）");
    $("#lgName").parentElement.classList.toggle("hidden", !signup);
    $("#lgMsg").textContent = "";
    updateGuide("login");
  });
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#lgMsg").textContent = "";
    const name = $("#lgName").value.trim(), email = $("#lgEmail").value.trim(), pw = $("#lgPw").value;
    try {
      if (S.mode === "local") await S.signUp(email, pw, name || T("先生"));
      else if (signup) await S.signUp(email, pw, name);
      else await S.signIn(email, pw);
    } catch (err) { $("#lgMsg").textContent = friendly(err); $("#lgMsg").className = "result ng"; }
  });
  $("#logoutBtn").addEventListener("click", () => S.signOut());
  // パスワードの 目のマーク：おすたび 表示 ⇄ 非表示
  // 目のマーク：絵文字は 出ない 端末が あるので、SVGの 絵＋文字に する
  const EYE_OPEN = "<svg class=\"pw-ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 5C6.5 5 2.7 9.1 1.5 11.3a1.4 1.4 0 0 0 0 1.4C2.7 14.9 6.5 19 12 19s9.3-4.1 10.5-6.3a1.4 1.4 0 0 0 0-1.4C21.3 9.1 17.5 5 12 5z\"/><circle class=\"pw-pupil\" cx=\"12\" cy=\"12\" r=\"3.4\"/></svg>";
  const EYE_OFF  = "<svg class=\"pw-ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 5C6.5 5 2.7 9.1 1.5 11.3a1.4 1.4 0 0 0 0 1.4C2.7 14.9 6.5 19 12 19s9.3-4.1 10.5-6.3a1.4 1.4 0 0 0 0-1.4C21.3 9.1 17.5 5 12 5z\"/><circle class=\"pw-pupil\" cx=\"12\" cy=\"12\" r=\"3.4\"/><path class=\"pw-slash\" d=\"M3.5 3.5 L20.5 20.5\"/></svg>";
  const eye = $("#lgPwEye");
  if (eye) eye.addEventListener("click", () => {
    const pw = $("#lgPw"), show = pw.type === "password";
    pw.type = show ? "text" : "password";
    eye.innerHTML = (show ? EYE_OFF : EYE_OPEN) + '<span class="pw-word">' + (show ? T("かくす") : T("見る")) + "</span>";
    eye.classList.toggle("on", show);
    eye.setAttribute("aria-label", show ? T("パスワードを 隠す") : T("パスワードを 表示する"));
    pw.focus();
  });
  const rs = $("#lgReset");
  if (rs) rs.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = $("#lgEmail").value.trim();
    if (!email) { $("#lgMsg").textContent = T("上に メールアドレスを 入れてから おしてください"); $("#lgMsg").className = "result ng"; return; }
    try { await S.sendReset(email); $("#lgMsg").textContent = T("パスワードを 作りなおす メールを ") + email + T(" に 送りました。届かないときは 迷惑メールも 見てください。"); $("#lgMsg").className = "result ok"; }
    catch (err) { $("#lgMsg").textContent = friendly(err); $("#lgMsg").className = "result ng"; }
  });
  function friendly(err) {
    const c = (err && err.code) || "";
    if (c.includes("email-already-in-use")) return T("その メールアドレスは 登録ずみです。「ログイン」から 入ってください。");
    if (c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("user-not-found")) return T("メールアドレスか パスワードが ちがいます。");
    if (c.includes("weak-password")) return T("パスワードは 8文字以上に してください。");
    if (c.includes("invalid-email")) return T("メールアドレスの 形が ちがいます。");
    if (c.includes("network")) return T("通信が できません。電波を たしかめてください。");
    return T("うまく いきませんでした：") + ((err && err.message) || err);
  }

  /* ---------- 教室の一覧 ---------- */
  async function renderClasses() {
    const list = await S.listClasses();
    lastClassCount = list.length;
    // 教室が まだ 無いときは 一覧を 出さず、「教室の 名前を 入れる」だけ（1／4）
    $("#classListCard").classList.toggle("hidden", !list.length);
    $("#ncTitle").textContent = list.length ? T("新しい 教室を 作る") : T("教室の 名前を 入れる");
    $("#classList").innerHTML = list.map((c) => '<button class="cls-item" data-id="' + c.id + '"><b>' + esc(c.name) + "</b><small>" + fmtDate(c.createdAt) + T(" 作成</small></button>")).join("");
    document.querySelectorAll(".cls-item").forEach((b) => b.addEventListener("click", () => openClass(b.dataset.id)));
  }
  /* ---------- 級の基準（級体系）：docs/curriculum/sk.js の 表から えらぶ ---------- */
  const CURS = window.SK_CURRICULA || {};
  const CUR_ORDER = (window.SK_CURRICULUM_ORDER || Object.keys(CURS)).filter((k) => CURS[k]);
  const CHECK = window.SK_CURRICULUM_CHECK || ((c) => c);
  // いまの 教室で 使う 表。custom＝この教室だけの 表（classes.curriculum）。こわれていたら 標準
  const curOf = (preset) => {
    if (preset === "custom") return (cur && cur.curriculum && CHECK(cur.curriculum)) || CURS.sk;
    return CURS[preset] || CURS.sk || { name: T("標準"), grades: [] };
  };
  const presetOptions = (sel, withCustom) => CUR_ORDER.map((k) => '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + esc(T(CURS[k].name)) + "</option>").join("") +
    (withCustom ? '<option value="custom"' + (sel === "custom" ? " selected" : "") + T(">✏️ この教室だけの 表（自分で 決める）</option>") : "");
  function fillHwGrades(preset) {
    const keys = curOf(preset).grades.map((g) => g.key);
    const def = keys.includes("10級") ? "10級" : keys[0];
    $("#hwGrade").innerHTML = keys.map((g) => '<option value="' + esc(g) + '"' + (g === def ? " selected" : "") + ">" + esc(g) + "</option>").join("");
  }
  const presetNote = (preset) => { const c = curOf(preset); return c.grades.length + T("段階（") + c.grades[0].key + "〜" + c.grades.slice(-1)[0].key + T("）") + (c.note ? "　※ " + T(c.note) : ""); };

  /* ---------- 級体系の くらべ表（めやす） ----------
     級ごとの「むずかしさの 点数」を 桁・口・かけ算わり算の 桁から 出し、標準の 級の ものさしに 当てはめる。
     公式の 互換では ない。「標準の 6級 ≒ 日商風の 6級 ≒ UCMAS風の Intermediate B」のような 見当を つけるため。 */
  // そろばんで 答える しゅもく（珠算）と 頭の中で 計算する しゅもく（暗算）は 別の ものさしで くらべる
  function gradeScore(c, g) {
    const isInput = (k) => !!(c.subjects && c.subjects[k] && c.subjects[k].answer === "input");
    const vs = (s) => (s && s.variants) ? s.variants : (s ? [s] : []);
    let soro = 0, anz = 0;
    const put = (k, val) => { if (isInput(k)) anz = Math.max(anz, val); else soro = Math.max(soro, val); };
    vs(g.mitori).forEach((v) => put("mitori", v.digits * 10 + v.terms));
    vs(g.anzan).forEach((v) => put("anzan", v.digits * 10 + v.terms));
    vs(g.kake).forEach((v) => put("kake", (v.a + v.b) * 7));
    vs(g.wari).forEach((v) => put("wari", (v.dv + (v.qd || 1)) * 7));
    return { soro, anz };
  }
  function renderCompare() {
    const body = $("#curCompareBody"); if (!body) return;
    const base = CURS.sk; if (!base) return;
    // 標準の ものさし（珠算・暗算 それぞれ。上の級ほど 大きく なるよう ならす）
    let rs = -1, ra = -1;
    const scale = base.grades.map((g) => { const s = gradeScore(base, g); rs = Math.max(rs + 0.01, s.soro); ra = Math.max(ra + 0.01, s.anz); return { key: g.key, soro: rs, anz: ra }; });
    const others = CUR_ORDER.filter((k) => k !== "sk" && k !== "sk10").map((k) => CURS[k]);
    if (cur && cur.preset === "custom" && cur.curriculum && CHECK(cur.curriculum)) others.push(CHECK(cur.curriculum));
    const cell = {}; others.forEach((c, ci) => {
      let r = -1, prevRow = -1;
      c.grades.forEach((g) => {
        const s = gradeScore(c, g), useSoro = s.soro > 0, v = useSoro ? s.soro : s.anz; r = Math.max(r + 0.01, v);
        let best = 0; scale.forEach((x, i) => { const xv = useSoro ? x.soro : x.anz; if (Math.abs(xv - r) < Math.abs((useSoro ? scale[best].soro : scale[best].anz) - r)) best = i; });
        // 同じ 級体系の 中では 上の級ほど 下の行に（桁が 同じで 合格点だけ ちがう 段位などが 1つの 行に かたまらないように）
        if (best <= prevRow) best = Math.min(scale.length - 1, prevRow + 1);
        prevRow = best;
        (cell[best + ":" + ci] = cell[best + ":" + ci] || []).push(g.key);
      });
    });
    body.innerHTML = T('<p class="hint-inline">桁・口数・かけ算わり算の 桁から 出した めやすです（そろばんで 答える 級は 標準の 珠算と、頭の中で 計算する 級は 標準の あんざんと くらべる）。公式の 互換では ありません。同じ行＝だいたい 同じ むずかしさ。</p>') +
      T('<div class="ce-wrap"><table class="ce cmp"><tr><th>標準</th>') + others.map((c) => "<th>" + esc(T(c.name).replace(/（.*?）/g, "")) + "</th>").join("") + "</tr>" +
      scale.map((s, i) => "<tr><td><b>" + esc(s.key) + "</b></td>" + others.map((c, ci) => "<td>" + (cell[i + ":" + ci] || []).map(esc).join("<br>") + "</td>").join("") + "</tr>").join("") + "</table></div>";
  }
  $("#curCompare").addEventListener("toggle", () => { if ($("#curCompare").open) renderCompare(); });
  // 教室を 作る（級の基準は 標準。あとから「くわしい 設定」で 変えられる）。作れたら 生徒の 名前の 画面へ 自動で 進む
  $("#newClassForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#ncName").value.trim(), msg = $("#ncMsg"); if (!name) return;
    msg.textContent = ""; msg.className = "result";
    $("#ncGo").disabled = true;
    try {
      const c = await S.createClass(name, "sk");
      $("#ncName").value = "";
      await loadClass(c.id);
      show("add");
    } catch (err) {
      console.error("教室を 作れませんでした", err);
      msg.textContent = saveFail(); msg.className = "result ng";
    } finally { $("#ncGo").disabled = false; }
  });
  // 保存に 失敗したときの 文（英語の 文は 出さない）
  const saveFail = () => T("保存できませんでした。もう一度 押してください。それでも だめなら、電波を たしかめてください。");
  $("#clsPreset").addEventListener("change", async () => {
    if (!cur) return;
    const preset = $("#clsPreset").value;
    if (preset === "custom") {
      // はじめて えらんだときは、いまの 表を 写して 出発点に する
      if (!cur.curriculum || !CHECK(cur.curriculum)) {
        const base = curOf(cur.preset && cur.preset !== "custom" ? cur.preset : "sk");
        cur.curriculum = JSON.parse(JSON.stringify(Object.assign({}, base, { id: "custom", name: cur.name + T("の 基準"), note: "" })));
      }
      await S.updateClass(cur.id, { preset: "custom", curriculum: cur.curriculum }); cur.preset = "custom";
      renderCurEditor();
    } else {
      await S.updateClass(cur.id, { preset }); cur.preset = preset;
      $("#curEditor").classList.add("hidden");
    }
    fillHwGrades(cur.preset);
    $("#clsPresetNote").textContent = T("保存しました。子どもの アプリは つぎに ひらいたとき「") + curOf(cur.preset).name + T("」の 級に なります（") + curOf(cur.preset).grades.length + T("段階）");
  });

  /* ---------- 教室だけの 級の表を 直す（段階3） ----------
     表は 1行＝1つの 級。しゅもくごとに「あり／なし」と 桁・口 などを 入れる。
     「保存」で 検査（SK_CURRICULUM_CHECK）して Firestore へ。子どもの アプリは つぎに ひらいたとき その表に なる。 */
  const SPEC_TXT = (s, kind) => {
    if (!s) return "";
    if (kind === "kake") return s.a + T("桁×") + s.b + T("桁");
    if (kind === "wari") return s.D + T("桁÷") + s.dv + T("桁");
    if (kind === "flash") return s.digits + T("桁") + s.terms + T("口 ") + (s.pace / 1000).toFixed(2) + T("秒");
    if (s.variants) return s.variants.map((v) => v.digits + T("桁") + v.terms + T("口")).join("/");
    return s.digits + T("桁") + s.terms + (s.termsMax ? "〜" + s.termsMax : "") + T("口") + (s.sub === false ? T("（＋のみ）") : "") + (s.label ? T("（") + s.label + T("）") : "");
  };
  function renderCurEditor() {
    const box = $("#curEditor"); if (!box) return;
    const c = cur.curriculum; if (!c) { box.classList.add("hidden"); return; }
    const num = (cls, v, extra) => '<input type="number" class="' + cls + '" value="' + (v == null ? "" : v) + '" ' + (extra || "") + " />";
    const chk = (cls, on) => '<input type="checkbox" class="' + cls + '"' + (on ? " checked" : "") + " />";
    const rows = c.grades.map((g, i) => {
      const m = g.mitori, k0 = g.kake, w0 = g.wari, a = g.anzan, f = g.flash;
      const mv = m && m.variants ? m.variants[0] : m, av = a && a.variants ? a.variants[0] : a;
      const k = k0 && k0.variants ? k0.variants[0] : k0, w = w0 && w0.variants ? w0.variants[0] : w0;   // かけ・わりの variants は 1つ目を 見せる
      const special = (m && (m.variants || m.sumMax != null || m.sumMin != null || m.sumExact != null)) || (a && (a.variants || a.sumMax != null || a.sumMin != null || a.sumExact != null)) || (k0 && k0.variants) || (w0 && w0.variants);
      return '<tr data-i="' + i + '" class="' + (m ? "" : "off-mitori ") + (k ? "" : "off-kake ") + (w ? "" : "off-wari ") + (a ? "" : "off-anzan ") + (f ? "" : "off-flash") + '">' +
        '<td><input type="text" class="ce-key" value="' + esc(g.key) + '" maxlength="20" /></td>' +
        '<td class="grp">' + chk("m-on", !!m) + "</td><td>" + num("m-in m-d", mv && mv.digits, 'min="1" max="15"') + "</td><td>" + num("m-in m-t", mv && mv.terms, 'min="2" max="30"') + "</td><td>" + '<input type="checkbox" class="m-in m-sub"' + (m && m.sub !== false ? " checked" : "") + " /></td>" +
        '<td class="grp">' + chk("k-on", !!k) + "</td><td>" + num("k-in k-a", k && k.a, 'min="1" max="12"') + "</td><td>" + num("k-in k-b", k && k.b, 'min="1" max="12"') + "</td>" +
        '<td class="grp">' + chk("w-on", !!w) + "</td><td>" + num("w-in w-D", w && w.D, 'min="1" max="20"') + "</td><td>" + num("w-in w-dv", w && w.dv, 'min="1" max="12"') + "</td><td>" + num("w-in w-qd", w && w.qd, T('min="1" max="12" placeholder="－"')) + "</td>" +
        '<td class="grp">' + chk("a-on", !!a) + "</td><td>" + num("a-in a-d", av && av.digits, 'min="1" max="15"') + "</td><td>" + num("a-in a-t", av && av.terms, 'min="2" max="30"') + "</td><td>" + '<input type="checkbox" class="a-in a-sub"' + (a && a.sub !== false ? " checked" : "") + " /></td>" +
        '<td class="grp">' + chk("f-on", !!f) + "</td><td>" + num("f-in f-d", f && f.digits, 'min="1" max="5"') + "</td><td>" + num("f-in f-t", f && f.terms, 'min="2" max="30"') + "</td><td>" + num("f-in f-p", f ? Math.round(f.pace) / 1000 : "", 'min="0.2" max="5" step="0.05"') + "</td>" +
        T('<td class="grp ce-row-btns"><button type="button" class="ghost ce-up" title="上へ">↑</button><button type="button" class="ghost ce-down" title="下へ">↓</button><button type="button" class="ghost ce-copy" title="この級を 写して 下に 足す">＋</button><button type="button" class="ghost ce-del" title="この級を 消す">✕</button>') +
        (special ? T('<div class="ce-note">※特別な形（') + esc([m && SPEC_TXT(m, "mitori"), k0 && k0.variants && k0.variants.map((v) => v.a + "×" + v.b).join("/"), w0 && w0.variants && w0.variants.map((v) => v.D + "÷" + v.dv).join("/")].filter(Boolean).join("、")) + T("）。数字を 変えると ふつうの 形に なります</div>") : "") + "</td></tr>";
    }).join("");
    const sj = c.subjects || {};
    const subjRow = (k, label) => sj[k] && sj[k].N != null ? '<label>' + label + T("：") + num("s-N", sj[k].N, 'data-k="' + k + '" min="1" max="100"') + T("問・") + num("s-min", Math.round(sj[k].limit / 60), 'data-k="' + k + '" min="1" max="60"') + T("分・合格") + num("s-pass", sj[k].pass, 'data-k="' + k + '" min="0" max="10000"') + T("点（1問") + sj[k].per + T("点）</label>") : "";
    box.innerHTML = T('<div class="ce-head"><b>✏️ この教室だけの 級の表</b><label>名前 <input type="text" id="ceName" value="') + esc(c.name || "") + '" maxlength="30" /></label>' +
      T('<span class="hint-inline">上が やさしい級・下が むずかしい級。しゅもくが 無い 級は チェックを 外す。数字は 桁と 口（たす数の 個数）。</span></div>') +
      T('<div class="ce-wrap"><table class="ce"><tr><th>級の 名前</th><th class="grp">みとり</th><th>桁</th><th>口</th><th>ひき算</th><th class="grp">かけ</th><th>桁</th><th>×桁</th><th class="grp">わり</th><th>桁</th><th>÷桁</th><th>商の桁</th><th class="grp">あんざん</th><th>桁</th><th>口</th><th>ひき算</th><th class="grp">フラッシュ</th><th>桁</th><th>口</th><th>1個の秒</th><th class="grp"></th></tr>') + rows + "</table></div>" +
      T('<div class="ce-subj"><b>しゅもくの きまり（SK検定・練習の 1セット）</b>') + subjRow("mitori", T("みとり算")) + subjRow("kake", T("かけ算")) + subjRow("wari", T("わり算")) + subjRow("anzan", T("あんざん")) + "</div>" +
      T('<div class="ce-foot"><button type="button" id="ceSave">💾 表を 保存</button><button type="button" id="ceReset" class="ghost">標準の 表に もどす</button><span id="ceMsg" class="ce-msg"></span></div>');
    box.classList.remove("hidden");
    // 行の ボタン：並べかえ・写す・消す（表を 読みとって 直し、描きなおす）
    box.querySelectorAll("tr[data-i]").forEach((tr) => {
      const i = +tr.dataset.i;
      const apply = (fn) => { const read = readCurEditor(); if (!read) return; fn(read.grades); cur.curriculum = read; renderCurEditor(); };
      tr.querySelector(".ce-up").onclick = () => apply((g) => { if (i > 0) [g[i - 1], g[i]] = [g[i], g[i - 1]]; });
      tr.querySelector(".ce-down").onclick = () => apply((g) => { if (i < g.length - 1) [g[i + 1], g[i]] = [g[i], g[i + 1]]; });
      tr.querySelector(".ce-copy").onclick = () => apply((g) => { const cp = JSON.parse(JSON.stringify(g[i])); cp.key = cp.key + "'"; g.splice(i + 1, 0, cp); });
      tr.querySelector(".ce-del").onclick = () => apply((g) => { if (g.length > 1) g.splice(i, 1); });
      ["m", "k", "w", "a", "f"].forEach((p) => { const on = tr.querySelector("." + p + "-on"); on.onchange = () => tr.classList.toggle("off-" + { m: "mitori", k: "kake", w: "wari", a: "anzan", f: "flash" }[p], !on.checked); });
    });
    $("#ceSave").onclick = async () => {
      const read = readCurEditor(), msg = $("#ceMsg");
      const ok = read && CHECK(read);
      if (!ok) { msg.textContent = T("保存できません：数が 範囲外か、級の 名前が 重なっています（") + (readCurEditor.err || "") + T("）"); msg.className = "ce-msg ng"; return; }
      cur.curriculum = ok;
      await S.updateClass(cur.id, { preset: "custom", curriculum: ok }); cur.preset = "custom";
      fillHwGrades("custom");
      msg.textContent = T("保存しました（") + ok.grades.length + T("段階）。子どもの アプリは つぎに ひらいたとき この表に なります"); msg.className = "ce-msg";
      $("#clsPresetNote").textContent = presetNote("custom");
    };
    $("#ceReset").onclick = async () => {
      if (!confirm(T("この教室だけの 表を 消して、標準の 表に もどします。よろしいですか？"))) return;
      cur.curriculum = null; cur.preset = "sk";
      await S.updateClass(cur.id, { preset: "sk", curriculum: null });
      $("#clsPreset").innerHTML = presetOptions("sk", true); box.classList.add("hidden"); fillHwGrades("sk");
      $("#clsPresetNote").textContent = T("標準に もどしました。") + presetNote("sk");
    };
  }
  // 表の 画面から 読みとる。特別な形（variants・答えの範囲）は、桁・口を 変えていなければ そのまま 残す
  function readCurEditor() {
    const c = cur.curriculum; if (!c) return null;
    const box = $("#curEditor");
    const val = (el) => { const v = el.value === "" ? null : Number(el.value); return v == null || isNaN(v) ? null : v; };
    const grades = [];
    let err = "";
    box.querySelectorAll("tr[data-i]").forEach((tr) => {
      const i = +tr.dataset.i, g0 = c.grades[i] || {};
      const row = { key: tr.querySelector(".ce-key").value.trim(), band: g0.band || "kyu", n: g0.n || 1 };
      const keep = (spec, d, t) => {   // 桁・口が 変わっていなければ もとの 形を 残す（変えたら ふつうの 形。級ごとの exam は 引きつぐ）
        const base = spec && spec.variants ? spec.variants[0] : spec;
        if (spec && base && base.digits === d && base.terms === t) return spec;
        const o = { digits: d, terms: t }; if (spec && spec.sub === false) o.sub = false; if (spec && spec.label && !spec.variants && spec.sumMax == null && spec.sumMin == null) o.label = spec.label; if (spec && spec.exam) o.exam = spec.exam; return o;
      };
      // かけ算・わり算：数字が 変わっていなければ もとの 形（variants）を 残す
      const keepKW = (spec, o, keys) => { const base = spec && spec.variants ? spec.variants[0] : spec; if (spec && base && keys.every((k) => (base[k] || null) === (o[k] || null))) return spec; if (spec && spec.exam) o.exam = spec.exam; return o; };
      if (tr.querySelector(".m-on").checked) { const d = val(tr.querySelector(".m-d")), t = val(tr.querySelector(".m-t")); row.mitori = keep(g0.mitori, d, t); row.mitori.sub = tr.querySelector(".m-sub").checked ? undefined : false; if (row.mitori.sub === undefined) delete row.mitori.sub; if (!d || !t) err = row.key + T(" みとり"); } else row.mitori = null;
      if (tr.querySelector(".k-on").checked) { const o = { a: val(tr.querySelector(".k-a")), b: val(tr.querySelector(".k-b")) }; if (!o.a || !o.b) err = row.key + T(" かけ算"); row.kake = keepKW(g0.kake, o, ["a", "b"]); } else row.kake = null;
      if (tr.querySelector(".w-on").checked) { const o = { D: val(tr.querySelector(".w-D")), dv: val(tr.querySelector(".w-dv")), qd: val(tr.querySelector(".w-qd")) }; if (!o.D || !o.dv) err = row.key + T(" わり算"); row.wari = keepKW(g0.wari, o, ["D", "dv", "qd"]); } else row.wari = null;
      if (tr.querySelector(".a-on").checked) { const d = val(tr.querySelector(".a-d")), t = val(tr.querySelector(".a-t")); row.anzan = keep(g0.anzan, d, t); row.anzan.sub = tr.querySelector(".a-sub").checked ? undefined : false; if (row.anzan.sub === undefined) delete row.anzan.sub; if (!d || !t) err = row.key + T(" あんざん"); } else row.anzan = null;
      if (tr.querySelector(".f-on").checked) { const p = val(tr.querySelector(".f-p")); row.flash = { digits: val(tr.querySelector(".f-d")), terms: val(tr.querySelector(".f-t")), pace: p ? Math.round(p * 1000) : null }; if (g0.flash && g0.flash.exam) row.flash.exam = g0.flash.exam; if (!row.flash.digits || !row.flash.terms || !row.flash.pace) err = row.key + T(" フラッシュ"); } else row.flash = null;
      if (row.anzan && g0.anzan && g0.anzan.exam && !row.anzan.exam) row.anzan.exam = g0.anzan.exam;
      if (!row.key) err = (i + 1) + T("行目の 級の 名前");
      grades.push(row);
    });
    const subjects = JSON.parse(JSON.stringify(c.subjects || CURS.sk.subjects));
    box.querySelectorAll(".s-N").forEach((el) => { subjects[el.dataset.k].N = val(el); });
    box.querySelectorAll(".s-min").forEach((el) => { subjects[el.dataset.k].limit = (val(el) || 1) * 60; });
    box.querySelectorAll(".s-pass").forEach((el) => { subjects[el.dataset.k].pass = val(el); });
    readCurEditor.err = err;
    return { id: "custom", name: ($("#ceName").value || "").trim() || c.name, note: c.note || "", subjects, exams: c.exams, grades };
  }

  /* ---------- 教室 ---------- */
  // 教室を 読みこむ（画面は 変えない）。教室の 画面・生徒の 名前の 画面・カードの 画面が 共通で 使う
  async function loadClass(cid) {
    cur = await S.getClass(cid); if (!cur) return false;
    $("#clsName").textContent = cur.name;
    $("#addClsName").textContent = cur.name;
    $("#clsCode").textContent = cur.code;
    if (cur.preset === "custom" && !CHECK(cur.curriculum)) cur.preset = "sk";   // こわれた 表は 使わない
    $("#clsPreset").innerHTML = presetOptions(cur.preset || "sk", true);
    $("#clsPresetNote").textContent = presetNote(cur.preset || "sk");
    if (cur.preset === "custom") renderCurEditor(); else $("#curEditor").classList.add("hidden");
    fillHwGrades(cur.preset || "sk");
    await renderHomework();          // 生徒の 表に 宿題の 列を 出すので、先に 読む
    await renderStudents();
    renderAddList();
    cardsPrinted = false;
    return true;
  }
  async function openClass(cid) {
    try { if (!(await loadClass(cid))) { await renderClasses(); show("classes"); return; } }
    catch (err) { console.error("教室を ひらけませんでした", err); alert(T("教室を ひらけませんでした。もう一度 押してください。それでも だめなら、電波を たしかめてください。")); return; }
    show("class");
  }
  $("#toAddBtn").addEventListener("click", () => { $("#addMsg").textContent = ""; show("add"); $("#addNicks").focus(); });
  $("#toCardsBtn").addEventListener("click", openCards);
  $("#addBack").addEventListener("click", (e) => { e.preventDefault(); show("class"); });
  $("#cardsBack").addEventListener("click", (e) => { e.preventDefault(); show("class"); });
  $("#cardsToClass").addEventListener("click", () => show("class"));
  $("#addMore").addEventListener("click", () => { $("#addNicks").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#addNext").addEventListener("click", openCards);
  // 登録ずみの 名前を、生徒の 名前の 画面に 並べる（「登録できた」と 目で わかる）
  function renderAddList() {
    const box = $("#addDone"); if (!box) return;
    box.classList.toggle("hidden", !curStudents.length);
    $("#addList").innerHTML = curStudents.map((s) => '<span class="name-chip">' + esc(s.nick) + "</span>").join("");
  }

  /* ---------- 宿題 ---------- */
  fillHwGrades("sk");   // 級の 一覧は 教室の「級の基準」から（openClass で 入れなおす）
  $("#hwSets").innerHTML = [1, 2, 3, 4, 5, 6, 8, 10].map((n) => '<option value="' + n + '"' + (n === 3 ? " selected" : "") + ">" + n + T(" セット</option>")).join("");
  const hwLabel = (h) => (SUBJ[h.subj] || h.subj) + " " + h.g + T(" を ") + h.sets + T(" セット");
  const fmtDue = (s) => { if (!s) return ""; const m = s.split("-"); return m.length === 3 ? (+m[1]) + "/" + (+m[2]) : s; };
  const isLate = (h) => h.due && h.due < new Date().toISOString().slice(0, 10);
  async function renderHomework() {
    curHw = await S.listHomework(cur.id);
    $("#hwList").innerHTML = curHw.length
      ? '<div class="hw-list">' + curHw.map((h) =>
          '<div class="hw-item"><b>' + esc(hwLabel(h)) + "</b>" +
          (h.due ? '<span class="hw-due' + (isLate(h) ? " late" : "") + '">' + esc(fmtDue(h.due)) + T(" まで</span>") : "") +
          (h.note ? '<span class="hw-note">「' + esc(h.note) + "」</span>" : "") +
          '<small>' + fmtDate(h.createdAt) + T(' に 出した</small><button type="button" class="x" data-id="') + h.id + T('" title="消す">✕ 消す</button></div>')).join("") + "</div>"
      : T('<p class="cls-empty">いま 出している 宿題は ありません。下から 出せます。</p>');
    document.querySelectorAll("#hwList .x").forEach((b) => b.addEventListener("click", async () => {
      const h = curHw.find((x) => x.id === b.dataset.id); if (!h) return;
      if (!confirm(T("宿題「") + hwLabel(h) + T("」を 消します。よろしいですか？"))) return;
      await S.removeHomework(cur.id, h.id); await renderHomework(); await renderStudents(); updateGuide("class");
    }));
  }
  $("#hwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#hwMsg"); msg.textContent = ""; msg.className = "result";
    const hw = { subj: $("#hwSubj").value, g: $("#hwGrade").value, sets: +$("#hwSets").value, due: $("#hwDue").value, note: $("#hwNote").value.trim() };
    try {
      const h = await S.addHomework(cur.id, hw);
      $("#hwNote").value = ""; $("#hwDue").value = "";
      msg.textContent = T("✓ 宿題「") + hwLabel(h) + T("」を 出しました。子どもが アプリを ひらくと 見えます。"); msg.className = "result ok";
      await renderHomework(); await renderStudents(); updateGuide("class");
    } catch (err) { msg.textContent = T("出せませんでした：") + ((err && err.message) || err); msg.className = "result ng"; }
  });
  $("#backClasses").addEventListener("click", async (e) => { e.preventDefault(); await renderClasses(); show("classes"); });
  $("#reloadBtn").addEventListener("click", () => openClass(cur.id));
  $("#clsDelete").addEventListener("click", async () => {
    if (!confirm("「" + cur.name + T("」を 消します。生徒と 記録も 消えます。よろしいですか？"))) return;
    await S.deleteClass(cur.id); cur = null; await renderClasses(); show("classes");
  });
  /* ---------- 要フォロー／苦戦中／進級候補（フェーズC-1） ----------
     生徒30人でも「今日 だれを 見るか」が 数秒で わかるように、生徒の まとめ（stat）から 3つに 分ける。
       要フォロー：7日 練習なし（または 最後の 練習から 14日以上）／今週の 正答率 60% 未満／宿題が きげんを すぎて 未完
       進級候補  ：進級の めやすが「受けられそう」（生徒側の 計算）／めやす 90% 以上
       苦戦中    ：正答率 60〜74%／技の 正答率 60% 未満の ものが ある（5問以上）／今週の まちがい 5回以上
       それ以外  ：順調 */
  const CLS = {
    follow: { n: T("要フォロー"), em: "🔴", cls: "c-follow" },
    ready:  { n: T("進級候補"),   em: "🟢", cls: "c-ready" },
    hard:   { n: T("苦戦中"),     em: "🟡", cls: "c-hard" },
    ok:     { n: T("順調"),       em: "⚪", cls: "c-ok" },
    none:   { n: T("まだ 記録なし"), em: "⚪", cls: "c-none" },
  };
  function classify(s) {
    const st = s.stat || {}, reasons = [];
    if (!st.last && !s.lastSeen) return { k: "none", reasons: [] };
    const ago = daysAgo(st.last || s.lastSeen);
    if (!st.n7) reasons.push(T("今週 練習なし"));
    if (ago != null && ago >= 14) reasons.push(T("{v1}日 練習なし", { v1: ago }));
    if (st.acc7 != null && st.acc7 < 60) reasons.push(T("正答率 {v1}%", { v1: st.acc7 }));
    const lateHw = curHw.filter((h) => isLate(h) && Math.min(h.sets, (st.hw && st.hw[h.id]) || 0) < h.sets).length;
    if (lateHw) reasons.push(T("宿題 きげんすぎ {v1}件", { v1: lateHw }));
    if (reasons.length) return { k: "follow", reasons };
    if (st.ready && (st.ready.ok || st.ready.pct >= 90)) return { k: "ready", reasons: [T("{g} 合格の めやす {pct}%", { g: st.ready.g, pct: st.ready.pct })] };
    if (st.acc7 != null && st.acc7 < 75) reasons.push(T("正答率 {v1}%", { v1: st.acc7 }));
    const weakTech = Object.entries(st.tech || {}).filter(([k, a]) => a[1] >= 5 && a[0] / a[1] < 0.6).map(([k]) => TECH_NAMES[k] || k);
    if (weakTech.length) reasons.push(T("{v1} が 60% 未満", { v1: weakTech.slice(0, 2).join("・") }));
    const missN = Object.values(st.miss7 || {}).reduce((a, b) => a + b, 0);
    if (missN >= 5) reasons.push(T("今週の まちがい {v1}回", { v1: missN }));
    if (reasons.length) return { k: "hard", reasons };
    return { k: "ok", reasons: [] };
  }
  const TECH_NAMES = { five: T("5の友"), ten: T("10の友"), carry2: T("くり上がり2回"), sub: T("ひき算"), plain: T("たし算"), dg1: T("1桁"), dg2: T("2桁"), dg3: T("3桁"), dg4: T("4桁以上"), tm_s: T("口数2〜3"), tm_m: T("口数4〜6"), tm_l: T("口数7以上"), kuku: T("九九"), kk1: T("かけ算×1桁"), kk2: T("かけ算×2桁"), wr: T("わり算") };
  function triageHTML(list) {
    const by = { follow: [], ready: [], hard: [], ok: [], none: [] };
    list.forEach((s) => { const c = classify(s); by[c.k].push({ s, c }); });
    const box = (k) => {
      const K = CLS[k], items = by[k];
      return '<div class="tri-box ' + K.cls + '"><div class="tri-h">' + K.em + " " + K.n + " <b>" + items.length + T("人") + "</b></div>" +
        (items.length ? items.map((x) => '<button class="tri-name st-link" data-id="' + x.s.id + '" title="' + esc(x.c.reasons.join(" / ")) + '">' + esc(x.s.nick) + (x.c.reasons.length ? '<small>' + esc(x.c.reasons[0]) + "</small>" : "") + "</button>").join("") : '<span class="tri-none">—</span>') + "</div>";
    };
    return '<div class="tri-wrap">' + box("follow") + box("ready") + box("hard") + '<div class="tri-box c-ok"><div class="tri-h">⚪ ' + T("順調") + " <b>" + by.ok.length + T("人") + "</b></div>" + (by.ok.length ? by.ok.map((x) => '<button class="tri-name st-link" data-id="' + x.s.id + '">' + esc(x.s.nick) + "</button>").join("") : '<span class="tri-none">—</span>') + (by.none.length ? '<div class="tri-sub">' + T("まだ 記録なし：") + by.none.map((x) => esc(x.s.nick)).join(T("・")) + "</div>" : "") + "</div></div>" +
      T('<p class="hint">🔴 要フォロー＝今週 練習なし・14日以上 空いた・正答率 60% 未満・宿題が きげんすぎ。🟢 進級候補＝進級の めやすが「受けられそう」（生徒の 端末が 計算）。🟡 苦戦中＝正答率 60〜74%・技の 正答率 60% 未満・今週 まちがい 5回以上。名前を 押すと その子の 記録へ。</p>');
  }
  async function renderStudents() {
    curStudents = await S.listStudents(cur.id);
    if (!curStudents.length) { $("#studentTable").innerHTML = T('<p class="cls-empty">まだ 生徒が いません。上の「＋ 生徒を 足す」を 押してください。</p>'); return; }
    const order = { follow: 0, ready: 1, hard: 2, ok: 3, none: 4 };
    const sorted = curStudents.slice().sort((a, b) => order[classify(a).k] - order[classify(b).k]);
    const rows = sorted.map((s) => {
      const st = s.stat || {}, ago = daysAgo(st.last || s.lastSeen), cl = classify(s), K = CLS[cl.k];
      const badge = '<span class="cls-badge ' + K.cls + '" title="' + esc(cl.reasons.join(" / ")) + '">' + K.em + " " + K.n + "</span>";
      const last = st.last ? fmtDate(st.last) + (ago >= 3 ? ' <span class="st-warn">' + ago + T("日前</span>") : "") : T('<span class="st-none">まだ</span>');
      const acc = st.acc7 == null ? '<span class="st-none">—</span>' : (st.acc7 >= 80 ? '<span class="st-ok">' : st.acc7 < 60 ? '<span class="st-warn">' : "<span>") + st.acc7 + "%</span>";
      const topMiss = Object.entries(st.miss7 || {}).sort((a, b) => b[1] - a[1])[0];
      // 宿題：できた数 / 出した数。ぜんぶ できたら ✓、きげんを すぎて まだなら 赤
      const hwCell = curHw.length ? curHw.map((h) => {
        const n = Math.min(h.sets, (st.hw && st.hw[h.id]) || 0), ok = n >= h.sets;
        return '<span class="hw-chip' + (ok ? " ok" : isLate(h) ? " late" : "") + '" title="' + esc(hwLabel(h)) + '">' + (ok ? "✓ " : "") + esc((SUBJ[h.subj] || h.subj).slice(0, 4)) + " " + n + "/" + h.sets + "</span>";
      }).join("") : '<span class="st-none">—</span>';
      return "<tr><td>" + '<button class="st-link" data-id="' + s.id + '">' + esc(s.nick) + "</button></td><td>" + badge + "</td>" +
        '<td class="num">' + (st.n7 || 0) + "</td><td>" + acc + "</td><td>" + last + "</td><td>" + (st.lastG ? esc(st.lastG) : "") + "</td>" +
        "<td>" + hwCell + "</td>" +
        "<td>" + (topMiss ? esc(MISS[topMiss[0]] || topMiss[0]) + " ×" + topMiss[1] : '<span class="st-none">—</span>') + "</td>" +
        '<td><button class="x" data-id="' + s.id + T('" title="消す">✕</button></td></tr>');
    }).join("");
    $("#studentTable").innerHTML = T("<h2>👀 今日 見る子</h2>") + triageHTML(curStudents) +
      T('<div class="doc-table"><table class="rec-table"><tr><th>名前</th><th>分類</th><th>今週の セット</th><th>正答率</th><th>最後に 練習</th><th>級</th><th>宿題</th><th>いちばん多い まちがい</th><th></th></tr>') + rows + "</table></div>" +
      T('<p class="sub">「今週」は きょうから 7日間。生徒が アプリで 練習すると、ここに 自動で 入ります。「宿題」は できた数 ／ 出した数。子どもの 端末が 送ってきた ときに 変わります。</p>');
    document.querySelectorAll("#studentTable .st-link").forEach((b) => b.addEventListener("click", () => openStudent(b.dataset.id)));
    document.querySelectorAll("#studentTable .x").forEach((b) => b.addEventListener("click", async () => {
      const s = curStudents.find((x) => x.id === b.dataset.id);
      if (!confirm("「" + s.nick + T("」を 消します。記録も 消えます。よろしいですか？"))) return;
      await S.removeStudent(cur.id, s.id); await renderStudents();
    }));
  }
  $("#addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#addMsg"); msg.textContent = ""; msg.className = "result";
    const nicks = $("#addNicks").value.split(/\r?\n/).map((x) => x.trim().slice(0, 20)).filter(Boolean).slice(0, 60);
    if (!nicks.length) { msg.textContent = T("白い欄に 名前を 書いてから 押してください。"); msg.className = "result ng"; $("#addNicks").focus(); return; }
    const have = new Set(curStudents.map((s) => s.nick));
    const fresh = nicks.filter((n) => !have.has(n));
    $("#addGo").disabled = true;
    try {
      // プランの 上限（人数・期限）。こえるときは 登録せず、理由を 画面に 出す
      const p = S.planInfo(me), total = await S.countStudents();
      if (p.expired) { msg.textContent = T("おためしの 期間が おわっているため、生徒を 追加できません。教室プランへの 切りかえは 塾向けページから お申し込みください。"); msg.className = "result ng"; return; }
      if (total + fresh.length > p.max) {
        msg.textContent = p.home
          ? p.name + T("は お子さま ") + p.max + T("人までです（いま ") + total + T("人）。2人目からは「家庭プラン（2人目から）＋1,490円」を お申し込みください。反映後に 登録できます。")
          : p.name + T("は 生徒 ") + p.max + T("人までです（いま ") + total + T("人）。あと ") + Math.max(0, p.max - total) + T("人 登録できます。もっと 登録する ときは 教室プラン（40人）／スクールプラン（150人）へ。");
        msg.className = "result ng"; return;
      }
      if (fresh.length) await S.addStudents(cur.id, fresh);
      $("#addNicks").value = "";   // 失敗したときは 消さない（打ち直しに ならないように）
      await renderStudents();
      renderAddList();
      msg.textContent = fresh.length ? T("✓ 登録しました：") + fresh.join(T("・")) : T("その名前は もう 登録されています。"); msg.className = "result ok";
      updateGuide("add");
    } catch (err) {
      console.error("生徒を 登録できませんでした", err);
      msg.textContent = saveFail(); msg.className = "result ng";
    } finally { $("#addGo").disabled = false; }
  });

  /* ---------- ログインカード（3／4 印刷 → 4／4 渡す）----------
     カードの 画面を ひらくと、1人 1枚の カードが 画面に 見える。「印刷する」で ブラウザの 印刷の 窓。
     生徒が いないときは カードの 画面には 行かず、生徒の 名前の 画面へ */
  function renderCards() {
    const card = (s) => T('<div class="lc"><div class="lc-head"><img src="../assets/logo.png" alt="">そろばんキングダム ログインカード</div>') +
      '<div class="lc-nick">' + esc(s.nick) + '</div><div class="lc-cls">' + esc(cur.name) + "</div>" +
      T('<div class="lc-code">教室の 合いことば<b>') + esc(cur.code) + "</b></div>" +
      T('<div class="lc-steps">① スマホか パソコンで <span class="lc-url">') + SITE + T("</span> を ひらく<br>② メニューの「🏫 教室に 参加」を おす<br>③ 上の 6文字を 入れて、じぶんの 名前を えらぶ</div></div>");
    const sheets = [];
    for (let i = 0; i < curStudents.length; i += 8) sheets.push('<div class="lc-sheet">' + curStudents.slice(i, i + 8).map(card).join("") + "</div>");
    $("#cardsOut").innerHTML = sheets.join("");
  }
  function openCards() {
    if (!curStudents.length) { show("add"); $("#addMsg").textContent = T("先に 生徒の 名前を 入れてください。"); $("#addMsg").className = "result ng"; $("#addNicks").focus(); return; }
    renderCards();
    $("#cardsDone").classList.toggle("hidden", !cardsPrinted);
    show("cards");
  }
  $("#cardsBtn").addEventListener("click", () => {
    if (!curStudents.length) return openCards();
    renderCards();
    document.body.classList.add("print-cards");
    setTimeout(() => {
      try { window.print(); } catch (e) { console.error("印刷に 失敗", e); }
      // 印刷の 窓が とじたら 4／4 へ（Chrome などは 窓が とじるまで ここで 待つ）
      setTimeout(() => { document.body.classList.remove("print-cards"); cardsPrinted = true; $("#cardsDone").classList.remove("hidden"); updateGuide("cards"); }, 500);
    }, 50);
  });

  /* ---------- 保護者への 案内（A4 1枚）。先生は これを 配るだけ＝売りこまない。画面には 出さず 印刷だけ ---------- */
  $("#noticeBtn").addEventListener("click", () => {
    const tname = me && me.name ? esc(me.name) : "";
    $("#noticeOut").innerHTML =
      '<div class="pn-sheet">' +
        T('<div class="pn-head"><img src="../assets/logo.png" alt="">保護者の みなさまへ</div>') +
        T('<h1 class="pn-title">家での そろばん練習に「そろばんキングダム」を 使います</h1>') +
        '<p class="pn-cls">' + esc(cur.name) + (tname ? T("　／　") + tname : "") + "</p>" +
        T('<div class="pn-box"><h2>できること</h2><ul>') +
          T("<li>先生からの <b>宿題</b>が、お子さまの 画面に とどきます</li>") +
          T("<li>家で 練習した 記録が、<b>まちがえ方まで</b> 先生に とどきます（次の 指導に 使います）</li>") +
          T("<li>本物の そろばんと 同じ 動きで 練習できます。相棒の ソロモンと いっしょに、毎日 つづけやすく なっています</li>") +
        "</ul></div>" +
        T('<div class="pn-box"><h2>はじめ方（3分）</h2><ol>') +
          T("<li>スマホ・タブレット・パソコンで <b>sorobankingdom.com</b> を ひらく</li>") +
          T("<li>メニューの「<b>🏫 教室に 参加</b>」を おし、ログインカードの <b>コード</b>を 入れて、お子さまの <b>名前</b>を えらぶ</li>") +
          T("<li>あとは ホームの「<b>本日の練習</b>」を おすだけ。1日 10分ほどです</li>") +
        "</ol></div>" +
        T('<div class="pn-box pn-important"><h2>ご家庭の お金は かかりません</h2>') +
          T("<p>教室が 利用の 契約を しています。ご家庭での お支払い・登録・アプリの インストールは ありません。</p></div>") +
        T('<div class="pn-box"><h2>個人情報について</h2>') +
          T("<p>メールアドレス・本名・生年月日は 集めません。使うのは にっくねーむと 練習の 記録だけです。</p></div>") +
        T('<div class="pn-box"><h2>はじめて ひらいたとき</h2>') +
          T("<p>「音楽を 流しますか？」と 聞かれます。小さな 音で 始まり、あとから 上の 🎵 で 変えられます。</p></div>") +
        T('<p class="pn-foot">わからないことは 先生（') + esc(cur.name) + T('）に おたずねください。　そろばんキングダム　sorobankingdom.com</p>') +
      "</div>";
    document.body.classList.add("print-notice");
    setTimeout(() => { try { window.print(); } catch (e) { console.error("印刷に 失敗", e); } setTimeout(() => document.body.classList.remove("print-notice"), 500); }, 50);
  });

  /* ---------- 生徒 ---------- */
  async function openStudent(sid) {
    curStudent = curStudents.find((s) => s.id === sid); if (!curStudent) return;
    $("#stName").textContent = curStudent.nick;
    const list = await S.listSessions(cur.id, sid, 300);
    const st = S.statOf(list);
    const all = list.length, N = list.reduce((a, e) => a + (e.N || 0), 0), C = list.reduce((a, e) => a + (e.correct || 0), 0);
    $("#stSummary").innerHTML =
      "<div><b>" + (st.n7 || 0) + T("</b><span>今週の セット</span></div>") +
      "<div><b>" + (st.acc7 == null ? "—" : st.acc7 + "%") + T("</b><span>今週の 正答率</span></div>") +
      "<div><b>" + all + T("</b><span>これまでの セット</span></div>") +
      "<div><b>" + (N ? Math.round((C / N) * 100) + "%" : "—") + T("</b><span>通算の 正答率</span></div>") +
      "<div><b>" + (st.last ? fmtDate(st.last) : "—") + T("</b><span>最後に 練習</span></div>");
    const miss = {}; list.forEach((e) => (e.miss || []).forEach((m) => { miss[m.k || "other"] = (miss[m.k || "other"] || 0) + 1; }));
    const ent = Object.entries(miss).sort((a, b) => b[1] - a[1]), mx = ent.length ? ent[0][1] : 1;
    // 🔍 弱点診断：技ごとの 正答率（直近30日・出題5問以上）。低い順
    const TECH = { five: T("5の友（五玉）"), ten: T("10の友（くり上がり・くり下がり）"), carry2: T("くり上がり 2回以上"), sub: T("ひき算が まざる"), plain: T("技を 使わない たし算"), dg1: T("1桁"), dg2: T("2桁"), dg3: T("3桁"), dg4: T("4桁以上"), tm_s: T("口数 2〜3"), tm_m: T("口数 4〜6"), tm_l: T("口数 7以上"), kuku: T("九九"), kk1: T("かけ算 ×1桁"), kk2: T("かけ算 ×2桁以上"), wr: T("わり算") };
    const tech = Object.entries(st.tech || {}).filter(([k, a]) => TECH[k] && a[1] >= 5).map(([k, a]) => ({ k, c: a[0], t: a[1], rate: Math.round((a[0] / a[1]) * 100) })).sort((x, y) => x.rate - y.rate);
    const techHtml = tech.length
      ? T("<h2>🔍 弱点診断（技ごとの 正答率・直近30日）</h2>") + tech.map((r) => '<div class="miss-bar' + (r.rate < 70 || (st.acc7 != null && r.rate <= st.acc7 - 10) ? " weak" : "") + '"><span style="width:200px">' + esc(TECH[r.k]) + '</span><i style="width:' + Math.max(6, Math.round(r.rate * 2.2)) + 'px"></i><span>' + r.rate + "%（" + r.c + "／" + r.t + T("問）</span></div>")).join("")
      : "";
    $("#stMiss").innerHTML = techHtml + (ent.length
      ? T("<h2>まちがえ方の クセ（通算）</h2>") + ent.map(([k, v]) => '<div class="miss-bar"><span style="width:160px">' + esc(MISS[k] || k) + '</span><i style="width:' + Math.max(6, Math.round((v / mx) * 220)) + 'px"></i><span>' + v + T("回</span></div>")).join("")
      : T('<p class="cls-empty">まちがいの 記録は まだ ありません。</p>'));
    $("#stSessions").innerHTML = list.length
      ? T('<div class="doc-table"><table class="rec-table"><tr><th>日</th><th>級</th><th>しゅもく</th><th>正解</th><th>タイム</th><th>まちがい</th></tr>') +
        list.slice().reverse().slice(0, 100).map((e) => "<tr><td>" + esc(e.d || fmtDate(e.t)) + "</td><td>" + esc(e.g || "") + "</td><td>" + esc(SUBJ[e.subj] || e.subj) + '</td><td class="num">' + e.correct + " / " + e.N + '</td><td class="num">' + fmtSec(e.sec) + "</td><td>" +
          (e.miss || []).map((m) => esc(MISS[m.k] || m.k || "")).filter(Boolean).join(T("・")) + "</td></tr>").join("") + "</table></div>"
      : T('<p class="cls-empty">まだ 記録が ありません。生徒が アプリで 練習すると 入ります。</p>');
    show("student");
  }
  $("#backClass").addEventListener("click", (e) => { e.preventDefault(); openClass(cur.id); });
})();
