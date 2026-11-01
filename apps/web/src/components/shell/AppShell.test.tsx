// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

// REQ-09 · The shell mounts only the bar for the current width. Both bars are stubbed with a render counter, so the
// test proves M-08's criterion: on a phone the side rail is not mounted (it cannot commit on a route change).
const state = vi.hoisted(() => ({ desktop: false, sideRailRenders: 0, mobileBarRenders: 0 }));

vi.mock('@/lib/useDesktop', () => ({ useDesktop: () => state.desktop }));
vi.mock('./SideRail', () => ({
  SideRail: () => {
    state.sideRailRenders += 1;
    return <aside data-testid="side-rail" />;
  },
}));
vi.mock('./MobileBar', () => ({
  MobileBar: () => {
    state.mobileBarRenders += 1;
    return <header data-testid="mobile-bar" />;
  },
}));
vi.mock('./SavingReporter', () => ({ SavingReporter: () => null }));
vi.mock('@/features/nav/QuickNav', () => ({ QuickNav: () => null, useQuickNavShown: () => false }));
vi.mock('@/features/calendar/PushHost', () => ({ PushHost: () => null }));
vi.mock('@/features/members/MembersUI', () => ({ WhoPromptHost: () => null }));
vi.mock('../InstallApp', () => ({ InstallAppHelp: () => null }));
vi.mock('../stickyBarPadding', () => ({ useFabScrollPadding: () => {} }));
vi.mock('@/lib/prefetch', () => ({
  loadAddVideoDialog: () => Promise.resolve({ AddVideoDialog: () => null }),
  prefetchAddVideoWhenIdle: () => () => {},
}));

import { AppShell } from './AppShell';

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<h1>Inicio</h1>} />
          <Route path="otra" element={<h1>Otra</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell · bar per width', () => {
  afterEach(() => {
    cleanup();
    state.desktop = false;
    state.sideRailRenders = 0;
    state.mobileBarRenders = 0;
  });

  it('on a phone there is no SideRail node and it never renders', () => {
    renderShell();
    expect(screen.queryByTestId('side-rail')).toBeNull();
    expect(screen.getByTestId('mobile-bar')).not.toBeNull();
    expect(state.sideRailRenders).toBe(0);
  });

  it('from lg up there is no MobileBar node', () => {
    state.desktop = true;
    renderShell();
    expect(screen.getByTestId('side-rail')).not.toBeNull();
    expect(screen.queryByTestId('mobile-bar')).toBeNull();
    expect(state.mobileBarRenders).toBe(0);
  });

  it('crossing lg swaps the bar', () => {
    const { rerender } = renderShell();
    state.desktop = true;
    // Re-render the shell with the new width (the real hook does this through matchMedia).
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<h1>Inicio</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('side-rail')).not.toBeNull();
    expect(screen.queryByTestId('mobile-bar')).toBeNull();
  });
});
