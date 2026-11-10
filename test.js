// Rule checks: node test.js
const CORE = require('./docs/core.js'), memStore = require('./tools/memstore.js');
let pass = 0, failN = 0;
const ok = (c, msg) => { if (c) pass++; else { failN++; console.log('FAIL: ' + msg); } };
const err = (fn, code, msg) => { try { fn(); ok(false, msg + ' (no error)'); } catch (e) { ok(e.appCode === code, msg + ' -> got ' + (e.appCode || e.message)); } };
const PHOTO = 'A'.repeat(400);

const s = memStore({now: () => Date.parse('2026-11-10T02:00:00Z')});
const call = q => CORE.handle(q, s);
const ali = {code: 'test-team', name: 'Ali Tan', pin: '1234'}, mei = {code: 'test-team', name: 'Mei Ling', pin: '5678'}, gm = {code: 'test-leader-code', name: 'Kah Jian', pin: '9999'};

// sign-in
err(() => call(Object.assign({op: 'signin'}, ali)), 'new_name', 'new name asks to confirm first');
ok(call(Object.assign({op: 'signin', create: true}, ali)).created, 'agent created');
call(Object.assign({op: 'signin', create: true}, mei)); call(Object.assign({op: 'signin', create: true}, gm));
err(() => call({op: 'signin', code: 'test-team', name: 'ali tan', pin: '0000'}), 'wrong_pin', 'wrong PIN refused');
s.resetFails();
err(() => call({op: 'signin', code: 'nope', name: 'X Y', pin: '1234'}), 'wrong_code', 'wrong team code refused');
s.resetFails();
ok(call(Object.assign({op: 'signin'}, gm)).me.leader === true, 'leader code gives leader');
ok(call(Object.assign({op: 'signin'}, ali)).me.leader === false, 'team code gives agent');
ok(!s.tables.agents.some(a => a.pin === '1234'), 'PIN stored only as a hash');

// AI reading cleans messy replies safely
const r = CORE.parseRead('```json\n{"giver":"Tan Ah Kow","rows":[{"name":"Lim Wei"},{"name":""},{"name":"Ch?n","phone":"012-3456789"}],"private":[{"type":"phone","x":0.5,"y":-1,"w":3,"h":0.05},{"x":0.1,"y":0.1,"w":0,"h":0}],"faces":"x"}\n```');
ok(r.rows.length === 2, 'empty-name rows dropped, nothing invented');
ok(r.rows[1].unclear === true, 'name with ? flagged unclear');
ok(r.private.length === 1 && r.private[0].x === 0.5 && r.private[0].y === 0 && r.private[0].w === 0.5, 'boxes clamped inside the photo');
ok(r.faces.length === 0, 'bad faces value ignored');
err(() => CORE.parseRead('not json'), 'ai_bad_reply', 'non-JSON AI reply refused');
const rd = call(Object.assign({op: 'read', image: PHOTO}, ali));
ok(rd.ok && Array.isArray(rd.read.rows), 'read op returns rows');
ok(!Object.keys(s.photos).length, 'reading does not keep the photo');

// posting
err(() => call(Object.assign({op: 'post', photo: PHOTO, rows: [{name: 'A B'}]}, ali)), 'privacy_not_confirmed', 'must confirm privacy check');
err(() => call(Object.assign({op: 'post', photo: PHOTO, covered: true, rows: [{name: ''}]}, ali)), 'no_names', 'page with no names refused');
const p1 = call(Object.assign({op: 'post', photo: PHOTO, covered: true, giver: 'Tan Ah Kow', rows: [
  {name: 'Lim Wei Jie', age: '28', phone: '012-345 6789', gender: 'M', remarks: 'L: Penang'},
  {name: 'Chong Mei Yee', phone: '+60 16-222 3333'},
  {name: 'Lim Wei Jie', phone: '0123456789'}]}, ali));
ok(p1.post.count === 3 && p1.post.status === 'pending', 'auto-counted 3 names, pending approval');
ok(p1.cheer.length >= 1, 'encouragement returned');
ok(s.tables.refs[2].dup, 'duplicate inside same page flagged');
const p2 = call(Object.assign({op: 'post', photo: PHOTO, covered: true, rows: [{name: 'Someone New', phone: '016 222 3333'}]}, mei));
ok(/Same number/.test(s.tables.refs[3].dup), 'same phone as another agent flagged (+60 vs 0 format)');

