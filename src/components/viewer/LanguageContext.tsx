"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

export type ViewerLang = "en" | "gu";

const STORAGE_KEY = "market-intelligence:lang";

// localStorage is the source of truth; this is a minimal external store
// around it (React's recommended pattern for syncing to a browser API
// without a hydration mismatch or a setState-in-effect). The native
// "storage" event only fires in *other* tabs, so this same-tab listener set
// is what makes every subscribed component re-render the moment setLang()
// below writes a new value.
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): ViewerLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "gu" ? "gu" : "en";
  } catch {
    return "en";
  }
}

// The server (and the client's first hydration pass) always sees "en" --
// useSyncExternalStore reconciles this with the real getSnapshot() value
// right after hydration, with no manual effect required.
function getServerSnapshot(): ViewerLang {
  return "en";
}

function setStoredLang(next: ViewerLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing / storage disabled -- listeners still fire below so
    // the in-memory UI still switches for this session.
  }
  for (const listener of listeners) listener();
}

interface LanguageContextValue {
  lang: ViewerLang;
  setLang: (lang: ViewerLang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// Lives in the shared (viewer) layout, so it's available to every feed tab,
// category, and company filter -- all the same route or sibling routes
// under that one layout, none of which remount it.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLang = useCallback((next: ViewerLang) => setStoredLang(next), []);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext) ?? { lang: "en", setLang: () => {} };
}
