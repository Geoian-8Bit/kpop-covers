import type { Clip } from '@coverscape/shared';
import { Info, Settings2, SunMedium, SwitchCamera, Timer, Zap, ZapOff } from 'lucide-react';
import { memo } from 'react';
import { StartButton } from '../StartPicker';
import type { StartChoice } from '../startRules';
import { preloadImageControls, preloadInfoPanel, preloadSettings, preloadStartList } from './lazyPanels';
import { RailButton } from './RailButton';
import type { Phase, TimerSeconds } from './types';

/** Tools rail, like TikTok's: right side upright, left side when the phone is turned. */
export const ToolsRail = memo(function ToolsRail({
  phase,
  canTweak,
  canChangeCamera,
  timer,
  torchAvailable,
  torch,
  flashElsewhere,
  noTorchHint,
  startShown,
  startChoice,
  startListOpen,
  hasImageControls,
  settingsAllowed,
  imageOpen,
  settingsOpen,
  infoShown,
  infoOpen,
  onFlip,
  onExplainLock,
  onTimer,
  onTorch,
  onNoTorch,
  onStartTap,
  onStartList,
  onImage,
  onSettings,
  onInfo,
}: {
  phase: Phase;
  canTweak: boolean;
  canChangeCamera: boolean;
  timer: TimerSeconds;
  torchAvailable: boolean;
  torch: boolean;
  flashElsewhere: boolean;
  noTorchHint: string | null;
  startShown: boolean;
  startChoice: StartChoice;
  startListOpen: boolean;
  hasImageControls: boolean;
  settingsAllowed: boolean;
  imageOpen: boolean;
  settingsOpen: boolean;
  infoShown: boolean;
  infoOpen: boolean;
  onFlip: () => void;
  onExplainLock: () => void;
  onTimer: () => void;
  onTorch: () => void;
  onNoTorch: () => void;
  onStartTap: () => void;
  onStartList: () => void;
  onImage: () => void;
  onSettings: () => void;
  onInfo: () => void;
}) {
  return (
    <div className="absolute right-[max(10px,env(safe-area-inset-right))] top-[calc(max(14px,env(safe-area-inset-top))+64px)] z-10 flex flex-col gap-3 landscape:bottom-[max(10px,env(safe-area-inset-bottom))] landscape:left-[max(10px,env(safe-area-inset-left))] landscape:right-auto landscape:flex-wrap landscape:content-start landscape:gap-x-2 landscape:gap-y-2">
      {/* Turned phones are ~360 px tall: the rail wraps into a second column instead of running off. */}
      {canTweak && (
        <RailButton
          label="Girar"
          ariaLabel="Girar la cámara"
          muted={!canChangeCamera}
          onClick={canChangeCamera ? onFlip : onExplainLock}
        >
          <SwitchCamera className="size-5" />
        </RailButton>
      )}
      {canTweak && (
        <RailButton
          label={timer ? `${timer} s` : 'Sin'}
          ariaLabel={`Cuenta atrás: ${timer ? `${timer} segundos` : 'sin cuenta'}`}
          onClick={onTimer}
        >
          <Timer className="size-5" />
        </RailButton>
      )}
      {(torchAvailable || flashElsewhere) && (
        // P23 · The flash lives on one rear camera: on another lens it shows muted and its tap says which one.
        <RailButton
          label="Flash"
          ariaLabel={
            torchAvailable
              ? torch
                ? 'Apagar el flash'
                : 'Encender el flash'
              : `Flash no disponible: ${noTorchHint ?? 'esta lente no tiene flash.'}`
          }
          pressed={torchAvailable && torch}
          muted={!torchAvailable}
          onClick={torchAvailable ? onTorch : onNoTorch}
        >
          {torch ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
        </RailButton>
      )}
      {phase === 'idle' && startShown && (
        <StartButton
          choice={startChoice}
          listOpen={startListOpen}
          onTap={onStartTap}
          onOpenList={onStartList}
          onWarm={preloadStartList}
        />
      )}
      {/* P27: «Imagen» lives in the settings fan; during a take (no settings then) it stays here. */}
      {hasImageControls && !settingsAllowed && (
        <RailButton
          label="Imagen"
          ariaLabel="Luz, color y enfoque"
          expanded={imageOpen}
          onClick={onImage}
          onPointerDown={preloadImageControls}
        >
          <SunMedium className="size-5" />
        </RailButton>
      )}
      {settingsAllowed && (
        <RailButton
          label="Ajustes"
          ariaLabel="Ajustes del grabador"
          expanded={settingsOpen}
          onClick={onSettings}
          onPointerDown={warmSettings}
        >
          <Settings2 className="size-5" />
        </RailButton>
      )}
      {canTweak && infoShown && (
        <RailButton
          label="Info"
          ariaLabel="Información técnica de la cámara"
          expanded={infoOpen}
          onClick={onInfo}
          onPointerDown={preloadInfoPanel}
        >
          <Info className="size-5" />
        </RailButton>
      )}
    </div>
  );
});

/** P22 · The start button is shown when there is a choice: several kinds of start, or the song's clips. */
export const startButtonShown = (options: number, clips: Clip[] | undefined) =>
  options > 1 || (clips?.length ?? 0) > 0;

/** The settings fan can open «Imagen» from inside it: both are fetched as the finger lands on «Ajustes». */
export function warmSettings(): void {
  preloadSettings();
  preloadImageControls();
}
