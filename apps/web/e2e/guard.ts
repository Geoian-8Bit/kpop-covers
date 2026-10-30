import { expect, type Page } from '@playwright/test';

/**
 * REQ-00 · Fails the test when the app logs errors or warnings, throws, or a request of ours fails. Third-party
 * noise (the YouTube player and its images, fonts) is ignored: it is not the app's and depends on the network.
 */
const THIRD_PARTY = /youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|google\.com|gstatic\.com|googleapis\.com|doubleclick\.net/;
/**
 * Chatter from tooling and from the browser itself, not from the app: Vite, React DevTools, Chromium's notice about
 * the YouTube iframe's `allow` list, and WebGPU on a machine without a GPU adapter (the voice separator asks once).
 */
const DEV_NOISE = [
  /\[vite\]/,
  /Download the React DevTools/,
  /Unrecognized feature: 'web-share'/,
  /powerPreference option is currently ignored/,
  /No available adapters/,
];

export interface Guard {
  /** Call at the end of the test. */
  check(): void;
}

export function guardConsole(page: Page, { allow = [] as RegExp[] } = {}): Guard {
  const problems: string[] = [];
  const ignored = (text: string, url = '') =>
    THIRD_PARTY.test(url) || [...DEV_NOISE, ...allow].some((re) => re.test(text));

  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const url = msg.location().url ?? '';
    if (ignored(msg.text(), url)) return;
    problems.push(`console.${msg.type()}: ${msg.text()} (${url})`);
  });
  page.on('pageerror', (error) => {
    if (!ignored(error.message)) problems.push(`pageerror: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (THIRD_PARTY.test(url)) return;
    const failure = request.failure()?.errorText ?? '';
    // Navigations and media range requests that the browser itself cancels are not failures.
    if (/ERR_ABORTED/.test(failure)) return;
    problems.push(`requestfailed: ${request.method()} ${url} ${failure}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !THIRD_PARTY.test(url)) problems.push(`HTTP ${response.status()}: ${url}`);
  });

  return {
    check() {
      expect(problems, problems.join('\n')).toEqual([]);
    },
  };
}
