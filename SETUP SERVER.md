# Going live (about 15 minutes, done together with Claude)

Same pattern as 90Days Kick Start: phone app on GitHub Pages + a private Google Apps Script server under wongkahjian93@gmail.com.

1. **Google Apps Script:** script.google.com → New project → name it **REDEFINE Referrals Tracker**.
2. Paste the whole of `server/Code.gs` (built by `node build.js`) into `Code.gs`. Save.
3. **Project Settings → Script properties.** Add these yourself, and never paste them into chat:
   - `TEAM_CODE`: 6+ characters, given to agents
   - `LEADER_CODE`: 10+ characters, only you
   - `OPENAI_API_KEY`: the same OpenAI key the Form Filler server uses (or a new one)
   - optional `DAILY_READS` (default 40 photos per agent per day), `MODEL` (default gpt-6.1-terra)
4. Select **setup** → Run → allow permissions. This creates the Sheet "REDEFINE Referrals Data", the Drive folder "REDEFINE Referrals Photos" and the nightly 2am auto-delete.
5. **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
6. Claude puts the URL in `docs/config.js`, creates the GitHub repo `redefine-referrals-tracker` (Pages from `docs/`), and you get the link.
7. Sign in first with the LEADER_CODE (you become leader), then share the link + TEAM_CODE with agents.

Later changes: edit → `node test.js` → `node build.js` → paste Code.gs → Deploy → Manage deployments → edit → **New version** (same URL).

Cost: each photo is one AI reading (store:false). Hosting is free (Google + GitHub Pages).
