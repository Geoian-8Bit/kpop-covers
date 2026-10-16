import type { Take } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import {
  applyBest,
  assignPatch,
  canDeleteTake,
  cleanupCandidates,
  containerOf,
  DELETE_REFUSED,
  filterTakes,
  isDeviceId,
  maxShareSeconds,
  newDeviceId,
  quotaState,
  SHARE,
  shareBytes,
  shareDimensions,
  sharedPath,
  shareMimeCandidates,
  shareVideoBitrate,
  sortTakes,
  startOfWeek,
  takeDateLabel,
  takeRow,
  takeWhere,
  unnamedHere,
  whereLabel,
  withWhere,
  wouldOverflow,
  type TakeItem,
} from './takeRules';

const VIDEO = '11111111-1111-4111-8111-111111111111';
const CREW = '22222222-2222-4222-8222-222222222222';
const DEVICE = 'device-aaaa-bbbb';

function take(over: Partial<TakeItem> = {}): TakeItem {
  return {
    id: over.id ?? crypto.randomUUID(),
    crew_id: CREW,
    video_id: VIDEO,
    member_id: null,
    clip_id: null,
    song_start_seconds: 0,
    song_end_seconds: null,
    sync_adjust_seconds: 0,
    fit_scale: 1,
    fit_x: 0,
    fit_y: 0,
    speed: 1,
    mirrored: false,
    duration_seconds: 60,
    width: 1080,
    height: 1920,
    mime_type: 'video/mp4',
    file_name: null,
    device_id: null,
    recorded_at: '2026-10-16T10:00:00.000Z',
    shared_path: null,
    shared_size: null,
    is_best: false,
    created_at: '2026-10-16T10:00:00.000Z',
    archived_at: null,
    where: 'elsewhere',
    ...over,
  };
}

describe('where a take is', () => {
  it('prefers this phone, then the cloud', () => {
    const kept = new Set(['a']);
    expect(takeWhere({ id: 'a', shared_path: 'x/a.mp4' }, kept)).toBe('here');
    expect(takeWhere({ id: 'b', shared_path: 'x/b.mp4' }, kept)).toBe('cloud');
    expect(takeWhere({ id: 'c', shared_path: null }, kept)).toBe('elsewhere');
    const { where, ...row } = take({ id: 'a' });
    expect(withWhere(row as Take, kept).where).toBe('here');
    expect(where).toBe('elsewhere');
  });

  it('labels the place', () => {
    const ctx = { deviceId: DEVICE, ownerName: 'Ana' };
    expect(whereLabel(take({ where: 'here' }), ctx)).toBe('En este móvil');
    expect(whereLabel(take({ where: 'here', shared_path: 'p' }), ctx)).toBe('En este móvil · compartida');
    expect(whereLabel(take({ where: 'cloud', shared_path: 'p' }), ctx)).toBe('En la nube');
    expect(whereLabel(take({ where: 'elsewhere' }), ctx)).toBe('En el móvil de Ana');
    expect(whereLabel(take({ where: 'elsewhere' }), { ...ctx, ownerName: null })).toBe('En otro móvil');
    expect(whereLabel(take({ where: 'elsewhere', device_id: DEVICE }), ctx)).toBe('Ya no está en este móvil');
  });
});

describe('device id', () => {
  it('matches the database check', () => {
    expect(isDeviceId(crypto.randomUUID())).toBe(true);
    expect(isDeviceId('short')).toBe(false);
    expect(isDeviceId('has spaces in it')).toBe(false);
    expect(isDeviceId('a'.repeat(65))).toBe(false);
    expect(isDeviceId(null)).toBe(false);
  });

  it('is always storable', () => {
    expect(isDeviceId(newDeviceId())).toBe(true);
    expect(newDeviceId(() => 'abc')).toBe('abc00000');
    expect(isDeviceId(newDeviceId(() => '{weird id!}'.repeat(10)))).toBe(true);
  });
});

describe('who may delete', () => {
  const ctx = { deviceId: DEVICE, meId: 'me' };
  it('this phone, the device that recorded it, or the member chosen as «yo»', () => {
    expect(canDeleteTake(take({ where: 'here' }), ctx).ok).toBe(true);
    expect(canDeleteTake(take({ where: 'cloud', device_id: DEVICE }), ctx).ok).toBe(true);
    expect(canDeleteTake(take({ where: 'cloud', member_id: 'me' }), ctx).ok).toBe(true);
  });

  it('nobody else, with the reason', () => {
    expect(canDeleteTake(take({ where: 'cloud', member_id: 'ana', device_id: 'other-device' }), ctx)).toEqual({
      ok: false,
      reason: DELETE_REFUSED,
    });
    // Without a chosen name, an unnamed take on another phone isn't «mine».
    expect(canDeleteTake(take({ where: 'elsewhere' }), { deviceId: DEVICE, meId: null }).ok).toBe(false);
  });

  it('cleans up only unstarred takes this device may delete', () => {
    const list = [
      take({ id: '1', where: 'here', is_best: true }),
      take({ id: '2', where: 'here' }),
      take({ id: '3', where: 'cloud', member_id: 'ana' }),
      take({ id: '4', where: 'cloud', member_id: 'me' }),
    ];
    expect(cleanupCandidates(list, ctx).map((t) => t.id)).toEqual(['2', '4']);
  });

  it('finds this device’s unnamed takes', () => {
    const list = [take({ id: '1', device_id: DEVICE }), take({ id: '2', device_id: DEVICE, member_id: 'me' }), take({ id: '3' })];
    expect(unnamedHere(list, DEVICE).map((t) => t.id)).toEqual(['1']);
  });
});

