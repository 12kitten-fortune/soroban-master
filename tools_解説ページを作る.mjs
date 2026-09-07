/* 検索から 見つけてもらうための「解説ページ」を 作る道具。
   docs/app.js の 中の 図を 描く関数（sbSVG / unshiHTML など）を そのまま つかって、
   ふつうの HTML ファイルを 書き出す。

   なぜ 必要か：
     アプリ本体は 1ページの中で 画面を 切りかえる作りで、解説は
     JavaScript が あとから 作る「隠れた場所」に 入っている。
     Google からは 中身が 見えないので、検索に 出てこない。
     ここで 作る ページは ふつうの HTML なので、検索に のる。

   つかい方:  node tools_解説ページを作る.mjs
   （app.js の 解説を 直したら、もう一度 走らせて 作り直す） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));   // 日本語のフォルダ名でも 正しく 読めるように
const DOCS = path.join(ROOT, "docs");
const SITE = "https://sorobankingdom.com/";
const src = fs.readFileSync(path.join(DOCS, "app.js"), "utf8").split("\r\n").join("\n");

/* ---- app.js から 図を描く部分だけ 取り出して 動かす ---- */
const cut = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error("目じるしが 見つからない: " + a.slice(0, 40));
  return src.slice(i, j);
};
const code =
  cut("const SOROBAN_STD = {", "// 暗算（みとり暗算）") +
  cut("const ANZAN_LOW = {", "// フラッシュ暗算 10〜1級") +
  cut("const SUBJECT = {", "/* ---------- 級・段ラダー") +
  cut("const GRADES = [];", "let gradeIdx =") +
  cut("function sbSVG(", "/* ============================================================ はじめての案内") +
  cut("const LESSON_LOW = {", "function lessonFor(") +
  cut("const FINGER = {", "const TIP_FINGER =");
const M = new Function(code + "; return { sbSVG, sbStep, unshiHTML, LESSON_LOW, LESSON_KAKE, LESSON_WARI, SOROBAN_STD, ANZAN_LOW, GRADES, SUBJECT };")();

/* ---- ページの 型 ---- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function page({ file, title, desc, h1, lead, body, updated }) {
  const url = SITE + file;
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${esc(title)}</title>
    <meta name="google-site-verification" content="nH6SLyVBrLJ_tPMrwN-hPCs-YRNWsRnxa1U6SU5Eb7k" />
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url}" />
    <meta name="theme-color" content="#16305c" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="そろばんキングダム" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}assets/ogp.png" />
    <meta property="og:locale" content="ja_JP" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE}assets/ogp.png" />
    <link rel="icon" href="icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="assets/icon-180.png" />
    <link rel="stylesheet" href="style.css" />
    <link rel="stylesheet" href="page.css" />
  </head>
  <body class="doc">
    <header class="doc-head">
      <a class="doc-logo" href="./"><img src="assets/logo.png" alt="そろばんキングダム" /></a>
      <a class="doc-cta" href="./">▶ 練習をはじめる（むりょう）</a>
    </header>
    <main class="doc-main">
      <h1>${esc(h1)}</h1>
      <p class="doc-lead">${lead}</p>
      ${body}
      <div class="doc-box">
        <div class="doc-box-h">🧮 じっさいに やってみよう</div>
        <p>読むだけより、<b>手を動かす</b>ほうが ずっと 早く 身につきます。
        そろばんキングダムは <b>登録なし・むりょう</b>で、スマホでも パソコンでも すぐ できます。</p>
        <p>まちがえたとき、<b>どの珠を どう動かし まちがえたか</b>を 図で 教えてくれます。</p>
        <a class="doc-cta big" href="./">▶ そろばんキングダムを ひらく</a>
      </div>
      <nav class="doc-nav">
        <b>ほかの 解説</b>
        <a href="soroban-yubi.html">✋ 指づかい（運指）</a>
        <a href="soroban-tomo.html">🖐 5の友・10の友</a>
        <a href="soroban-kyu.html">📘 級のレベルの めやす</a>
      </nav>
    </main>
    <footer class="doc-foot">
      <a href="./">そろばんキングダム</a>　子どものための そろばん練習アプリ（むりょう）<br>
      <small>最終更新 ${updated}　／　BGM：魔王魂　効果音：効果音ラボ</small>
    </footer>
  </body>
</html>
`;
}

const today = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
const out = [];
const write = (o) => { fs.writeFileSync(path.join(DOCS, o.file), page({ ...o, updated: today })); out.push(o.file); };

/* ============================================================ ① 指づかい（運指） */
write({
  file: "soroban-yubi.html",
  title: "そろばんの指づかい（運指）｜親指と人差し指の使い分けを図で解説",
  desc: "そろばんの指使いは 親指と人差し指の2本だけ。1珠を上げるのが親指、下げるのが人差し指、5珠は人差し指。なぜそのルールなのかを、珠の動きの図つきで説明します。",
  h1: "そろばんの指づかい（運指）— 親指と人差し指の使い分け",
  lead: "そろばんを はじめた お子さんが、いちばん さいしょに 身につけるべきものです。" +
    "ルールは <b>3つだけ</b>。なぜ そのルールなのかを、実際の 計算例（3+2 と 1+9）で 図で 説明します。" +
    "ここを ていねいに やったかどうかで、そのあとの のびが 大きく 変わります。",
  body: M.unshiHTML(true),
});

