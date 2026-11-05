import { useOutletContext } from 'react-router';

export interface ShellContext {
  openAddVideo: () => void;
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}
