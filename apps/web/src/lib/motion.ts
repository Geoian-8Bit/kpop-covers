import type { Transition, Variants } from 'motion/react';

/** Snappy, no overshoot – layout & position changes. */
export const snappy: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };
/** Mochi: visible, gummy overshoot for toggles, tabs and pressed states. */
export const jelly: Transition = { type: 'spring', stiffness: 520, damping: 18, mass: 0.9 };
/** Soft float for large surfaces (dialogs, tiles). */
export const soft: Transition = { type: 'spring', stiffness: 260, damping: 28, mass: 1 };
/** `soft` a little less damped (ζ ≈ 0.68): a wide swing (a fan opening) passes its mark by ~5 % and settles once. */
export const unfold: Transition = { type: 'spring', stiffness: 260, damping: 22, mass: 1 };

export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easeOutExpo } },
};

/** Brush-stroke reveal: content is uncovered left→right like ink drawn across paper. */
export const inkReveal: Variants = {
  hidden: { clipPath: 'inset(0 100% 0 0)', opacity: 0.4 },
  show: { clipPath: 'inset(0 0% 0 0)', opacity: 1, transition: { duration: 0.9, ease: easeOutExpo } },
};

/** fadeUp for list items (index as `custom`): the delay steps per item but stops after `cap`, so long lists never trail. */
export const fadeUpCapped = (step = 0.06, cap = 8): Variants => ({
  hidden: fadeUp.hidden!,
  show: (index = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: easeOutExpo, delay: Math.min(index, cap) * step },
  }),
});

export const stagger = (step = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});