/* ============================================================ ② 5の友・10の友 */
write({
  file: "soroban-tomo.html",
  title: "そろばんの「5の友」「10の友」とは｜くり上がり・くり下がりを図で解説",
  desc: "5の友（1と4／2と3）、10の友（1と9／2と8／3と7／4と6／5と5）とは何か。たし算・ひき算で どう使うのかを、そろばんの珠の動きの図で 一つずつ説明します。",
  h1: "そろばんの「5の友」「10の友」— 珠の動きで理解する",
  lead: "そろばんの たし算・ひき算で いちばん つまずくのが、<b>5の友</b>と<b>10の友</b>です。" +
    "「友（とも）」とは、<b>たすと 5（または 10）に なる 相手の数</b>のこと。" +
    "珠が たりないときに、この 友を つかって 計算します。",
  body:
    '<h2>5の友 —— 一玉が たりないとき</h2>' +
    '<p class="ls-key"><b>5の友</b>：1と4　／　2と3</p>' +
    "<p>一玉（下の4つの珠）が たりないときは、<b>五玉を入れて、友の数を はらいます</b>。</p>" +
    M.sbStep(3, 7, "3 + 4：一玉が たりない → 五玉を 入れて、4の友の <b>1</b>を はらう") +
    M.sbStep(7, 4, "7 − 3：ひき算は ぎゃく → 五玉を はらって、3の友の <b>2</b>を 入れる") +
    '<h2>10の友 —— くり上がり・くり下がり</h2>' +
    '<p class="ls-key"><b>10の友</b>：1と9　／　2と8　／　3と7　／　4と6　／　5と5</p>' +
    "<p>その桁で たしきれない ときは、<b>となりの桁に 1を入れて、10の友を はらいます</b>。</p>" +
    M.sbStep(8, 13, "8 + 5：十の位に 1 を 入れて、5の友の <b>5</b>を はらう → 13") +
    M.sbStep(13, 7, "13 − 6：十の位の 1 を はらって、6の友の <b>4</b>を 入れる → 7") +
    '<h2>おぼえ方</h2>' +
    '<ul class="un-list">' +
    "<li><b>指で おぼえる</b>：頭で 考えるより、手が 先に 動くまで くり返すのが 近道です</li>" +
    "<li><b>声に出す</b>：「4の友は 1」と 口に出しながら 弾くと、早く 定着します</li>" +
    "<li><b>順番を まもる</b>：5の友 → くり上がりなし → 10の友 → くり上がり。とばすと あとで 必ず つまずきます</li>" +
    "</ul>" +
    '<p class="un-note">このアプリでは、<b>20級（こたえが5まで）から 順に</b> この順番どおりに 出題します。' +
    "まちがえたときは、どの友で つまずいたかを 図で 教えてくれます。</p>",
});

