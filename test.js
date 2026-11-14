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

// stay signed in like WhatsApp: device key
const tokA = call(Object.assign({op: 'signin', device: 'iPhone'}, ali)).token;
ok(tokA && tokA.length === 40, 'sign-in gives the phone a device key');
ok(!s.tables.sessions.some(x => x.token === tokA), 'only the hash of the key is stored');
const T = {token: tokA};
ok(call(Object.assign({op: 'sync'}, T)).me.name === 'Ali Tan', 'device key alone works (no code/PIN needed)');
s.props.TEAM_CODE = 'new-team-code';
ok(call(Object.assign({op: 'sync'}, T)).ok, 'changing the team code does NOT sign anyone out');
s.props.TEAM_CODE = 'test-team';
for (let i = 0; i < 9; i++) { try { call({op: 'signin', code: 'test-team', name: 'Ali Tan', pin: '0000'}); } catch (e) {} }
ok(call(Object.assign({op: 'sync'}, T)).ok, '8+ wrong PINs by someone else do not lock signed-in phones');
s.resetFails();
err(() => call({op: 'sync', token: 'x'.repeat(40)}), 'signed_out', 'unknown key refused');
const tokGm = call(Object.assign({op: 'signin'}, gm)).token;
ok(call({op: 'sync', token: tokGm}).me.leader === true, 'leader key keeps leader rights');
const tokMei2 = call(Object.assign({op: 'signin'}, mei)).token, tokMei3 = call(Object.assign({op: 'signin'}, mei)).token;
call({op: 'signout', token: tokMei2});
err(() => call({op: 'sync', token: tokMei2}), 'signed_out', 'sign out ends that phone only');
ok(call({op: 'sync', token: tokMei3}).ok, 'other phones of the same member stay signed in');
const legacyTok = call(Object.assign({op: 'upgrade'}, mei)).token;
ok(call({op: 'sync', token: legacyTok}).ok, 'older phones (code + PIN) can switch to a device key');
ok(!JSON.stringify(call({op: 'sync', token: tokGm})).includes(s.tables.sessions[0].token), 'device keys never sent back in sync');

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

// comments (team chat removed)
ok(call(Object.assign({op: 'comment', postId: p1.post.id, text: 'Well done bro!'}, mei)).ok, 'comment on post');
err(() => call(Object.assign({op: 'comment', postId: 'team', text: 'Who is free for coffee?'}, ali)), 'chat_removed', 'team chat is removed');
ok(call(Object.assign({op: 'comment', postId: 'board', text: 'Great week team'}, ali)).ok, 'Board talk still works');
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

// lead bonus needs a call within 14 days (marking the appointment counts as calling)
ok(s.tables.refs.find(x => x.id === lim.id).calledAt, 'appointment marks the lead as called');
const chong = s.tables.refs.find(x => x.postId === p1.post.id && x.name === 'Chong Mei Yee');
let pre = CORE.bonusTable(call(Object.assign({op: 'sync'}, gm)).agents, s.tables.posts, s.tables.refs, CORE.monthKey(s.now().toISOString()), {lead: 1, appt: 5, close: 20}, s.now().toISOString()).find(x => x.name === 'Ali Tan');
ok(pre.leads === 1 && pre.leadsToCall === 1, 'approved but not yet called = waiting for the call, not paid');
ok(call(Object.assign({op: 'step', refId: chong.id, step: 'call'}, ali)).ref.calledAt, 'agent taps Called');
err(() => call(Object.assign({op: 'step', refId: chong.id, step: 'call'}, ali)), 'already_marked', 'cannot mark the same call twice');
err(() => call(Object.assign({op: 'step', refId: lim.id, step: 'call', done: false}, ali)), 'undo_appt_first', 'cannot undo a call when the appointment is marked');
ok(s.pushes.some(p => p.ids[0] === s.tables.agents.find(a => a.name === 'Ali Tan').id && /approved/.test(p.note.title)), 'agent gets a pop-up when the leader approves');

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

