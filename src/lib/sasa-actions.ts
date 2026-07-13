/**
 * Client-side action intent parsing and execution. Lets SASA (and the user)
 * drive the app itself — navigation, sound, typing speed, opening panels —
 * from plain-text prompts. Everything the human user is allowed to do here
 * is allowed; things they can't do (creator dashboard, tier changes, adding
 * their own prompt credits) are explicitly refused.
 */
import type { NavigateOptions } from "@tanstack/react-router";
import { setSfxMuted, startAmbient, stopAmbient } from "@/lib/sasa-sfx";

export type SasaActionHandlers = {
  navigate: (to: string) => void;
  openStatusHub: () => void;
  openSidebar: () => void;
  setTypingSpeed: (cps: number) => void;
};

export type ParsedAction =
  | { kind: "navigate"; to: string; label: string }
  | { kind: "openStatusHub" }
  | { kind: "openSidebar" }
  | { kind: "sound"; mute: boolean }
  | { kind: "ambient"; on: boolean }
  | { kind: "typing"; cps: number; label: string }
  | { kind: "refuse"; reason: string };

const NAV_ROUTES: Record<string, string> = {
  settings: "/settings",
  setting: "/settings",
  profile: "/profile",
  upgrade: "/upgrade",
  billing: "/upgrade",
  pricing: "/upgrade",
  sync: "/sync",
  home: "/",
  chat: "/",
  main: "/",
};

const REFUSE_KEYWORDS = [
  "creator dashboard",
  "creator panel",
  "add credits",
  "grant myself",
  "bypass security",
  "unlimited prompts for me",
  "make me admin",
  "override tier",
];

export function parseAction(raw: string): ParsedAction | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;

  for (const kw of REFUSE_KEYWORDS) {
    if (t.includes(kw)) return { kind: "refuse", reason: kw };
  }

  // Slash commands
  const slash = t.match(/^\/(goto|open|nav|navigate)\s+(.+)$/);
  if (slash) {
    const target = slash[2].trim().replace(/^\/+/, "");
    if (target === "status" || target === "hub" || target === "status hub") return { kind: "openStatusHub" };
    if (target === "menu" || target === "sidebar" || target === "history") return { kind: "openSidebar" };
    if (NAV_ROUTES[target]) return { kind: "navigate", to: NAV_ROUTES[target], label: target };
  }
  if (/^\/mute\b/.test(t)) return { kind: "sound", mute: true };
  if (/^\/unmute\b/.test(t)) return { kind: "sound", mute: false };
  if (/^\/ambient\s+(on|start)\b/.test(t)) return { kind: "ambient", on: true };
  if (/^\/ambient\s+(off|stop)\b/.test(t)) return { kind: "ambient", on: false };
  const tspeed = t.match(/^\/typing\s+(fast|slow|normal|instant)\b/);
  if (tspeed) {
    const map: Record<string, number> = { instant: 500, fast: 90, normal: 42, slow: 18 };
    return { kind: "typing", cps: map[tspeed[1]], label: tspeed[1] };
  }

  // Natural-language intents (concise, guarded)
  if (/\b(take me|go|jump|switch)\s+(to\s+)?(the\s+)?(settings|preferences)\b/.test(t))
    return { kind: "navigate", to: "/settings", label: "settings" };
  if (/\b(take me|go|open|show)\s+(to\s+)?(the\s+)?(upgrade|billing|pricing|plans?)\b/.test(t))
    return { kind: "navigate", to: "/upgrade", label: "upgrade" };
  if (/\b(take me|go|open|show)\s+(to\s+)?(the\s+)?(profile)\b/.test(t))
    return { kind: "navigate", to: "/profile", label: "profile" };
  if (/\b(take me|go|open|show)\s+(to\s+)?(the\s+)?(sync|synchron\w*)\b/.test(t))
    return { kind: "navigate", to: "/sync", label: "sync" };
  if (/\b(open|show|bring up)\s+(the\s+)?(status\s*hub|hub|status\s*window|stats?)\b/.test(t))
    return { kind: "openStatusHub" };
  if (/\b(open|show)\s+(the\s+)?(menu|history|sidebar|chats?)\b/.test(t))
    return { kind: "openSidebar" };
  if (/\b(mute|silence)\s+(the\s+)?(sound|sfx|audio)\b/.test(t))
    return { kind: "sound", mute: true };
  if (/\b(unmute|turn on)\s+(the\s+)?(sound|sfx|audio)\b/.test(t))
    return { kind: "sound", mute: false };
  if (/\b(start|play|turn on)\s+(the\s+)?ambient\b/.test(t))
    return { kind: "ambient", on: true };
  if (/\b(stop|end|kill|turn off)\s+(the\s+)?ambient\b/.test(t))
    return { kind: "ambient", on: false };
  const speed = t.match(/\b(faster|slower|instant)\s+typing\b/);
  if (speed) {
    const map: Record<string, number> = { faster: 90, slower: 18, instant: 500 };
    return { kind: "typing", cps: map[speed[1]], label: speed[1] };
  }

  return null;
}

/** Execute the action. Returns a short confirmation string SASA can echo. */
export function runAction(action: ParsedAction, handlers: SasaActionHandlers): string {
  switch (action.kind) {
    case "navigate":
      handlers.navigate(action.to);
      return `On it — opening ${action.label}, master.`;
    case "openStatusHub":
      handlers.openStatusHub();
      return "Status hub, coming up.";
    case "openSidebar":
      handlers.openSidebar();
      return "Menu open.";
    case "sound":
      setSfxMuted(action.mute);
      return action.mute ? "Muted." : "Sound back on.";
    case "ambient":
      if (action.on) startAmbient(); else stopAmbient();
      return action.on ? "Synthwave engaged." : "Ambient stopped.";
    case "typing":
      handlers.setTypingSpeed(action.cps);
      return `Typing speed → ${action.label}.`;
    case "refuse":
      return "Not allowed, master~ that's above both of our clearance.";
  }
}

/** Type helper so the callback in ChatPanel can navigate anywhere. */
export type NavigateFn = (opts: NavigateOptions) => void;