import { CalendarDays, Library, Shuffle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { BagIcon } from '@/features/bags/BagIcon';

export type NavIcon = (props: { className?: string }) => ReactNode;

export interface NavSection {
  to: string;
  end?: boolean;
  label: string;
  /** Fits a small tag next to the quick-menu button. */
  short: string;
  /** Carved on cards, sticks and seals of the quick menu. */
  kanji: string;
  Icon: NavIcon;
  /** Pigment of its card or face (token classes only). */
  tone: NavTone;
}

export interface NavTone {
  /** Field of a card or face. */
  field: string;
  /** Ink on that field. */
  ink: string;
}

/** Main sections: the library, the bags (F13), the next cover (F12 wishes, F11 votes), Random Play Dance (F14), events (F16). */
export const MAIN_NAV: NavSection[] = [
  { to: '/', end: true, label: 'Biblioteca', short: 'Biblioteca', kanji: '書', Icon: Library, tone: { field: 'bg-ai-700', ink: 'text-ai-200' } },
  { to: '/bolsas', label: 'Bolsas', short: 'Bolsas', kanji: '袋', Icon: BagIcon, tone: { field: 'bg-kiji-700', ink: 'text-kin-200' } },
  { to: '/deseos', label: 'Próxima cover', short: 'Próxima cover', kanji: '願', Icon: Sparkles, tone: { field: 'bg-enji-700', ink: 'text-enji-200' } },
  { to: '/rpd', label: 'Random Play Dance', short: 'Random Play', kanji: '舞', Icon: Shuffle, tone: { field: 'bg-shu-700', ink: 'text-shu-300' } },
  { to: '/eventos', label: 'Eventos', short: 'Eventos', kanji: '祭', Icon: CalendarDays, tone: { field: 'bg-ai-800', ink: 'text-kin-300' } },
];

/** «¿Quién eres?»: the sixth entry of the quick menu. */
export const WHO_KANJI = '誰';
export const WHO_TONE: NavTone = { field: 'bg-sumi-700', ink: 'text-washi-muted' };
