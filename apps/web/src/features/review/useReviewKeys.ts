import { useEffect, useRef, type RefObject } from 'react';
import { useReview } from '@/player/store';
import type { useToast } from '@/providers/ToastProvider';
import { trapFocus } from './focusTrap';

/** What is open on the review, for Escape and the keys. */
interface OpenLayers {
  composer: unknown;
  openNoteId: string | null;
  settingsOpen: boolean;
}

/**
 * The review's keyboard: Escape closes the last layer opened (as «Atrás» does), Tab stays inside, and the transport
 * keys (space/K, «,» «.», arrows, A/B or [ ], L, N). REQ-27 · Moved out of `ReviewScreen` as it was.
 */
export function useReviewKeys(
  rootRef: RefObject<HTMLElement | null>,
  open: OpenLayers,
  actions: {
    closeSettings: () => void;
    closeNote: () => void;
    close: () => void;
    newNote: () => void;
    toast: ReturnType<typeof useToast>;
  },
) {
  const { composer, openNoteId, settingsOpen } = open;
  const { closeSettings, closeNote, close, newNote, toast } = actions;
  /** Which of the settings and a note opened last (Escape closes it first, as «Atrás» does). */
  const openedOrder = useRef<('settings' | 'note')[]>([]);
  useEffect(() => {
    const order = openedOrder.current.filter((k) => (k === 'settings' ? settingsOpen : openNoteId != null));
    if (settingsOpen && !order.includes('settings')) order.push('settings');
    if (openNoteId != null && !order.includes('note')) order.push('note');
    openedOrder.current = order;
  }, [settingsOpen, openNoteId]);
  const stateRef = useRef({ composer, openNoteId, settingsOpen });
  stateRef.current = { composer, openNoteId, settingsOpen };
  useEffect(() => {
    let swallowSpaceUp = false;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && swallowSpaceUp) {
        swallowSpaceUp = false;
        e.preventDefault();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.composer || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      // Another layer on top (the «¿Quién eres?» dialog…) owns the keys.
      const modals = [...document.querySelectorAll('[aria-modal="true"]')];
      if (modals.some((m) => m !== rootRef.current)) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Same order as «Atrás»: the last one opened goes first.
        const top = openedOrder.current.at(-1);
        if (top === 'settings' && st.settingsOpen) closeSettings();
        else if (st.openNoteId) closeNote();
        else if (st.settingsOpen) closeSettings();
        else close();
        return;
      }
      if (e.key === 'Tab') {
        trapFocus(e, rootRef.current);
        return;
      }
      if (target && (target.isContentEditable || /^(TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      const onControl = target?.closest(
        '[role="slider"], [role="separator"], [role="radiogroup"], [role="group"], input[type="range"]',
      );
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      // A zoom panel moves its view with the arrows itself (when zoomed); on a whole picture they still seek.
      if (key.startsWith('Arrow') && onControl && !onControl.hasAttribute('data-zoom-panel')) return;
      if (key === ' ' && target?.closest('[role="radio"], [role="switch"], input')) return;
      if (key === ' ' && target?.closest('button, a[href]')) {
        swallowSpaceUp = true;
        e.preventDefault();
      }
      if (e.repeat && !key.startsWith('Arrow') && key !== ',' && key !== '.') return;
      const r = useReview.getState();
      let handled = true;
      switch (key) {
        case ' ':
        case 'k':
          r.togglePlay();
          break;
        case ',':
          r.step(-1);
          break;
        case '.':
          r.step(1);
          break;
        case 'ArrowLeft':
          r.seek(r.time - (e.shiftKey ? 5 : 1));
          break;
        case 'ArrowRight':
          r.seek(r.time + (e.shiftKey ? 5 : 1));
          break;
        case 'a':
        case '[':
          r.markStart();
          break;
        case 'b':
        case ']':
          r.markEnd();
          break;
        case 'l':
          if (!r.toggleLoop()) toast('Marca A y B para repetir un tramo', 'info');
          break;
        case 'n':
          newNote();
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [close, closeNote, closeSettings, newNote, rootRef, toast]);
}
