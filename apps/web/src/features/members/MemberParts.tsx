import { MEMBER_COLORS, type Member, type MemberColor } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Pencil, Trash2, UserRound } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { MEMBER_SWATCH, useUpdateMember } from '@/data/members';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import { memberNameError } from './memberRules';

/** A member as a small hanko seal: their initial on their pigment. */
export function MemberSeal({ member, size = 'md' }: { member: Pick<Member, 'name' | 'color'> | null; size?: 'sm' | 'md' | 'lg' }) {
  const swatch = member ? MEMBER_SWATCH[member.color] : null;
  const box = size === 'sm' ? 'size-6 text-[11px]' : size === 'lg' ? 'size-12 text-[20px]' : 'size-9 text-[15px]';
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-[7px] font-display font-extrabold shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.28)]',
        box,
        swatch ? [swatch.dot, swatch.text] : 'bg-sumi-700 text-washi-subtle',
      )}
    >
      {member ? member.name.trim().charAt(0).toUpperCase() : <UserRound className="size-[60%]" />}
    </span>
  );
}

function ColorPicker({ value, onChange, label }: { value: MemberColor; onChange: (c: MemberColor) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {MEMBER_COLORS.map((c) => (
        <motion.button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={MEMBER_SWATCH[c].label}
          whileTap={{ scale: 0.85 }}
          transition={jelly}
          onClick={() => onChange(c)}
          className="grid size-11 place-items-center rounded-full"
        >
          <span
            className={cn(
              'grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-sumi-850 transition-shadow',
              MEMBER_SWATCH[c].dot,
              value === c && 'ring-2 ring-kin-300',
            )}
          >
            {value === c && <Check className={cn('size-4', MEMBER_SWATCH[c].text)} strokeWidth={3} />}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

/** Next colour no member uses yet (falls back to cycling). */
export function freeColor(members: Member[] | undefined): MemberColor {
  const used = new Set(members?.map((m) => m.color));
  return MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[(members?.length ?? 0) % MEMBER_COLORS.length]!;
}

/** Name + colour. A name another member already has is flagged while typing and can't be sent. */
export function MemberForm({
  initial,
  members,
  selfId,
  onSubmit,
  busy,
  submitLabel,
  onCancel,
}: {
  initial: { name: string; color: MemberColor };
  /** The group, to refuse a repeated name; `selfId` is the member being edited. */
  members: Member[] | undefined;
  selfId?: string;
  onSubmit: (v: { name: string; color: MemberColor }) => void;
  busy: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const errorId = useId();
  const trimmed = name.trim();
  // An empty field only disables the button; a repeated name says why.
  const error = trimmed ? memberNameError(trimmed, members, selfId) : null;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!memberNameError(trimmed, members, selfId)) onSubmit({ name: trimmed, color });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-3">
        <MemberSeal member={{ name: trimmed || '?', color }} size="lg" />
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[13px] font-medium text-washi-muted">Nombre</span>
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            data-autofocus="desktop"
            placeholder="Como os llamáis en el grupo"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              'well h-12 w-full rounded-[10px] px-4 text-[15px] text-washi outline-none focus:border-kin-300/70',
              error && 'border-enji-400/80',
            )}
          />
        </label>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-[13px] text-enji-300">
          {error}
        </p>
      )}
      <ColorPicker value={color} onChange={setColor} label="Color" />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={busy} disabled={!trimmed || error != null}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** What deleting a member keeps (the confirmation's text, in Ajustes and in «¿Quién eres?»). */
export function deleteMemberText(isMe: boolean): string {
  return `Sale de la lista del grupo. Sus tomas, notas, votos y ausencias se conservan.${
    isMe ? ' Eres tú en este móvil: después tendrás que volver a elegir quién eres.' : ''
  }`;
}

/**
 * The group's members as rows with «Editar» (inline form) and «Borrar» (the caller confirms). `trailing` adds a
 * per-row control before them (Ajustes: «Soy yo» / «Eres tú»).
 */
export function MemberManageList({
  members,
  onDelete,
  trailing,
}: {
  members: Member[];
  onDelete: (member: Member) => void;
  trailing?: (member: Member) => ReactNode;
}) {
  const update = useUpdateMember();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {members.map((m) => (
          <motion.li
            key={m.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={snappy}
            className="well rounded-[12px] p-2.5"
          >
            {editing === m.id ? (
              <MemberForm
                initial={{ name: m.name, color: m.color }}
                members={members}
                selfId={m.id}
                busy={update.isPending}
                submitLabel="Guardar"
                onCancel={() => setEditing(null)}
                onSubmit={(v) =>
                  update.mutate(
                    { id: m.id, patch: v },
                    {
                      onSuccess: () => setEditing(null),
                      onError: (err) => toast(friendlyError(err), 'error'),
                    },
                  )
                }
              />
            ) : (
              <div className="flex items-center gap-3">
                <MemberSeal member={m} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{m.name}</span>
                {trailing?.(m)}
                <button
                  type="button"
                  aria-label={`Editar a ${m.name}`}
                  onClick={() => setEditing(m.id)}
                  className="grid size-11 place-items-center rounded-full text-washi-muted hover:bg-washi/10 hover:text-washi"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Borrar a ${m.name}`}
                  onClick={() => onDelete(m)}
                  className="grid size-11 place-items-center rounded-full text-washi-muted hover:bg-washi/10 hover:text-shu-400"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
