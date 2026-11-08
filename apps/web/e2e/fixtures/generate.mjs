// REQ-02 · Writes the deterministic demo fixture (`demo-db.json`): the whole `coverscape.demo.v1` store the e2e
// suite seeds before the app runs. Run from apps/web:  node e2e/fixtures/generate.mjs
//
// Everything is derived from FIXED_NOW and a seeded PRNG, so two runs give the same bytes (check with a hash). The
// upload posters and the take-note drawings are painted in Playwright's Chromium (canvas → toDataURL) because the
// real app makes them the same way: their size is what a real store weighs, which is what the REQ-26 measurements
// need. No text is drawn, so the pictures don't depend on the fonts installed on the machine.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/** Keep in sync with e2e/support/seed.ts (FIXED_NOW): 2026-10-20 18:00 in Madrid (CEST, +02:00), a Tuesday. */
const FIXED_NOW = Date.parse('2026-10-20T18:00:00+02:00');
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** An ISO timestamp `days` (and `hours`) away from FIXED_NOW. */
const at = (days, hours = 0) => new Date(FIXED_NOW + days * DAY + hours * HOUR).toISOString();

// Same ids as e2e/demo.ts, so the older helpers and these fixtures can be mixed.
const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
const CREW_ID = '00000000-0000-4000-8000-0000000000c1';
/** This browser's device id (oneshoot.device.v1): the seeded takes say they were recorded on it. */
const DEVICE_ID = '00000000-0000-4000-8000-0000000000d1';

/** Deterministic UUID v4-shaped ids: one namespace per table, a counter inside it. */
const TABLE = {
  member: 0x001,
  video: 0x002,
  clip: 0x003,
  note: 0x004,
  take: 0x005,
  reaction: 0x006,
  bag: 0x007,
  bagItem: 0x008,
  bagDraw: 0x009,
  track: 0x00a,
  trackItem: 0x00b,
  wish: 0x00c,
  interest: 0x00d,
  poll: 0x00e,
  option: 0x00f,
  vote: 0x010,
  event: 0x011,
  eventSong: 0x012,
  rule: 0x013,
  exception: 0x014,
  absence: 0x015,
  change: 0x016,
  plan: 0x017,
  planMember: 0x018,
  formation: 0x019,
  prop: 0x01a,
};
const uid = (table, n) =>
  `00000000-0000-4000-8${TABLE[table].toString(16).padStart(3, '0')}-${(n + 1).toString(16).padStart(12, '0')}`;

/** mulberry32: a tiny seeded PRNG (the same one runs in the page for the pictures). */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20261020);
const pick = (list) => list[Math.floor(rand() * list.length)];
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ───────────── Pictures (Chromium canvas) ─────────────

