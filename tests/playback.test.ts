import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import prisma from '../src/lib/db';
import { SESSION_COOKIE, setSessionCookie, requirePlayback } from '../src/lib/playback-session';
import { mediaUrl } from '../src/lib/media';
import { GET as hls } from '../src/app/api/hls/[movieId]/route';
import { GET as stream } from '../src/app/api/stream/[movieId]/route';
import { GET as file } from '../src/app/api/movie/[...file]/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { POST as validate } from '../src/app/api/auth/validate/route';

process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
const user = { id: 'member', username: 'Member', email: 'member@example.test', isAdmin: false, isActive: true, mustResetPassword: false };
let currentUser: typeof user | null = user;
// These tests deliberately use no live database or private media.
prisma.user.findUnique = (async () => currentUser) as unknown as typeof prisma.user.findUnique;
prisma.movie.findUnique = (async () => ({ r2_hls_path: 'hls/movie/master.m3u8', r2_video_path: 'movies/a film.mp4', hls_ready: true })) as unknown as typeof prisma.movie.findUnique;
function session() {
  const response = NextResponse.json({});
  setSessionCookie(response, user.id);
  return response.cookies.get(SESSION_COOKIE)!.value;
}
const request = (token?: string) => new Request('https://cinemafred.test/api/hls/movie', { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });
const signed = (payload: object, options: jwt.SignOptions = {}) => jwt.sign(payload, process.env.JWT_SECRET!, { algorithm: 'HS256', subject: user.id, audience: 'cinemafred-playback', issuer: 'cinemafred', expiresIn: 60, ...options });

test('the browser retains playback access for 90 days after login', async () => {
  const response = NextResponse.json({});
  setSessionCookie(response, user.id);
  const cookie = response.cookies.get(SESSION_COOKIE)!;
  assert.equal(cookie.maxAge, 90 * 24 * 60 * 60);
  const issuedAt = (jwt.decode(cookie.value) as jwt.JwtPayload).iat!;
  const realNow = Date.now;
  try {
    Date.now = () => (issuedAt + 90 * 24 * 60 * 60 - 1) * 1000;
    assert.equal(await requirePlayback(request(cookie.value)), null);
    Date.now = () => (issuedAt + 90 * 24 * 60 * 60) * 1000;
    assert.equal((await requirePlayback(request(cookie.value)))?.status, 401);
  } finally {
    Date.now = realNow;
  }
});