// lock-screen call reminders: day 7 to day 14, then forfeited
const s2 = memStore({now: () => Date.parse('2026-11-01T02:00:00Z')}), c2 = q => CORE.handle(q, s2);
const bob = {code: 'test-team', name: 'Bob Lee', pin: '1111'}, boss = {code: 'test-leader-code', name: 'Boss', pin: '2222'};
c2(Object.assign({op: 'signin', create: true}, bob)); c2(Object.assign({op: 'signin', create: true}, boss));
const bp = c2(Object.assign({op: 'post', photo: PHOTO, covered: true, rows: [{name: 'Call Me'}, {name: 'Called Fast'}]}, bob));
const bref = s2.tables.refs.filter(r => r.postId === bp.post.id);
c2(Object.assign({op: 'review', postId: bp.post.id, confirm: true, decisions: {[bref[0].id]: 'approved', [bref[1].id]: 'approved'}}, boss));
c2(Object.assign({op: 'step', refId: bref[1].id, step: 'call'}, bob));
s2.setNow('2026-11-05T01:00:00Z'); s2.pushes.length = 0;
ok(CORE.callReminders(s2).reminded === 0, 'no reminder before day 7');
s2.setNow('2026-11-08T03:00:00Z');
ok(CORE.callReminders(s2).reminded === 1 && /Call 1 referral/.test(s2.pushes[0].note.title) && /Call Me/.test(s2.pushes[0].note.body), 'day 7: one pop-up naming the uncalled lead (not the called one)');
ok(/7 days left/.test(s2.pushes[0].note.title), 'pop-up says days left (' + s2.pushes[0].note.title + ')');
s2.setNow('2026-11-14T03:00:00Z'); s2.pushes.length = 0; CORE.callReminders(s2);
ok(/last day/.test(s2.pushes[0].note.title), 'last day warning');
s2.setNow('2026-11-16T01:00:00Z'); s2.pushes.length = 0;
ok(CORE.callReminders(s2).reminded === 0, 'no more reminders after 14 days');
const bt = CORE.bonusTable(s2.tables.agents, s2.tables.posts, s2.tables.refs, '2026-11', {lead: 1, appt: 5, close: 20}, s2.now().toISOString()).find(x => x.name === 'Bob Lee');
ok(bt.leads === 1 && bt.leadsForfeit === 1 && bt.total === 1, 'uncalled after 14 days = forfeited; called one is paid RM1');
c2(Object.assign({op: 'step', refId: bref[0].id, step: 'call'}, bob));
ok(CORE.callState(s2.tables.refs.find(r => r.id === bref[0].id), s2.now().getTime()) === 'late', 'calling after 14 days is recorded but stays forfeited');
// phone registration
ok(c2(Object.assign({op: 'pushreg', pushToken: 'tok-' + 'x'.repeat(30)}, bob)).registered, 'phone registers for pop-ups');
ok(c2(Object.assign({op: 'sync'}, bob)).me.devices === 1, 'app sees its phone is registered');
c2(Object.assign({op: 'pushtest', delay: 15}, bob));
ok(s2.pushes.some(p => /locked/.test(p.note.body)), '15-second lock-screen test');
c2(Object.assign({op: 'pushoff'}, bob));
ok(c2(Object.assign({op: 'sync'}, bob)).me.devices === 0, 'pop-ups can be turned off');

