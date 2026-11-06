import type { FormationPositions } from '@coverscape/shared';
import { motion } from 'motion/react';
import {
  Box,
  BoxSelect,
  Copy,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Ghost,
  Grid3x3,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  RotateCw,
  Shuffle,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { FormationInput, FormationMember } from '@/data/formations';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { usePlayer } from '@/player/store';
import type { useToast } from '@/providers/ToastProvider';
import { snapFormationsToBeats } from '../beatRules';
import { applyTemplate, flipHorizontal, flipVertical, rotate, ROTATE_STEP, scale, swap, TEMPLATES } from '../formationEditRules';
import { formatMoment, NOTE_MAX, TRANSITION_MAX, type Stage } from '../formationRules';
import { addPathPoint, BEND_MIN, flipPath, removePathPoint, setCurveShape } from '../pathRules';
import { ChoiceGroup, Hint, IconTool, PropTools, tool, toolIdle, toolOn, toolPrimary, type ToolTab } from '../EditorTools';
import { relabelProp } from '../propRules';
import { RhythmPanel } from '../RhythmPanel';
import type { FormationEditorState } from '../useFormationEditor';
import type { useWaveform } from '../useWaveform';
import { NO_WEBGL } from '../three/webgl';
import { ClashNotice, TemplateButton } from './panelParts';
import { PathTools } from './PathTools';
import type { useEditorActions } from './useEditorActions';
import type { usePathEditing } from './usePathEditing';

export interface ToolPanelBodyProps {
  which: ToolTab;
  ed: FormationEditorState;
  actions: ReturnType<typeof useEditorActions>;
  paths: ReturnType<typeof usePathEditing>;
  list: FormationInput[];
  current: FormationInput | null;
  currentIndex: number;
  conflict: boolean;
  stage: Stage;
  people: Map<string, FormationMember>;
  memberIds: string[];
  myId: string | null;
  selection: string[];
  setSelection: Dispatch<SetStateAction<string[]>>;
  selectMode: boolean;
  setSelectMode: Dispatch<SetStateAction<boolean>>;
  snap: boolean;
  setSnap: Dispatch<SetStateAction<boolean>>;
  targets: string[];
  applySelection: (fn: (ids: string[], p: FormationPositions) => FormationPositions) => void;
  selectedProp: string | null;
  setSelectedProp: Dispatch<SetStateAction<string | null>>;
  mirrored: boolean;
  ghost: boolean;
  setGhost: Dispatch<SetStateAction<boolean>>;
  view3d: boolean;
  setView3d: Dispatch<SetStateAction<boolean>>;
  webgl: boolean;
  focusMember: string | null;
  setFocusMember: Dispatch<SetStateAction<string | null>>;
  setExporting: Dispatch<SetStateAction<boolean>>;
  playsFile: boolean;
  wave: ReturnType<typeof useWaveform>;
  savePlan: (patch: Parameters<FormationEditorState['updatePlan']>[0]) => Promise<boolean>;
  toast: ReturnType<typeof useToast>;
}

/**
 * REQ-27 · The body of the open tool tab, moved out of FormationEditor as is. One component for every tab, so React
 * reconciles the panel exactly as when it was an inline switch.
 */
export function ToolPanelBody({
  which,
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
}: ToolPanelBodyProps) {
  const { pause, editPositions, addHere, duplicate, removeCurrent, patchCurrent, addProp, turnProp, removeProp } = actions;
  const { pathIndex, pathMember, pathEnds, drawMode, setDrawMode, selectedHandle, setSelectedHandle, setPath, choosePath, clashes, seekClash } = paths;
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
                  data-formation-note
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
            canBend={pathEnds != null && Math.hypot(pathEnds.to.x - pathEnds.from.x, pathEnds.to.y - pathEnds.from.y) >= BEND_MIN}
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
}
