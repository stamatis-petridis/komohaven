# Check Deployment Status

Verify the current deployment status and configuration.

## Your Task

1. **Git Status**
   ```bash
   git status
   git log --oneline -5
   ```

2. **Check Branch**
   - Production branch is `lean`
   - Verify current branch and if it's up to date with remote

3. **Verify Key Files**
   - `config.js` - rates, contacts, maps
   - `availability/availability.json` - last updated timestamp
   - `wrangler.toml` - Cloudflare config

4. **GitHub Actions Status**
   - Check recent availability workflow runs
   - Look for any failures

5. **Cloudflare Configuration**
   - KV namespaces: PAYMENTS_KV, AVAIL_KV
   - Functions in `/functions/api/`

## Deployment Notes
- Cloudflare Pages auto-deploys on push to `main`
- Availability workflow runs every 30 min on `lean` branch
- No build step required (static files served directly)

## Common Checks
- Is `lean` branch ahead/behind remote?
- Are there uncommitted changes?
- Is availability.json recent (< 1 hour old)?
- Are all environment secrets configured in GitHub?