// what each person can see
const seenByMei = call(Object.assign({op: 'sync'}, mei));
const aliRef = seenByMei.refs.find(x => x.name === 'Lim Wei Jie');
ok(aliRef && aliRef.phone === undefined && aliRef.age === undefined, 'teammate sees name but not phone/age');
ok(seenByMei.refs.find(x => x.agentId === seenByMei.me.id).phone, 'agent sees own client contact');
ok(seenByMei.posts.find(x => x.id === p1.post.id).giver === '', 'teammate does not receive the referring client name');
ok(!aliRef.dup && call(Object.assign({op: 'sync'}, ali)).refs.find(x => x.id === s.tables.refs[2].id).dup, 'duplicate notes only to owner/leader');
const seenByGm = call(Object.assign({op: 'sync'}, gm));
ok(seenByGm.refs.find(x => x.name === 'Chong Mei Yee').phone, 'leader sees contact for follow-up');
ok(call(Object.assign({op: 'sync', ver: seenByGm.ver}, gm)).same, 'no change -> tiny reply');
ok(!JSON.stringify(seenByMei).includes('"pin"'), 'PIN hash never sent');

// comments & chat
ok(call(Object.assign({op: 'comment', postId: p1.post.id, text: 'Well done bro!'}, mei)).ok, 'comment on post');
ok(call(Object.assign({op: 'comment', postId: 'team', text: 'Who is free for coffee?'}, ali)).ok, 'team chat');
err(() => call(Object.assign({op: 'comment', postId: 'zzz', text: 'hi'}, ali)), 'not_found', 'comment on missing post refused');

// leader approval
err(() => call(Object.assign({op: 'review', postId: p1.post.id, confirm: true, decisions: {}}, ali)), 'leader_only', 'agent cannot approve');
err(() => call(Object.assign({op: 'review', postId: p1.post.id, decisions: {}}, gm)), 'confirm_needed', 'approval needs confirm');
const ids = s.tables.refs.filter(x => x.postId === p1.post.id).map(x => x.id);
call(Object.assign({op: 'review', postId: p1.post.id, confirm: true, decisions: {[ids[0]]: 'approved', [ids[1]]: 'approved', [ids[2]]: 'rejected'}}, gm));
const pp = s.tables.posts.find(x => x.id === p1.post.id);
ok(pp.status === 'partial' && +pp.count === 2, 'duplicate rejected, page counts 2');
err(() => call(Object.assign({op: 'removePost', postId: p1.post.id, confirm: true}, ali)), 'approved_ask_leader', 'agent cannot delete approved page');
err(() => call(Object.assign({op: 'removePost', postId: p2.post.id, confirm: true}, ali)), 'not_yours', 'cannot delete other agent page');
// bonus rates: defaults are the leader's sheet (RM1 lead, RM5 appointment, RM20 close)
ok(JSON.stringify(call(Object.assign({op: 'sync'}, mei)).rates) === '{"lead":1,"appt":5,"close":20}', 'default rates from the leader sheet, visible to agents');
err(() => call(Object.assign({op: 'settings', confirm: true, rates: {lead: 'abc'}}, gm)), 'bad_rate', 'bad rate refused');
err(() => call(Object.assign({op: 'settings', confirm: true, rates: {lead: '2'}}, ali)), 'leader_only', 'agent cannot change rates');

