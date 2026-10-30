import type { RehearsalRule } from '@coverscape/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import {
  calendarError,
  useCreateRehearsalException,
  useCreateRehearsalRule,
  useEditRehearsalRule,
  useEndRehearsalRule,
} from '@/data/calendar';
import { useToast } from '@/providers/ToastProvider';
import { hhmm, isDayKey, WEEKDAYS_LONG } from './calendarRules';
import { checkTimes, clashingSessions, overlappingRules, ruleLabel, timeRange, type Session } from './rehearsalRules';

const WEEKDAY_OPTIONS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label, i) => ({
  value: i + 1,
  label,
  ariaLabel: WEEKDAYS_LONG[i],
}));

/** A small warning under a form: allowed, but worth a second look. */
function Heads({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-[10px] border border-kin-400/40 bg-kin-400/10 px-3 py-2 text-[13px] leading-snug text-kin-200">
      {children}
    </p>
  );
}

/**
 * REQ-04 · «Añadir ensayo semanal» / «Editar ensayo semanal»: weekday, start and end. An edit applies from today
 * (the server closes the old rule yesterday); a clash with another rule that day is allowed but pointed out.
 */
export function RuleFormDialog({
  open,
  onClose,
  rule,
  rules,
  today,
}: {
  open: boolean;
  onClose: () => void;
  rule?: RehearsalRule | null;
  rules: RehearsalRule[];
  today: string;
}) {
  const create = useCreateRehearsalRule();
  const edit = useEditRehearsalRule();
  const toast = useToast();
  const pending = create.isPending || edit.isPending;
  const [weekday, setWeekday] = useState(3);
  const [starts, setStarts] = useState('18:00');
  const [ends, setEnds] = useState('20:00');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setWeekday(rule?.weekday ?? 3);
    setStarts(rule ? hhmm(rule.starts_at) : '18:00');
    setEnds(rule ? hhmm(rule.ends_at) : '20:00');
  }, [open, rule]);

  const clashes = overlappingRules({ weekday, starts, ends }, rules, today, rule?.id);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const check = checkTimes(starts, ends);
    if (!check.ok) return setError(check.message);
    setError(null);
    const row = { weekday, starts_at: check.starts, ends_at: check.ends };
    const options = {
      onSuccess: () => {
        toast(rule ? 'Horario cambiado desde hoy' : 'Ensayo semanal añadido', 'success');
        onClose();
      },
      onError: (err: unknown) => toast(calendarError(err), 'error'),
    };
    if (rule) edit.mutate({ id: rule.id, row }, options);
    else create.mutate(row, options);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={rule ? 'Editar ensayo semanal' : 'Añadir ensayo semanal'}
      description={rule ? 'El cambio vale desde hoy: las semanas pasadas se quedan como estaban.' : 'Se repite cada semana desde hoy.'}
      busy={pending}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-washi-muted">Día</span>
          <Segmented
            options={WEEKDAY_OPTIONS}
            value={weekday}
            onChange={setWeekday}
            layoutId="rule-weekday"
            label="Día de la semana"
            size="sm"
            className="flex w-full [&>button]:flex-1 [&>button]:px-0"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Empieza" type="time" value={starts} onChange={(e) => setStarts(e.target.value)} required />
          <Field
            label="Termina"
            type="time"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
            error={error}
            required
          />
        </div>
        {clashes.length > 0 && (
          <Heads>{`Se solapa con ${clashes.map((r) => ruleLabel(r)).join(' y ')}. Puedes guardarlo igualmente.`}</Heads>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {rule ? 'Guardar' : 'Añadir'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** REQ-04 · «Quitar» a weekly rule: it stops repeating from today; past rehearsals stay. */
export function EndRuleDialog({ rule, onClose }: { rule: RehearsalRule | null; onClose: () => void }) {
  const end = useEndRehearsalRule();
  const toast = useToast();
  return (
    <Dialog
      open={rule != null}
      onClose={onClose}
      title="¿Quitar este ensayo semanal?"
      description={
        rule ? `${ruleLabel(rule)} deja de repetirse desde hoy. Los ensayos pasados se quedan como estaban.` : undefined
      }
      size="sm"
      hideClose
      busy={end.isPending}
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={end.isPending}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          loading={end.isPending}
          onClick={() =>
            rule &&
            end.mutate(rule.id, {
              onSuccess: () => {
                toast('Ensayo semanal quitado', 'success');
                onClose();
              },
              onError: (err) => toast(calendarError(err), 'error'),
            })
          }
        >
          Quitar
        </Button>
      </div>
    </Dialog>
  );
}

/** REQ-04 · «Añadir ensayo suelto»: a date, a start and an end. A clash with a session that day is pointed out. */
export function ExtraFormDialog({
  open,
  onClose,
  day,
  sessions,
}: {
  open: boolean;
  onClose: () => void;
  day: string;
  /** The sessions already known around that day (to warn about clashes). */
  sessions: Session[];
}) {
  const create = useCreateRehearsalException();
  const toast = useToast();
  const [date, setDate] = useState(day);
  const [starts, setStarts] = useState('18:00');
  const [ends, setEnds] = useState('20:00');
  const [error, setError] = useState<{ field: 'date' | 'ends'; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDate(day);
    setStarts('18:00');
    setEnds('20:00');
  }, [open, day]);

  const clashes = isDayKey(date) ? clashingSessions(date, starts, ends, sessions) : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    if (!isDayKey(date)) return setError({ field: 'date', message: 'Elige el día.' });
    const check = checkTimes(starts, ends);
    if (!check.ok) return setError({ field: 'ends', message: check.message });
    setError(null);
    create.mutate(
      { kind: 'extra', on_date: date, starts_at: check.starts, ends_at: check.ends },
      {
        onSuccess: () => {
          toast('Ensayo suelto añadido', 'success');
          onClose();
        },
        onError: (err) => toast(calendarError(err), 'error'),
      },
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Añadir ensayo suelto" busy={create.isPending}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field
          label="Día"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={error?.field === 'date' ? error.message : null}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Empieza" type="time" value={starts} onChange={(e) => setStarts(e.target.value)} required />
          <Field
            label="Termina"
            type="time"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
            error={error?.field === 'ends' ? error.message : null}
            required
          />
        </div>
        {clashes.length > 0 && (
          <Heads>{`Ese día ya hay ensayo de ${clashes.map((s) => timeRange(s.starts, s.ends)).join(' y ')}. Se verán los dos.`}</Heads>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Añadir
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
