import { useRef } from 'react';
import { useSize } from '@/lib/useSize';
import type { Size } from './reviewRules';

export function useStageSize<T extends HTMLElement>(): [React.RefObject<T | null>, Size] {
  const ref = useRef<T>(null);
  return [ref, useSize(ref)];
}
