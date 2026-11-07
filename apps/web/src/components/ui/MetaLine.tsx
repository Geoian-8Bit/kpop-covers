import type { ReactNode } from 'react';

/**
 * A «a · b · c» meta line kept to ONE line on a phone: what doesn't fit ends in «…» and the whole line is in
 * `title` (and read whole by screen readers). Secondary text never grows a card by a line.
 */
export function MetaLine({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '');
  const text = shown.every((p) => typeof p === 'string' || typeof p === 'number') ? shown.join(' · ') : undefined;
  return (
    <span className="block truncate" title={text}>
      {shown.map((part, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {part}
        </span>
      ))}
    </span>
  );
}
