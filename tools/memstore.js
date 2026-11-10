// In-memory stand-in for the Google server's store, used by test.js and the local preview server.
// The AI is NOT called: it returns a reply written by hand for the sample page (test/fixtures/sample-reply.json).
const crypto = require('crypto'), fs = require('fs'), path = require('path');
module.exports = function memStore(opts = {}) {
  const tables = {}, photos = {}, props = Object.assign({TEAM_CODE: 'test-team', LEADER_CODE: 'test-leader-code'}, opts.props || {});
  let ver = 1, fails = 0, clock = opts.now ? opts.now() : null, n = 0;
  const store = {
    tables, photos, props, prompts: [],
    load: t => JSON.parse(JSON.stringify(tables[t] || [])),
    save: (t, rows) => { tables[t] = JSON.parse(JSON.stringify(rows)); },
    withLock: fn => fn(),
    prop: k => props[k] || '',
    fails: add => { if (add) fails += add; return fails; },
    resetFails: () => { fails = 0; },
    now: () => clock ? new Date(clock) : new Date(),
    setNow: d => { clock = d ? new Date(d).getTime() : null; },
    random: opts.random || Math.random,
    hash: t => crypto.createHash('sha256').update(t, 'utf8').digest('hex'),
    version: bump => (bump ? ++ver : ver),
    putPhoto: (name, b64) => { const id = 'ph' + (++n); photos[id] = b64; return id; },
    getPhoto: id => { if (!(id in photos)) throw new Error('gone'); return photos[id]; },
    trashPhoto: id => { delete photos[id]; },
    ai: (prompt, b64) => {
      store.prompts.push({prompt, bytes: b64.length});
      if (opts.ai) return opts.ai(prompt, b64);
      const f = path.join(__dirname, '..', 'test', 'fixtures', 'sample-reply.json');
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
      return JSON.stringify({kind: 'other', giver: '', rows: [], private: [], faces: [], notes: 'Test server: no AI here (stand-in reply).'});
    }
  };
  return store;
};
