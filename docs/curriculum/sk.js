/* ============================================================
   級体系（カリキュラム）「そろばんキングダム標準」
   ------------------------------------------------------------
   これは JSON の データです（先頭の 1行と 末尾の 1行だけが 入れ物）。
   級ごとに「どの しゅもくが あるか・何桁 何口か・合格の きまり」を 書いてある。
   プログラム（app.js）は この表を 読むだけで、級の きまりを 自分では 持っていない。

   直し方：数字を 書きかえて 保存 → サイトを 更新。しゅもくを 無くすには null。
   別の 級体系（教室の 独自基準・海外の レベル体系）は、この ファイルを 写して
   id と name を 変え、同じ 形で 書く。

   しゅもくの 書き方
     mitori / anzan：{ digits: 桁, terms: 口 } ＋ 任意で termsMax（口が 幅で 変わる）・sub:false（ひき算なし）
                     ・variants:[…]（桁と口の 組み合わせを まるごと 選ぶ）・sumMax/sumMin/sumExact/label（入門級：答えの 範囲）
     kake：{ a: かけられる数の 桁, b: かける数の 桁 }
     wari：{ D: わられる数の 桁, dv: わる数の 桁, qd: 商の 桁（null＝きめない） }
     flash：{ digits, terms, sec: 全体の 秒（めやす）, pace: 1個の 表示 ミリ秒 }
   subjects：しゅもくの 名前・答え方・問題数(N)・1問の 点(per)・合格点(pass)・制限 秒(limit)
   exams：SK検定の 組み合わせ（珠算＝みとり・かけ・わり、暗算＝あんざん）
   ============================================================ */
