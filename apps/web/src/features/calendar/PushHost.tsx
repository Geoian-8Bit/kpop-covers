import { useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { calendarKeys } from '@/data/calendar';
import { clearAppBadge, closePushSuggestion, enablePush, PushError, refreshPush, startPush, usePush } from '@/data/push';
import { useToast } from '@/providers/ToastProvider';
import { safeAppPath } from './pushRules';

/**
 * REQ-05 · The shell's part of the notices: clears the icon's count when the app opens or comes back, follows a
 * tapped notification to its day, refreshes the feed when a notice arrives with the app open, and shows the one-time
 * suggestion after «¿Quién eres?». Renders nothing else.
 */
export function PushHost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    startPush();
    clearAppBadge();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearAppBadge();
      void refreshPush();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type === 'oneshoot-open') {
        const path = safeAppPath(data.url);
        if (path) navigate(path);
      } else if (data?.type === 'oneshoot-push') {
        void queryClient.invalidateQueries({ queryKey: calendarKeys.changes });
        if (document.visibilityState === 'visible') clearAppBadge();
      }
    };
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, [navigate, queryClient]);

  return <PushSuggestion />;
}

function PushSuggestion() {
  const open = usePush((s) => s.suggestOpen);
  const busy = usePush((s) => s.busy);
  const toast = useToast();

  const accept = async () => {
    try {
      await enablePush();
      toast('Avisos activados', 'success');
      closePushSuggestion();
    } catch (error) {
      const reason = error instanceof PushError ? error.message : 'algo ha fallado';
      toast(`No se pudieron activar los avisos: ${reason}`, 'error');
      closePushSuggestion();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closePushSuggestion}
      title="¿Quieres enterarte cuando alguien cambie el calendario?"
      description="Te llegará un aviso al móvil cuando alguien marque una ausencia o cambie un ensayo. Puedes quitarlo cuando quieras en Ajustes."
      size="sm"
      hideClose
      busy={busy}
    >
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={closePushSuggestion} disabled={busy}>
          Ahora no
        </Button>
        <Button onClick={() => void accept()} loading={busy} data-autofocus>
          <BellRing className="size-4" /> Activar avisos
        </Button>
      </div>
    </Dialog>
  );
}
