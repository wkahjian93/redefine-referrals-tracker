/* REDEFINE Referrals Tracker - phone app */
(function () {
  'use strict';
  var CFG = window.RRT_CONFIG || {};
  var $app = document.getElementById('app');
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('rrt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('rrt.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('rrt.' + k); } catch (e) {} }
  };
  var S = {auth: LS.get('auth', null), data: null, ver: 0, seen: LS.get('seen', {}), unread: {feed: 0, chat: 0},
    music: LS.get('musicOn', true), /* team song plays by default; only a manual "off" is remembered */ sounds: LS.get('sounds', true), photos: {}, period: 'month', draft: null, polling: null};

  var ERR = {
    wrong_code: 'That team code is not right. Ask your leader for it.', wrong_pin: 'Wrong PIN for this name.', pin_4_digits: 'PIN must be 4 to 6 digits.',
    name_needed: 'Please type your name.', too_many_tries: 'Too many wrong tries. Please wait 15 minutes.', removed: 'This name was removed from the team. Talk to your leader.',
    server_not_set_up: 'The team server is not set up yet.', daily_limit: 'Daily photo limit reached. Try again tomorrow.', bad_photo: 'This photo could not be sent. Please retake it.',
    no_api_key: 'Photo reading is not switched on yet (leader: add the AI key).', bad_api_key: 'The AI key on the server is not working.', no_credit: 'The AI account has no credit left.',
    rate_limited: 'The AI is busy. Try again in a minute.', ai_unavailable: 'The AI could not be reached. Try again, or type the names yourself.', ai_bad_reply: 'The AI reply was unreadable. Try again, or type the names yourself.',
    no_names: 'There are no names to post.', privacy_not_confirmed: 'Please tick the privacy check first.', photo_gone: 'This photo was auto-deleted (older than 3 months).',
    leader_only: 'Only the leader can do this.', not_yours: 'You can only change your own posts.', approved_ask_leader: 'This page is already approved. Ask your leader to remove it.',
    not_found: 'This item no longer exists.', appointment_first: 'Mark the appointment first, then the close.', already_marked: 'Already marked.',
    lead_not_counted: 'This lead was not counted, so it has no steps.', undo_close_first: 'Undo the close first.', bad_rate: 'Rates must be numbers (RM).', network: 'No connection. Check your internet and try again.', server_error: 'Server problem. Please try again.'
  };
  function errText(e) { return ERR[e && e.message] || (e && e.message) || 'Something went wrong.'; }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  var AV = ['#3D55E0', '#C2410C', '#0F766E', '#9D174D', '#6D28D9', '#B45309', '#15803D', '#0369A1', '#BE123C', '#4D7C0F'];
  function agent(id) { return (S.data && S.data.agents.filter(function (a) { return a.id === id; })[0]) || {id: id, name: 'Former member'}; }
  function avColor(id) { var i = S.data ? S.data.agents.map(function (a) { return a.id; }).indexOf(id) : 0; return AV[(i < 0 ? 0 : i) % AV.length]; }
  function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function avatar(id, sm) { var a = agent(id); return '<div class="av' + (sm ? ' sm' : '') + '" style="background:' + avColor(id) + '">' + esc(initials(a.name)) + '</div>'; }
  function myt(iso) { return new Date(new Date(iso).getTime() + 8 * 3600e3); }
  function monthKey(iso) { return myt(iso).toISOString().slice(0, 7); }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 7 * 86400) return Math.floor(s / 86400) + 'd ago';
    return myt(iso).toISOString().slice(0, 10).split('-').reverse().join('/');
  }
  function hhmm(iso) { return myt(iso).toISOString().slice(11, 16); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayLabel(iso) { var d = myt(iso).toISOString().slice(0, 10), t = myt(new Date().toISOString()).toISOString().slice(0, 10); if (d === t) return 'Today'; var p = d.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function deleteDate(iso, days) { var d = myt(new Date(new Date(iso).getTime() + days * 864e5).toISOString()).toISOString().slice(0, 10).split('-'); return +d[2] + ' ' + MONTHS[+d[1] - 1]; }

  function api(op, extra) {
    if (!CFG.api) return Promise.reject(new Error('server_not_set_up'));
    var q = Object.assign({op: op}, S.auth || {}, extra || {});
    return fetch(CFG.api, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(q)})
      .catch(function () { throw new Error('network'); })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) throw new Error(j.error); return j; });
  }

  /* ---------- toasts, modals, notifications ---------- */
  function toast(title, body, who, go) {
    var t = h('<div class="toast">' + (who ? avatar(who, true) : '<div class="av sm" style="background:#E8B04B;color:#0B0C10">★</div>') +
      '<div class="grow"><div class="tt">' + esc(title) + '</div><div class="tb">' + esc(body) + '</div></div></div>');
    t.onclick = function () { t.remove(); if (go) location.hash = go; };
    document.getElementById('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 5000);
  }
  function modal(html, wire) {
    var bg = h('<div class="modal-bg"><div class="modal">' + html + '</div></div>');
    function close() { bg.remove(); }
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.getElementById('modal-root').appendChild(bg);
    if (wire) wire(bg, close);
    return close;
  }
  function confirmBox(title, body, yes, danger) {
    return new Promise(function (ok) {
      modal('<h2>' + esc(title) + '</h2><div class="muted">' + body + '</div><div class="btns"><button class="btn" data-n>Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-y>' + esc(yes) + '</button></div>', function (m, close) {
        m.querySelector('[data-n]').onclick = function () { close(); ok(false); };
        m.querySelector('[data-y]').onclick = function () { close(); ok(true); };
      });
    });
  }
  function notifyPhone(title, body, tag) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, {body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png'}); });
      else new Notification(title, {body: body, tag: tag, icon: 'icons/icon-192.png'});
    } catch (e) {}
  }

  /* ---------- WhatsApp share ---------- */
  function shareText(p) {
    var a = agent(p.agentId), link = (CFG.appUrl || location.href.split('#')[0]) + '#/post/' + p.id, month = teamMonthTotal();
    var line = p.kind === 'milestone' ? '🏆 ' + p.text : '🎉 ' + a.name + ' just collected ' + p.count + ' referral' + (p.count === 1 ? '' : 's') + '!';
    return ['📣 *REDEFINE Referrals Tracker*', '', line, 'Team total this month: ' + month + ' referrals 💪', '', 'Hardwork on purpose. No magic, just basic.', '👉 See it & cheer in the app: ' + link].join('\n');
  }
  function shareWhatsApp(p) {
    modal('<h2>Share to WhatsApp group</h2><div class="faint">No client names or numbers are included. You can edit the text. WhatsApp will ask you to pick the group.</div>' +
      '<textarea id="wa-text">' + esc(shareText(p)) + '</textarea><div class="btns"><button class="btn" data-n>Cancel</button><button class="btn wa" data-y>Open WhatsApp</button></div>', function (m, close) {
      m.querySelector('[data-n]').onclick = close;
      m.querySelector('[data-y]').onclick = function () { var t = m.querySelector('#wa-text').value; close(); window.location.href = 'https://wa.me/?text=' + encodeURIComponent(t); };
    });
  }

  /* ---------- data & polling ---------- */
  function teamMonthTotal() { var mk = monthKey(new Date().toISOString()); return S.data ? S.data.refs.filter(function (r) { return r.status !== 'rejected' && monthKey(r.created) === mk; }).length : 0; }
  function refresh(silent) {
    return api('sync', {ver: S.ver}).then(function (d) {
      if (d.same) return false;
      var first = !S.data; S.data = d; S.ver = d.ver; S.offline = false;
      saveCache();
      announce(first);
      return true;
    }).catch(function (e) {
      // stay signed in like WhatsApp: only a sign-out on this phone or removal by the leader ends it
      if (/^(signed_out|removed)$/.test(e.message)) { signOut(true, e.message); return false; }
      if (e.message === 'network' && S.data && !S.offline) { S.offline = true; render(); }
      if (!silent && S.data) toast('Could not refresh', errText(e)); return false;
    });
  }
  /* last data kept on the phone, so the app opens instantly and works without signal (read only) */
  function saveCache() { try { localStorage.setItem('rrt.cache', JSON.stringify({who: S.auth && S.auth.name, data: S.data})); } catch (e) {} }
  function loadCache() {
    try { var c = JSON.parse(localStorage.getItem('rrt.cache') || 'null'); if (c && S.auth && c.who === S.auth.name && c.data) { S.data = c.data; S.ver = c.data.ver; } } catch (e) {}
  }
  function deviceName() { var u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Phone'; }
  function keepStorage() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} }
  function announce(first) {
    var me = S.data.me.id, lastP = S.seen.p || '', lastC = S.seen.c || '', lastT = S.seen.t || '', lastS = S.seen.s || '';
    var maxStep = S.data.refs.reduce(function (m, r) { return [r.apptAt || '', r.closeAt || '', m].sort().pop(); }, '');
    if (maxStep > lastS) { S.seen.s = maxStep; LS.set('seen', S.seen); }
    if (!lastS) lastS = '9';   // first run on this phone: nothing is "new"
    var newPosts = S.data.posts.filter(function (p) { return p.created > lastP && p.agentId !== me && p.kind !== 'approach'; });
    var newCmts = S.data.comments.filter(function (c) { return c.postId !== 'team' && c.created > lastC && c.agentId !== me; });
    var newChat = S.data.comments.filter(function (c) { return c.postId === 'team' && c.created > lastT && c.agentId !== me; });
    if (!S.seen.p) { mark(); dailyReminderPopups(); return; }   // first time on this phone: nothing is "new"
    S.unread.feed = newPosts.length + newCmts.length; S.unread.chat = newChat.length;
    if (!first) {
      var alerts = [];
      newPosts.forEach(function (p) { var n = agent(p.agentId).name; alerts.push([p.kind === 'milestone' ? '🏆 Milestone' : 'New referral update', p.kind === 'milestone' ? p.text : n + ' collected ' + p.count + ' referral' + (p.count === 1 ? '' : 's') + '!', p.agentId, '#/post/' + p.id]); });
      newCmts.forEach(function (c) { alerts.push([agent(c.agentId).name + ' commented', c.text, c.agentId, c.postId === 'board' ? '#/board' : '#/post/' + c.postId]); });
      newChat.forEach(function (c) { alerts.push([agent(c.agentId).name + ' · Team chat', c.text, c.agentId, '#/chat']); });
      if (S.data.me.leader) S.data.refs.forEach(function (r) {   // leader: new appointment / close updates to approve
        if (r.agentId === me) return;
        if (r.appt === 'pending' && r.apptAt > lastS) alerts.push([agent(r.agentId).name + ' · appointment done', 'Met ' + r.name + '. Tap to approve.', r.agentId, '#/steps']);
        if (r.close === 'pending' && r.closeAt > lastS) alerts.push([agent(r.agentId).name + ' · closed a case 🎯', 'Closed with ' + r.name + '. Tap to approve.', r.agentId, '#/steps']);
      });
      alerts.slice(-3).forEach(function (a) { toast(a[0], a[1], a[2], a[3]); notifyPhone(a[0], a[1], a[3]); });
      if (alerts.length && S.sounds) SOUND.ding();
    }
    dailyReminderPopups();
    route.current === 'feed' || route.current === 'post' ? mark('feed') : null;
    route.current === 'chat' ? mark('chat') : null;
    render();
  }
  function mark(which) {
    if (!S.data) return;
    var max = function (list) { return list.reduce(function (m, x) { return x.created > m ? x.created : m; }, ''); };
    if (!which || which === 'feed') { S.seen.p = max(S.data.posts) || S.seen.p || '0'; S.seen.c = max(S.data.comments.filter(function (c) { return c.postId !== 'team'; })) || S.seen.c || '0'; S.unread.feed = 0; }
    if (!which || which === 'chat') { S.seen.t = max(S.data.comments.filter(function (c) { return c.postId === 'team'; })) || S.seen.t || '0'; S.unread.chat = 0; }
    LS.set('seen', S.seen);
  }
  function startPolling() {
    clearInterval(S.polling);
    S.polling = setInterval(function () { if (!document.hidden || ('Notification' in window && Notification.permission === 'granted')) refresh(true); }, document.hidden ? 60000 : 20000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.auth) refresh(true); startPolling(); });

  /* ---------- routing ---------- */
  function route() {
    var p = (location.hash || '#/feed').slice(2).split('/');
    route.current = p[0] || 'feed'; route.arg = p[1] || '';
    if (!route.keepModal) document.getElementById('modal-root').innerHTML = ''; route.keepModal = false;
    if (route.current === 'feed' || route.current === 'post') mark('feed');
    if (route.current === 'chat') mark('chat');
    render(); window.scrollTo(0, route.current === 'chat' ? document.body.scrollHeight : 0);
    if (route.current === 'chat') setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 50);
  }
  window.addEventListener('hashchange', route);

  /* ---------- shell ---------- */
  function render() {
    if (!S.auth) return renderSignIn();
    if (!S.data) { $app.innerHTML = '<div class="signin"><div class="box" style="text-align:center"><img class="logo" src="icons/icon-192.png" alt=""><div class="spinner"></div><p>Loading your team…</p></div></div>'; return; }
    var v = route.current, sc = window.scrollY;
    var views = {feed: viewFeed, post: viewPost, board: viewBoard, snap: viewSnap, chat: viewChat, me: viewMe, review: viewReview, leads: viewLeads, steps: viewSteps, bonus: viewBonus};
    var body = (views[v] || viewFeed)();
    $app.innerHTML = (CFG.sample ? '<div class="sample-bar">' + esc(CFG.sample) + '</div>' : '') +
      (S.offline ? '<div class="sample-bar" style="background:#6B6A66;color:#fff">No signal · showing what was saved on this phone</div>' : '') +
      '<header class="top"><div class="wrap"><div class="brand"><img src="icons/icon-192.png" alt=""><div><b>REDEFINE <span>Referrals</span></b><small>' + esc(teamMonthTotal()) + ' team referrals this month</small></div></div>' +
      '<button class="icon-btn' + (S.music ? ' on' : '') + '" id="music" aria-label="Background music" title="Background music">♪</button></div></header>' +
      '<main><div class="wrap" id="view"></div></main>' + tabsHtml();
    var view = document.getElementById('view');
    if (typeof body === 'string') view.innerHTML = body; else { view.innerHTML = ''; view.appendChild(body); }
    wireShell();
    if (views[v] && views[v].wire) views[v].wire(view);
    if (v === S.lastView) window.scrollTo(0, sc); S.lastView = v;
  }
  function tabsHtml() {
    var t = [['feed', '🏠', 'Feed', S.unread.feed], ['board', '📊', 'Board', 0], ['snap', '📷', 'Snap', 0], ['chat', '💬', 'Chat', S.unread.chat], ['me', '👤', 'Me', 0]];
    var cur = {post: 'feed', review: 'board', steps: 'board', bonus: 'board', leads: 'me'}[route.current] || route.current;
    return '<nav class="tabs"><div class="wrap">' + t.map(function (x) {
      return '<button class="tab' + (x[0] === 'snap' ? ' snap' : '') + (cur === x[0] ? ' active' : '') + '" data-go="' + x[0] + '"><i>' + x[1] + '</i>' + x[2] + (x[3] ? '<span class="badge">' + (x[3] > 99 ? '99+' : x[3]) + '</span>' : '') + '</button>';
    }).join('') + '</div></nav>';
  }
  function wireShell() {
    document.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { location.hash = '#/' + b.dataset.go; }; });
    var m = document.getElementById('music');
    if (m) m.onclick = function () { S.music = !S.music; LS.set('musicOn', S.music); if (S.music) SOUND.startMusic(); else SOUND.stopMusic(); m.classList.toggle('on', S.music); };
  }
  // phones block sound until the first touch: start the song on the first tap/click/key if it could not start by itself
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () { SOUND.unlock(); if (S.music && !SOUND.isPlaying()) SOUND.startMusic(); }, {passive: true});
  });
  if (S.music) SOUND.startMusic();   // plays straight away where the browser allows it

  /* ---------- sign in ---------- */
  function renderSignIn() {
    var last = LS.get('lastName', '');
    $app.innerHTML = '<div class="signin"><div class="box"><img class="logo" src="icons/icon-192.png" alt="">' +
      '<h1>REDEFINE <span>Referrals</span></h1><p>Snap your referral page. The app counts it, hides client privacy, and the whole team cheers you on.</p>' +
      '<label class="field"><span>Team code (from your leader)</span><input id="si-code" autocomplete="off" autocapitalize="off"></label>' +
      '<label class="field"><span>Your name (as the team knows you)</span><input id="si-name" value="' + esc(last) + '" autocomplete="name"></label>' +
      '<label class="field"><span>Your PIN (4–6 digits; new members choose one now)</span><input id="si-pin" inputmode="numeric" type="password" maxlength="6"></label>' +
      '<div class="err" id="si-err"></div><button class="btn gold block" id="si-go">Enter</button></div></div>';
    document.getElementById('si-go').onclick = function () { doSignIn(false); };
    document.getElementById('si-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(false); });
  }
  function doSignIn(create) {
    var q = {code: document.getElementById('si-code').value.trim(), name: document.getElementById('si-name').value.trim(), pin: document.getElementById('si-pin').value.trim(), create: create};
    var err = document.getElementById('si-err'), btn = document.getElementById('si-go');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Checking…';
    q.device = deviceName();
    api('signin', q).then(function (r) {
      S.auth = {token: r.token, name: r.me.name}; LS.set('auth', S.auth); LS.set('lastName', r.me.name);   // the phone keeps only its device key, not the code or PIN
      keepStorage();
      if (r.created) toast('Welcome to the team board', 'Snap your first referral page to get on the board!');
      S.data = null; render(); return refresh().then(function () { startPolling(); route(); });
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Enter';
      if (e.message === 'new_name') {
        confirmBox('New member?', 'No one called <b>' + esc(q.name) + '</b> is on the team yet. Create a new member with this name and PIN?', 'Yes, create me').then(function (y) { if (y) doSignIn(true); });
        return;
      }
      err.textContent = errText(e);
    });
  }
  function signOut(auto, reason) {
    if (!auto && S.auth && S.auth.token) api('signout', {}).catch(function () {});   // ends this phone's key on the server too
    S.auth = null; S.data = null; S.ver = 0; LS.del('auth'); try { localStorage.removeItem('rrt.cache'); } catch (e) {}
    clearInterval(S.polling); render();
    if (auto) { var el = document.getElementById('si-err'); if (el) el.textContent = reason === 'removed' ? 'Your leader removed this name from the team.' : 'You were signed out on this phone. Please sign in again.'; }
  }

  /* ---------- feed ---------- */
  function refsOf(postId) { return S.data.refs.filter(function (r) { return r.postId === postId; }); }
  function cmtsOf(postId) { return S.data.comments.filter(function (c) { return c.postId === postId; }); }
  function postCard(p, full) {
    var a = agent(p.agentId), cm = cmtsOf(p.id), me = S.data.me;
    var cmHtml = '<div class="cmts">' + (full ? cm : cm.slice(-2)).map(function (c) {
      return '<div class="cmt">' + avatar(c.agentId, true) + '<div class="bubble"><b>' + esc(agent(c.agentId).name) + '</b> <span class="faint">' + ago(c.created) + '</span><div>' + esc(c.text) + '</div></div></div>';
    }).join('') + (!full && cm.length > 2 ? '<a href="#/post/' + p.id + '" class="faint">View all ' + cm.length + ' comments</a>' : '') +
      '<div class="cbox"><input placeholder="Cheer ' + esc(a.name.split(' ')[0]) + ' on…" data-cin="' + p.id + '" maxlength="1000"><button class="btn sm primary" data-csend="' + p.id + '">Send</button></div></div>';
    if (p.kind === 'milestone') {
      return '<div class="card milestone" id="p-' + p.id + '"><div class="row">' + avatar(p.agentId) + '<div class="grow"><div class="faint">' + ago(p.created) + ' · Milestone</div><div class="big">' + esc(p.text) + '</div></div></div>' +
        '<div class="actions"><button class="btn sm wa" data-share="' + p.id + '">Share to WhatsApp</button></div>' + cmHtml.replace('class="cmts"', 'class="cmts" style="border-color:#2c2f3a"') + '</div>';
    }
    var rs = refsOf(p.id), canSee = me.leader || p.agentId === me.id;
    var chips = rs.map(function (r) {
      return '<span class="chip' + (r.dup && canSee ? ' dup' : '') + (r.status === 'rejected' ? ' rej' : '') + '" title="' + esc(r.dup || '') + '">' + esc(r.name) + (r.dup && canSee ? ' ⚠️' : '') + '</span>';
    }).join('');
    var statusTxt = {pending: 'Waiting approval', approved: 'Approved', partial: 'Partly approved', rejected: 'Not counted'}[p.status] || p.status;
    var photo = p.purged ? '<div class="photo-box">Photo and contact details auto-deleted after 3 months · names kept</div>'
      : p.photo ? '<div class="photo-box" data-photo="' + p.id + '">' + (S.photos[p.id] ? '<img alt="Referral page, private details covered" src="data:image/jpeg;base64,' + S.photos[p.id] + '">' : 'Tap to load the covered photo') + '</div>'
      : '<div class="photo-box">Sample post · no photo</div>';
    return '<div class="card" id="p-' + p.id + '"><div class="row">' + avatar(p.agentId) + '<div class="grow"><div class="name">' + esc(a.name) + '</div><div class="faint">' + ago(p.created) + (p.giver && canSee ? ' · from ' + esc(p.giver) : '') + '</div></div>' +
      '<div style="text-align:right"><div class="big-num">' + p.count + '</div><div class="faint">referral' + (p.count === 1 ? '' : 's') + '</div></div></div>' +
      '<div class="chips">' + chips + '</div><div class="row" style="margin-top:6px"><span class="pill ' + esc(p.status) + '">' + esc(statusTxt) + '</span>' +
      (canSee && !p.purged ? '<span class="faint">Client details auto-delete ' + deleteDate(p.created, S.data.keepDays) + '</span>' : '') + '</div>' + photo +
      '<div class="actions"><button class="btn sm wa" data-share="' + p.id + '">Share to WhatsApp</button>' +
      (me.leader && p.status !== 'approved' ? '<a class="btn sm gold" href="#/review/' + p.id + '">Review</a>' : '') +
      (!full ? '<a class="btn sm" href="#/post/' + p.id + '">Details</a>' : '') +
      ((p.agentId === me.id && (p.status === 'pending' || p.status === 'rejected')) || me.leader ? '<button class="btn sm danger" data-del="' + p.id + '">Delete</button>' : '') + '</div>' + cmHtml + '</div>';
  }
  function wirePosts(root) {
    root.querySelectorAll('[data-share]').forEach(function (b) { b.onclick = function () { shareWhatsApp(S.data.posts.filter(function (p) { return p.id === b.dataset.share; })[0]); }; });
    root.querySelectorAll('[data-csend]').forEach(function (b) {
      var inp = root.querySelector('[data-cin="' + b.dataset.csend + '"]');
      var send = function () { var t = inp.value.trim(); if (!t) return; b.disabled = true; sendComment(b.dataset.csend, t).finally(function () { b.disabled = false; }); };
      b.onclick = send; inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    });
    root.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        confirmBox('Delete this referral page?', 'The photo, names and comments of this post will be removed for everyone. This cannot be undone.', 'Delete', true).then(function (y) {
          if (!y) return; api('removePost', {postId: b.dataset.del, confirm: true}).then(function () { toast('Deleted', 'The post was removed.'); location.hash = '#/feed'; return refresh(); }).catch(function (e) { toast('Not deleted', errText(e)); });
        });
      };
    });
    var lazy = root.querySelectorAll('[data-photo]');
    var load = function (el) {
      var id = el.dataset.photo; if (S.photos[id] || el.dataset.loading) return; el.dataset.loading = 1; el.textContent = 'Loading photo…';
      api('photo', {postId: id}).then(function (r) { S.photos[id] = r.image; el.innerHTML = '<img alt="Referral page, private details covered" src="data:image/jpeg;base64,' + r.image + '">'; })
        .catch(function (e) { el.textContent = errText(e); delete el.dataset.loading; });
    };
    lazy.forEach(function (el) { el.onclick = function () { load(el); }; });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }); }, {rootMargin: '200px'});
      lazy.forEach(function (el) { io.observe(el); });
    }
  }
  function sendComment(postId, text) {
    return api('comment', {postId: postId, text: text}).then(function () { return refresh(true); }).then(function () {
      if (postId === 'team') setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 30);
    }).catch(function (e) { toast('Not sent', errText(e)); });
  }
  function viewFeed() {
    var posts = S.data.posts.filter(function (p) { return p.kind !== 'approach'; }).sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    var mine = S.data.refs.filter(function (r) { return r.agentId === S.data.me.id && r.status !== 'rejected' && monthKey(r.created) === monthKey(new Date().toISOString()); }).length;
    var head = remindersHtml() + '<div class="card"><div class="row"><div class="grow"><div class="faint">Your referrals this month</div><div class="big-num">' + mine + '</div></div>' +
      '<a class="btn gold" href="#/snap">📷 Snap referral page</a></div></div>';
    if (!posts.length) return head + '<div class="empty">No referral updates yet. Be the first on the board!</div>';
    return head + posts.slice(0, 80).map(function (p) { return postCard(p, false); }).join('');
  }
  viewFeed.wire = wirePosts;
  function viewPost() {
    var p = S.data.posts.filter(function (x) { return x.id === route.arg; })[0];
    if (!p) return '<div class="empty">This post was removed.<br><br><a href="#/feed">Back to feed</a></div>';
    var rs = refsOf(p.id), me = S.data.me, canSee = me.leader || p.agentId === me.id, extra = '';
    if (canSee && p.kind === 'referral') {
      extra = '<div class="card"><h2>Referral details</h2><div class="faint">Only ' + (me.leader && p.agentId !== me.id ? 'you (leader) and ' + esc(agent(p.agentId).name) : 'you and your leader') + ' can see this. ' + (p.purged ? 'Details were auto-deleted.' : 'Auto-deletes on ' + deleteDate(p.created, S.data.keepDays) + '; the names stay.') + '</div>' +
        '<div class="scroll-x"><table class="data"><tr><th>#</th><th>Name</th><th>Age</th><th>Contact</th><th>Remarks</th></tr>' +
        rs.map(function (r, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + (r.dup ? '<div class="faint">⚠️ ' + esc(r.dup) + '</div>' : '') + '</td><td>' + esc(r.age || '') + '</td><td>' + (r.phone ? '<a href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">' + esc(r.phone) + '</a>' : '') + '</td><td>' + esc(r.remarks || '') + '</td></tr>'; }).join('') + '</table></div></div>' +
        '<div class="card"><h2>Follow-up</h2><div class="faint">Tap when it happens. Appointment RM ' + S.data.rates.appt + ', closed case RM ' + S.data.rates.close + ' after leader approval.</div>' + rs.map(leadRow).join('') + '</div>';
    }
    return '<div style="margin-bottom:10px"><a href="#/feed">← Feed</a></div>' + postCard(p, true) + extra;
  }
  viewPost.wire = function (root) { wirePosts(root); wireLeadRows(root); };

  /* ---------- board (data analysis) ---------- */
  function periodRange(key) {
    var now = myt(new Date().toISOString()), y = now.getUTCFullYear(), m = now.getUTCMonth();
    var toIso = function (yy, mm) { return new Date(Date.UTC(yy, mm, 1) - 8 * 3600e3).toISOString(); };
    if (key === 'month') return {from: toIso(y, m), to: '9', label: MONTHS[m] + ' ' + y};
    if (key === 'last') return {from: toIso(y, m - 1), to: toIso(y, m), label: MONTHS[(m + 11) % 12]};
    if (key === 'q') return {from: new Date(Date.now() - 84 * 864e5).toISOString(), to: '9', label: 'last 12 weeks'};
    return {from: '0', to: '9', label: 'all time'};
  }
  function stats(range) {
    var refs = S.data.refs.filter(function (r) { return r.created >= range.from && r.created < range.to && r.status !== 'rejected'; });
    var posts = S.data.posts.filter(function (p) { return p.kind === 'referral' && p.created >= range.from && p.created < range.to && p.status !== 'rejected'; });
    var per = {};
    S.data.agents.forEach(function (a) { per[a.id] = {id: a.id, name: a.name, approved: 0, pending: 0, pages: 0, dups: 0, last: ''}; });
    refs.forEach(function (r) { var x = per[r.agentId]; if (!x) return; if (r.status === 'approved') x.approved++; else x.pending++; if (r.dup) x.dups++; });
    posts.forEach(function (p) { var x = per[p.agentId]; if (!x) return; x.pages++; if (p.created > x.last) x.last = p.created; });
    var rows = Object.keys(per).map(function (k) { var x = per[k]; x.total = x.approved + x.pending; return x; }).sort(function (a, b) { return b.total - a.total || b.approved - a.approved || a.name.localeCompare(b.name); });
    return {refs: refs, posts: posts, rows: rows, total: refs.length, approved: refs.filter(function (r) { return r.status === 'approved'; }).length,
      active: rows.filter(function (r) { return r.pages > 0; }).length, members: rows.length, perPage: posts.length ? refs.length / posts.length : 0};
  }
  function weekly() {   // last 12 weeks, Monday start (Malaysia time)
    var now = myt(new Date().toISOString()), day = (now.getUTCDay() + 6) % 7;
    var start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day) - 8 * 3600e3, weeks = [];
    for (var i = 11; i >= 0; i--) weeks.push({from: start - i * 7 * 864e5, n: 0});
    S.data.refs.forEach(function (r) { if (r.status === 'rejected') return; var t = new Date(r.created).getTime(); for (var i = weeks.length - 1; i >= 0; i--) if (t >= weeks[i].from) { if (i < 11 || t < weeks[i].from + 7 * 864e5) weeks[i].n++; break; } });
    return weeks;
  }
  function weeklySvg(weeks) {
    var W = 360, H = 170, L = 24, B = 22, T = 10, max = Math.max(4, Math.max.apply(null, weeks.map(function (w) { return w.n; })));
    var nice = Math.ceil(max / 4) * 4, bw = (W - L) / weeks.length, out = '';
    for (var g = 0; g <= 4; g++) { var y = T + (H - T - B) * (1 - g / 4); out += '<line x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="var(--grid)" stroke-width="1"/><text x="' + (L - 5) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--faint)">' + (nice * g / 4) + '</text>'; }
    weeks.forEach(function (w, i) {
      var bh = (H - T - B) * w.n / nice, x = L + i * bw + bw * 0.18, y = H - B - bh, d = myt(new Date(w.from).toISOString());
      var lbl = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
      if (w.n) out += '<path d="M' + x + ',' + (H - B) + 'V' + (y + 4) + 'q0,-4 4,-4h' + (bw * 0.64 - 8) + 'q4,0 4,4V' + (H - B) + 'z" fill="' + (i === 11 ? 'var(--gold)' : 'var(--bar)') + '"/>';
      out += '<rect x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - T) + '" fill="transparent" data-tip="Week of ' + lbl + ': ' + w.n + ' referral' + (w.n === 1 ? '' : 's') + (i === 11 ? ' (this week so far)' : '') + '"/>';
      if (i % 3 === 2) out += '<text x="' + (L + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10.5" fill="var(--faint)">' + lbl + '</text>';
    });
    out += '<line x1="' + L + '" x2="' + W + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line)"/>';
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Team referrals per week, last 12 weeks">' + out + '</svg><div class="tip"></div></div>';
  }
  function viewBoard() {
    var range = periodRange(S.period), st = stats(range), me = S.data.me;
    var pend = S.data.posts.filter(function (p) { return p.kind === 'referral' && p.status === 'pending'; }), stepsWaiting = pendingSteps().length;
    var max = Math.max(1, st.rows.length ? st.rows[0].total : 1), top = st.rows[0];
    var seg = [['month', 'This month'], ['last', 'Last month'], ['q', '12 weeks'], ['all', 'All time']].map(function (x) { return '<button data-period="' + x[0] + '" class="' + (S.period === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('');
    var html = '<div class="seg">' + seg + '</div>';
    if (me.leader && pend.length) html += '<a href="#/review/' + pend[pend.length - 1].id + '" class="card row" style="text-decoration:none;color:inherit;border-color:var(--gold)"><div class="grow"><b>' + pend.length + ' page' + (pend.length === 1 ? '' : 's') + ' waiting for your approval</b><div class="faint">Approve to count them for bonus</div></div><span class="btn sm gold">Review</span></a>';
    if (me.leader && stepsWaiting) html += '<a href="#/steps" class="card row" style="text-decoration:none;color:inherit;border-color:var(--gold)"><div class="grow"><b>' + stepsWaiting + ' appointment / close update' + (stepsWaiting === 1 ? '' : 's') + ' waiting</b><div class="faint">Approve to pay RM ' + S.data.rates.appt + ' / RM ' + S.data.rates.close + '</div></div><span class="btn sm gold">Review</span></a>';
    var myBonus = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, curMonth(), S.data.rates).filter(function (x) { return me.leader || x.id === me.id; });
    var bonusSum = myBonus.reduce(function (s, x) { return s + x.total; }, 0);
    html += '<a href="#/bonus" class="card row" style="text-decoration:none;color:inherit"><div class="grow"><b>' + (me.leader ? 'Team referral bonus · ' : 'Your referral bonus · ') + monthName(curMonth()) + '</b><div class="faint">Approach · Leads RM' + S.data.rates.lead + ' · Appointment RM' + S.data.rates.appt + ' · Close RM' + S.data.rates.close + '</div></div><div style="text-align:right"><div class="big-num" style="font-size:24px">RM' + bonusSum.toLocaleString() + '</div><div class="faint">so far</div></div></a>';
    html += '<div class="tiles">' +
      '<div class="tile"><div class="k">Team referrals</div><div class="v">' + st.total + '</div><div class="s">' + st.approved + ' approved · ' + (st.total - st.approved) + ' pending</div></div>' +
      '<div class="tile"><div class="k">Active agents</div><div class="v">' + st.active + '<span style="font-size:15px;color:var(--faint)"> / ' + st.members + '</span></div><div class="s">posted at least one page</div></div>' +
      '<div class="tile"><div class="k">Names per page</div><div class="v">' + st.perPage.toFixed(1) + '</div><div class="s">' + st.posts.length + ' pages posted</div></div>' +
      '<div class="tile"><div class="k">Top agent</div><div class="v" style="font-size:18px;padding-top:5px">' + (top && top.total ? esc(top.name) : '—') + '</div><div class="s">' + (top && top.total ? top.total + ' referrals' : 'no referrals yet') + '</div></div></div>';
    html += '<div class="card"><h2>Leaderboard · ' + esc(range.label) + '</h2><div class="legend"><span><i style="background:var(--bar)"></i>Approved</span><span><i style="background:var(--bar-soft)"></i>Waiting approval</span></div>' +
      st.rows.map(function (r, i) {
        var wa = r.approved / max * 100, wp = r.pending / max * 100;
        return '<div class="lb-row"><div class="lb-rank">' + (r.total ? ['🥇', '🥈', '🥉'][i] || i + 1 : '·') + '</div><div><div class="lb-top"><span>' + esc(r.name) + (r.id === me.id ? ' (you)' : '') + '</span><b>' + r.total + '</b></div>' +
          '<div class="lb-bar" data-tip="' + esc(r.name) + ': ' + r.approved + ' approved, ' + r.pending + ' waiting">' + (r.approved ? '<span style="width:' + wa + '%;background:var(--bar)"></span>' : '') + (r.pending ? '<span style="width:' + wp + '%;background:var(--bar-soft)"></span>' : '') + (!r.total ? '<span style="width:100%;background:var(--grid)"></span>' : '') + '</div></div></div>';
      }).join('') + '</div>';
    html += '<div class="card"><h2>Team referrals per week</h2><h3>Last 12 weeks · this week in gold</h3>' + weeklySvg(weekly()) + '</div>';
    html += funnelHtml(range);
    html += '<div class="card"><h2>Details · ' + esc(range.label) + '</h2><div class="scroll-x"><table class="data"><tr><th>Agent</th><th class="n">Pages</th><th class="n">Names</th><th class="n">Approved</th><th class="n">Per page</th><th>Last post</th></tr>' +
      st.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="n">' + r.pages + '</td><td class="n">' + r.total + '</td><td class="n">' + r.approved + '</td><td class="n">' + (r.pages ? (r.total / r.pages).toFixed(1) : '–') + '</td><td>' + (r.last ? ago(r.last) : '–') + '</td></tr>'; }).join('') +
      '</table></div></div>';
    var bc = cmtsOf('board');
    html += '<div class="card"><h2>Board talk</h2><div class="faint">Comment on the team\'s effort. Everyone sees this.</div><div class="cmts" style="border:0">' +
      bc.slice(-15).map(function (c) { return '<div class="cmt">' + avatar(c.agentId, true) + '<div class="bubble"><b>' + esc(agent(c.agentId).name) + '</b> <span class="faint">' + ago(c.created) + '</span><div>' + esc(c.text) + '</div></div></div>'; }).join('') +
      '<div class="cbox"><input placeholder="Say something to the team…" data-cin="board" maxlength="1000"><button class="btn sm primary" data-csend="board">Send</button></div></div></div>';
    return html;
  }
  viewBoard.wire = function (root) {
    root.querySelectorAll('[data-period]').forEach(function (b) { b.onclick = function () { S.period = b.dataset.period; render(); }; });
    wirePosts(root);
    root.querySelectorAll('.chart').forEach(function (ch) {
      var tip = ch.querySelector('.tip');
      ch.querySelectorAll('[data-tip]').forEach(function (r) {
        var show = function (e) { var b = ch.getBoundingClientRect(), rb = r.getBoundingClientRect(); tip.textContent = r.dataset.tip; tip.style.display = 'block'; tip.style.left = (rb.left - b.left + rb.width / 2) + 'px'; tip.style.top = '20px'; };
        r.addEventListener('pointerenter', show); r.addEventListener('pointerdown', show); r.addEventListener('pointerleave', function () { tip.style.display = 'none'; });
      });
    });
    root.querySelectorAll('.lb-bar[data-tip]').forEach(function (b) { b.title = b.dataset.tip; });
  };

  /* ---------- leader review ---------- */
  function viewReview() {
    var p = S.data.posts.filter(function (x) { return x.id === route.arg; })[0];
    if (!S.data.me.leader) return '<div class="empty">Only the leader can review.</div>';
    if (!p) return '<div class="empty">This page was removed. <a href="#/board">Back</a></div>';
    var rs = refsOf(p.id), others = S.data.posts.filter(function (x) { return x.kind === 'referral' && x.status === 'pending' && x.id !== p.id; });
    S.decide = S.decide && S.decide.post === p.id ? S.decide : {post: p.id, d: rs.reduce(function (o, r) { o[r.id] = r.status === 'pending' ? (r.dup ? 'rejected' : 'approved') : r.status; return o; }, {})};
    return '<div style="margin-bottom:10px"><a href="#/board">← Board</a></div><div class="card"><div class="row">' + avatar(p.agentId) + '<div class="grow"><div class="name">' + esc(agent(p.agentId).name) + '</div><div class="faint">' + ago(p.created) + (p.giver ? ' · from ' + esc(p.giver) : '') + '</div></div></div>' +
      '<div class="notice info">Tick the names that count for bonus. Possible duplicates start unticked, please check them.</div>' +
      rs.map(function (r) { var on = S.decide.d[r.id] === 'approved'; return '<label class="check"><input type="checkbox" data-rv="' + r.id + '"' + (on ? ' checked' : '') + '><div><b>' + esc(r.name) + '</b>' + (r.phone ? ' <span class="faint">' + esc(r.phone) + '</span>' : '') + (r.dup ? '<div class="faint" style="color:var(--warn)">⚠️ ' + esc(r.dup) + '</div>' : '') + '</div></label>'; }).join('') +
      (p.photo && !p.purged ? '<div class="photo-box" data-photo="' + p.id + '">' + (S.photos[p.id] ? '<img alt="" src="data:image/jpeg;base64,' + S.photos[p.id] + '">' : 'Loading photo…') + '</div>' : '') +
      '<div class="actions"><button class="btn primary block" id="rv-save">Save decision</button></div>' + (others.length ? '<div class="faint" style="margin-top:8px">' + others.length + ' more page(s) waiting after this one.</div>' : '') + '</div>';
  }
  viewReview.wire = function (root) {
    wirePosts(root);
    root.querySelectorAll('[data-rv]').forEach(function (c) { c.onchange = function () { S.decide.d[c.dataset.rv] = c.checked ? 'approved' : 'rejected'; }; });
    var b = root.querySelector('#rv-save'); if (!b) return;
    b.onclick = function () {
      var d = S.decide.d, ids = Object.keys(d), yes = ids.filter(function (k) { return d[k] === 'approved'; }).length;
      confirmBox('Save this decision?', '<b>' + yes + '</b> of ' + ids.length + ' names will count for bonus. ' + (ids.length - yes) + ' will not count.', 'Save').then(function (ok) {
        if (!ok) return; b.disabled = true;
        api('review', {postId: S.decide.post, decisions: d, confirm: true}).then(function () {
          toast('Saved', yes + ' referral' + (yes === 1 ? '' : 's') + ' approved.'); S.decide = null;
          return refresh(true).then(function () { var nx = S.data.posts.filter(function (x) { return x.kind === 'referral' && x.status === 'pending'; }).pop(); location.hash = nx ? '#/review/' + nx.id : '#/board'; });
        }).catch(function (e) { b.disabled = false; toast('Not saved', errText(e)); });
      });
    };
  };

  /* ---------- snap a referral page ---------- */
  function viewSnap() {
    var d = S.draft;
    if (!d) return '<div class="card snap-hero"><div class="big-ico">📒</div><h2>Snap your referral page</h2><p class="muted">Take a photo of the filled referral list. The app reads the names, counts them for you, and covers phone numbers, ages, remarks and faces before your team sees it.</p>' +
      '<label class="btn gold block">📷 Take photo<input type="file" accept="image/*" capture="environment" hidden data-file></label><div style="height:8px"></div>' +
      '<label class="btn block">🖼 Choose from gallery<input type="file" accept="image/*" hidden data-file></label><div style="height:8px"></div>' +
      '<button class="btn block" id="sn-approach">🙋 I asked a client but got no names</button>' +
      '<ul class="steps faint" style="text-align:left;margin-top:16px"><li>✔ Lay the page flat, in good light, whole page in the photo.</li><li>✔ The original photo is not saved. Only the covered one is.</li><li>✔ Phone numbers, age and remarks auto-delete after 3 months. Names stay.</li></ul></div>';
    if (d.stage === 'busy') return '<div class="card snap-hero"><div class="spinner"></div><h2>' + esc(d.msg) + '</h2><ul class="steps muted">' + d.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';
    if (d.stage === 'failed') return '<div class="card"><h2>Could not read the photo</h2><div class="notice bad">' + esc(d.error) + '</div><div class="actions"><button class="btn primary" id="sn-retry">Try again</button><button class="btn" id="sn-manual">Type the names myself</button><button class="btn" id="sn-cancel">Cancel</button></div></div>';
    var rows = d.rows, n = rows.filter(function (r) { return r.name.trim().length >= 2; }).length, unclear = rows.filter(function (r) { return r.unclear; }).length;
    var html = '<div class="card"><h2>Check before posting</h2><div class="faint">Black boxes and 🙂 are hidden from the team. <b>Drag</b> on the photo to cover more, <b>tap</b> a box to uncover it.</div>' +
      '<div class="canvas-wrap" style="margin-top:10px"><canvas id="sn-canvas"></canvas></div>' +
      '<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px"><span class="faint">' + d.boxes.filter(function (b) { return !b.off && b.kind !== 'face'; }).length + ' private spots covered · ' + d.boxes.filter(function (b) { return !b.off && b.kind === 'face'; }).length + ' faces covered</span>' +
      '<button class="btn sm" id="sn-undo">Undo last box</button></div>' +
      (d.faceErr ? '<div class="notice warn">Face check could not run on this phone (' + esc(d.faceErr) + '). If there are faces, drag over them to cover.</div>' : '') +
      (d.manual ? '<div class="notice warn">Typed by hand: nothing was covered automatically. Drag over every phone number, age and remark before posting.</div>' : '') +
      (d.notes ? '<div class="notice info">AI note: ' + esc(d.notes) + '</div>' : '') + '</div>';
    html += '<div class="card"><div class="row"><h2 class="grow">Referrals found: ' + n + '</h2></div>' +
      (unclear ? '<div class="notice warn">' + unclear + ' name' + (unclear === 1 ? ' was' : 's were') + ' hard to read (yellow). Please fix the spelling.</div>' : '') +
      (!rows.length ? '<div class="notice warn">No names were found. Retake the photo, or add the names below.</div>' : '') +
      '<label class="field"><span>Referral given by (your client)</span><input id="sn-giver" value="' + esc(d.giver) + '" placeholder="Name at &quot;Your Name&quot;"></label>' +
      rows.map(function (r, i) {
        var priv = [r.age && 'Age ' + r.age, r.phone && r.phone, r.gender, r.remarks].filter(Boolean).join(' · ');
        return '<div class="ref-edit' + (r.unclear ? ' unclear' : '') + '"><div class="no">' + (i + 1) + '</div><div><input data-rn="' + i + '" value="' + esc(r.name) + '" placeholder="Name">' + (priv ? '<div class="priv">🔒 ' + esc(priv) + '</div>' : '') + '</div><button class="btn sm" data-rx="' + i + '" aria-label="Remove">✕</button></div>';
      }).join('') +
      '<div class="actions"><button class="btn sm" id="sn-add">+ Add a name</button></div><div class="faint" style="margin-top:6px">🔒 = only you and your leader see it, and it auto-deletes in 3 months.</div></div>';
    html += '<div class="card"><label class="check"><input type="checkbox" id="sn-ok"' + (d.ok ? ' checked' : '') + '><span>I checked the photo: no phone number, IC, age, remark, my client\'s own name or face can be seen.</span></label>' +
      '<button class="btn gold block" id="sn-post"' + (n && d.ok ? '' : ' disabled') + '>Post ' + n + ' referral' + (n === 1 ? '' : 's') + ' to the team</button>' +
      '<div class="actions"><button class="btn sm" id="sn-cancel">Cancel</button><label class="btn sm">Retake<input type="file" accept="image/*" capture="environment" hidden data-file></label></div></div>';
    return html;
  }
  viewSnap.wire = function (root) {
    root.querySelectorAll('[data-file]').forEach(function (inp) { inp.onchange = function () { if (inp.files[0]) startSnap(inp.files[0]); }; });
    var ap = root.querySelector('#sn-approach');
    if (ap) ap.onclick = function () {
      confirmBox('Log an approach?', 'You asked a client for referrals but got no names this time. It counts as an <b>Approach</b> on your bonus sheet (effort, not paid). Asking is the habit that wins.', 'Log it').then(function (y) {
        if (y) api('approach', {confirm: true}).then(function () { toast('Approach logged 🙋', 'Every ask builds the habit. Next one will say yes!'); return refresh(true); }).catch(function (e) { toast('Not saved', errText(e)); });
      });
    };
    var d = S.draft; if (!d) return;
    var q = function (s) { return root.querySelector(s); };
    if (q('#sn-cancel')) q('#sn-cancel').onclick = function () { S.draft = null; render(); };
    if (q('#sn-retry')) q('#sn-retry').onclick = function () { readPhoto(); };
    if (q('#sn-manual')) q('#sn-manual').onclick = function () { d.stage = 'review'; d.manual = true; d.rows = [{name: ''}]; render(); };
    if (d.stage !== 'review') return;
    var cv = q('#sn-canvas'); REDACT.render(d.canvas, d.boxes, cv); wireDraw(cv, d);
    q('#sn-undo').onclick = function () { for (var i = d.boxes.length - 1; i >= 0; i--) if (!d.boxes[i].off) { d.boxes[i].off = true; break; } render(); };
    q('#sn-giver').oninput = function (e) { d.giver = e.target.value; };
    root.querySelectorAll('[data-rn]').forEach(function (inp) { inp.oninput = function () { var r = d.rows[+inp.dataset.rn]; r.name = inp.value; r.unclear = /\?/.test(inp.value); updatePostBtn(); }; inp.onchange = function () { render(); }; });
    root.querySelectorAll('[data-rx]').forEach(function (b) { b.onclick = function () { d.rows.splice(+b.dataset.rx, 1); render(); }; });
    q('#sn-add').onclick = function () { d.rows.push({name: ''}); render(); var ins = root.ownerDocument.querySelectorAll('[data-rn]'); if (ins.length) ins[ins.length - 1].focus(); };
    q('#sn-ok').onchange = function (e) { d.ok = e.target.checked; updatePostBtn(); };
    q('#sn-post').onclick = postDraft;
    function updatePostBtn() { var n = d.rows.filter(function (r) { return r.name.trim().length >= 2; }).length, b = document.getElementById('sn-post'); b.disabled = !(n && d.ok); b.textContent = 'Post ' + n + ' referral' + (n === 1 ? '' : 's') + ' to the team'; }
  };
  function wireDraw(cv, d) {
    var start = null, box = null;
    var pt = function (e) { var r = cv.getBoundingClientRect(); return {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height}; };
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); start = pt(e); box = null; });
    cv.addEventListener('pointermove', function (e) {
      if (!start) return; var p = pt(e);
      if (!box && Math.abs(p.x - start.x) + Math.abs(p.y - start.y) < 0.02) return;
      if (!box) { box = {kind: 'manual'}; d.boxes.push(box); }
      box.x = Math.min(start.x, p.x); box.y = Math.min(start.y, p.y); box.w = Math.abs(p.x - start.x); box.h = Math.abs(p.y - start.y);
      REDACT.render(d.canvas, d.boxes, cv);
    });
    cv.addEventListener('pointerup', function (e) {
      if (!start) return; var p = pt(e);
      if (!box) { var i = REDACT.hit(d.boxes, p.x, p.y); if (i >= 0) { d.boxes[i].off = true; d.ok = false; } }
      start = null; box = null; render();
    });
  }
  function startSnap(file) {
    S.draft = {stage: 'busy', msg: 'Opening photo…', steps: [], boxes: [], rows: [], giver: '', ok: false};
    location.hash = '#/snap'; render();
    REDACT.loadImage(file).then(function (img) {
      S.draft.canvas = REDACT.toCanvas(img, 1600);
      readPhoto();
    }).catch(function (e) { S.draft.stage = 'failed'; S.draft.error = e.message; render(); });
  }
  function readPhoto() {
    var d = S.draft; d.stage = 'busy'; d.msg = 'Reading your referral page…'; d.steps = ['⏳ Finding names and counting referrals', '⏳ Finding phone numbers, ages, remarks', '⏳ Looking for faces']; render();
    var face = REDACT.faces(d.canvas).then(function (f) { d.steps[2] = '✔ Faces checked (' + f.length + ' found)'; render(); return f; })
      .catch(function (e) { d.faceErr = (e && e.message || 'not supported').slice(0, 60); d.steps[2] = '⚠ Face check not available'; render(); return []; });
    var ai = api('read', {image: REDACT.b64(d.canvas, 0.85)}).then(function (r) { d.steps[0] = '✔ ' + r.read.rows.length + ' names found'; d.steps[1] = '✔ ' + r.read.private.length + ' private spots found'; render(); return r.read; });
    Promise.all([ai, face]).then(function (res) {
      var r = res[0];
      d.rows = r.rows; d.giver = r.giver; d.notes = r.notes; d.manual = false;
      d.boxes = r.private.map(function (b) { return {kind: 'private', type: b.type, x: b.x, y: b.y, w: b.w, h: b.h}; })
        .concat(res[1]).concat(r.faces.map(function (b) { return {kind: 'face', x: b.x, y: b.y, w: b.w, h: b.h}; }));
      d.stage = 'review'; render();
    }).catch(function (e) { d.stage = 'failed'; d.error = errText(e); render(); });
  }
  function postDraft() {
    var d = S.draft, rows = d.rows.filter(function (r) { return r.name.trim().length >= 2; });
    confirmBox('Post ' + rows.length + ' referral' + (rows.length === 1 ? '' : 's') + '?', 'Your team will see your name, the client names and the covered photo. Phone numbers, ages and remarks stay private and auto-delete in 3 months.', 'Post it').then(function (y) {
      if (!y) return;
      var out = REDACT.render(d.canvas, d.boxes), small = REDACT.toCanvas(out, 1280);
      d.stage = 'busy'; d.msg = 'Posting…'; d.steps = []; render();
      api('post', {giver: d.giver, rows: rows, photo: REDACT.b64(small, 0.8), covered: true}).then(function (r) {
        S.photos[r.post.id] = null; S.draft = null;
        return refresh(true).then(function () { showCheer(r); });
      }).catch(function (e) { d.stage = 'review'; render(); toast('Not posted', errText(e)); });
    });
  }
  function showCheer(r) {
    if (location.hash !== '#/feed') { route.keepModal = true; location.hash = '#/feed'; }
    if (S.sounds) SOUND.cheer(); confetti();
    var p = S.data.posts.filter(function (x) { return x.id === r.post.id; })[0] || r.post;
    modal('<div class="cheer"><div class="num">+' + r.post.count + '</div><div class="faint">referral' + (r.post.count === 1 ? '' : 's') + ' added · ' + r.monthTotal + ' this month</div>' +
      r.cheer.map(function (c) { return '<div class="msg-c">' + esc(c) + '</div>'; }).join('') +
      (r.milestone ? '<div class="notice good">🏆 Milestone: ' + r.milestone + ' referrals this month! The team has been told.</div>' : '') +
      '<div class="faint">Waiting for leader approval to count for bonus.</div></div><div class="btns"><button class="btn" data-n>Done</button><button class="btn wa" data-y>Share to WhatsApp</button></div>', function (m, close) {
      m.querySelector('[data-n]').onclick = close;
      m.querySelector('[data-y]').onclick = function () { close(); shareWhatsApp(p); };
    });
  }
  function confetti() {
    var c = document.createElement('canvas'); c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    var g = c.getContext('2d'), bits = [], cols = ['#E8B04B', '#3D55E0', '#25D366', '#E5383B', '#ffffff'];
    for (var i = 0; i < 120; i++) bits.push({x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 3, r: Math.random() * 6, c: cols[i % cols.length], a: Math.random() * 6});
    var t0 = performance.now();
    (function f(t) { g.clearRect(0, 0, c.width, c.height); bits.forEach(function (b) { b.x += b.vx; b.y += b.vy; b.a += .1; g.fillStyle = b.c; g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillRect(-4, -2, 8, 4); g.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(f); else c.remove(); })(t0);
  }

  /* ---------- follow-up steps: appointment & closed case ---------- */
  function curMonth() { return monthKey(new Date().toISOString()); }
  function shiftMonth(mk, n) { var p = mk.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1)); return d.toISOString().slice(0, 7); }
  function monthName(mk) { var p = mk.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function daysLeftInMonth() { var n = myt(new Date().toISOString()), last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate(); return last - n.getUTCDate(); }
  function dayOfMonth() { return myt(new Date().toISOString()).getUTCDate(); }
  var STEP_TXT = {pending: 'waiting approval', approved: 'approved', rejected: 'not approved'};
  function stepPill(v) { return v ? '<span class="pill ' + (v === 'approved' ? 'approved' : v === 'rejected' ? 'rejected' : 'pending') + '">' + STEP_TXT[v] + '</span>' : ''; }
  function leadRow(r) {
    if (r.status === 'rejected') return '<div class="ref-edit" style="grid-template-columns:1fr"><div><b class="faint" style="text-decoration:line-through">' + esc(r.name) + '</b> <span class="faint">not counted</span></div></div>';
    var me = S.data.me, mine = r.agentId === me.id || me.leader;
    var btn = function (k, label) {
      var v = r[k];
      if (!mine) return v ? '<span class="chip">' + label + ' ' + stepPill(v) + '</span>' : '';
      if (!v || v === 'rejected') return '<button class="btn sm" data-step="' + k + '" data-ref="' + r.id + '"' + (k === 'close' && !(r.appt === 'pending' || r.appt === 'approved') ? ' disabled' : '') + '>' + label + '</button>' + (v === 'rejected' ? ' ' + stepPill(v) : '');
      return '<span class="chip">✓ ' + label + ' ' + stepPill(v) + (v === 'pending' || me.leader ? ' <a href="#" data-undo="' + k + '" data-ref="' + r.id + '" class="faint">undo</a>' : '') + '</span>';
    };
    return '<div class="ref-edit" style="grid-template-columns:1fr"><div><b>' + esc(r.name) + '</b> <span class="faint">' + (r.status === 'pending' ? 'lead waiting approval · ' : '') + ago(r.created) + '</span>' +
      '<div class="actions" style="margin-top:6px">' + btn('appt', '☕ Appointment done') + btn('close', '🎯 Closed case') + '</div></div></div>';
  }
  function wireLeadRows(root) {
    root.querySelectorAll('[data-step]').forEach(function (b) {
      b.onclick = function () {
        var r = S.data.refs.filter(function (x) { return x.id === b.dataset.ref; })[0], k = b.dataset.step;
        var what = k === 'appt' ? 'had an appointment with' : 'closed a case with';
        confirmBox(k === 'appt' ? 'Appointment done?' : 'Closed a case?', 'You ' + what + ' <b>' + esc(r.name) + '</b>. ' + (S.data.me.leader ? 'It counts right away.' : 'Your leader will approve it for the RM ' + S.data.rates[k] + ' bonus.'), 'Yes, mark it').then(function (y) {
          if (!y) return; b.disabled = true;
          api('step', {refId: r.id, step: k}).then(function () { if (S.sounds) SOUND.cheer(); toast(k === 'appt' ? 'Appointment marked ☕' : 'Case closed 🎯', k === 'close' ? 'That is what referrals are for. Well done!' : 'One step closer. Keep going!'); return refresh(true); })
            .catch(function (e) { b.disabled = false; toast('Not saved', errText(e)); });
        });
      };
    });
    root.querySelectorAll('[data-undo]').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        confirmBox('Undo this?', 'Remove the ' + (a.dataset.undo === 'appt' ? 'appointment' : 'closed case') + ' mark?', 'Undo', true).then(function (y) {
          if (y) api('step', {refId: a.dataset.ref, step: a.dataset.undo, done: false}).then(function () { return refresh(true); }).catch(function (er) { toast('Not changed', errText(er)); });
        });
      };
    });
  }
  function myOpenLeads() {   // my counted leads with a next step still to do
    var me = S.data.me.id;
    return S.data.refs.filter(function (r) { return r.agentId === me && r.status !== 'rejected' && (!r.appt || r.appt === 'rejected' || ((r.appt === 'approved' || r.appt === 'pending') && (!r.close || r.close === 'rejected'))); });
  }
  function viewLeads() {
    var me = S.data.me.id, all = S.data.refs.filter(function (r) { return r.agentId === me; }).sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    var needAppt = all.filter(function (r) { return r.status !== 'rejected' && (!r.appt || r.appt === 'rejected'); });
    var needClose = all.filter(function (r) { return r.status !== 'rejected' && (r.appt === 'pending' || r.appt === 'approved') && (!r.close || r.close === 'rejected'); });
    var done = all.filter(function (r) { return r.close === 'pending' || r.close === 'approved' || r.status === 'rejected'; });
    var sec = function (t, sub, list) { return list.length ? '<div class="card"><h2>' + t + ' (' + list.length + ')</h2><div class="faint">' + sub + '</div>' + list.slice(0, 60).map(leadRow).join('') + '</div>' : ''; };
    return '<div style="margin-bottom:10px"><a href="#/me">← Me</a></div>' + remindersHtml() +
      (all.length ? '' : '<div class="empty">No leads yet. Snap a referral page first.</div>') +
      sec('Waiting for an appointment', 'Met them? Tap ☕ (RM ' + S.data.rates.appt + ').', needAppt) +
      sec('Met, not closed yet', 'Closed a case? Tap 🎯 (RM ' + S.data.rates.close + ').', needClose) +
      sec('Done', 'Closed cases and leads not counted.', done);
  }
  viewLeads.wire = wireLeadRows;

  function pendingSteps() { return S.data.refs.filter(function (r) { return r.appt === 'pending' || r.close === 'pending'; }); }
  function viewSteps() {
    if (!S.data.me.leader) return '<div class="empty">Only the leader can approve.</div>';
    var list = pendingSteps();
    S.stepDec = S.stepDec || {};
    list.forEach(function (r) { if (!S.stepDec[r.id]) S.stepDec[r.id] = {appt: r.appt === 'pending' ? 'approved' : '', close: r.close === 'pending' ? 'approved' : ''}; });
    var row = function (r) {
      var box = function (k, label) { return r[k] === 'pending' ? '<label class="check" style="padding:4px 0"><input type="checkbox" data-sd="' + r.id + '|' + k + '"' + (S.stepDec[r.id][k] === 'approved' ? ' checked' : '') + '><span>' + label + ' <span class="faint">' + ago(r[k + 'At']) + '</span></span></label>' : ''; };
      return '<div class="ref-edit" style="grid-template-columns:30px 1fr">' + avatar(r.agentId, true) + '<div><b>' + esc(agent(r.agentId).name) + '</b> → ' + esc(r.name) + (r.phone ? ' <span class="faint">' + esc(r.phone) + '</span>' : '') +
        box('appt', '☕ Appointment (RM ' + S.data.rates.appt + ')') + box('close', '🎯 Closed case (RM ' + S.data.rates.close + ')') + '</div></div>';
    };
    return '<div style="margin-bottom:10px"><a href="#/board">← Board</a></div><div class="card"><h2>Appointment & close updates</h2>' +
      (list.length ? '<div class="notice info">Ticked = approved for bonus. Untick anything that did not really happen.</div>' + list.map(row).join('') + '<button class="btn primary block" id="sd-save" style="margin-top:10px">Save decisions</button>' : '<div class="empty">Nothing waiting. 👍</div>') + '</div>';
  }
  viewSteps.wire = function (root) {
    root.querySelectorAll('[data-sd]').forEach(function (c) { c.onchange = function () { var p = c.dataset.sd.split('|'); S.stepDec[p[0]][p[1]] = c.checked ? 'approved' : 'rejected'; }; });
    var b = root.querySelector('#sd-save'); if (!b) return;
    b.onclick = function () {
      var dec = {}, yes = 0, no = 0;
      pendingSteps().forEach(function (r) { var d = S.stepDec[r.id]; dec[r.id] = {}; ['appt', 'close'].forEach(function (k) { if (r[k] === 'pending') { dec[r.id][k] = d[k] || 'approved'; if (dec[r.id][k] === 'approved') yes++; else no++; } }); });
      confirmBox('Save these decisions?', '<b>' + yes + '</b> update' + (yes === 1 ? '' : 's') + ' approved for bonus, ' + no + ' not approved.', 'Save').then(function (y) {
        if (!y) return; b.disabled = true;
        api('stepReview', {decisions: dec, confirm: true}).then(function () { S.stepDec = {}; toast('Saved', yes + ' approved.'); return refresh(true); }).then(function () { location.hash = '#/board'; })
          .catch(function (e) { b.disabled = false; toast('Not saved', errText(e)); });
      });
    };
  };

  /* ---------- analysis: approach -> lead -> appointment -> close ---------- */
  function funnelHtml(range) {
    var inR = function (iso) { return iso && iso >= range.from && iso < range.to; };
    var ap = S.data.posts.filter(function (p) { return (p.kind === 'approach' || (p.kind === 'referral' && p.status !== 'rejected')) && inR(p.created); }).length;
    var refs = S.data.refs.filter(function (r) { return r.status !== 'rejected'; });
    var leads = refs.filter(function (r) { return inR(r.created); }).length;
    var appt = refs.filter(function (r) { return (r.appt === 'approved' || r.appt === 'pending') && inR(r.apptAt); }).length;
    var close = refs.filter(function (r) { return (r.close === 'approved' || r.close === 'pending') && inR(r.closeAt); }).length;
    var max = Math.max(1, ap, leads, appt, close), pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '–'; };
    var bar = function (label, n, note) { return '<div class="lb-row" style="grid-template-columns:1fr"><div><div class="lb-top"><span>' + label + '</span><b>' + n + '</b></div><div class="lb-bar"><span style="width:' + Math.max(n ? 2 : 0, n / max * 100) + '%;background:var(--bar)"></span>' + (!n ? '<span style="width:100%;background:var(--grid)"></span>' : '') + '</div>' + (note ? '<div class="faint">' + note + '</div>' : '') + '</div></div>'; };
    return '<div class="card"><h2>Referral funnel · ' + esc(range.label) + '</h2><h3>Approach → Leads → Appointment → Close</h3>' +
      bar('Approaches (clients asked)', ap, '') + bar('Leads obtained', leads, (ap ? (leads / ap).toFixed(1) : '–') + ' leads per approach') +
      bar('Appointments', appt, pct(appt, leads) + ' of leads met') + bar('Closed cases', close, pct(close, appt) + ' of appointments closed') +
      '<div class="faint">Includes updates still waiting approval.</div></div>';
  }

  /* ---------- monthly bonus statement (same columns as the leader's sheet) ---------- */
  function viewBonus() {
    var me = S.data.me, mk = /^\d{4}-\d{2}$/.test(route.arg) ? route.arg : curMonth(), R = S.data.rates;
    var rows = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, mk, R);
    if (!me.leader) rows = rows.filter(function (x) { return x.id === me.id; });
    else rows.sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
    var paid = (S.data.paid || {})[mk], sum = function (k) { return rows.reduce(function (s, x) { return s + x[k]; }, 0); };
    var months = []; for (var i = 0; i < 12; i++) months.push(shiftMonth(curMonth(), -i));
    var w = function (n) { return n ? '<div class="faint">+' + n + ' waiting</div>' : ''; };
    var html = '<div style="margin-bottom:10px"><a href="#/board">← Board</a></div><div class="card"><div class="row"><h2 class="grow">Referral bonus</h2><select id="bn-month" style="border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:7px">' +
      months.map(function (m) { return '<option value="' + m + '"' + (m === mk ? ' selected' : '') + '>' + monthName(m) + '</option>'; }).join('') + '</select></div>' +
      '<div class="faint">Leads RM' + R.lead + ' each · Appointment RM' + R.appt + ' · Close RM' + R.close + '. Only approved items are paid; "waiting" needs leader approval first.</div>' +
      (paid ? '<div class="notice good">✅ Marked paid on ' + dayLabel(paid.at) + (me.leader ? ' by ' + esc(paid.by) + ': RM' + paid.total.toLocaleString() : ': RM' + paid.mine.toLocaleString() + ' to you') + '</div>' : (mk < curMonth() ? '<div class="notice warn">Not marked paid yet.</div>' : '<div class="notice info">Month in progress · ' + daysLeftInMonth() + ' day' + (daysLeftInMonth() === 1 ? '' : 's') + ' left to update appointments and closes.</div>')) +
      '<div class="scroll-x"><table class="data"><tr><th>Name</th><th class="n">Approach</th><th class="n">Leads<br>(RM' + R.lead + ')</th><th class="n">Appt<br>(RM' + R.appt + ')</th><th class="n">Close<br>(RM' + R.close + ')</th><th class="n">Total</th></tr>' +
      rows.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + (x.approach || '') + '</td><td class="n">' + (x.leads || '') + w(x.leadsWaiting) + '</td><td class="n">' + (x.appt || '') + w(x.apptWaiting) + '</td><td class="n">' + (x.close || '') + w(x.closeWaiting) + '</td><td class="n"><b>RM' + x.total.toFixed(2) + '</b></td></tr>'; }).join('') +
      (me.leader ? '<tr><td><b>Total</b></td><td class="n"><b>' + sum('approach') + '</b></td><td class="n"><b>' + sum('leads') + '</b></td><td class="n"><b>' + sum('appt') + '</b></td><td class="n"><b>' + sum('close') + '</b></td><td class="n"><b>RM' + sum('total').toFixed(2) + '</b></td></tr>' : '') +
      '</table></div>';
    if (paid && me.leader && paid.total !== sum('total')) html += '<div class="notice warn">Numbers changed after you marked it paid (paid RM' + paid.total + ', now RM' + sum('total') + '). Check late approvals.</div>';
    if (me.leader) html += '<div class="actions"><button class="btn sm" id="bn-csv">Download spreadsheet (CSV)</button>' +
      (paid ? '<button class="btn sm danger" id="bn-unpaid">Undo paid</button>' : '<button class="btn sm primary" id="bn-paid">Mark ' + monthName(mk) + ' as paid</button>') +
      '<button class="btn sm wa" id="bn-remind">Remind team on WhatsApp</button></div>';
    return html + '</div>';
  }
  viewBonus.wire = function (root) {
    var mk = /^\d{4}-\d{2}$/.test(route.arg) ? route.arg : curMonth(), q = function (s) { return root.querySelector(s); };
    q('#bn-month').onchange = function (e) { location.hash = '#/bonus/' + e.target.value; };
    if (q('#bn-csv')) q('#bn-csv').onclick = function () {
      var R = S.data.rates, rows = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, mk, R);
      var lines = [['Name', 'Approach', 'Leads Obtain (RM' + R.lead + ')', 'Successful Appointment (RM' + R.appt + ')', 'Close Case (RM' + R.close + ')', 'Total (RM)', 'Waiting approval'].join(',')]
        .concat(rows.map(function (x) { return ['"' + x.name.replace(/"/g, '""') + '"', x.approach, x.leads, x.appt, x.close, x.total.toFixed(2), x.leadsWaiting + x.apptWaiting + x.closeWaiting].join(','); }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], {type: 'text/csv'})); a.download = 'referral-bonus-' + mk + '.csv'; a.click();
    };
    if (q('#bn-paid')) q('#bn-paid').onclick = function () {
      var rows = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, mk, S.data.rates), tot = rows.reduce(function (s, x) { return s + x.total; }, 0), n = rows.filter(function (x) { return x.total; }).length;
      var waiting = rows.reduce(function (s, x) { return s + x.leadsWaiting + x.apptWaiting + x.closeWaiting; }, 0);
      confirmBox('Mark ' + monthName(mk) + ' as paid?', 'RM' + tot.toFixed(2) + ' to ' + n + ' agent' + (n === 1 ? '' : 's') + '. Each agent will see their paid amount.' + (waiting ? '<br><b>' + waiting + ' item(s) are still waiting approval</b> and are not included.' : ''), 'Mark paid').then(function (y) {
        if (y) api('markPaid', {month: mk, confirm: true}).then(function () { toast('Marked paid', monthName(mk)); return refresh(true); }).catch(function (e) { toast('Not saved', errText(e)); });
      });
    };
    if (q('#bn-unpaid')) q('#bn-unpaid').onclick = function () {
      confirmBox('Undo paid?', monthName(mk) + ' will show as not paid again.', 'Undo', true).then(function (y) { if (y) api('markPaid', {month: mk, confirm: true, undo: true}).then(function () { return refresh(true); }).catch(function (e) { toast('Not saved', errText(e)); }); });
    };
    if (q('#bn-remind')) q('#bn-remind').onclick = function () { remindWhatsApp(); };
  };
  function remindWhatsApp() {
    var cm = curMonth(), rows = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, cm, S.data.rates);
    var none = rows.filter(function (x) { return !x.approach; }).map(function (x) { return x.name; });
    var left = daysLeftInMonth(), link = CFG.appUrl || location.href.split('#')[0];
    var text = ['📣 *REDEFINE Referral Bonus · ' + monthName(cm) + '*', '',
      left <= 5 ? '⏰ ' + (left ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'Last day today') + ' to snap referral pages and update appointments & closes!' : 'Keep your referral board updated this month 💪',
      '💰 Leads RM' + S.data.rates.lead + ' each · Appointment RM' + S.data.rates.appt + ' · Close RM' + S.data.rates.close, '',
      none.length ? '👀 Not on the board yet this month: ' + none.join(', ') : '🔥 Everyone is on the board this month!', '',
      '👉 ' + link].join('\n');
    modal('<h2>Remind team on WhatsApp</h2><div class="faint">Edit if you like. WhatsApp will ask you to pick the group.</div><textarea id="wa-text">' + esc(text) + '</textarea><div class="btns"><button class="btn" data-n>Cancel</button><button class="btn wa" data-y>Open WhatsApp</button></div>', function (m, close) {
      m.querySelector('[data-n]').onclick = close;
      m.querySelector('[data-y]').onclick = function () { var t = m.querySelector('#wa-text').value; close(); window.location.href = 'https://wa.me/?text=' + encodeURIComponent(t); };
    });
  }

  /* ---------- reminders (shown on Feed and My leads; pop up once a day) ---------- */
  function reminders() {
    if (!S.data) return [];
    var me = S.data.me, out = [], cm = curMonth(), left = daysLeftInMonth(), dom = dayOfMonth();
    var mineThisMonth = S.data.posts.some(function (p) { return p.agentId === me.id && (p.kind === 'approach' || p.kind === 'referral') && monthKey(p.created) === cm; });
    var stale = myOpenLeads().filter(function (r) { return (Date.now() - new Date(r.created).getTime()) > 7 * 864e5 && (!r.appt || r.appt === 'rejected'); });
    if (left <= 3) out.push({id: 'monthend', icon: '⏰', text: (left ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'Last day') + ' this bonus month. Snap your pages and update appointments & closes today.', go: '#/leads'});
    if (!mineThisMonth && dom >= 5) out.push({id: 'none', icon: '📒', text: 'No referral page from you this month yet. Ask one happy client for names today.', go: '#/snap'});
    if (stale.length) out.push({id: 'stale', icon: '☕', text: stale.length + ' lead' + (stale.length === 1 ? ' has' : 's have') + ' waited over a week. Met them? Tap ☕ Appointment done.', go: '#/leads'});
    var lm = shiftMonth(cm, -1), paid = (S.data.paid || {})[lm];
    if (dom <= 7 && !me.leader) {
      var mine = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, lm, S.data.rates).filter(function (x) { return x.id === me.id; })[0];
      if (mine && mine.total) out.push({id: 'lastmonth', icon: '💰', text: monthName(lm) + ' referral bonus: RM' + mine.total.toFixed(2) + (paid ? ' · paid ✅' : ' · being processed'), go: '#/bonus/' + lm});
    }
    if (me.leader) {
      var pages = S.data.posts.filter(function (p) { return p.kind === 'referral' && p.status === 'pending'; }), steps = pendingSteps().length;
      if (pages.length || steps) out.push({id: 'approve', icon: '✅', text: (pages.length ? pages.length + ' page' + (pages.length === 1 ? '' : 's') : '') + (pages.length && steps ? ' and ' : '') + (steps ? steps + ' appointment/close update' + (steps === 1 ? '' : 's') : '') + ' waiting for your approval.', go: pages.length ? '#/review/' + pages[pages.length - 1].id : '#/steps'});
      if (!paid && dom <= 10) {
        var t = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, lm, S.data.rates), tot = t.reduce(function (s, x) { return s + x.total; }, 0);
        if (tot) out.push({id: 'pay', icon: '💰', text: monthName(lm) + ' bonus is ready: RM' + tot.toFixed(2) + ' for ' + t.filter(function (x) { return x.total; }).length + ' agents. Pay, then mark as paid.', go: '#/bonus/' + lm});
      }
      if (left <= 5) out.push({id: 'remind', icon: '📣', text: 'Month closes in ' + left + ' day' + (left === 1 ? '' : 's') + '. Send the team a WhatsApp reminder.', go: '#/bonus'});
    }
    return out;
  }
  function remindersHtml() {
    return reminders().map(function (r) { return '<a class="card row" href="' + r.go + '" style="text-decoration:none;color:inherit;border-color:var(--gold);padding:11px 14px"><div style="font-size:22px">' + r.icon + '</div><div class="grow" style="font-size:14px">' + esc(r.text) + '</div><span class="faint">›</span></a>'; }).join('');
  }
  function dailyReminderPopups() {
    var today = myt(new Date().toISOString()).toISOString().slice(0, 10), shown = LS.get('remShown', {}), any = false;
    reminders().forEach(function (r) {
      if (shown[r.id] === today) return; shown[r.id] = today; any = true;
      toast('Reminder', r.text, null, r.go); notifyPhone('REDEFINE Referrals reminder', r.text, r.go);
    });
    if (any) LS.set('remShown', shown);
  }

  /* ---------- team chat ---------- */
  function viewChat() {
    var me = S.data.me.id, list = cmtsOf('team'), out = '', lastDay = '';
    list.slice(-200).forEach(function (c) {
      var dl = dayLabel(c.created); if (dl !== lastDay) { out += '<div class="chat-day">' + dl + '</div>'; lastDay = dl; }
      out += '<div class="msg' + (c.agentId === me ? ' me' : '') + '">' + (c.agentId === me ? '' : '<div class="who" style="color:' + avColor(c.agentId) + '">' + esc(agent(c.agentId).name) + '</div>') + esc(c.text) + '<div class="t">' + hhmm(c.created) + '</div></div>';
    });
    return '<div class="chat">' + (out || '<div class="empty">Team chat. Say hi, share tips, ask for help.</div>') + '</div>' +
      '<div class="composer"><div class="wrap"><input id="ch-in" placeholder="Message the team" maxlength="1000"><button class="btn primary" id="ch-send">Send</button></div></div>';
  }
  viewChat.wire = function (root) {
    var inp = document.getElementById('ch-in'), b = document.getElementById('ch-send');
    var send = function () { var t = inp.value.trim(); if (!t) return; b.disabled = true; inp.value = ''; sendComment('team', t).finally(function () { b.disabled = false; var i = document.getElementById('ch-in'); if (i) i.focus(); }); };
    b.onclick = send; inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  };

  /* ---------- me ---------- */
  function viewMe() {
    var me = S.data.me, mine = S.data.refs.filter(function (r) { return r.agentId === me.id && r.status !== 'rejected'; });
    var mk = monthKey(new Date().toISOString()), month = mine.filter(function (r) { return monthKey(r.created) === mk; });
    var bonus = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, mk, S.data.rates).filter(function (x) { return x.id === me.id; })[0] || {total: 0};
    var open = myOpenLeads().length, R = S.data.rates;
    var notif = !('Notification' in window) ? 'Not supported here. On iPhone: Share → Add to Home Screen first.' : Notification.permission === 'granted' ? 'On' : Notification.permission === 'denied' ? 'Blocked in phone settings' : '';
    var html = '<div class="card"><div class="row">' + avatar(me.id) + '<div class="grow"><div class="name">' + esc(me.name) + '</div><div class="faint">' + (me.leader ? 'Leader' : 'Agent') + ' · REDEFINE</div><div class="faint">🔒 Stays signed in on this phone</div></div></div>' +
      '<div class="tiles" style="margin:12px 0 0"><div class="tile"><div class="k">This month</div><div class="v">' + month.length + '</div></div><a class="tile" href="#/bonus" style="text-decoration:none;color:inherit"><div class="k">Bonus this month</div><div class="v">RM' + bonus.total + '</div><div class="s">approved so far ›</div></a></div>' +
      '<a class="btn block" href="#/leads" style="margin-top:10px">📋 My leads' + (open ? ' · ' + open + ' to follow up' : '') + '</a></div>';
    html += '<div class="card"><h2>Settings</h2>' +
      '<label class="check"><input type="checkbox" id="me-music"' + (S.music ? ' checked' : '') + '><span>Team song ♪ (转介绍) · plays when the app opens</span></label>' +
      '<label class="check"><input type="checkbox" id="me-sound"' + (S.sounds ? ' checked' : '') + '><span>Sound for new messages and referrals</span></label>' +
      '<div class="row" style="padding:8px 0"><div class="grow">Phone pop-up alerts<div class="faint">' + (notif || 'Shows alerts while the app is open in the background') + '</div></div>' + (!notif ? '<button class="btn sm" id="me-notif">Turn on</button>' : '') + '</div>' +
      '<div class="faint">Tip: install the app. iPhone: Safari → Share → Add to Home Screen. Android: Chrome menu → Add to Home screen.</div></div>';
    if (me.leader) {
      html += '<div class="card"><h2>Leader settings · bonus rates (RM)</h2><div class="tiles" style="grid-template-columns:1fr 1fr 1fr;margin:8px 0">' +
        [['lead', 'Per lead'], ['appt', 'Per appointment'], ['close', 'Per close']].map(function (x) { return '<label class="field" style="margin:0"><span>' + x[1] + '</span><input data-rate="' + x[0] + '" inputmode="decimal" value="' + R[x[0]] + '"></label>'; }).join('') +
        '</div><button class="btn sm primary" id="me-rate-save">Save rates</button><span class="faint"> Approach is counted, not paid.</span>' +
        '<h3 style="margin-top:16px">Team members (' + S.data.agents.length + ')</h3>' + S.data.agents.map(function (a) { return '<div class="row" style="padding:5px 0">' + avatar(a.id, true) + '<div class="grow">' + esc(a.name) + (a.role === 'leader' ? ' <span class="faint">leader</span>' : '') + '</div>' + (a.id !== me.id ? '<button class="btn sm danger" data-rm="' + a.id + '">Remove</button>' : '') + '</div>'; }).join('') + '</div>';
    }
    html += '<div class="card"><h2>Privacy rules</h2><ul class="steps muted"><li>📷 The original photo is read once by AI and never saved. Only the covered photo is kept.</li><li>👀 Team sees: agent name, client names, count, covered photo, comments.</li><li>🔒 Only the agent and leader see age, phone, gender and remarks.</li><li>🗑 After 3 months, phone, age, gender, remarks, the referrer\'s name and the photo are deleted automatically. The referred names stay.</li><li>📤 WhatsApp shares never include client names or numbers.</li></ul></div>' +
      '<div style="text-align:center;margin:26px 0 8px"><button id="me-out" style="background:none;border:0;color:var(--faint);font-size:12.5px;text-decoration:underline">Sign out of this phone</button></div>';
    return html;
  }
  viewMe.wire = function (root) {
    var q = function (s) { return root.querySelector(s); };
    q('#me-out').onclick = function () {
      confirmBox('Sign out of this phone?', 'You normally never need to. The app stays signed in like WhatsApp.<br>To come back you will need the <b>team code</b> and <b>your PIN</b>.', 'Sign out', true).then(function (y) { if (y) signOut(); });
    };
    q('#me-music').onchange = function (e) { S.music = e.target.checked; LS.set('musicOn', S.music); if (S.music) SOUND.startMusic(); else SOUND.stopMusic(); render(); };
    q('#me-sound').onchange = function (e) { S.sounds = e.target.checked; LS.set('sounds', S.sounds); if (S.sounds) SOUND.ding(); };
    if (q('#me-notif')) q('#me-notif').onclick = function () { Notification.requestPermission().then(function () { render(); startPolling(); }); };
    if (q('#me-rate-save')) q('#me-rate-save').onclick = function () {
      var v = {}; root.querySelectorAll('[data-rate]').forEach(function (i) { v[i.dataset.rate] = i.value.trim(); });
      confirmBox('Change bonus rates?', 'Lead RM' + esc(v.lead) + ' · Appointment RM' + esc(v.appt) + ' · Close RM' + esc(v.close) + '.<br>This also changes the totals of months not yet marked paid.', 'Save').then(function (y) {
        if (y) api('settings', {rates: v, confirm: true}).then(function () { toast('Saved', 'Bonus rates updated.'); return refresh(true); }).catch(function (e) { toast('Not saved', errText(e)); });
      });
    };
    root.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function () {
        var a = agent(b.dataset.rm);
        confirmBox('Remove ' + a.name + '?', 'They can no longer sign in. Their past referrals stay on the board.', 'Remove', true).then(function (y) {
          if (y) api('removeAgent', {agentId: a.id, confirm: true}).then(function () { toast('Removed', a.name + ' was removed.'); return refresh(true); }).catch(function (e) { toast('Not removed', errText(e)); });
        });
      };
    });
  };

  /* ---------- start ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  function start() {
    keepStorage(); loadCache();
    if (S.data) route(); else render();   // open instantly with what was saved on this phone
    refresh(!!S.data).then(function () { startPolling(); route(); });
  }
  if (S.auth && !S.auth.token && S.auth.code) {   // phone signed in before device keys: switch it over quietly
    render();
    api('upgrade', {device: deviceName()}).then(function (r) { S.auth = {token: r.token, name: S.auth.name}; LS.set('auth', S.auth); start(); })
      .catch(function (e) { if (/^(wrong_pin|wrong_code|removed|signed_out)$/.test(e.message)) signOut(true, e.message); else start(); });
  } else if (S.auth) start(); else route();
})();
