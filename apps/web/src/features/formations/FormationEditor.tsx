import type { FormationPositions, Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BoxSelect,
  Check,
  CloudOff,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Ghost,
  Grid3x3,
  Maximize2,
  Minimize2,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Settings2,
  Shuffle,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { Page } from '@/components/AppShell';
import {
  CONFLICT_MESSAGE,
  useFormationMembers,
  useFormationPlan,
  type FormationInput,
  type FormationMember,
  type FormationPlanFull,
} from '@/data/formations';
import { useIdentity } from '@/data/members';
import { FormationTransport } from '@/features/studio/Transport';
import { useShortcuts } from '@/features/studio/useShortcuts';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { snapFormationsToBeats } from './beatRules';
import {
  applyTemplate,
  flipHorizontal,
  flipVertical,
  rotate,
  ROTATE_STEP,
  scale,
  swap,
  TEMPLATE_LABELS,
  TEMPLATES,
  type TemplateKind,
} from './formationEditRules';
import {
  activeIndex,
  DEFAULT_TRANSITION,
  duplicateMoment,
  formatMoment,
  formationAt,
  freeMoment,
  NOTE_MAX,
  positionsAt,
  rowPositions,
  snapPoint,
  sortKeyframes,
  TRANSITION_MAX,
  withDefaults,
  type Stage,
} from './formationRules';
import { FormationTimeline } from './FormationTimeline';
import { PlanForm } from './PlanDialogs';
import { RhythmPanel, RhythmUnderlay } from './RhythmPanel';
import { PositionsList, StageView } from './StageView';
import { useFormationEditor, type SaveStatus } from './useFormationEditor';
import { useWaveform } from './useWaveform';

const tool =
  'relative flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-bold transition-colors disabled:opacity-40';
const toolIdle = 'border-line-strong bg-sumi-800 text-washi-muted hover:border-washi/40 hover:text-washi';
const toolOn = 'border-ai-400/60 bg-ai-600/50 text-ai-200';

const NO_PEOPLE: FormationMember[] = [];

/**
 * REQ-06 · The formation editor: the song's player (`stage`, the studio's own) next to the stage of the plan, the
 * formations' timeline and the tools. Mounted by the studio at /v/:videoId/formaciones/:planId.
 */
export function FormationEditor({ video, planId, stage, playsFile }: { video: Video; planId: string; stage: ReactNode; playsFile: boolean }) {
  const query = useFormationPlan(planId);
  const back = `/v/${video.id}?tab=formaciones`;

  if (query.isError || (query.isSuccess && !query.data)) {
    return (
      <Page className="mx-auto max-w-lg px-5 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">{query.isError ? 'No pudimos cargar el plan' : 'Plan no encontrado'}</h1>
        <p className="mt-2 text-washi-muted">
          {query.isError ? 'Revisa la conexión e inténtalo de nuevo.' : 'Puede que alguien del grupo lo haya borrado.'}
        </p>
        {query.isError && (
          <Button className="mt-6" loading={query.isFetching} onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        )}
        <Link to={back} className="mt-4 block font-medium text-kin-300 hover:underline">
          Volver a la canción
        </Link>
        {/* The player stays mounted (hidden) so the store keeps its engine. */}
        <div className="hidden">{stage}</div>
      </Page>
    );
  }

  return (
    <Page className="px-2.5 pb-16 pt-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-[1500px] rounded-[10px] sm:rounded-[12px]">
        {query.data ? (
          <EditorBody key={planId} full={query.data} video={video} stage={stage} back={back} playsFile={playsFile} />
        ) : (
          <>
            <EditorHeader back={back} title="Cargando plan…" subtitle={video.title} />
            <div className="grid gap-3 p-3 sm:p-5 landscape:grid-cols-2 lg:grid-cols-2">
              <div className="mx-auto w-[64%] landscape:w-full lg:w-full">{stage}</div>
              <div className="skeleton aspect-[4/3] w-full rounded-[12px]" role="status" aria-label="Cargando el escenario" />
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

function EditorHeader({
  back,
  title,
  subtitle,
  status,
  children,
}: {
  back: string;
  title: string;
  subtitle: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="sep-b flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
      <Link
        to={back}
        aria-label="Volver a la canción"
        className="size-11 shrink-0 drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)] transition-transform hover:scale-105 active:scale-95"
      >
        <ButtonSkin kind="back" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[19px] font-bold leading-tight sm:text-[24px]">{title}</h1>
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm text-washi-muted">Formaciones · {subtitle}</p>
          {status}
        </div>
      </div>
      {children}
    </div>
  );
}

function SaveBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="relative flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] text-[12px] font-bold text-enji-300 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline"
      >
        <CloudOff className="size-3.5" /> Sin guardar · Reintentar
      </button>
    );
  }
  const label = status === 'saving' || status === 'dirty' ? 'Guardando…' : status === 'saved' ? 'Guardado' : null;
  return (
    <span role="status" className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-washi-subtle">
      {label === 'Guardado' && <Check className="size-3.5" aria-hidden />}
      {label === 'Guardando…' && <Spinner className="size-3.5" />}
      {label}
    </span>
  );
}

function EditorBody({
  full,
  video,
  stage: playerStage,
  back,
  playsFile,
}: {
  full: FormationPlanFull;
  video: Video;
  stage: ReactNode;
  back: string;
  playsFile: boolean;
}) {
  const toast = useToast();
  const onError = useCallback((message: string) => toast(message, 'error'), [toast]);
  const ed = useFormationEditor(full, onError);
  const membersQuery = useFormationMembers();
  const people = useMemo(() => new Map((membersQuery.data ?? NO_PEOPLE).map((p) => [p.id, p])), [membersQuery.data]);
  const myId = useIdentity((s) => s.memberId);
  const stage: Stage = useMemo(
    () => ({ width: ed.plan.stage_width, depth: ed.plan.stage_depth, grid: ed.plan.grid }),
    [ed.plan.stage_width, ed.plan.stage_depth, ed.plan.grid],
  );
  const memberIds = ed.members;
  const list = ed.list;
  const listRef = useRef(list);
  listRef.current = list;

  const [snap, setSnap] = useState(true);
  const [ghost, setGhost] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [focusMember, setFocusMember] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);

  const selectedId = usePlayer((s) => formationAt(list, s.time)?.id ?? null);
  const current = useMemo(() => list.find((f) => f.id === selectedId) ?? null, [list, selectedId]);
  const active = usePlayer((s) => activeIndex(list, s.time));
  const activeNote = active >= 0 ? list[active]?.note : null;
  const wave = useWaveform(video, playsFile);
  const mirrored = usePlayer((s) => s.mirrored);

  // Participants removed from the plan leave the selection.
  useEffect(() => setSelection((sel) => sel.filter((id) => memberIds.includes(id))), [memberIds]);

  useShortcuts({ onSave: noop, onHelp: noop, onNote: noop, enabled: !settings });

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (and Ctrl+Y): undo and redo the editing session.
  const { undo, redo } = ed;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) undo();
      else if ((key === 'z' && e.shiftKey) || key === 'y') redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const pause = useCallback(() => {
    const p = usePlayer.getState();
    if (p.playing) p.pause();
  }, []);

  /** Where the participants of a formation stand (their own place, or a free one at the side), keeping the rest. */
  const fullPositions = useCallback(
    (f: FormationInput): FormationPositions => ({ ...f.positions, ...withDefaults(f.positions, memberIds, stage) }),
    [memberIds, stage],
  );

  /**
   * Changes the positions of the formation at the playhead; with none there, a new formation is made at this moment
   * from where everybody is right now (REQ-06: the first drag on an empty plan makes the first formation).
   */
  const editPositions = useCallback(
    (fn: (positions: FormationPositions) => FormationPositions) => {
      const now = usePlayer.getState().time;
      const l = listRef.current;
      const here = formationAt(l, now);
      if (here) {
        ed.commit(l.map((f) => (f.id === here.id ? { ...f, positions: fn(fullPositions(f)) } : f)));
        return;
      }
      const { at, shifted } = freeMoment(l, now);
      const base = l.length ? positionsAt(sortKeyframes(l), now, memberIds, stage) : rowPositions(memberIds, stage);
      const rounded: FormationPositions = {};
      for (const [id, p] of Object.entries(base)) rounded[id] = snapPoint(p, stage, false);
      ed.commit([...l, { id: crypto.randomUUID(), at, transition: DEFAULT_TRANSITION, positions: fn(rounded), note: null }]);
      toast(shifted ? `Formación nueva en ${formatMoment(at)} (movida 0,1 s: ya había otra)` : `Formación nueva en ${formatMoment(at)}`, 'info');
      if (shifted || Math.abs(at - now) > 0.001) usePlayer.getState().seek(at);
    },
    [ed, fullPositions, memberIds, stage, toast],
  );

  function addHere() {
    const now = usePlayer.getState().time;
    if (formationAt(list, now)) {
      toast('Ya hay una formación en este momento', 'info');
      return;
    }
    pause();
    editPositions((p) => p);
  }

  function duplicate() {
    const source = current ?? (active >= 0 ? list[active] : null);
    if (!source) return;
    const now = usePlayer.getState().time;
    const { at, shifted } = duplicateMoment(list, source, now);
    ed.commit([...list, { ...source, id: crypto.randomUUID(), at, positions: structuredClone(source.positions) }]);
    usePlayer.getState().seek(at);
    toast(`Copia en ${formatMoment(at)}${shifted ? ' (movida 0,1 s: ya había otra)' : ''}`, 'info');
  }

  function removeCurrent() {
    if (!current) return;
    ed.commit(list.filter((f) => f.id !== current.id));
    toast('Formación borrada · puedes deshacerlo', 'info');
  }

  function patchCurrent(patch: Partial<FormationInput>) {
    if (!current) return;
    ed.commit(list.map((f) => (f.id === current.id ? { ...f, ...patch } : f)));
  }

  function moveMarker(id: string, to: number) {
    const { at, shifted } = freeMoment(list, to, id);
    ed.commit(list.map((f) => (f.id === id ? { ...f, at } : f)));
    if (shifted) toast(`Ya había una formación ahí: queda en ${formatMoment(at)}`, 'info');
  }

  function onSelect(ids: string[], additive: boolean) {
    const add = additive || selectMode;
    setSelection((sel) => {
      if (!add) return ids.length === 1 && sel.length === 1 && sel[0] === ids[0] ? [] : ids;
      const next = new Set(sel);
      for (const id of ids) {
        if (ids.length === 1 && next.has(id)) next.delete(id);
        else next.add(id);
      }
      return [...next];
    });
  }

  const targets = selection.length ? selection : memberIds;
  const applySelection = (fn: (ids: string[], p: FormationPositions) => FormationPositions) => {
    pause();
    editPositions((p) => fn(selection, p));
  };

  async function savePlan(patch: Parameters<typeof ed.updatePlan>[0]) {
    setSavingPlan(true);
    const ok = await ed.updatePlan(patch);
    setSavingPlan(false);
    return ok;
  }

  const conflict = ed.status === 'conflict';
  const archivedHere = memberIds.filter((id) => people.get(id)?.archived).map((id) => people.get(id)!);

  return (
    <>
      <EditorHeader back={back} title={ed.plan.name} subtitle={video.title} status={<SaveBadge status={ed.status} onRetry={ed.retry} />}>
        <Button variant="ghost" size="icon" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled={!ed.canUndo || conflict} onClick={ed.undo}>
          <Undo2 className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Rehacer" title="Rehacer (Ctrl+Mayús+Z)" disabled={!ed.canRedo || conflict} onClick={ed.redo}>
          <Redo2 className="size-5" />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Ajustes del plan" onClick={() => setSettings(true)} disabled={conflict}>
          <Settings2 className="size-5" />
        </Button>
      </EditorHeader>

      <AnimatePresence initial={false}>
        {conflict && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={snappy}
            className="overflow-hidden"
          >
            <div className="m-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-enji-400/60 bg-enji-700/30 p-3 sm:mx-5">
              <AlertTriangle className="size-5 shrink-0 text-enji-300" />
              <p className="min-w-0 flex-1 text-sm text-washi">
                <span className="font-bold">{CONFLICT_MESSAGE}.</span> Tus últimos cambios no se han guardado.
              </p>
              <Button size="sm" onClick={() => void ed.reload()}>
                Recargar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-3 p-3 sm:p-5 landscape:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] landscape:items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="mx-auto w-[64%] landscape:w-full lg:w-full">{playerStage}</div>
        <div className="relative">
          {activeNote && (
            <p className="mb-1.5 line-clamp-2 rounded-[8px] bg-ai-700/40 px-2.5 py-1.5 text-[13px] text-ai-200" aria-live="polite">
              {activeNote}
            </p>
          )}
          <div className="landscape:mx-auto landscape:max-w-[min(100%,calc((100dvh-120px)*1.3))]">
            <StageView
              stage={stage}
              memberIds={memberIds}
              people={people}
              list={list}
              snap={snap}
              focusMember={focusMember}
              ghost={ghost}
              selection={selection}
              selectMode={selectMode}
              onDragStart={pause}
              onMove={(moved) => editPositions((p) => ({ ...p, ...moved }))}
              onSelect={onSelect}
            />
          </div>
          {list.length === 0 && (
            <div className="mt-2 flex justify-center">
              <Button size="sm" onClick={addHere} disabled={conflict}>
                <Plus className="size-4" /> Añade la primera formación
              </Button>
            </div>
          )}
          {archivedHere.length > 0 && (
            <p className="mt-1 text-[12px] text-washi-subtle">
              En gris: {archivedHere.map((p) => p.name).join(', ')} (ya no está en el grupo).
            </p>
          )}
        </div>
      </div>

      <FormationTimeline
        list={list}
        selectedId={selectedId}
        onMoveMarker={moveMarker}
        underlay={(span) => <RhythmUnderlay span={span} bpm={ed.plan.bpm} firstBeat={ed.plan.first_beat} wave={playsFile ? wave : null} />}
      />
      <FormationTransport />

      {/* Formation tools */}
      <div className="sep-t space-y-3 px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={addHere} disabled={conflict}>
            <Plus className="size-4" /> Añadir formación aquí
          </Button>
          <button type="button" className={cn(tool, toolIdle)} onClick={duplicate} disabled={conflict || list.length === 0}>
            <Copy className="size-4" /> Duplicar
          </button>
          <button type="button" className={cn(tool, toolIdle)} onClick={removeCurrent} disabled={conflict || !current} aria-label="Borrar la formación de este momento">
            <Trash2 className="size-4" /> Borrar
          </button>
          {current && (
            <label className="flex items-center gap-2 text-[13px] text-washi-muted">
              Transición
              <input
                key={`${current.id}-${current.transition}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={TRANSITION_MAX}
                step={0.5}
                defaultValue={current.transition}
                onBlur={(e) => {
                  const v = Math.min(TRANSITION_MAX, Math.max(0, Number(e.target.value.replace(',', '.')) || 0));
                  if (v !== current.transition) patchCurrent({ transition: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="well tabular h-11 w-20 rounded-[10px] px-3 font-mono text-[15px] text-washi outline-none focus:border-kin-300/70"
              />
              s
            </label>
          )}
        </div>
        {current ? (
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-washi-muted">
              Nota de la formación {list.indexOf(current) + 1} ({formatMoment(current.at)})
            </span>
            <textarea
              key={`${current.id}-${current.note ?? ''}`}
              defaultValue={current.note ?? ''}
              maxLength={NOTE_MAX}
              rows={2}
              placeholder="Giro a la derecha, entra Ana por el fondo…"
              onBlur={(e) => {
                const note = e.target.value.trim() || null;
                if (note !== (current.note ?? null)) patchCurrent({ note });
              }}
              className="well w-full resize-none rounded-[10px] px-3 py-2 text-[14px] text-washi outline-none focus:border-kin-300/70"
            />
          </label>
        ) : (
          list.length > 0 && <p className="text-[12px] text-washi-subtle">Toca un número de la línea de tiempo para editar esa formación, o arrastra a alguien para crear una aquí.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Vista del escenario"
            layoutId={`view-${ed.plan.id}`}
            size="sm"
            value={mirrored ? 'dancers' : 'audience'}
            onChange={(v) => usePlayer.getState().setMirrored(v === 'dancers')}
            options={[
              { value: 'audience', label: 'Desde el público' },
              { value: 'dancers', label: 'Desde los bailarines' },
            ]}
          />

          <button type="button" aria-pressed={snap} onClick={() => setSnap((v) => !v)} className={cn(tool, snap ? toolOn : toolIdle)}>
            <Grid3x3 className="size-4" /> Rejilla
          </button>
          <button type="button" aria-pressed={ghost} onClick={() => setGhost((v) => !v)} className={cn(tool, ghost ? toolOn : toolIdle)}>
            <Ghost className="size-4" /> Fantasma
          </button>
          <button
            type="button"
            aria-pressed={selectMode}
            onClick={() => setSelectMode((v) => !v)}
            className={cn(tool, selectMode ? toolOn : toolIdle)}
            title="Toca a varias personas o arrastra un recuadro"
          >
            <BoxSelect className="size-4" /> Seleccionar
          </button>
          <label className="flex items-center gap-2 text-[13px] text-washi-muted">
            Mi recorrido
            <select
              value={focusMember ?? ''}
              onChange={(e) => setFocusMember(e.target.value || null)}
              onFocus={() => {
                if (focusMember == null && myId && memberIds.includes(myId)) setFocusMember(myId);
              }}
              className="well h-11 max-w-[11rem] rounded-[10px] px-2 text-[14px] text-washi outline-none"
            >
              <option value="">Nadie</option>
              {memberIds.map((id) => (
                <option key={id} value={id}>
                  {people.get(id)?.name ?? 'Alguien que ya no está'}
                  {id === myId ? ' (tú)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* REQ-07 · Selection and templates */}
        <div className="rounded-[12px] border border-line p-2.5">
          <p className="mb-2 text-[12px] font-medium text-washi-muted">
            {selection.length
              ? `${selection.length} seleccionad${selection.length === 1 ? 'a' : 'as'} · `
              : 'Sin selección · '}
            {selection.length ? (
              <button type="button" className="font-bold text-kin-300 underline-offset-2 hover:underline" onClick={() => setSelection([])}>
                Quitar selección
              </button>
            ) : (
              'Mayúsculas + clic, un recuadro o «Seleccionar» para elegir a varias personas.'
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <IconTool label="Voltear horizontal" disabled={!selection.length || conflict} onClick={() => applySelection((ids, p) => flipHorizontal(ids, p, stage))}>
              <FlipHorizontal2 className="size-4" />
            </IconTool>
            <IconTool label="Voltear vertical" disabled={!selection.length || conflict} onClick={() => applySelection((ids, p) => flipVertical(ids, p, stage))}>
              <FlipVertical2 className="size-4" />
            </IconTool>
            <IconTool label={`Girar ${ROTATE_STEP}° a la izquierda`} disabled={!selection.length || conflict} onClick={() => applySelection((ids, p) => rotate(ids, p, stage, -ROTATE_STEP))}>
              <RotateCcw className="size-4" />
            </IconTool>
            <IconTool label={`Girar ${ROTATE_STEP}° a la derecha`} disabled={!selection.length || conflict} onClick={() => applySelection((ids, p) => rotate(ids, p, stage, ROTATE_STEP))}>
              <RotateCw className="size-4" />
            </IconTool>
            <IconTool label="Juntar" disabled={!selection.length || conflict} onClick={() => applySelection((ids, p) => scale(ids, p, stage, 0.8))}>
              <Minimize2 className="size-4" />
            </IconTool>
            <IconTool label="Separar" disabled={!selection.length || conflict} onClick={() => applySelection((ids, p) => scale(ids, p, stage, 1.25))}>
              <Maximize2 className="size-4" />
            </IconTool>
            <button
              type="button"
              className={cn(tool, toolIdle)}
              disabled={selection.length !== 2 || conflict}
              onClick={() => applySelection((ids, p) => swap(ids[0]!, ids[1]!, p))}
            >
              <Shuffle className="size-4" /> Intercambiar
            </button>
          </div>
          <p className="mb-1.5 mt-3 text-[12px] font-medium text-washi-muted">
            Plantillas {selection.length ? 'para la selección' : 'para todo el plan'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((kind) => (
              <TemplateButton
                key={kind}
                kind={kind}
                disabled={!targets.length || conflict}
                onClick={() => {
                  pause();
                  editPositions((p) => applyTemplate(kind, targets, p, stage));
                }}
              />
            ))}
          </div>
        </div>

        <details className="rounded-[12px] border border-line p-2.5">
          <summary className="flex h-9 cursor-pointer items-center text-[13px] font-bold text-washi-muted hover:text-washi">Ritmo · cuentas de 8</summary>
          <div className="pt-2">
            <RhythmPanel
              bpm={ed.plan.bpm}
              firstBeat={ed.plan.first_beat}
              hasFile={playsFile}
              wave={wave}
              onSave={(patch) => savePlan(patch)}
              onSnap={() => {
                if (ed.plan.bpm == null) return;
                ed.commit(snapFormationsToBeats(list, ed.plan.bpm, ed.plan.first_beat ?? 0));
                toast('Formaciones ajustadas al tiempo', 'success');
              }}
            />
          </div>
        </details>
      </div>

      <PositionsList list={list} memberIds={memberIds} people={people} stage={stage} index={active} />

      <Dialog open={settings} onClose={() => setSettings(false)} title="Ajustes del plan" busy={savingPlan}>
        {settings && (
          <PlanForm
            initial={{ name: ed.plan.name, members: memberIds, width: ed.plan.stage_width, depth: ed.plan.stage_depth }}
            extraPeople={archivedHere}
            submitLabel="Guardar"
            pending={savingPlan}
            onCancel={() => setSettings(false)}
            onSubmit={(value) =>
              void savePlan({ name: value.name, members: value.members, stage_width: value.width, stage_depth: value.depth }).then((ok) => {
                if (ok) setSettings(false);
              })
            }
          />
        )}
      </Dialog>
    </>
  );
}

const noop = () => undefined;

function IconTool({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.88 }}
      transition={jelly}
      className={cn(tool, toolIdle, 'w-11 justify-center px-0')}
    >
      {children}
    </motion.button>
  );
}

/** A template as a small drawing of its shape. */
function TemplateButton({ kind, disabled, onClick }: { kind: TemplateKind; disabled: boolean; onClick: () => void }) {
  const dots: Record<TemplateKind, [number, number][]> = {
    line: [[3, 8], [8, 8], [13, 8]],
    v: [[3, 4], [8, 12], [13, 4]],
    'inverted-v': [[3, 12], [8, 4], [13, 12]],
    circle: [[8, 3], [13, 8], [8, 13], [3, 8]],
    pyramid: [[8, 12], [4, 5], [12, 5]],
    windows: [[3, 11], [8, 5], [13, 11]],
  };
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={jelly}
      className={cn(tool, toolIdle)}
    >
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        {dots[kind].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.8} fill="currentColor" />
        ))}
      </svg>
      {TEMPLATE_LABELS[kind]}
    </motion.button>
  );
}