async function paintPictures(posterSeeds, sketchSeeds) {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>fixtures</title>');
    return await page.evaluate(
      ({ posterSeeds, sketchSeeds }) => {
        const prng = (seed) => {
          let a = seed >>> 0;
          return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        };

        // A rehearsal-room still: a lit floor, stage lights and a few dancer silhouettes, plus film grain so the
        // JPEG weighs what a real frame does (~20–40 kB at 640×360, quality 0.8).
        const poster = (seed) => {
          const r = prng(seed);
          const c = document.createElement('canvas');
          c.width = 640;
          c.height = 360;
          const g = c.getContext('2d');
          const hue = Math.floor(r() * 360);
          const bg = g.createLinearGradient(0, 0, 0, 360);
          bg.addColorStop(0, `hsl(${hue} 45% 18%)`);
          bg.addColorStop(0.62, `hsl(${(hue + 30) % 360} 35% 32%)`);
          bg.addColorStop(1, `hsl(${(hue + 50) % 360} 25% 12%)`);
          g.fillStyle = bg;
          g.fillRect(0, 0, 640, 360);
          for (let i = 0; i < 4; i++) {
            const x = 60 + r() * 520;
            const light = g.createRadialGradient(x, 20, 4, x, 120, 220);
            light.addColorStop(0, `hsla(${(hue + 180 + i * 25) % 360} 90% 75% / 0.55)`);
            light.addColorStop(1, 'hsla(0 0% 0% / 0)');
            g.fillStyle = light;
            g.fillRect(0, 0, 640, 360);
          }
          // Mirror wall lines.
          g.strokeStyle = 'hsla(0 0% 100% / 0.08)';
          for (let x = 0; x < 640; x += 80 + Math.floor(r() * 40)) {
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, 230);
            g.stroke();
          }
          const dancers = 3 + Math.floor(r() * 4);
          for (let i = 0; i < dancers; i++) {
            const x = 70 + (i + 0.5) * (500 / dancers) + (r() - 0.5) * 30;
            const s = 0.8 + r() * 0.4;
            const lean = (r() - 0.5) * 0.5;
            g.save();
            g.translate(x, 300);
            g.rotate(lean);
            g.scale(s, s);
            g.fillStyle = `hsl(${(hue + 200) % 360} 20% ${8 + r() * 10}%)`;
            g.beginPath();
            g.arc(0, -150, 16, 0, Math.PI * 2);
            g.fill();
            g.beginPath();
            g.roundRect(-18, -132, 36, 70, 12);
            g.fill();
            g.lineWidth = 11;
            g.lineCap = 'round';
            g.strokeStyle = g.fillStyle;
            const arm = (dir) => {
              g.beginPath();
              g.moveTo(dir * 14, -122);
              g.lineTo(dir * (28 + r() * 18), -100 + (r() - 0.5) * 70);
              g.lineTo(dir * (30 + r() * 26), -80 + (r() - 0.5) * 90);
              g.stroke();
            };
            arm(-1);
            arm(1);
            g.beginPath();
            g.moveTo(-8, -64);
            g.lineTo(-14 - r() * 20, 0);
            g.moveTo(8, -64);
            g.lineTo(14 + r() * 20, 0);
            g.stroke();
            g.restore();
          }
          const img = g.getImageData(0, 0, 640, 360);
          for (let i = 0; i < img.data.length; i += 4) {
            const n = (r() - 0.5) * 20;
            img.data[i] += n;
            img.data[i + 1] += n;
            img.data[i + 2] += n;
          }
          g.putImageData(img, 0, 0);
          return c.toDataURL('image/jpeg', 0.8);
        };

        // A coach's drawing over the frame: circles and arrows on a transparent 320×180 WebP (what the composer
        // saves, see reviewRules.encodeSketch).
        const sketch = (seed) => {
          const r = prng(seed);
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 180;
          const g = c.getContext('2d');
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.lineWidth = 4;
          g.strokeStyle = '#ff5a4f';
          g.beginPath();
          g.ellipse(80 + r() * 160, 60 + r() * 60, 26 + r() * 12, 34 + r() * 12, 0, 0, Math.PI * 2);
          g.stroke();
          const x0 = 40 + r() * 80;
          const y0 = 140 - r() * 40;
          const x1 = 200 + r() * 80;
          const y1 = 30 + r() * 60;
          g.beginPath();
          g.moveTo(x0, y0);
          g.quadraticCurveTo((x0 + x1) / 2, y0 - 60, x1, y1);
          g.stroke();
          const a = Math.atan2(y1 - (y0 - 60), x1 - (x0 + x1) / 2);
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x1 - 14 * Math.cos(a - 0.5), y1 - 14 * Math.sin(a - 0.5));
          g.moveTo(x1, y1);
          g.lineTo(x1 - 14 * Math.cos(a + 0.5), y1 - 14 * Math.sin(a + 0.5));
          g.stroke();
          return c.toDataURL('image/webp', 0.8);
        };

        return { posters: posterSeeds.map(poster), sketches: sketchSeeds.map(sketch) };
      },
      { posterSeeds, sketchSeeds },
    );
  } finally {
    await browser.close();
  }
}

// ───────────── Rows ─────────────

const MEMBERS = [
  ['Hana', 'shu'],
  ['Mina', 'ai'],
  ['Yuna', 'kin'],
  ['Sora', 'enji'],
  ['Rei', 'murasaki'],
  ['Aoi', 'fuji'],
].map(([name, color], i) => ({
  id: uid('member', i),
  crew_id: CREW_ID,
  name,
  color,
  created_at: at(-200, i),
  archived_at: null,
}));
const member = (i) => MEMBERS[i % MEMBERS.length].id;

