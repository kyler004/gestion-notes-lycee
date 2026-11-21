import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [false, vi.fn()],
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

if (typeof window !== 'undefined') {
  window.scrollTo = (() => undefined) as unknown as typeof window.scrollTo;
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => {
        const minWidthMatch = /\(min-width:\s*(\d+)px\)/.exec(query);
        const matches = minWidthMatch
          ? window.innerWidth >= Number(minWidthMatch[1])
          : false;
        return {
          matches,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        };
      },
    });
  }
}

afterEach(() => {
  cleanup();
});
