import { SPEED_PRESETS, stepSpeed } from '@coverscape/shared';
import { useEffect } from 'react';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/**
 * Only controls that really use a key keep it; everywhere else (plain buttons, links, the stage) the
 * studio shortcuts win. Enter is never a shortcut, so it always reaches the focused control.
 */
const OPTION_ROLES = ['radiogroup', 'radio', 'menu', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tablist', 'tab', 'listbox', 'option'];
/** Move between options with the arrows. */
const ARROW_SELECTOR = OPTION_ROLES.map((r) => `[role="${r}"]`).join(', ');
/** Space picks an option or flips a switch; on a plain button it means play/pause instead of a re-click. */
const SPACE_SELECTOR = [...OPTION_ROLES, 'switch', 'checkbox'].map((r) => `[role="${r}"]`).join(', ');
const ACTIVATES_ON_SPACE = 'button, a[href], summary, [role="button"]';

export function useShortcuts({
  onSave,
  onHelp,
  onNote,
  enabled,
}: {
  onSave: () => void;
  onHelp: () => void;
  onNote: () => void;
  enabled: boolean;
}) {
  const toast = useToast();

  useEffect(() => {
    if (!enabled) return;
    /** Set when Space played/paused over a focused button: its keyup must not click that button too. */
    let swallowSpaceUp = false;
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !swallowSpaceUp) return;
      swallowSpaceUp = false;
      event.preventDefault();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const target = event.target instanceof Element ? event.target : null;
      if (key.startsWith('Arrow') && target?.closest(ARROW_SELECTOR)) return;
      // The time sliders seek with ←/→ (and Home/End) themselves; ↑/↓ still change the speed there.
      if ((key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End') && target?.closest('[role="slider"]')) return;
      if (key === ' ' && target?.closest(SPACE_SELECTOR)) return;
      if (key === ' ' && target?.closest(ACTIVATES_ON_SPACE)) {
        // Held Space must not leak a click on release either, even on the repeats we ignore.
        swallowSpaceUp = true;
        event.preventDefault();
      }
      if (event.repeat && !key.startsWith('Arrow')) return;
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
        case 'r':
          p.toggleLoopAll();
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
        case 'n':
          onNote();
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
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, onSave, onHelp, onNote, toast]);
}
