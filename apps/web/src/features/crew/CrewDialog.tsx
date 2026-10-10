import type { Profile } from '@coverscape/shared';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Crown, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { supabase } from '@/lib/supabase';
import { useCrew } from '@/providers/CrewProvider';

export function useCrewMembers(crewId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['crew-members', crewId],
    enabled: Boolean(crewId) && enabled,
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from('crew_members')
        .select('user_id, role')
        .eq('crew_id', crewId!)
        .order('joined_at');
      if (error) throw error;
      const ids = members.map((m) => m.user_id);
      const { data: profiles, error: profileError } = await supabase.from('profiles').select('*').in('id', ids);
      if (profileError) throw profileError;
      const byId = new Map(profiles.map((p) => [p.id, p] as const));
      return members.map((m) => ({ role: m.role, profile: byId.get(m.user_id) as Profile | undefined, id: m.user_id }));
    },
  });
}

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the code stays visible to copy by hand */
    }
  }
  return (
    <Button variant="washi" size="sm" onClick={copy} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? 'ok' : 'copy'}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={jelly}
          className="flex items-center gap-1.5"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copiado' : 'Copiar'}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

export function CrewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { crews, activeCrew, setActiveCrewId } = useCrew();
  const navigate = useNavigate();
  const members = useCrewMembers(activeCrew?.id, open);

  if (!activeCrew) return null;

  return (
    <Dialog open={open} onClose={onClose} title={activeCrew.name} description="Comparte el código para que tu crew se una.">
      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-sumi-950/50 p-4">
        <div>
          <p className="text-[13px] font-medium text-washi-muted">Código de invitación</p>
          <p className="tabular mt-1 font-mono text-[26px] font-semibold tracking-[0.24em] text-kin-200">{activeCrew.invite_code}</p>
        </div>
        <CopyCodeButton code={activeCrew.invite_code} />
      </div>

      <h3 className="mb-2 mt-6 font-display text-base font-bold">Miembros</h3>
      <ul className="divide-y divide-line">
        {members.isPending && Array.from({ length: 3 }, (_, i) => <li key={i} className="skeleton my-1 h-11 rounded-[10px]" />)}
        {members.data?.map((m) => (
          <li key={m.id} className="flex h-13 items-center gap-3">
            <Avatar name={m.profile?.display_name ?? '?'} hue={m.profile?.avatar_hue} />
            <span className="flex-1 truncate">{m.profile?.display_name ?? 'Miembro'}</span>
            {m.role === 'owner' && (
              <span className="flex items-center gap-1 text-xs font-medium text-kin-300">
                <Crown className="size-3.5" /> Admin
              </span>
            )}
          </li>
        ))}
      </ul>

      {crews.length > 1 && (
        <>
          <h3 className="mb-2 mt-6 font-display text-base font-bold">Cambiar de crew</h3>
          <div className="flex flex-wrap gap-2">
            {crews.map((crew) => (
              <motion.button
                key={crew.id}
                type="button"
                whileTap={{ scale: 0.92 }}
                transition={jelly}
                onClick={() => {
                  setActiveCrewId(crew.id);
                  onClose();
                  navigate('/');
                }}
                className={cn(
                  'h-10 rounded-[10px] border px-4 text-sm font-medium transition-colors',
                  crew.id === activeCrew.id
                    ? 'border-washi bg-washi text-sumi-900'
                    : 'border-line text-washi-muted hover:bg-sumi-800 hover:text-washi',
                )}
              >
                {crew.name}
              </motion.button>
            ))}
          </div>
        </>
      )}

      <Button
        variant="secondary"
        className="mt-6 w-full"
        onClick={() => {
          onClose();
          navigate('/onboarding');
        }}
      >
        <Plus className="size-4" /> Crear o unirme a otra crew
      </Button>
    </Dialog>
  );
}
