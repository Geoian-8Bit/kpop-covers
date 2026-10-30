import { videoAspectRatio } from '@coverscape/shared';
import { useEffect, useState } from 'react';

/**
 * Title and channel of a YouTube video, from our own `/api/youtube-meta` (oEmbed on the server: no key in the
 * browser, nothing downloaded from YouTube). Shared by «Añadir vídeo» (library) and «Proponer» (wish list, F12).
 */
export type YouTubeMetaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; title: string | null; author: string | null; aspectRatio?: number | null }
  | { status: 'error'; message: string };

/** One lookup. A failed network call is not an error: the link still works, only without a title. */
export async function fetchYouTubeMeta(id: string, signal?: AbortSignal): Promise<YouTubeMetaState> {
  try {
    const res = await fetch(`/api/youtube-meta?id=${id}`, { signal });
    const body = (await res.json().catch(() => ({}))) as {
      title?: string | null;
      author?: string | null;
      width?: number | null;
      height?: number | null;
    };
    if (res.status === 422) {
      return {
        status: 'error',
        message: 'El autor no permite reproducir este vídeo fuera de YouTube. Descárgalo y súbelo como archivo.',
      };
    }
    if (res.status === 404) return { status: 'error', message: 'No encontramos ese vídeo. ¿Es privado?' };
    return {
      status: 'ok',
      title: body.title ?? null,
      author: body.author ?? null,
      aspectRatio: videoAspectRatio({ width: body.width, height: body.height }),
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return { status: 'ok', title: null, author: null };
  }
}

/** The lookup for the id on screen; a newer id cancels the older one. */
export function useYouTubeMeta(id: string | null): YouTubeMetaState {
  const [state, setState] = useState<YouTubeMetaState>({ status: 'idle' });
  useEffect(() => {
    if (!id) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchYouTubeMeta(id, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setState(next);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [id]);
  return state;
}
