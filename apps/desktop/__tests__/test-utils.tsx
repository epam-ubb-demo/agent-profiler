import { ContextProvider } from '@epam/uui-core';
import { render, type RenderOptions, act } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Wraps rendered components with the UUI ContextProvider so that any UUI
 * component calling `useUuiContext` (e.g. Button) works during tests.
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return <ContextProvider onInitCompleted={() => {}}>{children}</ContextProvider>;
}

/**
 * Custom render that wraps the component in UUI ContextProvider and flushes
 * the asynchronous init (loadAppContext) so children are visible immediately.
 */
async function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui, { wrapper: AllProviders, ...options });
  });
  return result!;
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react';

// Override the render export with our wrapped version
export { customRender as render };
