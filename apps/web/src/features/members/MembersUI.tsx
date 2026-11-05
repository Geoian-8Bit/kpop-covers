import type { Member } from '@coverscape/shared';
import { motion } from 'motion/react';
import { Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Spinner } from '@/components/ui/Spinner';
import {
  closeWho,
  forgetMe,
  openWho,
  useWhoPrompt,
  useCreateMember,
  useDeleteMember,
  useIdentity,
  useMe,
  useMembers,
} from '@/data/members';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import { deleteMemberText, freeColor, MemberForm, MemberManageList, MemberSeal } from './MemberParts';
import { isVanishedMe } from './memberRules';

export { MemberSeal };

/** Ajustes · the group's members: add, rename, recolour, delete (archived). */
export function MembersSection() {
  const members = useMembers();
  const create = useCreateMember();
  const remove = useDeleteMember();
  const toast = useToast();
  const me = useMe();
  const choose = useIdentity((s) => s.choose);
  const [adding, setAdding] = useState(false);
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
      ) : members.data?.length ? (
        <div className="mt-4">
          <MemberManageList
            members={members.data}
            onDelete={setConfirm}
            trailing={(m) =>
              me?.id === m.id ? (
                <span className="rounded-full bg-kin-300 px-2.5 py-1 text-[12px] font-bold text-sumi-900">Eres tú</span>
              ) : (
                <button
                  type="button"
                  onClick={() => choose(m.id)}
                  className="min-h-11 rounded-[8px] px-2.5 text-[13px] font-bold text-kin-300 hover:bg-washi/10"
                >
                  Soy yo
                </button>
              )
            }
          />
        </div>
      ) : (
        !adding && (
          <p className="mt-4 rounded-[12px] border border-dashed border-line-strong p-4 text-center text-[14px] text-washi-subtle">
            Aún no hay nadie. Añadid vuestros nombres para firmar tomas y notas.
          </p>
        )
      )}

      <div className="mt-3">
        {adding ? (
          <div className="well rounded-[12px] p-3">
            <MemberForm
              initial={{ name: '', color: freeColor(members.data) }}
              members={members.data}
              busy={create.isPending}
              submitLabel="Añadir"
              onCancel={() => setAdding(false)}
              onSubmit={(v) =>
                create.mutate(v, {
                  onSuccess: () => setAdding(false),
                  onError: (err) => toast(friendlyError(err), 'error'),
                })
              }
            />
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)} disabled={!members.data}>
            <Plus className="size-4" /> Añadir miembro
          </Button>
        )}
      </div>

      <Dialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        title={`¿Borrar a ${confirm?.name ?? ''}?`}
        description={deleteMemberText(confirm != null && me?.id === confirm.id)}
        size="sm"
        hideClose
        busy={remove.isPending}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)} disabled={remove.isPending}>
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
            Borrar
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

/**
 * The app-wide «¿Quién eres?» dialog, driven by `askWho` / `openWho` (mounted once in the shell). Also notices
 * when this device's member was deleted on another phone and forgets it, so the question comes back.
 */
export function WhoPromptHost() {
  const { open, reason } = useWhoPrompt();
  const memberId = useIdentity((s) => s.memberId);
  const members = useMembers();
  useEffect(() => {
    if (isVanishedMe(memberId, members.data)) forgetMe();
  }, [memberId, members.data]);
  return <WhoAreYouDialog open={open} onClose={closeWho} reason={reason} />;
}

/**
 * «¿Quién eres?» (F2): pick a name from the list or add yours. `onLater` = «Ahora no» (the first-time suggestion
 * isn't shown again; it stays in Ajustes and in the menu). «Corregir nombres» switches the same dialog to a list
 * where a misspelt name is renamed or a repeated one deleted (with its own «¿Borrar…?» step).
 */
function WhoAreYouDialog({ open, onClose, reason }: { open: boolean; onClose: () => void; reason?: string }) {
  const members = useMembers();
  const create = useCreateMember();
  const remove = useDeleteMember();
  const { memberId, choose, dismiss } = useIdentity();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [confirm, setConfirm] = useState<Member | null>(null);

  function close() {
    setManaging(false);
    setConfirm(null);
    onClose();
  }

  function pick(id: string) {
    choose(id);
    close();
  }

  const heading = confirm
    ? { title: `¿Borrar a ${confirm.name}?`, description: deleteMemberText(confirm.id === memberId) }
    : managing
      ? { title: 'Corregir nombres', description: 'Cambia un nombre mal escrito o borra uno que sobre, como uno repetido.' }
      : { title: '¿Quién eres?', description: reason ?? 'Así tus tomas y notas llevan tu nombre. Se recuerda en este dispositivo.' };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={heading.title}
      description={heading.description}
      busy={create.isPending || remove.isPending}
    >
      {members.isPending ? (
        <div className="grid place-items-center py-6">
          <Spinner className="size-6 text-washi-muted" />
        </div>
      ) : members.isError && !members.data ? (
        // Without the list, «Soy yo» would add someone who may already be in it: retry first.
        <div role="alert" className="rounded-[10px] border border-enji-400/50 p-4 text-[14px] text-washi-muted">
          No se pudo cargar la lista.{' '}
          <button
            type="button"
            className="font-bold text-kin-300 disabled:opacity-60"
            disabled={members.isFetching}
            onClick={() => void members.refetch()}
          >
            Reintentar
          </button>
        </div>
      ) : confirm ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)} disabled={remove.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(confirm, {
                onSuccess: (gone) => {
                  setConfirm(null);
                  if (!members.data?.some((m) => m.id !== gone.id)) setManaging(false);
                  toast(`${gone.name} ya no está en la lista`, 'success');
                },
                onError: (err) => toast(friendlyError(err), 'error'),
              })
            }
          >
            Borrar
          </Button>
        </div>
      ) : managing && members.data?.length ? (
        <div className="space-y-4">
          <MemberManageList members={members.data} onDelete={setConfirm} />
          <div className="flex justify-end border-t border-line pt-3">
            <Button variant="secondary" onClick={() => setManaging(false)}>
              Listo
            </Button>
          </div>
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
                members={members.data}
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
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> No estoy en la lista
              </Button>
              <Button variant="ghost" onClick={() => setManaging(true)}>
                <Pencil className="size-4" /> Corregir nombres
              </Button>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            {memberId && (
              <Button
                variant="ghost"
                onClick={() => {
                  choose(null);
                  close();
                }}
              >
                Sin nombre
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                dismiss();
                close();
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
