import type { Intent, Sentiment } from "@petal/core";
import { normalizeText } from "./normalize";
import { LEXICON_MODEL, LEXICON_VERSION } from "./constants";
import type { Classification, Classifier, ClassifyResult } from "./classifier";

/**
 * Keyword-based degradation scorer (plan §9, §13). This is the "never stall"
 * path: when the daily LLM budget is spent, the model output is unusable, or a
 * re-hydrated row is still empty, enrichment falls back here and the result is
 * flagged `method: "lexicon"` upstream. Deliberately simple and dependency-free
 * — it must run without a network or a key. Includes Roman-Urdu / mixed
 * Urdu-English cues, a genuine slice of Omahi's audience (plan L8).
 */

const has = (text: string, terms: readonly string[]): boolean => terms.some((t) => text.includes(t));
const count = (text: string, terms: readonly string[]): number =>
  terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);

// Intent cues — checked in precedence order (spam first, "other" last).
const SPAM = [
  "link in bio",
  "dm me",
  "check my profile",
  "free audit",
  "passive income",
  "followers",
  "crypto",
  "supplier",
  "10x their",
  "grow your page",
] as const;
const PURCHASE = [
  "where do i get",
  "where to get",
  "install",
  "installing",
  "installed",
  "download",
  "store link",
  "sign up",
  "buy",
  "get this",
  "install kar",
  "install karun",
  "install karungi",
  "install kiya",
  "kahan se",
] as const;
const QUESTION = [
  "?",
  "how do",
  "how does",
  "can i",
  "can you",
  "is there",
  "does this",
  "do i need",
  "what happens",
  "which ",
  "kya ",
  "kaise",
  "kahan",
  "kab ",
  "batao",
  "bataye",
] as const;
const COMPLAINT = [
  "off by",
  "disappeared",
  "slower",
  "frustrating",
  "annoying",
  "annoyed",
  "reset my",
  "doesn't work",
  "does not work",
  "broken",
  "bug",
  "still shows",
  "theek karun",
  "peechay",
  "nahi hota",
  "dukhti",
] as const;
const FEATURE = ["any plans for", "wish", "would be", "could there", "please add", "support when", "feature", "option"] as const;

// Sentiment cues.
const POSITIVE = [
  "love",
  "obsessed",
  "gorgeous",
  "beautiful",
  "great",
  "amazing",
  "impressed",
  "perfect",
  "recommend",
  "favorite",
  "comforting",
  "respect",
  "pyari",
  "khubsurat",
  "zabardast",
  "mashallah",
  "accurate",
  "calm",
  "finally",
] as const;
const NEGATIVE = [
  "off by",
  "disappeared",
  "slower",
  "frustrating",
  "annoying",
  "annoyed",
  "creepy",
  "skeptical",
  "doubt",
  "subpoenaed",
  "worse",
  "hurts",
  "brutal",
  "dukhti",
  "qasoor",
] as const;

const intentOf = (text: string): Intent => {
  if (has(text, SPAM)) return "spam";
  if (has(text, PURCHASE)) return "purchase_intent";
  if (has(text, COMPLAINT)) return "complaint";
  if (has(text, QUESTION)) return "question";
  if (has(text, FEATURE)) return "question"; // feature asks read as questions in the union
  if (has(text, POSITIVE)) return "praise";
  return "other";
};

const sentimentOf = (text: string, intent: Intent): Sentiment => {
  const pos = count(text, POSITIVE);
  const neg = count(text, NEGATIVE);
  if (pos > 0 && neg > 0) return "mixed";
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  if (intent === "praise") return "positive";
  if (intent === "complaint") return "negative";
  return "neutral";
};

/** Score one text; low-confidence by construction (it is a keyword heuristic). */
export const lexiconScore = (text: string): Classification => {
  const t = normalizeText(text).toLowerCase();
  if (t === "") return { sentiment: "neutral", intent: "other", confidence: 0.2 };
  const intent = intentOf(t);
  const sentiment = sentimentOf(t, intent);
  const matched = count(t, [...POSITIVE, ...NEGATIVE]) + (intent === "other" ? 0 : 1);
  const confidence = Math.min(0.6, 0.35 + matched * 0.05);
  return { sentiment, intent, confidence };
};

/** A `Classifier` backed entirely by {@link lexiconScore} — zero cost, no network. */
export const createLexiconClassifier = (): Classifier => ({
  model: LEXICON_MODEL,
  classify: (texts): Promise<ClassifyResult> =>
    Promise.resolve({ results: texts.map(lexiconScore), costUsd: 0, model: LEXICON_MODEL }),
});

export { LEXICON_MODEL, LEXICON_VERSION };
