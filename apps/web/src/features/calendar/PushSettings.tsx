import { useEffect, useId, useState } from 'react';
import { InstallAppButton } from '@/components/InstallApp';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { useIdentity } from '@/data/members';
import { disablePush, enablePush, PushError, refreshPush, usePush } from '@/data/push';
import { useToast } from '@/providers/ToastProvider';

/**
 * REQ-05 · Ajustes → «Avisos»: the switch for the calendar notices on this device. Hidden when the deploy has no
 * VAPID key; elsewhere it explains what is missing (iPhone not installed, browser without Web Push, permission
 * blocked) instead of insisting.
 */
export function PushSettings() {
  const availability = usePush((s) => s.availability);
  const subscribed = usePush((s) => s.subscribed);
  const busy = usePush((s) => s.busy);
  const named = useIdentity((s) => s.memberId != null);
  const toast = useToast();
  const hintId = useId();
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    void refreshPush();
  }, []);

  if (availability === 'hidden') return null;

  const toggle = async (next: boolean) => {
    if (busy) return;
    setError(null);
    if (next) {
      setActivating(true);
      try {
        await enablePush();
        toast('Avisos activados', 'success');
      } catch (err) {
        const reason = err instanceof PushError ? err.message : 'algo ha fallado';
        setError(`No se pudieron activar los avisos: ${reason}.`);
      } finally {
        setActivating(false);
      }
    } else {
      await disablePush();
      toast('Avisos desactivados', 'success');
    }
  };

  return (
    <section aria-labelledby="push-title" className="sep-t px-5 py-7 sm:px-9">
      <SectionTitle id="push-title" glyph="報">
        Avisos
      </SectionTitle>
      <div className="mt-3 max-w-prose space-y-3 text-[15px] leading-relaxed text-washi-muted">
        <p id={hintId}>
          Un aviso en este dispositivo cuando alguien cambie el calendario: ausencias, ensayos semanales, cancelaciones
          y ensayos extra.
        </p>

        {(availability === 'ready' || availability === 'demo') && (
          <>
            <ElasticToggle
              checked={subscribed}
              onChange={(next) => void toggle(next)}
              label={activating ? 'Activando…' : 'Avisos'}
              describedBy={hintId}
            />
            {availability === 'demo' && (
              <p className="text-sm text-washi-subtle">Modo demo: el interruptor es simulado y no se envía nada.</p>
            )}
            {subscribed && !named && (
              <p className="text-sm text-washi-subtle">
                Elige quién eres en el menú para no recibir avisos de tus propios cambios.
              </p>
            )}
            <p role="status" className="text-sm text-shu-300">
              {error}
            </p>
          </>
        )}

        {availability === 'ios-install' && (
          <>
            <p>En el iPhone, los avisos solo llegan si añades la app a la pantalla de inicio y la abres desde allí.</p>
            <InstallAppButton className="max-w-xs" />
          </>
        )}

        {availability === 'unsupported' && (
          <p>Este navegador no puede recibir avisos. El punto del calendario dentro de la app sigue funcionando.</p>
        )}

        {availability === 'denied' && (
          <p>
            Los avisos están bloqueados para esta app en el navegador. Si quieres recibirlos, permítelos en los ajustes
            del navegador y vuelve aquí.
          </p>
        )}
      </div>
    </section>
  );
}
