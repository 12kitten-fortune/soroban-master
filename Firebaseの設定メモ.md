# Firebase の 設定メモ（先生画面）

先生画面（`docs/class/`）と 生徒の「教室に 参加」は、**設定が 無くても お試しモードで 動く**。
その端末の中だけで 完結するので、まず これで 感触を つかめる。
本番（別の端末から 先生が 見る）に するには 下の 4つ。

---

## ① Firebase プロジェクトを 作る

<https://console.firebase.google.com> →「プロジェクトを作成」
- 名前 `soroban-kingdom`
- **Gemini in Firebase：オフ**（要らない）
- **Google アナリティクス：オフ**（あとで 足せる）

## ② ログインの しくみを 有効にする

左メニュー「構築」→「**Authentication**」→「始める」

| 有効にするもの | 誰が つかう |
|---|---|
| **メール／パスワード** | 先生 |
| **匿名** | 生徒（端末を 教室に むすびつけるため） |

> 匿名を 忘れると、生徒が 参加できない。

## ③ Firestore を 作る

左メニュー「構築」→「**Firestore Database**」→「データベースを作成」
- 場所：**asia-northeast1（東京）**
- **本番環境モード**（守りは ④で 入れる）

作ったら「**ルール**」タブを ひらき、この リポジトリの **`firestore.rules`** を
まるごと 貼りつけて「**公開**」。

## ④ 設定を サイトに 貼る

左上の 歯車 →「プロジェクトの設定」→ 下の「マイアプリ」→ **`</>`（ウェブ）**
- ニックネーム `web`／**Hosting は チェックしない**

出てくる `firebaseConfig` の 中身を、**`docs/firebase-config.js`** の
`null` の ところに 貼る。

```js
window.SK_FIREBASE_CONFIG = {
  apiKey: "…", authDomain: "…", projectId: "…",
  storageBucket: "…", messagingSenderId: "…", appId: "…",
};
```

> `apiKey` は **秘密ではない**。ブラウザに 埋めこむ 前提の 識別子で、
> 守りは `firestore.rules` の 側で 行う。GitHub に 入れて よい。

最後に、コンソールの「Authentication →設定→ 承認済みドメイン」に
**`sorobankingdom.com`** が 入っているか 確かめる（無ければ 追加）。

---

## データの 形

```
teachers/{uid}                              先生の 名前
codes/{コード6文字}   → { classId }          コード → 教室
classes/{cid}                               教室（name, code, teacherUid）
  students/{sid}                            生徒（nick, uids[], stat）
    sessions/{時刻}                          1セットの 記録
```

**生徒からは 集めないもの**：メール・本名・生年月日・住所。
にっくねーむと 練習の 記録だけ。

## 守りの 考え方（firestore.rules）

- 先生（メール＋パスワード）＝ **自分の教室だけ** 読み書き
- 生徒（匿名）＝ 教室の **名前の一覧は 見られる**が、
  ほかの子の **記録は 読めない**。書けるのは **自分の 記録だけ**、しかも **足すだけ**（消せない・書きかえられない）
- 生徒は 教室や ほかの生徒を **作れない・消せない**

## 無料枠

Firestore の 無料枠は 1日 読み 5万 / 書き 2万。
30人 × 10教室が 毎日 4セットでも 1日 1,200書き。**十分 収まる。**

## 確かめ方

```
node class-test.mjs        （scratchpad。先生→生徒→先生 の 通し確認）
```
お試しモードでの 通しなので、Firebase を 入れたあとは
実際に 2つの 端末（先生＝パソコン／生徒＝スマホ）で 一度 試すこと。
