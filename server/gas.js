/* ---------- Google Apps Script part ----------
   Script properties (Project Settings > Script properties):
     TEAM_CODE       required, 6+ characters: agents sign in with it
     LEADER_CODE     required, 10+ characters: you sign in with it as leader (approve, bonus, remove)
     OPENAI_API_KEY  required: reads the referral photos (sent with store:false; the original photo is never kept)
     MODEL           optional (default gpt-6.1-terra)
     DAILY_READS     optional, photo readings per agent per day (default 40)
     FCM_SERVICE_ACCOUNT  for lock-screen pop-ups: the whole Firebase service-account JSON (the same one the REDEFINE Calendar uses)
     APP_URL         optional, the app link used when a pop-up is tapped (default the GitHub Pages link)
     OWNER_EMAIL     optional, gets the monthly payment report by email on the 5th (kept here, not in the public code)
   Data: private Google Sheet "REDEFINE Referrals Data" and Drive folder "REDEFINE Referrals Photos"
   (only the covered/censored photos). Both are created by setup(), which also installs the daily auto-delete. */

function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return reply({ok: true, app: 'REDEFINE Prospecting'}); }

function doPost(e) {
  try {
    var out = CORE.handle(JSON.parse(e.postData.contents), GAS);
    GAS.flushPush();   // pop-ups go out after the data is saved and the lock is released
    return reply(out);
  } catch (err) {
    if (err.appCode) return reply({error: err.appCode});
    console.error('server error: ' + (err && err.stack));
    return reply({error: 'server_error'});
  }
}

