// REQ-03 · Unit tests of the simulated Supabase: select/alias/embeds, filters, shaping, writes, RPC, storage, CORS.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './supabaseMock.mjs';

let mock;
let base;
const get = (p, init) => fetch(`${base}/rest/v1/${p}`, init);
const json = async (p, init) => (await get(p, init)).json();

before(async () => {
  mock = await startMock({ port: 0 });
  base = mock.url;
});
after(() => mock.close());

test('select columns returns only those columns', async () => {
  const rows = await json('videos?select=id,title&limit=2');
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]), ['id', 'title']);
});

test('select * returns every column', async () => {
  const [row] = await json('members?select=*&limit=1');
  assert.ok('color' in row && 'crew_id' in row && 'archived_at' in row);
});

test('alias:column renames the key', async () => {
  const [row] = await json('videos?select=name:title,id&limit=1');
  assert.deepEqual(Object.keys(row), ['name', 'id']);
});

test('embedded to-one with alias, nested and columns', async () => {
  const rows = await json('track_items?select=*,clip:clips(id,name,video:videos(id,title))&limit=3');
  const row = rows[0];
  assert.ok(row.clip.id && row.clip.name);
  assert.deepEqual(Object.keys(row.clip.video), ['id', 'title']);
});

test('embedded count and to-many', async () => {
  const videos = await json('videos?select=id,clips(count)&limit=5');
  for (const v of videos) assert.equal(typeof v.clips[0].count, 'number');
  const total = videos.reduce((s, v) => s + v.clips[0].count, 0);
  const clips = await json(`clips?select=id&video_id=in.(${videos.map((v) => v.id).join(',')})`);
  assert.equal(clips.length, total);
  const plans = await json('formation_plans?select=*,formation_plan_members(member_id),formations(count)');
  assert.ok(plans[0].formation_plan_members.length > 0);
  assert.ok(plans[0].formations[0].count > 0);
});

test('!inner drops parents without match and dotted filter reaches the embed', async () => {
  const [take] = await json('takes?select=video_id&limit=1');
  const rows = await json(
    `take_reactions?select=id,take:takes!inner(video_id)&take.video_id=eq.${take.video_id}`,
  );
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.take.video_id === take.video_id));
  const none = await json('take_reactions?select=id,take:takes!inner(video_id)&take.video_id=eq.nope');
  assert.equal(none.length, 0);
});

test('filters eq neq in is not.is gt gte lt lte', async () => {
  const all = await json('videos?select=id,source,youtube_id,duration_seconds,created_at');
  const yt = await json('videos?select=id&source=eq.youtube');
  assert.equal(yt.length, all.filter((v) => v.source === 'youtube').length);
  const notYt = await json('videos?select=id&source=neq.youtube');
  assert.equal(notYt.length, all.length - yt.length);
  const ids = all.slice(0, 3).map((v) => v.id);
  assert.equal((await json(`videos?select=id&id=in.(${ids.join(',')})`)).length, 3);
  assert.equal(
    (await json('videos?select=id&youtube_id=is.null')).length,
    all.filter((v) => v.youtube_id === null).length,
  );
  assert.equal(
    (await json('videos?select=id&youtube_id=not.is.null')).length,
    all.filter((v) => v.youtube_id !== null).length,
  );
  assert.equal((await json('videos?select=id&archived_at=is.null')).length, all.length);
  const d = all
    .filter((v) => v.duration_seconds !== null)
    .map((v) => v.duration_seconds)
    .sort((a, b) => a - b);
  const mid = d[Math.floor(d.length / 2)];
  const count = async (op) => (await json(`videos?select=id&duration_seconds=${op}.${mid}`)).length;
  assert.equal(await count('gt'), d.filter((x) => x > mid).length);
  assert.equal(await count('gte'), d.filter((x) => x >= mid).length);
  assert.equal(await count('lt'), d.filter((x) => x < mid).length);
  assert.equal(await count('lte'), d.filter((x) => x <= mid).length);
  const since = all[0].created_at;
  assert.ok((await json(`videos?select=id&created_at=gt.${encodeURIComponent(since)}`)).length < all.length);
});

