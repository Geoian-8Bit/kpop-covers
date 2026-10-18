/**
 * The lab's moments as the app needs them: ids, the default and the valid variant ids, nothing more. `labState`
 * reads this (it ships in the entry chunk, for every component that asks `useDesignVariant`); the full registry
 * with names, descriptions and demos (`registry.ts`) is only for Ajustes › Laboratorio de diseño, which loads with
 * the settings page. `labState.test.ts` checks both lists say the same.
 */
export type MomentIds = {
  id: string;
  defaultVariant: string;
  variants: readonly { id: string }[];
};

const ids = (...list: string[]) => list.map((id) => ({ id }));

export const MOMENT_IDS: readonly MomentIds[] = [
  { id: 'nav', defaultVariant: 'sensu', variants: ids('sensu', 'hanafuda', 'kamon', 'kakejiku') },
];
