# REDEFINE Referrals Tracker

Agents snap a referral-book page. AI reads and counts the names, the phone covers private details and faces, and the page is posted to a team board with comments, chat, pop-up alerts, music, WhatsApp share and leader approval for bonus. Client details auto-delete after 90 days; names stay.

- `docs/`: the phone app (static PWA). `core.js` holds the server rules, shared with the Google server and the tests.
- `server/gas.js`: the Google Apps Script store (Sheet + Drive + OpenAI). `node build.js` → `server/Code.gs`.
- `node test.js`: rule checks. `node tools/serve.js`: local test on http://localhost:5198 with a SAMPLE team (team code `test-team`, leader `test-leader-code`, PIN `1234`); its AI is a stand-in reply for `test/fixtures/sample-page.jpg`.
- `tools/sample-maker.html` (via the local server): rebuilds the sample page from the real referral book (fake people) and the PNG icons.

Guides: `HOW TO USE.md`, `SETUP SERVER.md`.
