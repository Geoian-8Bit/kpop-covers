import type { FormationPositions, Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Redo2, Undo2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Page } from '@/components/AppShell';
import {
  CONFLICT_MESSAGE,
  useFormationMembers,
  useFormationPlan,
  type FormationMember,
  type FormationPlanFull,
} from '@/data/formations';
import { useIdentity } from '@/data/members';
import { FormationTransport } from '@/features/studio/Transport';
import { useShortcuts } from '@/features/studio/useShortcuts';
import { useStickyBarPadding } from '@/components/stickyBarPadding';
import { cn } from '@/lib/cn';
import { snappy } from '@/lib/motion';
import { useDesktop } from '@/lib/useDesktop';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { activeIndex, formationAt, nextIndex, sortKeyframes, type Stage } from './formationRules';
import { FormationTimeline } from './FormationTimeline';
import { bendThrough, movePathPoint } from './pathRules';
import { PanelHead, ToolDock, useSheetRoom, useWideLayout, type ToolTab } from './EditorTools';
import { PlanForm } from './PlanDialogs';
import { patchProp } from './propRules';
import { RhythmUnderlay } from './RhythmPanel';
import { ExportDialog } from './export/ExportDialog';
import type { PlanSnapshot } from './export/exportStill';
import { StageView } from './StageView';
import { PositionsList } from './stage/PositionsList';
import { AUDIENCE, PAD } from './stage/stageDrag';
import { useFormationEditor } from './useFormationEditor';
import { useWaveform } from './useWaveform';
import { hasWebGL } from './three/webgl';
import { EditorHeader, SaveBadge } from './editor/EditorHeader';
import { ToolPanelBody, type ToolPanelBodyProps } from './editor/ToolPanelBody';
import { useEditorActions } from './editor/useEditorActions';
import { usePathEditing } from './editor/usePathEditing';
import { useUndoKeys } from './editor/useUndoKeys';

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
    // Phones and tablets: the editor is exactly the screen under the shell's top bar (h-16 + its 1 px rule), so nothing
    // scrolls the page while editing. Desktop keeps a page that scrolls.
    <Page className="p-1.5 max-lg:h-[calc(100dvh-65px)] sm:p-2.5 lg:px-6 lg:py-6">
      <div className="paper mx-auto max-w-[1500px] rounded-[10px] max-lg:h-full max-lg:overflow-hidden sm:rounded-[12px]">
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
  /** Width / height of the drawn stage (StageView's viewBox): its box keeps that shape. */
  const stageRatio = (stage.width + PAD * 2) / (stage.depth + PAD + AUDIENCE);
  const memberIds = ed.members;
  const list = ed.list;

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
  const desktop = useDesktop();
  /** A phone (or tablet) on its side: the open tool takes the place of the timeline in the right column. */
  const side = wide && !desktop;
  const shown: ToolTab | null = desktop ? (tab ?? 'formation') : tab;
  const showPaths = shown === 'paths';
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const sheetOpen = !wide && tab != null;
  const sideOpen = side && tab != null;
  /** Phones: tapping the open tab closes it. Desktop: a tab is always open. */
  const onTab = (t: ToolTab) => (desktop ? setTab(t) : setTab((open) => (open === t ? null : t)));
  const room = useSheetRoom(stageBoxRef, dockRef, sheetOpen);
  useStickyBarPadding(dockRef, !wide);
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
  // REQ-30 · Adjusted while rendering (React's pattern for state that follows a prop) instead of in an effect.
  const [selectionMembers, setSelectionMembers] = useState(memberIds);
  if (selectionMembers !== memberIds) {
    setSelectionMembers(memberIds);
    setSelection((sel) => sel.filter((id) => memberIds.includes(id)));
  }

  useShortcuts({ onSave: noop, onHelp: noop, onNote: noop, enabled: !settings });

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (and Ctrl+Y): undo and redo the editing session.
  const { undo, redo } = ed;
  useUndoKeys(undo, redo);

  const actions = useEditorActions({ ed, list, memberIds, stage, toast, current, active, selectedProp, setSelectedProp, setSelection });
  const { pause, fullPositions, editPositions, editProps, addHere, moveMarker } = actions;

  // ── REQ-08 · Paths and clashes ──
  const paths = usePathEditing({ ed, list, memberIds, stage, current, selection, showPaths, fullPositions, pause, toast });
  const { clashes, ranges, pathIndex, pathMember, pathEnds, drawMode, selectedHandle, setSelectedHandle, setPath, onStroke, seekClash } = paths;

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
    list: sortKeyframes(list),
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

  const panelProps: Omit<ToolPanelBodyProps, 'which'> = {
    ed,
    actions,
    paths,
    list,
    current,
    currentIndex,
    conflict,
    stage,
    people,
    memberIds,
    myId,
    selection,
    setSelection,
    selectMode,
    setSelectMode,
    snap,
    setSnap,
    targets,
    applySelection,
    selectedProp,
    setSelectedProp,
    mirrored,
    ghost,
    setGhost,
    view3d,
    setView3d,
    webgl,
    focusMember,
    setFocusMember,
    setExporting,
    openSettings: () => setSettings(true),
    playsFile,
    wave,
    savePlan,
    toast,
  };
  const panelBody = (which: ToolTab) => (
    <>
      <ToolPanelBody which={which} {...panelProps} />
      {/* Phones have no room under the stage: the text alternative folds inside «Posiciones». */}
      {which === 'people' && !desktop && (
        <div className="-mx-4 mt-1 sm:-mx-5">
          <PositionsList list={list} memberIds={memberIds} people={people} stage={stage} index={active} />
        </div>
      )}
    </>
  );

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
      {/*
        Phones and tablets fill the screen, nothing scrolls the page. Upright: a column (header, player, stage, timeline)
        with the tools in a dock + sheet at the bottom; the player folds away while a sheet is open. On its side: three
        columns (the player small, the stage as tall as the screen, and header · timeline · dock), the open tool taking
        the timeline's place, so everything essential is on screen without scrolling. Desktop: the stage sticks on the
        left of a page that scrolls, the rest on the right with a tool always open.
      */}
      <div
        style={{ '--stage-ratio': stageRatio } as CSSProperties}
        className="max-lg:flex max-lg:h-full max-lg:flex-col max-lg:landscape:grid max-lg:landscape:grid-cols-[minmax(88px,120px)_minmax(0,1fr)_minmax(340px,46%)] max-lg:landscape:grid-rows-[auto_auto_minmax(0,1fr)_auto]"
      >
      <EditorHeader
        back={back}
        title={ed.plan.name}
        subtitle={video.title}
        status={<SaveBadge status={ed.status} onRetry={ed.retry} />}
        className="shrink-0 max-lg:landscape:col-start-3 max-lg:landscape:row-start-1"
      >
        <Button variant="ghost" size="icon" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled={!ed.canUndo || conflict} onClick={ed.undo}>
          <Undo2 className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Rehacer" title="Rehacer (Ctrl+Mayús+Z)" disabled={!ed.canRedo || conflict} onClick={ed.redo}>
          <Redo2 className="size-5" />
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
            className="shrink-0 overflow-hidden max-lg:landscape:col-start-3 max-lg:landscape:row-start-2"
          >
            <div className="m-2 flex flex-wrap items-center gap-2 rounded-[12px] border border-enji-400/60 bg-enji-700/30 p-2.5 sm:mx-5">
              <AlertTriangle className="size-5 shrink-0 text-enji-300" />
              <p className="min-w-0 flex-1 text-[13px] text-washi">
                <span className="font-bold">{CONFLICT_MESSAGE}.</span> Tus últimos cambios no se han guardado.
              </p>
              <Button size="sm" className="h-11" onClick={() => void ed.reload()}>
                Recargar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upright: a flex column. On its side its boxes join the grid above (`contents`). */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pt-1.5 max-lg:pb-[calc(56px+env(safe-area-inset-bottom))] sm:px-4 max-lg:landscape:contents lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-x-5 lg:p-5">
        {/* The stage fits its box both ways (a size container): as wide as the phone, or as tall as the room left. */}
        <div
          className={cn(
            'flex min-h-0 flex-1 items-start justify-center [container-type:size] max-lg:landscape:col-start-2 max-lg:landscape:row-span-4 max-lg:landscape:row-start-1 max-lg:landscape:items-center max-lg:landscape:py-2 lg:sticky lg:top-3 lg:z-20 lg:col-start-1 lg:row-start-1 lg:block lg:[container-type:normal]',
            // A sheet open upright: a big (tablet) stage leaves it at least half the screen.
            sheetOpen && 'max-h-[52dvh]',
          )}
        >
          <div
            ref={stageBoxRef}
            className="relative w-[min(100cqw,calc(100cqh*var(--stage-ratio)))] lg:mx-auto lg:w-full lg:landscape:max-w-[min(100%,calc((100dvh-84px)*1.23))]"
          >
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
                onBendStraight={(through) => {
                  if (pathEnds && !pathEnds.path) setPath(bendThrough(pathEnds.from, pathEnds.to, through, stage));
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
            {/* Overlays: the note of the moment (over the audience strip) and the clashes (a jump to the first). */}
            {activeNote && (
              <p
                className="pointer-events-none absolute inset-x-2 bottom-1 rounded-[8px] bg-ai-700/90 px-2.5 py-1 text-center text-[12px] leading-snug text-ai-100"
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
          </div>
        </div>

        {/* Upright its boxes are the column's own (`contents`, the player first); on its side they take grid cells. */}
        <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
        <motion.div
          initial={false}
          animate={sheetOpen ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
          transition={snappy}
          className={cn(
            'order-first shrink-0 max-lg:landscape:col-start-1 max-lg:landscape:row-span-4 max-lg:landscape:row-start-1 max-lg:landscape:self-start max-lg:landscape:pl-2 max-lg:landscape:pt-2',
            sheetOpen && 'overflow-hidden',
          )}
        >
          <div className="mx-auto w-[56%] max-w-[420px] max-lg:landscape:w-full lg:w-full lg:max-w-none">{playerStage}</div>
        </motion.div>

        <div
          className={cn(
            'order-last -mx-2 min-w-0 shrink-0 sm:-mx-4 max-lg:landscape:col-start-3 max-lg:landscape:row-start-3 max-lg:landscape:mx-0 max-lg:landscape:min-h-0 max-lg:landscape:overflow-y-auto max-lg:landscape:overscroll-contain lg:order-none lg:mx-0',
            sideOpen && 'max-lg:landscape:hidden',
          )}
        >
          <FormationTimeline
            list={list}
            selectedId={selectedId}
            onMoveMarker={moveMarker}
            clashes={ranges}
            locked={conflict}
            onAdd={addHere}
            onOpenMarker={() => {
              setTab('formation');
              // Once the panel is open: straight into the note.
              window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-formation-note]')?.focus({ preventScroll: true }), 260);
            }}
            underlay={(view) => <RhythmUnderlay view={view} bpm={ed.plan.bpm} firstBeat={ed.plan.first_beat} wave={playsFile ? wave : null} />}
          />
          <FormationTransport />
          {archivedHere.length > 0 && (
            <p className="px-3 text-[12px] text-washi-subtle sm:px-5">En gris: {archivedHere.map((p) => p.name).join(', ')} (ya no está en el grupo).</p>
          )}
        </div>

        {sideOpen && tab && (
          <section
            id="tool-panel"
            role="tabpanel"
            aria-labelledby={`tool-tab-${tab}`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setTab(null);
            }}
            className="flex min-h-0 flex-col max-lg:landscape:col-start-3 max-lg:landscape:row-start-3"
          >
            <div className="sep-b shrink-0">{panelHead(tab, () => setTab(null))}</div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 pt-2">{panelBody(tab)}</div>
          </section>
        )}

        {side && (
          <div className="px-2 pb-1.5 pt-1 max-lg:landscape:col-start-3 max-lg:landscape:row-start-4">
            <ToolDock tab={tab} wide onTab={onTab} dockRef={dockRef} badges={{ paths: clashes.length > 0 }} />
          </div>
        )}

        {desktop && shown && (
          <section className="min-w-0 space-y-2" aria-label="Herramientas">
            <ToolDock tab={shown} wide onTab={onTab} dockRef={dockRef} badges={{ paths: clashes.length > 0 }} />
            <div id="tool-panel" role="tabpanel" aria-labelledby={`tool-tab-${shown}`} className="rounded-[12px] border border-line bg-sumi-900/60">
              {panelHead(shown)}
              <div className="px-3 pb-3">{panelBody(shown)}</div>
            </div>
          </section>
        )}

        {/* Phones keep it inside «Posiciones» (see panelBody). */}
        {desktop && <PositionsList list={list} memberIds={memberIds} people={people} stage={stage} index={active} />}
        </div>
      </div>
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
          <ToolDock tab={tab} wide={false} onTab={onTab} dockRef={dockRef} badges={{ paths: clashes.length > 0 }} />
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
