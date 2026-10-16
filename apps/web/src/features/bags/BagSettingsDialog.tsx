import type { Bag, BagKind, DrawMode } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { bagError, useCreateBag, useUpdateBag } from '@/data/bags';
import { soft } from '@/lib/motion';
import { useToast } from '@/providers/ToastProvider';
import { KIND_COPY, MODE_COPY } from './drawRules';

/** The mode a new bag starts with: songs and people usually leave once drawn; clips stay for warming up. */
export function defaultMode(kind: BagKind): DrawMode {
  return kind === 'clips' ? 'keep' : 'remove';
}

interface BagFormProps {
  /** Creating: the kinds offered (one = fixed). Editing: the bag. */
  bag?: Bag | null;
  kinds?: readonly BagKind[];
  /** A name to start from (e.g. what was typed elsewhere). */
  initialName?: string;
  onDone: (bag: Bag) => void;
  onCancel: () => void;
  submitLabel?: string;
}

/** Name, kind (only when creating), «Se queda» / «Se quita» and «sin repetir seguidas» (only for bags that keep). */
export function BagForm({
  bag,
  kinds = ['songs', 'clips', 'people'],
  initialName = '',
  onDone,
  onCancel,
  submitLabel,
}: BagFormProps) {
  const [name, setName] = useState(bag?.name ?? initialName);
  const [kind, setKind] = useState<BagKind>(bag?.kind ?? kinds[0] ?? 'songs');
  const [mode, setMode] = useState<DrawMode>(bag?.draw_mode ?? defaultMode(kinds[0] ?? 'songs'));
  const [noRepeat, setNoRepeat] = useState(bag?.no_repeat ?? false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBag();
  const update = useUpdateBag();
  const busy = create.isPending || update.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('Ponle un nombre, por ejemplo «Próxima coreo».');
      return;
    }
    const no_repeat = mode === 'keep' && noRepeat;
    try {
      const saved = bag
        ? await update.mutateAsync({ id: bag.id, patch: { name: clean, draw_mode: mode, no_repeat } })
        : await create.mutateAsync({ name: clean, kind, draw_mode: mode, no_repeat });
      onDone(saved);
    } catch (err) {
      setError(bagError(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field
        label="Nombre"
        value={name}
        maxLength={60}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder={
          kind === 'people'
            ? 'Quién dirige el calentamiento'
            : kind === 'clips'
              ? 'Estribillos para calentar'
              : 'Próxima coreo'
        }
        error={error}
        data-autofocus="desktop"
      />
      {!bag && kinds.length > 1 && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-washi-muted">Qué se sortea</p>
          <Segmented
            label="Qué se sortea"
            layoutId="bag-form-kind"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setMode(defaultMode(k));
            }}
            options={kinds.map((k) => ({ value: k, label: KIND_COPY[k].label }))}
          />
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-washi-muted">Al sacar</p>
        <Segmented
          label="Al sacar"
          layoutId="bag-form-mode"
          value={mode}
          onChange={setMode}
          options={(['keep', 'remove'] as const).map((m) => ({ value: m, label: MODE_COPY[m].label }))}
        />
        <p className="mt-1.5 text-[13px] text-washi-subtle">
          {MODE_COPY[mode].hint} Al sacar puedes cambiarlo esa vez.
        </p>
      </div>
      <AnimatePresence initial={false}>
        {mode === 'keep' && (
          <motion.div
            key="no-repeat"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={soft}
            className="overflow-hidden"
          >
            <ElasticToggle label="Sin repetir seguidas" checked={noRepeat} onChange={setNoRepeat} />
            <p className="text-[13px] text-washi-subtle">
              Lo que acaba de salir no vuelve a salir justo después.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" loading={busy}>
          {submitLabel ?? (bag ? 'Guardar' : 'Crear bolsa')}
        </Button>
      </div>
    </form>
  );
}

export function BagSettingsDialog({
  open,
  onClose,
  bag,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  bag?: Bag | null;
  onCreated?: (bag: Bag) => void;
}) {
  const toast = useToast();
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={bag ? 'Ajustes de la bolsa' : 'Nueva bolsa'}
      description={
        bag
          ? `Bolsa de ${KIND_COPY[bag.kind].many}. Es de todo el grupo.`
          : 'Las bolsas son de todo el grupo.'
      }
      size="sm"
    >
      <BagForm
        key={formKey}
        bag={bag}
        onCancel={onClose}
        onDone={(saved) => {
          toast(bag ? 'Bolsa guardada' : `Bolsa «${saved.name}» creada`, 'success');
          onClose();
          if (!bag) onCreated?.(saved);
        }}
      />
    </Dialog>
  );
}