/** Real, well-known K-pop MVs and dance practices (the iframe and ytimg thumbnails need the network). */
const YOUTUBE = [
  ['gdZLi9oWNZg', 'Dynamite', 'BTS', 199],
  ['IHNzOHi8sJs', 'DDU-DU DDU-DU', 'BLACKPINK', 216],
  ['ioNng23DkIM', 'How You Like That', 'BLACKPINK', 181],
  ['9bZkp7q19f0', 'Gangnam Style', 'PSY', 252],
  ['ePpPVE-GGJw', 'TT', 'TWICE', 214],
  ['kOHB85vDuow', 'FANCY', 'TWICE', 218],
  ['WMweEpGlu_U', 'Butter', 'BTS', 165],
  ['XsX3ATc3FbA', 'Boy With Luv', 'BTS', 229],
  ['11cta61wi0g', 'Hype Boy', 'NewJeans', 180],
  ['js1CtxSY38I', 'Attention', 'NewJeans', 181],
  ['Y8JFxS1HlDo', 'LOVE DIVE', 'IVE', 178],
  ['4TWR90KJl84', 'Next Level', 'aespa', 221],
  ['TQTlCHxyuu8', "God's Menu", 'Stray Kids', 168],
  ['pNfTK39k55U', 'DALLA DALLA', 'ITZY', 199],
  ['uR8Mrt1IpXg', 'Psycho', 'Red Velvet', 211],
  ['pyf8cbqyfPs', 'ANTIFRAGILE', 'LE SSERAFIM', 185],
  ['Jh4QFaPmdss', 'TOMBOY', '(G)I-DLE', 175],
  ['J-wFp43XOrA', 'Very Nice', 'SEVENTEEN', 222],
  ['I3dezFzsNss', 'Growl', 'EXO', 207],
  ['2S24-y0Ij3Y', 'Kill This Love', 'BLACKPINK', 193],
];
const UPLOADS = [
  ['Ensayo coreo completa', 'Hana', 214],
  ['Formación estribillo', null, 96],
  ['Grabación espejo', 'Mina', 132],
  ['Paso del puente lento', 'Yuna', 58],
  ['Final con cambio', null, 74],
  ['Repaso del martes', 'Sora', 188],
  ['Intro a cámara', 'Rei', 41],
  ['Coreo nueva v2', 'Aoi', 165],
  ['Pasada general', null, 242],
  ['Ideas de transiciones', 'Hana', 87],
];

function buildVideos(posters) {
  const youtube = YOUTUBE.map(([youtubeId, title, artist, duration], i) => ({
    id: uid('video', i),
    crew_id: CREW_ID,
    title,
    artist,
    source: 'youtube',
    youtube_id: youtubeId,
    storage_path: null,
    // Video 2 has a linked device file (synced 1.25 s later); its copy isn't on this device.
    file_name: i === 2 ? 'how-you-like-that-practica.mp4' : null,
    file_size: i === 2 ? 48_213_904 : null,
    file_duration_seconds: i === 2 ? 183.4 : null,
    file_offset_seconds: i === 2 ? 1.25 : null,
    duration_seconds: duration,
    thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    aspect_ratio: i % 4 === 0 ? 1.7778 : null,
    created_by: DEMO_USER_ID,
    archived_at: null,
    created_at: at(-150 + i * 6, 3),
    updated_at: at(-150 + i * 6, 3),
  }));
  const uploads = UPLOADS.map(([title, artist, duration], i) => ({
    id: uid('video', 20 + i),
    crew_id: CREW_ID,
    title,
    artist,
    source: 'upload',
    youtube_id: null,
    // Only on the device that uploaded it (no group copy): the demo has no file for it, see support/seed.ts.
    storage_path: null,
    file_name: `ensayo-${String(i + 1).padStart(2, '0')}.mp4`,
    file_size: 8_000_000 + i * 3_517_219,
    file_duration_seconds: null,
    file_offset_seconds: null,
    duration_seconds: duration,
    thumbnail_url: posters[i],
    aspect_ratio: null,
    created_by: DEMO_USER_ID,
    archived_at: null,
    created_at: at(-28 + i * 2, 5),
    updated_at: at(-28 + i * 2, 5),
  }));
  return [...youtube, ...uploads];
}

const CLIP_COLORS = ['wine', 'plum', 'orchid', 'rose', 'gold', 'teal'];
const CLIP_NAMES = ['Intro', 'Estribillo', 'Puente', 'Final', 'Paso 1', 'Paso 2', 'Cambio', 'Solo de Hana'];

function buildClips(videos) {
  const clips = [];
  for (let i = 0; i < 40; i++) {
    // Most clips on the first songs (the studio lists get long), a few on uploads.
    const video = i < 32 ? videos[i % 14] : videos[20 + (i % 8)];
    const length = 6 + Math.floor(rand() * 20);
    const start = round(rand() * Math.max(1, video.duration_seconds - length - 2), 2);
    const zoomed = i === 3 || i === 17 || i === 33;
    clips.push({
      id: uid('clip', i),
      crew_id: CREW_ID,
      video_id: video.id,
      name: `${CLIP_NAMES[i % CLIP_NAMES.length]}${i >= CLIP_NAMES.length ? ` ${Math.floor(i / CLIP_NAMES.length) + 1}` : ''}`,
      start_seconds: start,
      end_seconds: round(start + length, 2),
      speed: pick([1, 1, 0.75, 0.5, 1.25]),
      mirrored: i % 3 !== 0,
      color: CLIP_COLORS[i % CLIP_COLORS.length],
      is_pinned: [0, 5, 9, 14, 22].includes(i),
      follow_path_id: null,
      zoom_scale: zoomed ? 2.25 : 1,
      zoom_x: zoomed ? 0.35 : 0.5,
      zoom_y: zoomed ? 0.42 : 0.5,
      created_by: DEMO_USER_ID,
      archived_at: null,
      created_at: at(-120 + i * 2.5, 1),
    });
  }
  return clips;
}

