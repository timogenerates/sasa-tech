// Free chat models on Lovable AI Gateway that SASA can use.
// Only Google Gemini + OpenAI GPT families are available on the gateway for
// free (no user API key needed). Claude, Grok, DeepSeek, Llama etc. require
// paid keys and are intentionally excluded.

export type SasaModelTier = "fast" | "balanced" | "deep";

export type SasaModel = {
  id: string;
  label: string;
  vendor: "Google" | "OpenAI";
  tier: SasaModelTier;
  blurb: string;
  costWeight: number; // relative cost signal for the upgrade-confirm flow
};

export const SASA_MODELS: SasaModel[] = [
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", vendor: "Google", tier: "fast", blurb: "Snappy replies, casual chat.", costWeight: 1 },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", vendor: "Google", tier: "fast", blurb: "Cheapest, quickest.", costWeight: 1 },
  { id: "openai/gpt-5-nano", label: "GPT-5 Nano", vendor: "OpenAI", tier: "fast", blurb: "Tiny, fast OpenAI.", costWeight: 1 },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", vendor: "Google", tier: "balanced", blurb: "Great everyday balance.", costWeight: 2 },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", vendor: "Google", tier: "balanced", blurb: "Newer flash, faster reasoning.", costWeight: 2 },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", vendor: "Google", tier: "balanced", blurb: "Balanced multimodal.", costWeight: 2 },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", vendor: "OpenAI", tier: "balanced", blurb: "Balanced OpenAI.", costWeight: 2 },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", vendor: "OpenAI", tier: "balanced", blurb: "Newer balanced OpenAI.", costWeight: 2 },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", vendor: "Google", tier: "deep", blurb: "Deepest Google reasoning.", costWeight: 4 },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", vendor: "Google", tier: "deep", blurb: "Long context + hard problems.", costWeight: 4 },
  { id: "openai/gpt-5", label: "GPT-5", vendor: "OpenAI", tier: "deep", blurb: "All-round premium OpenAI.", costWeight: 4 },
  { id: "openai/gpt-5.4", label: "GPT-5.4", vendor: "OpenAI", tier: "deep", blurb: "Advanced OpenAI reasoning.", costWeight: 4 },
  { id: "openai/gpt-5.5", label: "GPT-5.5", vendor: "OpenAI", tier: "deep", blurb: "Most capable OpenAI available.", costWeight: 5 },
];

export const SASA_DEFAULT_MODEL = "google/gemini-3-flash-preview";

export const SASA_ALLOWED_MODEL_IDS = new Set(SASA_MODELS.map((m) => m.id));

export function getModel(id: string | undefined): SasaModel {
  return SASA_MODELS.find((m) => m.id === id) ?? SASA_MODELS.find((m) => m.id === SASA_DEFAULT_MODEL)!;
}

/**
 * Lightweight local heuristic — SASA "reads" the prompt and suggests a
 * deeper model when the request looks heavy. Returns the id it recommends;
 * caller shows a confirm prompt before actually switching upward.
 */
export function suggestModelFor(prompt: string, current: string): { suggested: string; reason: string } | null {
  const cur = getModel(current);
  const trimmed = prompt.trim();
  const len = trimmed.length;
  const lower = trimmed.toLowerCase();
  const heavyKw = /\b(analyz|analyse|explain in detail|deep dive|deep-dive|debug|refactor|architect|prove|derive|full breakdown|essay|thesis|business plan|roadmap|long version|elaborate)\b/;
  const codey = /```|\bfunction\s|\bclass\s|\bimport\s|\berror:|stack trace/i;
  const wantsDeep = len > 900 || heavyKw.test(lower) || codey.test(trimmed);
  if (!wantsDeep) return null;
  if (cur.tier === "deep") return null;
  // pick a deep model from the same vendor if possible
  const deepSameVendor = SASA_MODELS.find((m) => m.tier === "deep" && m.vendor === cur.vendor);
  const deep = deepSameVendor ?? SASA_MODELS.find((m) => m.id === "google/gemini-3.1-pro-preview")!;
  if (deep.costWeight <= cur.costWeight) return null;
  const reasonBits: string[] = [];
  if (len > 900) reasonBits.push(`long prompt (${len} chars)`);
  if (heavyKw.test(lower)) reasonBits.push("looks like deep analysis");
  if (codey.test(trimmed)) reasonBits.push("code / debugging content");
  return {
    suggested: deep.id,
    reason: `${reasonBits.join(", ")} — ${deep.label} will burn a bit more but reason much better. Use it for this reply?`,
  };
}