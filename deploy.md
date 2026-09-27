For the current Next.js/NixOS playback rollout, see [playback protection](docs/playback-protection.md).
The older vinext/Worker commands below do not apply the Nginx protection.

npm run build:vinext
npx vinext deploy

### logs
npx wrangler tail --format pretty

### check this
https://dash.cloudflare.com/17eb349fd2bf73bcaa03d603e8152f91/cinemafred.com/security/security-rules