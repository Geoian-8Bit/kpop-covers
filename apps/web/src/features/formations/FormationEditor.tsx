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
  Timer,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
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
import { useStickyBarPadding } from '@/components/stickyBarPadding';
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
  nextIndex,
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
import { addPathPoint, convertPath, flipPath, movePathPoint, removePathPoint, setCurveShape, strokeToPath, type PathChoice } from './pathRules';
import {
  ChoiceGroup,
  Hint,
  IconTool,
  PanelHead,
  PathTools,
  PropTools,
  ToolDock,
  tool,
  toolIdle,
  toolOn,
  toolPrimary,
  useRevealStage,
  useSheetRoom,
  useWideLayout,
  type ToolTab,
} from './EditorTools';
import { PlanForm } from './PlanDialogs';
import {
  addPropFrom,
  newProp,
  patchProp,
  PROPS_MAX,
  relabelProp,
  removePropFrom,
} from './propRules';
import { RhythmPanel, RhythmUnderlay } from './RhythmPanel';
import { ExportDialog } from './export/ExportDialog';
import type { PlanSnapshot } from './export/exportStill';
import { PositionsList, StageView } from './StageView';
import { useFormationEditor, type SaveStatus } from './useFormationEditor';
import { useWaveform } from './useWaveform';
import { hasWebGL, NO_WEBGL } from './three/webgl';

/** REQ-13 · The 3D view, with three.js, only for whoever opens it (its own chunk, not in the precache). */
const Stage3D = lazy(() => import('./three/Stage3D'));