const NOTE_BODIES = [
  'Aquí entra el cambio de formación',
  'Brazos más altos en el golpe',
  'Contar 5-6-7-8 antes del giro',
  'Mirar a cámara en el estribillo',
  'Ojo con el tempo, se acelera',
  'Hana y Mina se cruzan por delante',
  'Bajar al suelo en dos tiempos',
  'Respirar antes del final',
];

function buildNotes(videos, takes, sketches) {
  const notes = [];
  // Notes with a time on the song (studio).
  for (let i = 0; i < 16; i++) {
    const video = videos[i % 10];
    notes.push({
      id: uid('note', i),
      crew_id: CREW_ID,
      video_id: video.id,
      at_seconds: round(5 + rand() * (video.duration_seconds - 10), 2),
      body: NOTE_BODIES[i % NOTE_BODIES.length],
      take_id: null,
      take_seconds: null,
      category: null,
      for_member_id: null,
      author_member_id: i % 4 === 3 ? null : member(i),
      status: 'open',
      sketch: null,
      created_by: DEMO_USER_ID,
      archived_at: null,
      created_at: at(-60 + i * 3, 2),
      updated_at: at(-60 + i * 3, 2),
    });
  }
  // Take notes (review): some with a drawing, one already done.
  const categories = ['brazos', 'tiempo', 'direccion', 'piernas', 'expresion', 'energia', null, 'espacio'];
  for (let i = 0; i < 8; i++) {
    const take = takes[i % takes.length];
    const takeSeconds = round(2 + rand() * (take.duration_seconds - 4), 2);
    notes.push({
      id: uid('note', 16 + i),
      crew_id: CREW_ID,
      video_id: take.video_id,
      at_seconds: round(take.song_start_seconds + takeSeconds * take.speed, 2),
      body: NOTE_BODIES[(i + 3) % NOTE_BODIES.length],
      take_id: take.id,
      take_seconds: takeSeconds,
      category: categories[i],
      for_member_id: take.member_id,
      author_member_id: member(i + 2),
      status: i === 5 ? 'done' : 'open',
      sketch: i < sketches.length ? sketches[i] : null,
      created_by: DEMO_USER_ID,
      archived_at: null,
      created_at: at(-6 + i * 0.5, 1),
      updated_at: at(-6 + i * 0.5, 1),
    });
  }
  return notes;
}

function buildTakes(videos, clips) {
  const takes = [];
  for (let i = 0; i < 10; i++) {
    const video = videos[i % 4];
    const clip = clips.find((c) => c.video_id === video.id && i % 2 === 0) ?? null;
    const start = clip ? clip.start_seconds : round(rand() * 40, 2);
    const speed = clip ? clip.speed : 1;
    const duration = clip ? round((clip.end_seconds - clip.start_seconds) / speed, 2) : 30;
    takes.push({
      id: uid('take', i),
      crew_id: CREW_ID,
      video_id: video.id,
      clip_id: clip?.id ?? null,
      member_id: i === 9 ? null : member(i),
      device_id: DEVICE_ID,
      duration_seconds: duration,
      file_name: `toma-${String(i + 1).padStart(2, '0')}.webm`,
      mime_type: 'video/webm',
      width: 720,
      height: 1280,
      mirrored: true,
      // One best take per song and member at most (takes_one_best_key).
      is_best: i === 0 || i === 5,
      recorded_at: at(-9 + i, 1),
      song_start_seconds: start,
      song_end_seconds: round(start + duration * speed, 2),
      speed,
      take_speed: 1,
      sync_adjust_seconds: i === 1 ? 0.12 : 0,
      fit_scale: i === 2 ? 1.2 : 1,
      fit_x: i === 2 ? 0.05 : 0,
      fit_y: i === 2 ? -0.04 : 0,
      shared_path: null,
      shared_size: null,
      created_at: at(-9 + i, 1),
      archived_at: null,
    });
  }
  return takes;
}

function buildReactions(takes) {
  const emojis = ['🔥', '👏', '💯', '😂'];
  const rows = [];
  takes.slice(0, 6).forEach((take, t) => {
    for (let k = 0; k < 1 + (t % 3); k++) {
      rows.push({
        id: uid('reaction', rows.length),
        crew_id: CREW_ID,
        take_id: take.id,
        emoji: emojis[(t + k) % emojis.length],
        member_id: member(t + k + 1),
        created_at: at(-5 + t * 0.5, k),
        archived_at: null,
      });
    }
  });
  return rows;
}

