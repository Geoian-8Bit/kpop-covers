import { useIsMutating } from '@tanstack/react-query';
import { useEffect } from 'react';
import { noteSaving } from '@/features/nav/version/appUpdate';

/** Tells the update check how many saves are in flight, so a new version never reloads the app mid-save. */
export function SavingReporter() {
  const saving = useIsMutating();
  useEffect(() => noteSaving(saving), [saving]);
  return null;
}
