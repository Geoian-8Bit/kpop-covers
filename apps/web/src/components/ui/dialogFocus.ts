/** What the dialog knows about each focusable node, in DOM order. */
export interface FocusCandidate {
  /** Marked `data-autofocus`: the dialog's own choice. */
  autofocus: boolean;
  /** The corner X (`data-dialog-close`). */
  close: boolean;
}

/**
 * Which node a dialog focuses when it opens: the one marked `data-autofocus`, else the first control that isn't
 * the corner X (a form's first field, or the safe «Cancelar» of a confirmation, which always comes before its
 * action), else the X itself. -1: nothing focusable, the panel takes focus.
 */
export function initialFocusIndex(nodes: readonly FocusCandidate[]): number {
  const marked = nodes.findIndex((n) => n.autofocus);
  if (marked >= 0) return marked;
  const first = nodes.findIndex((n) => !n.close);
  if (first >= 0) return first;
  return nodes.length ? 0 : -1;
}
