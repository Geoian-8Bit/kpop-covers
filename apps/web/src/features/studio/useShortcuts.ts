import { SPEED_PRESETS, stepSpeed } from '@coverscape/shared';
import { useEffect } from 'react';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/** Keys a focused control handles natively (activate / move between options). */
const NATIVE_KEYS = new Set([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const CONTROL_SELECTOR = 'button, a[href], summary, [role="radio"], [role="switch"], [role="slider"], [role="menuitem"]';

export function useShortcuts({ onSave, onHelp, enabled }: { onSave: () => void; onHelp: () => void; enabled: boolean }) {
  const toast = useToast();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (event.repeat && !key.startsWith('Arrow')) return;
      const target = event.target as HTMLElement | null;
      // The big stage button is the one control where Space should mean play/pause.
      if (NATIVE_KEYS.has(event.key) && target?.closest(CONTROL_SELECTOR) && !target.closest('[data-stage]')) return;
      const p = usePlayer.getState();
      let handled = true;

      switch (key) {
        case ' ':
        case 'k':
          p.togglePlay();
          break;
        case 'ArrowLeft':
          p.nudge(event.shiftKey ? -1 : -5);
          break;
        case 'ArrowRight':
          p.nudge(event.shiftKey ? 1 : 5);
          break;
        case ',':
          p.nudge(-0.1);
          break;
        case '.':
          p.nudge(0.1);
          break;
        case 'ArrowUp':
          p.setRate(stepSpeed(p.rate, 1));
          break;
        case 'ArrowDown':
          p.setRate(stepSpeed(p.rate, -1));
          break;
        case 'm':
          p.toggleMirror();
          break;
        case 'f':
          window.dispatchEvent(new Event('oneshoot:fullscreen'));
          break;
        case 'a':
        case '[':
          p.markStart();
          break;
        case 'b':
        case ']':
          p.markEnd();
          break;
        case 'l':
          if (!p.toggleLoop()) toast('Marca A y B para repetir un tramo', 'info');
          break;
        case 'Escape':
          p.clearLoop();
          break;
        case 's':
          onSave();
          break;
        case '?':
          onHelp();
          break;
        case 'Home':
          p.seek(p.loop.start ?? 0);
          break;
        default:
          if (/^[1-8]$/.test(key)) p.setRate(SPEED_PRESETS[Number(key) - 1]!);
          else handled = false;
      }

      if (handled) event.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onSave, onHelp, toast]);
}