const NO_PEOPLE: FormationMember[] = [];
/** The sheet sits on the dock: 56 px tabs + its 1 px rule + the home bar. */
const DOCK_BOTTOM = 'calc(57px + env(safe-area-inset-bottom))';

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
  /**
   * The open tool tab. Upright phone: null = sheet closed. Side layout: always one (null shows «Formación»).
   * REQ-08 · «Recorridos» open: routes into the formation at the playhead, editable person by person.
   */
  const [tab, setTab] = useState<ToolTab | null>(null);
  const wide = useWideLayout();
  const shown: ToolTab | null = wide ? (tab ?? 'formation') : tab;
  const showPaths = shown === 'paths';
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const sheetOpen = !wide && tab != null;
  const room = useSheetRoom(stageBoxRef, dockRef, sheetOpen);
  useRevealStage(stageBoxRef, dockRef, sheetOpen);
  useStickyBarPadding(dockRef, !wide);
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
    // Contextual: choosing people brings their tools (in «Recorridos» a tap picks whose route to edit instead).
    if (ids.length && shown !== 'paths') setTab('people');
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

  // ── Tools: tabs, panel, and where they sit (REQ-06…13) ──
  const currentIndex = current ? list.indexOf(current) : -1;
  const nextAt = usePlayer((s) => nextIndex(list, s.time));
  const prevTarget = currentIndex >= 0 ? currentIndex - 1 : active;
  const goTo = (i: number) => {
    const f = list[i];
    if (!f) return;
    pause();
    usePlayer.getState().seek(f.at);
  };

  const panelBody = (which: ToolTab) => {
    switch (which) {
      case 'formation':
        return (
          <div className="space-y-2.5">
            <div className="flex gap-1.5">
              <motion.button
                type="button"
                onClick={addHere}
                disabled={conflict}
                whileTap={conflict ? undefined : { scale: 0.95 }}
                transition={jelly}
                className={cn(tool, toolPrimary, 'min-w-0 flex-1')}
              >
                <Plus className="size-4 shrink-0" aria-hidden /> <span className="truncate">Añadir formación aquí</span>
              </motion.button>
              <IconTool label="Duplicar la formación" onClick={duplicate} disabled={conflict || list.length === 0}>
                <Copy className="size-4" />
              </IconTool>
              <IconTool label="Borrar la formación de este momento" onClick={removeCurrent} disabled={conflict || !current}>
                <Trash2 className="size-4" />
              </IconTool>
            </div>
            {current ? (
              <>
                <label className="flex items-center gap-2 text-[13px] text-washi-muted">
                  <Timer className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">Transición desde la anterior</span>
                  <input
                    key={`${current.id}-${current.transition}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={TRANSITION_MAX}
                    step={0.5}
                    defaultValue={current.transition}
                    disabled={conflict}
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
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-washi-muted">
                    Nota de la formación {currentIndex + 1} ({formatMoment(current.at)})
                  </span>
                  <textarea
                    key={`${current.id}-${current.note ?? ''}`}
                    defaultValue={current.note ?? ''}
                    maxLength={NOTE_MAX}
                    rows={2}
                    disabled={conflict}
                    placeholder="Giro a la derecha, entra Ana por el fondo…"
                    onBlur={(e) => {
                      const note = e.target.value.trim() || null;
                      if (note !== (current.note ?? null)) patchCurrent({ note });
                    }}
                    className="well w-full resize-none rounded-[10px] px-3 py-2 text-[14px] text-washi outline-none focus:border-kin-300/70"
                  />
                </label>
              </>
            ) : (
              <Hint>
                {list.length
                  ? 'Aquí no hay formación: añade una, salta a otra con las flechas o arrastra a alguien para crearla en este momento.'
                  : 'Añade la primera formación, o arrastra a alguien en el escenario.'}
              </Hint>
            )}
          </div>
        );
      case 'people':
        return (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-washi-muted" aria-live="polite">
                {selection.length
                  ? `${selection.length} seleccionad${selection.length === 1 ? 'a' : 'as'}`
                  : selectMode
                    ? 'Toca a varias personas o arrastra un recuadro.'
                    : 'Toca a alguien para elegirle; «Varias» para elegir a más.'}
              </p>
              {selection.length > 0 && (
                <IconTool label="Quitar selección" onClick={() => setSelection([])}>
                  <X className="size-4" />
                </IconTool>
              )}
              <button
                type="button"
                aria-pressed={selectMode}
                onClick={() => setSelectMode((v) => !v)}
                className={cn(tool, selectMode ? toolOn : toolIdle)}
                title="Toca a varias personas o arrastra un recuadro"
              >
                <BoxSelect className="size-4" aria-hidden /> Varias
              </button>
              <button type="button" aria-pressed={snap} onClick={() => setSnap((v) => !v)} className={cn(tool, snap ? toolOn : toolIdle)} title="Encajar en la rejilla">
                <Grid3x3 className="size-4" aria-hidden /> Rejilla
              </button>
            </div>
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
                <Shuffle className="size-4" aria-hidden /> Intercambiar
              </button>
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-washi-muted">Plantillas {selection.length ? 'para la selección' : 'para todo el plan'}</p>
              <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] landscape:mx-0 landscape:flex-wrap landscape:px-0 lg:mx-0 lg:flex-wrap lg:px-0">
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
          </div>
        );
      case 'paths':
        return (
          <div className="space-y-2.5">
            <PathTools
              pathIndex={pathIndex}
              memberName={pathMember ? (people.get(pathMember)?.name ?? 'Alguien que ya no está') : null}
              path={pathEnds?.path}
              drawMode={drawMode}
              selectedHandle={selectedHandle}
              disabled={conflict}
              onChoose={choosePath}
              onShape={(shape) => {
                if (!pathEnds) return;
                pause();
                setSelectedHandle(null);
                setPath(setCurveShape(shape, pathEnds.from, pathEnds.to, pathEnds.path, stage));
              }}
              onFlip={() => pathEnds?.path && setPath(flipPath(pathEnds.from, pathEnds.to, pathEnds.path, stage))}
              onCancelDraw={() => setDrawMode(false)}
              onAddPoint={() => pathEnds && setPath(addPathPoint(pathEnds.from, pathEnds.to, pathEnds.path, stage))}
              onRemovePoint={() => {
                const path = pathEnds?.path;
                if (!path) return;
                setPath(removePathPoint(path, selectedHandle ?? path.points.length - 1));
                setSelectedHandle(null);
              }}
            />
            {clashes.length > 0 && <ClashNotice clashes={clashes} people={people} onSeek={seekClash} />}
          </div>
        );
      case 'props':
        return (
          <PropTools
            list={list}
            selectedProp={selectedProp}
            disabled={conflict}
            onAdd={addProp}
            onTurn={turnProp}
            onRemove={removeProp}
            onRelabel={(text) => selectedProp && ed.commit(relabelProp(list, selectedProp, text))}
            onClose={() => setSelectedProp(null)}
          />
        );
      case 'more':
        return (
          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">Vista</h3>
              <ChoiceGroup
                label="Vista del escenario"
                layoutId={`view-${ed.plan.id}`}
                value={mirrored ? 'dancers' : 'audience'}
                onChange={(v) => usePlayer.getState().setMirrored(v === 'dancers')}
                options={[
                  { value: 'audience', label: 'Desde el público' },
                  { value: 'dancers', label: 'Desde los bailarines' },
                ]}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" aria-pressed={ghost} onClick={() => setGhost((v) => !v)} className={cn(tool, ghost ? toolOn : toolIdle)} title="La siguiente formación, en tenue">
                  <Ghost className="size-4" aria-hidden /> Fantasma
                </button>
                <button
                  type="button"
                  aria-pressed={view3d}
                  disabled={!webgl}
                  title={webgl ? 'Ver el escenario en 3D (la vista 2D sigue siendo la de editar)' : NO_WEBGL}
                  onClick={() => setView3d((v) => !v)}
                  className={cn(tool, view3d ? toolOn : toolIdle)}
                >
                  <Box className="size-4" aria-hidden /> 3D
                </button>
                <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-washi-muted">
                  <span className="shrink-0">Mi recorrido</span>
                  <select
                    value={focusMember ?? ''}
                    onChange={(e) => setFocusMember(e.target.value || null)}
                    onFocus={() => {
                      if (focusMember == null && myId && memberIds.includes(myId)) setFocusMember(myId);
                    }}
                    className="well h-11 min-w-0 flex-1 rounded-[10px] px-2 text-[14px] text-washi outline-none"
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
              {!webgl && <Hint>{NO_WEBGL}</Hint>}
              {view3d && <Hint>Para mover a alguien, vuelve a la vista 2D.</Hint>}
            </section>
            <section className="space-y-2">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">Compartir</h3>
              <button type="button" className={cn(tool, toolIdle, 'w-full')} onClick={() => setExporting(true)}>
                <Download className="size-4" aria-hidden /> Exportar imagen, PDF o vídeo
              </button>
            </section>
            <section className="space-y-2">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">Ritmo · cuentas de 8</h3>
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
            </section>
          </div>
        );
    }
  };

  const panelHead = (which: ToolTab, onClose?: () => void) => (
    <PanelHead
      tab={which}
      list={list}
      currentIndex={currentIndex}
      canPrev={prevTarget >= 0}
      canNext={nextAt >= 0}
      onPrev={() => goTo(prevTarget)}
      onNext={() => goTo(nextAt)}
      onClose={onClose}
    />
  );

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

      {/*
        Upright phone: a column (player, stage, timeline) where the stage sticks under the top bar, and the tools in a
        dock + sheet at the bottom. On its side or a big screen: the stage sticks on the left, the rest on the right.
        A flex column (not a grid) upright: a sticky grid item could only move inside its own row.
      */}
      <div className="flex flex-col gap-3 px-3 pb-3 pt-3 sm:px-5 landscape:grid landscape:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] landscape:items-start landscape:gap-x-4 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-x-5">
        <div className="mx-auto w-[60%] max-w-[420px] landscape:col-start-2 landscape:row-start-1 landscape:w-full landscape:max-w-none lg:col-start-2 lg:row-start-1 lg:w-full lg:max-w-none">
          {playerStage}
        </div>

        <div
          ref={stageBoxRef}
          className="sticky top-16 z-20 -mx-3 bg-sumi-850 px-3 py-1.5 shadow-[0_14px_18px_-16px_rgb(0_0_0/0.9)] sm:-mx-5 sm:px-5 landscape:col-start-1 landscape:row-span-4 landscape:row-start-1 landscape:mx-0 landscape:bg-transparent landscape:px-0 landscape:py-0 landscape:shadow-none lg:top-3 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:mx-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none"
        >
          <div className="relative mx-auto landscape:max-w-[min(100%,calc((100dvh-84px)*1.23))]">
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
                  if (id) {
                    setSelection([]);
                    setTab('props');
                  }
                }}
                onMoveProp={(id, to) => editProps((props) => patchProp(props, id, to, stage))}
                locked={conflict}
              />
            )}
            {/* Overlays: the note of the moment, the clashes (a jump to the first), the first formation. */}
            {activeNote && (
              <p
                className="pointer-events-none absolute inset-x-2 bottom-1 line-clamp-1 rounded-[8px] bg-ai-700/85 px-2.5 py-1 text-center text-[12px] text-ai-100 shadow-[0_6px_14px_-8px_rgb(0_0_0/0.9)]"
                aria-live="polite"
              >
                {activeNote}
              </p>
            )}
            {clashes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  seekClash(clashes[0]!);
                  setTab('paths');
                }}
                className="absolute right-1 top-0 flex h-11 items-center gap-1 rounded-[10px] px-2 text-[12px] font-bold text-shu-300 before:absolute before:inset-x-0 before:inset-y-1.5 before:-z-10 before:rounded-[8px] before:border before:border-shu-500/50 before:bg-sumi-900/90 before:content-[''] isolate"
              >
                <AlertTriangle className="size-4" aria-hidden />
                {clashes.length === 1 ? '1 choque' : `${clashes.length} choques`}
              </button>
            )}
            {list.length === 0 && (
              <div className="absolute inset-x-0 bottom-[14%] flex justify-center">
                <Button size="md" onClick={addHere} disabled={conflict}>
                  <Plus className="size-4" /> Añade la primera formación
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="-mx-3 min-w-0 sm:-mx-5 landscape:col-start-2 landscape:mx-0 lg:col-start-2 lg:mx-0">
          <FormationTimeline
            list={list}
            selectedId={selectedId}
            onMoveMarker={moveMarker}
            clashes={ranges}
            locked={conflict}
            underlay={(span) => <RhythmUnderlay span={span} bpm={ed.plan.bpm} firstBeat={ed.plan.first_beat} wave={playsFile ? wave : null} />}
          />
          <FormationTransport />
          {archivedHere.length > 0 && (
            <p className="px-3 text-[12px] text-washi-subtle sm:px-5">En gris: {archivedHere.map((p) => p.name).join(', ')} (ya no está en el grupo).</p>
          )}
        </div>

        {wide && shown && (
          <section className="min-w-0 space-y-2 landscape:col-start-2 lg:col-start-2" aria-label="Herramientas">
            <ToolDock tab={shown} wide onTab={(t) => setTab(t)} dockRef={dockRef} badges={{ paths: clashes.length > 0 }} />
            <div id="tool-panel" role="tabpanel" aria-labelledby={`tool-tab-${shown}`} className="rounded-[12px] border border-line bg-sumi-900/60">
              {panelHead(shown)}
              <div className="px-3 pb-3">{panelBody(shown)}</div>
            </div>
          </section>
        )}

        <div className="-mx-3 sm:-mx-5 landscape:col-start-2 landscape:mx-0 lg:col-start-2 lg:mx-0">
          <PositionsList list={list} memberIds={memberIds} people={people} stage={stage} index={active} />
        </div>

        {/* Upright: room to scroll the stage up to where it sticks, and for the end of the page above the dock/sheet. */}
        {!wide && <div aria-hidden style={{ height: tab ? '62dvh' : 'calc(64px + env(safe-area-inset-bottom))' }} />}
      </div>

      {!wide && (
        <>
          <AnimatePresence>
            {tab && (
              <motion.section
                key="sheet"
                id="tool-panel"
                role="tabpanel"
                aria-labelledby={`tool-tab-${tab}`}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0, transition: { duration: 0.14 } }}
                transition={snappy}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setTab(null);
                }}
                style={{ bottom: DOCK_BOTTOM, maxHeight: room }}
                className="fixed inset-x-0 z-30 mx-auto flex max-w-[560px] flex-col rounded-t-[16px] border border-b-0 border-line-strong bg-sumi-900 shadow-[0_-18px_36px_-18px_rgb(0_0_0/0.9)]"
              >
                <div className="sep-b shrink-0">{panelHead(tab, () => setTab(null))}</div>
                <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 pt-2.5">{panelBody(tab)}</div>
              </motion.section>
            )}
          </AnimatePresence>
          <ToolDock tab={tab} wide={false} onTab={(t) => setTab((open) => (open === t ? null : t))} dockRef={dockRef} badges={{ paths: clashes.length > 0 }} />
        </>
      )}

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
