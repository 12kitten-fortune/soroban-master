/* プレミアムの「ひらくコード」を まとめて作る道具。
   つかい方:  node tools_ひらくコードを作る.mjs 20
   → codes.csv に 20個 書き出す。買ってくれた人に 1つずつ わたす。
   ※ docs/app.js の PRO.salt と ここの SALT は 同じにすること。 */
import fs from "node:fs";
const src = fs.readFileSync("docs/app.js", "utf8");
const SALT = (src.match(/salt:\s*"([^"]+)"/) || [])[1];
if (!SALT) { console.error("app.js の PRO.salt が 見つかりません"); process.exit(1); }
const A = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function sum(body) {
  let h = 2166136261 >>> 0;
  const s = SALT + "|" + body;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = "";
  for (let i = 0; i < 4; i++) { out += A[h % A.length]; h = Math.floor(h / A.length) + 7919; }
  return out;
}
const n = Math.max(1, parseInt(process.argv[2], 10) || 10);
const seen = new Set(), rows = ["コード,発行日,わたした相手"];
while (seen.size < n) {
  let b = ""; for (let i = 0; i < 8; i++) b += A[Math.floor(Math.random() * A.length)];
  const c = b + sum(b);
  if (seen.has(c)) continue;
  seen.add(c);
  rows.push("SK-" + c.slice(0, 4) + "-" + c.slice(4, 8) + "-" + c.slice(8) + "," + new Date().toISOString().slice(0, 10) + ",");
}
fs.writeFileSync("codes.csv", rows.join("\n") + "\n", "utf8");
console.log("合言葉:", SALT);
console.log(n + "個 作って codes.csv に 書き出しました。");
console.log(rows.slice(1, 4).map((r) => "  " + r.split(",")[0]).join("\n") + (n > 3 ? "\n  …" : ""));
