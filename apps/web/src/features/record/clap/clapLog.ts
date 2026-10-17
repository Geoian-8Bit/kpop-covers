import { clapLogEntry, type ClapLogEntry, type ClapReading } from '@coverscape/shared';

/**
 * Round 2 · Why the double clap fires or not, readable on the phone itself: the last sounds the detector judged (a
 * short list, in memory only, for this visit), shown in the «i» panel to tune the thresholds with real claps. With
 * «Información técnica» on, each one is also written to the console as «[oneshoot:clap] …».
 */

export const CLAP_LOG_SIZE = 8;

export interface ClapLogItem extends ClapLogEntry {
  /** Date.now() when it was judged. */
  time: number;
}

let items: ClapLogItem[] = [];
const listeners = new Set<() => void>();

export function noteClapReading(reading: ClapReading, logToConsole: () => boolean): void {
  const entry = clapLogEntry(reading);
  if (!entry) return;
  const item = { ...entry, time: Date.now() };
  items = [item, ...items].slice(0, CLAP_LOG_SIZE);
  if (logToConsole()) console.info('[oneshoot:clap] judged', item);
  listeners.forEach((l) => l());
}

export function clapLog(): ClapLogItem[] {
  return items;
}

export function subscribeClapLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
