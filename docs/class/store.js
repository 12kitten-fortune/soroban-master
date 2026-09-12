/* 先生画面（class/）と 生徒側（app.js）が 共通で つかう「保存のしくみ」。
   firebase-config.js に 設定が あれば Firebase に、なければ この端末の localStorage に 保存する。
   画面側は window.SKStore の 関数だけを 呼ぶので、どちらでも 同じに 動く。

   データの形（Firebase の Firestore でも 同じ）
     teachers/{uid}                 { name, email, createdAt }
     codes/{code}                   { classId }                       … クラスコード → 教室
     classes/{cid}                  { name, code, preset, teacherUid, createdAt }
     classes/{cid}/students/{sid}   { nick, createdAt, lastSeen, uids[], stat }
     classes/{cid}/students/{sid}/sessions/{t}   … 1セットの 記録（app.js の logSession と 同じ形）
     classes/{cid}/homework/{hid}   { subj, g, sets, due, note, createdAt }   … 先生が 出した 宿題
       できたかどうかは 生徒側が 数えて stat.hw = { hid: できたセット数 } に 入れる */
(function (global) {
  "use strict";
  const LS_KEY = "sk_class_db";
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";           // まぎらわしい 0/O/1/I を 抜いた 32文字
  const code6 = () => { let s = ""; for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = () => Date.now();

  /* 生徒の 記録から「先生画面の 一覧」に 出す まとめ（7日ぶん）。生徒側で 計算して 送る */
  function statOf(list, hws) {
    const lim = now() - 7 * 86400000;
    const w = list.filter((e) => (e.t || 0) >= lim);
    const N = w.reduce((a, e) => a + (e.N || 0), 0), C = w.reduce((a, e) => a + (e.correct || 0), 0);
    const miss = {};
    w.forEach((e) => (e.miss || []).forEach((m) => { miss[m.k || "other"] = (miss[m.k || "other"] || 0) + 1; }));
    const last = list.length ? list[list.length - 1] : null;
    const hw = {};
    (hws || []).forEach((h) => { hw[h.id] = hwDone(h, list); });
    return { n7: w.length, acc7: N ? Math.round((C / N) * 100) : null, last: last ? last.t : 0, lastG: last ? last.g : "", miss7: miss, hw };
  }
  /* 宿題が いくつ できたか：宿題を 出した あとの 記録で、しゅもくと 級が 同じ セットを 数える */
  function hwDone(h, list) {
    return list.filter((e) => (e.t || 0) >= (h.createdAt || 0) && e.subj === h.subj && e.g === h.g).length;
  }
  /* プラン：生徒の 人数の 上限。plan は 運営者が Firebase の 画面で 入れる（trial が はじめの 値）
     trial＝おためし（10人・登録から 31日）／pioneer＝先行10教室（1年 無料）／class＝教室／school＝スクール */
  const PLANS = {
    trial:   { name: "おためし", max: 10, days: 31 },
    pioneer: { name: "先行教室（1年 無料）", max: 40 },
    class:   { name: "教室プラン", max: 40 },
    school:  { name: "スクールプラン", max: 150 },
  };
  function planInfo(t) {
    const key = t && PLANS[t.plan] ? t.plan : "trial", P = PLANS[key];
    let until = t && t.planUntil ? String(t.planUntil) : "";
    if (!until && P.days && t && t.createdAt) until = new Date(t.createdAt + P.days * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const daysLeft = until ? Math.ceil((new Date(until + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000) : null;
    return { key, name: P.name, max: P.max, until, daysLeft, expired: daysLeft != null && daysLeft < 0 };
  }
  const HW_SUBJ = ["mitori", "kake", "wari", "anzan", "flash"];
  function cleanHomework(hw) {
    return {
      subj: HW_SUBJ.includes(hw.subj) ? hw.subj : "mitori",
      g: String(hw.g || "").slice(0, 4),
      sets: Math.max(1, Math.min(20, parseInt(hw.sets, 10) || 1)),
      due: /^\d{4}-\d{2}-\d{2}$/.test(hw.due || "") ? hw.due : "",
      note: String(hw.note || "").slice(0, 60),
      createdAt: now(),
    };
  }

  /* ============================================================ お試し（この端末の中だけ） */
  function LocalStore() {
    const empty = () => ({ teacher: null, classes: {}, students: {}, sessions: {}, homework: {} });
    const load = () => { try { return Object.assign(empty(), JSON.parse(localStorage.getItem(LS_KEY) || "null") || {}); } catch (e) { return empty(); } };
    const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { console.error("保存に 失敗", e); } };
    let db = load(); const authCbs = [];
    const fire = () => authCbs.forEach((cb) => cb(db.teacher));
    const key = (cid, sid) => cid + "/" + sid;
    return {
      mode: "local",
      onAuth(cb) { authCbs.push(cb); setTimeout(() => cb(db.teacher), 0); },
      async signUp(email, pw, name) { db.teacher = { uid: "local", email: email || "", name: name || "先生", plan: "trial", createdAt: now() }; save(); fire(); return db.teacher; },
      async signIn(email) { db.teacher = db.teacher || { uid: "local", email: email || "", name: "先生", plan: "trial", createdAt: now() }; save(); fire(); return db.teacher; },
      async countStudents() { return Object.values(db.students).reduce((a, m) => a + Object.keys(m).length, 0); },
      async signOut() { db.teacher = null; save(); fire(); },
      async listClasses() { return Object.values(db.classes).sort((a, b) => a.createdAt - b.createdAt); },
      async createClass(name) {
        let code = code6(); while (Object.values(db.classes).some((c) => c.code === code)) code = code6();
        const c = { id: newId(), name, code, preset: "sk", createdAt: now() };
        db.classes[c.id] = c; db.students[c.id] = {}; save(); return c;
      },
      async getClass(cid) { return db.classes[cid] || null; },
      async updateClass(cid, patch) { Object.assign(db.classes[cid], patch); save(); return db.classes[cid]; },
      async deleteClass(cid) { delete db.classes[cid]; delete db.students[cid]; delete db.homework[cid]; Object.keys(db.sessions).forEach((k) => { if (k.startsWith(cid + "/")) delete db.sessions[k]; }); save(); },
      /* ---- 宿題 ---- */
      async listHomework(cid) { return Object.values(db.homework[cid] || {}).sort((a, b) => a.createdAt - b.createdAt); },
      async addHomework(cid, hw) {
        const h = Object.assign({ id: newId() }, cleanHomework(hw));
        db.homework[cid] = db.homework[cid] || {}; db.homework[cid][h.id] = h; save(); return h;
      },
      async removeHomework(cid, hid) { if (db.homework[cid]) delete db.homework[cid][hid]; save(); },
      async listStudents(cid) { return Object.values(db.students[cid] || {}).sort((a, b) => a.createdAt - b.createdAt); },
      async addStudents(cid, nicks) {
        const out = []; db.students[cid] = db.students[cid] || {};
        nicks.map((n) => String(n).slice(0, 20)).forEach((n) => { const s = { id: newId(), nick: n, createdAt: now(), lastSeen: 0, uids: [], stat: null }; db.students[cid][s.id] = s; out.push(s); });
        save(); return out;
      },
      async updateStudent(cid, sid, patch) { Object.assign(db.students[cid][sid], patch); save(); },
      async removeStudent(cid, sid) { delete db.students[cid][sid]; delete db.sessions[key(cid, sid)]; save(); },
      async listSessions(cid, sid, n) { return (db.sessions[key(cid, sid)] || []).slice(-(n || 300)); },
      /* ---- 生徒側 ---- */
      async resolveCode(code) { const c = Object.values(db.classes).find((x) => x.code === String(code || "").toUpperCase()); return c ? { id: c.id, name: c.name, preset: c.preset } : null; },
      async joinClass(cid, sid) {
        const s = db.students[cid] && db.students[cid][sid]; if (!s) throw new Error("その名前は 教室に ありません");
        s.lastSeen = now(); save();
        const have = db.sessions[key(cid, sid)] || [];
        return { cid, sid, nick: s.nick, latest: have.length ? have[have.length - 1].t : 0 };
      },
      async pushSessions(cid, sid, list, allList, hws) {
        const k = key(cid, sid); const have = new Set((db.sessions[k] || []).map((e) => e.t));
        db.sessions[k] = (db.sessions[k] || []).concat(list.filter((e) => !have.has(e.t))).slice(-2000);
        const s = db.students[cid] && db.students[cid][sid];
        if (s) { s.lastSeen = now(); s.stat = statOf(allList || db.sessions[k], hws || Object.values(db.homework[cid] || {})); }
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
            let d = {};
            try { const t = await tRef(u.uid).get(); d = t.exists ? (t.data() || {}) : {}; } catch (e) { }
            me = { uid: u.uid, email: u.email, name: d.name || (u.email || "").split("@")[0], plan: d.plan || "trial", planUntil: d.planUntil || "", createdAt: d.createdAt || 0 };
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
      // 先生の 生徒の 合計（プランの 上限を 見るため。教室は 少ないので 順に 数える）
      async countStudents() {
        const cs = await this.listClasses(); let n = 0;
        for (const c of cs) { const q = await cRef(c.id).collection("students").get(); n += q.size; }
        return n;
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
      async _deleteStudentDeep(cid, sid) {
        // 記録を 300件ずつ 消してから 生徒を 消す（サブコレクションは 親を 消しても 残るため）
        for (let guard = 0; guard < 40; guard++) {
          const q = await sRef(cid, sid).collection("sessions").limit(300).get();
          if (q.empty) break;
          const b = fs.batch(); q.docs.forEach((d) => b.delete(d.ref)); await b.commit();
        }
        await sRef(cid, sid).delete();
      },
      async deleteClass(cid) {
        const c = await this.getClass(cid);
        const st = await this.listStudents(cid);
        for (const s of st) await this._deleteStudentDeep(cid, s.id);
        try { const hq = await cRef(cid).collection("homework").get(); if (!hq.empty) { const b = fs.batch(); hq.docs.forEach((d) => b.delete(d.ref)); await b.commit(); } } catch (e) { }
        if (c && c.code) { try { await fs.collection("codes").doc(c.code).delete(); } catch (e) { } }
        await cRef(cid).delete();
      },
      /* ---- 宿題（先生が 出す。生徒は 読むだけ） ---- */
      async listHomework(cid) { const q = await cRef(cid).collection("homework").get(); return q.docs.map(obj).sort((a, b) => a.createdAt - b.createdAt); },
      async addHomework(cid, hw) {
        const r = cRef(cid).collection("homework").doc(), h = cleanHomework(hw);
        await r.set(h); return Object.assign({ id: r.id }, h);
      },
      async removeHomework(cid, hid) { await cRef(cid).collection("homework").doc(hid).delete(); },
      async listStudents(cid) { const q = await cRef(cid).collection("students").get(); return q.docs.map(obj).sort((a, b) => a.createdAt - b.createdAt); },
      async addStudents(cid, nicks) {
        const b = fs.batch(), out = [];
        nicks.map((n) => String(n).slice(0, 20)).forEach((n) => { const r = cRef(cid).collection("students").doc(); const s = { nick: n, createdAt: now(), lastSeen: 0, uids: [], stat: null }; b.set(r, s); out.push(Object.assign({ id: r.id }, s)); });
        await b.commit(); return out;
      },
      async updateStudent(cid, sid, patch) { await sRef(cid, sid).update(patch); },
      async removeStudent(cid, sid) { await this._deleteStudentDeep(cid, sid); },
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
        let latest = 0;
        try { const q = await sRef(cid, sid).collection("sessions").orderBy("t", "desc").limit(1).get(); if (!q.empty) latest = q.docs[0].data().t || 0; } catch (e) { }
        return { cid, sid, nick: s.data().nick, latest };
      },
      async sendReset(email) { return auth.sendPasswordResetEmail(email); },
      async pushSessions(cid, sid, list, allList, hws) {
        await anon();
        const col = sRef(cid, sid).collection("sessions");
        try {
          const b = fs.batch();
          list.forEach((e) => b.set(col.doc(String(e.t)), e));
          await b.commit();
        } catch (err) {
          // ルールは「足すだけ」なので、すでに ある記録が 1つでも まざると まとめ送りは 全部 失敗する。
          // そのときは 1件ずつ 送り、ある物は とばす
          let sent = 0;
          for (const e of list) { try { await col.doc(String(e.t)).set(e); sent++; } catch (e2) { } }
          if (!sent && list.length) throw err;
        }
        await sRef(cid, sid).set({ lastSeen: now(), stat: statOf(allList || list, hws || []) }, { merge: true });
      },
    };
  }

  // URL に ?local=1 を つけると、設定が あっても お試しモード（自動テストと、通信なしでの 動作確認用）
  const forceLocal = /[?&]local=1/.test(global.location ? global.location.search : "") || global.SK_FORCE_LOCAL === true;
  const cfg = forceLocal ? null : global.SK_FIREBASE_CONFIG;
  global.SKStore = (cfg && global.firebase) ? FireStore(cfg) : LocalStore();
  global.SKStore.statOf = statOf;
  global.SKStore.hwDone = hwDone;
  global.SKStore.PLANS = PLANS;
  global.SKStore.planInfo = planInfo;
})(window);
