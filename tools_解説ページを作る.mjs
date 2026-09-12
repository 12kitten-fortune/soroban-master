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
function page({ file, title, desc, h1, lead, body, updated, box }) {
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
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <!-- 子ども向けの まるいゴシック。読みこめなくても 下の 端末内の書体で きれいに 出る -->
    <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap" rel="stylesheet" />
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
      ${box != null ? box : `<div class="doc-box">
        <div class="doc-box-h">🧮 じっさいに やってみよう</div>
        <p>読むだけより、<b>手を動かす</b>ほうが ずっと 早く 身につきます。
        そろばんキングダムは <b>登録なし・むりょう</b>で、スマホでも パソコンでも すぐ できます。</p>
        <p>まちがえたとき、<b>どの珠を どう動かし まちがえたか</b>を 図で 教えてくれます。</p>
        <a class="doc-cta big" href="./">▶ そろばんキングダムを ひらく</a>
      </div>`}
      <nav class="doc-nav">
        <b>ほかの 解説</b>
        <a href="soroban-yubi.html">✋ 指づかい（運指）</a>
        <a href="soroban-tomo.html">🖐 5の友・10の友</a>
        <a href="soroban-kyu.html">📘 級のレベルの めやす</a>
        <a href="kentei.html">🏅 SK検定</a>
        <a href="kyoshitsu.html">🏫 教室の先生へ</a>
      </nav>
    </main>
    <footer class="doc-foot">
      <a href="./">そろばんキングダム</a>　子どものための そろばん練習アプリ（むりょう）<br>
      <small>最終更新 ${updated}　／　BGM：魔王魂　効果音：効果音ラボ</small><br>
      <small><a href="legal.html#tokushoho">特定商取引法に基づく表記</a>　<a href="legal.html#privacy">プライバシーポリシー</a>　<a href="legal.html#terms">利用規約</a>　<a href="kyoshitsu.html#contact">お問い合わせ</a></small>
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
    '<p class="un-note">※ 出題の 形式（桁数・口数）は、公開されている 珠算検定の 出題例を 参考にした <b>このアプリ独自</b>の めやすです。' +
    "当サイトは 個人が 作った 非公式の 練習アプリで、珠算の 検定を 行う 団体とは 一切 関係ありません。</p>",
});


/* ---- SK検定の 説明ページ ---- */
{
  const T = M.SUBJECT;
  const specRow = (s) => `<tr><td>${T[s].name}</td><td>${T[s].N}問</td><td>${Math.round(T[s].limit / 60)}分</td><td>${T[s].pass}点／${T[s].N * T[s].per}点</td></tr>`;
  write({
    file: "kentei.html",
    title: "SK検定（そろばんキングダム検定）｜いつでも受けられる そろばん・暗算の検定",
    desc: "SK検定は、そろばんキングダム独自のオンライン検定。本番と同じ形式（種目ごとに制限時間・まとめて採点）で、20級から十段まで いつでも受けられます。合格すると印刷できる合格証。登録不要・無料。",
    h1: "SK検定 ― いつでも 受けられる そろばん・暗算の 検定",
    lead: "検定は 年に数回・会場まで 行かないと 受けられません。<b>SK検定</b>は、そろばんキングダムの中で <b>いつでも</b> 受けられる 独自の検定です。" +
      "本番と 同じように、しゅもくごとに 制限時間があり、◎×は さいごに まとめて 出ます。合格すると <b>合格証</b>が もらえます（印刷できます）。",
    body:
      `<h2>検定の きまり</h2>
      <p>珠算（そろばん）は みとり算・かけ算・わり算（級によって ある しゅもくだけ）を つづけて 受け、<b>ぜんぶの しゅもくで 合格点</b>を とると 合格です。暗算は 1しゅもくです。</p>
      <div class="doc-table"><table class="rec-table"><tr><th>しゅもく</th><th>もんだい</th><th>時間</th><th>合格点</th></tr>${["mitori", "kake", "wari", "anzan"].map(specRow).join("")}</table></div>
      <p>しゅもくの あいだには 30秒の 休けいが 入ります。検定中は 一時停止も「解き方をみる」も できません。</p>
      <h2>級ごとの 出題内容</h2>
      <p>桁数と 口数は、<a href="soroban-kyu.html">級のレベルの めやす</a>の 表と 同じです。20級〜16級は このアプリだけの 入門の級で、5の友 → 10の友 と 学習順に ならんでいます。</p>
      <h2>自宅受験と 監督つき受験</h2>
      <p>自宅で 受けた検定の 合格証には「<b>自宅受験</b>」と 入ります。教室の先生の 監督のもとで 受ける「監督つき受験」は 準備中で、合格証に 監督した教室の 名前が 入る予定です。</p>
      <h2>どうやって 受けるの？</h2>
      <p>アプリを ひらいて、左のメニューの「🏅 SK検定」から 級と 検定（珠算／暗算）を えらび、「検定を はじめる」を 押すだけです。登録も お金も いりません。</p>
      <p class="un-note">※ SK検定は そろばんキングダム独自の 検定です。珠算の 検定を 行う 団体とは 一切 関係ありません。出題の 形式（桁数・口数）は、公開されている 珠算検定の 出題例を 参考にした このアプリ独自の めやすで、問題は すべて その場で 作っています。</p>`,
  });
}

