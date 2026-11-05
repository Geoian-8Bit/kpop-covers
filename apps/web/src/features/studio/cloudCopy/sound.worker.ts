/**
 * 13 · REQ-26 · The copy's sound off the page: encodes it (AudioEncoder), measures its start against the original and
 * writes the MP4 (`muxMp4`), so the studio keeps playing smoothly while a copy is made. Decoding stays on the page
 * (OfflineAudioContext doesn't exist in workers), and so does the picture (it draws a <video>). Only loaded by whoever
 * makes a copy (kept out of the precache, like the voice separator).
 */
import { createAudioWorker } from '@/lib/mp4/audioEncode';
import { runSoundJob, type SoundJob } from './soundJobs';

createAudioWorker<SoundJob>((job, encoded) => runSoundJob(job, encoded.samples));
