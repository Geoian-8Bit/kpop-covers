import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { type TakeItem, useRenameTake } from '@/data/takes';
import { MemberSeal } from '@/features/members/MembersUI';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import type { Member } from '@coverscape/shared';
import { Upload, Users } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Chip } from './TakeFilters';
import { cleanLabel, labelFromFileName, TAKE_LABEL_MAX, takeOwnTitle } from './takeNames';
import { renamePatch } from './takeRules';

// ───────────── Who dances it ─────────────

/** The group's members as chips that wrap (no sideways scroll in a dialog), then «Grupo / nadie». */
function MemberPicker({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string | null;
  onChange: (memberId: string | null) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="mb-1.5 text-[13px] font-medium text-washi-muted">
        Quién baila
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <Chip key={m.id} active={value === m.id} onClick={() => onChange(m.id)}>
            <MemberSeal member={m} size="sm" />
            {m.name}
          </Chip>
        ))}
        <Chip active={value == null} onClick={() => onChange(null)}>
          <Users className="size-4" aria-hidden />
          Grupo / nadie
        </Chip>
      </div>
    </div>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field
      label="Nombre"
      value={value}
      maxLength={TAKE_LABEL_MAX}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Grupo · primera versión"
      hint="Si lo dejas vacío, se ve el nombre de quien baila."
      autoComplete="off"
      enterKeyHint="done"
      data-autofocus="desktop"
    />
  );
}

// ───────────── «Editar» a take ─────────────

export function RenameTakeDialog({
  take,
  all,
  members,
  onClose,
}: {
  take: TakeItem | null;
  all: TakeItem[];
  members: Member[];
  onClose: () => void;
}) {
  const rename = useRenameTake();
  const toast = useToast();
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);

  // Each time it opens on a take: start from what it says now (a refreshed list doesn't undo the typing).
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const openId = take?.id ?? null;
  if (openId !== openedFor) {
    setOpenedFor(openId);
    if (take) {
      setName(takeOwnTitle(take) ?? '');
      setMemberId(take.member_id ?? null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!take) return;
    const patch = renamePatch(take, { label: name, memberId }, all);
    const same = patch.label === (cleanLabel(take.label) ?? null) && !('member_id' in patch);
    onClose();
    if (same) return;
    rename.mutate(
      { take, patch },
      {
        onSuccess: () => toast('Toma guardada', 'success'),
        onError: (err) => toast(friendlyError(err), 'error'),
      },
    );
  }

  // A take of someone who left the group: no chip is lit, and saving without touching it keeps that person.
  return (
    <Dialog
      open={take != null}
      onClose={onClose}
      title="Editar toma"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="rename-take-form">
            Guardar
          </Button>
        </div>
      }
    >
      <form id="rename-take-form" onSubmit={submit} className="space-y-5">
        <NameField value={name} onChange={setName} />
        <MemberPicker members={members} value={memberId} onChange={setMemberId} />
      </form>
    </Dialog>
  );
}

// ───────────── «Subir vídeo»: name it first ─────────────

export interface UploadChoice {
  label: string | null;
  memberId: string | null;
}

/**
 * After choosing a file in «Subir vídeo»: its name (the file's, without the extension) and who dances it (this
 * phone's person by default). «Subir» starts the upload; «Cancelar» uploads nothing.
 */
export function UploadNameDialog({
  file,
  members,
  defaultMemberId,
  onCancel,
  onUpload,
}: {
  file: File | null;
  members: Member[];
  defaultMemberId: string | null;
  onCancel: () => void;
  onUpload: (file: File, choice: UploadChoice) => void;
}) {
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);

  // Each file chosen starts from its own name and this phone's person.
  const [openedFor, setOpenedFor] = useState<File | null>(null);
  if (file !== openedFor) {
    setOpenedFor(file);
    if (file) {
      setName(labelFromFileName(file.name) ?? '');
      setMemberId(defaultMemberId);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (file) onUpload(file, { label: cleanLabel(name), memberId });
  }

  return (
    <Dialog
      open={file != null}
      onClose={onCancel}
      title="Subir vídeo"
      description="Se sube a «Tomas» y lo ve todo el grupo."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" form="upload-take-form">
            <Upload className="size-4" aria-hidden /> Subir
          </Button>
        </div>
      }
    >
      <form id="upload-take-form" onSubmit={submit} className="space-y-5">
        <NameField value={name} onChange={setName} />
        <MemberPicker members={members} value={memberId} onChange={setMemberId} />
      </form>
    </Dialog>
  );
}
