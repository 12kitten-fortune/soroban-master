/* 先生画面（class/）と 生徒側（app.js）が 共通で つかう「保存のしくみ」。
   firebase-config.js に 設定が あれば Firebase に、なければ この端末の localStorage に 保存する。
   画面側は window.SKStore の 関数だけを 呼ぶので、どちらでも 同じに 動く。

   データの形（Firebase の Firestore でも 同じ）
     teachers/{uid}                 { name, email, createdAt }
     codes/{code}                   { classId }                       … クラスコード → 教室
     classes/{cid}                  { name, code, preset, teacherUid, createdAt }
     classes/{cid}/students/{sid}   { nick, createdAt, lastSeen, uids[], stat }
     classes/{cid}/students/{sid}/sessions/{t}   … 1セットの 記録（app.js の logSession と 同じ形） */
(function (global) {
  "use strict";
  const LS_KEY = "sk_class_db";
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";           // まぎらわしい 0/O/1/I を 抜いた 32文字
  const code6 = () => { let s = ""; for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = () => Date.now();

  /* 生徒の 記録から「先生画面の 一覧」に 出す まとめ（7日ぶん）。生徒側で 計算して 送る */
  function statOf(list) {
    const lim = now() - 7 * 86400000;
    const w = list.filter((e) => (e.t || 0) >= lim);
    const N = w.reduce((a, e) => a + (e.N || 0), 0), C = w.reduce((a, e) => a + (e.correct || 0), 0);
    const miss = {};
    w.forEach((e) => (e.miss || []).forEach((m) => { miss[m.k || "other"] = (miss[m.k || "other"] || 0) + 1; }));
    const last = list.length ? list[list.length - 1] : null;
    return { n7: w.length, acc7: N ? Math.round((C / N) * 100) : null, last: last ? last.t : 0, lastG: last ? last.g : "", miss7: miss };
  }

  /* ============================================================ お試し（この端末の中だけ） */
  function LocalStore() {
    const empty = () => ({ teacher: null, classes: {}, students: {}, sessions: {} });
    const load = () => { try { return Object.assign(empty(), JSON.parse(localStorage.getItem(LS_KEY) || "null") || {}); } catch (e) { return empty(); } };
    const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { console.error("保存に 失敗", e); } };
    let db = load(); const authCbs = [];
    const fire = () => authCbs.forEach((cb) => cb(db.teacher));
    const key = (cid, sid) => cid + "/" + sid;
    return {
      mode: "local",
      onAuth(cb) { authCbs.push(cb); setTimeout(() => cb(db.teacher), 0); },
      async signUp(email, pw, name) { db.teacher = { uid: "local", email: email || "", name: name || "先生" }; save(); fire(); return db.teacher; },
      async signIn(email) { db.teacher = db.teacher || { uid: "local", email: email || "", name: "先生" }; save(); fire(); return db.teacher; },
      async signOut() { db.teacher = null; save(); fire(); },
      async listClasses() { return Object.values(db.classes).sort((a, b) => a.createdAt - b.createdAt); },
      async createClass(name) {
        let code = code6(); while (Object.values(db.classes).some((c) => c.code === code)) code = code6();
        const c = { id: newId(), name, code, preset: "sk", createdAt: now() };
        db.classes[c.id] = c; db.students[c.id] = {}; save(); return c;
      },
      async getClass(cid) { return db.classes[cid] || null; },
      async updateClass(cid, patch) { Object.assign(db.classes[cid], patch); save(); return db.classes[cid]; },
      async deleteClass(cid) { delete db.classes[cid]; delete db.students[cid]; Object.keys(db.sessions).forEach((k) => { if (k.startsWith(cid + "/")) delete db.sessions[k]; }); save(); },
      async listStudents(cid) { return Object.values(db.students[cid] || {}).sort((a, b) => a.createdAt - b.createdAt); },
      async addStudents(cid, nicks) {
        const out = []; db.students[cid] = db.students[cid] || {};
        nicks.forEach((n) => { const s = { id: newId(), nick: n, createdAt: now(), lastSeen: 0, uids: [], stat: null }; db.students[cid][s.id] = s; out.push(s); });
        save(); return out;
      },
      async updateStudent(cid, sid, patch) { Object.assign(db.students[cid][sid], patch); save(); },
      async removeStudent(cid, sid) { delete db.students[cid][sid]; delete db.sessions[key(cid, sid)]; save(); },
      async listSessions(cid, sid, n) { return (db.sessions[key(cid, sid)] || []).slice(-(n || 300)); },
      /* ---- 生徒側 ---- */
      async resolveCode(code) { const c = Object.values(db.classes).find((x) => x.code === String(code || "").toUpperCase()); return c ? { id: c.id, name: c.name, preset: c.preset } : null; },
      async joinClass(cid, sid) { const s = db.students[cid] && db.students[cid][sid]; if (!s) throw new Error("その名前は 教室に ありません"); s.lastSeen = now(); save(); return { cid, sid, nick: s.nick }; },
      async pushSessions(cid, sid, list) {
        const k = key(cid, sid); const have = new Set((db.sessions[k] || []).map((e) => e.t));
        db.sessions[k] = (db.sessions[k] || []).concat(list.filter((e) => !have.has(e.t))).slice(-2000);
        const s = db.students[cid] && db.students[cid][sid]; if (s) { s.lastSeen = now(); s.stat = statOf(db.sessions[k]); }
        save();
      },
    };
  }

  /* ============================================================ Firebase */
  function FireStore(cfg) {
    const fb = global.firebase;
    fb.initializeApp(cfg);
    const auth = fb.auth(), fs = fb.firestore();
    const tRef = (uid) => fs.collection("teachers").doc(uid);
    const cRef = (cid) => fs.collection("classes").doc(cid);
    const sRef = (cid, sid) => cRef(cid).collection("students").doc(sid);
    const obj = (d) => Object.assign({ id: d.id }, d.data());
    let me = null;
    const anon = async () => { if (!auth.currentUser) await auth.signInAnonymously(); return auth.currentUser; };
    return {
      mode: "firebase",
      onAuth(cb) {
        auth.onAuthStateChanged(async (u) => {
          if (u && !u.isAnonymous) {
            let name = "";
            try { const t = await tRef(u.uid).get(); name = t.exists ? (t.data().name || "") : ""; } catch (e) { }
            me = { uid: u.uid, email: u.email, name: name || (u.email || "").split("@")[0] };
          } else me = null;
          cb(me);
        });
      },
      async signUp(email, pw, name) {
        const r = await auth.createUserWithEmailAndPassword(email, pw);
        await tRef(r.user.uid).set({ name: name || "", email, createdAt: now() });
        return r.user;
      },
      async signIn(email, pw) { return (await auth.signInWithEmailAndPassword(email, pw)).user; },
      async signOut() { return auth.signOut(); },
      async listClasses() {
        const q = await fs.collection("classes").where("teacherUid", "==", me.uid).get();
        return q.docs.map(obj).sort((a, b) => a.createdAt - b.createdAt);
      },
      async createClass(name) {
        // クラスコードの 重複を さける：codes/{code} を 同じ トランザクションで 先に 押さえる
        for (let t = 0; t < 6; t++) {
          const code = code6(), ref = fs.collection("classes").doc(), c = { name, code, preset: "sk", teacherUid: me.uid, createdAt: now() };
          try {
            await fs.runTransaction(async (tx) => {
              const cd = fs.collection("codes").doc(code);
              if ((await tx.get(cd)).exists) throw new Error("dup");
              tx.set(cd, { classId: ref.id }); tx.set(ref, c);
            });
            return Object.assign({ id: ref.id }, c);
          } catch (e) { if (String(e && e.message) !== "dup") throw e; }
        }
        throw new Error("クラスコードが 作れませんでした。もう一度 おしてください");
      },
      async getClass(cid) { const d = await cRef(cid).get(); return d.exists ? obj(d) : null; },
      async updateClass(cid, patch) { await cRef(cid).update(patch); return this.getClass(cid); },
      async deleteClass(cid) { const c = await this.getClass(cid); if (c && c.code) { try { await fs.collection("codes").doc(c.code).delete(); } catch (e) { } } await cRef(cid).delete(); },
      async listStudents(cid) { const q = await cRef(cid).collection("students").get(); return q.docs.map(obj).sort((a, b) => a.createdAt - b.createdAt); },
      async addStudents(cid, nicks) {
        const b = fs.batch(), out = [];
        nicks.forEach((n) => { const r = cRef(cid).collection("students").doc(); const s = { nick: n, createdAt: now(), lastSeen: 0, uids: [], stat: null }; b.set(r, s); out.push(Object.assign({ id: r.id }, s)); });
        await b.commit(); return out;
      },
      async updateStudent(cid, sid, patch) { await sRef(cid, sid).update(patch); },
      async removeStudent(cid, sid) { await sRef(cid, sid).delete(); },
      async listSessions(cid, sid, n) {
        const q = await sRef(cid, sid).collection("sessions").orderBy("t", "desc").limit(n || 300).get();
        return q.docs.map(obj).reverse();
      },
      /* ---- 生徒側（匿名ログインで 端末を むすびつける） ---- */
      async resolveCode(code) {
        const d = await fs.collection("codes").doc(String(code || "").toUpperCase()).get();
        if (!d.exists) return null;
        const c = await cRef(d.data().classId).get();
        return c.exists ? { id: c.id, name: c.data().name, preset: c.data().preset } : null;
      },
      async joinClass(cid, sid) {
        const u = await anon();
        await sRef(cid, sid).update({ uids: fb.firestore.FieldValue.arrayUnion(u.uid), lastSeen: now() });
        const s = await sRef(cid, sid).get();
        return { cid, sid, nick: s.data().nick };
      },
      async pushSessions(cid, sid, list, allList) {
        await anon();
        const b = fs.batch();
        list.forEach((e) => b.set(sRef(cid, sid).collection("sessions").doc(String(e.t)), e));
        b.set(sRef(cid, sid), { lastSeen: now(), stat: statOf(allList || list) }, { merge: true });
        await b.commit();
      },
    };
  }

  const cfg = global.SK_FIREBASE_CONFIG;
  global.SKStore = (cfg && global.firebase) ? FireStore(cfg) : LocalStore();
  global.SKStore.statOf = statOf;
})(window);
