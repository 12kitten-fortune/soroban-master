// 日本語の 文字列リテラルを T("…") で つつむ 変換道具。新しく 書いた 日本語が あるとき 再実行してよい（すでに T() の 中の ものは とばす）。
// 使い方: node tools_日本語をTで包む.mjs docs/app.js [--write]   （--write が 無ければ *.i18n.preview に 書く）
import fs from "node:fs";
const args = process.argv.slice(2);
const write = args.includes("--write");
const file = args.find((a) => !a.startsWith("--"));
const src = fs.readFileSync(file, "utf8");
const JP = /[぀-ヿ㐀-鿿！-｠]/;
const EXCL = /^(\d+級|準?[一二三四五六七八九十初]段|段位)$/;   // 級の 名前は データ（比較に 使う）なので 訳さない
const SKIP_TAIL = /(===|!==|==|!=|\bcase|\.includes\(|\.startsWith\(|\.endsWith\(|\.indexOf\(|\.split\(|\.replace\(|\.match\(|RegExp\(|getItem\(|setItem\(|removeItem\(|console\.\w+\(|T\()\s*$/;
const stats = { wrapped: 0, tpl: 0, skipCmp: 0, skipKey: 0, skipTpl: [], excl: 0 };

function isKeyContext(out, rest) {
  const nx = rest.match(/^\s*([^\s])/); const pv = out.replace(/\s+$/, "");
  return !!(nx && nx[1] === ":" && /[{,]$/.test(pv));
}
function regexAllowed(out) {
  const p = out.replace(/\s+$/, ""); if (!p) return true;
  const c = p[p.length - 1];
  if (/[\w$)\]]/.test(c)) { const w = p.match(/([A-Za-z_$][\w$]*)$/); return !!(w && /^(return|typeof|case|in|of|delete|void|throw|new|instanceof|else|do)$/.test(w[1])); }
  return true;
}
let out = "", i = 0; const n = src.length;
while (i < n) {
  const c = src[i], d = src[i + 1];
  if (c === "/" && d === "/") { let e = src.indexOf("\n", i); if (e < 0) e = n; out += src.slice(i, e); i = e; continue; }
  if (c === "/" && d === "*") { let e = src.indexOf("*/", i + 2); e = e < 0 ? n : e + 2; out += src.slice(i, e); i = e; continue; }
  if (c === "/" && regexAllowed(out)) {   // 正規表現：そのまま 写す
    let j = i + 1, cls = false;
    while (j < n) { const x = src[j]; if (x === "\\") { j += 2; continue; } if (x === "\n") break; if (cls) { if (x === "]") cls = false; } else if (x === "[") cls = true; else if (x === "/") break; j++; }
    j++; while (j < n && /[a-z]/.test(src[j])) j++;
    out += src.slice(i, j); i = j; continue;
  }
  if (c === "'" || c === '"') {
    let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === "\\") j++; if (src[j] === "\n") break; j++; }
    const lit = src.slice(i, j + 1), body = src.slice(i + 1, j); const rest = src.slice(j + 1); i = j + 1;
    if (!JP.test(body)) { out += lit; continue; }
    if (EXCL.test(body)) { stats.excl++; out += lit; continue; }
    if (SKIP_TAIL.test(out)) { stats.skipCmp++; out += lit; continue; }
    if (isKeyContext(out, rest)) { stats.skipKey++; out += lit; continue; }
    out += "T(" + lit + ")"; stats.wrapped++; continue;
  }
  if (c === "`") {
    const start = i; let j = i + 1; const parts = [], exprs = []; let cur = "", bad = false;
    while (j < n) {
      const ch = src[j];
      if (ch === "\\") { cur += ch + (src[j + 1] || ""); j += 2; continue; }
      if (ch === "`") break;
      if (ch === "$" && src[j + 1] === "{") {
        parts.push(cur); cur = ""; let depth = 1, e = ""; j += 2;
        while (j < n && depth > 0) { const x = src[j]; if (x === "{") depth++; else if (x === "}") { depth--; if (depth === 0) { j++; break; } } if (x === "`") bad = true; e += x; j++; }
        exprs.push(e); continue;
      }
      cur += ch; j++;
    }
    parts.push(cur);
    const lit = src.slice(start, j + 1), rest = src.slice(j + 1); i = j + 1;
    const whole = parts.join("");
    if (!JP.test(whole)) { out += lit; continue; }
    if (SKIP_TAIL.test(out) || isKeyContext(out, rest)) { stats.skipCmp++; out += lit; continue; }
    if (bad || parts.some((p) => /\{\w+\}/.test(p)) || exprs.some((e) => /[`{}]/.test(e))) { stats.skipTpl.push(lit.slice(0, 70).replace(/\n/g, "⏎")); out += lit; continue; }
    if (!exprs.length) { out += "T(" + lit + ")"; stats.wrapped++; continue; }
    // ${式} → {名前}。名前は 変数名なら そのまま、それ以外は v1, v2…
    const names = [], vars = [];
    exprs.forEach((e, k) => {
      const t = e.trim(); let name = /^[A-Za-z_$][\w$]*$/.test(t) ? t : "v" + (k + 1);
      while (names.includes(name)) name += "_";
      names.push(name); vars.push(name === t ? name : name + ": " + t);
    });
    let key = ""; parts.forEach((p, k) => { key += p; if (k < exprs.length) key += "{" + names[k] + "}"; });
    // 逆変換：テンプレートの 中の 書き方（\` \${ \\）を ふつうの 文字に
    key = key.replace(/\\`/g, "`").replace(/\\\$\{/g, "${").replace(/\\\\/g, "\\");
    out += "T(" + JSON.stringify(key) + ", { " + vars.join(", ") + " })"; stats.tpl++;
    continue;
  }
  out += c; i++;
}
console.log(file, JSON.stringify({ wrapped: stats.wrapped, templates: stats.tpl, skippedComparison: stats.skipCmp, skippedObjectKey: stats.skipKey, gradeKeys: stats.excl, skippedTemplates: stats.skipTpl.length }));
if (stats.skipTpl.length) console.log("  そのままの テンプレート:\n   " + stats.skipTpl.join("\n   "));
if (write) { fs.writeFileSync(file, out); console.log("  書きこんだ"); }
else fs.writeFileSync(file + ".i18n.preview", out);
