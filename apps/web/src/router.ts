import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createAppRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
  });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
