import {
  cameraRequest,
  capRequest,
  QUALITY_LABEL,
  resolutionClass,
  resolutionLabel,
  sizeCapped,
  type PaceCap,
  type ResolutionChoice,
} from '@coverscape/shared';
import { forgetPaceFps, forgetPaceSize, usePaceCap } from '../pace';
import { useRecordSettings, type RecordSettings } from '../settings';
import { clampTrim, MAX_TRIM_MS, TRIM_STEP_MS, trimLabel } from '../syncRules';

/** Props of the recorder's settings panel (A1). */
export interface RecorderSettingsProps {
  open: boolean;
  onClose: () => void;
  /** The biggest picture this camera gives; null while unknown (every size is offered). */
  maxSize: { width: number; height: number } | null;
  /** The camera's highest frame rate; null while unknown. */
  maxFps: number | null;
  /** The song's own sound can be recorded (files yes, YouTube no). */
  songPossible: boolean;
  /** What the take will be, e.g. «1080p · 60 · Alta». */
  summary: string;
  /** P26 · Open straight on one group (the chip opens «Calidad» only): no fan, closing closes everything. */
  only?: 'quality' | null;
  /**
   * P27 · «Imagen» (light, colour of the light, focus): offered when this camera has any of them. Its stick opens
   * the recorder's image panel.
   */
  image?: { summary: string; onOpen: () => void } | null;
}

export type FieldKey =
  | 'quality'
  | 'resolution'
  | 'fps'
  | 'codec'
  | 'mode'
  | 'sound'
  | 'micChannels'
  | 'clapSensitivity'
  | 'syncTrim'
  | 'grid'
  | 'level'
  | 'info';

export interface ChoiceOption {
  value: string;
  label: string;
  /** Read by screen readers instead of the short label («60» → «60 fotogramas por segundo»). */
  ariaLabel?: string;
  disabled?: boolean;
}

interface FieldBase {
  key: FieldKey;
  label: string;
  /** One short line on what the current value does. */
  help: string;
  /** Why an option is off, or a caveat for this phone. */
  note?: string;
  /** A button after the note (e.g. «Volver a probar 4K»). */
  noteAction?: { label: string; run(): void };
  /** The value in a few characters, for summaries. */
  display: string;
}

export interface ChoiceField extends FieldBase {
  kind: 'choice';
  options: ChoiceOption[];
  /** null when the stored value is not offered by this camera. */
  value: string | null;
  select(value: string): void;
}

export interface SwitchField extends FieldBase {
  kind: 'switch';
  value: boolean;
  toggle(): void;
}

/** 43 · A number moved in steps with − and + (the sync fine adjustment). */
export interface StepperField extends FieldBase {
  kind: 'stepper';
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as said («+30 ms»). */
  valueText: string;
  /** What − and + do, for screen readers. */
  decreaseLabel: string;
  increaseLabel: string;
  set(value: number): void;
}

export type Field = ChoiceField | SwitchField | StepperField;

export interface Fields {
  quality: ChoiceField;
  resolution: ChoiceField;
  fps: ChoiceField;
  codec: ChoiceField;
  mode: ChoiceField;
  sound: ChoiceField;
  micChannels: ChoiceField;
  clapSensitivity: ChoiceField;
  syncTrim: StepperField;
  grid: SwitchField;
  level: SwitchField;
  info: SwitchField;
}

const patch = (p: Partial<RecordSettings>) => useRecordSettings.getState().set(p);

const QUALITY_HELP: Record<RecordSettings['quality'], string> = {
  saver: '720p a 30 fps. Pesa poco: unos 40 MB por minuto.',
  high: '1080p, a 60 si la cámara puede. Unos 135 MB por minuto.',
  max: '4K si se puede, a 30 fps. Unos 300 MB por minuto; calienta el móvil.',
  auto: 'Lo mejor que este móvil graba sin cortes.',
};

