/* Firebase の 設定。
   Firebase コンソール →「プロジェクトの設定」→「マイアプリ」に 出る firebaseConfig の 中身を
   下の null の かわりに 貼る。apiKey は 秘密ではない（ブラウザに 埋めこむ 前提の 識別子。
   守りは firestore.rules で 行う）。
   null の あいだは「お試しモード」：先生画面も 生徒の参加も この端末の中だけで 動く。 */
window.SK_FIREBASE_CONFIG = null;
