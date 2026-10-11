/**
 * Phones can come back from landscape with the page still scaled for the wider screen (everything
 * small in the top-left corner) until something forces a relayout. After every rotation we briefly pin
 * the viewport scale to 1 and then hand it back, which makes iOS Safari and Android Chrome drop any
 * zoom left over from the other orientation.
 */
export function keepViewportFitted(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const base = meta.content;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const refit = () => {
    clearTimeout(timer);
    meta.content = `${base}, maximum-scale=1`;
    timer = setTimeout(() => {
      meta.content = base;
    }, 400);
  };

  const orientation = window.screen.orientation;
  if (orientation) orientation.addEventListener('change', refit);
  else window.addEventListener('orientationchange', refit);
}