window.SK_CURRICULA = window.SK_CURRICULA || {};
window.SK_CURRICULA.sk = {
  "id": "sk",
  "name": "そろばんキングダム標準",
  "note": "公開されている珠算検定の出題例を参考にした、このアプリ独自のめやす。20〜16級は入門の級。段位は目安。",
  "subjects": {
    "mitori": {
      "name": "みとり算",
      "answer": "soroban",
      "N": 10,
      "per": 10,
      "pass": 70,
      "limit": 420
    },
    "kake": {
      "name": "かけ算",
      "answer": "soroban",
      "N": 15,
      "per": 10,
      "pass": 100,
      "limit": 420
    },
    "wari": {
      "name": "わり算",
      "answer": "soroban",
      "N": 15,
      "per": 10,
      "pass": 100,
      "limit": 420
    },
    "anzan": {
      "name": "あんざん",
      "answer": "input",
      "N": 10,
      "per": 10,
      "pass": 70,
      "limit": 180
    },
    "flash": {
      "name": "フラッシュ暗算",
      "answer": "flash"
    }
  },
  "exams": {
    "soroban": {
      "name": "珠算",
      "subjs": [
        "mitori",
        "kake",
        "wari"
      ]
    },
    "anzan": {
      "name": "暗算",
      "subjs": [
        "anzan"
      ]
    }
  },
  "grades": [
    {
      "key": "20級",
      "band": "kyu",
      "n": 20,
      "mitori": { "digits": 1, "terms": 2, "sub": false, "sumMax": 5, "label": "こたえが5まで" },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 2, "sub": false, "sumMax": 5, "label": "こたえが5まで" },
      "flash": { "digits": 1, "terms": 2, "sec": 8, "pace": 1050 }
    },
    {
      "key": "19級",
      "band": "kyu",
      "n": 19,
      "mitori": { "digits": 1, "terms": 2, "sub": false, "sumMax": 9, "label": "こたえが9まで（くり上がりなし）" },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 2, "sub": false, "sumMax": 9, "label": "こたえが9まで（くり上がりなし）" },
      "flash": { "digits": 1, "terms": 2, "sec": 6, "pace": 1029 }
    },
    {
      "key": "18級",
      "band": "kyu",
      "n": 18,
      "mitori": { "digits": 1, "terms": 2, "sub": false, "sumMin": 6, "sumMax": 10, "label": "こたえが6〜10（五玉をつかう）" },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 2, "sub": false, "sumMin": 6, "sumMax": 10, "label": "こたえが6〜10（五玉をつかう）" },
      "flash": { "digits": 1, "terms": 3, "sec": 7, "pace": 1008 }
    },
    {
      "key": "17級",
      "band": "kyu",
      "n": 17,
      "mitori": { "digits": 1, "terms": 2, "sub": false, "sumMin": 11, "sumMax": 18, "label": "くり上がり（こたえ11〜18）" },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 2, "sub": false, "sumMin": 11, "sumMax": 18, "label": "くり上がり（こたえ11〜18）" },
      "flash": { "digits": 1, "terms": 3, "sec": 6, "pace": 987 }
    },
    {
      "key": "16級",
      "band": "kyu",
      "n": 16,
      "mitori": { "digits": 1, "terms": 3, "sub": false, "sumMax": 9, "label": "3口・くり上がりなし" },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 3, "sub": false, "sumMax": 9, "label": "3口・くり上がりなし" },
      "flash": { "digits": 1, "terms": 4, "sec": 6, "pace": 966 }
    },
    {
      "key": "15級",
      "band": "kyu",
      "n": 15,
      "mitori": { "digits": 1, "terms": 5, "termsMax": 6 },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 3, "sub": false, "sumMax": 18, "label": "3口" },
      "flash": { "digits": 1, "terms": 4, "sec": 5, "pace": 945 }
    },
    {
      "key": "14級",
      "band": "kyu",
      "n": 14,
      "mitori": { "variants": [ { "digits": 1, "terms": 5, "termsMax": 6 },
          { "digits": 2, "terms": 5, "termsMax": 6 }
        ]
      },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 3, "sub": false },
      "flash": { "digits": 1, "terms": 5, "sec": 6, "pace": 924 }
    },
    {
      "key": "13級",
      "band": "kyu",
      "n": 13,
      "mitori": { "digits": 2, "terms": 5, "termsMax": 6 },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 3, "sub": false },
      "flash": { "digits": 1, "terms": 5, "sec": 5, "pace": 903 }
    },
    {
      "key": "12級",
      "band": "kyu",
      "n": 12,
      "mitori": { "digits": 2, "terms": 5, "termsMax": 6 },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 3, "sub": false },
      "flash": { "digits": 1, "terms": 6, "sec": 5, "pace": 882 }
    },
    {
      "key": "11級",
      "band": "kyu",
      "n": 11,
      "mitori": { "digits": 2, "terms": 5, "termsMax": 6 },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 3, "sub": false },
      "flash": { "digits": 1, "terms": 6, "sec": 4, "pace": 861 }
    },
    {
      "key": "10級",
      "band": "kyu",
      "n": 10,
      "mitori": { "variants": [ { "digits": 1, "terms": 7 },
          { "digits": 2, "terms": 5 }
        ]
      },
      "kake": null,
      "wari": null,
      "anzan": { "digits": 1, "terms": 3, "sub": false },
      "flash": { "digits": 1, "terms": 3, "sec": 2.4, "pace": 839 }
    },
    {
      "key": "9級",
      "band": "kyu",
      "n": 9,
      "mitori": { "digits": 2, "terms": 8 },
      "kake": { "a": 2, "b": 1 },
      "wari": null,
      "anzan": { "digits": 1, "terms": 4, "sub": false },
      "flash": { "digits": 1, "terms": 4, "sec": 3.2, "pace": 818 }
    },
    {
      "key": "8級",
      "band": "kyu",
      "n": 8,
      "mitori": { "digits": 2, "terms": 8 },
      "kake": { "a": 3, "b": 1 },
      "wari": null,
      "anzan": { "digits": 2, "terms": 3, "sub": false },
      "flash": { "digits": 1, "terms": 5, "sec": 4, "pace": 797 }
    },
    {
      "key": "7級",
      "band": "kyu",
      "n": 7,
      "mitori": { "digits": 2, "terms": 10 },
      "kake": { "a": 2, "b": 2 },
      "wari": { "D": 3, "dv": 1, "qd": 2 },
      "anzan": { "digits": 2, "terms": 3, "sub": false },
      "flash": { "digits": 1, "terms": 7, "sec": 5.6, "pace": 776 }
    },
    {
      "key": "6級",
      "band": "kyu",
      "n": 6,
      "mitori": { "digits": 3, "terms": 10 },
      "kake": { "a": 3, "b": 2 },
      "wari": { "D": 4, "dv": 1, "qd": 3 },
      "anzan": { "digits": 2, "terms": 4, "sub": true },
      "flash": { "digits": 2, "terms": 3, "sec": 2.4, "pace": 755 }
    },
    {
      "key": "5級",
      "band": "kyu",
      "n": 5,
      "mitori": { "digits": 4, "terms": 10 },
      "kake": { "a": 3, "b": 3 },
      "wari": { "D": 4, "dv": 2, "qd": 2 },
      "anzan": { "digits": 2, "terms": 5, "sub": true },
      "flash": { "digits": 2, "terms": 4, "sec": 3.2, "pace": 734 }
    },
    {
      "key": "4級",
      "band": "kyu",
      "n": 4,
      "mitori": { "digits": 4, "terms": 10 },
      "kake": { "a": 4, "b": 3 },
      "wari": { "D": 5, "dv": 2, "qd": 3 },
      "anzan": { "digits": 2, "terms": 6, "sub": true },
      "flash": { "digits": 2, "terms": 5, "sec": 4, "pace": 713 }
    },
    {
      "key": "3級",
      "band": "kyu",
      "n": 3,
      "mitori": { "digits": 5, "terms": 10 },
      "kake": { "a": 4, "b": 3 },
      "wari": { "D": 6, "dv": 3, "qd": 3 },
      "anzan": { "digits": 2, "terms": 8, "sub": true },
      "flash": { "digits": 2, "terms": 7, "sec": 5.6, "pace": 692 }
    },
    {
      "key": "2級",
      "band": "kyu",
      "n": 2,
      "mitori": { "digits": 5, "terms": 10 },
      "kake": { "a": 4, "b": 4 },
      "wari": { "D": 7, "dv": 3, "qd": 4 },
      "anzan": { "digits": 2, "terms": 12, "sub": true },
      "flash": { "digits": 2, "terms": 10, "sec": 8, "pace": 671 }
    },
    {
      "key": "1級",
      "band": "kyu",
      "n": 1,
      "mitori": { "digits": 6, "terms": 10 },
      "kake": { "a": 5, "b": 4 },
      "wari": { "D": 8, "dv": 4, "qd": 4 },
      "anzan": { "digits": 3, "terms": 5, "sub": true },
      "flash": { "digits": 3, "terms": 5, "sec": 4, "pace": 650 }
    },
    {
      "key": "初段",
      "band": "dan",
      "n": 1,
      "mitori": { "digits": 5, "terms": 15 },
      "kake": { "a": 5, "b": 4 },
      "wari": { "D": 8, "dv": 4, "qd": null },
      "anzan": { "digits": 4, "terms": 15 },
      "flash": { "digits": 2, "terms": 15, "sec": 10, "pace": 588 }
    },
    {
      "key": "二段",
      "band": "dan",
      "n": 2,
      "mitori": { "digits": 5, "terms": 15 },
      "kake": { "a": 5, "b": 4 },
      "wari": { "D": 9, "dv": 4, "qd": null },
      "anzan": { "digits": 4, "terms": 15 },
      "flash": { "digits": 3, "terms": 4, "sec": 4, "pace": 556 }
    },
    {
      "key": "三段",
      "band": "dan",
      "n": 3,
      "mitori": { "digits": 5, "terms": 15 },
      "kake": { "a": 5, "b": 4 },
      "wari": { "D": 9, "dv": 4, "qd": null },
      "anzan": { "digits": 4, "terms": 15 },
      "flash": { "digits": 3, "terms": 6, "sec": 5, "pace": 524 }
    },
    {
      "key": "四段",
      "band": "dan",
      "n": 4,
      "mitori": { "digits": 6, "terms": 15 },
      "kake": { "a": 6, "b": 4 },
      "wari": { "D": 10, "dv": 4, "qd": null },
      "anzan": { "digits": 5, "terms": 15 },
      "flash": { "digits": 3, "terms": 8, "sec": 6, "pace": 492 }
    },
    {
      "key": "五段",
      "band": "dan",
      "n": 5,
      "mitori": { "digits": 6, "terms": 15 },
      "kake": { "a": 6, "b": 5 },
      "wari": { "D": 10, "dv": 5, "qd": null },
      "anzan": { "digits": 5, "terms": 15 },
      "flash": { "digits": 3, "terms": 10, "sec": 7, "pace": 460 }
    },
    {
      "key": "六段",
      "band": "dan",
      "n": 6,
      "mitori": { "digits": 6, "terms": 15 },
      "kake": { "a": 6, "b": 5 },
      "wari": { "D": 11, "dv": 5, "qd": null },
      "anzan": { "digits": 5, "terms": 15 },
      "flash": { "digits": 3, "terms": 12, "sec": 8, "pace": 428 }
    },
    {
      "key": "七段",
      "band": "dan",
      "n": 7,
      "mitori": { "digits": 7, "terms": 15 },
      "kake": { "a": 7, "b": 5 },
      "wari": { "D": 11, "dv": 5, "qd": null },
      "anzan": { "digits": 6, "terms": 15 },
      "flash": { "digits": 3, "terms": 15, "sec": 8, "pace": 396 }
    },
    {
      "key": "八段",
      "band": "dan",
      "n": 8,
      "mitori": { "digits": 7, "terms": 15 },
      "kake": { "a": 7, "b": 5 },
      "wari": { "D": 12, "dv": 5, "qd": null },
      "anzan": { "digits": 6, "terms": 15 },
      "flash": { "digits": 3, "terms": 15, "sec": 6, "pace": 364 }
    },
    {
      "key": "九段",
      "band": "dan",
      "n": 9,
      "mitori": { "digits": 7, "terms": 15 },
      "kake": { "a": 7, "b": 6 },
      "wari": { "D": 12, "dv": 6, "qd": null },
      "anzan": { "digits": 6, "terms": 15 },
      "flash": { "digits": 3, "terms": 15, "sec": 4, "pace": 332 }
    },
    {
      "key": "十段",
      "band": "dan",
      "n": 10,
      "mitori": { "digits": 8, "terms": 15 },
      "kake": { "a": 8, "b": 6 },
      "wari": { "D": 13, "dv": 6, "qd": null },
      "anzan": { "digits": 7, "terms": 15 },
      "flash": { "digits": 3, "terms": 15, "sec": 3, "pace": 300 }
    }
  ]
};

