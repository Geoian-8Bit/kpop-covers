import type { Member, MemberColor } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { backend } from '@/lib/backend';
import { invalidateAfterArchive } from './afterArchive';

/**
 * F2 · Quién es quién. The group's member list lives in the database (shared); who *this* device is lives in
 * this browser only (kept across restarts, lost with the browser's data or in private mode). It's trust, not
 * security: anyone can pick any name.
 */

export const memberKeys = { all: ['members'] as const };

/** Pigment swatches per member colour (static class strings so Tailwind sees them). */
export const MEMBER_SWATCH: Record<MemberColor, { dot: string; ring: string; text: string; label: string }> = {
  shu: { dot: 'bg-shu-500', ring: 'ring-shu-400', text: 'text-washi', label: 'Bermellón' },
  ai: { dot: 'bg-ai-500', ring: 'ring-ai-300', text: 'text-washi', label: 'Índigo' },
  kin: { dot: 'bg-kin-400', ring: 'ring-kin-300', text: 'text-sumi-900', label: 'Oro viejo' },
  enji: { dot: 'bg-enji-500', ring: 'ring-enji-300', text: 'text-washi', label: 'Granate' },
  murasaki: { dot: 'bg-murasaki', ring: 'ring-murasaki', text: 'text-washi', label: 'Púrpura' },
  fuji: { dot: 'bg-fuji', ring: 'ring-fuji', text: 'text-sumi-900', label: 'Glicinia' },
  sakura: { dot: 'bg-sakura', ring: 'ring-sakura', text: 'text-sumi-900', label: 'Cerezo' },
  rokusho: { dot: 'bg-rokusho', ring: 'ring-rokusho', text: 'text-washi', label: 'Verdín' },
  kiji: { dot: 'bg-kiji-400', ring: 'ring-kiji-300', text: 'text-sumi-900', label: 'Hinoki' },
  washi: { dot: 'bg-washi', ring: 'ring-washi', text: 'text-sumi-900', label: 'Washi' },
};

export function useMembers() {
  return useQuery({ queryKey: memberKeys.all, queryFn: () => backend.listMembers() });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: { name: string; color: MemberColor }) => backend.insertMember(row),
    onSuccess: (member) => {
      queryClient.setQueryData<Member[]>(memberKeys.all, (current = []) => [...current, member]);
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: MemberColor } }) =>
      backend.updateMember(id, patch),
    onSuccess: (member) => {
      queryClient.setQueryData<Member[]>(memberKeys.all, (current = []) =>
        current.map((m) => (m.id === member.id ? member : m)),
      );
    },
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (member: Member) => {
      await backend.deleteMember(member.id);
      return member;
    },
    onSuccess: (member) => {
      queryClient.setQueryData<Member[]>(memberKeys.all, (current = []) => current.filter((m) => m.id !== member.id));
      if (useIdentity.getState().memberId === member.id) useIdentity.getState().choose(null);
      // People bags, «Me apunto» and vote counts stop counting them.
      invalidateAfterArchive(queryClient);
      // Takes, notes and reactions point at members: fetched again so none goes on showing them as before.
      for (const queryKey of [['takes'], ['notes'], ['take-reactions']]) void queryClient.invalidateQueries({ queryKey });
    },
  });
}

// ───────────── This device's identity ─────────────

const ME_KEY = 'oneshoot.me.v1';

interface IdentityState {
  /** The member this device says it is (null: «Sin nombre»). */
  memberId: string | null;
  /** «Ahora no» was pressed: the first-time suggestion isn't shown again (the menu still offers it). */
  dismissed: boolean;
  choose(memberId: string | null): void;
  dismiss(): void;
}

function readIdentity(): Pick<IdentityState, 'memberId' | 'dismissed'> {
  try {
    const raw = JSON.parse(localStorage.getItem(ME_KEY) ?? 'null') as Partial<IdentityState> | null;
    return {
      memberId: typeof raw?.memberId === 'string' ? raw.memberId : null,
      dismissed: raw?.dismissed === true,
    };
  } catch {
    return { memberId: null, dismissed: false };
  }
}

function writeIdentity(state: Pick<IdentityState, 'memberId' | 'dismissed'>) {
  try {
    localStorage.setItem(ME_KEY, JSON.stringify({ memberId: state.memberId, dismissed: state.dismissed }));
  } catch {
    /* this visit only (private mode) */
  }
}

export const useIdentity = create<IdentityState>()((set, get) => ({
  ...readIdentity(),
  choose(memberId) {
    set({ memberId });
    writeIdentity(get());
  },
  dismiss() {
    set({ dismissed: true });
    writeIdentity(get());
  },
}));

/** The member this device is, if it still exists in the group (an archived one reads as «Sin nombre»). */
export function useMe(): Member | null {
  const memberId = useIdentity((s) => s.memberId);
  const members = useMembers();
  return memberId ? (members.data?.find((m) => m.id === memberId) ?? null) : null;
}

// ───────────── «¿Quién eres?» prompt ─────────────

interface WhoPromptState {
  open: boolean;
  reason?: string;
  /** Runs when the prompt closes (whatever the answer): the action that triggered it goes on. */
  then?: () => void;
  /** Already suggested in this visit: never twice in a row. */
  asked: boolean;
}

export const useWhoPrompt = create<WhoPromptState>()(() => ({ open: false, asked: false }));

/**
 * The first time someone records or writes a note without having said who they are, suggest it (F2). Never
 * blocks: `then` runs right away when no question is due, or once the dialog closes.
 */
export function askWho(reason: string, then?: () => void): void {
  const { memberId, dismissed } = useIdentity.getState();
  const state = useWhoPrompt.getState();
  if (memberId || dismissed || state.asked) {
    then?.();
    return;
  }
  useWhoPrompt.setState({ open: true, reason, then, asked: true });
}

/** From the menu: always opens. */
export function openWho(): void {
  useWhoPrompt.setState({ open: true, reason: undefined, then: undefined });
}

export function closeWho(): void {
  const { then } = useWhoPrompt.getState();
  useWhoPrompt.setState({ open: false, then: undefined });
  then?.();
}

/** For writes: the member id to stamp on a take or note, if this device chose one that still exists. */
export function currentMemberId(members: Member[] | undefined): string | null {
  const id = useIdentity.getState().memberId;
  return id && members?.some((m) => m.id === id) ? id : null;
}