// roadshow name lists: same as referrals, plus location + selfie
const s3 = memStore({now: () => Date.parse('2026-11-14T02:00:00Z')}), c3 = q => CORE.handle(q, s3);
const rina = {code: 'test-team', name: 'Rina Lim', pin: '3333'}, lead3 = {code: 'test-leader-code', name: 'Lead Three', pin: '4444'};
c3(Object.assign({op: 'signin', create: true}, rina)); c3(Object.assign({op: 'signin', create: true}, lead3));
const RS = n => Array.from({length: n}, (_, i) => ({name: 'Visitor ' + 'ABCDEFGHIJ'[i], phone: '01' + (2000000 + i * 1111) + '0'}));
err(() => c3(Object.assign({op: 'post', source: 'roadshow', photo: PHOTO, covered: true, selfie: PHOTO, rows: RS(2)}, rina)), 'location_needed', 'roadshow needs a location');
err(() => c3(Object.assign({op: 'post', source: 'roadshow', location: 'Queensbay Mall', photo: PHOTO, covered: true, rows: RS(2)}, rina)), 'selfie_needed', 'roadshow needs a selfie');
const rp = c3(Object.assign({op: 'post', source: 'roadshow', location: 'Queensbay Mall', giver: 'should be ignored', photo: PHOTO, covered: true, selfie: PHOTO, rows: RS(6)}, rina));
ok(rp.post.source === 'roadshow' && rp.post.location === 'Queensbay Mall' && rp.post.count === 6, 'roadshow list posted with location and 6 names');
ok(rp.post.selfieId && s3.photos[rp.post.selfieId] && !rp.post.giver, 'selfie stored, no giver on roadshow');
ok(rp.cheer.some(t => /Queensbay Mall/.test(t)), 'roadshow encouragement mentions the place');
ok(s3.tables.refs.filter(r => r.postId === rp.post.id).every(r => r.source === 'roadshow'), 'roadshow names marked as roadshow');
const sy3 = c3(Object.assign({op: 'sync'}, lead3)), sp = sy3.posts.find(p => p.id === rp.post.id);
ok(sp.source === 'roadshow' && sp.location === 'Queensbay Mall' && sp.selfie === 1, 'team sees roadshow badge, place and selfie flag');
ok(c3(Object.assign({op: 'photo', postId: rp.post.id, which: 'selfie'}, lead3)).image === PHOTO, 'selfie can be opened');
const rr = s3.tables.refs.filter(r => r.postId === rp.post.id), dec3 = {}; rr.forEach(r => { dec3[r.id] = 'approved'; });
c3(Object.assign({op: 'review', postId: rp.post.id, confirm: true, decisions: dec3}, lead3));
ok(s3.pushes.some(p => /6 roadshow names approved/.test(p.note.title)), 'approval pop-up says roadshow names');
c3(Object.assign({op: 'step', refId: rr[0].id, step: 'call'}, rina)); c3(Object.assign({op: 'step', refId: rr[1].id, step: 'appt'}, rina));
const b3 = CORE.bonusTable(sy3.agents, s3.tables.posts, s3.tables.refs, '2026-11', {lead: 1, appt: 5, close: 20}, s3.now().toISOString()).find(x => x.name === 'Rina Lim');
ok(b3.approach === 1 && b3.leads === 2 && b3.leadsRoadshow === 2 && b3.leadsToCall === 4 && b3.total === 2, 'roadshow names: RM1 each once called, same 14-day rule (' + JSON.stringify(b3) + ')');
s3.setNow('2026-11-22T03:00:00Z');
ok(CORE.callReminders(s3).reminded === 1, 'roadshow names get the same call reminders');
const ref2 = c3(Object.assign({op: 'post', photo: PHOTO, covered: true, rows: [{name: 'Visitor A', phone: '0120000000'}]}, rina));
ok(s3.tables.refs.find(r => r.postId === ref2.post.id).dup, 'a referral already met at a roadshow is flagged as duplicate');
s3.setNow('2027-02-15T03:00:00Z'); CORE.purge(s3);
ok(!s3.photos[rp.post.selfieId] && !s3.tables.posts.find(p => p.id === rp.post.id).selfieId, 'selfie auto-deleted after 3 months too');
ok(s3.tables.posts.find(p => p.id === rp.post.id).location === 'Queensbay Mall', 'roadshow place kept after 3 months');

// leader removes a member -> their phones are signed out
const meiAgent = s.tables.agents.find(a => a.name === 'Mei Ling');
call(Object.assign({op: 'removeAgent', agentId: meiAgent.id, confirm: true}, gm));
err(() => call({op: 'sync', token: tokMei3}), 'signed_out', 'removed member is signed out on every phone');

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
