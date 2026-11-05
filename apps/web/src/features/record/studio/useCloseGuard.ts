import { useEffect, useRef } from 'react';
import { useBackToClose } from '@/lib/useBackToClose';
import type { Studio } from './useStudioSession';

/**
 * Leaving the recorder: «Cerrar», the phone's «Atrás» and leaving the page ask first when a take would be lost; with a
 * panel open, «Atrás» closes that panel only.
 */
export function useCloseGuard(S: Studio, open: boolean, onClose: () => void) {
  const { fx, phaseRef, rolling, unsaved, clap, confirm, setConfirm } = S;
  const { settingsOpen, imageOpen, infoOpen, startListOpen } = S;

  // Leaving the page mid-take, or before saving it, loses it: ask first.
  useEffect(() => {
    if (!rolling && !unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [rolling, unsaved]);

  function requestClose() {
    const now = phaseRef.current;
    if (now === 'finishing' || S.keepingRef.current) return;
    if (now === 'countdown' || now === 'arming' || now === 'recording') fx.pausePart();
    if (S.recorder.current || (now === 'review' && S.take && !S.saved && !S.kept)) setConfirm('close');
    else onClose();
  }

  // Back / swipe-back: closes the studio, or asks first when a take would be lost. With a panel open (settings,
  // image, info, start list) it closes that panel only.
  const panelOpen = settingsOpen || imageOpen || infoOpen || startListOpen;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  useBackToClose(open, onClose, rolling || unsaved || clap != null || panelOpen);
  const { setSettingsOpen, setImageOpen, setInfoOpen, setStartListOpen } = S;
  useEffect(() => {
    if (!panelOpen) return;
    const onPop = () => {
      setSettingsOpen(false);
      setImageOpen(false);
      setInfoOpen(false);
      setStartListOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [panelOpen, setSettingsOpen, setImageOpen, setInfoOpen, setStartListOpen]);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => {
    if (!open || !(rolling || unsaved)) return;
    const onPop = () => {
      if (confirmRef.current) setConfirm(null);
      else if (!panelOpenRef.current) requestCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, rolling, unsaved, setConfirm]);

  return { requestClose };
}