function buildBags(videos, clips) {
  const bags = [
    { id: uid('bag', 0), name: 'Canciones del mes', kind: 'songs', draw_mode: 'remove', no_repeat: false },
    { id: uid('bag', 1), name: 'Clips para calentar', kind: 'clips', draw_mode: 'keep', no_repeat: true },
    { id: uid('bag', 2), name: 'Quién empieza', kind: 'people', draw_mode: 'remove', no_repeat: false },
  ].map((b, i) => ({ ...b, crew_id: CREW_ID, created_at: at(-40 + i, 0), archived_at: null }));

  const items = [];
  const item = (bag, fields, removed = false) => ({
    id: uid('bagItem', items.length),
    crew_id: CREW_ID,
    bag_id: bag.id,
    video_id: null,
    clip_id: null,
    member_id: null,
    wish_id: null,
    youtube_id: null,
    title: null,
    artist: null,
    thumbnail_url: null,
    duration_seconds: null,
    ...fields,
    removed_at: removed ? at(-2, 1) : null,
    created_at: at(-39, items.length * 0.1),
    archived_at: null,
  });
  for (let i = 0; i < 7; i++) items.push(item(bags[0], { video_id: videos[i].id }, i === 1));
  // A song not in the library (a YouTube link added straight to the bag).
  items.push(
    item(bags[0], {
      youtube_id: 'gQlMMD8auMs',
      title: 'Pink Venom',
      artist: 'BLACKPINK',
      thumbnail_url: 'https://i.ytimg.com/vi/gQlMMD8auMs/hqdefault.jpg',
      duration_seconds: 187,
    }),
  );
  for (let i = 0; i < 8; i++) items.push(item(bags[1], { clip_id: clips[i].id }));
  for (let i = 0; i < 6; i++) items.push(item(bags[2], { member_id: MEMBERS[i].id }, i === 3));

  const labelOf = (it) =>
    it.member_id
      ? MEMBERS.find((m) => m.id === it.member_id).name
      : it.clip_id
        ? clips.find((c) => c.id === it.clip_id).name
        : it.video_id
          ? videos.find((v) => v.id === it.video_id).title
          : it.title;
  const draws = [];
  const drawFrom = (bag, picks) =>
    picks.forEach((idx, seq) => {
      const bagItems = items.filter((it) => it.bag_id === bag.id);
      const it = bagItems[idx];
      draws.push({
        id: uid('bagDraw', draws.length),
        crew_id: CREW_ID,
        bag_id: bag.id,
        item_id: it.id,
        label: labelOf(it),
        member_id: member(seq),
        removed: bag.draw_mode === 'remove' && it.removed_at != null,
        seq: seq + 1,
        drawn_at: at(-10 + seq, 2),
      });
    });
  drawFrom(bags[0], [3, 1, 5, 0]);
  drawFrom(bags[1], [2, 6, 4]);
  drawFrom(bags[2], [3, 0, 5, 2, 1]);
  return { bags, bag_items: items, bag_draws: draws };
}

function buildTracks(clips) {
  const tracks = [
    {
      name: 'Ronda calentamiento',
      pause_seconds: 2,
      countdown: true,
      title_mode: 'before',
      use_clip_settings: true,
    },
    {
      name: 'Ronda del concurso',
      pause_seconds: 3.5,
      countdown: false,
      title_mode: 'after',
      use_clip_settings: false,
    },
  ].map((t, i) => ({
    id: uid('track', i),
    crew_id: CREW_ID,
    ...t,
    created_at: at(-20 + i * 4, 0),
    updated_at: at(-18 + i * 4, 0),
    archived_at: null,
  }));
  const items = [];
  const add = (track, clipIdx) =>
    clipIdx.forEach((c, position) =>
      items.push({
        id: uid('trackItem', items.length),
        crew_id: CREW_ID,
        track_id: track.id,
        clip_id: clips[c].id,
        position,
        created_at: track.created_at,
        archived_at: null,
      }),
    );
  add(tracks[0], [0, 4, 9, 12, 2]);
  add(tracks[1], [1, 7, 14, 20, 25, 30]);
  return { tracks, track_items: items };
}