test('is.true on booleans', async () => {
  const pinned = await json('clips?select=id,is_pinned&is_pinned=is.true');
  assert.ok(pinned.length > 0 && pinned.every((c) => c.is_pinned === true));
});

test('order asc, desc, secondary key, nulls', async () => {
  const asc = await json('clips?select=start_seconds&order=start_seconds');
  assert.deepEqual(
    asc.map((c) => c.start_seconds),
    asc.map((c) => c.start_seconds).sort((a, b) => a - b),
  );
  const desc = await json('clips?select=start_seconds&order=start_seconds.desc');
  assert.deepEqual(
    desc.map((c) => c.start_seconds),
    asc.map((c) => c.start_seconds).reverse(),
  );
  const multi = await json('clips?select=is_pinned,created_at&order=is_pinned.desc,created_at.desc');
  assert.equal(multi[0].is_pinned, true);
  const nulls = await json('videos?select=youtube_id&order=youtube_id.asc.nullsfirst');
  assert.equal(nulls[0].youtube_id, null);
});

test('limit, offset and Range header', async () => {
  const all = await json('videos?select=id&order=id');
  assert.deepEqual(
    (await json('videos?select=id&order=id&limit=3')).map((r) => r.id),
    all.slice(0, 3).map((r) => r.id),
  );
  assert.deepEqual(
    (await json('videos?select=id&order=id&limit=2&offset=4')).map((r) => r.id),
    all.slice(4, 6).map((r) => r.id),
  );
  const res = await get('videos?select=id&order=id', { headers: { range: '2-4' } });
  assert.equal(res.status, 206);
  assert.deepEqual(
    (await res.json()).map((r) => r.id),
    all.slice(2, 5).map((r) => r.id),
  );
});

test('single object, and 406 when not exactly one row', async () => {
  const [{ id }] = await json('videos?select=id&limit=1');
  const ok = await get(`videos?select=id,title&id=eq.${id}`, {
    headers: { accept: 'application/vnd.pgrst.object+json' },
  });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).id, id);
  const bad = await get('videos?select=id', { headers: { accept: 'application/vnd.pgrst.object+json' } });
  assert.equal(bad.status, 406);
  assert.equal((await bad.json()).code, 'PGRST116');
});

test('Prefer count=exact sets Content-Range total, HEAD has no body', async () => {
  const all = await json('videos?select=id');
  const res = await get('videos?select=id&limit=2', { headers: { prefer: 'count=exact' } });
  assert.equal(res.headers.get('content-range'), `0-1/${all.length}`);
  const head = await get('videos?select=id', { method: 'HEAD', headers: { prefer: 'count=exact' } });
  assert.equal(head.headers.get('content-range'), `0-${all.length - 1}/${all.length}`);
  assert.equal((await head.text()).length, 0);
});

