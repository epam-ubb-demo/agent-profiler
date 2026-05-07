import { UuiContext } from '@epam/uui-core';
import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Minimal UUI context value to satisfy `useUuiContext()` calls in components
 * like Button and Badge during testing (without requiring async ContextProvider).
 */
const mockUuiServices = {
  uuiAnalytics: { sendEvent: () => {} },
  uuiErrors: { currentError: null, reportError: () => {}, recover: () => {}, discardError: () => {} },
  uuiNotifications: { show: () => Promise.resolve(), getNotifications: () => [], remove: () => {}, clearAll: () => {}, handleRedirect: () => {} },
  uuiModals: { show: () => Promise.resolve(undefined), closeAll: () => {}, getOperations: () => [] },
  uuiRouter: { getCurrentLink: () => ({ pathname: '/', query: {} }), redirect: () => {}, transfer: () => {}, isActive: () => false, createHref: () => '', listen: () => () => {}, block: () => () => {} },
  uuiLocks: { acquire: () => Promise.resolve(), release: () => {}, withLock: (fn: () => Promise<unknown>) => fn(), getCurrentLock: () => null },
  uuiLayout: {},
  uuiApi: { processRequest: () => Promise.resolve(null), getActiveCalls: () => [], reset: () => {} },
  uuiUserSettings: { get: () => undefined, set: () => {} },
  uuiDnD: {},
} as unknown as Parameters<typeof UuiContext.Provider>[0]['value'];

/**
 * Wraps rendered components with the UUI context so that UUI
 * components (Button, Badge, FlexRow, etc.) work in test.
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return <UuiContext.Provider value={mockUuiServices}>{children}</UuiContext.Provider>;
}

/**
 * Custom render that wraps the component in UUI context provider.
 */
function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react';

// Override the render export with our wrapped version
export { customRender as render };
