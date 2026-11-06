import { Fragment, type ReactNode } from 'react';

/** Pieces up to this long never split; longer ones («Domingo, 1 de noviembre de 2026») wrap between words. */
const KEEP_WHOLE = 16;

/**
 * A «a · b · c» meta line that wraps between pieces instead of being cut: the «·» is glued to the piece after
 * it (never left hanging at a line's end), short pieces stay whole and a long one wraps like normal text.
 */
export function MetaLine({ parts }: { parts: ReactNode[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span
            className={
              typeof part === 'string' && part.length > KEEP_WHOLE
                ? '[overflow-wrap:anywhere]'
                : 'whitespace-nowrap'
            }
          >
            {i > 0 && '· '}
            {part}
          </span>
        </Fragment>
      ))}
    </>
  );
}