describe('filters and order', () => {
  // Friday 16 October 2026, 18:00 local time.
  const now = new Date(2026, 9, 16, 18, 0);
  const at = (d: Date) => d.toISOString();
  const list = [
    take({ id: 'today', member_id: 'ana', clip_id: 'c1', recorded_at: at(new Date(2026, 9, 16, 9, 0)) }),
    take({ id: 'monday', member_id: null, clip_id: null, recorded_at: at(new Date(2026, 9, 12, 8, 0)) }),
    take({ id: 'lastweek', member_id: 'ana', clip_id: 'c2', recorded_at: at(new Date(2026, 9, 11, 23, 0)) }),
  ];
  const ids = (xs: TakeItem[]) => xs.map((t) => t.id);

  it('weeks start on Monday', () => {
    expect(startOfWeek(now).getDay()).toBe(1);
    expect(startOfWeek(now).getDate()).toBe(12);
    // A Sunday belongs to the week that started six days before.
    expect(startOfWeek(new Date(2026, 9, 18, 12)).getDate()).toBe(12);
  });

  it('by date', () => {
    expect(ids(filterTakes(list, { member: 'all', clip: 'all', date: 'today' }, now))).toEqual(['today']);
    expect(ids(filterTakes(list, { member: 'all', clip: 'all', date: 'week' }, now))).toEqual(['today', 'monday']);
    expect(filterTakes(list, { member: 'all', clip: 'all', date: 'all' }, now)).toHaveLength(3);
  });

  it('by person, including «Sin nombre»', () => {
    expect(ids(filterTakes(list, { member: 'ana', clip: 'all', date: 'all' }, now))).toEqual(['today', 'lastweek']);
    expect(ids(filterTakes(list, { member: 'none', clip: 'all', date: 'all' }, now))).toEqual(['monday']);
  });

  it('by clip, including no clip', () => {
    expect(ids(filterTakes(list, { member: 'all', clip: 'c2', date: 'all' }, now))).toEqual(['lastweek']);
    expect(ids(filterTakes(list, { member: 'all', clip: 'none', date: 'all' }, now))).toEqual(['monday']);
  });

  it('puts the best takes first, then the newest', () => {
    const sorted = sortTakes([
      take({ id: 'old', recorded_at: '2026-10-01T10:00:00Z' }),
      take({ id: 'best-old', is_best: true, recorded_at: '2026-09-01T10:00:00Z' }),
      take({ id: 'new', recorded_at: '2026-10-10T10:00:00Z' }),
      take({ id: 'best-new', is_best: true, recorded_at: '2026-10-02T10:00:00Z' }),
    ]);
    expect(ids(sorted)).toEqual(['best-new', 'best-old', 'new', 'old']);
  });
});

describe('best take (F4)', () => {
  it('starring clears only the other best of the same person and section', () => {
    const list = [
      take({ id: 'a', member_id: 'ana', clip_id: 'c1', is_best: true }),
      take({ id: 'b', member_id: 'ana', clip_id: 'c1' }),
      take({ id: 'c', member_id: 'ana', clip_id: 'c2', is_best: true }),
      take({ id: 'd', member_id: 'leo', clip_id: 'c1', is_best: true }),
    ];
    const next = applyBest(list, 'b', true);
    expect(next.filter((t) => t.is_best).map((t) => t.id)).toEqual(['b', 'c', 'd']);
    expect(applyBest(next, 'b', false).find((t) => t.id === 'b')?.is_best).toBe(false);
  });

  it('assigning a starred take never leaves two best ones', () => {
    const mine = take({ id: 'mine', member_id: 'me', clip_id: 'c1', is_best: true });
    const unnamed = take({ id: 'u', member_id: null, clip_id: 'c1', is_best: true });
    const plain = take({ id: 'p', member_id: null, clip_id: 'c1' });
    expect(assignPatch(unnamed, 'me', [mine, unnamed, plain])).toEqual({ member_id: 'me', is_best: false });
    expect(assignPatch(unnamed, 'leo', [mine, unnamed, plain])).toEqual({ member_id: 'leo' });
    expect(assignPatch(plain, 'me', [mine, unnamed, plain])).toEqual({ member_id: 'me' });
  });
});

