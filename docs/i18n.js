/* ============================================================
   言葉の しくみ（i18n）
   ------------------------------------------------------------
   画面に 出る 日本語は、プログラムの 中では T("…") を 通す。
   いまの 言語（SK_I18N.lang）の 辞書に その 日本語が あれば 訳を 返し、無ければ 日本語の まま 返す。
   だから 日本語で 使う ぶんには 辞書は いらない（ja は 辞書なし）。
   英語などを 足すときは docs/lang/en.js に { "日本語": "English", … } を 書くだけ。
   辞書の 元に なる「言葉の 一覧」は tools_言葉の一覧を作る.mjs が 作る（docs/lang/catalog.ja.json）。

   ・T("あと{n}問", { n: 3 })  … { } の 中は あとから 入れる（訳の 中でも 同じ 名前で 使える）
   ・HTML に 直接 書いてある 文字（メニューなど）は translateDOM() が 辞書で 置きかえる
   ・辞書が 空の あいだは 何も しない（重くならない）
   ============================================================ */
(function (global) {
  "use strict";
  const KEY = "soroban_lang";
  const I = {
    lang: "ja",
    dict: {},
    loaded: {},
    // 訳す。無ければ そのまま
    t(s, vars) {
      let r = this.dict[s];
      if (r == null) r = s;
      if (vars) r = String(r).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
      return r;
    },
    // 言語を 切りかえる。docs/lang/<code>.js（window.SK_LANG_DICT に 辞書を 入れる ファイル）を 読む
    setLang(code, cb) {
      code = String(code || "ja").toLowerCase();
      try { localStorage.setItem(KEY, code); } catch (e) { }
      const done = () => { this.lang = code; this.dict = code === "ja" ? {} : (this.loaded[code] || {}); this.translateDOM(document.body); if (cb) cb(); };
      if (code === "ja" || this.loaded[code]) return done();
      const s = document.createElement("script");
      s.src = (global.SK_I18N_BASE || "") + "lang/" + code + ".js";
      s.onload = () => { this.loaded[code] = global.SK_LANG_DICT || {}; global.SK_LANG_DICT = null; done(); };
      s.onerror = () => { console.warn("言語ファイルが 読めません: " + code); done(); };
      document.head.appendChild(s);
    },
    // HTML に 書いてある 文字を 辞書で 置きかえる（文字の 前後の 空白は 残す）
    translateDOM(root) {
      if (!root || !Object.keys(this.dict).length) return;
      const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-say"];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === 3) {
          const raw = n.nodeValue, core = raw.trim();
          if (!core) continue;
          const p = n.parentNode; if (p && (p.tagName === "SCRIPT" || p.tagName === "STYLE")) continue;
          const tr = this.dict[core];
          if (tr != null && tr !== core) n.nodeValue = raw.replace(core, tr);
        } else {
          ATTRS.forEach((a) => { const v = n.getAttribute && n.getAttribute(a); if (v) { const tr = this.dict[v.trim()]; if (tr != null && tr !== v.trim()) n.setAttribute(a, tr); } });
        }
      }
    },
  };
  global.SK_I18N = I;
  global.T = (s, vars) => I.t(s, vars);
  // 前に えらんだ 言語が あれば、ページが できたら その言語に する
  let saved = "ja"; try { saved = localStorage.getItem(KEY) || "ja"; } catch (e) { }
  if (saved !== "ja") document.addEventListener("DOMContentLoaded", () => I.setLang(saved));
})(window);