const WISHES = [
  ['7C2z4GqqS5E', 'FAKE LOVE', 'BTS', 7, 'dificil', 'La del concurso del año pasado'],
  ['i0p1bmr0EmE', 'What is Love?', 'TWICE', 9, 'media', null],
  ['WyiIGEHQP8o', 'Red Flavor', 'Red Velvet', 5, 'facil', 'Para el verano'],
  ['KhTeiaCezwM', 'HIP', 'MAMAMOO', 4, 'media', null],
  ['fE2h3lGlOsk', 'WANNABE', 'ITZY', 5, 'dificil', 'Mucho cardio'],
  ['F0B7HDiY-10', 'After LIKE', 'IVE', 6, 'media', null],
  ['CM4CkVFmTds', 'Cheer Up', 'TWICE', 9, 'facil', 'Clásico'],
  ['WPdWvnAAurg', 'Savage', 'aespa', 4, 'dificil', null],
];

function buildWishes(videos) {
  const wishes = WISHES.map(([youtubeId, title, artist, count, difficulty, comment], i) => ({
    id: uid('wish', i),
    crew_id: CREW_ID,
    youtube_id: youtubeId,
    title,
    artist,
    thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    members_count: count,
    difficulty,
    comment,
    proposed_by_member_id: i === 7 ? null : member(i),
    // Wish 6 already made it to the library.
    added_video_id: i === 6 ? videos[5].id : null,
    created_at: at(-45 + i * 2, 4),
    archived_at: null,
  }));
  const interest = [];
  wishes.forEach((w, i) => {
    for (let k = 0; k < (i % 5) + 1; k++) {
      interest.push({
        id: uid('interest', interest.length),
        crew_id: CREW_ID,
        wish_id: w.id,
        member_id: member(i + k),
        created_at: at(-44 + i * 2, k),
        archived_at: null,
      });
    }
  });
  return { wishes, wish_interest: interest };
}

function buildPolls(wishes) {
  const polls = [];
  const options = [];
  const votes = [];
  const poll = (fields, wishIdx) => {
    const p = {
      id: uid('poll', polls.length),
      crew_id: CREW_ID,
      title: fields.title,
      vote_type: fields.vote_type,
      anonymous: fields.anonymous ?? false,
      results_live: fields.results_live ?? true,
      closes_at: fields.closes_at ?? null,
      closed_at: fields.closed_at ?? null,
      winner_wish_id: fields.winner == null ? null : wishes[fields.winner].id,
      parent_poll_id: fields.parent ?? null,
      created_by_member_id: member(polls.length),
      created_at: fields.created_at,
      archived_at: null,
    };
    polls.push(p);
    const opts = wishIdx.map((w) => {
      const o = {
        id: uid('option', options.length),
        crew_id: CREW_ID,
        poll_id: p.id,
        wish_id: wishes[w].id,
        created_at: p.created_at,
        archived_at: null,
      };
      options.push(o);
      return o;
    });
    return { p, opts };
  };
  /** `ballots[m]` = option indexes member m chose (ranked in order for 'ranking'). */
  const vote = ({ p, opts }, ballots) =>
    ballots.forEach((ballot, m) =>
      ballot.forEach((o, k) =>
        votes.push({
          id: uid('vote', votes.length),
          crew_id: CREW_ID,
          poll_id: p.id,
          option_id: opts[o].id,
          member_id: member(m),
          rank: p.vote_type === 'ranking' ? k + 1 : null,
          created_at: new Date(Date.parse(p.created_at) + 0.2 * DAY + m * 0.1 * HOUR).toISOString(),
          archived_at: null,
        }),
      ),
    );

  // Open, one of each type. The multi one is tied right now: closing it asks how to break the tie.
  vote(
    poll(
      { title: '¿Cuál para Navidad?', vote_type: 'single', closes_at: at(3, 2), created_at: at(-2, 0) },
      [0, 1, 2, 3],
    ),
    [[0], [1], [0], [2]],
  );
  vote(
    poll(
      { title: 'Próximas covers', vote_type: 'multi', anonymous: true, created_at: at(-1, 3) },
      [1, 3, 4, 5],
    ),
    [[0, 1], [1, 2], [0, 3], [2], [0, 1, 2]],
  );
  vote(
    poll(
      { title: 'Ordena las favoritas', vote_type: 'ranking', results_live: false, created_at: at(-1, 1) },
      [0, 2, 4, 5],
    ),
    [
      [0, 1, 2, 3],
      [2, 0, 1, 3],
      [1, 0, 3, 2],
    ],
  );
  // Closed with a winner.
  vote(
    poll(
      {
        title: 'Cover de septiembre',
        vote_type: 'single',
        closed_at: at(-30, 0),
        winner: 2,
        created_at: at(-37, 0),
      },
      [2, 3, 7],
    ),
    [[0], [0], [1], [0], [2], [0]],
  );
  vote(
    poll(
      {
        title: 'Ranking de verano',
        vote_type: 'ranking',
        closed_at: at(-50, 0),
        winner: 4,
        created_at: at(-55, 0),
      },
      [4, 5, 7],
    ),
    [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [0, 1, 2],
    ],
  );
  // Closed on a tie (no winner) and its second round between the tied two, closed with a winner.
  const tied = poll(
    {
      title: 'Cover del concurso',
      vote_type: 'multi',
      closed_at: at(-12, 0),
      winner: null,
      created_at: at(-16, 0),
    },
    [0, 4, 7],
  );
  vote(tied, [[0, 1], [0], [1], [1, 2], [0, 2], [2]]);
  vote(
    poll(
      {
        title: 'Cover del concurso · segunda vuelta',
        vote_type: 'single',
        closed_at: at(-9, 0),
        winner: 4,
        parent: tied.p.id,
        created_at: at(-11, 0),
      },
      [0, 4],
    ),
    [[1], [0], [1], [1], [0], [1]],
  );
  return { polls, poll_options: options, poll_votes: votes };
}

