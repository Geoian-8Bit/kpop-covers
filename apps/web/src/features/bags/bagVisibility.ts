import type { BagDraw, BagKind } from '@coverscape/shared';
import type { BagItemView } from '@/data/bags';
import { KIND_COPY } from './drawRules';
import { clipTone, memberTone, type DrawShown } from './tones';

// REQ-27 · Split out of BagPage.tsx: how an item shows when it comes out.

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How an item shows when it comes out. */
export function shownFor(
  item: BagItemView | undefined,
  draw: Pick<BagDraw, 'label'>,
  kind: BagKind,
): DrawShown {
  if (item?.video)
    return { label: item.video.title, sub: item.video.artist ?? undefined, tone: 'kin', glyph: '曲' };
  if (item?.wish)
    return {
      label: item.wish.title,
      sub: item.wish.artist ?? 'De la lista de deseos',
      tone: 'kin',
      glyph: '願',
    };
  if (item?.clip)
    return {
      label: item.clip.name,
      sub: item.clip.video?.title,
      tone: clipTone(item.clip.color),
      glyph: '帖',
    };
  if (item?.member)
    return {
      label: item.member.name,
      sub: '¡Te toca!',
      tone: memberTone(item.member.color),
      glyph: item.member.name.trim().charAt(0).toUpperCase() || '人',
    };
  if (item?.youtube_id)
    return {
      label: item.title ?? draw.label,
      sub: item.artist ? `${item.artist} · de YouTube` : 'De YouTube',
      tone: 'kin',
      glyph: '曲',
    };
  return { label: draw.label, tone: 'kin', glyph: KIND_COPY[kind].glyph };
}