/* ============================================================
   派生の 級体系「標準（10級から）」
   入門の 級（20〜11級）を 使わない 教室むけ。上の 表から 10級〜十段だけを 抜き出す（中身は 同じ）。
   ※ 新しい 級体系を 足すときは、この 下に 同じ 形で 書く（id は 英数字、name は 画面に 出る 名前）
   ============================================================ */
window.SK_CURRICULA.sk10 = Object.assign({}, window.SK_CURRICULA.sk, {
  id: "sk10",
  name: "標準（10級から）",
  note: "入門の級（20〜11級）を使わない。10級〜十段の中身は標準と同じ。",
  grades: window.SK_CURRICULA.sk.grades.filter((g) => g.band === "dan" || g.n <= 10),
});
/* 画面の プルダウンに 出す 順番 */
window.SK_CURRICULUM_ORDER = ["sk", "sk10"];

/* ============================================================
   教室だけの 表（段階3）の 検査
   先生画面で 直した 表は Firestore の classes/{cid}.curriculum に 入り、子どもの 端末に 配られる。
   形が こわれていたら（数が 範囲外・級の 名前が 重複 など）null を 返し、子ども側は 標準に もどす。
   数は 範囲に おさめ、知らない 項目は 捨てる。しゅもくの 名前・答え方・SK検定の 組み合わせは 標準の まま。
   ============================================================ */
