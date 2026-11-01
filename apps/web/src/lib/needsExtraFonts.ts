/**
 * REQ-07 · Does what is on screen need a slice that only ./fonts-ja.css declares?
 *
 * ./fonts.css (linked from index.html) declares the faces the first screen uses: latin, latin-ext and the UI kanji
 * subset. Everything else (kana, kanji outside that subset, cyrillic, greek, vietnamese, symbols) lives in the
 * deferred ./fonts-ja.css. If such a character is visible right now, waiting for the first screen to settle would
 * paint it in the system font for seconds, which the Google stylesheets never did (golden rule): the sheet is added at
 * once instead. With nothing of the kind on screen the deferral stays as it is.
 *
 * Both tables are checked against the real stylesheets by needsExtraFonts.test.ts, so they cannot drift.
 */

type Range = readonly [number, number];

/** The UI kanji subset (Shippori Mincho B1 and Zen Kaku Gothic New): one code point each in fonts.css. */
const UI_KANJI = [
  0x4eba, 0x4eca, 0x4f5c, 0x5143, 0x5168, 0x5186, 0x5224, 0x53e4, 0x54e1, 0x5831, 0x58f0, 0x5916, 0x5b50,
  0x5b9a, 0x5bf8, 0x5c45, 0x5c4f, 0x5e16, 0x5e33, 0x5ea7, 0x5eab, 0x5f0f, 0x5f15, 0x5f53, 0x5fa1, 0x624b,
  0x62cd, 0x64ae, 0x65e5, 0x66a6, 0x66f2, 0x66f8, 0x672d, 0x683c, 0x697d, 0x6b21, 0x6bd4, 0x6c34, 0x6c7a,
  0x6ce2, 0x6d77, 0x6f14, 0x706f, 0x753b, 0x756a, 0x76ee, 0x76f8, 0x773c, 0x795e, 0x7968, 0x796d, 0x798f,
  0x7a3d, 0x7c3e, 0x7c64, 0x7d19, 0x7d42, 0x821e, 0x829d, 0x83f1, 0x888b, 0x8a18, 0x8a2d, 0x8a3b, 0x8a66,
  0x8cea, 0x9078, 0x9332, 0x9593, 0x9752, 0x9762, 0x97f3, 0x9858, 0x9f63,
];

/** Union of the unicode-ranges declared by ./fonts.css (the code points that are not waiting for anything). */
const COVERED: readonly Range[] = [
  [0x0, 0x2cc],
  [0x2ce, 0x2d7],
  [0x2da, 0x2da],
  [0x2dc, 0x2ff],
  [0x304, 0x304],
  [0x308, 0x308],
  [0x329, 0x329],
  [0x1d00, 0x1dbf],
  [0x1e00, 0x1e9f],
  [0x1ef2, 0x1eff],
  [0x2000, 0x206f],
  [0x20a0, 0x20c4],
  [0x2113, 0x2113],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0x2c60, 0x2c7f],
  ...UI_KANJI.map((c): Range => [c, c]),
  [0xa720, 0xa7ff],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

/** Blocks where ./fonts-ja.css has slices (a superset: the test proves every declared code point is inside). */
const DEFERRED_BLOCKS: readonly Range[] = [
  [0x2c0, 0x52f],
  [0x1c80, 0x1c8f],
  [0x1e00, 0x1eff],
  [0x2000, 0x27ff],
  [0x2900, 0x29ff],
  [0x2b00, 0x2bff],
  [0x2d00, 0x9fff],
  [0xa600, 0xa6ff],
  [0xf900, 0xfaff],
  [0xfe00, 0xffff],
  [0x1f100, 0x1f2ff],
  [0x20000, 0x2ffff],
];

const within = (ranges: readonly Range[], cp: number) => {
  for (const [from, to] of ranges) if (cp >= from && cp <= to) return true;
  return false;
};

/** True when this code point is drawn by a face that only ./fonts-ja.css declares. */
export function isDeferredCodePoint(cp: number): boolean {
  return within(DEFERRED_BLOCKS, cp) && !within(COVERED, cp);
}

/** True when any character of `text` needs the deferred sheet. Latin text costs one comparison per character. */
export function needsExtraFonts(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x2c0) continue; // basic latin, latin-1 and latin-ext: always declared by fonts.css
    const cp = unit >= 0xd800 && unit <= 0xdbff ? (text.codePointAt(i) ?? unit) : unit;
    if (cp > 0xffff) i++;
    if (isDeferredCodePoint(cp)) return true;
  }
  return false;
}

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

/** What the user typed or what a field hints at: neither is a text node, but both are drawn with the page fonts. */
function fieldTexts(root: Node): string[] {
  if (!('querySelectorAll' in root)) return [];
  const out: string[] = [];
  for (const field of (root as ParentNode).querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  )) {
    if (field.type === 'password') continue; // drawn as dots, whatever is inside
    if (field.value) out.push(field.value);
    const hint = field.getAttribute('placeholder');
    if (hint) out.push(hint);
  }
  return out;
}

/**
 * Looks at the text nodes under `root` plus the value and placeholder of its inputs and textareas (at most
 * `maxChars` characters) for something that needs the deferred sheet.
 */
export function domNeedsExtraFonts(root: Node, maxChars = 40_000): boolean {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      SKIPPED.has(node.parentElement?.tagName ?? '') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let seen = 0;
  for (let node = walker.nextNode(); node && seen < maxChars; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    seen += text.length;
    if (needsExtraFonts(text)) return true;
  }
  for (const text of fieldTexts(root)) {
    seen += text.length;
    if (seen > maxChars) break;
    if (needsExtraFonts(text)) return true;
  }
  return false;
}

/**
 * Calls `onNeeded` once, as soon as the page shows text that needs the deferred sheet. It looks right away and after
 * every burst of DOM changes (the first render, a route change, data arriving) or typing in a field, debounced so it
 * costs nothing while the page animates. Watch `document.body`, not `#root`: dialogs, toasts and the review and record
 * screens are portals outside `#root`. Returns a cancel; the watcher also stops by itself after reporting.
 */
export function watchForExtraFonts(
  root: HTMLElement,
  onNeeded: () => void,
  {
    debounceMs = 60,
    check = domNeedsExtraFonts,
  }: { debounceMs?: number; check?: (root: Node) => boolean } = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const doc = root.ownerDocument;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!check(root)) return;
      stop();
      onNeeded();
    }, debounceMs);
  };
  const observer = new MutationObserver(schedule);
  function stop() {
    observer.disconnect();
    doc.removeEventListener('input', schedule, true);
    clearTimeout(timer);
  }
  observer.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['placeholder'],
  });
  // Typing changes a field's value without touching the DOM, so it needs its own trigger (capture: it sees every field).
  doc.addEventListener('input', schedule, true);
  schedule(); // what is already there (including field values) when the watcher starts
  return stop;
}
