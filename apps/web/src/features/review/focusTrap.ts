export function trapFocus(event: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((n) => n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active) || active === root)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
