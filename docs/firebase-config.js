/* Firebase の 設定。
   Firebase コンソール →「プロジェクトの設定」→「マイアプリ」に 出る firebaseConfig の 中身。
   apiKey は 秘密ではない（ブラウザに 埋めこむ 前提の 識別子。守りは firestore.rules で 行う）。
   ここが null だと「お試しモード」＝この端末の中だけで 動く。 */
window.SK_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBy780b2203ZzniIUE1X91-b7vGni19VqY",
  authDomain: "soroban-kingdom.firebaseapp.com",
  projectId: "soroban-kingdom",
  storageBucket: "soroban-kingdom.firebasestorage.app",
  messagingSenderId: "113503697891",
  appId: "1:113503697891:web:906c26fa73a3ced2eafed6",
};
