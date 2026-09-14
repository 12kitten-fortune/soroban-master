/* ============================================================
   言葉の 一覧（翻訳の 元）を 作る道具
   ------------------------------------------------------------
   画面に 出る 日本語を ぜんぶ 集めて docs/lang/catalog.ja.json に 書く。
     ・app.js / class/class.js / class/store.js の T("…") の 中身
     ・index.html / class/index.html に 直接 書いてある 文字（タグの あいだ）と 属性（placeholder・title・aria-label・alt・data-say）
     ・級体系の 表（curriculum/*.js）の name / note / label / しゅもくの name
   使い方：node tools_言葉の一覧を作る.mjs
   英語などを 足すとき：catalog.ja.json を 写して docs/lang/en.js を 作り、
     window.SK_LANG_DICT = { "日本語": "English", … };  の 形で 訳を 書く（訳さない 行は 消してよい）
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), "docs");
const JP = /[぀-ヿ㐀-鿿！-｠]/;
const found = new Map();   // 文字列 → { where: Set }
const add = (s, where) => { s = String(s); if (!JP.test(s)) return; if (!found.has(s)) found.set(s, new Set()); found.get(s).add(where); };

/* ---- T("…") / T('…') / T(`…`) を 拾う（ソースを 走査。コメントは とばす） ---- */
function scanJs(file) {
  const src = fs.readFileSync(path.join(DOCS, file), "utf8");
  let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { let e = src.indexOf("\n", i); if (e < 0) e = n; i = e; continue; }
    if (c === "/" && d === "*") { let e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith("T(", i) && !/[\w$.]/.test(src[i - 1] || "")) {
      let j = i + 2; while (src[j] === " ") j++;
      const q = src[j];
      if (q === '"' || q === "'" || q === "`") {
        let k = j + 1, body = "";
        while (k < n && src[k] !== q) { if (src[k] === "\\") { body += src[k] + src[k + 1]; k += 2; continue; } body += src[k]; k++; }
        // 文字列の 中の 書き方を ふつうの 文字に
        let text;
        try { text = q === "`" ? body.replace(/\\`/g, "`").replace(/\\\$\{/g, "${").replace(/\\\\/g, "\\") : JSON.parse('"' + (q === "'" ? body.replace(/\\'/g, "'").replace(/"/g, '\\"') : body) + '"'); }
        catch (e) { text = body; }
        add(text, file);
        i = k + 1; continue;
      }
    }
    i++;
  }
}
/* ---- HTML の 文字と 属性 ---- */
function scanHtml(file) {
  let html = fs.readFileSync(path.join(DOCS, file), "utf8");
  html = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const attrRe = /\s(placeholder|title|aria-label|alt|data-say)="([^"]*)"/g; let m;
  while ((m = attrRe.exec(html))) add(m[2].trim(), file);
  html.split(/<[^>]*>/).forEach((seg) => { const t = seg.replace(/&nbsp;/g, " ").trim(); if (t) add(t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'), file); });
}
/* ---- 級体系の 表 ---- */
function scanCurriculum() {
  const w = {}; const ctx = { window: w, document: { createElement: () => ({}), head: { appendChild() { } } } };
  vm.createContext(ctx);
  fs.readdirSync(path.join(DOCS, "curriculum")).filter((f) => f.endsWith(".js")).forEach((f) => vm.runInContext(fs.readFileSync(path.join(DOCS, "curriculum", f), "utf8"), ctx));
  Object.values(w.SK_CURRICULA || {}).forEach((c) => {
    add(c.name, "curriculum"); if (c.note) add(c.note, "curriculum");
    Object.values(c.subjects || {}).forEach((s) => s && s.name && add(s.name, "curriculum"));
    Object.values(c.exams || {}).forEach((e) => e && e.name && add(e.name, "curriculum"));
    (c.grades || []).forEach((g) => ["mitori", "anzan"].forEach((k) => { const s = g[k]; if (s && s.label) add(s.label, "curriculum"); (s && s.variants || []).forEach((v) => v.label && add(v.label, "curriculum")); }));
  });
}
["app.js", "class/class.js", "class/store.js", "i18n.js"].forEach(scanJs);
["index.html", "class/index.html"].forEach(scanHtml);
scanCurriculum();

const keys = [...found.keys()].sort((a, b) => a.localeCompare(b, "ja"));
const out = {}; keys.forEach((k) => { out[k] = k; });
fs.mkdirSync(path.join(DOCS, "lang"), { recursive: true });
fs.writeFileSync(path.join(DOCS, "lang", "catalog.ja.json"), JSON.stringify(out, null, 2) + "\n");
const byWhere = {}; found.forEach((w, k) => w.forEach((x) => { byWhere[x] = (byWhere[x] || 0) + 1; }));
console.log("言葉の 一覧: docs/lang/catalog.ja.json　" + keys.length + " 件");
console.log("  " + Object.entries(byWhere).map(([k, v]) => k + " " + v).join("　"));
