// Local test server (port 5198): serves docs/ and runs the REAL server rules (docs/core.js) in memory at /gas,
// seeded with a SAMPLE team (fake agents and fake clients). Nothing leaves this PC; the AI is a stand-in.
// Team code "test-team", leader code "test-leader-code", every sample member's PIN is 1234.
// Also serves tools/sample-maker.html, which draws a filled sample of the real referral-book page.
const http = require('http'), fs = require('fs'), path = require('path');
const CORE = require('../docs/core.js'), memStore = require('./memstore.js');
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs'), FIX = path.join(ROOT, 'test', 'fixtures');
const store = memStore();

function seed() {
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const now = Date.now(), iso = t => new Date(t).toISOString();
  const team = ['Kah Jian', 'Alicia Tan', 'Marcus Lim', 'Siti Nur Aisyah', 'Daniel Ong', 'Jia Wen', 'Kelvin Goh', 'Priya Nair'];
  const agents = team.map((name, i) => ({id: 'a' + i, name, pin: store.hash('rrt|1234|' + name.toLowerCase()), role: i === 0 ? 'leader' : 'agent', created: iso(now - 200 * 864e5), active: 'true'}));
  const first = ['Wei Jie', 'Mei Yee', 'Hafiz', 'Bee Leng', 'Jun Kit', 'Nurul', 'Arjun', 'Shu Ting', 'Hui Min', 'Zul', 'Ken', 'Yong Sheng', 'Farah', 'Chee Keong', 'Li Ying', 'Ravi', 'Amir', 'Xin Yi', 'Boon Hock', 'Aina'];
  const last = ['Lim', 'Tan', 'Ong', 'Lee', 'Chong', 'Wong', 'Ismail', 'Goh', 'Khoo', 'Teoh', 'Ng', 'Rahman', 'Yeoh', 'Chan'];
  const weight = [0.4, 1.6, 1.2, 0.9, 1.4, 0.5, 0.3, 1.0];   // some agents post more than others
  const posts = [], refs = []; let id = 0;
  for (let d = 120; d >= 0; d--) {
    agents.forEach((a, i) => {
      if (rnd() > 0.06 * weight[i] * (d < 30 ? 1.4 : 1)) return;
      const t = now - d * 864e5 - rnd() * 8 * 3600e3, n = 1 + Math.floor(rnd() * 5), pid = 'p' + (++id);
      const old = d > 14, status = old ? (rnd() < 0.85 ? 'approved' : 'partial') : (d > 3 ? 'approved' : 'pending');
      posts.push({id: pid, agentId: a.id, kind: 'referral', giver: last[Math.floor(rnd() * last.length)] + ' ' + first[Math.floor(rnd() * first.length)], text: '', photoId: '', count: n, status, created: iso(t), purged: ''});
      for (let k = 0; k < n; k++) {
        const nm = first[Math.floor(rnd() * first.length)] + ' ' + last[Math.floor(rnd() * last.length)];
        const rs = status === 'partial' && k === 0 ? 'rejected' : status;
        refs.push({id: 'r' + (++id), postId: pid, agentId: a.id, name: nm, age: String(22 + Math.floor(rnd() * 30)), phone: '01' + Math.floor(1e7 + rnd() * 9e7), gender: rnd() < .5 ? 'M' : 'F', remarks: 'L: Penang', status: rs, dup: '', created: iso(t), purged: ''});
      }
      if (status === 'partial') posts[posts.length - 1].count = n - 1;
    });
  }
  const comments = [
    ['a2', 'team', 'Morning team! Who is joining the Wednesday referral sprint?', 50], ['a1', 'team', 'Me! Bringing my referral book 📒', 48],
    ['a0', 'team', 'Remember: ask every happy client for 3 names before you leave. No magic, just basic.', 30], ['a4', 'team', 'Got 4 names from my cousin\'s wedding table 😂', 12],
    ['a3', 'board', 'Alicia is on fire this month 🔥', 20], ['a0', 'board', 'Great week everyone. Next target: every agent at least 5 this month.', 6]
  ].map(([agentId, postId, text, h], i) => ({id: 'c' + i, postId, agentId, text, created: iso(now - h * 3600e3)}));
  const lastPost = posts.filter(p => p.kind === 'referral').slice(-1)[0];
  comments.push({id: 'cx', postId: lastPost.id, agentId: 'a2', text: 'Well done! 👏', created: iso(Date.parse(lastPost.created) + 600e3)});
  store.save('agents', agents); store.save('comments', comments);
  // follow-up steps: some leads met, some closed; recent ones still waiting approval
  refs.forEach(r => {
    if (r.status === 'rejected' || rnd() > 0.4) return;
    const t = Date.parse(r.created) + (2 + rnd() * 9) * 864e5; if (t > now) return;
    r.appt = now - t < 4 * 864e5 ? 'pending' : 'approved'; r.apptAt = iso(t);
    if (rnd() > 0.35) return;
    const c = t + (1 + rnd() * 10) * 864e5; if (c > now) return;
    r.close = now - c < 4 * 864e5 ? 'pending' : 'approved'; r.closeAt = iso(c);
  });
  for (let d = 60; d >= 0; d -= 3) { const a = agents[1 + Math.floor(rnd() * 7)]; posts.push({id: 'ap' + d, agentId: a.id, kind: 'approach', giver: '', text: '', photoId: '', count: 0, status: 'approved', created: iso(now - d * 864e5), purged: ''}); }
  posts.sort((a, b) => a.created < b.created ? -1 : 1);
  store.save('settings', []);   // rates = defaults from the leader's sheet (RM1 / RM5 / RM20)
  store.save('posts', posts); store.save('refs', refs);
  CORE.purge(store);   // anything older than 3 months: details wiped, names kept
}
seed();

