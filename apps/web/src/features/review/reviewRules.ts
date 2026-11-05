/**
 * F5 / F6 · Pure rules of the review screen: layout limits, the two-finger fit of the original over the take,
 * which take opens by default, which notes show where, the note drawing's size and the categories.
 * No DOM, no network: the screen and the tests share them.
 *
 * REQ-27 · Split by topic (basics, keeping in sync, the two panels, the fit, notes, the drawing); this barrel keeps
 * the old import path.
 */
export * from './reviewBasics';
export * from './reviewSync';
export * from './reviewPanels';
export * from './reviewFit';
export * from './reviewNotes';
export * from './reviewSketch';