window.SK_CURRICULUM_CHECK = function (c) {
  try {
    if (!c || typeof c !== "object" || !Array.isArray(c.grades) || !c.grades.length || c.grades.length > 60) return null;
    const num = (v, lo, hi) => { v = typeof v === "string" ? Number(v) : v; return (typeof v === "number" && isFinite(v) && v >= lo && v <= hi) ? Math.round(v) : null; };
    const spec = (s, kind) => {
      if (!s || typeof s !== "object") return null;
      const o = {};
      if (kind === "mitori" || kind === "anzan") {
        if (Array.isArray(s.variants) && s.variants.length) {
          o.variants = s.variants.slice(0, 4).map((v) => { const d = num(v && v.digits, 1, 15), t = num(v && v.terms, 2, 30); if (!d || !t) return null; const r = { digits: d, terms: t }; const tm = num(v.termsMax, t, 40); if (tm && tm > t) r.termsMax = tm; return r; });
          if (o.variants.some((v) => !v)) return null;
        } else {
          o.digits = num(s.digits, 1, 15); o.terms = num(s.terms, 2, 30); if (!o.digits || !o.terms) return null;
          const tm = num(s.termsMax, o.terms, 40); if (tm && tm > o.terms) o.termsMax = tm;
          const md = num(s.minDigits, 1, o.digits); if (md && md > 1) o.minDigits = md;   // 「3〜5桁」の 3
        }
        if (s.sub === false) o.sub = false;
        ["sumMin", "sumMax", "sumExact"].forEach((k) => { const v = num(s[k], 0, 999); if (v != null) o[k] = v; });
        if (typeof s.label === "string" && s.label.trim()) o.label = s.label.trim().slice(0, 40);
        return o;
      }
      const one = (v) => {
        if (kind === "kake") { const r = { a: num(v.a, 1, 12), b: num(v.b, 1, 12) }; return r.a && r.b ? r : null; }
        if (kind === "wari") { const r = { D: num(v.D, 1, 20), dv: num(v.dv, 1, 12) }; if (!r.D || !r.dv) return null; r.qd = num(v.qd, 1, 12); return r; }
        return null;
      };
      if (kind === "kake" || kind === "wari") {
        if (Array.isArray(s.variants) && s.variants.length) { o.variants = s.variants.slice(0, 4).map((v) => one(v || {})); if (o.variants.some((v) => !v)) return null; }
        else { const r = one(s); if (!r) return null; Object.assign(o, r); }
        return o;
      }
      if (kind === "flash") { o.digits = num(s.digits, 1, 5); o.terms = num(s.terms, 2, 30); o.pace = num(s.pace, 200, 5000); if (!o.digits || !o.terms || !o.pace) return null; o.sec = Math.round(o.terms * o.pace / 100) / 10; return o; }
      return null;
    };
    // 級ごとの しゅもくの きまり（問題数・1問の点・合格点・制限秒）の 上書き
    const exam = (e) => {
      if (!e || typeof e !== "object") return null;
      const o = {}; const N = num(e.N, 1, 100), per = num(e.per, 1, 100), pass = num(e.pass, 0, 10000), limit = num(e.limit, 10, 3600);
      if (N) o.N = N; if (per) o.per = per; if (pass != null) o.pass = pass; if (limit) o.limit = limit;
      return Object.keys(o).length ? o : null;
    };
    const grades = [];
    for (const g of c.grades) {
      if (!g || typeof g.key !== "string" || !g.key.trim() || g.key.trim().length > 20) return null;   // 「Intermediate A」など 英語の 名前も 通す
      const row = { key: g.key.trim(), band: g.band === "dan" ? "dan" : "kyu", n: num(g.n, 1, 99) || 1 };
      ["mitori", "kake", "wari", "anzan", "flash"].forEach((k) => { row[k] = g[k] ? spec(g[k], k) : null; if (row[k] && g[k].exam) { const e = exam(g[k].exam); if (e) row[k].exam = e; } });
      if (!row.mitori && !row.kake && !row.wari && !row.anzan && !row.flash) return null;
      grades.push(row);
    }
    if (new Set(grades.map((g) => g.key)).size !== grades.length) return null;
    const base = window.SK_CURRICULA.sk, subjects = {};
    Object.keys(base.subjects).forEach((k) => {
      const b = base.subjects[k], src = (c.subjects && c.subjects[k]) || {};
      subjects[k] = { name: typeof src.name === "string" && src.name.trim() ? src.name.trim().slice(0, 12) : b.name, answer: ["soroban", "input", "flash"].includes(src.answer) ? src.answer : b.answer };
      if (b.N != null) { subjects[k].N = num(src.N, 1, 100) || b.N; subjects[k].per = num(src.per, 1, 100) || b.per; subjects[k].pass = num(src.pass, 0, 10000) != null ? num(src.pass, 0, 10000) : b.pass; subjects[k].limit = num(src.limit, 10, 3600) || b.limit; }
    });
    return { id: "custom", name: String(c.name || "この教室の 基準").trim().slice(0, 30) || "この教室の 基準", note: String(c.note || "").slice(0, 200),
      subjects, exams: JSON.parse(JSON.stringify(base.exams)), grades };
  } catch (e) { return null; }
};
