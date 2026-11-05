/**
 * 18 · REQ-26 · Encodes a separated track (AudioEncoder) and writes its `.m4a` off the page, so the studio's loop
 * keeps running while the song is packed. The page streams the samples a stretch at a time and asks for the file
 * (whole, or its first frames) and for the encoder's delay, measured here; decoding back stays on the page
 * (OfflineAudioContext doesn't exist in workers). Only loaded by whoever separates a song (kept out of the precache, like the separator).
 */
import { createAudioWorker } from '@/lib/mp4/audioEncode';
import { runStemJob, type StemJob } from './stemFrames';

createAudioWorker<StemJob>((job, encoded) => runStemJob(job, encoded.samples, encoded.description));
