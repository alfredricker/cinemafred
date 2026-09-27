# Guest browsing and private playback

The catalog and poster images under `images/` are public. Guest mode is a UI
preference in localStorage, not a permission. Entering or restoring guest mode
clears the playback cookie before displaying the catalog.

Real login issues a 90-day HttpOnly, SameSite=Strict cookie, Secure in production.
The playback verifier accepts only that cookie, with an HS256 signature, expiry,
issuer and playback audience. It reads the current account record on every check;
deleted, inactive, or password-reset-required accounts cannot watch. Missing
credentials, invalid credentials and database failures never authorize media.
Playback never accepts the legacy bearer token or a token query parameter.
Existing account/rating/admin requests still use the bearer token; this change
is not a migration of every API to cookie authentication.

Logout clears the browser cookie. The signed cookie itself is valid until expiry;
this is not a server-side session revocation store. Deactivating an account blocks
its playback immediately. Rotating the signing secret invalidates all tokens.

## Serving path

The companion change in `~/Projects/nix-server-cluster/main-node.nix` routes the
app's Cloudflare tunnels through loopback Nginx on port 8081:

- `/media/` uses Nginx `auth_request` against `/api/auth/playback` before serving
  **each** playlist, segment, MP4 byte-range request, and subtitle file.
- Everything else proxies to Next.js on port 3000.
- Raw storage on port 8080 binds only to loopback, for application poster and
  SRT conversion requests. Both file servers disable symlink traversal.
- The old `main-node.rickermedia.com` tunnel returns 404.
- Private responses use `Cache-Control: private, no-store`.

The API returns relative `/media/...` redirects. `MEDIA_BASE_URL` is no longer
used. HLS manifests must use relative references within their media tree. Existing
absolute references to the old origin must be regenerated before playback works.
Running Next.js alone does not serve `/media/`; use the Nginx front end for playback.

The service provisions a persistent random secret at
`/var/lib/cinemafred/jwt-secret`, outside the Nix store. Back up this secret securely;
do not commit it. All JWT users now require a configured secret of at least 32
characters, with no built-in fallback.

## Coordinated rollout

These are local changes, not a completed live deployment.

1. Schedule a brief playback interruption. Configure Cloudflare to **bypass caching**
   for `/media/*`, `/api/auth/*`, `/api/stream/*`, `/api/hls/*`, `/api/subtitles/*`, and
   private `/api/movie/*` requests. Only poster images should be publicly cached.
   Check for legacy Worker routes or cache rules overriding origin cache headers.
2. Apply the `main-node.nix` change and deploy the app together. Applying Nginx first
   fails closed: the old app has no authorization endpoint, so media will temporarily
   fail until the new app is running. Do not deploy the guest-enabled app first while
   the old origin is public. The signing-secret change requires everyone to sign in
   again. Restart the app to load the generated secret if the deployment tool did
   not already restart it.
3. Purge previously cached private media from Cloudflare, including the old media
   hostname, API redirects, MP4s, manifests, segments and subtitles. Retiring the
   origin cannot remove copies already held in a CDN or downloaded by users.
4. Confirm the old hostname returns 404 and ports 8080/8081 are not reachable from
   another host. Verify active ingress actually follows the new Nginx path.
5. In a logged-out browser, test copied MP4, playlist, segment and subtitle URLs;
   expect 401/403. A fake `?token=anything`, `isGuest=false`, or a deleted guest flag
   must not grant access. Test both GET and HEAD.
6. Sign in and verify HLS playback, native HLS where available, MP4 seeking and
   subtitles on desktop and TV. Enter guest mode, refresh, and verify that browsing
   remains available while playback requests fail. Disable a test account and
   confirm subsequent media requests fail, including after a cache hit would have
   been possible previously.

Do not treat the live portfolio as protected until the server changes and cache
purge are complete. Rolling back to the previous public origin reopens access.

## Checks

TypeScript and production build:

```sh
nix-shell --run 'npx tsc --noEmit --incremental false && npm run build'
```

Application authorization tests (no live database or private files):

```sh
nix-shell --run 'npm run test:playback'
```

For the Nginx integration test, extract the actual location blocks from the NixOS
configuration and supply an Nginx binary with the auth-request module:

```sh
nix eval --json ~/Projects/nix-server-cluster#nixosConfigurations.main-node.config.services.nginx.virtualHosts \
  --apply 'hosts: { auth = hosts.cinemafred-app.locations."= /_playback_auth".extraConfig; media = hosts.cinemafred-app.locations."^~ /media/".extraConfig; }' \
  > /tmp/cinemafred-nginx-locations.json
NGINX_BIN=/path/to/nginx NGINX_LOCATIONS=/tmp/cinemafred-nginx-locations.json \
  nix-shell --run 'npm run test:playback'
```

The integration test uses synthetic files, mocked account records and temporary
loopback servers. It verifies per-file authorization, byte ranges, cache headers,
account deactivation and denial when the auth upstream is unavailable. Without
both NGINX variables, only the application test runs and the Nginx test is skipped.
