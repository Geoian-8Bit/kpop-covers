import { useEffect, type RefObject } from 'react';
import { menuStep } from './popoverRules';

const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** Columns of a grid menu, from its layout: the items that share the first one's row. */
function columnsOf(items: HTMLElement[]): number {
  const top = items[0]?.offsetTop;
  return Math.max(1, items.filter((item) => item.offsetTop === top).length);
}

/**
 * Keyboard for a small `role="menu"` popover: on opening the focus goes to the chosen item (`aria-checked`) or the
 * first one, the arrows (and Home/End) move between items, and on closing — Escape, a choice, a tap outside — the
 * focus goes back to what had it before (the menu's button) when it would otherwise be lost. `open` follows the
 * menu's presence: pass false as soon as it starts leaving (an exit animation keeps it in the DOM a moment).
 * The arrows are caught before the studio's own shortcuts (they seek the song) only while the focus is in the menu.
 */
export function useMenuFocus(menuRef: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const previous = active instanceof HTMLElement && active !== document.body ? active : null;
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);

    const frame = requestAnimationFrame(() => {
      const list = items();
      (list.find((item) => item.getAttribute('aria-checked') === 'true') ?? list[0])?.focus({ preventScroll: true });
    });

    const onKey = (event: KeyboardEvent) => {
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (at < 0) return;
      const next = menuStep(at, list.length, event.key, columnsOf(list));
      if (next == null) return;
      event.preventDefault();
      event.stopPropagation();
      list[next]?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey, true);

    const menu = menuRef.current;
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
      // Only when the focus would be lost (it was in the menu, or fell to body): a tap on another control keeps it.
      const now = document.activeElement;
      const lost = !now || now === document.body || (menu?.contains(now) ?? false);
      if (lost && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [menuRef, open]);
}
