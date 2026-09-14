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
