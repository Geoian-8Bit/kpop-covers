/**
 * 13 · A small MP4 writer for the group's copy: one H.264 (or VP9) video track and one AAC (or Opus) sound track,
 * from the chunks WebCodecs encoders give. Plain (not fragmented) MP4 with the index first («fast start»), samples
 * interleaved in half-second chunks, so a phone can start playing and seek over the network at once.
 *
 * Times are exact: each sample keeps the timestamp the encoder got (the original's own frame times), which is what
 * keeps the copy in sync with the original. The only edit list is the sound's priming (`primingSamples`): the
 * samples an AAC encoder puts before the sound, which every player then drops the same way.
 * Pure (bytes in, bytes out): no DOM, testable in Node.
 */

export interface MuxSample {
  data: Uint8Array;
  /** Presentation time, µs. Video samples come in decode order. */
  time: number;
  /** µs; only the last sample's is used for video (the others follow from the next sample's time). */
  duration: number;
  key: boolean;
}

export interface MuxVideoTrack {
  codec: 'avc1' | 'vp09';
  width: number;
  height: number;
  /** avc1: the avcC record (VideoEncoder `decoderConfig.description`). vp09: the vpcC payload (`vpcConfig`). */
  description: Uint8Array;
  samples: readonly MuxSample[];
}

export interface MuxAudioTrack {
  codec: 'mp4a' | 'Opus';
  sampleRate: number;
  channels: number;
  /** mp4a: the AudioSpecificConfig. Opus: unused (the dOps box is written from the fields here). */
  description?: Uint8Array;
  /** Opus only: samples (48 kHz) the decoder drops at the start. */
  preSkip?: number;
  /** Samples at the start that are the encoder's priming, not sound: written as an edit list (`edts/elst`). */
  primingSamples?: number;
  bitrate?: number;
  samples: readonly MuxSample[];
}

export interface MuxInput {
  video?: MuxVideoTrack;
  audio?: MuxAudioTrack;
}

const VIDEO_TIMESCALE = 90_000;
const MOVIE_TIMESCALE = 1000;
const CHUNK_SECONDS = 0.5;

// ───────────── Byte writer ─────────────

class Writer {
  private buf = new Uint8Array(1024);
  length = 0;

