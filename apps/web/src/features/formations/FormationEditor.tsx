import type { FormationPath, FormationPositions, FormationProp, FormationPropKind, StagePoint, Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Box,
  BoxSelect,
  Check,
  CloudOff,
  Copy,
  Download,
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
  Spline,
  Trash2,
  Undo2,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  keepPaths,
  NOTE_MAX,
  positionsAt,
  propsSnapshot,
  rowPositions,
  snapPoint,
  sortKeyframes,
  TRANSITION_MAX,
  withDefaults,
  withoutPaths,
  type Stage,
} from './formationRules';
import { clashRanges, findClashes, type Clash } from './clashRules';
import { FormationTimeline } from './FormationTimeline';
import { addPathPoint, convertPath, movePathPoint, PATH_LABELS, PATH_POINTS_MAX, removePathPoint, strokeToPath, type PathChoice } from './pathRules';
import { PlanForm } from './PlanDialogs';
import {
  addPropFrom,
  newProp,
  patchProp,
  PROP_KINDS,
  PROP_LABEL_MAX,
  PROP_LABELS,
  PROP_ROTATE_STEP,
  PROPS_MAX,
  relabelProp,
  removePropFrom,
} from './propRules';
import { RhythmPanel, RhythmUnderlay } from './RhythmPanel';
import { ExportDialog } from './export/ExportDialog';
import type { PlanSnapshot } from './export/exportStill';
import { PositionsList, PropShape, StageView } from './StageView';
import { useFormationEditor, type SaveStatus } from './useFormationEditor';
import { useWaveform } from './useWaveform';
import { hasWebGL, NO_WEBGL } from './three/webgl';

