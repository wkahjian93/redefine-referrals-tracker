/* REDEFINE Referrals Tracker - server rules.
   Shared by the Google server (server/Code.gs, built by build.js), the local test server and test.js.
   handle(q, store) checks who is asking, validates every input, and reads/writes through `store`.
   A store provides: load(table), save(table, rows), withLock(fn), prop(key), fails(add), now(), random(),
   hash(text) -> hex, putPhoto(name, base64) -> id, getPhoto(id) -> base64, trashPhoto(id),
   ai(prompt, imageBase64) -> text, version(bump) -> number. */
var CORE = (function () {
  var TABLES = {
    agents: ['id', 'name', 'pin', 'role', 'created', 'active'],
    posts: ['id', 'agentId', 'kind', 'giver', 'text', 'photoId', 'count', 'status', 'created', 'purged'],
    refs: ['id', 'postId', 'agentId', 'name', 'age', 'phone', 'gender', 'remarks', 'status', 'dup', 'created', 'purged', 'appt', 'apptAt', 'close', 'closeAt', 'called', 'calledAt'],
    comments: ['id', 'postId', 'agentId', 'text', 'created'],
    settings: ['key', 'value'],
    log: ['at', 'by', 'action', 'detail'],
    sessions: ['token', 'agentId', 'created', 'lastSeen', 'device'],
    devices: ['token', 'agentId', 'created']
  };
  var CALL_DAYS = 14;                   // a lead must be called within 14 days of posting, or its lead bonus is forfeited
  var CALL_REMIND_DAYS = 7;             // from day 7 the agent gets a daily lock-screen reminder to call
  var KEEP_DAYS = 90;                    // client details are wiped after this; the name stays
  var SHOW_DAYS = 400;                   // how far back the app loads posts and chat
  var MAX_PHOTO_B64 = 2.5 * 1024 * 1024; // redacted photo, about 1.8 MB
  var MAX_READ_B64 = 4 * 1024 * 1024;
  var MAX_ROWS = 20;
  var ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
  var MILESTONES = [1, 5, 10, 20, 30, 50, 80, 100];

  function fail(code) { var e = new Error(code); e.appCode = code; throw e; }
  function str(v, max) { v = v == null ? '' : String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); return max ? v.slice(0, max) : v; }
  function newId(store, n) { var s = ''; for (var i = 0; i < n; i++) s += ID_CHARS[Math.floor(store.random() * ID_CHARS.length)]; return s; }
  function nowIso(store) { return store.now().toISOString(); }
  function daysAgo(store, iso) { return (store.now().getTime() - new Date(iso).getTime()) / 864e5; }
  function myt(iso) { return new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString(); }   // Malaysia time as ISO text
  function monthKey(iso) { return myt(iso).slice(0, 7); }
  function normName(s) { return str(s).toLowerCase().replace(/\s+/g, ' '); }
  function normPhone(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.indexOf('60') === 0 && d.length >= 11) d = d.slice(1);   // +60 12-345 6789 -> 0123456789
    return d.length >= 9 && d.length <= 12 ? d : '';
  }
  function b64ok(s, max) { return typeof s === 'string' && s.length > 100 && s.length <= max && /^[A-Za-z0-9+/=]+$/.test(s); }
  function setting(store, key) { var r = store.load('settings').filter(function (x) { return x.key === key; })[0]; return r ? r.value : ''; }
  function log(store, by, action, detail) {
    var rows = store.load('log'); rows.push({at: nowIso(store), by: by, action: action, detail: str(detail, 300)});
    if (rows.length > 3000) rows = rows.slice(-3000);
    store.save('log', rows);
  }

  /* ---------- who is asking ---------- */
  function signIn(q, store, quiet) {
    var code = str(q.code, 100), name = str(q.name, 40).replace(/\s+/g, ' '), pin = str(q.pin, 12);
    var team = store.prop('TEAM_CODE'), leader = store.prop('LEADER_CODE');
    if (!team || team.length < 6) fail('server_not_set_up');
    if (!quiet && store.fails() >= 8) fail('too_many_tries');
    var role = leader && leader.length >= 10 && code === leader ? 'leader' : code === team ? 'agent' : '';
    if (!role) { store.fails(1); fail('wrong_code'); }
    if (name.length < 2) fail('name_needed');
    if (!/^\d{4,6}$/.test(pin)) fail('pin_4_digits');
    var agents = store.load('agents'), me = agents.filter(function (a) { return normName(a.name) === normName(name); })[0];
    var h = store.hash('rrt|' + pin + '|' + normName(name));
    if (me) {
      if (me.pin !== h) { store.fails(1); fail('wrong_pin'); }
      if (String(me.active) === 'false') fail('removed');
      if (role === 'leader' && me.role !== 'leader') { me.role = 'leader'; store.save('agents', agents); }
      return {me: me, role: role === 'leader' ? 'leader' : me.role};
    }
    if (!q.create) fail('new_name');            // app asks "Create a new member?" first
    me = {id: newId(store, 8), name: name, pin: h, role: role, created: nowIso(store), active: 'true'};
    agents.push(me); store.save('agents', agents);
    store.version(true);
    log(store, me.id, 'join', name);
    return {me: me, role: role, created: true};
  }

  /* Device sign-in, like WhatsApp: signing in once gives the phone a long random key. Only its hash is stored.
     The key keeps working even if the team code changes; it stops only when the member signs out on that phone
     or the leader removes the member. */
  function newSession(store, me, device) {
    var token = newId(store, 40), rows = store.load('sessions'), now = nowIso(store);
    rows.push({token: store.hash('sess|' + token), agentId: me.id, created: now, lastSeen: now, device: str(device, 60)});
    store.save('sessions', rows);
    return token;
  }
  function who(q, store) {
    if (q.token) {
      var h = store.hash('sess|' + str(q.token, 80)), rows = store.load('sessions'), s = rows.filter(function (x) { return x.token === h; })[0];
      if (!s) fail('signed_out');
      var me = store.load('agents').filter(function (a) { return a.id === s.agentId; })[0];
      if (!me || String(me.active) === 'false') fail('removed');
      var today = myt(nowIso(store)).slice(0, 10);
      if (String(s.lastSeen).slice(0, 10) !== today) { s.lastSeen = nowIso(store); store.save('sessions', rows); }   // at most one write a day
      return {me: me, leader: me.role === 'leader'};
    }
    // phones from before device keys: code + name + PIN (no shared lock-out counter here)
    var r = signIn({code: q.code, name: q.name, pin: q.pin}, store, true);
    return {me: r.me, leader: r.role === 'leader'};
  }
  function signOut(q, store, me) {
    if (!q.token) return {signedOut: true};
    var h = store.hash('sess|' + str(q.token, 80));
    store.save('sessions', store.load('sessions').filter(function (x) { return x.token !== h; }));
    return {signedOut: true};
  }

  /* ---------- AI reading of a referral page ---------- */
  var READ_PROMPT = [
    'You read a photo that an insurance agent took as proof of referrals. Usually it is a page of the REDEFINE / KJG',
    '"Prospect Referral List / 转介绍名单" booklet: "Your Name / 您的姓名" at the top (the client who GAVE the referrals),',
    'then numbered rows 1-5, each with Name/姓名, Age/年龄, Contact No./联络号码, Gender/性别 and a Remark/备注 column with',
    'L:, W:, R:, S:, Others:. It may also be a WhatsApp screenshot, a name card, a contact screen, or a meeting photo.',
    'Handwriting may be messy, in English, Chinese or Malay.',
    '',
    'Return ONLY a JSON object:',
    '{"kind":"referral_page|whatsapp|name_card|contact|photo|other",',
    ' "giver":"name written at Your Name, or empty",',
    ' "rows":[{"no":1,"name":"","age":"","phone":"","gender":"","remarks":"L: .. W: .. R: .. S: .. Others: ..","unclear":false}],',
    ' "private":[{"type":"giver|phone|age|remarks|ic|address|email|bank|other","x":0.1,"y":0.2,"w":0.3,"h":0.04}],',
    ' "faces":[{"x":0,"y":0,"w":0,"h":0}],',
    ' "notes":"short note about anything unreadable"}',
    '',
    'Rules:',
    '1. One row per referred PERSON whose name is written. Skip empty rows. Never invent a name, number or age.',
    '   Copy what is written; if a character is unreadable put "?" there and set "unclear":true.',
    '2. Do NOT list the giver ("Your Name") as a referral. Do not list the agent.',
    '3. "private" = a box around EVERY piece of private data visible in the photo: each contact number, each age,',
    '   each filled remark cell (L/W/R/S/Others), IC / passport numbers, addresses, emails, bank numbers, policy numbers.',
    '   ALSO box the handwritten "Your Name / 您的姓名" value (type "giver"): the existing client stays private.',
    '   Do NOT box the referred people\'s names. Boxes are fractions of the image width/height (0..1), x,y = top-left corner.',
    '   Make each box generous: cover the whole handwritten value, not just part of it.',
    '4. "faces" = a box around every human face, including faces in photos on screens.',
    '5. If the photo is not a referral page and has no referred names, return "rows":[] and explain in notes.'
  ].join('\n');

  function clamp01(v) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
  function cleanBox(b) {
    if (!b || typeof b !== 'object') return null;
    var x = clamp01(b.x), y = clamp01(b.y), w = clamp01(b.w), h = clamp01(b.h);
    if (w <= 0.003 || h <= 0.003) return null;
    return {type: str(b.type, 12) || 'other', x: x, y: y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y)};
  }
  function parseRead(text) {
    var j; try { j = JSON.parse(String(text).replace(/^```(?:json)?|```$/g, '').trim()); } catch (e) { fail('ai_bad_reply'); }
    var rows = (Array.isArray(j.rows) ? j.rows : []).slice(0, MAX_ROWS).map(function (r) {
      return {name: str(r.name, 60), age: str(r.age, 10), phone: str(r.phone, 30), gender: str(r.gender, 10),
        remarks: str(r.remarks, 300), unclear: r.unclear === true || /\?/.test(String(r.name || ''))};
    }).filter(function (r) { return r.name; });
    return {
      kind: str(j.kind, 20) || 'other', giver: str(j.giver, 60), rows: rows,
      private: (Array.isArray(j.private) ? j.private : []).map(cleanBox).filter(Boolean).slice(0, 80),
      faces: (Array.isArray(j.faces) ? j.faces : []).map(cleanBox).filter(Boolean).slice(0, 30),
      notes: str(j.notes, 400)
    };
  }
  function countRead(store, me) {
    var limit = +(store.prop('DAILY_READS') || 40), day = myt(nowIso(store)).slice(0, 10);
    var key = 'reads_' + day + '_' + me.id, n = +(setting(store, key) || 0);
    if (n >= limit) fail('daily_limit');
    var settings = store.load('settings').filter(function (s) { return !/^reads_/.test(s.key) || s.key.indexOf('reads_' + day) === 0; });
    settings = settings.filter(function (s) { return s.key !== key; }); settings.push({key: key, value: String(n + 1)});
    store.save('settings', settings);
  }

  /* ---------- encouragement ---------- */
  var CHEERS = {
    first: ['Your very first referral page is in! 第一步最难，你已经做到了。', 'First one on the board. This is how every top agent started.'],
    big: ['{n} names from one page, that is trust earned. 客户愿意介绍，是对你最大的肯定。', '{n} referrals in one go! Your client believes in you.'],
    one: ['Every name is a family you can protect. Keep asking, 坚持就是力量。', 'One more door opened. No magic, just basic.'],
    streak: ['{d} days in a row with referrals. Hardwork on purpose!', 'Referral streak: {d} days. Consistency beats talent.'],
    top: ['You are #1 on the board this month. Lead the way!', 'Top of the team this month. 继续发光!']
  };
  function pick(store, list, vars) {
    var s = list[Math.floor(store.random() * list.length)];
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; });
  }
  function monthCounts(refs, mk) {
    var c = {}; refs.forEach(function (r) { if (r.status !== 'rejected' && monthKey(r.created) === mk) c[r.agentId] = (c[r.agentId] || 0) + 1; });
    return c;
  }
  function streakDays(posts, agentId, store) {
    var days = {}; posts.forEach(function (p) { if (p.agentId === agentId && p.kind === 'referral' && p.status !== 'rejected') days[myt(p.created).slice(0, 10)] = 1; });
    var d = 0, t = store.now().getTime();
    while (days[myt(new Date(t - d * 864e5).toISOString()).slice(0, 10)]) d++;
    return d;
  }

  /* ---------- posting a referral page ---------- */
  function post(q, store, me) {
    if (!b64ok(q.photo, MAX_PHOTO_B64)) fail('bad_photo');
    if (q.covered !== true) fail('privacy_not_confirmed');
    var rows = (Array.isArray(q.rows) ? q.rows : []).slice(0, MAX_ROWS).map(function (r) {
      return {name: str(r.name, 60), age: str(r.age, 10), phone: str(r.phone, 30), gender: str(r.gender, 10), remarks: str(r.remarks, 300)};
    }).filter(function (r) { return r.name.length >= 2; });
    if (!rows.length) fail('no_names');
    var now = nowIso(store), posts = store.load('posts'), refs = store.load('refs');
    var mk = monthKey(now), before = monthCounts(refs, mk), firstEver = !refs.some(function (r) { return r.agentId === me.id; });
    var p = {id: newId(store, 10), agentId: me.id, kind: 'referral', giver: str(q.giver, 60), text: str(q.text, 300),
      photoId: store.putPhoto('ref_' + now.slice(0, 10) + '_' + me.id + '.jpg', q.photo), count: rows.length, status: 'pending', created: now, purged: ''};
    var live = refs.filter(function (r) { return !r.purged; });
    var added = rows.map(function (r) {
      var ph = normPhone(r.phone), dup = '';
      if (ph) live.some(function (o) { if (normPhone(o.phone) === ph) { dup = 'Same number as ' + o.name; return true; } });
      if (!dup) refs.some(function (o) { if (normName(o.name) === normName(r.name) && o.status !== 'rejected') { dup = 'Same name already on board'; return true; } });
      return {id: newId(store, 10), postId: p.id, agentId: me.id, name: r.name, age: r.age, phone: r.phone, gender: r.gender,
        remarks: r.remarks, status: 'pending', dup: dup, created: now, purged: ''};
    });
    // second pass: duplicates inside this same page
    added.forEach(function (r, i) { added.slice(0, i).some(function (o) { if (!r.dup && ((normPhone(r.phone) && normPhone(r.phone) === normPhone(o.phone)) || normName(r.name) === normName(o.name))) { r.dup = 'Repeated on this page'; return true; } }); });
    refs = refs.concat(added);
    posts.push(p);

    // encouragement for the agent + team milestone cards
    var after = monthCounts(refs, mk), mine = after[me.id] || 0, prev = before[me.id] || 0, cheer = [];
    if (firstEver) cheer.push(pick(store, CHEERS.first, {}));
    else if (rows.length >= 3) cheer.push(pick(store, CHEERS.big, {n: rows.length}));
    else cheer.push(pick(store, CHEERS.one, {}));
    var st = streakDays(posts, me.id, store); if (st >= 3) cheer.push(pick(store, CHEERS.streak, {d: st}));
    var top = Object.keys(after).sort(function (a, b) { return after[b] - after[a]; })[0];
    var wasTop = Object.keys(before).sort(function (a, b) { return before[b] - before[a]; })[0];
    if (top === me.id && wasTop !== me.id && mine >= 3) cheer.push(pick(store, CHEERS.top, {}));
    var hit = MILESTONES.filter(function (m) { return prev < m && mine >= m && m > 1; }).pop();
    if (hit) posts.push({id: newId(store, 10), agentId: me.id, kind: 'milestone', giver: '', text: me.name + ' reached ' + hit + ' referrals this month! 🎉', photoId: '', count: hit, status: '', created: new Date(store.now().getTime() + 1).toISOString(), purged: ''});
    if (top === me.id && wasTop && wasTop !== me.id && mine >= 3) posts.push({id: newId(store, 10), agentId: me.id, kind: 'milestone', giver: '', text: me.name + ' is now #1 on the referral board this month! 👑', photoId: '', count: mine, status: '', created: new Date(store.now().getTime() + 2).toISOString(), purged: ''});

    store.save('refs', refs); store.save('posts', posts);
    store.version(true);
    log(store, me.id, 'post', p.id + ' ' + rows.length + ' names');
    return {post: p, cheer: cheer, monthTotal: mine, milestone: hit || 0};
  }

  /* ---------- reading everything the app shows ---------- */
  function publicRef(r, mine) {
    var o = {id: r.id, postId: r.postId, agentId: r.agentId, name: r.name, status: r.status, dup: '', created: r.created, purged: r.purged ? 1 : 0,
      appt: r.appt || '', apptAt: r.apptAt || '', close: r.close || '', closeAt: r.closeAt || '', calledAt: r.calledAt || ''};
    if (mine) o.dup = r.dup;
    if (mine && !r.purged) { o.age = r.age; o.phone = r.phone; o.gender = r.gender; o.remarks = r.remarks; }
    return o;
  }
  function sync(q, store, me, leader) {
    var v = store.version(false);
    if (q.ver && +q.ver === v) return {same: true, ver: v};
    var cut = store.now().getTime() - SHOW_DAYS * 864e5;
    var recent = function (x) { return new Date(x.created).getTime() >= cut; };
    return {
      ver: v, now: nowIso(store), keepDays: KEEP_DAYS,
      me: {id: me.id, name: me.name, leader: leader, devices: store.load('devices').filter(function (d) { return d.agentId === me.id; }).length},
      callDays: CALL_DAYS, callRemindDays: CALL_REMIND_DAYS,
      agents: store.load('agents').filter(function (a) { return String(a.active) !== 'false'; }).map(function (a) { return {id: a.id, name: a.name, role: a.role}; }),
      posts: store.load('posts').filter(recent).map(function (p) { return {id: p.id, agentId: p.agentId, kind: p.kind, giver: p.purged || !(leader || p.agentId === me.id) ? '' : p.giver, text: p.text, photo: p.photoId && !p.purged ? 1 : 0, count: +p.count || 0, status: p.status, created: p.created, purged: p.purged ? 1 : 0}; }),
      refs: store.load('refs').map(function (r) { return publicRef(r, leader || r.agentId === me.id); }),
      comments: store.load('comments').filter(recent),
      rates: rates(store),
      paid: paidList(store, me, leader)
    };
  }

  function photo(q, store) {
    var p = store.load('posts').filter(function (x) { return x.id === q.postId; })[0];
    if (!p || !p.photoId || p.purged) fail('photo_gone');
    return {image: store.getPhoto(p.photoId)};
  }

  function comment(q, store, me) {
    var text = str(q.text, 1000), target = str(q.postId, 20);
    if (!text) fail('empty');
    if (target !== 'team' && target !== 'board' && !store.load('posts').some(function (p) { return p.id === target; })) fail('not_found');
    var c = store.load('comments'), row = {id: newId(store, 10), postId: target, agentId: me.id, text: text, created: nowIso(store)};
    c.push(row); store.save('comments', c); store.version(true);
    return {comment: row};
  }

  /* leader: approve / reject a whole page or single names */
  function review(q, store, me, leader) {
    if (!leader) fail('leader_only');
    if (q.confirm !== true) fail('confirm_needed');
    var decisions = q.decisions || {}, posts = store.load('posts'), refs = store.load('refs');
    var p = posts.filter(function (x) { return x.id === q.postId && x.kind === 'referral'; })[0];
    if (!p) fail('not_found');
    var mine = refs.filter(function (r) { return r.postId === p.id; });
    mine.forEach(function (r) { var d = decisions[r.id]; if (d === 'approved' || d === 'rejected' || d === 'pending') r.status = d; });
    var s = mine.map(function (r) { return r.status; });
    p.status = s.every(function (x) { return x === 'approved'; }) ? 'approved' : s.every(function (x) { return x === 'rejected'; }) ? 'rejected'
      : s.some(function (x) { return x === 'pending'; }) ? 'pending' : 'partial';
    p.count = mine.filter(function (r) { return r.status !== 'rejected'; }).length;
    store.save('refs', refs); store.save('posts', posts); store.version(true);
    log(store, me.id, 'review', p.id + ' ' + p.status);
    var ok = mine.filter(function (r) { return r.status === 'approved'; }).length, R = rates(store);
    if (ok && p.agentId !== me.id) store.push([p.agentId], {title: '💰 ' + ok + ' referral' + (ok === 1 ? '' : 's') + ' approved', body: 'RM' + (ok * R.lead) + ' bonus once you call each one within ' + CALL_DAYS + ' days. 📞 Call them now!', url: '#/leads', tag: 'approved-' + p.id});
    return {status: p.status};
  }

  function removePost(q, store, me, leader) {
    if (q.confirm !== true) fail('confirm_needed');
    var posts = store.load('posts'), p = posts.filter(function (x) { return x.id === q.postId; })[0];
    if (!p) fail('not_found');
    if (p.agentId !== me.id && !leader) fail('not_yours');
    if ((p.status === 'approved' || p.status === 'partial') && !leader) fail('approved_ask_leader');   // bonus already counted
    if (p.photoId && !p.purged) { try { store.trashPhoto(p.photoId); } catch (e) {} }
    store.save('posts', posts.filter(function (x) { return x.id !== p.id; }));
    store.save('refs', store.load('refs').filter(function (r) { return r.postId !== p.id; }));
    store.save('comments', store.load('comments').filter(function (c) { return c.postId !== p.id; }));
    store.version(true);
    log(store, me.id, 'remove', p.id);
    return {removed: true};
  }

  /* bonus rates (RM). Defaults = the leader's own monthly sheet: lead RM1, appointment RM5, close RM20 */
  var RATE_KEYS = {lead: 'rateLead', appt: 'rateAppt', close: 'rateClose'}, RATE_DEFAULT = {lead: 1, appt: 5, close: 20};
  function rates(store) {
    var o = {}; Object.keys(RATE_KEYS).forEach(function (k) { var v = setting(store, RATE_KEYS[k]); o[k] = v === '' ? RATE_DEFAULT[k] : +v; }); return o;
  }
  function saveSettings(q, store, me, leader) {
    if (!leader) fail('leader_only');
    if (q.confirm !== true) fail('confirm_needed');
    var s = store.load('settings'), r = q.rates || {};
    Object.keys(RATE_KEYS).forEach(function (k) { var v = str(r[k], 10); if (v !== '' && !(+v >= 0 && +v <= 10000)) fail('bad_rate'); });
    Object.keys(RATE_KEYS).forEach(function (k) {
      var v = str(r[k], 10); if (v === '') return;
      s = s.filter(function (x) { return x.key !== RATE_KEYS[k]; }); s.push({key: RATE_KEYS[k], value: String(+v)});
    });
    store.save('settings', s); store.version(true);
    log(store, me.id, 'rates', JSON.stringify(rates(store)));
    return {rates: rates(store)};
  }

  /* ---------- steps after the lead: appointment and closed case ---------- */
  function step(q, store, me, leader) {
    var refs = store.load('refs'), r = refs.filter(function (x) { return x.id === q.refId; })[0], kind = q.step, on = q.done !== false;
    if (!r) fail('not_found');
    if (kind !== 'appt' && kind !== 'close' && kind !== 'call') fail('bad_request');
    if (r.agentId !== me.id && !leader) fail('not_yours');
    if (r.status === 'rejected') fail('lead_not_counted');
    if (kind === 'call') {   // the agent's own record, no approval needed; it decides whether the lead bonus is kept
      if (on) { if (r.calledAt) fail('already_marked'); r.called = 'yes'; r.calledAt = nowIso(store); }
      else { if (r.appt === 'pending' || r.appt === 'approved') fail('undo_appt_first'); r.called = ''; r.calledAt = ''; }
      store.save('refs', refs); store.version(true); log(store, me.id, 'step', r.id + ' call ' + (on ? 'done' : 'undo'));
      return {ref: publicRef(r, true)};
    }
    var at = kind + 'At';
    if (on) {
      if (r[kind] && r[kind] !== 'rejected') fail('already_marked');
      if (kind === 'close' && !(r.appt === 'pending' || r.appt === 'approved')) fail('appointment_first');
      r[kind] = leader ? 'approved' : 'pending'; r[at] = nowIso(store);
      if (kind === 'appt' && !r.calledAt) { r.called = 'yes'; r.calledAt = r[at]; }   // met them = called them
    } else {
      if (r[kind] === 'approved' && !leader) fail('approved_ask_leader');
      if (kind === 'appt' && (r.close === 'pending' || r.close === 'approved')) fail('undo_close_first');
      r[kind] = ''; r[at] = '';
    }
    store.save('refs', refs); store.version(true);
    log(store, me.id, 'step', r.id + ' ' + kind + ' ' + (on ? 'done' : 'undo'));
    if (on && leader) celebrate(store, r, kind);
    return {ref: publicRef(r, true)};
  }
  function celebrate(store, r, kind) {
    var posts = store.load('posts'), a = store.load('agents').filter(function (x) { return x.id === r.agentId; })[0];
    if (!a) return;
    posts.push({id: newId(store, 10), agentId: r.agentId, kind: 'milestone', giver: '',
      text: kind === 'close' ? a.name + ' closed a case from a referral! 🎯' : a.name + ' met a referral lead for an appointment ☕',
      photoId: '', count: 0, status: '', created: nowIso(store), purged: ''});
    store.save('posts', posts);
  }
  /* leader approves appointment / close updates: decisions = {refId: {appt: 'approved'|'rejected', close: ...}} */
  function stepReview(q, store, me, leader) {
    if (!leader) fail('leader_only');
    if (q.confirm !== true) fail('confirm_needed');
    var d = q.decisions || {}, refs = store.load('refs'), done = [], n = 0;
    refs.forEach(function (r) {
      var x = d[r.id]; if (!x) return;
      ['appt', 'close'].forEach(function (k) {
        if (r[k] !== 'pending' || (x[k] !== 'approved' && x[k] !== 'rejected')) return;
        r[k] = x[k]; n++; if (x[k] === 'approved') done.push([r, k]);
      });
    });
    store.save('refs', refs);
    done.forEach(function (p) { celebrate(store, p[0], p[1]); });
    var R = rates(store), per = {};
    done.forEach(function (p) { var r = p[0], k = p[1]; if (r.agentId === me.id) return; (per[r.agentId] = per[r.agentId] || []).push(k === 'close' ? ['🎯 Close', R.close, r.name] : ['☕ Appointment', R.appt, r.name]); });
    Object.keys(per).forEach(function (id) {
      var l = per[id], sum = l.reduce(function (s, x) { return s + x[1]; }, 0);
      store.push([id], {title: '💰 +RM' + sum + ' approved', body: l.map(function (x) { return x[0] + ' · ' + x[2]; }).join(', '), url: '#/bonus', tag: 'step-' + id});
    });
    store.version(true); log(store, me.id, 'step_review', n + ' updates');
    return {saved: n};
  }

  /* "I asked a client but got no names" still counts as an approach (unpaid, shows effort) */
  function approach(q, store, me) {
    if (q.confirm !== true) fail('confirm_needed');
    var posts = store.load('posts');
    posts.push({id: newId(store, 10), agentId: me.id, kind: 'approach', giver: '', text: str(q.note, 200), photoId: '', count: 0, status: 'approved', created: nowIso(store), purged: ''});
    store.save('posts', posts); store.version(true);
    return {logged: true};
  }

  /* ---------- monthly bonus statement (same columns as the leader's sheet) ----------
     Approach = referral pages posted + "asked, no names"   (counted, not paid)
     Leads    = approved referral names posted that month AND called within 14 days   x lead rate
     Appt     = approved appointments dated that month       x appt rate
     Close    = approved closed cases dated that month       x close rate */
  function inMonth(iso, month) { return !!iso && monthKey(iso) === month; }
  /* call state of a lead: 'ok' (called in time), 'late' (called after 14 days), 'due' (not called, still in time), 'forfeit' (not called, over 14 days) */
  function callState(f, nowMs) {
    var deadline = new Date(f.created).getTime() + CALL_DAYS * 864e5;
    if (f.calledAt) return new Date(f.calledAt).getTime() <= deadline ? 'ok' : 'late';
    return (nowMs || Date.now()) <= deadline ? 'due' : 'forfeit';
  }
  function bonusTable(agents, posts, refs, month, r, nowIso) {
    var nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
    var rows = agents.map(function (a) { return {id: a.id, name: a.name, approach: 0, leads: 0, leadsWaiting: 0, leadsToCall: 0, leadsForfeit: 0, appt: 0, apptWaiting: 0, close: 0, closeWaiting: 0, total: 0}; });
    var by = {}; rows.forEach(function (x) { by[x.id] = x; });
    posts.forEach(function (p) { var x = by[p.agentId]; if (x && (p.kind === 'approach' || (p.kind === 'referral' && p.status !== 'rejected')) && inMonth(p.created, month)) x.approach++; });
    refs.forEach(function (f) {
      var x = by[f.agentId]; if (!x || f.status === 'rejected') return;
      if (inMonth(f.created, month)) {
        var cs = callState(f, nowMs);
        if (cs === 'forfeit' || cs === 'late') x.leadsForfeit++;                // no call within 14 days: lead bonus forfeited
        else if (f.status !== 'approved') x.leadsWaiting++;                     // waiting leader approval
        else if (cs === 'due') x.leadsToCall++;                                  // approved, waiting for the call
        else x.leads++;                                                          // approved + called in time = paid
      }
      if (inMonth(f.apptAt, month)) { if (f.appt === 'approved') x.appt++; else if (f.appt === 'pending') x.apptWaiting++; }
      if (inMonth(f.closeAt, month)) { if (f.close === 'approved') x.close++; else if (f.close === 'pending') x.closeWaiting++; }
    });
    rows.forEach(function (x) { x.total = x.leads * r.lead + x.appt * r.appt + x.close * r.close; });
    return rows;
  }
  function markPaid(q, store, me, leader) {
    if (!leader) fail('leader_only');
    if (q.confirm !== true) fail('confirm_needed');
    var month = str(q.month, 7); if (!/^\d{4}-\d{2}$/.test(month)) fail('bad_request');
    var key = 'paid_' + month, s = store.load('settings').filter(function (x) { return x.key !== key; });
    if (q.undo !== true) {
      var rows = bonusTable(store.load('agents'), store.load('posts'), store.load('refs'), month, rates(store)), per = {}, total = 0;
      rows.forEach(function (x) { if (x.total) { per[x.id] = x.total; total += x.total; } });
      s.push({key: key, value: JSON.stringify({at: nowIso(store), by: me.name, total: total, per: per})});
    }
    store.save('settings', s); store.version(true); log(store, me.id, q.undo === true ? 'unpaid' : 'paid', month);
    return {month: month};
  }
  function paidList(store, me, leader) {
    var out = {};
    store.load('settings').forEach(function (x) {
      if (x.key.indexOf('paid_') !== 0) return;
      try { var v = JSON.parse(x.value); out[x.key.slice(5)] = leader ? v : {at: v.at, mine: v.per[me.id] || 0}; } catch (e) {}
    });
    return out;
  }

  function removeAgent(q, store, me, leader) {
    if (!leader) fail('leader_only');
    if (q.confirm !== true) fail('confirm_needed');
    var agents = store.load('agents'), a = agents.filter(function (x) { return x.id === q.agentId; })[0];
    if (!a) fail('not_found'); if (a.id === me.id) fail('cannot_remove_self');
    a.active = 'false'; store.save('agents', agents); store.version(true);
    store.save('sessions', store.load('sessions').filter(function (x) { return x.agentId !== a.id; }));
    store.save('devices', store.load('devices').filter(function (x) { return x.agentId !== a.id; }));   // signs them out on every phone
    log(store, me.id, 'remove_agent', a.name);
    return {ok: true};
  }

  /* ---------- phone pop-ups (Firebase), same setup as REDEFINE Calendar ---------- */
  function pushReg(q, store, me) {
    var t = str(q.pushToken, 400); if (t.length < 20) fail('bad_request');
    var rows = store.load('devices').filter(function (d) { return d.token !== t; });
    rows.push({token: t, agentId: me.id, created: nowIso(store)}); store.save('devices', rows);
    return {registered: true};
  }
  function pushOff(q, store, me) {
    var t = str(q.pushToken, 400);
    store.save('devices', store.load('devices').filter(function (d) { return !(d.agentId === me.id && (!t || d.token === t)); }));
    return {off: true};
  }
  function pushTest(q, store, me) { store.push([me.id], {title: 'REDEFINE Referrals 🔔', body: 'Pop-ups are working on this phone.', tag: 'test', url: '#/me'}); return {sent: true}; }

  /* Every morning: each agent with names not yet called for 7+ days gets one lock-screen reminder.
     After 14 days without a call the lead bonus is forfeited. Returns how many agents were reminded. */
  function callReminders(store) {
    var nowMs = store.now().getTime(), by = {};
    store.load('refs').forEach(function (f) {
      if (f.status === 'rejected' || f.calledAt || f.purged) return;
      var age = (nowMs - new Date(f.created).getTime()) / 864e5;
      if (age < CALL_REMIND_DAYS || age > CALL_DAYS) return;
      (by[f.agentId] = by[f.agentId] || []).push({name: f.name, left: Math.max(0, Math.ceil(CALL_DAYS - age))});
    });
    var active = {}; store.load('agents').forEach(function (a) { if (String(a.active) !== 'false') active[a.id] = 1; });
    var n = 0;
    Object.keys(by).forEach(function (id) {
      if (!active[id]) return;
      var l = by[id].sort(function (a, b) { return a.left - b.left; }), soon = l[0].left;
      var names = l.slice(0, 3).map(function (x) { return x.name; }).join(', ') + (l.length > 3 ? ' +' + (l.length - 3) + ' more' : '');
      store.push([id], {title: '📞 Call ' + l.length + ' referral' + (l.length === 1 ? '' : 's') + ' · ' + (soon <= 1 ? 'last day!' : soon + ' days left'),
        body: names + '. No call within ' + CALL_DAYS + ' days = lead bonus forfeited. Tap ✓ Called after you call.', url: '#/leads', tag: 'call-reminder'});
      n++;
    });
    return {reminded: n};
  }

  /* ---------- 3-month auto-delete (daily trigger) ---------- */
  function purge(store) {
    var refs = store.load('refs'), posts = store.load('posts'), now = nowIso(store), n = 0, ph = 0;
    refs.forEach(function (r) {
      if (!r.purged && daysAgo(store, r.created) >= KEEP_DAYS) { r.age = ''; r.phone = ''; r.gender = ''; r.remarks = ''; r.purged = now; n++; }
    });
    posts.forEach(function (p) {
      if (p.kind === 'referral' && !p.purged && daysAgo(store, p.created) >= KEEP_DAYS) {
        if (p.photoId) { try { store.trashPhoto(p.photoId); } catch (e) {} ph++; }
        p.photoId = ''; p.giver = ''; p.purged = now;
      }
    });
    if (n || ph) { store.save('refs', refs); store.save('posts', posts); store.version(true); log(store, 'system', 'purge', n + ' names wiped, ' + ph + ' photos deleted'); }
    return {wiped: n, photos: ph};
  }

  var OPS = {pushreg: pushReg, pushoff: pushOff, pushtest: pushTest, signout: signOut, upgrade: function (q, store, me) { return {token: newSession(store, me, q.device)}; }, step: step, stepReview: stepReview, approach: approach, markPaid: markPaid, post: post, sync: sync, photo: photo, comment: comment, review: review, removePost: removePost, settings: saveSettings, removeAgent: removeAgent};

  function handle(q, store) {
    if (!q || typeof q !== 'object') fail('bad_request');
    if (q.op === 'signin') {
      return store.withLock(function () { var r = signIn(q, store); return {ok: true, me: {id: r.me.id, name: r.me.name, leader: r.role === 'leader'}, created: !!r.created, token: newSession(store, r.me, q.device)}; });
    }
    if (q.op === 'pushtest' && q.delay) {   // "test in 15 s": wait OUTSIDE the lock so nobody else is blocked
      var w1 = store.withLock(function () { return who(q, store).me; });
      if (store.sleep) store.sleep(Math.max(1, Math.min(20, +q.delay || 15)) * 1000);
      store.push([w1.id], {title: 'REDEFINE Referrals 🔔', body: 'Pop-ups work even when the phone is locked. 👍', tag: 'test', url: '#/me'});
      return {ok: true, sent: true};
    }
    if (q.op === 'read') {   // count the reading under the lock, but call the AI outside it (it can take 20 s)
      if (!b64ok(q.image, MAX_READ_B64)) fail('bad_photo');
      store.withLock(function () { countRead(store, who(q, store).me); });
      return {ok: true, read: parseRead(store.ai(READ_PROMPT, q.image))};   // the photo is used for this reading only and is not kept
    }
    var fn = OPS[q.op]; if (!fn) fail('bad_request');
    return store.withLock(function () { var w = who(q, store); var r = fn(q, store, w.me, w.leader); r.ok = true; return r; });
  }

  return {callReminders: callReminders, callState: callState, CALL_DAYS: CALL_DAYS, bonusTable: bonusTable, RATE_DEFAULT: RATE_DEFAULT, TABLES: TABLES, KEEP_DAYS: KEEP_DAYS, handle: handle, purge: purge, parseRead: parseRead, normPhone: normPhone, monthKey: monthKey, myt: myt, READ_PROMPT: READ_PROMPT};
})();
if (typeof module !== 'undefined') module.exports = CORE;
