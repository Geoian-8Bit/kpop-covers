import type { FormationPositions, Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Plus, Redo2, Settings2, Undo2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { snappy } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { activeIndex, formationAt, nextIndex, sortKeyframes, type Stage } from './formationRules';
import { FormationTimeline } from './FormationTimeline';
import { movePathPoint } from './pathRules';
import { PanelHead, ToolDock, useRevealStage, useSheetRoom, useWideLayout, type ToolTab } from './EditorTools';
import { PlanForm } from './PlanDialogs';
import { patchProp } from './propRules';
import { RhythmUnderlay } from './RhythmPanel';
import { ExportDialog } from './export/ExportDialog';
import type { PlanSnapshot } from './export/exportStill';
import { StageView } from './StageView';
import { PositionsList } from './stage/PositionsList';
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
    playsFile,
    wave,
    savePlan,
    toast,
  };
  const panelBody = (which: ToolTab) => <ToolPanelBody which={which} {...panelProps} />;

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
