import { buildFixtureEvents } from "@petal/fixtures";
import type { Intent, Sentiment } from "@petal/core";

/**
 * The labeled evaluation set (plan §9, §12): 120 items = the 80 WP1 fixture
 * mention events (imported, not copied — packages/fixtures is frozen) plus 40
 * extra items shipped here. Labels are held in a map keyed by event id so the
 * fixture texts stay the single source of truth; if a fixture text changes,
 * the label travels with its id. The extra 40 stress-test sarcasm, code-switched
 * Roman Urdu, spam and mixed feelings (plan L8).
 */

export type EvalLabel = { readonly sentiment: Sentiment; readonly intent: Intent };
export type EvalItem = { readonly id: string; readonly text: string; readonly label: EvalLabel };

const l = (sentiment: Sentiment, intent: Intent): EvalLabel => ({ sentiment, intent });

// Labels for the 80 fixture events, in dataset order (fx-000 … fx-079).
// Grouped by the dataset's own sections for auditability.
const FIXTURE_LABELS: readonly EvalLabel[] = [
  // praise (0–17)
  l("positive", "praise"), l("positive", "praise"), l("positive", "praise"), l("positive", "praise"),
  l("positive", "praise"), l("positive", "praise"), l("positive", "praise"), l("positive", "praise"),
  l("positive", "praise"), l("positive", "praise"), l("positive", "praise"), l("positive", "praise"),
  l("positive", "praise"), l("positive", "praise"), l("positive", "praise"), l("positive", "praise"),
  l("positive", "praise"), l("positive", "praise"),
  // questions (18–28)
  l("neutral", "question"), l("neutral", "question"), l("neutral", "question"), l("neutral", "question"),
  l("neutral", "question"), l("neutral", "question"), l("negative", "question"), l("neutral", "question"),
  l("neutral", "question"), l("neutral", "question"), l("neutral", "question"),
  // feature requests (29–35)
  l("neutral", "question"), l("mixed", "complaint"), l("neutral", "question"), l("positive", "question"),
  l("positive", "question"), l("negative", "question"), l("neutral", "question"),
  // purchase / install intent (36–41)
  l("positive", "purchase_intent"), l("positive", "purchase_intent"), l("positive", "purchase_intent"),
  l("neutral", "purchase_intent"), l("neutral", "purchase_intent"), l("positive", "purchase_intent"),
  // complaints (42–47)
  l("negative", "complaint"), l("negative", "complaint"), l("negative", "complaint"),
  l("negative", "complaint"), l("negative", "complaint"), l("negative", "complaint"),
  // privacy-skeptic (48–51)
  l("mixed", "other"), l("negative", "other"), l("negative", "question"), l("positive", "praise"),
  // spam (52–55)
  l("neutral", "spam"), l("neutral", "spam"), l("neutral", "spam"), l("neutral", "spam"),
  // sarcasm / mixed (56–58)
  l("mixed", "praise"), l("mixed", "praise"), l("mixed", "praise"),
  // Roman Urdu / mixed (59–74)
  l("positive", "praise"), l("neutral", "question"), l("negative", "complaint"), l("positive", "praise"),
  l("neutral", "question"), l("neutral", "purchase_intent"), l("neutral", "question"), l("positive", "praise"),
  l("positive", "praise"), l("neutral", "question"), l("negative", "question"), l("negative", "complaint"),
  l("neutral", "question"), l("negative", "question"), l("positive", "praise"), l("positive", "praise"),
  // filling out the week (75–79)
  l("positive", "praise"), l("positive", "praise"), l("negative", "complaint"), l("mixed", "other"),
  l("neutral", "other"),
];

