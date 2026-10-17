/**
 * Where overlays (dialogs, toasts) mount.
 * - Native fullscreen only shows the fullscreen element's subtree: the studio's stage goes fullscreen itself, so
 *   overlays mount inside it. Random Play Dance asks for the whole page (`<html>`): that already contains `<body>`,
 *   and mounting straight under `<html>` would lose what `<body>` gives (colour, font size, line height).
 * - The studio's CSS fullscreen (iPhone, or when the API refuses) is a fixed layer marked `data-fs` in its own stacking
 *   context above the page: mounted inside it, a dialog's z-50 sits over the stage's controls (z-30) instead of
 *   under the whole layer. It is a descendant of `<body>`, so it inherits the same typography.
 */
export function overlayHost(): Element {
  const full = document.fullscreenElement;
  if (full && !full.contains(document.body)) return full;
  return document.querySelector('[data-fs]') ?? document.body;
}