// steps: appointment then close, leader approves
const lim = s.tables.refs.find(x => x.postId === p1.post.id && x.name === 'Lim Wei Jie' && x.status === 'approved');
const rej = s.tables.refs.find(x => x.postId === p1.post.id && x.status === 'rejected');
err(() => call(Object.assign({op: 'step', refId: lim.id, step: 'close'}, ali)), 'appointment_first', 'close needs an appointment first');
err(() => call(Object.assign({op: 'step', refId: rej.id, step: 'appt'}, ali)), 'lead_not_counted', 'no steps on a rejected lead');
err(() => call(Object.assign({op: 'step', refId: lim.id, step: 'appt'}, mei)), 'not_yours', 'cannot update another agent lead');
ok(call(Object.assign({op: 'step', refId: lim.id, step: 'appt'}, ali)).ref.appt === 'pending', 'agent marks appointment -> pending');
ok(call(Object.assign({op: 'step', refId: lim.id, step: 'close'}, ali)).ref.close === 'pending', 'agent marks close -> pending');
err(() => call(Object.assign({op: 'step', refId: lim.id, step: 'appt', done: false}, ali)), 'undo_close_first', 'cannot undo appointment while close stands');
const before2 = s.tables.posts.length;
call(Object.assign({op: 'stepReview', confirm: true, decisions: {[lim.id]: {appt: 'approved', close: 'approved'}}}, gm));
ok(s.tables.refs.find(x => x.id === lim.id).close === 'approved', 'leader approves appointment + close');
ok(s.tables.posts.slice(before2).filter(p => p.kind === 'milestone').length === 2, 'team gets appointment + close celebration cards');
err(() => call(Object.assign({op: 'step', refId: lim.id, step: 'close', done: false}, ali)), 'approved_ask_leader', 'agent cannot undo an approved close');
ok(call(Object.assign({op: 'approach', confirm: true, note: 'asked uncle, no names'}, ali)).logged, 'approach without names logged');

// monthly statement = the leader's sheet: Ali has 2 approaches, 2 approved leads, 1 appt, 1 close
const all = call(Object.assign({op: 'sync'}, gm)), month = CORE.monthKey(s.now().toISOString());
const row = CORE.bonusTable(all.agents, all.posts, all.refs, month, all.rates).find(x => x.name === 'Ali Tan');
ok(row.approach === 2 && row.leads === 2 && row.appt === 1 && row.close === 1, 'statement counts ' + JSON.stringify(row));
ok(row.total === 2 * 1 + 5 + 20, 'total = 2xRM1 + RM5 + RM20 = RM27');
const meiRow = CORE.bonusTable(all.agents, all.posts, all.refs, month, all.rates).find(x => x.name === 'Mei Ling');
ok(meiRow.leads === 0 && meiRow.leadsWaiting === 1 && meiRow.total === 0, 'leads waiting approval are not paid yet');
call(Object.assign({op: 'settings', confirm: true, rates: {lead: '2'}}, gm));
ok(CORE.bonusTable(all.agents, all.posts, all.refs, month, call(Object.assign({op: 'sync'}, gm)).rates).find(x => x.name === 'Ali Tan').total === 29, 'leader can change a rate');
call(Object.assign({op: 'settings', confirm: true, rates: {lead: '1'}}, gm));
err(() => call(Object.assign({op: 'markPaid', month}, gm)), 'confirm_needed', 'mark paid needs confirm');
call(Object.assign({op: 'markPaid', month, confirm: true}, gm));
ok(call(Object.assign({op: 'sync'}, gm)).paid[month].total === 27, 'leader sees paid snapshot total');
ok(call(Object.assign({op: 'sync'}, ali)).paid[month].mine === 27 && call(Object.assign({op: 'sync'}, ali)).paid[month].total === undefined, 'agent sees only own paid amount');

// milestones: Mei posts 5 names in a page -> reaches 5 this month (milestone card)
const before = s.tables.posts.length;
call(Object.assign({op: 'post', photo: PHOTO, covered: true, rows: ['Aa Bb', 'Cc Dd', 'Ee Ff', 'Gg Hh'].map(name => ({name}))}, mei));
ok(s.tables.posts.slice(before).some(p => p.kind === 'milestone' && /5 referrals/.test(p.text)), 'milestone card at 5 this month');

// 3-month auto-delete keeps only the name
s.setNow('2027-02-09T03:00:00Z');   // 91 days later
const res = CORE.purge(s);
ok(res.wiped === 8 && res.photos === 3, 'all details and photos past 90 days wiped (' + JSON.stringify(res) + ')');
const old = s.tables.refs.find(x => x.name === 'Chong Mei Yee');
ok(old.name === 'Chong Mei Yee' && !old.phone && !old.age && !old.remarks && old.purged, 'name kept, contact/age/remarks gone');
ok(!Object.keys(s.photos).length, 'photo files deleted');
ok(!s.tables.posts.some(p => p.giver), 'giver name removed too');
err(() => call(Object.assign({op: 'photo', postId: p1.post.id}, gm)), 'photo_gone', 'old photo no longer served');
ok(CORE.purge(s).wiped === 0, 'purge runs safely twice');
ok(CORE.normPhone('+6012-345 6789') === '0123456789' && CORE.normPhone('12') === '', 'phone normalising');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