/* ---- そろばん教室の 先生むけ ページ ---- */
write({
  file: "kyoshitsu.html",
  title: "そろばん教室の先生へ｜生徒の家庭学習が見える 無料アプリ",
  desc: "そろばん教室・オンライン珠算塾向け。本物のそろばんと公式級に沿った練習、どの珠をどう動かし間違えたかの診断、宿題プリント自動作成、いつでも受けられる模擬検定。教室向けの先生画面は先行10教室を募集中。",
  h1: "そろばん教室の 先生へ ― 授業の「外側」を 見える化する 無料アプリ",
  lead: "週2〜3回の 授業の あいだ、生徒が 家で どう練習しているかは 見えません。<b>そろばんキングダム</b>は、その 空白を 埋めるための アプリです。" +
    "本物の そろばんを 使う 指導と そのまま 合い、<b>まちがえたとき「どの珠を どう動かし まちがえたか」</b>を 図で 見せます。生徒も 保護者も 登録なし・無料で 使えます。",
  body:
    `<p class="doc-jump"><a href="#contact">▼ 先行10教室（1年間 無料）の お申し込みは こちら</a></p>

    <h2>いま すぐ 使える もの</h2>
    <p><b>🖨 宿題プリント</b>：級と 種目を 選ぶだけで、検定と 同じ形式の 問題用紙を 答えつきで 何枚でも。毎回 ちがう問題です。</p>
    <p><b>🏅 模擬検定（SK検定）</b>：種目ごとの 制限時間・まとめて採点。<a href="kentei.html">くわしくは こちら</a>。</p>
    <p><b>🔍 珠の動きの 診断</b>：正誤だけでなく、5の友・10の友・くり上がり など「どこで 崩れたか」を 生徒ごとに 図で。</p>
    <p><b>✋ 運指の 解説</b>：<a href="soroban-yubi.html">親指と 人差し指の 使い分け</a>を、理由まで 図で。家で 親が 教えられます。</p>
    <p><b>⚡ フラッシュ暗算・あんざん・本日の練習</b>：検定の 練習メニュー（暗算3分×3 → かけ算 → わり算 → みとり算）を 毎日 つづける しくみ。</p>

    <h2>教室では こう 使えます</h2>
    <div class="doc-table"><table class="rec-table">
      <tr><th>場面</th><th>使い方</th></tr>
      <tr><td>宿題</td><td>「今週は 5級みとり算 3セット」→ 生徒は アプリで。プリントでも。</td></tr>
      <tr><td>授業内</td><td>フラッシュ暗算・タイムアタックを 自分の端末で。オンライン授業なら 画面共有より 速い。</td></tr>
      <tr><td>進級の 判断</td><td>級ごとの 正答率と タイム、まちがえ方の クセを 見て 決める。</td></tr>
      <tr><td>保護者への 説明</td><td>週の 練習カードと 合格証。「がんばりが 見える」ので 続きます。</td></tr>
      <tr><td>体験・入会</td><td>体験に 来た子に アプリを 渡す。家で 続けやすい 教室、として 伝わります。</td></tr>
    </table></div>

    <h2>教室向けの 先生画面（先行10教室を 募集）</h2>
    <p><b>先生画面は もう 使えます。</b>お名前・メール・パスワードを 入れて アカウントを 作る（1分）→ 教室を 作る →
      生徒の にっくねーむを 入れる → ログインカードを 印刷。子どもは コードを 入れて 名前を えらぶだけです。</p>
    <p><a class="doc-cta" href="class/">🏫 先生の画面を ひらく</a></p>
    <p>生徒ごとの 練習の 見える化、宿題の 配布と 自動採点、授業内の 一斉フラッシュ暗算、監督つき検定、保護者レポートの 一括作成。</p>
    <p>生徒は <b>にっくねーむだけ</b>で 使えます（メール・本名・生年月日は 集めません）。先生が 生徒を 登録し、家用に QRカードを 印刷して 渡す 形です。</p>
    <div class="doc-table" id="plans"><table class="rec-table">
      <tr><th>プラン（予定・税込）</th><th>月額</th><th>生徒数</th></tr>
      <tr><td>おためし（カード不要）</td><td>0円（31日間）</td><td>〜10人</td></tr>
      <tr><td>教室</td><td>9,800円　<b>初月 無料</b></td><td>〜40人</td></tr>
      <tr><td>スクール</td><td>19,800円　<b>初月 無料</b></td><td>〜150人</td></tr>
    </table></div>
    <p><b>どのプランも 初月（31日間）は 無料</b>です。無料の あいだに やめれば 0円、つづければ 32日目から 毎月 自動で お支払い。いつでも やめられます。</p>
    <p>教室プランには、生徒が 家で 使う分が ぜんぶ 入っています。<b>ご家庭の 追加料金・登録は ありません</b>（先生は「保護者への 案内カード」を 配るだけ。売りこみは いりません）。
      教室に 入っていない ご家庭は、家庭プラン（月 2,980円・初月 無料・2人目から 半額・予定）で 独学でも 使えます。</p>
    <p><b>先行10教室は 1年間 無料</b>で、使い心地の ご意見を いただきながら 作ります。お支払いは クレジットカード（準備中）。<a href="legal.html#tokushoho">特定商取引法に基づく表記</a>・<a href="legal.html#terms">利用規約</a></p>

    <h2 id="contact">先行10教室の お申し込み・お問い合わせ</h2>
    <p>下の ボタンから 1分で 送れます。<b>2〜3日以内に ご返信</b>します。ご質問だけでも かまいません。</p>
    <div class="doc-form">
      <div class="doc-form-h">🏫 先行10教室（1年間 無料）</div>
      <p>生徒ごとの 練習の 見える化・宿題の 自動採点・保護者レポートを、できあがりしだい 順に お使いいただけます。
        使い心地の ご意見を いただきながら 作ります。料金は かかりません。途中で やめても かまいません。</p>
      <a class="doc-cta big" href="https://forms.gle/25bzfmV9aFegAdn69" target="_blank" rel="noopener">✉️ お申し込み・お問い合わせ</a>
      <p class="doc-form-n">お聞きするのは 教室名・お名前・メールアドレス・ご質問だけです。</p>
    </div>
    <p class="un-note">※ そろばんキングダムは 個人が 開発・運営する 非公式の 練習アプリです。珠算の 検定を 行う 団体とは 一切 関係ありません。どの 流派・系統の 教室でも お使いいただけます。</p>`,
  box:
    `<div class="doc-box">
      <div class="doc-box-h">🧮 まず 先生ご自身で さわってみてください</div>
      <p>登録なしで すぐ 使えます。「🖨 プリントを 作る」と「🏅 SK検定」を ためすと、教室で どう 使えるかが 見えます。</p>
      <a class="doc-cta big" href="./">▶ そろばんキングダムを ひらく</a>
      <p class="doc-box-n">先行10教室（1年間 無料）の お申し込みは <a href="#contact">こちら ▲</a></p>
    </div>`,
});