describe('the saved row', () => {
  it('always passes the table checks', () => {
    const row = takeRow(
      {
        id: 'x',
        videoId: VIDEO,
        memberId: null,
        songStart: -3.14159,
        songEnd: -10,
        speed: 3,
        mirrored: true,
        durationSeconds: 99999,
        width: 0,
        height: 1920.4,
        mimeType: 'v'.repeat(200),
        fileName: 'f'.repeat(300),
        recordedAt: 'not a date',
      },
      DEVICE,
    );
    expect(row.song_start_seconds).toBe(0);
    expect(row.song_end_seconds).toBe(0);
    expect(row.speed).toBe(2);
    expect(row.duration_seconds).toBe(7200);
    expect(row.width).toBeNull();
    expect(row.height).toBe(1920);
    expect(row.mime_type).toHaveLength(120);
    expect(row.file_name).toHaveLength(255);
    expect(row.device_id).toBe(DEVICE);
    expect(row).not.toHaveProperty('recorded_at');
  });

  it('keeps sensible values and refuses a bad device id', () => {
    const row = takeRow(
      { id: 'x', videoId: VIDEO, memberId: 'me', clipId: 'c', songStart: 12.34567, songEnd: 40, speed: 0.75, mirrored: false, durationSeconds: 27.5, recordedAt: '2026-10-16T10:00:00.000Z' },
      'bad id',
    );
    expect(row).toMatchObject({ song_start_seconds: 12.346, song_end_seconds: 40, speed: 0.75, clip_id: 'c', member_id: 'me', device_id: null, recorded_at: '2026-10-16T10:00:00.000Z' });
  });
});

describe('the reduced copy', () => {
  it('fits 720p without upscaling, even sizes', () => {
    expect(shareDimensions(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(shareDimensions(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(shareDimensions(640, 480)).toEqual({ width: 640, height: 480 });
    expect(shareDimensions(1081, 1921)).toEqual({ width: 720, height: 1280 });
    expect(shareDimensions(0, 0)).toEqual({ width: 1280, height: 720 });
  });

  it('is about 15–16 MB a minute', () => {
    const mb = shareBytes(60) / 1_000_000;
    expect(mb).toBeGreaterThan(15);
    expect(mb).toBeLessThan(16.5);
  });

  it('keeps 2 Mbps up to about 3 minutes, then lowers it, then refuses', () => {
    expect(shareVideoBitrate(60)).toBe(SHARE.videoBps);
    expect(shareVideoBitrate(170)).toBe(SHARE.videoBps);
    const four = shareVideoBitrate(240)!;
    expect(four).toBeLessThan(SHARE.videoBps);
    expect(four).toBeGreaterThanOrEqual(SHARE.minVideoBps);
    expect(shareBytes(240, four)).toBeLessThanOrEqual(SHARE.maxBytes);
    expect(shareVideoBitrate(maxShareSeconds() + 5)).toBeNull();
    expect(shareVideoBitrate(0)).toBe(SHARE.videoBps);
    expect(maxShareSeconds()).toBeGreaterThan(300);
  });

  it('prefers MP4 H.264, then WebM', () => {
    const list = shareMimeCandidates();
    expect(list[0]).toMatch(/^video\/mp4;codecs=avc1/);
    expect(list.findIndex((m) => m.startsWith('video/webm'))).toBeGreaterThan(list.indexOf('video/mp4'));
    expect(containerOf('video/mp4;codecs=avc1.4D401F,mp4a.40.2')).toEqual({ type: 'video/mp4', extension: 'mp4' });
    expect(containerOf('video/webm;codecs=vp9,opus')).toEqual({ type: 'video/webm', extension: 'webm' });
    expect(containerOf('')).toEqual({ type: 'video/webm', extension: 'webm' });
  });

  it('is named the way the bucket accepts', () => {
    const path = sharedPath({ crew_id: CREW, id: VIDEO }, 'mp4');
    expect(path).toBe(`${CREW}/${VIDEO}.mp4`);
    expect(path).toMatch(new RegExp(`^${CREW}/${VIDEO}\\.[A-Za-z0-9]{1,10}$`));
  });

  it('warns past 80 % of 1 GB', () => {
    expect(quotaState(100 * 1024 ** 2).warn).toBe(false);
    expect(quotaState(0.85 * 1024 ** 3)).toMatchObject({ warn: true, full: false });
    expect(quotaState(2 * 1024 ** 3)).toMatchObject({ ratio: 1, full: true });
    expect(wouldOverflow(1024 ** 3 - 10, 20)).toBe(true);
    expect(wouldOverflow(0, 16_000_000)).toBe(false);
  });
});

describe('labels', () => {
  it('says today and yesterday', () => {
    const now = new Date(2026, 9, 16, 18, 0);
    expect(takeDateLabel(new Date(2026, 9, 16, 9, 5).toISOString(), now)).toMatch(/^Hoy, 09:05$/);
    expect(takeDateLabel(new Date(2026, 9, 15, 23, 0).toISOString(), now)).toMatch(/^Ayer, 23:00$/);
    expect(takeDateLabel(new Date(2026, 9, 12, 8, 0).toISOString(), now)).toMatch(/12.*oct.*08:00$/);
    expect(takeDateLabel('nope', now)).toBe('');
  });
});
