import { QUALITY_LABEL, resolutionClass, type ResolutionChoice } from '@coverscape/shared';
import { useRecordSettings, type RecordSettings } from '../settings';

/** Props shared by the three variants of the recorder's settings panel (A1). */
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
}

export type FieldKey =
  | 'quality'
  | 'resolution'
  | 'fps'
  | 'codec'
  | 'mode'
  | 'startCamera'
  | 'sound'
  | 'micChannels'
  | 'clapSensitivity'
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
  /** Kanji for the row's seal (decorative, aria-hidden). */
  glyph: string;
  /** One short line on what the current value does. */
  help: string;
  /** Why an option is off, or a caveat for this phone. */
  note?: string;
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

export type Field = ChoiceField | SwitchField;

export interface Fields {
  quality: ChoiceField;
  resolution: ChoiceField;
  fps: ChoiceField;
  codec: ChoiceField;
  mode: ChoiceField;
  startCamera: ChoiceField;
  sound: ChoiceField;
  micChannels: ChoiceField;
  clapSensitivity: ChoiceField;
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

const CLAP_HELP: Record<RecordSettings['clapSensitivity'], string> = {
  low: 'Solo palmadas fuertes y claras: para salas con eco o ruido.',
  medium: 'Dos palmadas normales a unos metros del móvil.',
  high: 'Oye palmadas suaves o lejanas; en una sala ruidosa puede saltar sola.',
};

const RES_RANK: Record<Exclude<ResolutionChoice, 'auto'>, number> = { '720p': 0, '1080p': 1, '1440p': 2, '4k': 3 };
const RES_LABEL: Record<ResolutionChoice, string> = {
  auto: 'Auto',
  '4k': '4K',
  '1440p': '1440p',
  '1080p': '1080p',
  '720p': '720p',
};

const CAMERA_LABEL: Record<RecordSettings['startCamera'], string> = {
  back: 'Trasera',
  front: 'Frontal',
  last: 'Última usada',
};

const CAMERA_HELP: Record<RecordSettings['startCamera'], string> = {
  back: 'Empieza con la trasera, la de más calidad.',
  front: 'Empieza con la frontal, para verte mientras bailas.',
  last: 'Empieza con la que usaste la última vez.',
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

  // Sound: YouTube never lets its own sound be recorded.
  const soundNow = songPossible ? s.sound : 'mic';

  return {
    quality: {
      kind: 'choice',
      key: 'quality',
      label: 'Calidad',
      glyph: '質',
      help: QUALITY_HELP[s.quality],
      display: QUALITY_LABEL[s.quality],
      value: s.quality,
      options: (['saver', 'high', 'max', 'auto'] as const).map((q) => ({ value: q, label: QUALITY_LABEL[q] })),
      select: (v) => patch({ quality: v as RecordSettings['quality'] }),
    },
    resolution: {
      kind: 'choice',
      key: 'resolution',
      label: 'Resolución',
      glyph: '寸',
      help:
        s.resolution === 'auto'
          ? `Sigue a la calidad elegida.${someHidden ? ' Solo salen las que da esta cámara.' : ''}`
          : `Fija el tamaño aunque cambies la calidad.${someHidden ? ' Solo salen las que da esta cámara.' : ''}`,
      note: resHidden
        ? `Esta cámara no llega a ${RES_LABEL[s.resolution]}: grabará a lo máximo que dé.`
        : undefined,
      display: RES_LABEL[s.resolution],
      value: resHidden ? null : s.resolution,
      options: resChoices.map((r) => ({
        value: r,
        label: RES_LABEL[r],
        ariaLabel: r === 'auto' ? 'Automática' : undefined,
      })),
      select: (v) => patch({ resolution: v as ResolutionChoice }),
    },
    fps: {
      kind: 'choice',
      key: 'fps',
      label: 'Fotogramas',
      glyph: '齣',
      help: '60 deja los giros nítidos; 30 pesa y calienta menos.',
      note: no60
        ? `Esta cámara llega a ${Math.round(maxFps ?? 30)} fps: 60 no está disponible.`
        : fourK && s.fps === 60
          ? 'En 4K se graba siempre a 30.'
          : undefined,
      display: `${fpsNow} fps`,
      value: String(fpsNow),
      options: [
        { value: '30', label: '30', ariaLabel: '30 fotogramas por segundo' },
        { value: '60', label: '60', ariaLabel: '60 fotogramas por segundo', disabled: no60 },
      ],
      select: (v) => patch({ fps: v === '60' ? 60 : 30 }),
    },
    codec: {
      kind: 'choice',
      key: 'codec',
      label: 'Formato',
      glyph: '式',
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
      label: 'Imagen',
      glyph: '画',
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
    startCamera: {
      kind: 'choice',
      key: 'startCamera',
      label: 'Cámara al abrir',
      glyph: '眼',
      help: CAMERA_HELP[s.startCamera],
      display: CAMERA_LABEL[s.startCamera],
      value: s.startCamera,
      options: (['back', 'front', 'last'] as const).map((c) => ({ value: c, label: CAMERA_LABEL[c] })),
      select: (v) => patch({ startCamera: v as RecordSettings['startCamera'] }),
    },
    sound: {
      kind: 'choice',
      key: 'sound',
      label: 'Sonido',
      glyph: '音',
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
      glyph: '声',
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
      glyph: '拍',
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
    grid: {
      kind: 'switch',
      key: 'grid',
      label: 'Rejilla',
      glyph: '格',
      help: 'Líneas de tercios para encuadrar.',
      display: s.grid ? 'Sí' : 'No',
      value: s.grid,
      toggle: () => patch({ grid: !useRecordSettings.getState().grid }),
    },
    level: {
      kind: 'switch',
      key: 'level',
      label: 'Nivel',
      glyph: '水',
      help: 'Una línea que se pone dorada con el móvil recto.',
      display: s.level ? 'Sí' : 'No',
      value: s.level,
      toggle: () => patch({ level: !useRecordSettings.getState().level }),
    },
    info: {
      kind: 'switch',
      key: 'info',
      label: 'Información técnica',
      glyph: '報',
      help: 'Muestra el botón «i» con los datos de la cámara.',
      display: s.info ? 'Sí' : 'No',
      value: s.info,
      toggle: () => patch({ info: !useRecordSettings.getState().info }),
    },
  };
}