function buildEvents(videos) {
  const events = [
    { name: 'Concurso de otoño', place: 'Sala Apolo, Barcelona', starts_at: at(12, 1.5) },
    { name: 'Ensayo general', place: 'Local de ensayo', starts_at: at(3, 1) },
    { name: 'Showcase de verano', place: null, starts_at: at(-10, -1) },
  ].map((e, i) => ({
    id: uid('event', i),
    crew_id: CREW_ID,
    ...e,
    created_at: at(-60 + i, 0),
    archived_at: null,
  }));
  const songs = [];
  const add = (event, vids) =>
    vids.forEach((v, position) =>
      songs.push({
        id: uid('eventSong', songs.length),
        crew_id: CREW_ID,
        event_id: event.id,
        video_id: videos[v].id,
        position,
        created_at: event.created_at,
        archived_at: null,
      }),
    );
  add(events[0], [0, 4, 8]);
  add(events[1], [1, 2]);
  add(events[2], [5, 9, 11, 20]);
  return { events, event_songs: songs };
}

function buildCalendar() {
  const rules = [
    { weekday: 2, starts_at: '19:00:00', ends_at: '21:00:00' },
    { weekday: 4, starts_at: '19:30:00', ends_at: '21:30:00' },
  ].map((r, i) => ({
    id: uid('rule', i),
    crew_id: CREW_ID,
    ...r,
    valid_from: '2026-09-01',
    valid_until: null,
    changed_by_member: member(0),
    created_at: at(-50, i),
    archived_at: null,
  }));
  const exceptions = [
    { on_date: '2026-10-22', kind: 'cancel', rule_id: rules[1].id, starts_at: null, ends_at: null },
    { on_date: '2026-10-24', kind: 'extra', rule_id: null, starts_at: '11:00:00', ends_at: '13:00:00' },
  ].map((e, i) => ({
    id: uid('exception', i),
    crew_id: CREW_ID,
    ...e,
    changed_by_member: member(1),
    created_at: at(-3, i),
    archived_at: null,
  }));
  const absences = [
    {
      member: 1,
      kind: 'all_day',
      starts_on: '2026-10-22',
      ends_on: '2026-10-22',
      at_time: null,
      note: 'Examen',
    },
    {
      member: 3,
      kind: 'arrives',
      starts_on: '2026-10-20',
      ends_on: '2026-10-20',
      at_time: '19:45:00',
      note: null,
    },
    {
      member: 4,
      kind: 'leaves',
      starts_on: '2026-10-27',
      ends_on: '2026-10-27',
      at_time: '20:30:00',
      note: 'Tren',
    },
    {
      member: 5,
      kind: 'all_day',
      starts_on: '2026-10-28',
      ends_on: '2026-10-31',
      at_time: null,
      note: 'Viaje',
    },
  ].map((a, i) => ({
    id: uid('absence', i),
    crew_id: CREW_ID,
    member_id: member(a.member),
    kind: a.kind,
    starts_on: a.starts_on,
    ends_on: a.ends_on,
    at_time: a.at_time,
    note: a.note,
    created_by_member: member(a.member),
    changed_by_member: null,
    created_at: at(-4 + i * 0.5, 0),
    archived_at: null,
  }));
  const changes = [
    { author: 1, subject: null, date: '2026-10-22', body: 'Mina canceló el ensayo del jueves 22' },
    {
      author: 1,
      subject: null,
      date: '2026-10-24',
      body: 'Mina añadió un ensayo el sábado 24 de 11:00 a 13:00',
    },
    { author: 3, subject: 3, date: '2026-10-20', body: 'Sora llega a las 19:45 el martes 20' },
    { author: 5, subject: 5, date: '2026-10-28', body: 'Aoi no viene del 28 al 31 de octubre' },
  ].map((c, i) => ({
    id: uid('change', i),
    crew_id: CREW_ID,
    author_member: member(c.author),
    subject_member: c.subject == null ? null : member(c.subject),
    target_date: c.date,
    body: c.body,
    created_at: at(-3 + i * 0.4, 0),
  }));
  return { absences, rehearsal_rules: rules, rehearsal_exceptions: exceptions, calendar_changes: changes };
}

