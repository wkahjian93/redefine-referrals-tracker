/* REDEFINE Prospecting (was REDEFINE Referrals Tracker) - phone app */
(function () {
  'use strict';
  var CFG = window.RRT_CONFIG || {};
  var $app = document.getElementById('app');
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('rrt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('rrt.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('rrt.' + k); } catch (e) {} }
  };
  var S = {auth: LS.get('auth', null), data: null, ver: 0, seen: LS.get('seen', {}), unread: {feed: 0},
    music: LS.get('musicOn', true), /* team song plays by default; only a manual "off" is remembered */ sounds: LS.get('sounds', true), photos: {}, period: 'month', draft: null, polling: null};

  var ERR = {
    wrong_code: 'That team code is not right. Ask your leader for it.', wrong_pin: 'Wrong PIN for this name.', pin_4_digits: 'PIN must be 4 to 6 digits.',
    name_needed: 'Please type your name.', too_many_tries: 'Too many wrong tries. Please wait 15 minutes.', removed: 'This name was removed from the team. Talk to your leader.',
    server_not_set_up: 'The team server is not set up yet.', daily_limit: 'Daily photo limit reached. Try again tomorrow.', bad_photo: 'This photo could not be sent. Please retake it.',
    no_api_key: 'Photo reading is not switched on yet (leader: add the AI key).', bad_api_key: 'The AI key on the server is not working.', no_credit: 'The AI account has no credit left.',
    rate_limited: 'The AI is busy. Try again in a minute.', ai_unavailable: 'The AI could not be reached. Try again, or type the names yourself.', ai_bad_reply: 'The AI reply was unreadable. Try again, or type the names yourself.',
    no_names: 'There are no names to post.', location_needed: 'Please type the roadshow location.', selfie_needed: 'Please take a selfie at the roadshow as proof.', selfie_missing: 'Waiting for the booth selfie. Approve after the agent adds it.', no_owner_email: 'No owner email is set on the server yet.', privacy_not_confirmed: 'Please tick the privacy check first.', photo_gone: 'This photo was auto-deleted (older than 3 months).',
    leader_only: 'Only the leader can do this.', not_yours: 'You can only change your own posts.', approved_ask_leader: 'This page is already approved. Ask your leader to remove it.',
    not_found: 'This item no longer exists.', appointment_first: 'Mark the appointment first, then the close.', already_marked: 'Already marked.',
    lead_not_counted: 'This lead was not counted, so it has no steps.', undo_close_first: 'Undo the close first.', undo_appt_first: 'Undo the appointment first.', bad_rate: 'Rates must be numbers (RM).', bad_time: 'Pick a date and time.', bad_link: 'That link code is not valid any more. Make a new one.', network: 'No connection. Check your internet and try again.', server_error: 'Server problem. Please try again.'
  };
  Object.assign(ERR, {
    login_failed: 'Please sign in again. 请重新登入。', wrong_old: 'That old name or old PIN is not right. Ask your leader to link you. 旧名字或旧 PIN 不对。',
    name_in_use: 'Your name is already on the team. Choose “I used Prospecting before”. 已有你的名字，请选“我以前用过”。',
    already_linked: 'That account is already linked to another login. Ask your leader. 这个账号已被连接。', not_linked_yet: 'Choose old account or new. 请选择。',
    use_login: 'New members join with their REDEFINE login. 新同事请用 REDEFINE 登入。', no_login_match: 'No login account has this phone number. Check the number.',
    no_match: 'Phone, email or PIN is not right. 资料不对，请再试一次。', wrong: 'Wrong PIN or code. 密码或验证码不对。',
    code_expired: 'This code has expired. Ask your leader for a new code. 验证码已过期，请向领导要新的。', locked: 'Too many tries. Wait 15 minutes. 试太多次了，请等 15 分钟。',
    pin_format: 'PIN must be 6 digits. PIN 必须是 6 位数。', pin_too_simple: 'That PIN is too easy to guess. Choose another. PIN 太容易猜，请换一个。', offline: 'No connection. Check your internet. 没有网络。'
  });
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
  // choose a new PIN: forced after the leader resets it (temporary PIN), or by choice from Me
  function askNewPin(forced) {
    if (S.pinOpen && document.getElementById('np1')) return; S.pinOpen = true;
    modal('<h2>' + (forced ? '🔑 Choose your own PIN' : '🔑 Change my PIN') + '</h2><div class="muted">' + (forced ? 'You signed in with a temporary PIN from your leader. Choose your own PIN now (4–6 digits) and remember it.' : 'Choose a new PIN (4–6 digits). You need it only if you sign in again on a phone.') + '</div>' +
      '<label class="field" style="margin-top:10px"><span>New PIN</span><input id="np1" inputmode="numeric" type="password" maxlength="6"></label>' +
      '<label class="field"><span>Type it again</span><input id="np2" inputmode="numeric" type="password" maxlength="6"></label>' +
      '<div class="err" id="np-err"></div><div class="btns">' + (forced ? '' : '<button class="btn" data-n>Cancel</button>') + '<button class="btn gold" data-y>Save my PIN</button></div>', function (m, close) {
      var done = function () { S.pinOpen = false; close(); };
      if (forced) { var bg = m; bg.addEventListener('click', function (e) { if (e.target === bg) e.stopImmediatePropagation(); }, true); }
      if (m.querySelector('[data-n]')) m.querySelector('[data-n]').onclick = done;
      m.addEventListener('click', function (e) { if (!forced && e.target === m) S.pinOpen = false; });
      m.querySelector('[data-y]').onclick = function () {
        var a = m.querySelector('#np1').value.trim(), b = m.querySelector('#np2').value.trim(), err = m.querySelector('#np-err'), btn = this;
        if (!/^\d{4,6}$/.test(a)) { err.textContent = ERR.pin_4_digits; return; }
        if (a !== b) { err.textContent = 'The two PINs are not the same.'; return; }
        btn.disabled = true; btn.textContent = 'Saving…';
        api('changePin', {pin: a}).then(function () { if (S.data && S.data.me) S.data.me.mustChange = false; S.ver = 0; saveCache(); done(); toast('PIN saved 🔑', 'Use this PIN next time you sign in.'); refresh(true); })
          .catch(function (e) { btn.disabled = false; btn.textContent = 'Save my PIN'; err.textContent = errText(e); });
      };
    });
  }
  function notifyPhone(title, body, tag) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted' || pushOn()) return;   // real lock-screen pop-ups come from the server instead
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, {body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png'}); });
      else new Notification(title, {body: body, tag: tag, icon: 'icons/icon-192.png'});
    } catch (e) {}
  }

  /* ---------- WhatsApp share ---------- */
  function shareText(p) {
    var a = agent(p.agentId), link = (CFG.appUrl || location.href.split('#')[0]) + (p.id ? '#/post/' + p.id : ''), month = teamMonthTotal();
    var line = p.kind === 'milestone' ? '🏆 ' + p.text : p.source === 'roadshow' ? '🎪 ' + a.name + ' collected ' + p.count + ' name' + (p.count === 1 ? '' : 's') + ' at the roadshow in ' + p.location + '!' : '🎉 ' + a.name + ' just collected ' + p.count + ' referral' + (p.count === 1 ? '' : 's') + '!';
    return ['📣 *REDEFINE Prospecting*', '', line, 'Team total this month: ' + month + ' names 💪', '', 'Hardwork on purpose. No magic, just basic.', '👉 See it & cheer in the app: ' + link].join('\n');
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
  /* ---------- instant actions: the screen changes on the tap, the server is told in the background ---------- */
  S.outbox = LS.get('outbox', []);
  function saveOutbox() { LS.set('outbox', S.outbox.map(function (j) { return {op: j.op, q: j.q, label: j.label, tries: j.tries || 0}; })); }
  function act(op, q, apply, label, after) {
    try { if (apply && S.data) apply(S.data, new Date().toISOString()); } catch (e) {}
    if (S.data) { saveCache(); render(); }
    S.outbox.push({op: op, q: q, label: label || 'change', after: after}); saveOutbox(); flushOutbox();
  }
  function flushOutbox() {
    if (S.flushing || !S.outbox.length || !S.auth) return;
    S.flushing = true; var j = S.outbox[0]; j.tries = (j.tries || 0) + 1;
    api(j.op, j.q).then(ok, function (e) {
      if (j.tries > 1 && /^already_marked$/.test(e.message)) return ok({});   // the first try did arrive, only its answer was lost
      S.flushing = false;
      if (e.message === 'network' || (e.message === 'server_error' && j.tries < 3)) { if (e.message === 'network' && !S.offline) { S.offline = true; render(); } clearTimeout(S.retryT); S.retryT = setTimeout(flushOutbox, j.tries < 4 ? 3000 : 15000); return; }
      S.outbox.shift(); saveOutbox();
      if (/^(signed_out|removed)$/.test(e.message)) { S.outbox = []; saveOutbox(); signOut(true, e.message); return; }
      toast('Not saved: ' + j.label, errText(e) + ' The screen was put back.');
      next();
    });
    function ok(r) { S.outbox.shift(); saveOutbox(); S.flushing = false; if (S.offline) { S.offline = false; render(); } if (j.after) { try { j.after(r); } catch (e) {} } next(); }
    function next() { S.flushing = false; if (S.outbox.length) flushOutbox(); else { S.ver = 0; refresh(true); } }
  }
  window.addEventListener('online', function () { flushOutbox(); });
  // a background refresh must never redraw the screen under the finger or over an open box
  var lastTouch = 0;
  document.addEventListener('pointerdown', function () { lastTouch = Date.now(); }, true);
  function softRender() {
    clearTimeout(S.softT);
    var ae = document.activeElement, busy = document.getElementById('modal-root').children.length || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'checkbox') || Date.now() - lastTouch < 1500;
    if (busy) { S.softT = setTimeout(softRender, 800); return; }
    render();
  }
  function refresh(silent) {
    if (S.outbox.length) { flushOutbox(); return Promise.resolve(false); }   // saves still on the way: keep what the screen shows
    return api('sync', {ver: S.ver}).then(function (d) {
      if (S.outbox.length) return false;   // a tap happened while this was loading: its save comes first
      if (d.same) { if (S.data && S.data.me && S.data.me.mustChange) setTimeout(function () { askNewPin(true); }, 400); return false; }
      var first = !S.data; S.data = d; S.ver = d.ver; S.offline = false;
      saveCache();
      announce(first);
      cashIn();
      if (d.me && d.me.mustChange) setTimeout(function () { askNewPin(true); }, 400);
      if (pushOn() && d.me.devices === 0 && !S.repairTried) { S.repairTried = true; repairPush(false); }   // server lost this phone: reconnect quietly
      return true;
    }).catch(function (e) {
      // stay signed in like WhatsApp: only a sign-out on this phone or removal by the leader ends it
      if (/^(signed_out|removed)$/.test(e.message)) { signOut(true, e.message); return false; }
      if (e.message === 'network' && S.data && !S.offline) { S.offline = true; render(); }
      if (!silent && S.data) toast('Could not refresh', errText(e)); return false;
    });
  }
  /* 💰 Cash in: when the leader approves my names, appointment or close, play the cash sound (about 2 s) once */
  function cashIn() {
    if (!S.data || !S.data.me) return;
    var me = S.data.me.id, now = [], R = S.data.rates, sum = 0, n = {L: 0, A: 0, C: 0};
    S.data.refs.forEach(function (r) {
      if (r.agentId !== me) return;
      if (r.status === 'approved') now.push('L' + r.id);
      if (r.appt === 'approved') now.push('A' + r.id);
      if (r.close === 'approved') now.push('C' + r.id);
    });
    var key = 'cashSeen.' + me, seen = LS.get(key, null);
    LS.set(key, now);
    if (!seen) return;   // first time on this phone: nothing is "new"
    var had = {}; seen.forEach(function (k) { had[k] = 1; });
    now.forEach(function (k) { if (!had[k]) n[k[0]]++; });
    sum = n.L * R.lead + n.A * R.appt + n.C * R.close;
    if (!n.L && !n.A && !n.C) return;
    var parts = [n.L && n.L + ' name' + (n.L === 1 ? '' : 's'), n.A && n.A + ' appointment' + (n.A === 1 ? '' : 's'), n.C && n.C + ' close' + (n.C === 1 ? '' : 's')].filter(Boolean).join(' + ');
    if (S.sounds) SOUND.cash();
    toast('💰 +RM' + sum + ' approved!', parts + ' approved by your leader.' + (n.L ? ' Call each name within ' + (S.data.callDays || 14) + ' days to keep the lead bonus.' : ''), null, n.L ? '#/leads' : '#/bonus');
  }
  /* ---------- lock-screen pop-ups (Firebase, same project and method as REDEFINE Calendar) ---------- */
  function pushOn() { return !!(CFG.firebase && LS.get('pushToken', '') && 'Notification' in window && Notification.permission === 'granted'); }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }
  function loadScript(src) { return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }); }
  var fbReady = null;
  function firebaseMessaging() {
    if (!fbReady) fbReady = loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
      .then(function () { return loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'); })
      .then(function () { if (!firebase.apps.length) firebase.initializeApp(CFG.firebase); return firebase.messaging(); });
    return fbReady;
  }
  function installHelp() {
    modal('<h2>First, add the app to your Home Screen</h2><div class="muted">iPhone only shows lock-screen pop-ups for apps on the Home Screen:</div><ol class="steps" style="padding-left:18px;list-style:decimal"><li>Open this link in <b>Safari</b></li><li>Tap <b>Share</b> (square with arrow) → <b>Add to Home Screen</b></li><li>Open the app from the new icon → Me → <b>Turn on pop-ups</b></li></ol><div class="btns"><button class="btn primary" data-n>OK</button></div>', function (m, close) { m.querySelector('[data-n]').onclick = close; });
  }
  function enablePush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || (isIOS() && !standalone())) {
      if (isIOS()) return installHelp();
      return toast('Not supported', 'This browser cannot show notifications. Try Chrome or Safari.');
    }
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') { toast('Notifications blocked', 'Allow notifications for this app in your phone settings.'); render(); return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return firebaseMessaging().then(function (m) { return m.getToken({vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg}); });
      }).then(function (t) {
        if (!t) throw new Error('no_token');
        return api('pushreg', {pushToken: t}).then(function () { LS.set('pushToken', t); toast('Pop-ups are ON 🔔', 'You will get call reminders even when the phone is locked.'); return api('pushtest'); });
      }).then(function () { return refresh(true); }, function (e) { toast('Could not turn on pop-ups', errText(e)); });
    });
  }
  var repairing = false;
  function repairPush(loud) {   // brand-new registration (Apple / Google may have cancelled the old one)
    if (repairing || !CFG.firebase || !('Notification' in window) || Notification.permission !== 'granted') { if (loud) enablePush(); return Promise.resolve(); }
    repairing = true; if (loud) toast('Reconnecting pop-ups…', '');
    return navigator.serviceWorker.ready.then(function (reg) {
      return firebaseMessaging().then(function (m) {
        return m.deleteToken().catch(function () {}).then(function () { return reg.pushManager.getSubscription(); })
          .then(function (sub) { return sub ? sub.unsubscribe().catch(function () {}) : null; })
          .then(function () { return m.getToken({vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg}); });
      });
    }).then(function (t) { if (!t) throw new Error('no_token'); return api('pushreg', {pushToken: t}).then(function () { LS.set('pushToken', t); }); })
      .then(function () { repairing = false; if (loud) toast('Pop-ups reconnected 🔔', 'Try the 15-second test.'); return refresh(true); },
        function (e) { repairing = false; if (loud) toast('Could not reconnect', errText(e)); });
  }
  function refreshPush() {   // tokens can change; re-register quietly on each start
    if (!pushOn()) return;
    navigator.serviceWorker.ready.then(function (reg) {
      return firebaseMessaging().then(function (m) { return m.getToken({vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg}); });
    }).then(function (t) { if (t && t !== LS.get('pushToken', '')) return api('pushreg', {pushToken: t}).then(function () { LS.set('pushToken', t); }); }).catch(function () {});
  }
  function pushOff() {
    var t = LS.get('pushToken', '');
    api('pushoff', {pushToken: t}).catch(function () {}).then(function () { LS.del('pushToken'); toast('Pop-ups off', 'Turn them back on any time in Me.'); return refresh(true); });
  }
  // A pop-up arrived while the app is on screen: show the in-app banner and refresh (which plays the cash sound if money came in).
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (ev) {
    var m = ev.data && ev.data.rrtPush; if (!m) return;
    if (!isIOS() && !/approved/.test(m.title)) toast(m.title, m.body, null, m.url);
    refresh(true);
  });

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
    if (!S.seen.p) { mark(); dailyReminderPopups(); return; }   // first time on this phone: nothing is "new"
    S.unread.feed = newPosts.length + newCmts.length;
    if (!first) {
      var alerts = [];
      newPosts.forEach(function (p) { var n = agent(p.agentId).name; alerts.push([p.kind === 'milestone' ? '🏆 Milestone' : 'New referral update', p.kind === 'milestone' ? p.text : n + ' collected ' + p.count + ' referral' + (p.count === 1 ? '' : 's') + '!', p.agentId, '#/post/' + p.id]); });
      newCmts.forEach(function (c) { alerts.push([agent(c.agentId).name + ' commented', c.text, c.agentId, c.postId === 'board' ? '#/board' : '#/post/' + c.postId]); });
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
    if (first) render(); else softRender();
  }
  function mark(which) {
    if (!S.data) return;
    var max = function (list) { return list.reduce(function (m, x) { return x.created > m ? x.created : m; }, ''); };
    if (!which || which === 'feed') { S.seen.p = max(S.data.posts) || S.seen.p || '0'; S.seen.c = max(S.data.comments.filter(function (c) { return c.postId !== 'team'; })) || S.seen.c || '0'; S.unread.feed = 0; }
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
    if (route.current === 'chat') { location.replace('#/feed'); return; }   // team chat was removed (2026-11-12)
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- shell ---------- */
  function render() {
    if (!S.auth) return renderSignIn();
    if (!S.data) { $app.innerHTML = '<div class="signin"><div class="box" style="text-align:center"><img class="logo" src="icons/logo-white.png" alt="REDEFINE"><div class="spinner"></div><p>Loading your team…</p></div></div>'; return; }
    var v = route.current, sc = window.scrollY;
    var views = {feed: viewFeed, post: viewPost, board: viewBoard, snap: viewSnap, me: viewMe, review: viewReview, leads: viewLeads, steps: viewSteps, bonus: viewBonus};
    var body = (views[v] || viewFeed)();
    $app.innerHTML = (CFG.sample ? '<div class="sample-bar">' + esc(CFG.sample) + '</div>' : '') +
      (S.offline ? '<div class="sample-bar" style="background:#6B6A66;color:#fff">No signal · showing what was saved on this phone</div>' : '') +
      '<header class="top"><div class="wrap"><div class="brand"><img src="icons/mark-white.png" alt="REDEFINE"><div><b>REDEFINE <span>Prospecting</span></b><small>' + esc(teamMonthTotal()) + ' team prospects this month</small></div></div>' +
      '<button class="icon-btn' + (S.music ? ' on' : '') + '" id="music" aria-label="Background music" title="Background music">♪</button></div></header>' +
      '<main><div class="wrap" id="view"></div></main>' + tabsHtml();
    var view = document.getElementById('view');
    if (typeof body === 'string') view.innerHTML = body; else { view.innerHTML = ''; view.appendChild(body); }
    wireShell();
    if (views[v] && views[v].wire) views[v].wire(view);
    if (v === S.lastView) window.scrollTo(0, sc); S.lastView = v;
  }
  function tabsHtml() {
    var t = [['feed', '🏠', 'Feed', S.unread.feed], ['board', '📊', 'Board', 0], ['snap', '📷', 'Snap', 0], ['leads', '📋', 'Leads', S.data && S.data.me ? myToCall().length : 0], ['me', '👤', 'Me', 0]];
    var cur = {post: 'feed', review: 'board', steps: 'board', bonus: 'board'}[route.current] || route.current;
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

  /* ---------- sign in: REDEFINE Login (the same phone + email + PIN on every REDEFINE app) ----------
     The phone signs in with the login service, then this server finds the linked member. First time: old name +
     old PIN links the old account, or "I am new". The old team-code form stays behind a small leader link. */
  var RL = {step: 'login', phone: '', email: '', code: '', token: ''};
  function rlStored() { try { return localStorage.getItem('rl.token') || ''; } catch (e) { return ''; } }
  function rlNice(v) { v = String(v || '').replace(/\s+/g, ' ').trim(); return v && v === v.toUpperCase() ? v.toLowerCase().replace(/(^|[\s\-'(\/])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : v; }
  function rlPost(p, d) {
    return fetch(CFG.loginApi + p, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(d || {})})
      .then(function (r) { return r.json().catch(function () { return {ok: false, error: 'offline'}; }); }, function () { return {ok: false, error: 'offline'}; });
  }
  function rlShell(inner) {
    return '<div class="signin"><div class="box"><img class="logo" src="icons/logo-white.png" alt="REDEFINE"><h1>REDEFINE <span>Prospecting</span></h1>' + inner + '</div></div>';
  }
  function rlErr(m) { var el = document.getElementById('si-err'); if (el) el.textContent = m || ''; }
  function renderRl(msg) {
    if (RL.step === 'pin') return renderRlPin(msg);
    if (RL.step === 'choose') return renderRlChoose(msg);
    if (RL.step === 'old') return renderRlOld(msg);
    var have = rlStored(), nm = '';
    try { nm = rlNice(localStorage.getItem('rl.agent')); } catch (e) {}
    $app.innerHTML = rlShell('<p>Sign in with your <b>REDEFINE login</b>, the same phone + email + PIN on every REDEFINE app. You stay signed in on this phone.<br>用 REDEFINE 登入，所有应用都一样。</p>' +
      (have ? '<button class="btn gold block" id="rl-cont">Continue as ' + esc(nm || 'me') + ' 继续</button><p style="text-align:center;font-size:13px;opacity:.85;margin:8px 0 0">or sign in below 或在下面登入</p>' : '') +
      '<label class="field"><span>Phone number 手机号码</span><input id="rl-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="e.g. 012-345 6789" value="' + esc(RL.phone) + '"></label>' +
      '<label class="field"><span>Email 电邮</span><input id="rl-email" type="email" autocomplete="email" autocapitalize="off" value="' + esc(RL.email) + '"></label>' +
      '<label class="field"><span>PIN, or the 6-digit code from your leader 或验证码</span><input id="rl-secret" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></label>' +
      '<div class="err" id="si-err">' + esc(msg || '') + '</div><button class="btn ' + (have ? '' : 'gold ') + 'block" id="rl-go">Sign in 登入</button>' +
      '<p style="margin-top:14px;font-size:13px;opacity:.85"><b>Forgot your PIN?</b> Ask your leader for a new code. 忘记 PIN？请向领导要新的验证码。</p>' +
      '<p style="margin-top:8px;font-size:13px"><a href="#" id="rl-old" style="color:inherit">Leader: sign in with team code</a></p>');
    var go = document.getElementById('rl-go');
    go.onclick = function () {
      var d = {phone: document.getElementById('rl-phone').value.trim(), email: document.getElementById('rl-email').value.trim(), secret: document.getElementById('rl-secret').value.trim()};
      RL.phone = d.phone; RL.email = d.email;
      if (!d.phone || !d.email || !d.secret) return rlErr('Enter your phone, email and PIN. 请填写手机、电邮和 PIN。');
      go.disabled = true; go.textContent = 'Signing in… 登入中';
      rlPost('/api/login', d).then(function (r) {
        if (r.ok && r.next === 'set_pin') { RL.code = d.secret; RL.step = 'pin'; return renderRl(); }
        if (r.ok && r.token) return rlGot(r);
        go.disabled = false; go.textContent = 'Sign in 登入';
        rlErr(errText(new Error(r.error)) + (r.error === 'wrong' && r.left != null ? ' (' + r.left + ' tries left 次)' : ''));
      });
    };
    document.getElementById('rl-secret').addEventListener('keydown', function (e) { if (e.key === 'Enter') go.onclick(); });
    if (have) document.getElementById('rl-cont').onclick = function () { this.disabled = true; RL.token = have; rlFinish(); };
    document.getElementById('rl-old').onclick = function (e) { e.preventDefault(); S.oldWay = true; render(); };
  }
  function renderRlPin(msg) {
    $app.innerHTML = rlShell('<p><b>Choose your own 6-digit PIN.</b> The same PIN works on every REDEFINE app.<br>设定你自己的 6 位数 PIN，所有应用都用这个。</p>' +
      '<label class="field"><span>New PIN 新 PIN</span><input id="rl-p1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>' +
      '<label class="field"><span>Type it again 再输入一次</span><input id="rl-p2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>' +
      '<div class="err" id="si-err">' + esc(msg || '') + '</div><button class="btn gold block" id="rl-save">Save PIN 保存</button>');
    var b = document.getElementById('rl-save');
    b.onclick = function () {
      var a = document.getElementById('rl-p1').value.trim(), c = document.getElementById('rl-p2').value.trim();
      if (a !== c) return rlErr('The two PINs are not the same. 两次 PIN 不一样。');
      b.disabled = true;
      rlPost('/api/set-pin', {phone: RL.phone, email: RL.email, code: RL.code, pin: a}).then(function (r) {
        b.disabled = false;
        if (r.ok && r.token) { RL.code = ''; return rlGot(r); }
        if (r.error === 'code_expired' || r.error === 'no_match' || r.error === 'wrong') { RL.step = 'login'; return renderRl(errText(new Error(r.error))); }
        rlErr(errText(new Error(r.error)));
      });
    };
  }
  function rlGot(r) {
    try { localStorage.setItem('rl.token', r.token); localStorage.setItem('rl.agent', (r.agent && r.agent.name) || ''); } catch (e) {}
    RL.token = r.token; rlFinish();
  }
  function rlFinish(extra) {
    var q = Object.assign({rltoken: RL.token, device: deviceName()}, extra || {});
    return fetch(CFG.api, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(Object.assign({op: 'rlsignin'}, q))})
      .then(function (r) { return r.json(); }, function () { return {error: 'network'}; })
      .then(function (r) {
        if (r.error === 'not_linked_yet') { RL.step = 'choose'; return renderRl(); }
        if (r.error) {
          if (r.error === 'login_failed') { try { localStorage.removeItem('rl.token'); localStorage.removeItem('rl.agent'); } catch (e) {} RL.step = 'login'; }
          return renderRl(errText(new Error(r.error)));
        }
        RL = {step: 'login', phone: '', email: '', code: '', token: ''};
        S.auth = {token: r.token, name: r.me.name}; LS.set('auth', S.auth); LS.set('lastName', r.me.name);
        keepStorage();
        if (r.created) toast('Welcome to the team board', 'Snap your first referral page to get on the board!');
        else if (r.linked) toast('Linked!', 'Welcome back, ' + r.me.name + '.');
        S.data = null; S.ver = 0; render(); return refresh().then(function () { startPolling(); route(); });
      });
  }
  function renderRlChoose(msg) {
    $app.innerHTML = rlShell('<p><b>First time with your REDEFINE login.</b> 第一次用 REDEFINE 登入。</p>' +
      '<button class="btn gold block" id="rl-was">I used Prospecting before 我以前用过</button>' +
      '<p style="font-size:13px;opacity:.85;margin:6px 0 14px">Keeps all your referrals, leads and bonus. Type your OLD name + OLD PIN once. 保留所有记录，只需输入一次旧名字和旧 PIN。</p>' +
      '<button class="btn block" id="rl-new">I am new 我是新来的</button>' +
      '<div class="err" id="si-err">' + esc(msg || '') + '</div><p style="margin-top:12px;font-size:13px"><a href="#" id="rl-back" style="color:inherit">← Back 返回</a></p>');
    document.getElementById('rl-was').onclick = function () { RL.step = 'old'; renderRl(); };
    document.getElementById('rl-new').onclick = function () { this.disabled = true; rlFinish({create: true}); };
    document.getElementById('rl-back').onclick = function (e) { e.preventDefault(); RL.step = 'login'; renderRl(); };
  }
  function renderRlOld(msg) {
    $app.innerHTML = rlShell('<p><b>Your OLD Prospecting sign-in</b> (one time only). 输入你以前的名字和 PIN（只需一次）。</p>' +
      '<label class="field"><span>Old name 旧名字</span><input id="rl-on" value="' + esc(LS.get('lastName', '')) + '" autocomplete="off"></label>' +
      '<label class="field"><span>Old PIN 旧 PIN</span><input id="rl-op" type="password" inputmode="numeric" maxlength="6"></label>' +
      '<div class="err" id="si-err">' + esc(msg || '') + '</div><button class="btn gold block" id="rl-link">Link my account 连接</button>' +
      '<p style="margin-top:14px;font-size:13px;opacity:.85">Forgot it? Ask your leader to link you (Me → Team members → 🔗 Link login). 忘记了？请领导帮你连接。</p>' +
      '<p style="font-size:13px"><a href="#" id="rl-back" style="color:inherit">← Back 返回</a></p>');
    document.getElementById('rl-link').onclick = function () { this.disabled = true; rlFinish({oldName: document.getElementById('rl-on').value.trim(), oldPin: document.getElementById('rl-op').value.trim()}).then(function () { var b = document.getElementById('rl-link'); if (b) b.disabled = false; }); };
    document.getElementById('rl-back').onclick = function (e) { e.preventDefault(); RL.step = 'choose'; renderRl(); };
  }

  function renderSignIn() {
    if (CFG.loginApi && !S.oldWay) return renderRl();
    var last = LS.get('lastName', '');
    $app.innerHTML = '<div class="signin"><div class="box"><img class="logo" src="icons/logo-white.png" alt="REDEFINE">' +
      '<h1>REDEFINE <span>Prospecting</span></h1><p>Snap your referral page or roadshow list. The app counts it, hides client privacy, and the whole team cheers you on.</p>' +
      '<label class="field"><span>Team code (from your leader)</span><input id="si-code" autocomplete="off" autocapitalize="off"></label>' +
      '<label class="field"><span>Your name (as the team knows you)</span><input id="si-name" value="' + esc(last) + '" autocomplete="name"></label>' +
      '<label class="field"><span>Your PIN (4–6 digits; new members choose one now)</span><input id="si-pin" inputmode="numeric" type="password" maxlength="6"></label>' +
      '<div class="err" id="si-err"></div><button class="btn gold block" id="si-go">Enter</button>' +
      '<p style="margin-top:14px;font-size:13px;opacity:.85">Forgot your PIN? Ask your leader to reset it (Me → Team members → 🔑 Reset PIN). Sign in with the temporary PIN, then choose your own.</p>' +
      (CFG.loginApi ? '<p style="margin-top:8px;font-size:13px"><a href="#" id="si-new" style="color:inherit">← Agents: sign in with REDEFINE login</a></p>' : '') + '</div></div>';
    var sn = document.getElementById('si-new'); if (sn) sn.onclick = function (e) { e.preventDefault(); S.oldWay = false; render(); };
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
      S.data = null; S.ver = 0; render(); return refresh().then(function () { startPolling(); route(); if (r.mustChange) setTimeout(function () { askNewPin(true); }, 400); });
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Enter';
      if (e.message === 'new_name' && CFG.loginApi) { err.textContent = 'New members join with their REDEFINE login. 新同事请用 REDEFINE 登入。'; return; }
      if (e.message === 'new_name') {
        confirmBox('New member?', 'No one called <b>' + esc(q.name) + '</b> is on the team yet. Create a new member with this name and PIN?', 'Yes, create me').then(function (y) { if (y) doSignIn(true); });
        return;
      }
      err.textContent = errText(e);
    });
  }
  function signOut(auto, reason) {
    if (!auto && S.auth && S.auth.token) api('signout', {}).catch(function () {});   // ends this phone's key on the server too
    if (!auto && CFG.loginApi) { var rt = rlStored(); if (rt) rlPost('/api/logout', {token: rt}); try { localStorage.removeItem('rl.token'); localStorage.removeItem('rl.agent'); } catch (e) {} }
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
    var rsTag = p.source === 'roadshow' ? '<div class="notice info" style="margin:8px 0 0;padding:7px 10px">🎪 <b>Roadshow</b> · 📍 ' + esc(p.location) + '</div>' : '';
    var needSelfie = p.source === 'roadshow' && !p.selfie && !p.purged && !p.photoRemoved;
    var selfie = needSelfie ? (p.agentId === me.id ? '<div class="notice warn" style="margin-top:8px">🤳 Booth selfie missing. Your leader can approve after you add it.<div style="margin-top:6px"><label class="btn sm gold">🤳 Add booth selfie<input type="file" accept="image/*" capture="user" hidden data-addselfie="' + p.id + '"></label> <label class="btn sm">🖼 From gallery<input type="file" accept="image/*" hidden data-addselfie="' + p.id + '"></label></div></div>' : '<div class="faint" style="margin-top:8px">🤳 Booth selfie coming</div>')
      : p.source === 'roadshow' && p.selfie && !p.purged ? '<div class="photo-box" data-photo="' + p.id + '" data-which="selfie" style="max-width:220px">' + (S.photos[p.id + ':s'] ? '<img alt="Selfie at the roadshow" src="data:image/jpeg;base64,' + S.photos[p.id + ':s'] + '">' : 'Tap to load the selfie') + '</div>' : '';
    var photo = p.purged ? '<div class="photo-box">Photo and contact details auto-deleted after 3 months · names kept</div>'
      : p.photo ? photoStrip(p)
      : p.photoRemoved ? '<div class="photo-box">📷 Photo removed ' + (p.photoDays || 30) + ' days after approval (saves space) · names kept</div>'
      : '<div class="photo-box">Sample post · no photo</div>';
    return '<div class="card" id="p-' + p.id + '"><div class="row">' + avatar(p.agentId) + '<div class="grow"><div class="name">' + esc(a.name) + '</div><div class="faint">' + ago(p.created) + (p.giver && canSee ? ' · from ' + esc(p.giver) : '') + '</div></div>' +
      '<div style="text-align:right"><div class="big-num">' + p.count + '</div><div class="faint">' + (p.source === 'roadshow' ? 'roadshow name' : 'referral') + (p.count === 1 ? '' : 's') + '</div></div></div>' + rsTag +
      '<div class="chips">' + chips + '</div><div class="row" style="margin-top:6px"><span class="pill ' + esc(p.status) + '">' + esc(statusTxt) + '</span>' +
      (canSee && !p.purged ? '<span class="faint">' + (p.reviewedAt && (p.photo || p.selfie) ? 'Photo deletes ' + deleteDate(p.reviewedAt, p.photoDays || 30) + ' · ' : '') + 'Details delete ' + deleteDate(p.created, S.data.keepDays) + '</span>' : '') + '</div>' + selfie + photo +
      '<div class="actions"><button class="btn sm wa" data-share="' + p.id + '">Share to WhatsApp</button>' +
      (me.leader && p.status !== 'approved' ? '<a class="btn sm gold" href="#/review/' + p.id + '">Review</a>' : '') +
      (!full ? '<a class="btn sm" href="#/post/' + p.id + '">Details</a>' : '') +
      ((p.agentId === me.id && (p.status === 'pending' || p.status === 'rejected')) || me.leader ? '<button class="btn sm danger" data-del="' + p.id + '">Delete</button>' : '') + '</div>' + cmHtml + '</div>';
  }
  function photoKey(id, i) { return i ? id + ':' + i : id; }
  function photoStrip(p) {   // all covered photos of one record; several = swipe sideways
    var n = +p.photo || 0, box = function (i) { var k = photoKey(p.id, i); return '<div class="photo-box" data-photo="' + p.id + '" data-idx="' + i + '">' + (S.photos[k] ? '<img alt="Covered photo ' + (i + 1) + '" src="data:image/jpeg;base64,' + S.photos[k] + '">' : 'Tap to load photo ' + (n > 1 ? (i + 1) + ' of ' + n : '')) + '</div>'; };
    if (n <= 1) return box(0);
    var out = ''; for (var i = 0; i < n; i++) out += '<div class="strip-item"><div class="strip-n">' + (i + 1) + ' / ' + n + '</div>' + box(i) + '</div>';
    return '<div class="photo-strip">' + out + '</div><div class="faint" style="margin-top:2px">📷 ' + n + ' photos · swipe sideways</div>';
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
    root.querySelectorAll('[data-addselfie]').forEach(function (inp) { inp.onchange = function () { if (inp.files[0]) addSelfieTo(inp.dataset.addselfie, inp.files[0]); }; });
    var lazy = root.querySelectorAll('[data-photo]');
    var load = function (el) {
      var id = el.dataset.photo, which = el.dataset.which || '', idx = +el.dataset.idx || 0, key = which === 'selfie' ? id + ':s' : photoKey(id, idx);
      if (S.photos[key] || el.dataset.loading) return; el.dataset.loading = 1; el.textContent = 'Loading photo…';
      api('photo', {postId: id, which: which, idx: idx}).then(function (r) { S.photos[key] = r.image; el.innerHTML = '<img alt="' + (which ? 'Selfie at the roadshow' : 'Name list, private details covered') + '" src="data:image/jpeg;base64,' + r.image + '">'; })
        .catch(function (e) { el.textContent = errText(e); delete el.dataset.loading; });
    };
    lazy.forEach(function (el) { el.onclick = function () { load(el); }; });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }); }, {rootMargin: '200px'});
      lazy.forEach(function (el) { io.observe(el); });
    }
  }
  function sendComment(postId, text) {
    act('comment', {postId: postId, text: text}, function (D, now) { D.comments.push({id: 'tmp' + Date.now(), postId: postId, agentId: D.me.id, text: text, created: now}); }, 'comment');
    return Promise.resolve();
  }
  // the same change the server makes for a lead step, so the screen can show it straight away
  function stepLocal(id, k, on, when) {
    return function (D, now) {
      var r = D.refs.filter(function (x) { return x.id === id; })[0]; if (!r) return;
      var called = function () { if (!r.calledAt) { r.called = 'yes'; r.calledAt = now; } };
      if (k === 'noappt') { if (on) { r.noAppt = 'yes'; r.planAt = ''; called(); } else r.noAppt = ''; }
      else if (k === 'plan') { if (on) { r.planAt = new Date(when + ':00+08:00').toISOString(); r.noAppt = ''; called(); } else r.planAt = ''; }
      else if (k === 'call') { if (on) called(); else { r.called = ''; r.calledAt = ''; } }
      else if (on) { r[k] = D.me.leader ? 'approved' : 'pending'; r[k + 'At'] = k === 'appt' && r.planAt && r.planAt <= now ? r.planAt : now; if (k === 'appt') called(); }
      else { r[k] = ''; r[k + 'At'] = ''; }
      r.stepAt = now;
    };
  }
  function viewFeed() {
    var posts = S.data.posts.filter(function (p) { return p.kind !== 'approach'; }).sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    var mine = S.data.refs.filter(function (r) { return r.agentId === S.data.me.id && r.status !== 'rejected' && monthKey(r.created) === monthKey(new Date().toISOString()); }).length;
    var head = sendingHtml() + remindersHtml() + '<div class="card"><div class="row"><div class="grow"><div class="faint">Your new prospects this month</div><div class="big-num">' + mine + '</div></div>' +
      '<a class="btn gold" href="#/snap">📷 Snap new prospect</a></div></div>';
    if (!posts.length) return head + '<div class="empty">No referral updates yet. Be the first on the board!</div>';
    return head + posts.slice(0, 80).map(function (p) { return postCard(p, false); }).join('');
  }
  viewFeed.wire = function (root) { wirePosts(root); wireSending(root); };
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
      '<div class="tile"><div class="k">Team names</div><div class="v">' + st.total + '</div><div class="s">' + st.approved + ' approved · ' + (st.total - st.approved) + ' pending' + (st.refs.filter(function (r) { return r.source === 'roadshow'; }).length ? ' · 🎪 ' + st.refs.filter(function (r) { return r.source === 'roadshow'; }).length + ' from roadshows' : '') + '</div></div>' +
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
      (p.source === 'roadshow' ? '<div class="notice info">🎪 <b>Roadshow</b> · 📍 ' + esc(p.location) + (p.selfie ? '<br>Check the selfie shows ' + esc(agent(p.agentId).name.split(' ')[0]) + ' at this place.' : '') + '</div>' + (!p.selfie && !p.purged && !p.photoRemoved ? '<div class="notice warn">🤳 Waiting for ' + esc(agent(p.agentId).name.split(' ')[0]) + '\'s booth selfie. You can approve after it is added (you will get a pop-up). You can still untick names that should not count.</div>' : '') + (p.selfie && !p.purged ? '<div class="photo-box" data-photo="' + p.id + '" data-which="selfie" style="max-width:260px">' + (S.photos[p.id + ':s'] ? '<img alt="" src="data:image/jpeg;base64,' + S.photos[p.id + ':s'] + '">' : 'Loading selfie…') + '</div>' : '') : '') +
      '<div class="notice info">Tick the names that count for bonus. Possible duplicates start unticked, please check them. Photos are deleted ' + (p.photoDays || 30) + ' days after you save, to save space.</div>' +
      rs.map(function (r) { var on = S.decide.d[r.id] === 'approved'; return '<label class="check"><input type="checkbox" data-rv="' + r.id + '"' + (on ? ' checked' : '') + '><div><b>' + esc(r.name) + '</b>' + (r.phone ? ' <span class="faint">' + esc(r.phone) + '</span>' : '') + (r.dup ? '<div class="faint" style="color:var(--warn)">⚠️ ' + esc(r.dup) + '</div>' : '') + '</div></label>'; }).join('') +
      (p.photo && !p.purged ? photoStrip(p) : '') +
      '<div class="actions"><button class="btn primary block" id="rv-save">Save decision</button></div>' + (others.length ? '<div class="faint" style="margin-top:8px">' + others.length + ' more page(s) waiting after this one.</div>' : '') + '</div>';
  }
  viewReview.wire = function (root) {
    wirePosts(root);
    root.querySelectorAll('[data-rv]').forEach(function (c) { c.onchange = function () { S.decide.d[c.dataset.rv] = c.checked ? 'approved' : 'rejected'; }; });
    var b = root.querySelector('#rv-save'); if (!b) return;
    b.onclick = function () {
      var d = S.decide.d, ids = Object.keys(d), yes = ids.filter(function (k) { return d[k] === 'approved'; }).length;
      confirmBox('Save this decision?', '<b>' + yes + '</b> of ' + ids.length + ' names will count for bonus. ' + (ids.length - yes) + ' will not count.', 'Save').then(function (ok) {
        if (!ok) return;
        var pid = S.decide.post; S.decide = null;
        act('review', {postId: pid, decisions: d, confirm: true}, function (D, now) {
          var p = D.posts.filter(function (x) { return x.id === pid; })[0], mine = D.refs.filter(function (r) { return r.postId === pid; });
          mine.forEach(function (r) { var x = d[r.id]; if (x === 'approved' || x === 'rejected' || x === 'pending') r.status = x; });
          var st = mine.map(function (r) { return r.status; }), all = function (v) { return st.every(function (x) { return x === v; }); };
          if (p) { p.status = all('approved') ? 'approved' : all('rejected') ? 'rejected' : st.indexOf('pending') >= 0 ? 'pending' : 'partial'; p.count = mine.filter(function (r) { return r.status !== 'rejected'; }).length; p.reviewedAt = p.status === 'pending' ? '' : now; }
        }, 'approval');
        if (S.sounds) SOUND.ding();
        toast('Saved ✅', yes + ' referral' + (yes === 1 ? '' : 's') + ' approved.');
        var nx = S.data.posts.filter(function (x) { return x.kind === 'referral' && x.status === 'pending'; }).pop(); location.hash = nx ? '#/review/' + nx.id : '#/board';
      });
    };
  };

  /* ---------- roadshow: place + selfie first, then the name list ---------- */
  function roadshowStart() {
    var rs = S.rs = S.rs || {location: '', selfie: null}, places = LS.get('rsPlaces', []);
    var ready = rs.location.trim().length >= 3;
    return modeBar('roadshow', true) + '<div class="card"><h2>🎪 Roadshow name list</h2><div class="faint">Same as referrals: the app reads the names, covers private details, RM' + S.data.rates.lead + ' per name once called within ' + (S.data.callDays || 14) + ' days.</div>' +
      '<label class="field"><span>1. 📍 Where is the roadshow?</span><input id="rs-loc" list="rs-places" maxlength="80" placeholder="e.g. Queensbay Mall, Level 1 atrium" value="' + esc(rs.location) + '"></label>' +
      '<datalist id="rs-places">' + places.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>' +
      '<div class="field"><span>2. 📋 Photo of the name list</span>' +
      (ready ? '<label class="btn gold block">📷 Take photo of the list<input type="file" accept="image/*" capture="environment" hidden data-file></label><div style="height:8px"></div><label class="btn block">🖼 Choose from gallery (you can pick several)<input type="file" accept="image/*" multiple hidden data-file></label>'
        : '<div class="notice warn">Type the place first.</div>') + '</div>' +
      '<div class="field"><span>3. 🤳 Selfie at the booth (proof) · now or later</span>' +
      (rs.selfie ? '<div class="canvas-wrap" style="max-width:240px"><canvas id="rs-selfie"></canvas></div><div class="faint" style="margin-top:4px">' + (rs.faceNote || '') + ' Tap a 🙂 to uncover, drag to cover more.</div><label class="btn sm" style="margin-top:6px">Retake selfie<input type="file" accept="image/*" capture="user" hidden data-selfie></label>'
        : '<label class="btn sm">🤳 Take selfie now<input type="file" accept="image/*" capture="user" hidden data-selfie></label><div class="faint" style="margin-top:4px">Busy at the booth? Snap the list first and add the selfie later from your post. Your leader approves once the selfie is in.</div>') + '</div></div>';
  }
  /* selfie: biggest face = the agent (stays visible); other faces covered */
  function processSelfie(file) {
    return REDACT.loadImage(file).then(function (img) {
      var cv = REDACT.toCanvas(img, 1280), sf = {canvas: cv, boxes: [], note: ''};
      return REDACT.faces(cv).then(function (fs) {
        fs.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
        sf.boxes = fs.map(function (b, k) { return {kind: 'face', x: b.x, y: b.y, w: b.w, h: b.h, off: k === 0}; });
        sf.note = fs.length > 1 ? (fs.length - 1) + ' other face' + (fs.length > 2 ? 's' : '') + ' covered.' : '';
        return sf;
      }, function () { sf.note = 'Face check not available on this phone. Drag over other people\'s faces.'; return sf; });
    });
  }
  function selfieB64(sf) { return REDACT.b64(REDACT.toCanvas(REDACT.render(sf.canvas, sf.boxes), 1080), 0.8); }
  function wireRoadshowStart(root) {
    var loc = root.querySelector('#rs-loc'); if (!loc || !S.rs) return;
    loc.oninput = function () { var was = S.rs.location.trim().length >= 3; S.rs.location = loc.value; if ((S.rs.location.trim().length >= 3) !== was) { render(); var l = document.getElementById('rs-loc'); if (l) { l.focus(); l.setSelectionRange(l.value.length, l.value.length); } } };
    loc.onchange = function () { render(); };
    var sc = root.querySelector('#rs-selfie'); if (sc && S.rs.selfie) { REDACT.render(S.rs.selfie.canvas, S.rs.selfie.boxes, sc); wireDraw(sc, S.rs.selfie); }
    root.querySelectorAll('[data-selfie]').forEach(function (inp) {
      inp.onchange = function () {
        var file = inp.files[0]; if (!file) return;
        toast('Checking selfie…', 'Covering other people\'s faces');
        processSelfie(file).then(function (sf) { S.rs.selfie = sf; S.rs.faceNote = sf.note; render(); }, function (e) { toast('Selfie not opened', e.message); });
      };
    });
  }
  /* add the booth selfie to a roadshow post that is already posted */
  function addSelfieTo(postId, file) {
    toast('Checking selfie…', 'Covering other people\'s faces');
    processSelfie(file).then(function (sf) {
      modal('<h2>🤳 Add this booth selfie?</h2><div class="faint">' + esc(sf.note || 'Your face stays visible as proof.') + ' Tap a 🙂 to uncover, drag to cover more.</div><div class="canvas-wrap" style="margin:10px 0;max-width:280px"><canvas id="as-cv"></canvas></div><div class="btns"><button class="btn" data-n>Cancel</button><button class="btn gold" data-y>Upload selfie</button></div>', function (m, close) {
        var cv = m.querySelector('#as-cv'), redraw = function () { REDACT.render(sf.canvas, sf.boxes, cv); };
        redraw(); wireDraw(cv, sf); cv.addEventListener('pointerup', function () { setTimeout(redraw, 0); });
        m.querySelector('[data-n]').onclick = close;
        m.querySelector('[data-y]').onclick = function () {
          var b = this; b.disabled = true; b.textContent = 'Uploading…';
          api('addSelfie', {postId: postId, selfie: selfieB64(sf)}).then(function () { close(); delete S.photos[postId + ':s']; toast('Selfie added 🤳', 'Your leader can approve this roadshow list now.'); return refresh(true); })
            .catch(function (e) { b.disabled = false; b.textContent = 'Upload selfie'; toast('Not uploaded', errText(e)); });
        };
      });
    }, function (e) { toast('Selfie not opened', e.message); });
  }

  /* ---------- which list? Two very different cards so agents don't pick the wrong one ---------- */
  var PIC_REF = '<svg viewBox="0 0 64 80" width="64" height="80" aria-hidden="true"><rect x="2" y="2" width="60" height="76" rx="4" fill="#3D55E0"/><rect x="7" y="7" width="50" height="66" rx="2" fill="#fff"/><rect x="11" y="11" width="26" height="4" rx="1" fill="#3D55E0"/><rect x="11" y="19" width="34" height="2" fill="#9AA6EE"/>' +
    [26, 36, 46, 56, 66].map(function (y, i) { return '<text x="11" y="' + (y + 4) + '" font-size="6" font-family="Arial" fill="#3D55E0" font-weight="700">' + (i + 1) + '</text><rect x="18" y="' + y + '" width="22" height="2" fill="#C9CFF5"/><rect x="18" y="' + (y + 4) + '" width="16" height="2" fill="#C9CFF5"/><rect x="43" y="' + y + '" width="10" height="6" fill="none" stroke="#C9CFF5"/>'; }).join('') + '</svg>';
  var PIC_RS = '<svg viewBox="0 0 64 80" width="64" height="80" aria-hidden="true"><path d="M4 26 L32 8 L60 26 Z" fill="#E8590C"/><path d="M4 26h56v6H4z" fill="#F08C4A"/>' +
    [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<path d="M' + (4 + i * 8) + ' 32 q4 6 8 0" fill="' + (i % 2 ? '#fff' : '#E8590C') + '"/>'; }).join('') +
    '<rect x="8" y="38" width="4" height="36" fill="#9a5a2b"/><rect x="52" y="38" width="4" height="36" fill="#9a5a2b"/><rect x="14" y="52" width="36" height="22" rx="2" fill="#FFE3D1" stroke="#E8590C"/><rect x="18" y="57" width="20" height="2" fill="#E8590C"/><rect x="18" y="62" width="26" height="2" fill="#F5B58C"/><rect x="18" y="67" width="22" height="2" fill="#F5B58C"/><circle cx="46" cy="46" r="5" fill="#16171C"/><rect x="42" y="51" width="8" height="10" rx="3" fill="#16171C"/></svg>';
  function modeBar(mode, canChange) {
    var rs = mode === 'roadshow';
    return '<div class="mode-bar ' + (rs ? 'rs' : 'ref') + '"><span>You chose: <b>' + (rs ? '🎪 ROADSHOW LIST 路演名单' : '📒 REFERRAL PAGE 转介绍名单') + '</b></span>' + (canChange ? '<a href="#" data-mode="">Change</a>' : '') + '</div>';
  }

  /* ---------- snap a referral page ---------- */
  function viewSnap() {
    var d = S.draft;
    if (!d && !S.snapMode) return '<h2 style="margin:4px 2px 2px">Which list did you get?</h2><div class="muted" style="margin:0 2px 12px">你拿到的是哪一种名单？ Choose carefully: it decides how the names are counted.</div>' +
      '<button class="pick-card ref" data-mode="referral">' + PIC_REF + '<div><div class="pick-t">📒 REFERRAL PAGE</div><div class="pick-zh">转介绍名单</div><div class="pick-d">A <b>client</b> wrote their friends / family in the <b>blue REDEFINE referral booklet</b>.</div><div class="pick-tag">✔ "Your Name" at the top · rows 1 to 5</div></div></button>' +
      '<button class="pick-card rs" data-mode="roadshow">' + PIC_RS + '<div><div class="pick-t">🎪 ROADSHOW LIST</div><div class="pick-zh">路演名单</div><div class="pick-d">Names <b>strangers left at a booth / event</b>: sign-up sheet, survey or lucky-draw forms.</div><div class="pick-tag">✔ Needs the place + a selfie at the booth</div></div></button>' +
      '<div class="faint" style="margin:6px 2px 12px">Not sure? Referral = someone you know gave you the names. Roadshow = you collected them from the public.</div>' +
      '<button class="btn block" id="sn-approach">🙋 I asked a client but got no names</button>';
    if (!d && S.snapMode === 'roadshow') return roadshowStart();
    if (!d) return modeBar('referral', true) + '<div class="card snap-hero"><div class="big-ico">📒</div><h2>Snap your referral page</h2><p class="muted">Take a photo of the filled referral list. The app reads the names, counts them for you, and covers phone numbers, ages, remarks and faces before your team sees it.</p>' +
      '<label class="btn gold block">📷 Take photo<input type="file" accept="image/*" capture="environment" hidden data-file></label><div style="height:8px"></div>' +
      '<label class="btn block">🖼 Choose from gallery (you can pick several)<input type="file" accept="image/*" multiple hidden data-file></label>' +
      '<ul class="steps faint" style="text-align:left;margin-top:16px"><li>✔ Lay the page flat, in good light, whole page in the photo.</li><li>✔ Several pages from the same client? Pick them all, or add more on the next screen. They become one record.</li><li>✔ The original photo is not saved. Only the covered one is.</li><li>✔ Phone numbers, age and remarks auto-delete after 3 months. Names stay.</li></ul></div>';
    if (d.stage === 'busy') return modeBar(d.source, false) + '<div class="card snap-hero"><div class="spinner"></div><h2>' + esc(d.msg) + '</h2><ul class="steps muted">' + d.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';
    if (d.stage === 'failed') return '<div class="card"><h2>Could not open the photo</h2><div class="notice bad">' + esc(d.error) + '</div><div class="actions"><button class="btn" id="sn-cancel">Back</button></div></div>';
    var rows = d.rows, n = rows.filter(function (r) { return r.name.trim().length >= 2; }).length, unclear = rows.filter(function (r) { return r.unclear; }).length;
    var rsd = d.source === 'roadshow', np = d.pages.length;
    var kinds = d.pages.map(function (p) { return p.kind; });
    var wrong = rsd && kinds.indexOf('referral_page') >= 0 && !d.keepType ? 'referral' : !rsd && kinds.indexOf('roadshow_list') >= 0 && !d.keepType ? 'roadshow' : '';
    var html = modeBar(d.source, false) +
      (wrong ? '<div class="notice bad" style="font-size:14.5px">⚠️ <b>This looks like a ' + (wrong === 'roadshow' ? 'ROADSHOW list' : 'REFERRAL booklet page') + '</b>, but you chose ' + (rsd ? 'Roadshow' : 'Referral') + '.' + '<div style="margin-top:8px"><button class="btn sm ' + (wrong === 'roadshow' ? 'gold' : 'primary') + '" data-switch="' + wrong + '">Switch to ' + (wrong === 'roadshow' ? '🎪 Roadshow' : '📒 Referral') + '</button> <button class="btn sm" data-keep>No, keep ' + (rsd ? 'Roadshow' : 'Referral') + '</button></div></div>' : '') +
      '<div class="faint" style="margin:0 2px 8px">Wrong type? <a href="#" data-switch="' + (rsd ? 'referral' : 'roadshow') + '">Change to ' + (rsd ? '📒 Referral page' : '🎪 Roadshow list') + '</a></div>' +
      (rsd ? '<div class="card"><h2>🎪 Roadshow</h2><label class="field"><span>📍 Roadshow location</span><input id="sn-loc" value="' + esc(d.location) + '" maxlength="80"></label>' +
      (d.selfie ? '<div class="faint">Selfie (proof). Your face stays visible; other people\'s faces are covered 🙂. Tap a cover to remove it, drag to add one.</div>' +
        '<div class="canvas-wrap" style="margin-top:8px;max-width:260px"><canvas id="sn-selfie"></canvas></div>'
        : '<label class="btn sm">🤳 Add booth selfie now<input type="file" accept="image/*" capture="user" hidden data-dselfie></label><div class="faint" style="margin-top:4px">Or add it later from your post. Your leader approves once the selfie is in.</div>') + '</div>' : '') +
      '<div class="card"><h2>Check before posting · ' + np + ' photo' + (np === 1 ? '' : 's') + '</h2><div class="faint">Black boxes and 🙂 are hidden from the team. <b>Drag</b> on a photo to cover more, <b>tap</b> a box to uncover it.</div>' +
      d.pages.map(function (p, i) {
        var priv = p.boxes.filter(function (bx) { return !bx.off && bx.kind !== 'face'; }).length, faces = p.boxes.filter(function (bx) { return !bx.off && bx.kind === 'face'; }).length;
        return '<div class="page-block">' + (np > 1 ? '<div class="row" style="margin-bottom:6px"><b class="grow">Photo ' + (i + 1) + ' of ' + np + '</b><button class="btn sm danger" data-rmpage="' + i + '">✕ Remove photo</button></div>' : '') +
          '<div class="canvas-wrap"><canvas data-pcv="' + i + '"></canvas></div>' +
          '<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:6px"><span class="faint">' + priv + ' private spot' + (priv === 1 ? '' : 's') + ' · ' + faces + ' face' + (faces === 1 ? '' : 's') + ' covered</span><button class="btn sm" data-undo-p="' + i + '">Undo last box</button></div>' +
          (p.error ? '<div class="notice bad">Could not read this photo: ' + esc(p.error) + '. Type its names below and drag over every phone number, age and remark. <button class="btn sm" data-reread="' + i + '">Try reading again</button></div>' : '') +
          (p.faceErr ? '<div class="notice warn">Face check could not run on this phone. If there are faces, drag over them to cover.</div>' : '') +
          (p.notes ? '<div class="notice info">AI note: ' + esc(p.notes) + '</div>' : '') + '</div>';
      }).join('') +
      (np < 6 ? '<div class="actions" style="margin-top:10px"><label class="btn sm gold">📷 + Add another photo<input type="file" accept="image/*" capture="environment" hidden data-more></label><label class="btn sm">🖼 + From gallery<input type="file" accept="image/*" multiple hidden data-more></label></div><div class="faint" style="margin-top:4px">Another page of the same list? Add it here (up to 6 photos). All names go into this one record.</div>' : '<div class="faint" style="margin-top:8px">Maximum 6 photos per record.</div>') + '</div>';
    html += '<div class="card"><div class="row"><h2 class="grow">' + (rsd ? 'Names found: ' : 'Referrals found: ') + n + '</h2></div>' +
      (unclear ? '<div class="notice warn">' + unclear + ' name' + (unclear === 1 ? ' was' : 's were') + ' hard to read (yellow). Please fix the spelling.</div>' : '') +
      (!rows.length ? '<div class="notice warn">No names were found. Add more photos, or type the names below.</div>' : '') +
      (rsd ? '' : '<label class="field"><span>Referral given by (your client)</span><input id="sn-giver" value="' + esc(d.giver) + '" placeholder="Name at &quot;Your Name&quot;"></label>') +
      rows.map(function (r, i) {
        var priv = [r.age && 'Age ' + r.age, r.phone && r.phone, r.gender, r.remarks].filter(Boolean).join(' · ');
        return '<div class="ref-edit' + (r.unclear ? ' unclear' : '') + '"><div class="no">' + (i + 1) + '</div><div><input data-rn="' + i + '" value="' + esc(r.name) + '" placeholder="Name">' + (priv || np > 1 ? '<div class="priv">' + (np > 1 ? '📷 ' + ((r.page || 0) + 1) + (priv ? ' · ' : '') : '') + (priv ? '🔒 ' + esc(priv) : '') + '</div>' : '') + '</div><button class="btn sm" data-rx="' + i + '" aria-label="Remove">✕</button></div>';
      }).join('') +
      '<div class="actions"><button class="btn sm" id="sn-add">+ Add a name</button></div><div class="faint" style="margin-top:6px">🔒 = only you and your leader see it, and it auto-deletes in 3 months.</div></div>';
    html += '<div class="card"><label class="check"><input type="checkbox" id="sn-ok"' + (d.ok ? ' checked' : '') + '><span>I checked ' + (np > 1 ? 'all ' + np + ' photos' : 'the photo') + ': no phone number, IC, age, remark, my client\'s own name or face can be seen.</span></label>' +
      '<button class="btn gold block" id="sn-post"' + (n && d.ok ? '' : ' disabled') + '>Post ' + n + (rsd ? ' roadshow name' : ' referral') + (n === 1 ? '' : 's') + ' to the team</button>' +
      '<div class="actions"><button class="btn sm" id="sn-cancel">Cancel</button></div></div>';
    return html;
  }
  viewSnap.wire = function (root) {
    root.querySelectorAll('[data-file]').forEach(function (inp) { inp.onchange = function () { if (inp.files.length) startSnap([].slice.call(inp.files)); }; });
    root.querySelectorAll('[data-mode]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); S.snapMode = b.dataset.mode || null; render(); }; });
    wireRoadshowStart(root);
    var ap = root.querySelector('#sn-approach');
    if (ap) ap.onclick = function () {
      confirmBox('Log an approach?', 'You asked a client for referrals but got no names this time. It counts as an <b>Approach</b> on your bonus sheet (effort, not paid). Asking is the habit that wins.', 'Log it').then(function (y) {
        if (y) api('approach', {confirm: true}).then(function () { toast('Approach logged 🙋', 'Every ask builds the habit. Next one will say yes!'); return refresh(true); }).catch(function (e) { toast('Not saved', errText(e)); });
      });
    };
    var d = S.draft; if (!d) return;
    var q = function (s) { return root.querySelector(s); };
    if (q('#sn-cancel')) q('#sn-cancel').onclick = function () { S.draft = null; S.snapMode = null; S.rs = null; render(); };
    if (d.stage !== 'review') return;
    root.querySelectorAll('[data-pcv]').forEach(function (cv) { var p = d.pages[+cv.dataset.pcv]; REDACT.render(p.canvas, p.boxes, cv); wireDraw(cv, p); });
    root.querySelectorAll('[data-undo-p]').forEach(function (b) { b.onclick = function () { var bx = d.pages[+b.dataset.undoP].boxes; for (var i = bx.length - 1; i >= 0; i--) if (!bx[i].off) { bx[i].off = true; break; } d.ok = false; render(); }; });
    root.querySelectorAll('[data-rmpage]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.dataset.rmpage, cnt = d.rows.filter(function (r) { return (r.page || 0) === i; }).length;
        confirmBox('Remove photo ' + (i + 1) + '?', 'The photo and the ' + cnt + ' name' + (cnt === 1 ? '' : 's') + ' read from it will be removed from this record.', 'Remove', true).then(function (y) {
          if (!y) return;
          d.pages.splice(i, 1);
          d.rows = d.rows.filter(function (r) { return (r.page || 0) !== i; }).map(function (r) { if ((r.page || 0) > i) r.page--; return r; });
          render();
        });
      };
    });
    root.querySelectorAll('[data-more]').forEach(function (inp) { inp.onchange = function () { if (inp.files.length) addPages([].slice.call(inp.files)); }; });
    root.querySelectorAll('[data-reread]').forEach(function (b) { b.onclick = function () { rereadPage(+b.dataset.reread); }; });
    root.querySelectorAll('[data-switch]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); var to = b.dataset.switch; d.source = to; S.snapMode = to; d.keepType = true; if (to === 'referral') d.giver = d.aiGiver || ''; else { d.giver = ''; d.location = d.location || (S.rs && S.rs.location) || ''; } d.ok = false; render(); toast(to === 'roadshow' ? 'Changed to 🎪 Roadshow' : 'Changed to 📒 Referral', to === 'roadshow' ? 'Type the roadshow place. The selfie can come later.' : 'Check the client name at "Your Name".'); }; });
    if (q('[data-keep]')) q('[data-keep]').onclick = function () { d.keepType = true; render(); };
    if (q('#sn-giver')) q('#sn-giver').oninput = function (e) { d.giver = e.target.value; };
    if (q('#sn-loc')) q('#sn-loc').oninput = function (e) { d.location = e.target.value; };
    root.querySelectorAll('[data-dselfie]').forEach(function (inp) { inp.onchange = function () { if (!inp.files[0]) return; toast('Checking selfie…', ''); processSelfie(inp.files[0]).then(function (sf) { d.selfie = sf; render(); }, function (e) { toast('Selfie not opened', e.message); }); }; });
    if (q('#sn-selfie') && d.selfie) { var sc = q('#sn-selfie'); REDACT.render(d.selfie.canvas, d.selfie.boxes, sc); wireDraw(sc, d.selfie); }
    root.querySelectorAll('[data-rn]').forEach(function (inp) { inp.oninput = function () { var r = d.rows[+inp.dataset.rn]; r.name = inp.value; r.unclear = /\?/.test(inp.value); updatePostBtn(); }; inp.onchange = function () { render(); }; });
    root.querySelectorAll('[data-rx]').forEach(function (b) { b.onclick = function () { d.rows.splice(+b.dataset.rx, 1); render(); }; });
    q('#sn-add').onclick = function () { d.rows.push({name: '', page: Math.max(0, d.pages.length - 1)}); render(); var ins = root.ownerDocument.querySelectorAll('[data-rn]'); if (ins.length) ins[ins.length - 1].focus(); };
    q('#sn-ok').onchange = function (e) { d.ok = e.target.checked; updatePostBtn(); };
    q('#sn-post').onclick = postDraft;
    function updatePostBtn() { var n = d.rows.filter(function (r) { return r.name.trim().length >= 2; }).length, b = document.getElementById('sn-post'); b.disabled = !(n && d.ok); b.textContent = 'Post ' + n + (d.source === 'roadshow' ? ' roadshow name' : ' referral') + (n === 1 ? '' : 's') + ' to the team'; }
  };
  function wireDraw(cv, d) {   // d = something with {canvas, boxes}: one photo of the draft, or a selfie
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
      if (!box) { var i = REDACT.hit(d.boxes, p.x, p.y); if (i >= 0) { d.boxes[i].off = true; if (S.draft) S.draft.ok = false; } }
      start = null; box = null; if (!cv.closest('.modal')) render();
    });
  }
  /* one or more photos -> one record. Each photo is read by AI and covered on its own; names are merged. */
  function startSnap(files) {
    S.draft = {stage: 'busy', msg: 'Opening photo…', steps: [], pages: [], rows: [], giver: '', aiGiver: '', ok: false, source: S.snapMode === 'roadshow' ? 'roadshow' : 'referral'};
    if (S.draft.source === 'roadshow' && S.rs) { S.draft.location = S.rs.location; S.draft.selfie = S.rs.selfie; }
    location.hash = '#/snap';
    addPages(files);
  }
  function addPages(files) {
    var d = S.draft, room = 6 - d.pages.length;
    if (files.length > room) toast('Only ' + room + ' more photo' + (room === 1 ? '' : 's') + ' fit', 'Maximum 6 photos per record. Extra photos were skipped.');
    files = files.slice(0, Math.max(0, room)); if (!files.length) return;
    var total = files.length, done = 0, base = d.pages.length;
    d.stage = 'busy'; d.ok = false;
    var step = function () {
      d.msg = (total > 1 ? 'Reading photo ' + (done + 1) + ' of ' + total + '…' : (d.source === 'roadshow' ? 'Reading your roadshow name list…' : 'Reading your referral page…'));
      d.steps = ['⏳ Finding names and counting them', '⏳ Finding phone numbers, ages, remarks', '⏳ Looking for faces']; render();
    };
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        step();
        return REDACT.loadImage(file).then(function (img) {
          var page = {canvas: REDACT.toCanvas(img, 1600), boxes: []};
          d.pages.push(page);
          return readPage(page, d.pages.length - 1);
        }, function (e) { toast('Photo skipped', e.message); }).then(function () { done++; });
      });
    });
    chain.then(function () {
      if (!d.pages.length) { d.stage = 'failed'; d.error = 'None of the photos could be opened. Please use JPG or PNG photos.'; }
      else d.stage = 'review';
      if (S.draft === d) render();
    });
  }
  function readPage(page, idx) {
    var d = S.draft;
    var face = REDACT.faces(page.canvas).then(function (f) { d.steps[2] = '✔ Faces checked (' + f.length + ' found)'; render(); return f; })
      .catch(function (e) { page.faceErr = (e && e.message || 'not supported').slice(0, 60); d.steps[2] = '⚠ Face check not available'; render(); return []; });
    var ai = api('read', {image: REDACT.b64(page.canvas, 0.85)}).then(function (r) { d.steps[0] = '✔ ' + r.read.rows.length + ' names found'; d.steps[1] = '✔ ' + r.read.private.length + ' private spots found'; render(); return r.read; });
    return Promise.all([ai, face]).then(function (res) {
      var r = res[0];
      page.kind = r.kind; page.notes = r.notes; page.error = '';
      if (!d.aiGiver && r.giver) { d.aiGiver = r.giver; if (d.source !== 'roadshow' && !d.giver) d.giver = r.giver; }
      r.rows.forEach(function (row) { row.page = idx; d.rows.push(row); });
      page.boxes = page.boxes.filter(function (bx) { return bx.kind === 'manual'; }).concat(r.private.map(function (b) { return {kind: 'private', type: b.type, x: b.x, y: b.y, w: b.w, h: b.h}; }))
        .concat(res[1]).concat(r.faces.map(function (b) { return {kind: 'face', x: b.x, y: b.y, w: b.w, h: b.h}; }));
    }, function (e) {   // this photo could not be read: keep it, the agent types its names and covers by hand
      page.error = errText(e);
      return face.then(function (f) { page.boxes = page.boxes.concat(f); });
    });
  }
  function rereadPage(i) {
    var d = S.draft, page = d.pages[i];
    d.rows = d.rows.filter(function (r) { return (r.page || 0) !== i; });
    d.stage = 'busy'; d.msg = 'Reading photo ' + (i + 1) + ' again…'; d.steps = ['⏳ Finding names', '⏳ Finding private details', '⏳ Looking for faces']; render();
    readPage(page, i).then(function () { d.stage = 'review'; render(); });
  }
  /* Posting feels instant: celebrate right away, upload in the background (a few seconds to Google).
     A card on the Feed shows "Posting…"; if the upload fails it turns red with Retry, so nothing is lost. */
  function postDraft() {
    var d = S.draft, rows = d.rows.filter(function (r) { return r.name.trim().length >= 2; });
    var rsd = d.source === 'roadshow';
    if (rsd && (!d.location || d.location.trim().length < 3)) return toast('Location needed', 'Type where the roadshow was.');
    confirmBox('Post ' + rows.length + (rsd ? ' roadshow name' : ' referral') + (rows.length === 1 ? '' : 's') + '?', (rsd && !d.selfie ? '<b>No selfie yet:</b> add it later from your post so your leader can approve.<br>' : '') + 'Your team will see your name, ' + (rsd ? 'the roadshow place, ' + (d.selfie ? 'your selfie, ' : '') : '') + 'the names and the covered photo' + (d.pages.length > 1 ? 's (' + d.pages.length + ')' : '') + '. Phone numbers, ages and remarks stay private and auto-delete in 3 months.', 'Post it').then(function (y) {
      if (!y) return;
      var photos = d.pages.map(function (p) { return REDACT.b64(REDACT.toCanvas(REDACT.render(p.canvas, p.boxes), 1280), 0.8); });
      var payload = Object.assign({giver: d.giver, rows: rows.map(function (r) { return {name: r.name, age: r.age, phone: r.phone, gender: r.gender, remarks: r.remarks}; }), photo: photos[0], photos: photos, covered: true}, rsd ? {source: 'roadshow', location: d.location.trim(), selfie: d.selfie ? selfieB64(d.selfie) : ''} : {});
      if (rsd) { var pl = LS.get('rsPlaces', []).filter(function (x) { return x !== payload.location; }); pl.unshift(payload.location); LS.set('rsPlaces', pl.slice(0, 8)); }
      S.draft = null; S.snapMode = null; S.rs = null;
      var job = {payload: payload, n: rows.length, source: rsd ? 'roadshow' : 'referral', location: payload.location || '', state: 'sending'};
      (S.sending = S.sending || []).push(job);
      showCheer(localCheer(job));
      sendJob(job);
    });
  }
  function localCheer(job) {
    var mk = monthKey(new Date().toISOString()), me = S.data.me.id;
    var mine = S.data.refs.filter(function (r) { return r.agentId === me && r.status !== 'rejected' && monthKey(r.created) === mk; }).length + job.n;
    var pick = function (l) { return l[Math.floor(Math.random() * l.length)]; };
    var line = job.source === 'roadshow' ? pick([job.n + ' names from the roadshow at ' + job.location + '! Standing there all day paid off. 💪', job.n + ' new contacts from ' + job.location + '. Call them while they still remember your booth! 📞'])
      : job.n >= 3 ? pick([job.n + ' names from one page, that is trust earned. 客户愿意介绍，是对你最大的肯定。', job.n + ' referrals in one go! Your client believes in you.'])
      : pick(['Every name is a family you can protect. Keep asking, 坚持就是力量。', 'One more door opened. No magic, just basic.']);
    return {post: {id: '', kind: 'referral', agentId: me, count: job.n, source: job.source, location: job.location}, monthTotal: mine, cheer: [line], milestone: 0};
  }
  function sendJob(job) {
    job.state = 'sending'; job.error = ''; if (route.current === 'feed') render();
    api('post', job.payload).then(function (r) {
      S.sending = (S.sending || []).filter(function (x) { return x !== job; });
      if (r.milestone) toast('🏆 Milestone!', r.milestone + ' names this month. The team has been told.');
      return refresh(true).then(function () { if (route.current === 'feed') render(); });
    }).catch(function (e) {
      job.state = 'failed'; job.error = errText(e); render();
      toast('Not posted yet', 'Tap Retry on the Feed. Your photo is still here.');
    });
  }
  function sendingHtml() {
    return (S.sending || []).map(function (job, k) {
      var what = job.n + (job.source === 'roadshow' ? ' roadshow name' : ' referral') + (job.n === 1 ? '' : 's') + (job.location ? ' · ' + job.location : '');
      return job.state === 'failed'
        ? '<div class="card" style="border-color:var(--bad)"><div class="row"><div style="font-size:22px">⚠️</div><div class="grow"><b>Not posted yet: ' + esc(what) + '</b><div class="faint">' + esc(job.error) + '</div></div></div><div class="actions"><button class="btn sm gold" data-retry="' + k + '">Retry</button><button class="btn sm danger" data-discard="' + k + '">Discard</button></div></div>'
        : '<div class="card row" style="padding:11px 14px"><div class="spinner" style="width:22px;height:22px;border-width:3px;margin:0"></div><div class="grow"><b>Posting ' + esc(what) + '…</b><div class="faint">Keep the app open for a few seconds.</div></div></div>';
    }).join('');
  }
  function wireSending(root) {
    root.querySelectorAll('[data-retry]').forEach(function (b) { b.onclick = function () { sendJob(S.sending[+b.dataset.retry]); }; });
    root.querySelectorAll('[data-discard]').forEach(function (b) {
      b.onclick = function () {
        confirmBox('Discard this post?', 'The photo and names you snapped will be thrown away. This cannot be undone.', 'Discard', true).then(function (y) { if (y) { S.sending.splice(+b.dataset.discard, 1); render(); } });
      };
    });
  }
  window.addEventListener('beforeunload', function (e) { if ((S.sending || []).some(function (j) { return j.state === 'sending'; })) { e.preventDefault(); e.returnValue = ''; } });
  function showCheer(r) {
    if (location.hash !== '#/feed') { route.keepModal = true; location.hash = '#/feed'; }
    if (S.sounds) SOUND.cheer(); confetti();
    var p = (r.post.id && S.data.posts.filter(function (x) { return x.id === r.post.id; })[0]) || r.post;
    modal('<div class="cheer"><div class="num">+' + r.post.count + '</div><div class="faint">' + (r.post.source === 'roadshow' ? 'roadshow name' : 'referral') + (r.post.count === 1 ? '' : 's') + ' added · ' + r.monthTotal + ' names this month</div>' +
      r.cheer.map(function (c) { return '<div class="msg-c">' + esc(c) + '</div>'; }).join('') +
      (r.milestone ? '<div class="notice good">🏆 Milestone: ' + r.milestone + ' names this month! The team has been told.</div>' : '') +
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
  /* 14-day call rule: a referral must be called within 14 days of posting, or its lead bonus is forfeited */
  function callInfo(r) {
    var days = (S.data && S.data.callDays) || 14, created = new Date(r.created).getTime(), deadline = created + days * 864e5;
    var st = CORE.callState(r, Date.now()), left = Math.ceil((deadline - Date.now()) / 864e5);
    var d = myt(new Date(deadline).toISOString()), when = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
    return {state: st, left: left, when: when, age: (Date.now() - created) / 864e5};
  }
  function callChip(r) {
    var c = callInfo(r);
    if (c.state === 'ok') return '<span class="pill approved">📞 called</span>';
    if (c.state === 'late') return '<span class="pill rejected">📞 called late · lead bonus forfeited</span>';
    if (c.state === 'forfeit') return '<span class="pill rejected">⛔ not called in ' + ((S.data && S.data.callDays) || 14) + ' days · lead bonus forfeited</span>';
    return '<span class="pill ' + (c.left <= 7 ? 'rejected' : 'pending') + '">📞 call by ' + c.when + ' · ' + (c.left <= 1 ? 'last day!' : c.left + ' days left') + '</span>';
  }
  function leadRow(r) {
    if (r.status === 'rejected') return '<div class="ref-edit" style="grid-template-columns:1fr"><div><b class="faint" style="text-decoration:line-through">' + esc(r.name) + '</b> <span class="faint">not counted</span></div></div>';
    var me = S.data.me, mine = r.agentId === me.id || me.leader;
    var btn = function (k, label) {
      var v = r[k];
      if (!mine) return v ? '<span class="chip">' + label + ' ' + stepPill(v) + '</span>' : '';
      if (!v || v === 'rejected') return '<button class="btn sm" data-step="' + k + '" data-ref="' + r.id + '"' + (k === 'close' && !(r.appt === 'pending' || r.appt === 'approved') ? ' disabled' : '') + '>' + label + '</button>' + (v === 'rejected' ? ' ' + stepPill(v) : '');
      return '<span class="chip">✓ ' + label + ' ' + stepPill(v) + (v === 'pending' || me.leader ? ' <a href="#" data-undo="' + k + '" data-ref="' + r.id + '" class="faint">undo</a>' : '') + '</span>';
    };
    var callBtn = !mine ? '' : r.calledAt ? '<span class="chip">✓ 📞 Called ' + ago(r.calledAt) + (!(r.appt === 'pending' || r.appt === 'approved') ? ' <a href="#" data-undo="call" data-ref="' + r.id + '" class="faint">undo</a>' : '') + '</span>'
      : '<button class="btn sm gold" data-step="call" data-ref="' + r.id + '">📞 Called</button>' + (r.phone ? ' <a class="btn sm" href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">Call now</a>' : '');
    return '<div class="ref-edit" style="grid-template-columns:1fr"><div><b>' + esc(r.name) + '</b> <span class="faint">' + (r.source === 'roadshow' ? '🎪 roadshow · ' : '') + (r.status === 'pending' ? 'lead waiting approval · ' : '') + ago(r.created) + '</span>' +
      '<div style="margin-top:5px">' + callChip(r) + '</div>' +
      '<div class="actions" style="margin-top:6px">' + callBtn + planBtns(r, mine) + btn('appt', '☕ Appointment done') + btn('close', '🎯 Closed case') + '</div></div></div>';
  }
  /* 📅 Set appointment (optional) or 🚫 No appointment, between Called and Appointment done */
  var ONFIELD_URL = 'https://wkahjian93.github.io/policy-summary-power-tools/', CALENDAR_URL = 'https://wkahjian93.github.io/redefine-calendar/';
  function whenLabel(iso) { var d = myt(iso); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ', ' + d.toISOString().slice(11, 16); }
  function planBtns(r, mine) {
    var met = r.appt === 'pending' || r.appt === 'approved';
    if (r.planAt) return '<span class="chip">📅 ' + whenLabel(r.planAt) + (mine && !met ? ' <a href="#" data-plan="' + r.id + '" class="faint">change</a> <a href="#" data-undo="plan" data-ref="' + r.id + '" class="faint">undo</a>' : '') + '</span>' +
      (mine ? '<a class="btn sm" href="' + ONFIELD_URL + '#/prospecting?name=' + encodeURIComponent(r.name) + '" target="_blank" rel="noopener">📒 On Field</a>' : '');
    if (r.noAppt) return '<span class="chip">🚫 No appointment' + (mine ? ' <a href="#" data-undo="noappt" data-ref="' + r.id + '" class="faint">undo</a>' : '') + '</span>';
    if (!mine || met) return '';
    return '<button class="btn sm" data-plan="' + r.id + '">📅 Set appointment</button><button class="btn sm" data-step="noappt" data-ref="' + r.id + '">🚫 No appointment</button>';
  }
  function setAppointment(r) {
    var d = r.planAt ? myt(r.planAt) : myt(new Date(Date.now() + 864e5).toISOString()), day = d.toISOString().slice(0, 10), tm = r.planAt ? d.toISOString().slice(11, 16) : '15:00';
    modal('<h2>📅 Appointment with ' + esc(r.name) + '</h2><div class="faint">Optional: only if they agreed to meet. Saved here and in your connected REDEFINE Calendar and On Field.</div>' +
      '<div class="tiles" style="margin:12px 0"><label class="field" style="margin:0"><span>Date</span><input type="date" id="ap-d" value="' + day + '"></label><label class="field" style="margin:0"><span>Time</span><input type="time" id="ap-t" value="' + tm + '"></label></div>' +
      '<div class="btns"><button class="btn" data-n>Cancel</button><button class="btn gold" data-y>Save appointment</button></div>', function (m, close) {
      m.querySelector('[data-n]').onclick = close;
      m.querySelector('[data-y]').onclick = function () {
        var dd = m.querySelector('#ap-d').value, tt = m.querySelector('#ap-t').value; if (!dd || !tt) return toast('Pick a date and time', '');
        close();
        act('step', {refId: r.id, step: 'plan', when: dd + 'T' + tt}, stepLocal(r.id, 'plan', true, dd + 'T' + tt), 'appointment');
        if (S.sounds) SOUND.ding();
        var lk = (S.data && S.data.links) || {};
        toast('Appointment saved 📅', (lk.calendar ? 'Added to your REDEFINE Calendar. ' : '') + (lk.onfield ? 'On Field logs it next time you open it.' : 'Tip: connect Calendar and On Field in Me.'));
      };
    });
  }
  function wireLeadRows(root) {
    root.querySelectorAll('[data-plan]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); setAppointment(S.data.refs.filter(function (x) { return x.id === b.dataset.plan; })[0]); }; });
    root.querySelectorAll('[data-step]').forEach(function (b) {
      b.onclick = function () {
        var r = S.data.refs.filter(function (x) { return x.id === b.dataset.ref; })[0], k = b.dataset.step;
        if (k === 'noappt') {
          return confirmBox('No appointment with ' + r.name + '?', 'You called but they did not agree to meet. It still counts as <b>called</b> (your lead bonus is kept). The lead moves to Done.', 'Yes').then(function (y) {
            if (y) { act('step', {refId: r.id, step: 'noappt'}, stepLocal(r.id, 'noappt', true), 'no appointment'); toast('Saved', 'Counted as called. Next lead! 💪'); }
          });
        }
        if (k === 'call') {
          var c = callInfo(r);
          return confirmBox('Called ' + r.name + '?', c.state === 'forfeit' ? 'It is past ' + ((S.data && S.data.callDays) || 14) + ' days, so the lead bonus is already forfeited, but calling still counts for your follow-up.' : 'Marking the call keeps your RM' + S.data.rates.lead + ' lead bonus for this name.', 'Yes, I called').then(function (y) {
            if (!y) return;
            act('step', {refId: r.id, step: 'call'}, stepLocal(r.id, 'call', true), 'call');
            if (S.sounds) SOUND.ding(); toast('Call marked 📞', 'Next: book the appointment ☕');
          });
        }
        var what = k === 'appt' ? 'had an appointment with' : 'closed a case with';
        confirmBox(k === 'appt' ? 'Appointment done?' : 'Closed a case?', 'You ' + what + ' <b>' + esc(r.name) + '</b>. ' + (S.data.me.leader ? 'It counts right away.' : 'Your leader will approve it for the RM ' + S.data.rates[k] + ' bonus.'), 'Yes, mark it').then(function (y) {
          if (!y) return;
          act('step', {refId: r.id, step: k}, stepLocal(r.id, k, true), k === 'appt' ? 'appointment done' : 'closed case');
          if (S.sounds) SOUND.cheer(); toast(k === 'appt' ? 'Appointment marked ☕' : 'Case closed 🎯', k === 'close' ? 'That is what referrals are for. Well done!' : 'One step closer. Keep going!');
        });
      };
    });
    root.querySelectorAll('[data-undo]').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        var label = {appt: 'appointment', close: 'closed case', call: 'call', plan: 'appointment date', noappt: 'no appointment'}[a.dataset.undo];
        confirmBox('Undo this?', 'Remove the ' + label + ' mark?', 'Undo', true).then(function (y) {
          if (y) act('step', {refId: a.dataset.ref, step: a.dataset.undo, done: false}, stepLocal(a.dataset.ref, a.dataset.undo, false), 'undo');
        });
      };
    });
  }
  function myOpenLeads() {   // my counted leads with a next step still to do
    var me = S.data.me.id;
    return S.data.refs.filter(function (r) { return r.agentId === me && r.status !== 'rejected' && (!r.appt || r.appt === 'rejected' || ((r.appt === 'approved' || r.appt === 'pending') && (!r.close || r.close === 'rejected'))); });
  }
  function myToCall() {   // my counted names not called yet and still inside the 14 days, most urgent first
    var me = S.data.me.id;
    return S.data.refs.filter(function (r) { return r.agentId === me && r.status !== 'rejected' && !r.purged && !r.calledAt && callInfo(r).state === 'due'; })
      .sort(function (a, b) { return a.created < b.created ? -1 : 1; });
  }
  function viewLeads() {
    var me = S.data.me.id, all = S.data.refs.filter(function (r) { return r.agentId === me; }).sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    var toCall = myToCall();
    var needAppt = all.filter(function (r) { return r.status !== 'rejected' && toCall.indexOf(r) < 0 && !r.noAppt && (!r.appt || r.appt === 'rejected'); });
    var needClose = all.filter(function (r) { return r.status !== 'rejected' && (r.appt === 'pending' || r.appt === 'approved') && (!r.close || r.close === 'rejected'); });
    var done = all.filter(function (r) { return r.close === 'pending' || r.close === 'approved' || r.status === 'rejected' || (r.noAppt && !r.appt); });
    var sec = function (t, sub, list, hot) { return list.length ? '<div class="card"' + (hot ? ' style="border-color:var(--gold)"' : '') + '><h2>' + t + ' (' + list.length + ')</h2><div class="faint">' + sub + '</div>' + list.slice(0, 60).map(leadRow).join('') + '</div>' : ''; };
    return remindersHtml() +
      (all.length ? '' : '<div class="empty">No leads yet. Snap a referral page first.</div>') +
      sec('📞 Call these first', 'Call within ' + ((S.data && S.data.callDays) || 14) + ' days of posting, or the RM' + S.data.rates.lead + ' lead bonus is forfeited. Tap 📞 Called after each call.', toCall, true) +
      sec('Called · appointment next', 'Agreed to meet? 📅 Set appointment. Not interested? 🚫 No appointment. Met them? ☕ (RM ' + S.data.rates.appt + ').', needAppt) +
      sec('Met, not closed yet', 'Closed a case? Tap 🎯 (RM ' + S.data.rates.close + ').', needClose) +
      sec('Done', 'Closed cases, called with no appointment, and leads not counted.', done);
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
        if (!y) return;
        S.stepDec = {};
        act('stepReview', {decisions: dec, confirm: true}, function (D, now) {
          D.refs.forEach(function (r) { var x = dec[r.id]; if (!x) return; ['appt', 'close'].forEach(function (k) { if (r[k] === 'pending' && (x[k] === 'approved' || x[k] === 'rejected')) { r[k] = x[k]; if (x[k] === 'approved') r.stepAt = now; } }); });
        }, 'approvals');
        if (S.sounds) SOUND.ding();
        toast('Saved ✅', yes + ' approved.'); location.hash = '#/board';
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
      '<div class="faint">Leads RM' + R.lead + ' each · Appointment RM' + R.appt + ' · Close RM' + R.close + '. Only approved items are paid; "waiting" needs leader approval first. A lead is paid only if it is called within ' + ((S.data && S.data.callDays) || 14) + ' days, otherwise it is forfeited.</div>' +
      (paid ? '<div class="notice good">✅ Marked paid on ' + dayLabel(paid.at) + (me.leader ? ' by ' + esc(paid.by) + ': RM' + paid.total.toLocaleString() : ': RM' + paid.mine.toLocaleString() + ' to you') + '</div>' : (mk < curMonth() ? '<div class="notice warn">Not marked paid yet.</div>' : '<div class="notice info">Month in progress · ' + daysLeftInMonth() + ' day' + (daysLeftInMonth() === 1 ? '' : 's') + ' left to update appointments and closes.</div>')) +
      '<div class="scroll-x"><table class="data"><tr><th>Name</th><th class="n">Approach</th><th class="n">Leads<br>(RM' + R.lead + ')</th><th class="n">Appt<br>(RM' + R.appt + ')</th><th class="n">Close<br>(RM' + R.close + ')</th><th class="n">Total</th></tr>' +
      rows.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + (x.approach || '') + '</td><td class="n">' + (x.leads || '') + (x.leadsRoadshow ? '<div class="faint">incl. ' + x.leadsRoadshow + ' 🎪</div>' : '') + w(x.leadsWaiting) + (x.leadsToCall ? '<div class="faint">+' + x.leadsToCall + ' to call</div>' : '') + (x.leadsForfeit ? '<div class="faint" style="color:var(--bad)">' + x.leadsForfeit + ' forfeited</div>' : '') + '</td><td class="n">' + (x.appt || '') + w(x.apptWaiting) + '</td><td class="n">' + (x.close || '') + w(x.closeWaiting) + '</td><td class="n"><b>RM' + x.total.toFixed(2) + '</b></td></tr>'; }).join('') +
      (me.leader ? '<tr><td><b>Total</b></td><td class="n"><b>' + sum('approach') + '</b></td><td class="n"><b>' + sum('leads') + '</b></td><td class="n"><b>' + sum('appt') + '</b></td><td class="n"><b>' + sum('close') + '</b></td><td class="n"><b>RM' + sum('total').toFixed(2) + '</b></td></tr>' : '') +
      '</table></div>';
    if (paid && me.leader && paid.total !== sum('total')) html += '<div class="notice warn">Numbers changed after you marked it paid (paid RM' + paid.total + ', now RM' + sum('total') + '). Check late approvals.</div>';
    if (me.leader) html += '<div class="actions"><button class="btn sm" id="bn-csv">Download spreadsheet (CSV)</button>' +
      (paid ? '<button class="btn sm danger" id="bn-unpaid">Undo paid</button>' : '<button class="btn sm primary" id="bn-paid">Mark ' + monthName(mk) + ' as paid</button>') +
      '<button class="btn sm wa" id="bn-report">📊 Share ' + monthName(mk) + ' report to WhatsApp</button><button class="btn sm wa" id="bn-remind">Remind team on WhatsApp</button><button class="btn sm" id="bn-email">📧 Email this report to the owner</button></div>' +
      (!paid && mk < curMonth() ? '<div class="notice warn" style="margin-top:8px">💰 Reminder: pay each agent the amount in the Total column, then tap <b>Mark ' + monthName(mk) + ' as paid</b> so they see it.</div>' : '');
    return html + '</div>';
  }
  viewBonus.wire = function (root) {
    var mk = /^\d{4}-\d{2}$/.test(route.arg) ? route.arg : curMonth(), q = function (s) { return root.querySelector(s); };
    q('#bn-month').onchange = function (e) { location.hash = '#/bonus/' + e.target.value; };
    if (q('#bn-csv')) q('#bn-csv').onclick = function () {
      var R = S.data.rates, rows = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, mk, R);
      var lines = [['Name', 'Approach', 'Leads Obtain (RM' + R.lead + ')', 'Successful Appointment (RM' + R.appt + ')', 'Close Case (RM' + R.close + ')', 'Total (RM)', 'Waiting approval', 'Leads to call', 'Leads forfeited (no call in 14 days)', 'Paid leads from roadshows'].join(',')]
        .concat(rows.map(function (x) { return ['"' + x.name.replace(/"/g, '""') + '"', x.approach, x.leads, x.appt, x.close, x.total.toFixed(2), x.leadsWaiting + x.apptWaiting + x.closeWaiting, x.leadsToCall, x.leadsForfeit, x.leadsRoadshow].join(','); }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], {type: 'text/csv'})); a.download = 'referral-bonus-' + mk + '.csv'; a.click();
    };
    if (q('#bn-paid')) q('#bn-paid').onclick = function () {
      var rows = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, mk, S.data.rates), tot = rows.reduce(function (s, x) { return s + x.total; }, 0), n = rows.filter(function (x) { return x.total; }).length;
      var waiting = rows.reduce(function (s, x) { return s + x.leadsWaiting + x.apptWaiting + x.closeWaiting; }, 0);
      confirmBox('Mark ' + monthName(mk) + ' as paid?', 'RM' + tot.toFixed(2) + ' to ' + n + ' agent' + (n === 1 ? '' : 's') + '. Each agent will see their paid amount.' + (waiting ? '<br><b>' + waiting + ' item(s) are still waiting approval</b> and are not included.' : ''), 'Mark paid').then(function (y) {
        if (y) {
          act('markPaid', {month: mk, confirm: true}, function (D, now) {
            var per = {}, total = 0; CORE.bonusTable(D.agents, D.posts, D.refs, mk, D.rates).forEach(function (x) { if (x.total) { per[x.id] = x.total; total += x.total; } });
            D.paid = D.paid || {}; D.paid[mk] = {at: now, by: D.me.name, total: total, per: per};
          }, 'paid mark');
          toast('Marked paid ✅', monthName(mk));
        }
      });
    };
    if (q('#bn-unpaid')) q('#bn-unpaid').onclick = function () {
      confirmBox('Undo paid?', monthName(mk) + ' will show as not paid again.', 'Undo', true).then(function (y) { if (y) act('markPaid', {month: mk, confirm: true, undo: true}, function (D) { if (D.paid) delete D.paid[mk]; }, 'undo paid'); });
    };
    if (q('#bn-remind')) q('#bn-remind').onclick = function () { remindWhatsApp(); };
    if (q('#bn-report')) q('#bn-report').onclick = function () { reportWhatsApp(mk); };
    if (q('#bn-email')) q('#bn-email').onclick = function () {
      confirmBox('Email the ' + monthName(mk) + ' report?', 'The payment report (who to pay how much, pending items, team summary, spreadsheet) goes to the owner email set on the server.', 'Send email').then(function (y) {
        if (y) api('emailReport', {month: mk}).then(function (r) { toast('Email sent 📧', monthName(mk) + ' report · RM' + r.total); }).catch(function (e) { toast('Not sent', errText(e)); });
      });
    };
  };
  /* Monthly report for the team WhatsApp group (the leader can edit it before sending) */
  function reportWhatsApp(mk) {
    var R = S.data.rates, rows = CORE.bonusTable(S.data.agents, S.data.posts, S.data.refs, mk, R);
    var refs = S.data.refs.filter(function (r) { return r.status !== 'rejected' && monthKey(r.created) === mk; });
    var rs = refs.filter(function (r) { return r.source === 'roadshow'; }).length, sum = function (k) { return rows.reduce(function (t, x) { return t + x[k]; }, 0); };
    var forfeit = sum('leadsForfeit'), paid = (S.data.paid || {})[mk];
    var top = rows.map(function (x) { return {name: x.name, n: x.leads + x.leadsToCall + x.leadsWaiting + x.leadsForfeit}; }).sort(function (a, b) { return b.n - a.n; })[0];
    var earners = rows.filter(function (x) { return x.total; }).sort(function (a, b) { return b.total - a.total; });
    var link = CFG.appUrl || location.href.split('#')[0];
    var lines = ['📊 *REDEFINE Prospecting · ' + monthName(mk) + ' Report*', '',
      '👥 Team: ' + refs.length + ' new names' + (rs ? ' (🎪 ' + rs + ' from roadshows)' : '') + ' · ☕ ' + sum('appt') + ' appointments · 🎯 ' + sum('close') + ' closes',
      top && top.n ? '🏆 Top prospector: ' + top.name + ' (' + top.n + ' names)' : '', '',
      '💰 *Bonus* (Lead RM' + R.lead + ' · Appt RM' + R.appt + ' · Close RM' + R.close + ')'].filter(function (l, i) { return l !== '' || i !== 3; });
    earners.forEach(function (x, i) { lines.push((i + 1) + '. ' + x.name + ' — ' + x.leads + ' leads / ' + x.appt + ' appt / ' + x.close + ' close → *RM' + x.total + '*'); });
    if (!earners.length) lines.push('No approved bonus this month yet.');
    lines.push('*Total: RM' + sum('total') + '*' + (paid ? ' · paid ✅' : ''));
    if (forfeit) lines.push('', '⛔ ' + forfeit + ' name' + (forfeit === 1 ? ' was' : 's were') + ' not called within ' + (S.data.callDays || 14) + ' days. Call early, keep your bonus! 📞');
    lines.push('', 'Hardwork on purpose. No magic, just basic. 💪', '👉 ' + link);
    modal('<h2>📊 ' + monthName(mk) + ' report</h2><div class="faint">Everyone in the group will see each agent\'s bonus. Edit if you like; WhatsApp will ask you to pick the group.</div><textarea id="wa-text" style="min-height:240px">' + esc(lines.join('\n')) + '</textarea><div class="btns"><button class="btn" data-n>Cancel</button><button class="btn wa" data-y>Open WhatsApp</button></div>', function (m, close) {
      m.querySelector('[data-n]').onclick = close;
      m.querySelector('[data-y]').onclick = function () { var t = m.querySelector('#wa-text').value; close(); window.location.href = 'https://wa.me/?text=' + encodeURIComponent(t); };
    });
  }
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
    var toCall = myToCall(), urgent = toCall.filter(function (r) { return callInfo(r).age >= ((S.data && S.data.callRemindDays) || 7); });
    var stale = myOpenLeads().filter(function (r) { return r.calledAt && (Date.now() - new Date(r.calledAt).getTime()) > 7 * 864e5 && (!r.appt || r.appt === 'rejected'); });
    if (left <= 3) out.push({id: 'monthend', icon: '⏰', text: (left ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'Last day') + ' this bonus month. Snap your pages and update appointments & closes today.', go: '#/leads'});
    if (!mineThisMonth && dom >= 5) out.push({id: 'none', icon: '📒', text: 'No referral page from you this month yet. Ask one happy client for names today.', go: '#/snap'});
    var noSelfie = S.data.posts.filter(function (p) { return p.agentId === me.id && p.source === 'roadshow' && !p.selfie && !p.purged && !p.photoRemoved && p.status === 'pending'; });
    if (noSelfie.length) out.push({id: 'selfie', icon: '🤳', text: 'Add your booth selfie for ' + noSelfie[0].location + (noSelfie.length > 1 ? ' (+' + (noSelfie.length - 1) + ' more)' : '') + ' so your leader can approve the names.', go: '#/post/' + noSelfie[0].id});
    if (CFG.firebase && !pushOn()) out.push({id: 'push', icon: '🔔', text: 'Turn on lock-screen pop-ups so you never miss a call reminder (no call in ' + ((S.data && S.data.callDays) || 14) + ' days = lead bonus forfeited).', go: '#/me'});
    if (urgent.length) { var soon = callInfo(urgent[0]).left; out.push({id: 'call', icon: '📞', text: 'Call ' + urgent.length + ' referral' + (urgent.length === 1 ? '' : 's') + ' (' + urgent.slice(0, 2).map(function (r) { return r.name; }).join(', ') + (urgent.length > 2 ? '…' : '') + '). ' + (soon <= 1 ? 'Last day' : soon + ' days left') + ' before the lead bonus is forfeited.', go: '#/leads'}); }
    else if (toCall.length) out.push({id: 'call', icon: '📞', text: toCall.length + ' new referral' + (toCall.length === 1 ? '' : 's') + ' to call. Call within ' + ((S.data && S.data.callDays) || 14) + ' days to keep the lead bonus.', go: '#/leads'});
    if (stale.length) out.push({id: 'stale', icon: '☕', text: stale.length + ' lead' + (stale.length === 1 ? '' : 's') + ' called over a week ago, no appointment yet. Met them? Tap ☕ Appointment done.', go: '#/leads'});
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
        if (tot) out.push({id: 'pay', icon: '💰', text: monthName(lm) + ' bonus is ready: RM' + tot.toFixed(2) + ' for ' + t.filter(function (x) { return x.total; }).length + ' agents. Share the report to WhatsApp, pay, then mark as paid.', go: '#/bonus/' + lm});
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
      toast('Reminder', r.text, null, r.go); notifyPhone('REDEFINE Prospecting reminder', r.text, r.go);
    });
    if (any) LS.set('remShown', shown);
  }

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
    var lk = S.data.links || {}, cap = function (app, ico, label, what) {
      var c = lk[app];
      return '<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="font-size:22px">' + ico + '</div><div class="grow"><b>' + label + '</b><div class="faint">' + what + '</div>' +
        (c ? '<div class="faint" style="color:var(--good)">✅ Connected' + (c.lastPull ? ' · last update ' + ago(c.lastPull) : ' · waiting for the first update') + '</div>' : '') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px"><button class="btn sm ' + (c ? '' : 'gold') + '" data-connect="' + app + '">' + (c ? 'Reconnect' : 'Connect') + '</button>' + (c ? '<button class="btn sm danger" data-disconnect="' + app + '">Disconnect</button>' : '') + '</div></div>';
    };
    html += '<div class="card"><h2>🔗 Connected apps</h2><div class="faint">Connect once. Then 📞 Called, 📅 Set appointment and ☕ Appointment done are added automatically.</div>' +
      cap('calendar', '📅', 'REDEFINE Calendar', 'Becomes Approach / appointment events (counts on the team board)') +
      cap('onfield', '📒', 'REDEFINE On Field', 'Becomes quick logs on the prospect\'s farm (三访)') + '</div>';
    html += '<div class="card"><h2>Settings</h2>' +
      '<label class="check"><input type="checkbox" id="me-music"' + (S.music ? ' checked' : '') + '><span>Team song ♪ (转介绍) · plays when the app opens</span></label>' +
      '<label class="check"><input type="checkbox" id="me-sound"' + (S.sounds ? ' checked' : '') + '><span>Sound for new messages and referrals</span></label>' +
      '<div style="padding:8px 0;border-top:1px solid var(--line);margin-top:6px"><b>🔔 Lock-screen pop-ups</b><div class="faint">Call reminders (day 7 to 14), approvals 💰 and more, even when the phone is locked.</div>' +
      (pushOn() ? (me.devices ? '<div class="notice good">ON for this phone.</div>' : '<div class="notice warn">The server lost this phone. Tap Reconnect.</div>') +
        '<div class="actions"><button class="btn sm" id="me-ptest">Test in 15 s (lock phone)</button><button class="btn sm" id="me-pfix">Reconnect</button><button class="btn sm danger" id="me-poff">Turn off</button></div>'
        : (notif === 'Blocked in phone settings' ? '<div class="notice bad">Blocked. Allow notifications for this app in your phone settings, then come back.</div>' : '') + '<div class="actions"><button class="btn gold" id="me-pon">Turn on pop-ups</button></div>') +
      '<div class="faint" style="margin-top:6px">' + (isIOS() ? 'iPhone' : 'Android / other') + (standalone() ? ' · home-screen app' : ' · browser') + ' · notifications: ' + ('Notification' in window ? Notification.permission : 'not supported') + ' · server has ' + (me.devices || 0) + ' phone(s) for you</div></div>' +
      '<div class="faint">Tip: install the app. iPhone: Safari → Share → Add to Home Screen. Android: Chrome menu → Add to Home screen.</div></div>';
    if (me.leader) {
      html += '<div class="card"><h2>Leader settings · bonus rates (RM)</h2><div class="tiles" style="grid-template-columns:1fr 1fr 1fr;margin:8px 0">' +
        [['lead', 'Per lead'], ['appt', 'Per appointment'], ['close', 'Per close']].map(function (x) { return '<label class="field" style="margin:0"><span>' + x[1] + '</span><input data-rate="' + x[0] + '" inputmode="decimal" value="' + R[x[0]] + '"></label>'; }).join('') +
        '</div><button class="btn sm primary" id="me-rate-save">Save rates</button><span class="faint"> Approach is counted, not paid.</span>' +
        '<h3 style="margin-top:16px">Team members (' + S.data.agents.length + ')</h3>' + S.data.agents.map(function (a) { return '<div class="row" style="padding:5px 0">' + avatar(a.id, true) + '<div class="grow">' + esc(a.name) + (a.role === 'leader' ? ' <span class="faint">leader</span>' : '') + '</div>' + (CFG.loginApi ? (a.linked ? '<span class="faint" style="margin-right:6px">✅ login</span>' : '<button class="btn sm" data-rlink="' + a.id + '">🔗 Link login</button> ') : '') + (a.id !== me.id ? (CFG.loginApi && a.linked ? '' : '<button class="btn sm" data-rpin="' + a.id + '">🔑 Reset PIN</button> ') + '<button class="btn sm danger" data-rm="' + a.id + '">Remove</button>' : '') + '</div>'; }).join('') + '</div>';
    }
    html += '<div class="card"><h2>Privacy rules</h2><ul class="steps muted"><li>📷 The original photo is read once by AI and never saved. Only the covered photo is kept.</li><li>👀 Team sees: agent name, client names, count, covered photo, comments.</li><li>🔒 Only the agent and leader see age, phone, gender and remarks.</li><li>📷 Photos (name list + roadshow selfie) are deleted 30 days after the leader approves, to save space.</li><li>🗑 After 3 months, phone, age, gender, remarks and the referrer\'s name are deleted automatically. The referred names stay.</li><li>📤 WhatsApp shares never include client names or numbers.</li></ul></div>' +
      (CFG.loginApi ? '' : '<div style="text-align:center;margin:20px 0 0"><button class="btn sm" id="me-pin">🔑 Change my PIN</button></div>') +
      '<div style="text-align:center;margin:16px 0 8px"><button id="me-out" style="background:none;border:0;color:var(--faint);font-size:12.5px;text-decoration:underline">Sign out of this phone</button></div>';
    return html;
  }
  viewMe.wire = function (root) {
    var q = function (s) { return root.querySelector(s); };
    q('#me-out').onclick = function () {
      confirmBox('Sign out of this phone?', 'You normally never need to. The app stays signed in like WhatsApp.<br>To come back you will need the <b>team code</b> and <b>your PIN</b>.', 'Sign out', true).then(function (y) { if (y) signOut(); });
    };
    q('#me-music').onchange = function (e) { S.music = e.target.checked; LS.set('musicOn', S.music); if (S.music) SOUND.startMusic(); else SOUND.stopMusic(); render(); };
    q('#me-sound').onchange = function (e) { S.sounds = e.target.checked; LS.set('sounds', S.sounds); if (S.sounds) SOUND.ding(); };
    if (q('#me-pon')) q('#me-pon').onclick = function () { enablePush(); };
    root.querySelectorAll('[data-connect]').forEach(function (b) {
      b.onclick = function () {
        var app = b.dataset.connect, url = app === 'calendar' ? CALENDAR_URL : ONFIELD_URL, name = app === 'calendar' ? 'REDEFINE Calendar' : 'REDEFINE On Field';
        b.disabled = true;
        api('linkCode', {app: app}).then(function (r) {
          b.disabled = false;
          var link = url + '#/link-prospecting?code=' + r.code;
          modal('<h2>Connect ' + name + '</h2><div class="muted">Tap the button below. ' + name + ' opens and connects itself (sign in there if it asks).</div>' +
            '<div class="btns"><button class="btn" data-n>Close</button><a class="btn gold" href="' + link + '" target="_blank" rel="noopener">Open ' + name + '</a></div>' +
            '<div class="faint" style="margin-top:14px">Not working? In ' + name + ' go to <b>Me → Connect REDEFINE Prospecting</b> and paste this code:</div>' +
            '<div style="display:flex;gap:6px;margin-top:6px"><input readonly value="' + r.code + '" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:9px;font-family:monospace;background:var(--bg)"><button class="btn sm" data-copy>Copy</button></div>' +
            '<div class="faint" style="margin-top:8px">Keep this code private. It lets that app see your lead names and appointment times.</div>', function (m, close) {
            m.querySelector('[data-n]').onclick = function () { close(); refresh(true); };
            m.querySelector('[data-copy]').onclick = function () { try { navigator.clipboard.writeText(r.code); toast('Copied', 'Paste it in ' + name + '.'); } catch (e) { m.querySelector('input').select(); } };
          });
        }).catch(function (e) { b.disabled = false; toast('Could not connect', errText(e)); });
      };
    });
    root.querySelectorAll('[data-disconnect]').forEach(function (b) {
      b.onclick = function () {
        var app = b.dataset.disconnect;
        confirmBox('Disconnect?', 'New activity will stop going to ' + (app === 'calendar' ? 'REDEFINE Calendar' : 'REDEFINE On Field') + '. What is already there stays.', 'Disconnect', true).then(function (y) {
          if (y) api('unlinkApp', {app: app}).then(function () { toast('Disconnected', ''); return refresh(true); }).catch(function (e) { toast('Not changed', errText(e)); });
        });
      };
    });
    if (q('#me-pfix')) q('#me-pfix').onclick = function () { repairPush(true); };
    if (q('#me-poff')) q('#me-poff').onclick = function () { confirmBox('Turn off pop-ups?', 'You will miss call reminders, and leads not called in ' + (S.data.callDays || 14) + ' days lose their bonus.', 'Turn off', true).then(function (y) { if (y) pushOff(); }); };
    if (q('#me-ptest')) q('#me-ptest').onclick = function () { toast('Lock your phone now 🔒', 'A pop-up should arrive in about 15 seconds.'); api('pushtest', {delay: 15}).catch(function () {}); };
    if (q('#me-rate-save')) q('#me-rate-save').onclick = function () {
      var v = {}; root.querySelectorAll('[data-rate]').forEach(function (i) { v[i.dataset.rate] = i.value.trim(); });
      confirmBox('Change bonus rates?', 'Lead RM' + esc(v.lead) + ' · Appointment RM' + esc(v.appt) + ' · Close RM' + esc(v.close) + '.<br>This also changes the totals of months not yet marked paid.', 'Save').then(function (y) {
        if (y) api('settings', {rates: v, confirm: true}).then(function () { toast('Saved', 'Bonus rates updated.'); return refresh(true); }).catch(function (e) { toast('Not saved', errText(e)); });
      });
    };
    if (q('#me-pin')) q('#me-pin').onclick = function () { askNewPin(false); };
    root.querySelectorAll('[data-rlink]').forEach(function (b) {
      b.onclick = function () {
        var a = agent(b.dataset.rlink), ph = window.prompt('Link ' + a.name + ' to their REDEFINE login.\nType their phone number (the one on the login admin page):', '');
        if (!ph) return;
        b.disabled = true;
        api('centrallink', {agentId: a.id, phone: ph}).then(function (r) { toast('Linked', a.name + ' → ' + r.name + '. Next time they sign in with phone + email + PIN.'); return refresh(true); })
          .catch(function (e) { b.disabled = false; toast('Not linked', errText(e)); });
      };
    });
    root.querySelectorAll('[data-rpin]').forEach(function (b) {
      b.onclick = function () {
        var a = agent(b.dataset.rpin);
        confirmBox('Reset ' + a.name + '\'s PIN?', 'You get a temporary 6-digit PIN to send them. They sign in with it and must choose their own PIN straight away.<br>Their old PIN stops working. Phones already signed in stay signed in. Their referrals, leads and bonus stay as they are.', 'Reset PIN').then(function (y) {
          if (!y) return;
          api('resetPin', {agentId: a.id, confirm: true}).then(function (r) {
            var msg = 'Hi ' + r.name + ', your REDEFINE Prospecting PIN was reset.\nSign in with your name and this temporary PIN: ' + r.temp + '\nThe app will then ask you to choose your own PIN.\n' + location.origin + location.pathname;
            modal('<h2>🔑 Temporary PIN for ' + esc(r.name) + '</h2><div style="font-size:34px;font-weight:800;letter-spacing:6px;text-align:center;margin:14px 0;font-family:monospace">' + r.temp + '</div>' +
              '<div class="muted">Send it to ' + esc(r.name) + ' privately (not in the group). They also need the team code.</div>' +
              '<div class="btns"><button class="btn" data-copy>Copy</button><a class="btn gold" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">WhatsApp</a></div><div class="btns"><button class="btn" data-n>Done</button></div>', function (m, close) {
              m.querySelector('[data-n]').onclick = close;
              m.querySelector('[data-copy]').onclick = function () { try { navigator.clipboard.writeText(msg); toast('Copied', 'Paste it in a private chat.'); } catch (e) {} };
            });
          }).catch(function (e) { toast('Not reset', errText(e)); });
        });
      };
    });
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
    keepStorage(); loadCache(); refreshPush();
    if (S.data) route(); else render();   // open instantly with what was saved on this phone
    refresh(!!S.data).then(function () { startPolling(); route(); });
  }
  if (S.auth && !S.auth.token && S.auth.code) {   // phone signed in before device keys: switch it over quietly
    render();
    api('upgrade', {device: deviceName()}).then(function (r) { S.auth = {token: r.token, name: S.auth.name}; LS.set('auth', S.auth); start(); })
      .catch(function (e) { if (/^(wrong_pin|wrong_code|removed|signed_out)$/.test(e.message)) signOut(true, e.message); else start(); });
  } else if (S.auth) start(); else route();
})();