var GAS = (function () {
  var P = PropertiesService.getScriptProperties();
  var cache = {}, outbox = [];

  function book() {
    var id = P.getProperty('SHEET_ID');
    if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
    var b = SpreadsheetApp.create('REDEFINE Referrals Data');
    P.setProperty('SHEET_ID', b.getId());
    return b;
  }
  function tab(name) {
    var b = book(), s = b.getSheetByName(name), cols = CORE.TABLES[name];
    if (!s) {
      s = b.insertSheet(name);
      s.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      s.setFrozenRows(1);
      s.getRange(1, 1, s.getMaxRows(), cols.length).setNumberFormat('@');
      var first = b.getSheetByName('Sheet1');
      if (first && b.getSheets().length > 1) b.deleteSheet(first);
    }
    return s;
  }
  function load(name) {
    if (cache[name]) return JSON.parse(JSON.stringify(cache[name]));
    var cols = CORE.TABLES[name], s = tab(name), n = s.getLastRow() - 1, rows = [];
    if (n > 0) s.getRange(2, 1, n, cols.length).getValues().forEach(function (r) {
      if (r.every(function (v) { return v === '' || v === null; })) return;
      var o = {}; cols.forEach(function (c, i) { o[c] = r[i] instanceof Date ? r[i].toISOString() : (r[i] === null ? '' : String(r[i])); }); rows.push(o);
    });
    cache[name] = rows;
    return JSON.parse(JSON.stringify(rows));
  }
  function save(name, rows) {
    var cols = CORE.TABLES[name], s = tab(name), old = s.getLastRow() - 1;
    var vals = rows.map(function (o) { return cols.map(function (c) { var v = o[c]; return v === undefined || v === null ? '' : String(v); }); });
    if (vals.length) s.getRange(2, 1, vals.length, cols.length).setNumberFormat('@').setValues(vals);
    if (old > vals.length) s.getRange(vals.length + 2, 1, old - vals.length, cols.length).clearContent();
    cache[name] = JSON.parse(JSON.stringify(rows));
  }
  function folder() {
    var id = P.getProperty('FOLDER_ID'), f;
    try { f = id && DriveApp.getFolderById(id); } catch (e) {}
    if (!f) { f = DriveApp.createFolder('REDEFINE Referrals Photos'); P.setProperty('FOLDER_ID', f.getId()); }
    return f;
  }
  function ai(prompt, b64) {
    var key = P.getProperty('OPENAI_API_KEY'); if (!key) { var e = new Error('no_api_key'); e.appCode = 'no_api_key'; throw e; }
    var res = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: {Authorization: 'Bearer ' + key},
      payload: JSON.stringify({
        model: P.getProperty('MODEL') || 'gpt-6.1-terra', store: false, max_output_tokens: 12000,
        reasoning: {effort: 'medium'}, text: {format: {type: 'json_object'}},
        input: [{role: 'user', content: [{type: 'input_text', text: prompt}, {type: 'input_image', image_url: 'data:image/jpeg;base64,' + b64, detail: 'high'}]}]
      })
    });
    var status = res.getResponseCode(), code = '';
    if (status === 401) code = 'bad_api_key'; else if (status === 429) code = /insufficient_quota/.test(res.getContentText()) ? 'no_credit' : 'rate_limited';
    else if (status !== 200) { console.error('openai status ' + status); code = 'ai_unavailable'; }
    if (code) { var er = new Error(code); er.appCode = code; throw er; }
    var msg = JSON.parse(res.getContentText()), text = '';
    (msg.output || []).forEach(function (it) { if (it.type === 'message') (it.content || []).forEach(function (c) { if (c.type === 'output_text') text += c.text; }); });
    return text;
  }
  /* Firebase Cloud Messaging (HTTP v1). The service account signs a short-lived token; it is cached for 50 minutes. */
  function fcmAccess(sa) {
    var c = CacheService.getScriptCache(), t = c.get('fcm_at'); if (t) return t;
    var b64 = function (x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); };
    var now = Math.floor(Date.now() / 1000);
    var head = b64(JSON.stringify({alg: 'RS256', typ: 'JWT'})), claim = b64(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600}));
    var sig = b64(Utilities.computeRsaSha256Signature(head + '.' + claim, sa.private_key));
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {method: 'post', muteHttpExceptions: true, payload: {grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig}});
    if (res.getResponseCode() !== 200) { console.error('fcm auth ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300)); return ''; }
    t = JSON.parse(res.getContentText()).access_token; c.put('fcm_at', t, 3000);
    return t;
  }
  function flushPush() {
    if (!outbox.length) return;
    var list = outbox; outbox = [];
    var raw = P.getProperty('FCM_SERVICE_ACCOUNT'); if (!raw) { console.log('pop-up skipped: FCM_SERVICE_ACCOUNT not set'); return; }
    try {
      var sa = JSON.parse(raw), at = fcmAccess(sa); if (!at) return;
      cache = {};
      var devices = load('devices'), base = P.getProperty('APP_URL') || 'https://wkahjian93.github.io/redefine-referrals-tracker/', reqs = [], tokens = [];
      list.forEach(function (n) {
        devices.forEach(function (d) {
          if (n.ids.indexOf(d.agentId) < 0) return;
          tokens.push(d.token);
          reqs.push({url: 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
            headers: {Authorization: 'Bearer ' + at},
            payload: JSON.stringify({message: {token: d.token,
              data: {title: n.note.title, body: n.note.body || '', url: n.note.url || '#/', tag: n.note.tag || ''},
              webpush: {headers: {Urgency: 'high', TTL: '86400'},
                notification: {title: n.note.title, body: n.note.body || '', icon: base + 'icons/icon-192.png', badge: base + 'icons/icon-192.png', tag: n.note.tag || undefined, renotify: !!n.note.tag},
                fcm_options: {link: base + (n.note.url || '#/')}}}})});
        });
      });
      if (!reqs.length) { console.log('pop-up "' + list[0].note.title + '": no registered phone'); return; }
      var dead = [], ok = 0;
      for (var i = 0; i < reqs.length; i += 50) UrlFetchApp.fetchAll(reqs.slice(i, i + 50)).forEach(function (r, k) {
        var code = r.getResponseCode(), body = r.getContentText();
        if (code === 200) ok++;
        else if (code === 404 || code === 410 || /UNREGISTERED/.test(body)) { dead.push(tokens[i + k]); console.warn('phone no longer registered (removed): fcm ' + code); }
        else console.warn('fcm ' + code + ' ' + body.slice(0, 300));
      });
      console.log('pop-ups: ' + ok + ' of ' + reqs.length + ' accepted by Firebase');
      if (dead.length) { var l = LockService.getScriptLock(); l.waitLock(20000); try { cache = {}; save('devices', load('devices').filter(function (d) { return dead.indexOf(d.token) < 0; })); } finally { l.releaseLock(); } }
    } catch (e) { console.error('push failed: ' + (e && e.stack)); }
  }

  return {
    load: load, save: save,
    withLock: function (fn) { var l = LockService.getScriptLock(); l.waitLock(20000); try { cache = {}; return fn(); } finally { l.releaseLock(); } },
    prop: function (k) { return P.getProperty(k) || ''; },
    fails: function (add, key) { var c = CacheService.getScriptCache(), k = 'fails_' + Utilities.base64EncodeWebSafe(String(key || 'all')).slice(0, 200), n = +(c.get(k) || 0); if (add) { c.put(k, String(n + add), 900); Utilities.sleep(800); } return n; },
    now: function () { return new Date(); },
    // REDEFINE Login (Script properties LOGIN_API = login address, LOGIN_KEY = its read-only key).
    centralCheck: function (token) {   // {id, name, phone} for an active agent, else null
      var base = P.getProperty('LOGIN_API'); if (!base || !token) return null;
      try {
        var r = UrlFetchApp.fetch(base + '/api/check', {method: 'post', contentType: 'application/json', payload: JSON.stringify({token: token}), muteHttpExceptions: true});
        if (r.getResponseCode() !== 200) return null;
        var j = JSON.parse(r.getContentText() || '{}'); return j && j.ok && j.agent ? j.agent : null;
      } catch (e) { console.warn('REDEFINE Login check failed: ' + e); return null; }
    },
    centralList: function () {   // [{id, name, phone, status}], or null when not set up or unreachable
      var base = P.getProperty('LOGIN_API'), key = P.getProperty('LOGIN_KEY'); if (!base || !key) return null;
      try {
        var r = UrlFetchApp.fetch(base + '/svc/agents', {headers: {'x-service-key': key}, muteHttpExceptions: true});
        if (r.getResponseCode() !== 200) { console.warn('REDEFINE Login list: HTTP ' + r.getResponseCode()); return null; }
        var j = JSON.parse(r.getContentText() || '{}'); return j && j.ok && j.agents ? j.agents : null;
      } catch (e) { console.warn('REDEFINE Login list failed: ' + e); return null; }
    },
    centralFindPhone: function (phone) {   // the active login account with this phone number, or null
      var d = String(phone || '').replace(/\D/g, ''); if (d.charAt(0) === '0') d = '60' + d.slice(1);
      if (!/^60\d{8,10}$/.test(d)) return null;
      var list = GAS.centralList() || [];
      return list.filter(function (a) { return a.phone === d && a.status === 'active'; })[0] || null;
    },
    loginDue: function () {   // true at most once every 10 minutes (and only when REDEFINE Login is set up)
      if (!P.getProperty('LOGIN_API') || !P.getProperty('LOGIN_KEY')) return false;
      var c = CacheService.getScriptCache(); if (c.get('rl_due')) return false;
      c.put('rl_due', '1', 600); return true;
    },
    random: Math.random,
    hash: function (t) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); },
    version: function (bump) { var v = +(P.getProperty('VER') || 1); if (bump) { v++; P.setProperty('VER', String(v)); } return v; },
    putPhoto: function (name, b64) { return folder().createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', name)).getId(); },
    getPhoto: function (id) { return Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); },
    trashPhoto: function (id) { DriveApp.getFileById(id).setTrashed(true); },   // Drive empties trash after 30 days
    mail: function (to, subject, html, csv, csvName) { MailApp.sendEmail({to: to, subject: subject, htmlBody: html, name: 'REDEFINE Prospecting', attachments: csv ? [Utilities.newBlob(csv, 'text/csv', csvName || 'report.csv')] : []}); },
    ai: ai, flushPush: flushPush, sleep: function (ms) { Utilities.sleep(ms); },
    push: function (ids, note) { if (ids && ids.length) outbox.push({ids: ids, note: note}); }
  };
})();

