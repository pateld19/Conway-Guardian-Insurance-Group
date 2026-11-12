# Conway Guardian Insurance Group

Website for Conway Guardian Insurance Group, an independent insurance agency serving South Carolina.

- **Site:** `index.html` (single page) + `assets/` (logo, carrier logos)
- **Hosting:** Cloudflare Workers (static assets), deployed automatically from `main`. Settings are in `wrangler.jsonc`; `.assetsignore` keeps tests and tools from being published.

## CheckEverythingWorks agent

An automated checker that opens the site in a real browser (desktop and phone sizes), clicks every button and link on every page, completes every version of the quote form and the contact form, and fails if anything breaks.

It runs automatically on every pull request, and the result shows on the PR before you merge. You can also run it from GitHub: **Actions → CheckEverythingWorks → Run workflow** (paste the live site link to check the live site).

Run it on your own computer:

```bash
npm ci
npx playwright install chromium
npm run check                                   # check the code in this repo
SITE_URL=https://your-live-link npm run check   # check the live site
npm run check:report                            # open the report with screenshots
```

Claude can also run it as an agent (`.claude/agents/check-everything-works.md`) and explain the results in plain English.

## Rules

- No passwords or API keys in this repo. It is public. Secrets go in Cloudflare → Worker → Settings → Variables and Secrets.
- Changes go through pull requests and are merged only after review.