const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.pdf': 'application/pdf'};
const SAVE_OK = {'sample-page.jpg': FIX, 'sample-reply.json': FIX, 'icon-192.png': path.join(DOCS, 'icons'), 'icon-512.png': path.join(DOCS, 'icons'), 'apple-touch-icon.png': path.join(DOCS, 'icons')};
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/gas' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      let out; try { out = CORE.handle(JSON.parse(b), store); } catch (e) { out = e.appCode ? {error: e.appCode} : (console.error(e), {error: 'server_error'}); }
      const q = JSON.parse(b); if (q.op !== 'sync' && q.op !== 'photo') console.log(q.op, out.error || 'ok');
      setTimeout(() => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(out)); }, q.op === 'read' ? 1500 : 150);
    });
    return;
  }
  if (url === '/__save' && req.method === 'POST') {   // sample-maker writes its outputs here (local only)
    const name = new URL(req.url, 'http://x').searchParams.get('name'), dir = SAVE_OK[name];
    if (!dir) { res.writeHead(400); return res.end(); }
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', () => { const body = Buffer.concat(chunks).toString(); fs.writeFileSync(path.join(dir, name), name.endsWith('.json') ? body : Buffer.from(body, 'base64')); console.log('saved', name); res.end('ok'); });
    return;
  }
  if (url === '/config.js') { res.writeHead(200, {'Content-Type': 'text/javascript'}); return res.end("window.RRT_CONFIG={api:location.origin+'/gas',appUrl:location.origin+'/',sample:'SAMPLE · fake people · real referral-book format'};"); }
  let file;
  if (url.startsWith('/tools/')) file = path.join(__dirname, path.basename(url));
  else if (url.startsWith('/fixtures/')) file = path.join(FIX, path.basename(url));
  else file = path.join(DOCS, url.replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(5198, '127.0.0.1', () => console.log('REDEFINE Referrals Tracker test server: http://localhost:5198  (team code test-team, leader code test-leader-code, PIN 1234)'));
