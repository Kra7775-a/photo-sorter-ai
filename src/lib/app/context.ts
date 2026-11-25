import { getContext, setContext } from "svelte";

import type { AppController, AppSnapshot } from "./controller";

const APP_CONTEXT_KEY = Symbol("app-context");

export type AppContextValue = {
  app: AppController;
  view: () => AppSnapshot;
};

export function setAppContext(value: AppContextValue): void {
  setContext(APP_CONTEXT_KEY, value);
}

export function getAppContext(): AppContextValue {
  return getContext<AppContextValue>(APP_CONTEXT_KEY);
}