// 40 extra labeled items shipped with the package (ex-000 … ex-039).
const EXTRAS: readonly EvalItem[] = [
  { id: "ex-000", text: "This is hands down the best new tab extension I've tried this year.", label: l("positive", "praise") },
  { id: "ex-001", text: "Does it work offline or do I need to be connected?", label: l("neutral", "question") },
  { id: "ex-002", text: "Crashed my browser twice today. Uninstalling.", label: l("negative", "complaint") },
  { id: "ex-003", text: "Just downloaded it, setting it up now!", label: l("positive", "purchase_intent") },
  { id: "ex-004", text: "Win a free iPhone!! Click the link in my bio now", label: l("neutral", "spam") },
  { id: "ex-005", text: "Oh sure, because I definitely needed my browser to track my period too. ...fine, it's good.", label: l("mixed", "praise") },
  { id: "ex-006", text: "bohat acha kaam kiya hai team ne, proud of you", label: l("positive", "praise") },
  { id: "ex-007", text: "yeh app paisa mangega future mein ya hamesha free rahega?", label: l("neutral", "question") },
  { id: "ex-008", text: "notification bilkul kaam nahi kar raha, bug hai shayad", label: l("negative", "complaint") },
  { id: "ex-009", text: "kahan se download karun? link do please", label: l("positive", "purchase_intent") },
  { id: "ex-010", text: "DM me MOON to double your money in 24h, ladies only", label: l("neutral", "spam") },
  { id: "ex-011", text: "The dark theme is stunning but it drains my battery a bit.", label: l("mixed", "complaint") },
  { id: "ex-012", text: "Is the source code open? I'd love to audit the privacy claims myself.", label: l("neutral", "question") },
  { id: "ex-013", text: "Been recommending this to everyone at work, such a clean idea.", label: l("positive", "praise") },
  { id: "ex-014", text: "Why is there no Android version? Feels like an afterthought.", label: l("negative", "question") },
  { id: "ex-015", text: "installed and honestly obsessed, phase colors are gorgeous", label: l("positive", "purchase_intent") },
  { id: "ex-016", text: "Grow 10k followers this week, cheapest rates, check profile", label: l("neutral", "spam") },
  { id: "ex-017", text: "It predicted my cycle wrong by three days this month. Disappointed.", label: l("negative", "complaint") },
  { id: "ex-018", text: "great concept but the onboarding was confusing and I almost gave up", label: l("mixed", "complaint") },
  { id: "ex-019", text: "kya yeh mere data ko kisi server pe bhejta hai? bas yeh confirm karna tha", label: l("neutral", "question") },
  { id: "ex-020", text: "mashallah such a thoughtful little tool, installing on all my devices", label: l("positive", "purchase_intent") },
  { id: "ex-021", text: "Wow, another wellness app collecting my data. ...oh wait, it's actually local. Nice.", label: l("mixed", "praise") },
  { id: "ex-022", text: "Can you add a widget for the current phase on the home screen?", label: l("neutral", "question") },
  { id: "ex-023", text: "absolutely love it, finally something that respects privacy", label: l("positive", "praise") },
  { id: "ex-024", text: "the app froze and lost all my logged dates, so frustrating", label: l("negative", "complaint") },
  { id: "ex-025", text: "where do I get this? my new tab is so boring right now", label: l("positive", "purchase_intent") },
  { id: "ex-026", text: "Free supplement samples for cycle health, DM for supplier list", label: l("neutral", "spam") },
  { id: "ex-027", text: "It's fine I guess. Nothing special but it doesn't get in the way.", label: l("neutral", "other") },
  { id: "ex-028", text: "yaar dark mode kab aayega? raat ko use karna mushkil hai", label: l("negative", "question") },
  { id: "ex-029", text: "beautiful design, questionable accuracy, but I'm keeping it for now", label: l("mixed", "praise") },
  { id: "ex-030", text: "How is my data stored exactly? Local storage or IndexedDB?", label: l("neutral", "question") },
  { id: "ex-031", text: "switched from a paid tracker to this and never looking back", label: l("positive", "purchase_intent") },
  { id: "ex-032", text: "the update completely broke the phase card for me", label: l("negative", "complaint") },
  { id: "ex-033", text: "sab keh rahe the accurate hai, maine try kiya, waqai zabardast", label: l("positive", "praise") },
  { id: "ex-034", text: "Make money from home! Ask me how, link below", label: l("neutral", "spam") },
  { id: "ex-035", text: "Do you plan to support multiple cycles or just one profile?", label: l("neutral", "question") },
  { id: "ex-036", text: "honestly a bit skeptical about the privacy promises but willing to try", label: l("mixed", "other") },
  { id: "ex-037", text: "just installed it, first impressions are really good", label: l("positive", "purchase_intent") },
  { id: "ex-038", text: "it keeps resetting my settings every time I restart chrome, annoying", label: l("negative", "complaint") },
  { id: "ex-039", text: "elegant, calm, and it doesn't nag me. exactly what I wanted.", label: l("positive", "praise") },
];

const FIXTURE_NOW = new Date("2026-07-21T12:00:00.000Z");

const fixtureItems: readonly EvalItem[] = buildFixtureEvents(FIXTURE_NOW).map((event, i) => {
  const label = FIXTURE_LABELS[i];
  if (label === undefined) throw new Error(`missing eval label for fixture index ${i}`);
  return { id: event.id, text: event.text, label };
});

/** Label lookup keyed by event id (fixtures + extras). */
export const evalLabels: Readonly<Record<string, EvalLabel>> = Object.fromEntries(
  [...fixtureItems, ...EXTRAS].map((item) => [item.id, item.label]),
);

/** The full 120-item labeled evaluation set. */
export const EVAL_SET: readonly EvalItem[] = [...fixtureItems, ...EXTRAS];