  private room(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  u8(v: number) {
    this.room(1);
    this.buf[this.length++] = v & 0xff;
  }
  u16(v: number) {
    this.u8(v >>> 8);
    this.u8(v);
  }
  u24(v: number) {
    this.u8(v >>> 16);
    this.u16(v & 0xffff);
  }
  u32(v: number) {
    this.u16((v >>> 16) & 0xffff);
    this.u16(v & 0xffff);
  }
  i32(v: number) {
    this.u32(v >>> 0);
  }
  u64(v: number) {
    this.u32(Math.floor(v / 2 ** 32));
    this.u32(v >>> 0);
  }
  bytes(b: ArrayLike<number>) {
    this.room(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
  }
  zeros(n: number) {
    this.room(n);
    this.buf.fill(0, this.length, this.length + n);
    this.length += n;
  }
  /** A box: size, type, then whatever `body` writes. */
  box(type: string, body: (w: Writer) => void) {
    const start = this.length;
    this.u32(0);
    this.ascii(type);
    body(this);
    this.patch32(start, this.length - start);
  }
  fullBox(type: string, version: number, flags: number, body: (w: Writer) => void) {
    this.box(type, (w) => {
      w.u8(version);
      w.u24(flags);
      body(w);
    });
  }
  patch32(at: number, v: number) {
    this.buf[at] = (v >>> 24) & 0xff;
    this.buf[at + 1] = (v >>> 16) & 0xff;
    this.buf[at + 2] = (v >>> 8) & 0xff;
    this.buf[at + 3] = v & 0xff;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

// ───────────── Track tables ─────────────

interface TrackPlan {
  id: number;
  kind: 'video' | 'audio';
  timescale: number;
  /** Per sample, in track ticks. */
  durations: number[];
  /** Composition offsets (pts − dts), ticks; null when all zero. */
  offsets: number[] | null;
  sizes: number[];
  keys: number[] | null;
  /** Total ticks. */
  duration: number;
  /** Ticks at the start that players skip (edit list); 0: none. */
  skip: number;
  /** Chunks: first sample index and count, plus their offset in the file (filled later). */
  chunks: { first: number; count: number; start: number; offset: number }[];
}

const toTicks = (us: number, timescale: number) => Math.round((us * timescale) / 1e6);

function planVideo(track: MuxVideoTrack, id: number): TrackPlan {
  const s = track.samples;
  const pts = s.map((x) => toTicks(x.time, VIDEO_TIMESCALE));
  // The first frame starts the timeline: a copy never begins after its original.
  const min = pts.reduce((a, b) => Math.min(a, b), pts[0] ?? 0);
  for (let i = 0; i < pts.length; i++) pts[i] = pts[i]! - min;
  const sorted = [...pts].sort((a, b) => a - b);
  // Decode times: presentation times in order (with no reordering they are the same).
  const dts = sorted;
  const durations: number[] = [];
  for (let i = 0; i < dts.length; i++) {
    const next = i + 1 < dts.length ? dts[i + 1]! : dts[i]! + Math.max(1, toTicks(s[s.length - 1]!.duration, VIDEO_TIMESCALE));
    durations.push(Math.max(1, next - dts[i]!));
  }
  const offsets = pts.map((p, i) => p - dts[i]!);
  const reordered = offsets.some((o) => o !== 0);
  const keys = s.every((x) => x.key) ? null : s.flatMap((x, i) => (x.key ? [i + 1] : []));
  // Presentation ends with the last frame shown.
  const end = pts.reduce((a, p, i) => Math.max(a, p + durations[i]!), 0);
  return {
    id,
    kind: 'video',
    timescale: VIDEO_TIMESCALE,
    durations,
    offsets: reordered ? offsets : null,
    sizes: s.map((x) => x.data.byteLength),
    keys,
    duration: end,
    skip: 0,
    chunks: [],
  };
}

function planAudio(track: MuxAudioTrack, id: number): TrackPlan {
  const s = track.samples;
  const ts = track.sampleRate;
  const starts = s.map((x) => toTicks(x.time, ts));
  const durations: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const own = Math.max(1, toTicks(s[i]!.duration, ts));
    // From the start times when they're there (no drift from rounding each duration), else each one's own.
    const next = i + 1 < s.length ? starts[i + 1]! : starts[i]! + own;
    durations.push(next > starts[i]! ? next - starts[i]! : own);
  }
  const total = durations.reduce((a, b) => a + b, 0);
  return {
    id,
    kind: 'audio',
    timescale: ts,
    durations,
    offsets: null,
    sizes: s.map((x) => x.data.byteLength),
    keys: null,
    duration: total,
    skip: Math.max(0, Math.min(total - 1, Math.round(track.primingSamples ?? 0))),
    chunks: [],
  };
}

/** Half-second chunks per track, as [first sample, count, start time in seconds]. */
function chunkTrack(plan: TrackPlan) {
  let t = 0;
  let chunkStart = 0;
  let first = 0;
  for (let i = 0; i < plan.durations.length; i++) {
    if (i > first && t - chunkStart >= CHUNK_SECONDS * plan.timescale) {
      plan.chunks.push({ first, count: i - first, start: chunkStart / plan.timescale, offset: 0 });
      first = i;
      chunkStart = t;
    }
    t += plan.durations[i]!;
  }
  if (plan.durations.length > first) {
    plan.chunks.push({ first, count: plan.durations.length - first, start: chunkStart / plan.timescale, offset: 0 });
  }
}

function runs(values: readonly number[]): [count: number, value: number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const last = out[out.length - 1];
    if (last && last[1] === v) last[0]++;
    else out.push([1, v]);
  }
  return out;
}

// ───────────── Boxes ─────────────

function writeFtyp(w: Writer, hasVp9: boolean) {
  w.box('ftyp', (w) => {
    w.ascii('isom');
    w.u32(0x200);
    for (const brand of ['isom', 'iso2', hasVp9 ? 'iso6' : 'avc1', 'mp41']) w.ascii(brand);
  });
}

function writeMvhd(w: Writer, duration: number, nextTrackId: number) {
  w.fullBox('mvhd', 0, 0, (w) => {
    w.u32(0);
    w.u32(0);
    w.u32(MOVIE_TIMESCALE);
    w.u32(duration);
    w.u32(0x00010000); // rate 1.0
    w.u16(0x0100); // volume 1.0
    w.zeros(10);
    for (const m of MATRIX) w.u32(m);
    w.zeros(24);
    w.u32(nextTrackId);
  });
}

/** What the track shows or plays, in movie ticks (the edit list's priming left out). */
const presented = (plan: TrackPlan) => Math.round(((plan.duration - plan.skip) / plan.timescale) * MOVIE_TIMESCALE);

function writeTkhd(w: Writer, plan: TrackPlan, width: number, height: number) {
  w.fullBox('tkhd', 0, 3, (w) => {
    w.u32(0);
    w.u32(0);
    w.u32(plan.id);
    w.u32(0);
    w.u32(presented(plan));
    w.zeros(8);
    w.u16(0); // layer
    w.u16(plan.kind === 'audio' ? 1 : 0); // alternate group
    w.u16(plan.kind === 'audio' ? 0x0100 : 0);
    w.u16(0);
    for (const m of MATRIX) w.u32(m);
    w.u32(Math.round(width) * 0x10000);
    w.u32(Math.round(height) * 0x10000);
  });
}

function writeMdhd(w: Writer, plan: TrackPlan) {
  w.fullBox('mdhd', 0, 0, (w) => {
    w.u32(0);
    w.u32(0);
    w.u32(plan.timescale);
    w.u32(plan.duration);
    w.u16(0x55c4); // 'und'
    w.u16(0);
  });
}

function writeHdlr(w: Writer, kind: 'video' | 'audio') {
  w.fullBox('hdlr', 0, 0, (w) => {
    w.u32(0);
    w.ascii(kind === 'video' ? 'vide' : 'soun');
    w.zeros(12);
    w.ascii(kind === 'video' ? 'VideoHandler' : 'SoundHandler');
    w.u8(0);
  });
}

function writeVisualEntry(w: Writer, track: MuxVideoTrack) {
  w.box(track.codec, (w) => {
    w.zeros(6);
    w.u16(1); // data reference index
    w.zeros(16);
    w.u16(track.width);
    w.u16(track.height);
    w.u32(0x00480000);
    w.u32(0x00480000);
    w.u32(0);
    w.u16(1); // frame count
    w.zeros(32); // compressor name
    w.u16(0x0018);
    w.u16(0xffff);
    if (track.codec === 'avc1') w.box('avcC', (w) => w.bytes(track.description));
    else w.fullBox('vpcC', 1, 0, (w) => w.bytes(track.description));
  });
}

/** MPEG-4 descriptor with a 4-byte length (as most muxers write it). */
function descriptor(w: Writer, tag: number, body: (w: Writer) => void) {
  const inner = new Writer();
  body(inner);
  const bytes = inner.done();
  w.u8(tag);
  const n = bytes.length;
  w.u8(0x80 | ((n >>> 21) & 0x7f));
  w.u8(0x80 | ((n >>> 14) & 0x7f));
  w.u8(0x80 | ((n >>> 7) & 0x7f));
  w.u8(n & 0x7f);
  w.bytes(bytes);
}

function writeAudioEntry(w: Writer, track: MuxAudioTrack, plan: TrackPlan) {
  w.box(track.codec, (w) => {
    w.zeros(6);
    w.u16(1);
    w.zeros(8);
    w.u16(track.channels);
    w.u16(16);
    w.u16(0);
    w.u16(0);
    w.u32((track.sampleRate & 0xffff) * 0x10000);
    if (track.codec === 'mp4a') {
      const asc = track.description?.length ? track.description : audioSpecificConfig(track.sampleRate, track.channels);
      const maxSize = plan.sizes.reduce((a, b) => Math.max(a, b), 0);
      const avg = track.bitrate ?? 0;
      w.fullBox('esds', 0, 0, (w) =>
        descriptor(w, 0x03, (w) => {
          w.u16(plan.id);
          w.u8(0);
          descriptor(w, 0x04, (w) => {
            w.u8(0x40); // MPEG-4 audio
            w.u8(0x15); // audio stream
            w.u24(maxSize);
            w.u32(avg);
            w.u32(avg);
            descriptor(w, 0x05, (w) => w.bytes(asc));
          });
          descriptor(w, 0x06, (w) => w.u8(0x02));
        }),
      );
    } else {
      w.box('dOps', (w) => {
        w.u8(0);
        w.u8(track.channels);
        w.u16(track.preSkip ?? 0);
        w.u32(track.sampleRate);
        w.u16(0);
        w.u8(0);
      });
    }
  });
}

function writeStbl(w: Writer, plan: TrackPlan, entry: (w: Writer) => void) {
  w.box('stbl', (w) => {
    w.fullBox('stsd', 0, 0, (w) => {
      w.u32(1);
      entry(w);
    });
    const stts = runs(plan.durations);
    w.fullBox('stts', 0, 0, (w) => {
      w.u32(stts.length);
      for (const [count, delta] of stts) {
        w.u32(count);
        w.u32(delta);
      }
    });
    if (plan.offsets) {
      const ctts = runs(plan.offsets);
      w.fullBox('ctts', 1, 0, (w) => {
        w.u32(ctts.length);
        for (const [count, offset] of ctts) {
          w.u32(count);
          w.i32(offset);
        }
      });
    }
    if (plan.keys) {
      const keys = plan.keys;
      w.fullBox('stss', 0, 0, (w) => {
        w.u32(keys.length);
        for (const k of keys) w.u32(k);
      });
    }
    const perChunk = runs(plan.chunks.map((c) => c.count));
    w.fullBox('stsc', 0, 0, (w) => {
      w.u32(perChunk.length);
      let chunk = 1;
      for (const [count, samples] of perChunk) {
        w.u32(chunk);
        w.u32(samples);
        w.u32(1);
        chunk += count;
      }
    });
    w.fullBox('stsz', 0, 0, (w) => {
      w.u32(0);
      w.u32(plan.sizes.length);
      for (const s of plan.sizes) w.u32(s);
    });
    w.fullBox('stco', 0, 0, (w) => {
      w.u32(plan.chunks.length);
      for (const c of plan.chunks) w.u32(c.offset);
    });
  });
}

function writeTrak(w: Writer, plan: TrackPlan, input: MuxInput) {
  w.box('trak', (w) => {
    const video = input.video;
    if (plan.kind === 'video' && video) writeTkhd(w, plan, video.width, video.height);
    else writeTkhd(w, plan, 0, 0);
    if (plan.skip > 0) {
      w.box('edts', (w) =>
        w.fullBox('elst', 0, 0, (w) => {
          w.u32(1);
          w.u32(presented(plan)); // segment duration (movie ticks)
          w.i32(plan.skip); // media time: where the sound starts (track ticks)
          w.u16(1); // rate 1.0
          w.u16(0);
        }),
      );
    }
    w.box('mdia', (w) => {
      writeMdhd(w, plan);
      writeHdlr(w, plan.kind);
      w.box('minf', (w) => {
        if (plan.kind === 'video') {
          w.fullBox('vmhd', 0, 1, (w) => w.zeros(8));
        } else {
          w.fullBox('smhd', 0, 0, (w) => w.zeros(4));
        }
        w.box('dinf', (w) =>
          w.fullBox('dref', 0, 0, (w) => {
            w.u32(1);
            w.fullBox('url ', 0, 1, () => undefined);
          }),
        );
        writeStbl(w, plan, (w) => {
          if (plan.kind === 'video' && video) writeVisualEntry(w, video);
          else if (input.audio) writeAudioEntry(w, input.audio, plan);
        });
      });
    });
  });
}

function writeMoov(input: MuxInput, plans: TrackPlan[]): Uint8Array {
  const w = new Writer();
  const duration = Math.max(0, ...plans.map(presented));
  w.box('moov', (w) => {
    writeMvhd(w, duration, plans.length + 1);
    for (const plan of plans) writeTrak(w, plan, input);
  });
  return w.done();
}

/** AudioSpecificConfig for AAC-LC when the encoder doesn't give one. */
export function audioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const index = Math.max(0, rates.indexOf(sampleRate));
  return new Uint8Array([(2 << 3) | (index >> 1), ((index & 1) << 7) | ((channels & 0xf) << 3)]);
}

/** vpcC payload for 8-bit 4:2:0 VP9 (profile 0), BT.709. */
export function vpcConfig(level = 40): Uint8Array {
  return new Uint8Array([0, level, (8 << 4) | (1 << 1) | 0, 1, 1, 1, 0, 0]);
}

/**
 * The whole file as parts (index, then the samples): pass them to `new Blob(parts, { type: 'video/mp4' })`. The
 * sample data isn't copied.
 */
export function muxMp4(input: MuxInput): Uint8Array[] {
  const plans: TrackPlan[] = [];
  if (input.video?.samples.length) plans.push(planVideo(input.video, plans.length + 1));
  if (input.audio?.samples.length) plans.push(planAudio(input.audio, plans.length + 1));
  if (!plans.length) throw new Error('mp4: nothing to write');
  for (const plan of plans) chunkTrack(plan);

  // Interleave the chunks by time (sound first on a tie: players want it early).
  const order = plans
    .flatMap((plan) => plan.chunks.map((chunk) => ({ plan, chunk })))
    .sort((a, b) => a.chunk.start - b.chunk.start || (a.plan.kind === 'audio' ? -1 : 1));

  const ftyp = new Writer();
  writeFtyp(ftyp, input.video?.codec === 'vp09');
  const head = ftyp.done();
  // Offsets don't change the index's size: write it once to measure, then again with the real offsets.
  const moovSize = writeMoov(input, plans).length;
  const mdatSize = order.reduce(
    (sum, { plan, chunk }) => sum + plan.sizes.slice(chunk.first, chunk.first + chunk.count).reduce((a, b) => a + b, 0),
    0,
  );
  const large = mdatSize + 8 > 0xffffffff;
  let offset = head.length + moovSize + (large ? 16 : 8);
  for (const { plan, chunk } of order) {
    chunk.offset = offset;
    for (let i = chunk.first; i < chunk.first + chunk.count; i++) offset += plan.sizes[i]!;
  }
  if (offset > 0xffffffff) throw new Error('mp4: file too big');
  const moov = writeMoov(input, plans);

  const mdatHead = new Writer();
  if (large) {
    mdatHead.u32(1);
    mdatHead.ascii('mdat');
    mdatHead.u64(mdatSize + 16);
  } else {
    mdatHead.u32(mdatSize + 8);
    mdatHead.ascii('mdat');
  }

  const parts: Uint8Array[] = [head, moov, mdatHead.done()];
  for (const { plan, chunk } of order) {
    const samples = plan.kind === 'video' ? input.video!.samples : input.audio!.samples;
    for (let i = chunk.first; i < chunk.first + chunk.count; i++) parts.push(samples[i]!.data);
  }
  return parts;
}
