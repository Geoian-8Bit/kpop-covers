import { useCallback, useState } from 'react';

/** Where ↑ (-1) or ↓ (+1) takes the item at `index`; null at the ends of the list. */
export function moveTarget(index: number, delta: -1 | 1, total: number): number | null {
  const to = index + delta;
  return to < 0 || to >= total ? null : to;
}

/** What a screen reader hears after a keyboard move: «“Título”, puesto 2 de 5». */
export function positionMessage(name: string, index: number, total: number): string {
  return `“${name}”, puesto ${index + 1} de ${total}`;
}

/**
 * Text for a polite live region. Saying the same thing twice (moving back and forth) alternates a trailing
 * no-break space, so the region changes and it is announced again.
 */
export function useAnnouncer(): [message: string, announce: (text: string) => void] {
  const [message, setMessage] = useState('');
  const announce = useCallback((text: string) => setMessage((prev) => (prev === text ? `${text} ` : text)), []);
  return [message, announce];
}
