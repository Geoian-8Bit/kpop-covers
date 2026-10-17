import { MEMBER_COLORS, type Member, type MemberColor } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import {
  closeWho,
  MEMBER_SWATCH,
  openWho,
  useWhoPrompt,
  useCreateMember,
  useDeleteMember,
  useIdentity,
  useMe,
  useMembers,
  useUpdateMember,
} from '@/data/members';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';

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
function freeColor(members: Member[] | undefined): MemberColor {
  const used = new Set(members?.map((m) => m.color));
  return MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[(members?.length ?? 0) % MEMBER_COLORS.length]!;
}

function MemberForm({
  initial,
  onSubmit,
  busy,
  submitLabel,
  onCancel,
}: {
  initial: { name: string; color: MemberColor };
  onSubmit: (v: { name: string; color: MemberColor }) => void;
  busy: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const trimmed = name.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed) onSubmit({ name: trimmed, color });
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
            className="well h-12 w-full rounded-[10px] px-4 text-[15px] text-washi outline-none focus:border-kin-300/70"
          />
        </label>
      </div>
      <ColorPicker value={color} onChange={setColor} label="Color" />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={busy} disabled={!trimmed}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Ajustes · the group's members: add, rename, recolour, remove (archived). */
export function MembersSection() {
  const members = useMembers();
  const create = useCreateMember();
  const update = useUpdateMember();
  const remove = useDeleteMember();
  const toast = useToast();
  const me = useMe();
  const choose = useIdentity((s) => s.choose);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Member | null>(null);

  return (
    <section aria-labelledby="members-title" className="sep-t px-5 py-7 sm:px-9">
      <SectionTitle id="members-title" glyph="座員" aside={<span className="text-sm text-washi-subtle">{members.data?.length ?? 0}</span>}>
        Miembros del grupo
      </SectionTitle>
      <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-washi-muted">
        Sirve para saber de quién es cada toma y para quién es cada nota. Es de confianza, no una contraseña: cada
        uno elige quién es en su móvil.
      </p>

      {members.isPending ? (
        <div className="mt-6 grid place-items-center">
          <Spinner className="size-6 text-washi-muted" />
        </div>
      ) : members.isError ? (
        <div className="mt-4 rounded-[10px] border border-enji-400/50 p-4 text-[14px] text-washi-muted">
          No se pudo cargar la lista. <button type="button" className="font-bold text-kin-300" onClick={() => void members.refetch()}>Reintentar</button>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          <AnimatePresence initial={false}>
            {members.data?.map((m) => (
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
                    {me?.id === m.id ? (
                      <span className="rounded-full bg-kin-300 px-2.5 py-1 text-[12px] font-bold text-sumi-900">Eres tú</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => choose(m.id)}
                        className="min-h-11 rounded-[8px] px-2.5 text-[13px] font-bold text-kin-300 hover:bg-washi/10"
                      >
                        Soy yo
                      </button>
                    )}
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
                      aria-label={`Quitar a ${m.name} del grupo`}
                      onClick={() => setConfirm(m)}
                      className="grid size-11 place-items-center rounded-full text-washi-muted hover:bg-washi/10 hover:text-shu-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
          {!members.data?.length && editing !== 'new' && (
            <li className="rounded-[12px] border border-dashed border-line-strong p-4 text-center text-[14px] text-washi-subtle">
              Aún no hay nadie. Añadid vuestros nombres para firmar tomas y notas.
            </li>
          )}
        </ul>
      )}

      <div className="mt-3">
        {editing === 'new' ? (
          <div className="well rounded-[12px] p-3">
            <MemberForm
              initial={{ name: '', color: freeColor(members.data) }}
              busy={create.isPending}
              submitLabel="Añadir"
              onCancel={() => setEditing(null)}
              onSubmit={(v) =>
                create.mutate(v, {
                  onSuccess: () => setEditing(null),
                  onError: (err) => toast(friendlyError(err), 'error'),
                })
              }
            />
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setEditing('new')} disabled={!members.data}>
            <Plus className="size-4" /> Añadir miembro
          </Button>
        )}
      </div>

      <Dialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        title={`¿Quitar a ${confirm?.name ?? ''}?`}
        description="Deja de salir en la lista. Sus tomas y notas se conservan; el administrador puede recuperarla."
        size="sm"
        hideClose
        busy={remove.isPending}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() =>
              confirm &&
              remove.mutate(confirm, {
                onSuccess: () => setConfirm(null),
                onError: (err) => toast(friendlyError(err), 'error'),
              })
            }
          >
            Quitar
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

/** Menu entry: who this device is (or «¿Quién eres?»), opens the picker. */
export function WhoButton({ onPick, className, inMenu = false }: { onPick?: () => void; className?: string; inMenu?: boolean }) {
  const me = useMe();
  return (
    <button
      type="button"
      role={inMenu ? "menuitem" : undefined}
      onClick={() => {
        onPick?.();
        openWho();
      }}
      className={cn(
        'flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm font-medium text-washi-muted transition-colors hover:bg-washi/[0.06] hover:text-washi',
        className,
      )}
    >
      <MemberSeal member={me} size="sm" />
      <span className="min-w-0 truncate">{me ? `Eres ${me.name}` : '¿Quién eres?'}</span>
    </button>
  );
}

/** The app-wide «¿Quién eres?» dialog, driven by `askWho` / `openWho` (mounted once in the shell). */
export function WhoPromptHost() {
  const { open, reason } = useWhoPrompt();
  return <WhoAreYouDialog open={open} onClose={closeWho} reason={reason} />;
}

/**
 * «¿Quién eres?» (F2): pick a name from the list or add yours. `onLater` = «Ahora no» (the first-time suggestion
 * isn't shown again; it stays in Ajustes and in the menu).
 */
export function WhoAreYouDialog({ open, onClose, reason }: { open: boolean; onClose: () => void; reason?: string }) {
  const members = useMembers();
  const create = useCreateMember();
  const { memberId, choose, dismiss } = useIdentity();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  function pick(id: string) {
    choose(id);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="¿Quién eres?"
      description={reason ?? 'Así tus tomas y notas llevan tu nombre. Se recuerda en este dispositivo.'}
      busy={create.isPending}
    >
      {members.isPending ? (
        <div className="grid place-items-center py-6">
          <Spinner className="size-6 text-washi-muted" />
        </div>
      ) : (
        <div className="space-y-4">
          {!!members.data?.length && (
            <ul role="radiogroup" aria-label="Miembros" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {members.data.map((m) => (
                <li key={m.id}>
                  <motion.button
                    type="button"
                    role="radio"
                    aria-checked={memberId === m.id}
                    whileTap={{ scale: 0.94 }}
                    transition={jelly}
                    onClick={() => pick(m.id)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-2.5 rounded-[12px] px-3 text-left',
                      memberId === m.id ? 'bg-washi text-sumi-900' : 'well text-washi hover:border-washi/30',
                    )}
                  >
                    <MemberSeal member={m} />
                    <span className="min-w-0 truncate text-[15px] font-bold">{m.name}</span>
                  </motion.button>
                </li>
              ))}
            </ul>
          )}
          {adding || !members.data?.length ? (
            <div className="well rounded-[12px] p-3">
              <MemberForm
                initial={{ name: '', color: freeColor(members.data) }}
                busy={create.isPending}
                submitLabel="Soy yo"
                onCancel={members.data?.length ? () => setAdding(false) : undefined}
                onSubmit={(v) =>
                  create.mutate(v, {
                    onSuccess: (m) => pick(m.id),
                    onError: (err) => toast(friendlyError(err), 'error'),
                  })
                }
              />
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> No estoy en la lista
            </Button>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            {memberId && (
              <Button
                variant="ghost"
                onClick={() => {
                  choose(null);
                  onClose();
                }}
              >
                Sin nombre
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                dismiss();
                onClose();
              }}
            >
              Ahora no
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
