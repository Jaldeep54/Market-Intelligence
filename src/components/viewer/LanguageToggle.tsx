"use client";

import { useLanguage } from "@/components/viewer/LanguageContext";

// Global, feed-wide setting -- not per card. Individual NewsCards still
// fall back to English on their own if a given article has no Gujarati
// translation, regardless of what's selected here.
export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex gap-0.5 rounded-full bg-border/60 p-0.5 text-xs font-medium">
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          lang === "en" ? "bg-accent text-accent-foreground" : "text-muted"
        }`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLang("gu")}
        aria-pressed={lang === "gu"}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          lang === "gu" ? "bg-accent text-accent-foreground" : "text-muted"
        }`}
      >
        ગુજરાતી
      </button>
    </div>
  );
}