/* Runs every night (installed by setup): wipes client details older than 3 months, keeps the name. */
/* Runs every morning at 9am (installed by setup): lock-screen reminder to call referrals waiting 7+ days (bonus forfeits at 14). */
function dailyCallReminder() { var r = GAS.withLock(function () { return CORE.callReminders(GAS); }); GAS.flushPush(); console.log('Call reminders: ' + r.reminded + ' agent(s)'); }

/* Runs on the 5th of every month at 9am (installed by setup): last month's report + pay reminder to the leader(s). */
function monthlyReport() { var r = GAS.withLock(function () { return CORE.monthlyReport(GAS); }); GAS.flushPush(); console.log('Monthly report ' + r.month + ': RM' + r.total + ' to ' + r.agents + ' agent(s), sent to ' + r.sent + ' leader(s), owner email ' + (r.emailed ? 'sent' : 'not set')); }

function dailyPurge() { GAS.withLock(function () { var r = CORE.purge(GAS); console.log('Auto-delete: ' + r.wiped + ' names wiped, ' + r.photos + ' photos deleted'); }); }

/* Run once from the editor: creates the Sheet and Drive folder, asks for permissions, installs the 2am auto-delete. */
function setup() {
  Object.keys(CORE.TABLES).forEach(function (t) { GAS.load(t); });
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();   // asks for permission to send the monthly report email
  UrlFetchApp.fetch('https://api.openai.com/v1/models', {muteHttpExceptions: true});
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyPurge' || t.getHandlerFunction() === 'dailyCallReminder' || t.getHandlerFunction() === 'monthlyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('monthlyReport').timeBased().onMonthDay(5).atHour(9).inTimezone('Asia/Kuala_Lumpur').create();
  ScriptApp.newTrigger('dailyCallReminder').timeBased().atHour(9).everyDays(1).inTimezone('Asia/Kuala_Lumpur').create();
  ScriptApp.newTrigger('dailyPurge').timeBased().atHour(2).everyDays(1).inTimezone('Asia/Kuala_Lumpur').create();
  var P = PropertiesService.getScriptProperties();
  console.log('Ready. Data sheet: ' + SpreadsheetApp.openById(P.getProperty('SHEET_ID')).getUrl());
  if ((P.getProperty('TEAM_CODE') || '').length < 6) console.warn('Add TEAM_CODE (6+ characters) in Script properties.');
  if ((P.getProperty('LEADER_CODE') || '').length < 10) console.warn('Add LEADER_CODE (10+ characters) in Script properties.');
  if (!P.getProperty('OPENAI_API_KEY')) console.warn('Add OPENAI_API_KEY in Script properties.');
  if (!P.getProperty('FCM_SERVICE_ACCOUNT')) console.warn('Add FCM_SERVICE_ACCOUNT in Script properties (lock-screen pop-ups).');
  else { try { console.log('Firebase project: ' + JSON.parse(P.getProperty('FCM_SERVICE_ACCOUNT')).project_id); } catch (e) { console.warn('FCM_SERVICE_ACCOUNT is not valid JSON - paste the whole file.'); } }
}