/* ---- 法的な ページ（特定商取引法・プライバシー・利用規約）。【 】は 決まりしだい 入れる ---- */
/* 個人で 運営するため、出す 個人情報は 氏名だけに する。
   住所・電話は 法律の きまりどおり「ご請求が あれば 遅滞なく 開示」（求められたときだけ メールで 伝える）。
   メールは 独自ドメインの アドレス（個人の Gmail は 出さない） */
const OWNER = {
  name: "そろばんキングダム（個人事業主）", person: "【氏名】",
  addr: "ご請求が あれば 遅滞なく 開示します（下の メールアドレスへ お問い合わせください）",
  tel: "ご請求が あれば 遅滞なく 開示します（お問い合わせは メールで お受けしています）",
  mail: "info@sorobankingdom.com", court: "【所在地の 地方裁判所】", date: "2026年9月12日",
};
write({
  file: "legal.html",
  title: "特定商取引法に基づく表記・プライバシーポリシー・利用規約｜そろばんキングダム",
  desc: "そろばんキングダムの 特定商取引法に基づく表記、プライバシーポリシー（集める情報・集めない情報）、利用規約。",
  h1: "特定商取引法に基づく表記・プライバシーポリシー・利用規約",
  lead: "そろばんキングダムは、個人が 開発・運営する そろばんの 練習アプリです。お金の こと、あつかう 情報の こと、きまりを ここに 書いています。",
  box: "",
  body:
    `<p class="doc-jump"><a href="#tokushoho">▼ 特定商取引法に基づく表記</a>　<a href="#privacy">▼ プライバシーポリシー</a>　<a href="#terms">▼ 利用規約</a></p>

    <h2 id="tokushoho">特定商取引法に基づく表記</h2>
    <p>そろばんキングダムは 個人が 運営しています。お子さまと ご家庭の 安心の ために、<b>集める 情報を 最小に し、広告や 解析の しくみを 入れていません</b>。データは Google の Firebase（東京）に 暗号化して 保存しています。</p>
    <div class="doc-table"><table class="rec-table">
      <tr><th>販売事業者</th><td>${OWNER.name}</td></tr>
      <tr><th>運営責任者</th><td>${OWNER.person}</td></tr>
      <tr><th>所在地</th><td>${OWNER.addr}</td></tr>
      <tr><th>電話番号</th><td>${OWNER.tel}</td></tr>
      <tr><th>メールアドレス</th><td>${OWNER.mail}</td></tr>
      <tr><th>販売価格</th><td>教室プラン 月額 9,800円（税込）／スクールプラン 月額 19,800円（税込）／家庭プラン 月額 2,980円（税込・2人目から 半額）。各ページに 表示します。</td></tr>
      <tr><th>商品代金以外に 必要な料金</th><td>インターネットに つなぐ ための 通信料</td></tr>
      <tr><th>お支払い方法</th><td>クレジットカード（Stripe による 決済）</td></tr>
      <tr><th>お支払い時期</th><td>どのプランも 初月（お申し込みから 31日間）は 無料。32日目に 初回の 決済、以後 毎月 同じ日に 自動で 決済。無料の あいだに 解約すれば 請求は ありません</td></tr>
      <tr><th>サービスの 提供時期</th><td>お申し込み（カード登録）の 完了後 すぐ。先生画面への プランの 反映は 1〜2営業日 以内</td></tr>
      <tr><th>解約</th><td>いつでも できます。次の 更新日から 止まります。月の 途中の 返金は ありません</td></tr>
      <tr><th>返品・キャンセル</th><td>デジタルサービスの ため 返品は ありません。当方の 不具合で 使えなかった 期間が ある場合は、その ぶんを 返金します</td></tr>
      <tr><th>動作環境</th><td>最新の Chrome / Safari / Edge。スマホ・タブレット・パソコン</td></tr>
    </table></div>

    <h2 id="privacy">プライバシーポリシー</h2>
    <h3>集める 情報</h3>
    <ul>
      <li><b>先生（教室）</b>：メールアドレス・お名前（教室名）・パスワード（暗号化され、運営者も 見られません）</li>
      <li><b>生徒</b>：にっくねーむ・練習の 記録（日付・級・種目・正誤・時間・まちがえ方）だけ</li>
      <li><b>ご家庭（家庭プラン）</b>：メールアドレス・お支払いの 情報（カード番号は Stripe が あつかい、当サイトは 保持しません）</li>
    </ul>
    <h3>集めない 情報</h3>
    <p>生徒の 本名・生年月日・住所・写真・位置情報は 集めません。生徒に メールアドレスを 求めません。</p>
    <h3>保存する 場所</h3>
    <p>Google の Firebase（東京リージョン）と、お使いの 端末の 中（設定と 記録）。</p>
    <h3>使う 目的</h3>
    <p>練習の 記録の 表示、先生への 共有、宿題、料金の 処理、お問い合わせへの 返信。それ以外には 使いません。</p>
    <h3>ほかの 人に わたすか</h3>
    <p>わたしません（法律で 求められた 場合を 除く）。あつかいを まかせている 会社：Google（Firebase）、Stripe（決済）。広告や アクセス解析の しくみは 入れていません。</p>
    <h3>子どもの 利用と 保護者の 同意</h3>
    <p>生徒の 登録は 先生が 行い、生徒 本人の 個人情報は 集めません。教室での 利用は、教室（先生）と 保護者の 合意の もとで お願いします。</p>
    <h3>消したいとき</h3>
    <p>先生が 教室や 生徒を 消すと、その 記録も 消えます。アカウントの 削除や ご質問は ${OWNER.mail} まで。</p>
    <h3>変更</h3>
    <p>内容を 変えるときは、この ページで お知らせします。制定日：${OWNER.date}</p>

    <h2 id="terms">利用規約</h2>
    <ol>
      <li><b>サービス</b>：そろばんキングダム（sorobankingdom.com）は、そろばんの 練習アプリと、教室向けの 先生画面を 提供します。</li>
      <li><b>アカウント</b>：先生画面は メールアドレスと パスワードで 作ります。パスワードは ご自身で 管理してください。</li>
      <li><b>してはいけないこと</b>：他人の アカウントの 使用、不正な 操作、他の 利用者への 迷惑行為、素材の 転載・再配布。</li>
      <li><b>料金・解約</b>：料金は 各ページの 表示の とおり。どのプランも 初月（31日間）は 無料で、無料の あいだに 解約すれば 請求は ありません。解約は いつでも でき、次の 更新日から 止まります。月の 途中の 返金は ありません。</li>
      <li><b>免責</b>：本サービスは 珠算の 検定を 行う 団体とは 一切 関係が ありません。学習の 効果を 保証する ものでは ありません。不具合が あったときは、直すか、使えなかった 期間の 料金を 返します。それ以上の 責任は 負いません。</li>
      <li><b>著作権</b>：アプリの 文章・図・しくみは 運営者に、音楽・効果音は 各 提供元（魔王魂・効果音ラボ）に 権利が あります。イラストは 生成AIで 作った ものです。</li>
      <li><b>変更・終了</b>：内容の 変更や サービスの 終了が ある場合は、事前に この サイトで お知らせします。</li>
      <li><b>準拠法・裁判所</b>：日本の 法律に したがい、もめごとは ${OWNER.court}を 第一審の 裁判所と します。</li>
    </ol>
    <p class="un-note">制定日：${OWNER.date}</p>`,
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