export const CLAP_LABEL: Record<RecordSettings['clapSensitivity'], string> = { low: 'Baja', medium: 'Media', high: 'Alta' };

// P42 · The F7 levels and their words, as before P21.
const CLAP_HELP: Record<RecordSettings['clapSensitivity'], string> = {
  low: 'Solo palmadas fuertes y claras: para salas con eco o ruido.',
  medium: 'Dos palmadas normales a unos metros del móvil.',
  high: 'Oye palmadas suaves o lejanas; en una sala ruidosa puede saltar sola.',
};

/**
 * P19 review · The size these settings ask for is above the size this phone was found to keep up with: the note
 * says what is recorded instead, and choosing a size again (or its button) tries it afresh.
 */
function sizeCapNote(s: RecordSettings, cap: PaceCap): string | undefined {
  const asked = cameraRequest(s);
  if (!sizeCapped(asked, cap)) return undefined;
  const got = capRequest(asked, cap);
  return `Este móvil no fue fluido en ${resolutionLabel(asked.width, asked.height)}: se graba en ${resolutionLabel(got.width, got.height)}.`;
}

/** Choosing settings that ask for more than the learnt ceiling forgets it (the next measurement judges again). */
function forgetCapIfAbove(next: RecordSettings, cap: PaceCap): void {
  if (sizeCapped(cameraRequest(next), cap)) forgetPaceSize();
}

const RES_RANK: Record<Exclude<ResolutionChoice, 'auto'>, number> = { '720p': 0, '1080p': 1, '1440p': 2, '4k': 3 };
const RES_LABEL: Record<ResolutionChoice, string> = {
  auto: 'Auto',
  '4k': '4K',
  '1440p': '1440p',
  '1080p': '1080p',
  '720p': '720p',
};

