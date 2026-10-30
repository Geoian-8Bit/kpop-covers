/**
 * REQ-13 · Whether this device can draw the 3D view. Apart from the view itself so the editor can ask without
 * loading three.js. Asked once per visit (a test context is made and let go).
 */
let known: boolean | null = null;

export function hasWebGL(): boolean {
  if (known != null) return known;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    known = gl != null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    known = false;
  }
  return known;
}

export const NO_WEBGL = 'Este dispositivo no puede mostrar la vista 3D (no tiene WebGL activado).';
