// Grandiose Copilot's view-context provider (Phase 5 of the implementation
// plan). Pure plumbing — no data, no API calls. App.tsx already owns the
// state that describes what the user is currently looking at (which page,
// which Command Center tab, which scenario/period); this file just exposes
// a read-only snapshot of that state via context so the Copilot drawer
// (Phase 7/8) can read it without prop-drilling through every page
// component. The shape matches CopilotViewContext in
// server/services/copilot.ts exactly, field for field — this is the value
// that ends up as `viewContext` in the POST /api/copilot/ask body.
import { createContext, useContext, type ReactNode } from 'react';

export interface CopilotViewContext {
  page?: string;
  tab?: string;
  division?: string;
  period?: string;
}

const CopilotViewContextCtx = createContext<CopilotViewContext>({});

export function CopilotViewContextProvider({ value, children }: { value: CopilotViewContext; children: ReactNode }) {
  return <CopilotViewContextCtx.Provider value={value}>{children}</CopilotViewContextCtx.Provider>;
}

/** Read the current view context. Returns {} (all fields undefined) outside
 * the provider or before any page has set anything meaningful — callers
 * should treat every field as optional, same as the backend does. */
export function useCopilotViewContext(): CopilotViewContext {
  return useContext(CopilotViewContextCtx);
}