test('archived rows are hidden, DELETE archives, PATCH and POST return the row', async () => {
  const created = await (
    await get('notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({
        video_id: (await json('videos?select=id&limit=1'))[0].id,
        at_seconds: 1,
        body: 'x',
      }),
    })
  ).json();
  assert.equal(created[0].body, 'x');
  assert.ok(created[0].id && created[0].crew_id);
  const patched = await (
    await get(`notes?id=eq.${created[0].id}&select=*`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        prefer: 'return=representation',
        accept: 'application/vnd.pgrst.object+json',
      },
      body: JSON.stringify({ body: 'y' }),
    })
  ).json();
  assert.equal(patched.body, 'y');
  const del = await get(`notes?id=eq.${created[0].id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  assert.equal((await json(`notes?select=id&id=eq.${created[0].id}`)).length, 0);
  assert.ok(mock.db.notes.find((n) => n.id === created[0].id).archived_at, 'row kept with archived_at');
});

test('RPC: storage_usage, calendar_members, draw_from_bag, cast_vote, close_poll, plans', async () => {
  const rpc = async (fn, args) =>
    (
      await fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args ?? {}),
      })
    ).json();
  const usage = await rpc('storage_usage');
  assert.ok(usage.total >= usage.takes && usage.limit > 0);
  const members = await rpc('calendar_members');
  assert.deepEqual(Object.keys(members[0]).sort(), ['archived', 'color', 'id', 'name']);
  const [bag] = await json('bags?select=id&limit=1');
  const draws = await rpc('draw_from_bag', { p_bag: bag.id, p_count: 1, p_remove: false, p_member: null });
  assert.equal(draws.length, 1);
  assert.ok(draws[0].label);
  const [poll] = await json('polls?select=id&closed_at=is.null&limit=1');
  const opts = await json(`poll_options?select=id&poll_id=eq.${poll.id}`);
  assert.equal(
    await rpc('cast_vote', { p_poll: poll.id, p_member: members[0].id, p_options: [opts[0].id] }),
    1,
  );
  assert.ok(
    ['closed', 'tie'].includes(
      (await rpc('close_poll', { p_poll: poll.id, p_resolve: true, p_winner: null })).status,
    ),
  );
  const [plan] = await json('formation_plans?select=*&limit=1');
  const stale = await rpc('update_formation_plan', {
    p_plan: plan.id,
    p_expected_revision: plan.revision - 1,
    p_patch: {},
  });
  assert.deepEqual(stale, { ok: false, revision: plan.revision });
  const fresh = await rpc('update_formation_plan', {
    p_plan: plan.id,
    p_expected_revision: plan.revision,
    p_patch: { name: 'Otro' },
  });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.plan.name, 'Otro');
  const missing = await fetch(`${base}/rest/v1/rpc/nope`, { method: 'POST', body: '{}' });
  assert.equal(missing.status, 404);
});

test('storage: sign, batch sign, download bytes (deterministic, Range), upload', async () => {
  const sign = await (
    await fetch(`${base}/storage/v1/object/sign/videos/a/b.mp4`, { method: 'POST', body: '{"expiresIn":60}' })
  ).json();
  assert.ok(sign.signedURL.startsWith('/object/sign/videos/a/b.mp4'));
  const batch = await (
    await fetch(`${base}/storage/v1/object/sign/videos`, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: 60, paths: ['x.mp4', 'y.mp4'] }),
    })
  ).json();
  assert.equal(batch.length, 2);
  assert.ok(batch[1].signedURL.includes('y.mp4'));
  const a = Buffer.from(await (await fetch(`${base}/storage/v1${sign.signedURL}`)).arrayBuffer());
  const b = Buffer.from(await (await fetch(`${base}/storage/v1${sign.signedURL}`)).arrayBuffer());
  assert.ok(a.length > 0 && a.equals(b));
  const part = await fetch(`${base}/storage/v1${sign.signedURL}`, { headers: { range: 'bytes=0-9' } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 10);
  const up = await fetch(`${base}/storage/v1/object/takes/t/1.mp4`, {
    method: 'POST',
    headers: { 'content-type': 'video/mp4' },
    body: Buffer.from('hello'),
  });
  assert.equal(up.status, 200);
  const back = await fetch(`${base}/storage/v1/object/takes/t/1.mp4`);
  assert.equal(await back.text(), 'hello');
});

test('CORS preflight allows supabase-js headers; responses expose Timing-Allow-Origin', async () => {
  const headers =
    'apikey, authorization, x-client-info, prefer, range, content-profile, accept-profile, accept, content-type';
  const pre = await fetch(`${base}/rest/v1/videos`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:4180',
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': headers,
    },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  const allowed = pre.headers.get('access-control-allow-headers');
  for (const h of headers.split(', ')) assert.ok(allowed.includes(h), h);
  assert.match(pre.headers.get('access-control-allow-methods'), /PATCH/);
  const res = await get('videos?select=id&limit=1');
  assert.equal(res.headers.get('timing-allow-origin'), '*');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-expose-headers'), /Content-Range/);
});

test('latency delays each request', async () => {
  const slow = await startMock({ port: 0, latency: 120 });
  try {
    const t0 = performance.now();
    await fetch(`${slow.url}/rest/v1/members?select=id`);
    assert.ok(performance.now() - t0 >= 110);
  } finally {
    await slow.close();
  }
  const t1 = performance.now();
  await get('members?select=id');
  assert.ok(performance.now() - t1 < 100);
});

test('unknown table is 404 with a PostgREST error body', async () => {
  const res = await get('nope?select=*');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, '42P01');
});