/* ============================================================ ③ 級のレベルのめやす */
const gradeRows = [];
for (let k = 20; k >= 1; k--) {
  const std = M.SOROBAN_STD[k], low = M.ANZAN_LOW[k];
  let mi = "—", ka = "—", wa = "—";
  if (std) {
    const m = std.mitori;
    mi = m ? (m.variants ? m.variants.map((v) => v.digits + "桁 " + v.terms + "口").join(" ／ ")
      : m.digits + "桁 " + (m.termsMax && m.termsMax > m.terms ? m.terms + "〜" + m.termsMax : m.terms) + "口") : "—";
    ka = std.kake ? std.kake.a + "桁 × " + std.kake.b + "桁" : "—";
    wa = std.wari ? std.wari.D + "桁 ÷ " + std.wari.dv + "桁" : "—";
  } else if (low) {
    mi = "1桁 " + low.terms + "口" + (low.label ? "（" + low.label + "）" : "");
  }
  gradeRows.push("<tr><td><b>" + k + "級</b></td><td>" + mi + "</td><td>" + ka + "</td><td>" + wa + "</td></tr>");
}
write({
  file: "soroban-kyu.html",
  title: "そろばんの級はどのくらいのレベル？｜20級〜1級の内容を一覧で",
  desc: "そろばんの各級で どんな問題が出るのかを、みとり算の桁数・口数、かけ算・わり算の桁数で一覧にしました。何級から かけ算・わり算が始まるのか、どの級が目標になるのかも解説します。",
  h1: "そろばんの級は どのくらいのレベル？（20級〜1級）",
  lead: "「そろばん◯級」と 言われても、どのくらいの むずかしさなのか 分かりにくいものです。" +
    "ここでは <b>各級で 実際に 出る問題</b>を、桁数と口数で 一覧にしました。",
  body:
    '<h2>級ごとの 出題内容</h2>' +
    '<p>「口（くち）」は たす数の 個数です。「3桁 10口」なら、3桁の数を 10個 たしひきします。</p>' +
    '<div class="doc-table"><table class="rec-table"><tr><th>級</th><th>みとり算</th><th>かけ算</th><th>わり算</th></tr>' +
    gradeRows.join("") + "</table></div>" +
    '<h2>どこが 節目になるか</h2>' +
    '<ul class="un-list">' +
    "<li><b>9級</b>：ここから <b>かけ算</b>が 始まります。九九が 言えることが 前提です</li>" +
    "<li><b>7級</b>：ここから <b>わり算</b>が 加わり、3種目そろいます</li>" +
    "<li><b>6級</b>：みとり算が 3桁になり、「そろばんが できる」と 言える ひとつの 目安です</li>" +
    "<li><b>3級</b>：履歴書に 書ける、と よく 言われる ライン。5桁10口・4桁×3桁 と ぐっと 重くなります</li>" +
    "<li><b>1級</b>：6桁10口・5桁×4桁。ここまで 来ると 暗算力も かなりの ものです</li>" +
    "</ul>" +
    '<h2>16級〜20級について</h2>' +
    "<p>15級より 下は 検定に ありません。このアプリでは、はじめての子が いきなり つまずかないよう、" +
    "<b>そろばんの学習順（5の友 → くり上がりなし → 10の友 → くり上がり）に そった 入門の階段</b>を 用意しています。</p>" +
    '<p class="un-note">※ 検定の 出題形式は、日本計算技能連盟の 公開サンプル問題を 参考にした めやすです。' +
    "検定そのものとは 関係のない、非公式の 練習アプリです。</p>",
});

/* ---- sitemap を 作り直す ---- */
const urls = [SITE].concat(out.map((f) => SITE + f));
fs.writeFileSync(path.join(DOCS, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u, i) => '  <url><loc>' + u + '</loc><changefreq>weekly</changefreq><priority>' + (i ? "0.8" : "1.0") + "</priority></url>").join("\n") +
  "\n</urlset>\n");

console.log("作ったページ:");
out.forEach((f) => console.log("  " + f + "  " + Math.round(fs.statSync(path.join(DOCS, f)).size / 1024) + " KB"));
console.log("sitemap.xml も 作り直しました（" + urls.length + " 件）");
