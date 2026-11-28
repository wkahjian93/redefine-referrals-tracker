// Local test of the REDEFINE Login sign-in (port 5199): serves docs/ and runs the REAL server rules (docs/core.js)
// in memory at /gas, with a stand-in login service at /fake-login. Made-up people only; nothing leaves this PC.
//   Kah Jian (leader, linked):    012-1111111 / kj@test.my  / PIN 111111
//   Ali Tan (not linked yet):     012-3333333 / ali@test.my / PIN 333333 -> "I used Prospecting before": old name Ali Tan + old PIN 1234
//   New agent (first-time code):  012-2222222 / new@test.my / code 222222 -> choose a PIN -> "I am new"
//   Leader team code fallback: test-leader-code (name Kah Jian, PIN 1234)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const CORE = require('../docs/core.js'), memStore = require('./memstore.js');
const DOCS = path.join(__dirname, '..', 'docs'), PORT = +process.env.PORT || 5199;

const FAKE = [{id: 'F1', name: 'WONG KAH JIAN', phone: '60121111111', email: 'kj@test.my', pin: '111111', status: 'active'},
  {id: 'F3', name: 'ALI TAN', phone: '60123333333', email: 'ali@test.my', pin: '333333', status: 'active'},
  {id: 'F2', name: 'NEW AGENT TAN', phone: '60122222222', email: 'new@test.my', code: '222222', status: 'active'}], TOK = {};
function fakeLogin(p, d) {
  if (p === '/api/check') { const x = FAKE.find(y => y.id === TOK[d.token] && y.status === 'active'); return x ? {ok: true, agent: {id: x.id, name: x.name, phone: x.phone}} : {ok: false, error: 'signed_out'}; }
  if (p === '/api/logout') { delete TOK[d.token]; return {ok: true}; }
  const ph = String(d.phone || '').replace(/\D/g, '').replace(/^0/, '60'), a = FAKE.find(x => x.phone === ph && x.email === String(d.email || '').trim().toLowerCase() && x.status === 'active');
  if (!a) return {ok: false, error: 'no_match'};
  const tok = () => { const t = 'fk' + crypto.randomBytes(12).toString('hex'); TOK[t] = a.id; return {ok: true, token: t, agent: {id: a.id, name: a.name, phone: a.phone}}; };
  if (p === '/api/login') { if (a.code && d.secret === a.code) return {ok: true, next: 'set_pin'}; return a.pin && d.secret === a.pin ? tok() : {ok: false, error: 'wrong', left: 4}; }
  if (p === '/api/set-pin') { if (!a.code || d.code !== a.code) return {ok: false, error: 'wrong'}; if (!/^\d{6}$/.test(d.pin)) return {ok: false, error: 'pin_format'}; a.pin = d.pin; a.code = ''; return tok(); }
  return {ok: false, error: 'not_found'};
}
let due = false;
const store = memStore({props: {LOGIN_API: 'fake', LOGIN_KEY: 'fake'}, check: t => fakeLogin('/api/check', {token: t}).agent || null,
  list: () => FAKE.map(a => ({id: a.id, name: a.name, phone: a.phone, status: a.status})), loginDue: () => { const d = due; due = false; return d; },
  findPhone: p => { const d = String(p).replace(/\D/g, '').replace(/^0/, '60'); return FAKE.find(a => a.phone === d && a.status === 'active') || null; }});
const ag = [['k1', 'Kah Jian', 'leader', 'F1'], ['a1', 'Ali Tan', 'agent', ''], ['m1', 'Mei Ling', 'agent', '']];
store.save('agents', ag.map(([id, name, role, central]) => ({id, name, role, central, pin: store.hash('rrt|1234|' + name.toLowerCase()), created: new Date().toISOString(), active: 'true', pinTemp: '', centralOff: ''})));

const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg'};
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const body = fn => { let b = ''; req.on('data', c => b += c); req.on('end', () => { let d = {}; try { d = JSON.parse(b); } catch (e) {} res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(fn(d))); }); };
  if (url === '/gas' && req.method === 'POST') return body(q => { try { const r = CORE.handle(q, store); if (q.op !== 'sync' && q.op !== 'feed') console.log(q.op, 'ok'); return r; } catch (e) { console.log(q.op, e.appCode || e); return {error: e.appCode || 'server_error'}; } });
  if (url.startsWith('/fake-login/') && req.method === 'POST') { const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); return body(d => fakeLogin(url.slice('/fake-login'.length), Object.assign(bearer ? {token: bearer} : {}, d))); }
  if (url === '/__terminate' || url === '/__restore') { FAKE[1].status = url === '/__terminate' ? 'archived' : 'active'; due = true; res.writeHead(200); return res.end('ok'); }
  if (url === '/config.js') { res.writeHead(200, {'Content-Type': 'text/javascript'}); return res.end("window.RRT_CONFIG={api:location.origin+'/gas',loginApi:location.origin+'/fake-login',appUrl:location.origin+'/',sample:'SAMPLE · fake people'};"); }
  if (url === '/sw.js') { res.writeHead(404); return res.end(); }
  const f = path.join(DOCS, url.replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('Prospecting login test: http://localhost:' + PORT));
