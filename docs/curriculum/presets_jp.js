/* ============================================================
   団体の 検定を 参考にした 級体系（プリセット）
   ------------------------------------------------------------
   ※ どれも「公開されている 要項を 参考に、このアプリの 出題の 形に 写したもの」で、
      各団体とは 一切 関係が なく、非公式です。問題は すべて この場で 作ります。
      合格しても その団体の 資格には なりません。名前の「風」は そのためです。
   ※ 写せていないもの：小数・名数（円）の 問題、「実に 0を 使わない」などの 細かい きまり、
      1枚の 用紙に まとめて 出す 形式（このアプリは しゅもくごとに 分けて 出す）。

   形は curriculum/sk.js と 同じ。ちがいは 2つ：
     ・かけ算・わり算にも variants（桁の 組み合わせを 1問ごとに えらぶ）が 書ける
     ・しゅもくの 中に exam:{ N, per, pass, limit } を 書くと、その級だけ 問題数・1問の点・合格点・制限秒を 上書き
   ============================================================ */
(function () {
  const C = (window.SK_CURRICULA = window.SK_CURRICULA || {});

  /* ------------------------------------------------------------
     日商・日珠連 珠算能力検定 風（10級〜1級・準級つき）
     参考：日本珠算連盟の 公開ページ「問題の程度・題数・形式」。
     みとり算＝10題（1題10点）、かけ算・わり算＝20題（1題5点）、300点満点。
       1〜準3級：240点以上（80%）／4〜6級：210点以上（70%）
       7〜9級：みとり10題・かけ10題・わり10題（7・8級）、200点満点 120点以上（60%）／10級：60点以上
     時間は 本来「まとめて 30分（7〜10級は 20分）」。このアプリは しゅもくごとに 分けるので、
     題数の 割合で 分けてある（30分 → みとり 8分・かけ 11分・わり 11分）。
     「実法あわせて 7けた」は 4桁×3桁 と 3桁×4桁 を 1問ごとに えらぶ（variants）。
     ------------------------------------------------------------ */
  const KW = (pairs) => ({ variants: pairs.map((p) => ({ a: p[0], b: p[1] })) });                 // かけ算：[実の桁, 法の桁]
  const WV = (pairs) => ({ variants: pairs.map((p) => ({ D: p[0] + p[1], dv: p[0], qd: p[1] })) }); // わり算：[法の桁, 商の桁]
  const E = (N, per, pass, limit) => ({ N, per, pass, limit });
  const low = (mit, kake, wari, ex) => ({   // 7〜10級：20分・200点満点
    mitori: Object.assign(mit, { exam: E(10, 10, ex.mitori, 480) }),
    kake: kake ? Object.assign(kake, { exam: E(ex.kakeN, 5, ex.kake, ex.kakeN === 20 ? 720 : 360) }) : null,
    wari: wari ? Object.assign(wari, { exam: E(10, 5, ex.wari, 360) }) : null,
  });
  C.nissho = {
    id: "nissho",
    name: "日商・日珠連 珠算検定 風（非公式）",
    note: "日本商工会議所・日本珠算連盟の 珠算能力検定の 公開要項を 参考にした、このアプリ独自の 級体系。両団体とは 無関係・非公式です。",
    subjects: {
      mitori: { name: "みとり算", answer: "soroban", N: 10, per: 10, pass: 80, limit: 480 },
      kake:   { name: "かけ算",   answer: "soroban", N: 20, per: 5,  pass: 80, limit: 660 },
      wari:   { name: "わり算",   answer: "soroban", N: 20, per: 5,  pass: 80, limit: 660 },
      anzan:  { name: "あんざん", answer: "input",   N: 10, per: 10, pass: 70, limit: 180 },
      flash:  { name: "フラッシュ暗算", answer: "flash" },
    },
    exams: { soroban: { name: "珠算", subjs: ["mitori", "kake", "wari"] } },
    grades: [
      Object.assign({ key: "10級", band: "kyu", n: 10, anzan: null, flash: null }, low({ digits: 2, terms: 5 }, { a: 2, b: 1 }, null, { mitori: 30, kake: 30, kakeN: 20 })),
      Object.assign({ key: "9級",  band: "kyu", n: 9,  anzan: null, flash: null }, low({ digits: 2, terms: 5 }, { a: 2, b: 1 }, null, { mitori: 60, kake: 60, kakeN: 20 })),
      Object.assign({ key: "8級",  band: "kyu", n: 8,  anzan: null, flash: null }, low({ digits: 2, terms: 8 }, KW([[2, 2], [3, 1]]), WV([[1, 2]]), { mitori: 60, kake: 30, kakeN: 10, wari: 30 })),
      Object.assign({ key: "7級",  band: "kyu", n: 7,  anzan: null, flash: null }, low({ digits: 2, terms: 10 }, KW([[2, 2], [3, 1]]), WV([[2, 2], [1, 3]]), { mitori: 60, kake: 30, kakeN: 10, wari: 30 })),
      // 4〜6級：70%で 合格
      { key: "6級", band: "kyu", n: 6, mitori: { digits: 3, terms: 10, exam: E(10, 10, 70, 480) }, kake: Object.assign(KW([[3, 2], [2, 3]]), { exam: E(20, 5, 70, 660) }), wari: Object.assign(WV([[2, 2], [1, 3]]), { exam: E(20, 5, 70, 660) }), anzan: null, flash: null },
      { key: "5級", band: "kyu", n: 5, mitori: { digits: 4, terms: 10, exam: E(10, 10, 70, 480) }, kake: Object.assign(KW([[3, 3], [4, 2]]), { exam: E(20, 5, 70, 660) }), wari: Object.assign(WV([[2, 3], [3, 2]]), { exam: E(20, 5, 70, 660) }), anzan: null, flash: null },
      { key: "4級", band: "kyu", n: 4, mitori: { digits: 5, terms: 10, exam: E(10, 10, 70, 480) }, kake: Object.assign(KW([[4, 3], [3, 4]]), { exam: E(20, 5, 70, 660) }), wari: Object.assign(WV([[3, 3], [2, 4]]), { exam: E(20, 5, 70, 660) }), anzan: null, flash: null },
      // 準3〜1級：80%で 合格（subjects の 値の まま）
      { key: "準3級", band: "kyu", n: 3, mitori: { variants: [{ digits: 5, terms: 10 }, { digits: 6, terms: 10 }] }, kake: KW([[4, 3], [3, 4]]), wari: WV([[3, 3], [2, 4]]), anzan: null, flash: null },
      { key: "3級",   band: "kyu", n: 3, mitori: { digits: 6, terms: 10 }, kake: KW([[4, 3], [3, 4]]), wari: WV([[3, 3], [2, 4]]), anzan: null, flash: null },
      { key: "準2級", band: "kyu", n: 2, mitori: { digits: 7, terms: 10 }, kake: KW([[4, 4], [5, 3]]), wari: WV([[3, 4], [4, 3]]), anzan: null, flash: null },
      { key: "2級",   band: "kyu", n: 2, mitori: { digits: 8, terms: 10 }, kake: KW([[5, 4], [4, 5]]), wari: WV([[4, 4], [3, 5]]), anzan: null, flash: null },
      { key: "準1級", band: "kyu", n: 1, mitori: { digits: 9, terms: 10 }, kake: KW([[5, 5], [6, 4]]), wari: WV([[4, 5], [5, 4]]), anzan: null, flash: null },
      { key: "1級",   band: "kyu", n: 1, mitori: { digits: 10, terms: 10 }, kake: KW([[6, 5], [5, 6]]), wari: WV([[5, 5], [4, 6]]), anzan: null, flash: null },
    ],
  };

  /* ------------------------------------------------------------
     全珠学連 暗算検定 風（10級〜1級・準級つき・初段〜十段）
     参考：公益社団法人 全国珠算学校連盟「全国暗算技能検定試験要項」の 一覧表（R1.5.26 改訂）。
     しゅもくは 乗暗算・除暗算・見取暗算（すべて 頭の中で 計算して 数字で 答える）。
       級：乗・除 30題 4分（1題5点・150点満点）、見取 15題 4分（1題10点・150点満点）、各しゅもく 100点以上で 合格
       9・10級：見取だけ 45題 12分（A・B・C 15題ずつ）。ここでは 1題10点・450点満点・300点以上（＝30題）
       段位：乗・除 60題 4分・見取 30題 4分（各300点満点）。初段 120点、20点 増すごとに 昇段、十段 300点
     ------------------------------------------------------------ */
  const V = (list) => ({ variants: list });
  const dan = (k, n, pass) => ({ key: k, band: "dan", n, mitori: null, flash: null,
    kake: Object.assign(KW([[3, 2], [3, 3]]), { exam: E(60, 5, pass, 240) }),
    wari: Object.assign(WV([[2, 3], [3, 3]]), { exam: E(60, 5, pass, 240) }),
    anzan: Object.assign(V([{ digits: 3, terms: 7 }, { digits: 4, terms: 7 }]), { exam: E(30, 10, pass, 240) }) });
  const lowA = (k, n, spec) => ({ key: k, band: "kyu", n, mitori: null, kake: null, wari: null, flash: null,
    anzan: Object.assign(spec, { exam: E(45, 10, 300, 720) }) });
  C.zsgr = {
    id: "zsgr",
    name: "全珠学連 暗算検定 風（非公式）",
    note: "公益社団法人 全国珠算学校連盟の 全国暗算技能検定試験要項を 参考にした、このアプリ独自の 級体系。同連盟とは 無関係・非公式です。かけ算・わり算も 頭の中で 計算して 数字で 答えます。",
    subjects: {
      mitori: { name: "みとり算", answer: "soroban", N: 10, per: 10, pass: 70, limit: 420 },
      kake:   { name: "乗暗算",   answer: "input",   N: 30, per: 5,  pass: 100, limit: 240 },
      wari:   { name: "除暗算",   answer: "input",   N: 30, per: 5,  pass: 100, limit: 240 },
      anzan:  { name: "見取暗算", answer: "input",   N: 15, per: 10, pass: 100, limit: 240 },
      flash:  { name: "フラッシュ暗算", answer: "flash" },
    },
    exams: { anzan: { name: "暗算", subjs: ["kake", "wari", "anzan"] } },
    grades: [
      lowA("10級", 10, V([{ digits: 1, terms: 2 }, { digits: 1, terms: 3 }])),
      lowA("9級", 9, { digits: 1, terms: 3, sub: false }),
      { key: "8級", band: "kyu", n: 8, mitori: null, flash: null, kake: KW([[1, 1], [2, 1]]), wari: WV([[1, 1], [1, 2]]), anzan: { digits: 1, terms: 4, sub: false } },
      { key: "7級", band: "kyu", n: 7, mitori: null, flash: null, kake: { a: 2, b: 1 }, wari: { D: 3, dv: 1, qd: 2 }, anzan: { digits: 2, terms: 3, sub: false } },
      { key: "6級", band: "kyu", n: 6, mitori: null, flash: null, kake: { a: 2, b: 1 }, wari: { D: 3, dv: 1, qd: 2 }, anzan: { digits: 2, terms: 4, sub: false } },
      { key: "5級", band: "kyu", n: 5, mitori: null, flash: null, kake: { a: 2, b: 1 }, wari: { D: 3, dv: 1, qd: 2 }, anzan: { digits: 2, terms: 5, sub: false } },
      { key: "4級", band: "kyu", n: 4, mitori: null, flash: null, kake: KW([[2, 1], [3, 1]]), wari: WV([[1, 2], [1, 3]]), anzan: { digits: 2, terms: 6, sub: false } },
      { key: "準3級", band: "kyu", n: 3, mitori: null, flash: null, kake: KW([[2, 1], [3, 1]]), wari: WV([[1, 2], [1, 3]]), anzan: Object.assign(V([{ digits: 2, terms: 6 }, { digits: 2, terms: 7 }]), { sub: false }) },
      { key: "3級", band: "kyu", n: 3, mitori: null, flash: null, kake: { a: 3, b: 1 }, wari: { D: 4, dv: 1, qd: 3 }, anzan: { digits: 2, terms: 7, sub: false } },
      { key: "準2級", band: "kyu", n: 2, mitori: null, flash: null, kake: KW([[3, 1], [2, 2]]), wari: WV([[1, 3], [2, 2]]), anzan: Object.assign(V([{ digits: 2, terms: 7 }, { digits: 3, terms: 7 }]), { sub: false }) },
      { key: "2級", band: "kyu", n: 2, mitori: null, flash: null, kake: { a: 2, b: 2 }, wari: { D: 4, dv: 2, qd: 2 }, anzan: { digits: 3, terms: 7, sub: false } },
      { key: "準1級", band: "kyu", n: 1, mitori: null, flash: null, kake: KW([[2, 2], [3, 2]]), wari: WV([[2, 2], [2, 3]]), anzan: V([{ digits: 3, terms: 7 }, { digits: 4, terms: 7 }]) },
      { key: "1級", band: "kyu", n: 1, mitori: null, flash: null, kake: { a: 3, b: 2 }, wari: { D: 5, dv: 2, qd: 3 }, anzan: { digits: 4, terms: 7 } },
      dan("初段", 1, 120), dan("二段", 2, 140), dan("三段", 3, 160), dan("四段", 4, 180), dan("五段", 5, 200),
      dan("六段", 6, 220), dan("七段", 7, 240), dan("八段", 8, 260), dan("九段", 9, 280), dan("十段", 10, 300),
    ],
  };

  /* ------------------------------------------------------------
     UCMAS 大会 風（Basic 〜 Grand の 9段階・非公式）
     参考：UCMAS International Competition の 公開されている レベル別の 出題範囲（加減算の 桁と 口数、かけ算・わり算の 桁）。
     大会は「加減算・かけ算・わり算を 合わせて 200問を 8分」。このアプリは しゅもくごとに 分けるので、
     同じ 速さ（1問 2.4秒）に なるよう 25問・1分 に してある。
     Intermediate A から先は 暗算（頭の中で 計算して 数字で 答える）。Basic〜Elementary は そろばんで 答える。
     フラッシュ暗算は 大会に 別の 種目が あるが、レベルとの 対応が 公開されていないので ここでは 入れていない
     （教室の 表の 編集で 足せる）。UCMAS とは 無関係・非公式。
     ------------------------------------------------------------ */
  const UE = { N: 25, per: 4, pass: 70, limit: 60 };
  const U = (key, n, mit, anz, kake, wari) => ({ key, band: "kyu", n, flash: null,
    mitori: mit ? Object.assign(mit, { exam: UE }) : null, anzan: anz ? Object.assign(anz, { exam: UE }) : null,
    kake: kake ? Object.assign(kake, { exam: UE }) : null, wari: wari ? Object.assign(wari, { exam: UE }) : null });
  C.ucmas = {
    id: "ucmas",
    name: "UCMAS 大会 風（Basic〜Grand・非公式）",
    note: "UCMAS International Competition の 公開されている 出題範囲を 参考にした、このアプリ独自の 段階。UCMAS とは 無関係・非公式です。Intermediate A から 先は 頭の中で 計算して 数字で 答えます。",
    subjects: {
      mitori: { name: "加減算（そろばん）", answer: "soroban", N: 25, per: 4, pass: 70, limit: 60 },
      kake:   { name: "かけ算（暗算）",   answer: "input",   N: 25, per: 4, pass: 70, limit: 60 },
      wari:   { name: "わり算（暗算）",   answer: "input",   N: 25, per: 4, pass: 70, limit: 60 },
      anzan:  { name: "加減算（暗算）",   answer: "input",   N: 25, per: 4, pass: 70, limit: 60 },
      flash:  { name: "フラッシュ暗算", answer: "flash" },
    },
    exams: { soroban: { name: "そろばん", subjs: ["mitori"] }, anzan: { name: "暗算", subjs: ["anzan", "kake", "wari"] } },
    grades: [
      U("Basic",          29, { digits: 1, terms: 3, termsMax: 7 }, null, null, null),
      U("Elementary A",   28, { digits: 2, terms: 3, termsMax: 9 }, null, null, null),
      U("Elementary B",   27, { digits: 3, terms: 3, termsMax: 5 }, null, null, null),
      U("Intermediate A", 26, null, { digits: 2, terms: 3, termsMax: 10 }, { a: 2, b: 1 }, null),
      U("Intermediate B", 25, null, { digits: 2, terms: 5, termsMax: 8 }, KW([[2, 1], [1, 2]]), { D: 3, dv: 1, qd: 2 }),
      U("Higher A",       24, null, { digits: 2, terms: 6, termsMax: 10 }, KW([[3, 1], [1, 3]]), WV([[1, 2], [1, 3]])),
      U("Higher B",       23, null, { digits: 2, terms: 8, termsMax: 10 }, KW([[2, 2], [4, 1]]), WV([[1, 3], [2, 2]])),
      U("Advance",        22, null, { digits: 4, terms: 10 }, KW([[3, 2], [4, 2]]), WV([[2, 2], [2, 3], [3, 2]])),
      U("Grand",          21, null, { digits: 5, terms: 10 }, KW([[3, 2], [3, 3], [4, 2]]), WV([[2, 2], [3, 2], [3, 3], [4, 2]])),
    ],
  };

  /* ------------------------------------------------------------
     全珠連 珠算検定 風（10級〜1級・段位・非公式）
     参考：公益社団法人 全国珠算教育連盟の 珠算検定の 級別の 出題範囲（かけ算・わり算の 桁の 組み合わせ、見取算の 桁と 口数）。
     しゅもくごとに 7分。段位は 各30問・1問10点・300点満点。
     級の 問題数・配点は 資料に 無いので、段位に そろえて 30問・1問5点・150点満点・100点で 合格 に してある（めやす）。
     段位は「準初段〜十段」を 点数で 分けるが、その 境目は 資料に 無いので、ここでは 1つの「段位」（80点＝準初段の 基準）に してある。
     見取算の「3〜5桁」は minDigits で 下の桁を 決める。小数の 問題は 写せていない。全珠連とは 無関係・非公式。
     ------------------------------------------------------------ */
  const ZE = { N: 30, per: 5, pass: 100, limit: 420 };
  const Z = (key, n, mit, kake, wari, ex) => ({ key, band: n === "dan" ? "dan" : "kyu", n: n === "dan" ? 1 : n, anzan: null, flash: null,
    mitori: Object.assign(mit, { exam: ex || ZE }), kake: kake ? Object.assign(kake, { exam: ex || ZE }) : null, wari: wari ? Object.assign(wari, { exam: ex || ZE }) : null });
  C.zsr = {
    id: "zsr",
    name: "全珠連 珠算検定 風（非公式）",
    note: "公益社団法人 全国珠算教育連盟の 珠算検定の 公開されている 出題範囲を 参考にした、このアプリ独自の 級体系。同連盟とは 無関係・非公式です。しゅもくごとに 7分。",
    subjects: {
      mitori: { name: "見取算", answer: "soroban", N: 30, per: 5, pass: 100, limit: 420 },
      kake:   { name: "かけ算", answer: "soroban", N: 30, per: 5, pass: 100, limit: 420 },
      wari:   { name: "わり算", answer: "soroban", N: 30, per: 5, pass: 100, limit: 420 },
      anzan:  { name: "あんざん", answer: "input", N: 10, per: 10, pass: 70, limit: 180 },
      flash:  { name: "フラッシュ暗算", answer: "flash" },
    },
    exams: { soroban: { name: "珠算", subjs: ["mitori", "kake", "wari"] } },
    grades: [
      Z("10級", 10, { digits: 1, terms: 5 }, null, null),
      Z("9級",  9,  { digits: 2, terms: 5 }, { a: 2, b: 1 }, null),
      Z("8級",  8,  { digits: 2, terms: 5 }, { a: 3, b: 1 }, WV([[1, 2]])),
      Z("7級",  7,  { digits: 3, minDigits: 2, terms: 5 }, { a: 2, b: 2 }, WV([[1, 3]])),
      Z("6級",  6,  { digits: 3, minDigits: 2, terms: 7 }, KW([[2, 3], [3, 2]]), WV([[2, 2]])),
      Z("5級",  5,  { digits: 4, minDigits: 3, terms: 7 }, KW([[2, 4], [3, 3], [4, 2]]), WV([[2, 3], [3, 2]])),
      Z("4級",  4,  { digits: 5, minDigits: 3, terms: 7 }, KW([[2, 5], [3, 4], [4, 3], [5, 2]]), WV([[2, 4], [3, 3], [4, 2]])),
      Z("3級",  3,  { digits: 5, minDigits: 3, terms: 8 }, KW([[2, 5], [3, 4], [4, 3], [5, 2]]), WV([[2, 4], [3, 3], [4, 2]])),
      Z("2級",  2,  { digits: 6, minDigits: 4, terms: 8 }, KW([[3, 5], [4, 4], [5, 3]]), WV([[2, 5], [3, 4], [4, 3], [5, 2]])),
      Z("1級",  1,  { digits: 7, minDigits: 4, terms: 8 }, KW([[3, 6], [4, 5], [5, 4], [6, 3]]), WV([[3, 5], [4, 4], [5, 3]])),
      Z("段位", "dan", { digits: 9, minDigits: 3, terms: 8 }, KW([[4, 7], [5, 6], [6, 5]]), WV([[4, 7], [5, 6], [6, 5]]), { N: 30, per: 10, pass: 80, limit: 420 }),
    ],
  };

  window.SK_CURRICULUM_ORDER = ["sk", "sk10", "nissho", "zsr", "zsgr", "ucmas"];
})();
