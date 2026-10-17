// Minimal typings + loader for the YouTube IFrame Player API.
// https://developers.google.com/youtube/iframe_api_reference

export const YTState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  mute?(): void;
  unMute?(): void;
  getVideoData?(): { title?: string; author?: string; video_id?: string };
  /** Deprecated by YouTube (often a no-op now): a hint only, never relied on. */
  setPlaybackQuality?(suggestedQuality: string): void;
  destroy(): void;
}

interface YTEvent<T = unknown> {
  target: YTPlayer;
  data: T;
}

export interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: YTEvent) => void;
    onStateChange?: (event: YTEvent<number>) => void;
    onPlaybackRateChange?: (event: YTEvent<number>) => void;
    onError?: (event: YTEvent<number>) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;

  loading = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('No se pudo cargar el reproductor de YouTube.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function describeYouTubeError(code: number): string {
  switch (code) {
    case 2:
      return 'Enlace de YouTube no válido.';
    case 5:
      return 'El reproductor no puede abrir este vídeo.';
    case 100:
      return 'El vídeo no existe o es privado.';
    case 101:
    case 150:
      return 'El autor no permite reproducir este vídeo fuera de YouTube. Descárgalo y súbelo como archivo.';
    default:
      return 'YouTube devolvió un error al reproducir.';
  }
}
