"use client";

import { useSyncExternalStore } from "react";

type Choice = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "vt-theme";

const listeners = new Set<() => void>();

function read(): Choice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function apply(choice: Choice) {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be unavailable; the choice still applies to this page.
  }
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  listeners.forEach((l) => l());
}

const OPTIONS: ReadonlyArray<{ value: Choice; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

/**
 * Theme control (brand D2). Without JavaScript the page follows the
 * system setting and this control stays hidden.
 */
export function ThemeSwitch() {
  const choice = useSyncExternalStore<Choice | null>(subscribe, read, () => null);
  return (
    <fieldset className="theme-switch" hidden={choice === null}>
      <legend className="label">Theme</legend>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className="button"
          aria-pressed={choice === o.value}
          onClick={() => apply(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Runs before first paint so a stored theme never flashes. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;