test('playback authorization rejects bypasses and permits active members', async () => {
  for (const token of [undefined, 'anything', signed({}, { expiresIn: -1 }), signed({}, { audience: 'upload' }), signed({}, { algorithm: 'HS384' })]) {
    assert.equal((await requirePlayback(request(token)))?.status, 401);
  }
  const forged = jwt.sign({ sub: user.id }, 'your-secret-key');
  assert.equal((await requirePlayback(request(forged)))?.status, 401);
  assert.equal((await requirePlayback(new Request('https://cinemafred.test/api/hls/movie?token=anything', { headers: { cookie: 'isGuest=false', Authorization: `Bearer ${session()}` } })))?.status, 401);
  const token = session();
  assert.equal(await requirePlayback(request(token)), null);
  currentUser = { ...user, isActive: false };
  assert.equal((await requirePlayback(request(token)))?.status, 401);
  currentUser = null;
  assert.equal((await requirePlayback(request(token)))?.status, 401);
  currentUser = { ...user, mustResetPassword: true };
  assert.equal((await requirePlayback(request(token)))?.status, 403);
  currentUser = user;
  for (const handler of [hls, stream]) {
    assert.equal((await handler(request(), { params: Promise.resolve({ movieId: 'movie' }) })).status, 401);
    const response = await handler(request(token), { params: Promise.resolve({ movieId: 'movie' }) });
    assert.equal(response.status, 307);
    assert.match(response.headers.get('location')!, /^\/media\//);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  for (const path of ['movies/a.mp4', 'hls/movie/master.m3u8', 'hls/movie/segment.ts', 'subtitles/a.srt', 'hls/movie/fake.jpg']) {
    assert.equal((await file(request(), { params: Promise.resolve({ file: path.split('/') }) })).status, 401);
  }
  for (const path of ['../secret', 'images/../movies/a.mp4', 'images/%2e%2e/a.jpg', 'https://origin/movie', 'images/a?x.jpg', 'images/a\\b.jpg']) {
    assert.throws(() => mediaUrl(path));
  }
  assert.equal(mediaUrl('movies/a film.mp4'), '/media/movies/a%20film.mp4');
  assert.equal((await validate(request(token))).status, 200);
  assert.equal((await validate(request())).status, 401);
  const cleared = await logout(request(token));
  assert.match(cleared.headers.get('set-cookie')!, /Max-Age=0/);
  assert.match(cleared.headers.get('set-cookie')!, /HttpOnly/);
  const savedSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  assert.equal((await requirePlayback(request(token)))?.status, 401);
  assert.throws(session);
  process.env.JWT_SECRET = savedSecret;
});

test('Nginx protects every media resource, supports ranges, and fails closed', { skip: !process.env.NGINX_BIN || !process.env.NGINX_LOCATIONS }, async () => {
  const root = await mkdtemp(`${tmpdir()}/cinemafred-nginx-`);
  const auth = createServer(async (req, res) => {
    const denied = await requirePlayback(new Request('http://localhost/api/auth/playback', { headers: { cookie: req.headers.cookie ?? '' } }));
    res.writeHead(denied?.status ?? 204);
    res.end();
  });
  auth.listen(0, '127.0.0.1');
  await once(auth, 'listening');
  const authPort = (auth.address() as { port: number }).port;
  // Reserve an available test port, then hand it to Nginx.
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const locations = JSON.parse(await readFile(process.env.NGINX_LOCATIONS!, 'utf8'));
  await mkdir(`${root}/media/hls/movie`, { recursive: true });
  await mkdir(`${root}/media/movies`);
  await mkdir(`${root}/media/subtitles`);
  for (const path of ['hls/movie/master.m3u8', 'hls/movie/variant.m3u8', 'hls/movie/segment.ts', 'movies/a.mp4', 'subtitles/a.vtt']) {
    await writeFile(`${root}/media/${path}`, '0123456789');
  }
  const config = `daemon off; master_process off; pid ${root}/nginx.pid; error_log ${root}/error.log; events {} http { access_log off; server { listen 127.0.0.1:${port}; location = /_playback_auth { ${locations.auth.replaceAll('127.0.0.1:3000', `127.0.0.1:${authPort}`)} } location ^~ /media/ { ${locations.media.replace('/data/cinemafred/', `${root}/media/`)} } } }`;
  await writeFile(`${root}/nginx.conf`, config);
  const nginx = spawn(process.env.NGINX_BIN!, ['-p', root, '-c', `${root}/nginx.conf`]);
  let stderr = '';
  nginx.stderr.on('data', chunk => { stderr += chunk; });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { await fetch(`http://127.0.0.1:${port}/`); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.ok(ready, stderr);
    for (const path of ['hls/movie/master.m3u8', 'hls/movie/variant.m3u8', 'hls/movie/segment.ts', 'movies/a.mp4', 'subtitles/a.vtt']) {
      const url = `http://127.0.0.1:${port}/media/${path}`;
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(`${url}?token=anything`)).status, 401);
      const allowed = await fetch(url, { headers: { cookie: `${SESSION_COOKIE}=${session()}` } });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
      assert.equal(await allowed.text(), '0123456789');
      assert.equal((await fetch(url)).status, 401, 'a prior authorized response must not open a cache bypass');
    }
    const range = await fetch(`http://127.0.0.1:${port}/media/movies/a.mp4`, { headers: { cookie: `${SESSION_COOKIE}=${session()}`, range: 'bytes=2-5' } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), '2345');
    assert.equal((await fetch(`http://127.0.0.1:${port}/_playback_auth`)).status, 404);
    currentUser = { ...user, isActive: false };
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/movies/a.mp4`, { headers: { cookie: `${SESSION_COOKIE}=${session()}` } })).status, 401);
    currentUser = user;
    await new Promise<void>(resolve => auth.close(() => resolve()));
    assert.equal((await fetch(`http://127.0.0.1:${port}/media/movies/a.mp4`, { headers: { cookie: `${SESSION_COOKIE}=${session()}` } })).status, 500);
  } finally {
    currentUser = user;
    nginx.kill('SIGTERM');
    await once(nginx, 'exit');
    auth.close();
    await rm(root, { recursive: true, force: true });
  }
});
