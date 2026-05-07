// =============================================================================
// lib/gemini.ts — Google Gemini SDK Client Factory
// =============================================================================
// Centralises Gemini SDK initialisation so the API key is read from env vars
// in exactly ONE place. The client is module-level (effectively a singleton),
// because the GoogleGenerativeAI constructor is cheap and stateless.
// =============================================================================

import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  // Fail loudly at startup rather than with a cryptic runtime error later.
  throw new Error("[gemini] GEMINI_API_KEY environment variable is not set.");
}

// ─── SDK CLIENT ───────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── ROAST GENERATION CONFIG ─────────────────────────────────────────────────
// Tuning parameters specific to the "Roast Engine" persona.
// Temperature close to 1.0 maximises creativity / variance — we WANT surprises.
const ROAST_GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.95,       // High creativity
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 256,    // Roasts should be punchy and short
  responseMimeType: "application/json", // Ask Gemini to respond in JSON directly
};

// ─── ROAST ENGINE SYSTEM PROMPT ──────────────────────────────────────────────
// The persona instruction that shapes ALL roast completions.
// Keeping it here (not in the API route) makes it easy to A/B test personas.
export const ROAST_SYSTEM_INSTRUCTION = `
You are "Professor Pepper" — a brutally sarcastic AI academic weapon.
You roast distracted high-school students who tried to access forbidden websites
while in a Focus Session instead of studying science.

RULES:
1. Respond ONLY with a valid JSON object — no markdown, no explanation.
2. The JSON must have exactly two keys:
   - "line1": The first line of the roast (English or Bengali, your choice).
   - "line2": The second, more cutting line (switch language from line1).
3. Each line must be < 100 characters.
4. Be brutally sarcastic, ego-deflating, and darkly funny.
5. Reference the specific site the user tried to visit.
6. Never be kind. Never be encouraging. ROAST.

Example output:
{
  "line1": "Ah, Facebook during a quantum physics session — genius move.",
  "line2": "তোর ভবিষ্যৎ এখন meme scroll করার মতোই empty।"
}
`.trim();

// ─── getGeminiRoastModel ──────────────────────────────────────────────────────
// Returns a configured GenerativeModel instance ready for roast generation.
// Call this inside the API route — do NOT cache the model instance globally
// because generation configs could vary per-request in future.
export function getGeminiRoastModel() {
  return genAI.getGenerativeModel({
    model: "gemini-1.5-flash", // Flash is cheaper + fast enough for short roasts
    systemInstruction: ROAST_SYSTEM_INSTRUCTION,
    generationConfig: ROAST_GENERATION_CONFIG,
  });
}

// ─── TYPE: RoastResponse ─────────────────────────────────────────────────────
// The shape Gemini is instructed to return (and what our API route validates).
export interface RoastResponse {
  line1: string;
  line2: string;
}