/** REQ-13 · The 3D view, with three.js, only for whoever opens it (its own chunk, not in the precache). */
const Stage3D = lazy(() => import('./three/Stage3D'));

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
  /** REQ-08 · «Recorridos» on: routes into the formation at the playhead, editable person by person. */
  const [showPaths, setShowPaths] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [selectedHandle, setSelectedHandle] = useState<number | null>(null);
  /** REQ-10 · The prop being moved, turned or removed. */
  const [selectedProp, setSelectedProp] = useState<string | null>(null);
  /** REQ-11 / REQ-12 · «Exportar». */
  const [exporting, setExporting] = useState(false);
  /** REQ-13 · The 3D view in place of the 2D stage. */
  const [view3d, setView3d] = useState(false);
  const webgl = useMemo(() => hasWebGL(), []);

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
   * Edits the plan around the formation at the playhead; with none there, a new formation is made at this moment
   * from where everybody (and every prop) is right now (REQ-06: the first drag on an empty plan makes the first one).
   * `fn` gets the list (sorted) and the id of that formation.
   */
  const editHere = useCallback(
    (fn: (list: FormationInput[], id: string) => FormationInput[]) => {
      const now = usePlayer.getState().time;
      const l = sortKeyframes(listRef.current);
      const here = formationAt(l, now);
      if (here) {
        ed.commit(fn(l, here.id));
        return;
      }
      const { at, shifted } = freeMoment(l, now);
      const base = l.length ? positionsAt(l, now, memberIds, stage) : rowPositions(memberIds, stage);
      const rounded: FormationPositions = {};
      for (const [id, p] of Object.entries(base)) rounded[id] = snapPoint(p, stage, false);
      const made: FormationInput = { id: crypto.randomUUID(), at, transition: DEFAULT_TRANSITION, positions: rounded, note: null, props: propsSnapshot(l, now) };
      ed.commit(fn(sortKeyframes([...l, made]), made.id));
      toast(shifted ? `Formación nueva en ${formatMoment(at)} (movida 0,1 s: ya había otra)` : `Formación nueva en ${formatMoment(at)}`, 'info');
      if (shifted || Math.abs(at - now) > 0.001) usePlayer.getState().seek(at);
    },
    [ed, memberIds, stage, toast],
  );

  /** Changes the positions of the formation at the playhead (REQ-08: everybody keeps the path into their place). */
  const editPositions = useCallback(
    (fn: (positions: FormationPositions) => FormationPositions) =>
      editHere((l, id) =>
        l.map((f) => {
          if (f.id !== id) return f;
          const before = fullPositions(f);
          return { ...f, positions: keepPaths(before, fn(before)) };
        }),
      ),
    [editHere, fullPositions],
  );

  /** REQ-10 · Changes the props of the formation at the playhead. */
  const editProps = useCallback(
    (fn: (props: FormationProp[]) => FormationProp[]) => editHere((l, id) => l.map((f) => (f.id === id ? { ...f, props: fn(f.props ?? []) } : f))),
    [editHere],
  );

  function addProp(kind: FormationPropKind) {
    pause();
    const id = crypto.randomUUID();
    editHere((l, here) => {
      const f = l.find((x) => x.id === here);
      if ((f?.props ?? []).length >= PROPS_MAX) {
        toast(`Caben hasta ${PROPS_MAX} objetos por formación`, 'info');
        return l;
      }
      return addPropFrom(l, here, newProp(kind, f?.props ?? [], stage, id));
    });
    setSelection([]);
    setSelectedProp(id);
  }

  function removeProp() {
    if (!selectedProp) return;
    const id = selectedProp;
    editHere((l, here) => removePropFrom(l, here, id));
    setSelectedProp(null);
    toast('Objeto quitado desde esta formación · puedes deshacerlo', 'info');
  }

  function turnProp(delta: number) {
    if (!selectedProp) return;
    const id = selectedProp;
    pause();
    editProps((props) => {
      const p = props.find((x) => x.id === id);
      return p ? patchProp(props, id, { rot: p.rot + delta }, stage) : props;
    });
  }

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
    // The copy lands elsewhere in time: the routes into the original don't apply to it (REQ-08).
    ed.commit([
      ...list,
      { ...source, id: crypto.randomUUID(), at, positions: withoutPaths(source.positions), props: structuredClone(source.props ?? []) },
    ]);
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

  // ── REQ-08 · Paths and clashes ──
  const clashes = useMemo(() => findClashes(list, memberIds, stage), [list, memberIds, stage]);
  const ranges = useMemo(() => clashRanges(clashes), [clashes]);
  const pathIndex = current ? list.indexOf(current) : -1;
  const pathMember = showPaths && pathIndex > 0 && selection.length === 1 ? selection[0]! : null;
  const pathEnds = useMemo(() => {
    if (!pathMember || pathIndex < 1) return null;
    const from = withDefaults(list[pathIndex - 1]!.positions, memberIds, stage)[pathMember];
    const to = withDefaults(list[pathIndex]!.positions, memberIds, stage)[pathMember];
    return from && to ? { from, to, path: to.path } : null;
  }, [pathMember, pathIndex, list, memberIds, stage]);

  // A new person, formation or mode starts the path tools afresh.
  useEffect(() => {
    setDrawMode(false);
    setSelectedHandle(null);
  }, [pathMember, current?.id, showPaths]);

  /** The route of the person being edited into the formation at the playhead (null: straight). */
  function setPath(path: FormationPath | null) {
    if (!current || !pathMember || !pathEnds) return;
    const { to } = pathEnds;
    const id = pathMember;
    ed.commit(
      list.map((f) =>
        f.id === current.id ? { ...f, positions: { ...fullPositions(f), [id]: path ? { x: to.x, y: to.y, path } : { x: to.x, y: to.y } } } : f,
      ),
    );
  }

  function choosePath(choice: PathChoice) {
    if (!pathEnds) return;
    pause();
    setSelectedHandle(null);
    if (choice === 'free') {
      setDrawMode(true);
      return;
    }
    setDrawMode(false);
    const next = convertPath(choice, pathEnds.from, pathEnds.to, pathEnds.path, stage);
    if (next !== undefined) setPath(next);
  }

  function onStroke(points: StagePoint[]) {
    const path = strokeToPath(points, stage);
    setPath(path);
    setDrawMode(false);
    toast(path ? 'Recorrido dibujado' : 'Trazo muy corto: el recorrido queda recto', 'info');
  }

  function seekClash(c: Clash) {
    pause();
    usePlayer.getState().seek(c.start);
  }

  function onSelect(ids: string[], additive: boolean) {
    setSelectedProp(null);
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

  /** What an export draws: the plan as it is now (unsaved edits included) and the view chosen on the stage. */
  const snapshot = (): PlanSnapshot => ({
    planName: ed.plan.name,
    songTitle: video.title,
    stage,
    memberIds,
    people,
    list: sortKeyframes(listRef.current),
    mirrored: usePlayer.getState().mirrored,
  });

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
            {view3d ? (
              <Suspense fallback={<div className="skeleton aspect-[4/3] w-full rounded-[12px]" role="status" aria-label="Cargando la vista 3D" />}>
                <Stage3D stage={stage} memberIds={memberIds} people={people} list={list} />
              </Suspense>
            ) : (
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
                clashes={clashes}
                showPaths={showPaths}
                pathIndex={pathIndex}
                pathMember={pathMember}
                selectedHandle={selectedHandle}
                onSelectHandle={setSelectedHandle}
                onMovePathPoint={(i, to) => {
                  if (pathEnds?.path) setPath(movePathPoint(pathEnds.path, i, to, stage));
                }}
                drawing={drawMode && pathMember != null}
                onStroke={onStroke}
                selectedProp={selectedProp}
                onSelectProp={(id) => {
                  setSelectedProp(id);
                  if (id) setSelection([]);
                }}
                onMoveProp={(id, to) => editProps((props) => patchProp(props, id, to, stage))}
                locked={conflict}
              />
            )}
          </div>
          {clashes.length > 0 && <ClashNotice clashes={clashes} people={people} onSeek={seekClash} />}
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
        clashes={ranges}
        locked={conflict}
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
          <button type="button" className={cn(tool, toolIdle)} onClick={() => setExporting(true)}>
            <Download className="size-4" /> Exportar
          </button>
          <button
            type="button"
            aria-pressed={view3d}
            disabled={!webgl}
            title={webgl ? 'Ver el escenario en 3D (la vista 2D sigue siendo la de editar)' : NO_WEBGL}
            onClick={() => setView3d((v) => !v)}
            className={cn(tool, view3d ? toolOn : toolIdle)}
          >
            <Box className="size-4" /> 3D
          </button>
          {!webgl && <span className="text-[12px] text-washi-subtle">{NO_WEBGL}</span>}
          {view3d && <span className="text-[12px] text-washi-subtle">Para mover a alguien, vuelve a la vista 2D.</span>}
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
            aria-pressed={showPaths}
            onClick={() => setShowPaths((v) => !v)}
            className={cn(tool, showPaths ? toolOn : toolIdle)}
            title="Cómo llega cada persona a la formación de este momento"
          >
            <Spline className="size-4" /> Recorridos
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

        {/* REQ-08 · Paths */}
        <AnimatePresence initial={false}>
          {showPaths && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={snappy}
              className="overflow-hidden"
            >
              <PathPanel
                pathIndex={pathIndex}
                memberName={pathMember ? (people.get(pathMember)?.name ?? 'Alguien que ya no está') : null}
                path={pathEnds?.path}
                drawMode={drawMode}
                selectedHandle={selectedHandle}
                disabled={conflict}
                onChoose={choosePath}
                onCancelDraw={() => setDrawMode(false)}
                onAddPoint={() => pathEnds && setPath(addPathPoint(pathEnds.from, pathEnds.to, pathEnds.path, stage))}
                onRemovePoint={() => {
                  const path = pathEnds?.path;
                  if (!path) return;
                  setPath(removePathPoint(path, selectedHandle ?? path.points.length - 1));
                  setSelectedHandle(null);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* REQ-10 · Props */}
        <PropPanel
          list={list}
          selectedProp={selectedProp}
          disabled={conflict}
          onAdd={addProp}
          onTurn={turnProp}
          onRemove={removeProp}
          onRelabel={(text) => selectedProp && ed.commit(relabelProp(list, selectedProp, text))}
          onClose={() => setSelectedProp(null)}
        />

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

      <ExportDialog open={exporting} onClose={() => setExporting(false)} snapshot={snapshot} video={video} playsFile={playsFile} />

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

const fmtMetres = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** REQ-08 · The clashes in words, each one a jump to its moment. */
function ClashNotice({ clashes, people, onSeek }: { clashes: Clash[]; people: Map<string, FormationMember>; onSeek: (c: Clash) => void }) {
  const name = (id: string) => people.get(id)?.name.split(/\s+/)[0] ?? 'Alguien';
  const shown = clashes.slice(0, 3);
  return (
    <div role="status" className="mt-2 rounded-[10px] border border-shu-500/50 bg-shu-700/20 px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-shu-300">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {clashes.length === 1 ? 'Un choque' : `${clashes.length} choques`}: pasan a menos de 0,5 m
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {shown.map((c, i) => (
          <li key={`${c.formationId}-${c.a}-${c.b}-${i}`}>
            <button
              type="button"
              onClick={() => onSeek(c)}
              className="flex h-11 items-center gap-1 rounded-[8px] border border-shu-500/40 px-2.5 text-[12px] font-medium text-washi hover:border-shu-400"
            >
              {name(c.a)} y {name(c.b)} · {fmtMetres(c.distance)} m · {formatMoment(c.start)}
            </button>
          </li>
        ))}
        {clashes.length > shown.length && <li className="self-center text-[12px] text-washi-subtle">y {clashes.length - shown.length} más</li>}
      </ul>
    </div>
  );
}

/** REQ-08 · How the chosen person arrives at the formation at the playhead. */
function PathPanel({
  pathIndex,
  memberName,
  path,
  drawMode,
  selectedHandle,
  disabled,
  onChoose,
  onCancelDraw,
  onAddPoint,
  onRemovePoint,
}: {
  pathIndex: number;
  memberName: string | null;
  path: FormationPath | undefined;
  drawMode: boolean;
  selectedHandle: number | null;
  disabled: boolean;
  onChoose: (choice: PathChoice) => void;
  onCancelDraw: () => void;
  onAddPoint: () => void;
  onRemovePoint: () => void;
}) {
  const choices: PathChoice[] = ['straight', 'curve', 'points', 'free'];
  return (
    <div className="rounded-[12px] border border-line p-2.5">
      <p className="mb-2 text-[12px] font-medium text-washi-muted">
        {pathIndex < 1
          ? 'Ve a una formación que no sea la primera (toca su número) para ver cómo llega cada persona.'
          : !memberName
            ? `Toca a una persona para elegir cómo llega a la formación ${pathIndex + 1}.`
            : `Recorrido de ${memberName} hasta la formación ${pathIndex + 1}`}
      </p>
      {memberName && pathIndex >= 1 && (
        <div className="space-y-2">
          <Segmented
            label="Tipo de recorrido"
            layoutId="path-kind"
            size="sm"
            value={drawMode ? 'free' : (path?.kind ?? 'straight')}
            onChange={(v) => !disabled && onChoose(v)}
            options={choices.map((c) => ({ value: c, label: PATH_LABELS[c] }))}
          />
          {drawMode && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-kin-200" aria-live="polite">
              Dibuja con el dedo en el escenario el camino de {memberName}.
              <button type="button" className={cn(tool, toolIdle)} onClick={onCancelDraw}>
                Cancelar
              </button>
            </p>
          )}
          {!drawMode && path?.kind === 'curve' && <p className="text-[12px] text-washi-subtle">Arrastra el punto blanco para cambiar la curva.</p>}
          {!drawMode && path?.kind === 'free' && <p className="text-[12px] text-washi-subtle">Elige «A mano» otra vez para volver a dibujarlo.</p>}
          {!drawMode && path?.kind === 'points' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={cn(tool, toolIdle)} disabled={disabled || path.points.length >= PATH_POINTS_MAX} onClick={onAddPoint}>
                <Plus className="size-4" /> Añadir punto
              </button>
              <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={onRemovePoint}>
                <Trash2 className="size-4" /> {selectedHandle != null ? `Quitar punto ${selectedHandle + 1}` : 'Quitar el último punto'}
              </button>
              <span className="text-[12px] text-washi-subtle">Arrastra los puntos blancos; toca uno para elegirlo.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** REQ-10 · Props: add one to the formation at the playhead (it stays from there on), then turn, rename or remove it. */
function PropPanel({
  list,
  selectedProp,
  disabled,
  onAdd,
  onTurn,
  onRemove,
  onRelabel,
  onClose,
}: {
  list: FormationInput[];
  selectedProp: string | null;
  disabled: boolean;
  onAdd: (kind: FormationPropKind) => void;
  onTurn: (delta: number) => void;
  onRemove: () => void;
  onRelabel: (text: string) => void;
  onClose: () => void;
}) {
  const prop = useMemo(() => {
    if (!selectedProp) return null;
    for (const f of list) {
      const p = (f.props ?? []).find((x) => x.id === selectedProp);
      if (p) return p;
    }
    return null;
  }, [list, selectedProp]);
  return (
    <div className="rounded-[12px] border border-line p-2.5">
      <p className="mb-2 text-[12px] font-medium text-washi-muted">Atrezo · se queda en el escenario desde esta formación</p>
      <div className="flex flex-wrap gap-1.5">
        {PROP_KINDS.map((kind) => (
          <motion.button
            key={kind}
            type="button"
            disabled={disabled}
            onClick={() => onAdd(kind)}
            whileTap={disabled ? undefined : { scale: 0.9 }}
            transition={jelly}
            className={cn(tool, toolIdle)}
            aria-label={`Añadir ${PROP_LABELS[kind].toLowerCase()}`}
          >
            <svg viewBox="-0.9 -0.9 1.8 1.8" className="size-5" aria-hidden>
              <g transform={kind === 'bench' || kind === 'step' ? 'scale(0.9)' : 'scale(1.3)'}>
                <PropShape kind={kind} />
              </g>
            </svg>
            {PROP_LABELS[kind]}
          </motion.button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {prop && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={snappy}
            className="overflow-hidden"
          >
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <span className="mr-1 text-[13px] font-bold text-washi">{PROP_LABELS[prop.kind]}</span>
              <IconTool label={`Girar ${PROP_ROTATE_STEP}° a la izquierda`} disabled={disabled} onClick={() => onTurn(-PROP_ROTATE_STEP)}>
                <RotateCcw className="size-4" />
              </IconTool>
              <IconTool label={`Girar ${PROP_ROTATE_STEP}° a la derecha`} disabled={disabled} onClick={() => onTurn(PROP_ROTATE_STEP)}>
                <RotateCw className="size-4" />
              </IconTool>
              <button type="button" className={cn(tool, toolIdle)} disabled={disabled} onClick={onRemove}>
                <Trash2 className="size-4" /> Quitar desde aquí
              </button>
              <button type="button" className={cn(tool, toolIdle)} onClick={onClose}>
                <Check className="size-4" /> Listo
              </button>
              {prop.kind === 'mark' && (
                <label className="flex w-full items-center gap-2 text-[13px] text-washi-muted">
                  Texto
                  <input
                    key={`${prop.id}-${prop.label ?? ''}`}
                    type="text"
                    defaultValue={prop.label ?? ''}
                    maxLength={PROP_LABEL_MAX}
                    placeholder="Salida, foco, centro…"
                    disabled={disabled}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== (prop.label ?? '')) onRelabel(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="well h-11 min-w-0 flex-1 rounded-[10px] px-3 text-[14px] text-washi outline-none focus:border-kin-300/70"
                  />
                </label>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
