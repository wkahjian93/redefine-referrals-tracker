/* ---------- Google Apps Script part ----------
   Script properties (Project Settings > Script properties):
     TEAM_CODE       required, 6+ characters: agents sign in with it
     LEADER_CODE     required, 10+ characters: you sign in with it as leader (approve, bonus, remove)
     OPENAI_API_KEY  required: reads the referral photos (sent with store:false; the original photo is never kept)
     MODEL           optional (default gpt-6.1-terra)
     DAILY_READS     optional, photo readings per agent per day (default 40)
   Data: private Google Sheet "REDEFINE Referrals Data" and Drive folder "REDEFINE Referrals Photos"
   (only the covered/censored photos). Both are created by setup(), which also installs the daily auto-delete. */

function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return reply({ok: true, app: 'REDEFINE Referrals Tracker'}); }

function doPost(e) {
  try {
    return reply(CORE.handle(JSON.parse(e.postData.contents), GAS));
  } catch (err) {
    if (err.appCode) return reply({error: err.appCode});
    console.error('server error: ' + (err && err.stack));
    return reply({error: 'server_error'});
  }
}

var GAS = (function () {
  var P = PropertiesService.getScriptProperties();
  var cache = {};

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
  return {
    load: load, save: save,
    withLock: function (fn) { var l = LockService.getScriptLock(); l.waitLock(20000); try { cache = {}; return fn(); } finally { l.releaseLock(); } },
    prop: function (k) { return P.getProperty(k) || ''; },
    fails: function (add) { var c = CacheService.getScriptCache(), n = +(c.get('fails') || 0); if (add) { c.put('fails', String(n + add), 900); Utilities.sleep(800); } return n; },
    now: function () { return new Date(); },
    random: Math.random,
    hash: function (t) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); },
    version: function (bump) { var v = +(P.getProperty('VER') || 1); if (bump) { v++; P.setProperty('VER', String(v)); } return v; },
    putPhoto: function (name, b64) { return folder().createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', name)).getId(); },
    getPhoto: function (id) { return Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); },
    trashPhoto: function (id) { DriveApp.getFileById(id).setTrashed(true); },   // Drive empties trash after 30 days
    ai: ai
  };
})();

/* Runs every night (installed by setup): wipes client details older than 3 months, keeps the name. */
function dailyPurge() { GAS.withLock(function () { var r = CORE.purge(GAS); console.log('Auto-delete: ' + r.wiped + ' names wiped, ' + r.photos + ' photos deleted'); }); }

/* Run once from the editor: creates the Sheet and Drive folder, asks for permissions, installs the 2am auto-delete. */
function setup() {
  Object.keys(CORE.TABLES).forEach(function (t) { GAS.load(t); });
  DriveApp.getRootFolder();
  UrlFetchApp.fetch('https://api.openai.com/v1/models', {muteHttpExceptions: true});
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyPurge') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyPurge').timeBased().atHour(2).everyDays(1).inTimezone('Asia/Kuala_Lumpur').create();
  var P = PropertiesService.getScriptProperties();
  console.log('Ready. Data sheet: ' + SpreadsheetApp.openById(P.getProperty('SHEET_ID')).getUrl());
  if ((P.getProperty('TEAM_CODE') || '').length < 6) console.warn('Add TEAM_CODE (6+ characters) in Script properties.');
  if ((P.getProperty('LEADER_CODE') || '').length < 10) console.warn('Add LEADER_CODE (10+ characters) in Script properties.');
  if (!P.getProperty('OPENAI_API_KEY')) console.warn('Add OPENAI_API_KEY in Script properties.');
}