/** Every setting of the panel, read from and written to `useRecordSettings` (remembered on this phone). */
export function useSettingsFields({
  maxSize,
  maxFps,
  songPossible,
}: Pick<RecorderSettingsProps, 'maxSize' | 'maxFps' | 'songPossible'>): Fields {
  const s = useRecordSettings();

  // Resolution: only what the camera can give.
  const maxRank = maxSize ? RES_RANK[resolutionClass(maxSize.width, maxSize.height)] : 3;
  const resChoices = (['auto', '4k', '1440p', '1080p', '720p'] as const).filter(
    (r) => r === 'auto' || RES_RANK[r] <= maxRank,
  );
  const resHidden = s.resolution !== 'auto' && !resChoices.includes(s.resolution);
  const someHidden = resChoices.length < 5;

  // Frame rate: 60 only when the camera gives it.
  const no60 = maxFps != null && maxFps < 50;
  const fpsNow = no60 ? 30 : s.fps;
  const fourK = s.resolution === '4k' || (s.resolution === 'auto' && s.quality === 'max');
  // P19: 60 that this phone didn't keep up with is recorded at 30 (shown as such).
  const cap = usePaceCap((x) => x.cap);
  const paced30 = !no60 && !fourK && s.fps === 60 && capRequest(cameraRequest(s), cap).fps === 30;
  const fpsShown = paced30 ? 30 : fpsNow;
  const capNote = sizeCapNote(s, cap);
  const retrySize = capNote ? { label: 'Volver a probar', run: forgetPaceSize } : undefined;

  // Sound: YouTube never lets its own sound be recorded.
  const soundNow = songPossible ? s.sound : 'mic';

  return {
    quality: {
      kind: 'choice',
      key: 'quality',
      label: 'Calidad',
      help: QUALITY_HELP[s.quality],
      // The size follows the quality only with «Auto» resolution: then the ceiling is this field's business.
      note: s.resolution === 'auto' ? capNote : undefined,
      noteAction: s.resolution === 'auto' ? retrySize : undefined,
      display: QUALITY_LABEL[s.quality],
      value: s.quality,
      options: (['saver', 'high', 'max', 'auto'] as const).map((q) => ({ value: q, label: QUALITY_LABEL[q] })),
      select: (v) => {
        const quality = v as RecordSettings['quality'];
        forgetCapIfAbove({ ...s, quality }, cap);
        patch({ quality });
      },
    },
    resolution: {
      kind: 'choice',
      key: 'resolution',
      label: 'Resolución',
      help:
        s.resolution === 'auto'
          ? `Sigue a la calidad elegida.${someHidden ? ' Solo salen las que da esta cámara.' : ''}`
          : `Fija el tamaño aunque cambies la calidad.${someHidden ? ' Solo salen las que da esta cámara.' : ''}`,
      note: resHidden
        ? `Esta cámara no llega a ${RES_LABEL[s.resolution]}: grabará a lo máximo que dé.`
        : s.resolution !== 'auto'
          ? capNote
          : undefined,
      noteAction: !resHidden && s.resolution !== 'auto' ? retrySize : undefined,
      display: RES_LABEL[s.resolution],
      value: resHidden ? null : s.resolution,
      options: resChoices.map((r) => ({
        value: r,
        label: RES_LABEL[r],
        ariaLabel: r === 'auto' ? 'Automática' : undefined,
      })),
      select: (v) => {
        const resolution = v as ResolutionChoice;
        forgetCapIfAbove({ ...s, resolution }, cap);
        patch({ resolution });
      },
    },
    fps: {
      kind: 'choice',
      key: 'fps',
      label: 'Fotogramas',
      help: '60 deja los giros nítidos; 30 pesa y calienta menos.',
      note: no60
        ? `Esta cámara llega a ${Math.round(maxFps ?? 30)} fps: 60 no está disponible.`
        : fourK && s.fps === 60
          ? 'En 4K se graba siempre a 30.'
          : paced30
            ? 'Este móvil no fue fluido a 60: se graba a 30. Toca 60 para volver a probar.'
            : undefined,
      display: `${fpsShown} fps`,
      value: String(fpsShown),
      options: [
        { value: '30', label: '30', ariaLabel: '30 fotogramas por segundo' },
        { value: '60', label: '60', ariaLabel: '60 fotogramas por segundo', disabled: no60 },
      ],
      select: (v) => {
        // P19: asking for 60 again forgets what this phone showed; the next rehearsal judges afresh.
        if (v === '60' && paced30) forgetPaceFps();
        patch({ fps: v === '60' ? 60 : 30 });
      },
    },
    codec: {
      kind: 'choice',
      key: 'codec',
      label: 'Formato',
      help:
        s.codec === 'auto'
          ? 'HEVC si el móvil puede (la mitad de tamaño); si no, H.264 High.'
          : 'Siempre H.264: se abre en cualquier ordenador o editor.',
      display: s.codec === 'auto' ? 'Automático' : 'Compatible',
      value: s.codec,
      options: [
        { value: 'auto', label: 'Automático' },
        { value: 'h264', label: 'Compatible', ariaLabel: 'Compatible, H.264' },
      ],
      select: (v) => patch({ codec: v as RecordSettings['codec'] }),
    },
    mode: {
      kind: 'choice',
      key: 'mode',
      label: 'Captura',
      help:
        s.mode === 'auto'
          ? 'Graba la imagen de la cámara tal cual cuando se puede.'
          : 'Redibuja cada fotograma. Gasta más batería: úsalo si la directa falla.',
      display: s.mode === 'auto' ? 'Automática' : 'Lienzo',
      value: s.mode,
      options: [
        { value: 'auto', label: 'Automática' },
        { value: 'canvas', label: 'Siempre lienzo' },
      ],
      select: (v) => patch({ mode: v as RecordSettings['mode'] }),
    },
    sound: {
      kind: 'choice',
      key: 'sound',
      label: 'Sonido',
      help:
        soundNow === 'song'
          ? 'El audio original del archivo, limpio, sin ruido de la sala.'
          : 'Se oye la sala: pasos, voces y la canción por el altavoz.',
      note: songPossible ? undefined : 'YouTube no deja grabar su audio: la toma usa el micrófono.',
      display: soundNow === 'song' ? 'Canción' : 'Micrófono',
      value: soundNow,
      options: [
        { value: 'song', label: 'Canción limpia', disabled: !songPossible },
        { value: 'mic', label: 'Micrófono' },
      ],
      select: (v) => patch({ sound: v as RecordSettings['sound'] }),
    },
    micChannels: {
      kind: 'choice',
      key: 'micChannels',
      label: 'Micrófono',
      help:
        (s.micChannels === 'stereo'
          ? 'Estéreo si el móvil tiene dos micros: suena más amplio.'
          : 'Un solo canal: igual en cualquier móvil.') +
        (soundNow === 'song' ? ' Solo cuenta al grabar con el micro.' : ''),
      display: s.micChannels === 'stereo' ? 'Estéreo' : 'Mono',
      value: s.micChannels,
      options: [
        { value: 'mono', label: 'Mono' },
        { value: 'stereo', label: 'Estéreo' },
      ],
      select: (v) => patch({ micChannels: v as RecordSettings['micChannels'] }),
    },
    clapSensitivity: {
      kind: 'choice',
      key: 'clapSensitivity',
      label: 'Aplauso',
      help: `Sensibilidad para empezar con un doble aplauso. ${CLAP_HELP[s.clapSensitivity]}`,
      display: CLAP_LABEL[s.clapSensitivity],
      value: s.clapSensitivity,
      options: (['low', 'medium', 'high'] as const).map((c) => ({
        value: c,
        label: CLAP_LABEL[c],
        ariaLabel: `Sensibilidad ${CLAP_LABEL[c].toLowerCase()}`,
      })),
      select: (v) => patch({ clapSensitivity: v as RecordSettings['clapSensitivity'] }),
    },
    syncTrim: {
      kind: 'stepper',
      key: 'syncTrim',
      label: 'Ajuste fino de sincronía',
      help: 'Si en la toma ves los pasos después de la música, súbelo; si los ves antes, bájalo.',
      note: s.syncTrimMs !== 0 ? 'Ajustado en este móvil: vale para las próximas tomas.' : undefined,
      noteAction: s.syncTrimMs !== 0 ? { label: 'Volver a 0', run: () => patch({ syncTrimMs: 0 }) } : undefined,
      display: trimLabel(s.syncTrimMs),
      value: s.syncTrimMs,
      min: -MAX_TRIM_MS,
      max: MAX_TRIM_MS,
      step: TRIM_STEP_MS,
      valueText: trimLabel(s.syncTrimMs),
      decreaseLabel: `Bajar ${TRIM_STEP_MS} ms`,
      increaseLabel: `Subir ${TRIM_STEP_MS} ms`,
      set: (v) => patch({ syncTrimMs: clampTrim(v) }),
    },
    grid: {
      kind: 'switch',
      key: 'grid',
      label: 'Rejilla',
      help: 'Líneas de tercios para encuadrar.',
      display: s.grid ? 'Sí' : 'No',
      value: s.grid,
      toggle: () => patch({ grid: !useRecordSettings.getState().grid }),
    },
    level: {
      kind: 'switch',
      key: 'level',
      label: 'Nivel',
      help: 'Una línea que se pone dorada con el móvil recto.',
      display: s.level ? 'Sí' : 'No',
      value: s.level,
      toggle: () => patch({ level: !useRecordSettings.getState().level }),
    },
    info: {
      kind: 'switch',
      key: 'info',
      label: 'Información técnica',
      help: 'Muestra el botón «i» con los datos de la cámara.',
      display: s.info ? 'Sí' : 'No',
      value: s.info,
      toggle: () => patch({ info: !useRecordSettings.getState().info }),
    },
  };
}
