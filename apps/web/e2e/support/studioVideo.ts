import type { Browser } from '@playwright/test';
import { testVideo } from './testVideo';

/**
 * REQ-02 · Studio helpers. The shared test video comes from MediaRecorder, which writes a WebM without a Duration
 * (the <video> reports Infinity and the studio's timeline stays at 0:00 with nothing to seek). Real uploads always
 * carry a duration, so the bytes get one here before they are stored: same picture, a header the app can use.
 */
export const VIDEO_SECONDS = 3;

function readVint(buf: Buffer, at: number): { value: number; length: number } {
  let length = 1;
  while (length <= 8 && !(buf[at]! & (0x80 >> (length - 1)))) length++;
  let value = buf[at]! & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + buf[at + i]!;
  return { value, length };
}

/** Adds a Duration element to the Segment Info of a WebM that has none. */
export function withDuration(webm: Buffer, seconds: number): Buffer {
  const info = webm.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]));
  if (info < 0) return webm;
  const size = readVint(webm, info + 4);
  const body = info + 4 + size.length;
  const infoBody = webm.subarray(body, body + size.value);
  if (infoBody.includes(Buffer.from([0x44, 0x89]))) return webm;
  const dur = Buffer.alloc(11);
  dur.set([0x44, 0x89, 0x88]);
  dur.writeDoubleBE(seconds * 1000, 3); // TimecodeScale is 1 ms in MediaRecorder output
  const newSize = Buffer.from([0x01, 0, 0, 0, 0, 0, 0, 0]); // 8-byte vint
  newSize.writeUIntBE(size.value + dur.length, 2, 6);
  return Buffer.concat([
    webm.subarray(0, info + 4),
    newSize,
    infoBody,
    dur,
    webm.subarray(body + size.value),
  ]);
}

export async function studioVideo(browser: Browser): Promise<Buffer> {
  const video = await testVideo(browser, VIDEO_SECONDS);
  return withDuration(video.buffer, VIDEO_SECONDS);
}
