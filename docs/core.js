/* REDEFINE Referrals Tracker - server rules.
   Shared by the Google server (server/Code.gs, built by build.js), the local test server and test.js.
   handle(q, store) checks who is asking, validates every input, and reads/writes through `store`.
   A store provides: load(table), save(table, rows), withLock(fn), prop(key), fails(add, key) (wrong-try counter per key, 15 min), now(), random(),
   hash(text) -> hex, putPhoto(name, base64) -> id, getPhoto(id) -> base64, trashPhoto(id),
   ai(prompt, imageBase64) -> text, version(bump) -> number. */
var CORE = (function () {
  var TABLES = {
    agents: ['id', 'name', 'pin', 'role', 'created', 'active'],
    posts: ['id', 'agentId', 'kind', 'giver', 'text', 'photoId', 'count', 'status', 'created', 'purged', 'source', 'location', 'selfieId', 'reviewedAt', 'photoRemoved'],
    refs: ['id', 'postId', 'agentId', 'name', 'age', 'phone', 'gender', 'remarks', 'status', 'dup', 'created', 'purged', 'appt', 'apptAt', 'close', 'closeAt', 'called', 'calledAt', 'source', 'planAt', 'stepAt', 'noAppt', 'apptMark'],
    comments: ['id', 'postId', 'agentId', 'text', 'created'],
    settings: ['key', 'value'],
    log: ['at', 'by', 'action', 'detail'],
    sessions: ['token', 'agentId', 'created', 'lastSeen', 'device'],
    devices: ['token', 'agentId', 'created'],
    links: ['codeHash', 'agentId', 'app', 'created', 'lastPull']
  };
  var CALL_DAYS = 14;                   // a lead must be called within 14 days of posting, or its lead bonus is forfeited
  var CALL_REMIND_DAYS = 7;             // from day 7 the agent gets a daily lock-screen reminder to call
  var PHOTO_DAYS = 30;                   // photos (name list + selfie) are deleted 30 days after the leader's review, to save space
  var KEEP_DAYS = 90;                    // client details are wiped after this; the name stays
  var SHOW_DAYS = 400;                   // how far back the app loads posts and comments
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
    // wrong tries are counted PER NAME (one person's typos never lock out the rest of the team) + a high team-wide limit against guessing
    var fk = 'n:' + normName(name).slice(0, 40);
    if (!quiet && (store.fails(0, fk) >= 8 || store.fails(0, 'all') >= 60)) fail('too_many_tries');
    var role = leader && leader.length >= 10 && code === leader ? 'leader' : code === team ? 'agent' : '';
    if (!role) { store.fails(1, fk); store.fails(1, 'all'); fail('wrong_code'); }
    if (name.length < 2) fail('name_needed');
    if (!/^\d{4,6}$/.test(pin)) fail('pin_4_digits');
    var agents = store.load('agents'), me = agents.filter(function (a) { return normName(a.name) === normName(name); })[0];
    var h = store.hash('rrt|' + pin + '|' + normName(name));
    if (me) {
      if (me.pin !== h) { store.fails(1, fk); store.fails(1, 'all'); fail('wrong_pin'); }
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
    'L:, W:, R:, S:, Others:. It may also be a ROADSHOW name list (a sign-up sheet, survey / lucky-draw forms, a booth\n' +
    'register with one person per row or per form), a WhatsApp screenshot, a name card, a contact screen, or a meeting photo.',
    'Handwriting may be messy, in English, Chinese or Malay.',
    '',
    'Return ONLY a JSON object:',
    '{"kind":"referral_page|roadshow_list|whatsapp|name_card|contact|photo|other",',
    ' "giver":"name written at Your Name, or empty",',
    ' "rows":[{"no":1,"name":"","age":"","phone":"","gender":"","remarks":"L: .. W: .. R: .. S: .. Others: ..","unclear":false}],',
    ' "private":[{"type":"giver|phone|age|remarks|ic|address|email|bank|other","x":0.1,"y":0.2,"w":0.3,"h":0.04}],',
    ' "faces":[{"x":0,"y":0,"w":0,"h":0}],',
    ' "notes":"short note about anything unreadable"}',
    '',
    'Rules:',
    '1. One row per referred / signed-up PERSON whose name is written. Skip empty rows. Never invent a name, number or age.',
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
    top: ['You are #1 on the board this month. Lead the way!', 'Top of the team this month. 继续发光!'],
    roadshow: ['{n} names from the roadshow at {loc}! Standing there all day paid off. 💪', '{n} new contacts from {loc}. Call them while they still remember your booth! 📞']
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

  /* a post can hold several photos (pages of the same referral record): photoId keeps them comma-separated */
  var MAX_PHOTOS = 6;
  function photoIdsOf(p) { return String(p && p.photoId || '').split(',').filter(Boolean); }
  function trashPhotos(store, p) { var n = 0; photoIdsOf(p).forEach(function (id) { try { store.trashPhoto(id); } catch (e) {} n++; }); return n; }

  /* ---------- posting a referral page ---------- */
  function post(q, store, me) {
    var source = q.source === 'roadshow' ? 'roadshow' : 'referral', location = str(q.location, 80);
    var photos = (Array.isArray(q.photos) && q.photos.length ? q.photos : [q.photo]).slice(0, MAX_PHOTOS);
    if (!photos.every(function (b) { return b64ok(b, MAX_PHOTO_B64); })) fail('bad_photo');
    if (source === 'roadshow') {   // roadshow names need the place and a selfie there as proof
      if (location.length < 3) fail('location_needed');
      if (q.selfie && !b64ok(q.selfie, MAX_PHOTO_B64)) fail('bad_photo');   // the booth selfie can also be added later (addSelfie)
    }
    if (q.covered !== true) fail('privacy_not_confirmed');
    var rows = (Array.isArray(q.rows) ? q.rows : []).slice(0, MAX_ROWS).map(function (r) {
      return {name: str(r.name, 60), age: str(r.age, 10), phone: str(r.phone, 30), gender: str(r.gender, 10), remarks: str(r.remarks, 300)};
    }).filter(function (r) { return r.name.length >= 2; });
    if (!rows.length) fail('no_names');
    var now = nowIso(store), posts = store.load('posts'), refs = store.load('refs');
    var mk = monthKey(now), before = monthCounts(refs, mk), firstEver = !refs.some(function (r) { return r.agentId === me.id; });
    var p = {id: newId(store, 10), agentId: me.id, kind: 'referral', giver: source === 'roadshow' ? '' : str(q.giver, 60), text: str(q.text, 300),
      photoId: photos.map(function (b, i) { return store.putPhoto((source === 'roadshow' ? 'roadshow_' : 'ref_') + now.slice(0, 10) + '_' + me.id + (photos.length > 1 ? '_' + (i + 1) : '') + '.jpg', b); }).join(','), count: rows.length, status: 'pending', created: now, purged: '',
      source: source, location: source === 'roadshow' ? location : '', selfieId: source === 'roadshow' && q.selfie ? store.putPhoto('selfie_' + now.slice(0, 10) + '_' + me.id + '.jpg', q.selfie) : ''};
    var live = refs.filter(function (r) { return !r.purged; });
    var added = rows.map(function (r) {
      var ph = normPhone(r.phone), dup = '';
      if (ph) live.some(function (o) { if (normPhone(o.phone) === ph) { dup = 'Same number as ' + o.name; return true; } });
      if (!dup) refs.some(function (o) { if (normName(o.name) === normName(r.name) && o.status !== 'rejected') { dup = 'Same name already on board'; return true; } });
      return {id: newId(store, 10), postId: p.id, agentId: me.id, name: r.name, age: r.age, phone: r.phone, gender: r.gender,
        remarks: r.remarks, status: 'pending', dup: dup, created: now, purged: '', source: source};
    });
    // second pass: duplicates inside this same page
    added.forEach(function (r, i) { added.slice(0, i).some(function (o) { if (!r.dup && ((normPhone(r.phone) && normPhone(r.phone) === normPhone(o.phone)) || normName(r.name) === normName(o.name))) { r.dup = 'Repeated on this page'; return true; } }); });
    refs = refs.concat(added);
    posts.push(p);

    // encouragement for the agent + team milestone cards
    var after = monthCounts(refs, mk), mine = after[me.id] || 0, prev = before[me.id] || 0, cheer = [];
    if (source === 'roadshow') cheer.push(pick(store, CHEERS.roadshow, {n: rows.length, loc: location}));
    else if (firstEver) cheer.push(pick(store, CHEERS.first, {}));
    else if (rows.length >= 3) cheer.push(pick(store, CHEERS.big, {n: rows.length}));
    else cheer.push(pick(store, CHEERS.one, {}));
    if (source === 'roadshow' && firstEver) cheer.push(pick(store, CHEERS.first, {}));
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
      appt: r.appt || '', apptAt: r.apptAt || '', close: r.close || '', closeAt: r.closeAt || '', calledAt: r.calledAt || '', source: r.source || 'referral', planAt: r.planAt || '', noAppt: r.noAppt ? 1 : 0};
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
      callDays: CALL_DAYS, callRemindDays: CALL_REMIND_DAYS, links: linksOf(store, me),
      agents: store.load('agents').filter(function (a) { return String(a.active) !== 'false'; }).map(function (a) { return {id: a.id, name: a.name, role: a.role}; }),
      posts: store.load('posts').filter(recent).map(function (p) { return {id: p.id, agentId: p.agentId, kind: p.kind, giver: p.purged || !(leader || p.agentId === me.id) ? '' : p.giver, text: p.text, source: p.source || 'referral', location: p.location || '', selfie: p.selfieId && !p.purged ? 1 : 0, photo: p.purged ? 0 : photoIdsOf(p).length, photoRemoved: p.photoRemoved || '', reviewedAt: p.reviewedAt || '', photoDays: PHOTO_DAYS, count: +p.count || 0, status: p.status, created: p.created, purged: p.purged ? 1 : 0}; }),
      refs: store.load('refs').map(function (r) { return publicRef(r, leader || r.agentId === me.id); }),
      comments: store.load('comments').filter(recent),
      rates: rates(store),
      paid: paidList(store, me, leader)
    };
  }

  function photo(q, store) {
    var p = store.load('posts').filter(function (x) { return x.id === q.postId; })[0];
    var id = q.which === 'selfie' ? p && p.selfieId : photoIdsOf(p)[Math.max(0, Math.min(MAX_PHOTOS - 1, +q.idx || 0))];
    if (!p || !id || p.purged) fail('photo_gone');
    return {image: store.getPhoto(id)};
  }

  function comment(q, store, me) {
    var text = str(q.text, 1000), target = str(q.postId, 20);
    if (!text) fail('empty');
    if (target === 'team') fail('chat_removed');   // team chat was removed; comments on posts and Board talk stay
    if (target !== 'board' && !store.load('posts').some(function (p) { return p.id === target; })) fail('not_found');
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
    if (p.source === 'roadshow' && !p.selfieId && !p.purged && mine.some(function (r) { return decisions[r.id] === 'approved'; })) fail('selfie_missing');   // proof first
    mine.forEach(function (r) { var d = decisions[r.id]; if (d === 'approved' || d === 'rejected' || d === 'pending') r.status = d; });
    var s = mine.map(function (r) { return r.status; });
    p.status = s.every(function (x) { return x === 'approved'; }) ? 'approved' : s.every(function (x) { return x === 'rejected'; }) ? 'rejected'
      : s.some(function (x) { return x === 'pending'; }) ? 'pending' : 'partial';
    p.count = mine.filter(function (r) { return r.status !== 'rejected'; }).length;
    p.reviewedAt = p.status === 'pending' ? '' : nowIso(store);   // the 30-day photo clock starts when nothing is left to review
    store.save('refs', refs); store.save('posts', posts); store.version(true);
    log(store, me.id, 'review', p.id + ' ' + p.status);
    var ok = mine.filter(function (r) { return r.status === 'approved'; }).length, R = rates(store);
    if (ok && p.agentId !== me.id) store.push([p.agentId], {title: '💰 ' + ok + (p.source === 'roadshow' ? ' roadshow name' : ' referral') + (ok === 1 ? '' : 's') + ' approved', body: 'RM' + (ok * R.lead) + ' bonus once you call each one within ' + CALL_DAYS + ' days. 📞 Call them now!', url: '#/leads', tag: 'approved-' + p.id});
    return {status: p.status};
  }

  /* roadshow booth selfie added after posting */
  function addSelfie(q, store, me, leader) {
    if (!b64ok(q.selfie, MAX_PHOTO_B64)) fail('bad_photo');
    var posts = store.load('posts'), p = posts.filter(function (x) { return x.id === q.postId; })[0];
    if (!p || p.source !== 'roadshow') fail('not_found');
    if (p.agentId !== me.id && !leader) fail('not_yours');
    if (p.purged || p.photoRemoved) fail('photo_gone');
    if (p.selfieId) { try { store.trashPhoto(p.selfieId); } catch (e) {} }
    p.selfieId = store.putPhoto('selfie_' + nowIso(store).slice(0, 10) + '_' + p.agentId + '.jpg', q.selfie);
    store.save('posts', posts); store.version(true); log(store, me.id, 'selfie', p.id);
    var ldr = store.load('agents').filter(function (a) { return a.role === 'leader' && String(a.active) !== 'false' && a.id !== me.id; }).map(function (a) { return a.id; });
    if (p.status === 'pending') store.push(ldr, {title: '🤳 Selfie added · ' + p.location, body: me.name + ' added the booth selfie. The roadshow list is ready for your approval.', url: '#/review/' + p.id, tag: 'selfie-' + p.id});
    return {selfie: 1};
  }

  function removePost(q, store, me, leader) {
    if (q.confirm !== true) fail('confirm_needed');
    var posts = store.load('posts'), p = posts.filter(function (x) { return x.id === q.postId; })[0];
    if (!p) fail('not_found');
    if (p.agentId !== me.id && !leader) fail('not_yours');
    if ((p.status === 'approved' || p.status === 'partial') && !leader) fail('approved_ask_leader');   // bonus already counted
    if (!p.purged) trashPhotos(store, p);
    if (p.selfieId && !p.purged) { try { store.trashPhoto(p.selfieId); } catch (e) {} }
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
    if (kind !== 'appt' && kind !== 'close' && kind !== 'call' && kind !== 'plan' && kind !== 'noappt') fail('bad_request');
    if (r.agentId !== me.id && !leader) fail('not_yours');
    if (r.status === 'rejected') fail('lead_not_counted');
    if (kind === 'noappt') {   // 🚫 called, but no appointment: still counts as called (lead bonus kept), just leaves the to-do list
      if (on) { if (r.appt === 'pending' || r.appt === 'approved') fail('undo_appt_first'); r.noAppt = 'yes'; r.planAt = ''; if (!r.calledAt) { r.called = 'yes'; r.calledAt = nowIso(store); } }
      else r.noAppt = '';
      r.stepAt = nowIso(store); store.save('refs', refs); store.version(true); log(store, me.id, 'step', r.id + ' noappt ' + (on ? 'yes' : 'undo'));
      return {ref: publicRef(r, true)};
    }
    if (kind === 'plan') {   // 📅 set appointment: date + time (Malaysia time) of the meeting with the lead
      if (on) {
        var when = str(q.when, 16); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) fail('bad_time');
        var ms = new Date(when + ':00+08:00').getTime(); if (!isFinite(ms)) fail('bad_time');
        r.planAt = new Date(ms).toISOString(); r.noAppt = '';
        if (!r.calledAt) { r.called = 'yes'; r.calledAt = nowIso(store); }   // setting an appointment means they were called
      } else { if (r.appt === 'pending' || r.appt === 'approved') fail('undo_appt_first'); r.planAt = ''; }
      r.stepAt = nowIso(store); store.save('refs', refs); store.version(true); log(store, me.id, 'step', r.id + ' plan ' + (on ? r.planAt : 'undo'));
      return {ref: publicRef(r, true)};
    }
    if (kind === 'call') {   // the agent's own record, no approval needed; it decides whether the lead bonus is kept
      if (on) { if (r.calledAt) fail('already_marked'); r.called = 'yes'; r.calledAt = nowIso(store); }
      else { if (r.appt === 'pending' || r.appt === 'approved') fail('undo_appt_first'); r.called = ''; r.calledAt = ''; }
      r.stepAt = nowIso(store); store.save('refs', refs); store.version(true); log(store, me.id, 'step', r.id + ' call ' + (on ? 'done' : 'undo'));
      return {ref: publicRef(r, true)};
    }
    var at = kind + 'At';
    if (on) {
      if (r[kind] && r[kind] !== 'rejected') fail('already_marked');
      if (kind === 'close' && !(r.appt === 'pending' || r.appt === 'approved')) fail('appointment_first');
      r[kind] = leader ? 'approved' : 'pending'; r[at] = nowIso(store);
      if (kind === 'appt' && !r.calledAt) { r.called = 'yes'; r.calledAt = r[at]; }   // met them = called them
      if (kind === 'appt' && r.planAt && new Date(r.planAt).getTime() <= store.now().getTime()) r[at] = r.planAt;   // done = at the appointment time that was set
      if (kind === 'appt') r.apptMark = nowIso(store);   // when it was marked (connected apps use it to tell a redo from the old entry)
    } else {
      if (r[kind] === 'approved' && !leader) fail('approved_ask_leader');
      if (kind === 'appt' && (r.close === 'pending' || r.close === 'approved')) fail('undo_close_first');
      r[kind] = ''; r[at] = '';
    }
    r.stepAt = nowIso(store); store.save('refs', refs); store.version(true);
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
    done.forEach(function (p) { p[0].stepAt = nowIso(store); });
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
     Approach = referral pages + roadshow lists posted + "asked, no names"   (counted, not paid)
     Roadshow names are leads too (same rates, same 14-day call rule); leadsRoadshow shows how many of the paid leads came from roadshows.
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
    var rows = agents.map(function (a) { return {id: a.id, name: a.name, approach: 0, leads: 0, leadsWaiting: 0, leadsToCall: 0, leadsForfeit: 0, leadsRoadshow: 0, appt: 0, apptWaiting: 0, close: 0, closeWaiting: 0, total: 0}; });
    var by = {}; rows.forEach(function (x) { by[x.id] = x; });
    posts.forEach(function (p) { var x = by[p.agentId]; if (x && (p.kind === 'approach' || (p.kind === 'referral' && p.status !== 'rejected')) && inMonth(p.created, month)) x.approach++; });
    refs.forEach(function (f) {
      var x = by[f.agentId]; if (!x || f.status === 'rejected') return;
      if (inMonth(f.created, month)) {
        var cs = callState(f, nowMs);
        if (cs === 'forfeit' || cs === 'late') x.leadsForfeit++;                // no call within 14 days: lead bonus forfeited
        else if (f.status !== 'approved') x.leadsWaiting++;                     // waiting leader approval
        else if (cs === 'due') x.leadsToCall++;                                  // approved, waiting for the call
        else { x.leads++; if (f.source === 'roadshow') x.leadsRoadshow++; }       // approved + called in time = paid
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
    store.save('devices', store.load('devices').filter(function (x) { return x.agentId !== a.id; }));
    store.save('links', store.load('links').filter(function (x) { return x.agentId !== a.id; }));   // signs them out on every phone
    log(store, me.id, 'remove_agent', a.name);
    return {ok: true};
  }

  /* ---------- connect other REDEFINE apps (REDEFINE Calendar, REDEFINE On Field) ----------
     The agent asks for a private link code here and gives it to the other app once. That app then collects this
     agent's lead activity (called / appointment set / appointment done) with the code and adds it to its own records.
     Only a hash of the code is stored. A new code replaces the old one; Disconnect removes it. */
  var LINK_APPS = {calendar: 1, onfield: 1};
  function linkCode(q, store, me) {
    var app = str(q.app, 12); if (!LINK_APPS[app]) fail('bad_request');
    var code = newId(store, 28), rows = store.load('links').filter(function (l) { return !(l.agentId === me.id && l.app === app); });
    rows.push({codeHash: store.hash('link|' + code), agentId: me.id, app: app, created: nowIso(store), lastPull: ''});
    store.save('links', rows); log(store, me.id, 'link', app);
    return {code: code, app: app};
  }
  function unlinkApp(q, store, me) {
    var app = str(q.app, 12);
    store.save('links', store.load('links').filter(function (l) { return !(l.agentId === me.id && (!app || l.app === app)); }));
    return {unlinked: true};
  }
  function linksOf(store, me) {
    var o = {}; store.load('links').forEach(function (l) { if (l.agentId === me.id) o[l.app] = {created: l.created, lastPull: l.lastPull}; }); return o;
  }
  /* what the connected app collects: this agent's leads whose steps changed after `since` (or the last 120 days) */
  function feed(q, store) {
    var h = store.hash('link|' + str(q.code, 60)), links = store.load('links'), l = links.filter(function (x) { return x.codeHash === h; })[0];
    if (!l) { store.fails(1, 'link'); fail('bad_link'); }   // old link codes (after Reconnect) never count towards sign-in lock-outs
    var a = store.load('agents').filter(function (x) { return x.id === l.agentId; })[0];
    if (!a || String(a.active) === 'false') fail('removed');
    var since = str(q.since, 30), cut = store.now().getTime() - 120 * 864e5, now = nowIso(store);
    var items = store.load('refs').filter(function (r) {
      if (r.agentId !== a.id) return false;
      var t = r.stepAt || r.created; if (new Date(r.created).getTime() < cut && !r.stepAt) return false;
      return !since || t >= since;   // at-or-after: an item stamped in the same instant as the last collect is not missed (re-sending is harmless)
    }).slice(-300).map(function (r) {
      return {id: r.id, name: r.name, source: r.source || 'referral', status: r.status, created: r.created, calledAt: r.calledAt || '',
        planAt: r.planAt || '', appt: r.appt || '', apptAt: r.apptAt || '', apptMark: r.apptMark || '', noAppt: r.noAppt ? 1 : 0, stepAt: r.stepAt || r.created};
    });
    l.lastPull = now; store.save('links', links);
    return {agent: {name: a.name}, app: l.app, now: now, items: items};
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
  function pushTest(q, store, me) { store.push([me.id], {title: 'REDEFINE Prospecting 🔔', body: 'Pop-ups are working on this phone.', tag: 'test', url: '#/me'}); return {sent: true}; }

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

  /* ---------- monthly payment report emailed to the owner (Script property OWNER_EMAIL) ---------- */
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function buildOwnerReport(store, month) {
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], mm = month.split('-'), label = names[+mm[1] - 1] + ' ' + mm[0];
    var R = rates(store), now = nowIso(store), agents = store.load('agents').filter(function (a) { return String(a.active) !== 'false'; });
    var posts = store.load('posts'), refs = store.load('refs'), rows = bonusTable(agents, posts, refs, month, R, now);
    var sum = function (k) { return rows.reduce(function (t, x) { return t + x[k]; }, 0); };
    var monthRefs = refs.filter(function (r) { return r.status !== 'rejected' && inMonth(r.created, month); });
    var rsNames = monthRefs.filter(function (r) { return r.source === 'roadshow'; }).length;
    var places = {}; posts.forEach(function (p) { if (p.source === 'roadshow' && p.kind === 'referral' && inMonth(p.created, month) && p.location) places[p.location] = (places[p.location] || 0) + (+p.count || 0); });
    var called = monthRefs.filter(function (r) { return r.calledAt; }).length;
    var earners = rows.filter(function (x) { return x.total; }).sort(function (a, b) { return b.total - a.total; });
    var total = sum('total'), paidRaw = setting(store, 'paid_' + month), paid = null; try { paid = paidRaw ? JSON.parse(paidRaw) : null; } catch (e) {}
    var pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '–'; };
    var act = rows.map(function (x) { return {name: x.name, names: x.leads + x.leadsToCall + x.leadsWaiting + x.leadsForfeit, x: x}; }).sort(function (a, b) { return b.names - a.names || a.name.localeCompare(b.name); });
    var top = act[0] && act[0].names ? act[0] : null;
    var td = 'style="padding:6px 8px;border-bottom:1px solid #e5e1d8"', tdr = 'style="padding:6px 8px;border-bottom:1px solid #e5e1d8;text-align:right"', th = 'style="padding:6px 8px;text-align:left;background:#0B0C10;color:#fff;font-weight:600"', thr = 'style="padding:6px 8px;text-align:right;background:#0B0C10;color:#fff;font-weight:600"';
    var link = (store.prop('APP_URL') || 'https://wkahjian93.github.io/redefine-referrals-tracker/') + '#/bonus/' + month;
    var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#16171C;max-width:720px">' +
      '<h2 style="margin:0 0 4px">REDEFINE Prospecting · ' + label + ' payment report</h2>' +
      '<div style="color:#6B6A66;margin-bottom:14px">Rates: Lead RM' + R.lead + ' (called within 14 days) · Appointment RM' + R.appt + ' · Close RM' + R.close + '. Only leader-approved items are paid.</div>' +
      '<div style="background:' + (paid ? '#E3F4EA' : '#FFF1D6') + ';border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:16px"><b>' + (paid ? '✅ Marked paid on ' + h(String(paid.at).slice(0, 10)) + ' (RM' + paid.total + ')' : '💰 To pay: RM' + total.toFixed(2) + ' to ' + earners.length + ' agent' + (earners.length === 1 ? '' : 's')) + '</b>' +
      (!paid ? '<div style="font-size:13px;margin-top:4px">After paying, open the app → Board → bonus → <b>Mark ' + label + ' as paid</b>.</div>' : '') + '</div>' +
      '<h3 style="margin:18px 0 6px">1. Who to pay</h3><table style="border-collapse:collapse;width:100%;font-size:14px"><tr><th ' + th + '>#</th><th ' + th + '>Agent</th><th ' + thr + '>Leads</th><th ' + thr + '>Appt</th><th ' + thr + '>Close</th><th ' + thr + '>Pay (RM)</th></tr>' +
      (earners.length ? earners.map(function (x, i) { return '<tr><td ' + td + '>' + (i + 1) + '</td><td ' + td + '>' + h(x.name) + '</td><td ' + tdr + '>' + x.leads + (x.leadsRoadshow ? ' <span style="color:#6B6A66">(' + x.leadsRoadshow + ' 🎪)</span>' : '') + '</td><td ' + tdr + '>' + x.appt + '</td><td ' + tdr + '>' + x.close + '</td><td ' + tdr + '><b>' + x.total.toFixed(2) + '</b></td></tr>'; }).join('')
        : '<tr><td ' + td + ' colspan="6">No approved bonus for ' + label + '.</td></tr>') +
      '<tr><td ' + td + '></td><td ' + td + '><b>Total</b></td><td ' + tdr + '><b>' + sum('leads') + '</b></td><td ' + tdr + '><b>' + sum('appt') + '</b></td><td ' + tdr + '><b>' + sum('close') + '</b></td><td ' + tdr + '><b>RM' + total.toFixed(2) + '</b></td></tr></table>' +
      '<h3 style="margin:18px 0 6px">2. Not in this payment (yet)</h3><ul style="margin:0;padding-left:18px;font-size:14px">' +
      '<li>Waiting your approval: <b>' + (sum('leadsWaiting') + sum('apptWaiting') + sum('closeWaiting')) + '</b> item(s)</li>' +
      '<li>Approved names not called yet (still inside 14 days, may still be paid for ' + label + '): <b>' + sum('leadsToCall') + '</b></li>' +
      '<li>Forfeited (not called within 14 days): <b>' + sum('leadsForfeit') + '</b> name(s)</li></ul>' +
      '<h3 style="margin:18px 0 6px">3. Team summary</h3><ul style="margin:0;padding-left:18px;font-size:14px">' +
      '<li>New names: <b>' + monthRefs.length + '</b> (' + (monthRefs.length - rsNames) + ' referrals · ' + rsNames + ' roadshow)</li>' +
      '<li>Approaches: <b>' + sum('approach') + '</b> · names per approach ' + (sum('approach') ? (monthRefs.length / sum('approach')).toFixed(1) : '–') + '</li>' +
      '<li>Called: <b>' + called + '</b> (' + pct(called, monthRefs.length) + ') · Appointments: <b>' + sum('appt') + '</b> · Closes: <b>' + sum('close') + '</b> (' + pct(sum('close'), sum('appt')) + ' of appointments)</li>' +
      '<li>Active agents: <b>' + act.filter(function (a) { return a.x.approach; }).length + '</b> of ' + rows.length + (top ? ' · Top prospector: <b>' + h(top.name) + '</b> (' + top.names + ' names)' : '') + '</li>' +
      (Object.keys(places).length ? '<li>Roadshows: ' + Object.keys(places).map(function (p) { return h(p) + ' (' + places[p] + ')'; }).join(', ') + '</li>' : '') + '</ul>' +
      '<h3 style="margin:18px 0 6px">4. Every agent</h3><table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th ' + th + '>Agent</th><th ' + thr + '>Approach</th><th ' + thr + '>Names</th><th ' + thr + '>To call</th><th ' + thr + '>Forfeit</th><th ' + thr + '>Appt</th><th ' + thr + '>Close</th></tr>' +
      act.map(function (a) { var x = a.x; return '<tr><td ' + td + '>' + h(a.name) + '</td><td ' + tdr + '>' + x.approach + '</td><td ' + tdr + '>' + a.names + '</td><td ' + tdr + '>' + x.leadsToCall + '</td><td ' + tdr + '>' + x.leadsForfeit + '</td><td ' + tdr + '>' + (x.appt + x.apptWaiting) + '</td><td ' + tdr + '>' + (x.close + x.closeWaiting) + '</td></tr>'; }).join('') + '</table>' +
      '<p style="margin-top:18px"><a href="' + h(link) + '" style="background:#E8B04B;color:#0B0C10;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open the ' + label + ' bonus sheet</a></p>' +
      '<p style="color:#6B6A66;font-size:12px">Spreadsheet attached. Sent automatically by REDEFINE Prospecting on the 5th of each month. Client phone numbers are never included.</p></div>';
    var csv = ['Agent,Approach,Leads paid (RM' + R.lead + '),Appointments (RM' + R.appt + '),Closes (RM' + R.close + '),Pay RM,Leads to call,Leads forfeited,Waiting approval,Roadshow leads paid'].concat(rows.map(function (x) {
      return ['"' + String(x.name).replace(/"/g, '""') + '"', x.approach, x.leads, x.appt, x.close, x.total.toFixed(2), x.leadsToCall, x.leadsForfeit, x.leadsWaiting + x.apptWaiting + x.closeWaiting, x.leadsRoadshow].join(',');
    })).join('\n');
    return {subject: 'REDEFINE Prospecting · ' + label + ' payment report · ' + (paid ? 'paid ✅' : 'RM' + total.toFixed(2) + ' to ' + earners.length + ' agent' + (earners.length === 1 ? '' : 's')),
      html: html, csv: '﻿' + csv, csvName: 'prospecting-bonus-' + month + '.csv', total: total, earners: earners.length};
  }
  function emailOwner(store, month) {
    var to = store.prop('OWNER_EMAIL'); if (!to || !store.mail) return {emailed: false, reason: 'no_owner_email'};
    var r = buildOwnerReport(store, month);
    store.mail(to, r.subject, r.html, r.csv, r.csvName);
    log(store, 'system', 'owner_email', month + ' RM' + r.total);
    return {emailed: true, total: r.total};
  }
  /* leader: "Email me this report now" for any month */
  function emailReport(q, store, me, leader) {
    if (!leader) fail('leader_only');
    var month = str(q.month, 7); if (!/^\d{4}-\d{2}$/.test(month)) fail('bad_request');
    var r = emailOwner(store, month); if (!r.emailed) fail('no_owner_email');
    return r;
  }

  /* Monthly report (trigger on the 5th, 9am): every leader gets a lock-screen pop-up with last month's bonus total,
     opening the bonus sheet where they share the report to the WhatsApp group and mark it paid. */
  function monthlyReport(store) {
    var now = store.now(), m = myt(now.toISOString()).slice(0, 7).split('-'), d = new Date(Date.UTC(+m[0], +m[1] - 2, 1));
    var month = d.toISOString().slice(0, 7), names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], label = names[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    var agents = store.load('agents').filter(function (a) { return String(a.active) !== 'false'; });
    var rows = bonusTable(agents, store.load('posts'), store.load('refs'), month, rates(store), now.toISOString());
    var total = 0, paidAgents = 0, names_ = 0, waiting = 0;
    rows.forEach(function (x) { total += x.total; if (x.total) paidAgents++; names_ += x.leads + x.leadsToCall + x.leadsWaiting + x.leadsForfeit; waiting += x.leadsWaiting + x.apptWaiting + x.closeWaiting; });
    var paid = setting(store, 'paid_' + month), leaders = agents.filter(function (a) { return a.role === 'leader'; }).map(function (a) { return a.id; });
    var mail = emailOwner(store, month);
    if (!leaders.length) return {month: month, sent: 0, emailed: mail.emailed};
    store.push(leaders, {title: '📊 ' + label + ' prospecting report' + (paid ? ' (paid ✅)' : ''),
      body: names_ + ' names · bonus RM' + total + ' for ' + paidAgents + ' agent' + (paidAgents === 1 ? '' : 's') + '. ' + (paid ? 'Tap to view and share to WhatsApp.' : 'Tap to view, share to WhatsApp, then pay and mark as paid.') + (waiting ? ' ' + waiting + ' item(s) still waiting your approval.' : ''),
      url: '#/bonus/' + month, tag: 'monthly-' + month});
    log(store, 'system', 'monthly_report', month + ' RM' + total);
    return {month: month, total: total, agents: paidAgents, sent: leaders.length, emailed: mail.emailed};
  }

  /* ---------- 3-month auto-delete (daily trigger) ---------- */
  function purge(store) {
    var refs = store.load('refs'), posts = store.load('posts'), now = nowIso(store), n = 0, ph = 0, changed = false;
    refs.forEach(function (r) {
      if (!r.purged && daysAgo(store, r.created) >= KEEP_DAYS) { r.age = ''; r.phone = ''; r.gender = ''; r.remarks = ''; r.purged = now; n++; }
    });
    posts.forEach(function (p) {
      if (p.kind !== 'referral' || p.purged) return;
      if (p.status !== 'pending' && !p.reviewedAt) { p.reviewedAt = now; changed = true; }   // reviewed before this rule existed: start the clock today
      if (p.reviewedAt && !p.photoRemoved && (p.photoId || p.selfieId) && daysAgo(store, p.reviewedAt) >= PHOTO_DAYS) {   // 30 days after approval: photos go, names and details stay
        ph += trashPhotos(store, p);
        if (p.selfieId) { try { store.trashPhoto(p.selfieId); } catch (e) {} ph++; }
        p.photoId = ''; p.selfieId = ''; p.photoRemoved = now; changed = true;
      }
      if (daysAgo(store, p.created) >= KEEP_DAYS) {
        ph += trashPhotos(store, p);
        if (p.selfieId) { try { store.trashPhoto(p.selfieId); } catch (e) {} }
        p.photoId = ''; p.selfieId = ''; p.giver = ''; p.purged = now;
      }
    });
    if (n || ph || changed) { store.save('refs', refs); store.save('posts', posts); store.version(true); log(store, 'system', 'purge', n + ' names wiped, ' + ph + ' photos deleted'); }
    return {wiped: n, photos: ph};
  }

  var OPS = {linkCode: linkCode, unlinkApp: unlinkApp, emailReport: emailReport, addSelfie: addSelfie, pushreg: pushReg, pushoff: pushOff, pushtest: pushTest, signout: signOut, upgrade: function (q, store, me) { return {token: newSession(store, me, q.device)}; }, step: step, stepReview: stepReview, approach: approach, markPaid: markPaid, post: post, sync: sync, photo: photo, comment: comment, review: review, removePost: removePost, settings: saveSettings, removeAgent: removeAgent};

  function handle(q, store) {
    if (!q || typeof q !== 'object') fail('bad_request');
    if (q.op === 'signin') {
      return store.withLock(function () { var r = signIn(q, store); return {ok: true, me: {id: r.me.id, name: r.me.name, leader: r.role === 'leader'}, created: !!r.created, token: newSession(store, r.me, q.device)}; });
    }
    if (q.op === 'feed') return store.withLock(function () { var r = feed(q, store); r.ok = true; return r; });
    if (q.op === 'pushtest' && q.delay) {   // "test in 15 s": wait OUTSIDE the lock so nobody else is blocked
      var w1 = store.withLock(function () { return who(q, store).me; });
      if (store.sleep) store.sleep(Math.max(1, Math.min(20, +q.delay || 15)) * 1000);
      store.push([w1.id], {title: 'REDEFINE Prospecting 🔔', body: 'Pop-ups work even when the phone is locked. 👍', tag: 'test', url: '#/me'});
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

  return {buildOwnerReport: buildOwnerReport, monthlyReport: monthlyReport, PHOTO_DAYS: PHOTO_DAYS, callReminders: callReminders, callState: callState, CALL_DAYS: CALL_DAYS, bonusTable: bonusTable, RATE_DEFAULT: RATE_DEFAULT, TABLES: TABLES, KEEP_DAYS: KEEP_DAYS, handle: handle, purge: purge, parseRead: parseRead, normPhone: normPhone, monthKey: monthKey, myt: myt, READ_PROMPT: READ_PROMPT};
})();
if (typeof module !== 'undefined') module.exports = CORE;