function buildFormations(videos) {
  const plan = {
    id: uid('plan', 0),
    crew_id: CREW_ID,
    video_id: videos[0].id,
    name: 'Coreo del concurso',
    stage_width: 8,
    stage_depth: 6,
    grid: 0.5,
    bpm: 114,
    first_beat: 0.4,
    revision: 3,
    created_at: at(-14, 0),
    archived_at: null,
  };
  const people = MEMBERS.slice(0, 5);
  const planMembers = people.map((m, i) => ({
    id: uid('planMember', i),
    crew_id: CREW_ID,
    plan_id: plan.id,
    member_id: m.id,
    created_at: plan.created_at,
    archived_at: null,
  }));
  const shapes = [
    // A line, a V and a diamond with the centre in front.
    [
      [1, 3],
      [2.5, 3],
      [4, 3],
      [5.5, 3],
      [7, 3],
    ],
    [
      [1.5, 2],
      [2.75, 3],
      [4, 4],
      [5.25, 3],
      [6.5, 2],
    ],
    [
      [4, 1.5],
      [2.5, 3],
      [4, 4.5],
      [5.5, 3],
      [4, 3],
    ],
  ];
  const formations = shapes.map((shape, i) => {
    const positions = {};
    people.forEach((m, k) => {
      const [x, y] = shape[k];
      positions[m.id] = { x, y };
    });
    // Hana curves into the V.
    if (i === 1) positions[people[0].id].path = { kind: 'curve', points: [{ x: 1, y: 2.5 }] };
    return {
      id: uid('formation', i),
      crew_id: CREW_ID,
      plan_id: plan.id,
      at: [0, 8.4, 16.8][i],
      transition: 2,
      note: i === 2 ? 'Rombo: Yuna al centro' : null,
      positions,
      props: i === 2 ? [{ id: uid('prop', 0), kind: 'mark', x: 4, y: 5.5, rot: 0, label: 'Centro' }] : [],
      created_at: plan.created_at,
      archived_at: null,
    };
  });
  return { formation_plans: [plan], formation_plan_members: planMembers, formations };
}

// ───────────── Assemble ─────────────

async function main() {
  const posterSeeds = UPLOADS.map((_, i) => 1000 + i);
  const sketchSeeds = [2000, 2001, 2002, 2003];
  const { posters, sketches } = await paintPictures(posterSeeds, sketchSeeds);

  const videos = buildVideos(posters);
  const clips = buildClips(videos);
  const takes = buildTakes(videos, clips);
  const notes = buildNotes(videos, takes, sketches);
  const { wishes, wish_interest } = buildWishes(videos);

  // Same keys and table names as the demo backend (src/lib/backend.ts: DemoDb and its *DemoDb extensions).
  const db = {
    crews: [
      { id: CREW_ID, name: 'Demo', invite_code: 'DEMO0000', created_by: DEMO_USER_ID, created_at: at(-210) },
    ],
    profiles: [{ id: DEMO_USER_ID, display_name: 'Demo', avatar_hue: 210, created_at: at(-210) }],
    videos,
    clips,
    notes,
    members: MEMBERS,
    takes,
    take_reactions: buildReactions(takes),
    ...buildBags(videos, clips),
    ...buildTracks(clips),
    wishes,
    wish_interest,
    ...buildPolls(wishes),
    ...buildEvents(videos),
    ...buildCalendar(),
    ...buildFormations(videos),
  };

  const json = `${JSON.stringify(db, null, 2)}\n`;
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-db.json');
  writeFileSync(out, json);

  const posterBytes = posters.map((p) => Buffer.from(p.split(',')[1], 'base64').length);
  const sketchBytes = sketches.map((s) => Buffer.from(s.split(',')[1], 'base64').length);
  console.log(
    `demo-db.json: ${json.length} bytes, sha256 ${createHash('sha256').update(json).digest('hex')}`,
  );
  console.log(`posters (JPEG bytes): ${posterBytes.join(', ')}`);
  console.log(`sketches (WebP bytes): ${sketchBytes.join(', ')}`);
  console.log(
    Object.entries(db)
      .map(([table, rows]) => `${table}: ${rows.length}`)
      .join(' · '),
  );
}

await main();
