import { type MentionEvent, type MentionSource, mentionEventSchema } from "@petal/core";

/**
 * Synthetic Omahi conversation: 80 mention events across all four sources,
 * spread over the trailing 14 days relative to seed time so charts always
 * look alive (plan WP1). Roman Urdu / mixed Urdu-English entries reflect a
 * genuine part of Omahi's audience.
 */

export const FIXTURE_ACCOUNT_ID = "acct_omahi";

export const OWNED_MEDIA_CAPTIONS = [
  "Meet Omahi — your cycle, on every new tab.",
  "Local-only by design: how Omahi keeps your data yours",
  "Phase colors, explained",
  "Why we will never ask you to create an account",
  "Luteal phase survival kit, new-tab edition",
] as const;

type Seed = {
  readonly author: string | null;
  readonly source: MentionSource;
  readonly text: string;
  /** hours before seed time, 0–336 (14 days) */
  readonly h: number;
  /** index into OWNED_MEDIA_CAPTIONS, when the mention hangs off an owned post */
  readonly media?: number;
};

const S: readonly Seed[] = [
  // --- praise ---
  { author: "lena.codes", source: "own_comment", text: "Love that everything stays on my device. No account, no cloud, exactly how it should be.", h: 2, media: 1 },
  { author: "cyclesyncedlife", source: "own_comment", text: "Just installed, obsessed. First tracker that doesn't feel creepy.", h: 26, media: 0 },
  { author: "minimal_tabs", source: "hashtag_media", text: "Day 3 with #omahi and I actually know what phase I'm in without opening an app.", h: 31 },
  { author: "newtab_nerd", source: "own_comment", text: "The gradient on luteal days is weirdly comforting. Great work.", h: 44, media: 2 },
  { author: "sana.builds", source: "caption_mention", text: "Small tools that respect you are rare. @omahi.app is one of them.", h: 58 },
  { author: "quietsoftware", source: "own_comment", text: "This is what calm technology looks like. No streaks, no guilt, just information.", h: 70, media: 3 },
  { author: "tabgarden", source: "hashtag_media", text: "My new tab finally earns its place. #omahi #newtabextension", h: 85 },
  { author: "roshni_dev", source: "own_comment", text: "Recommended this to my whole group chat. The no-account thing sold everyone.", h: 96, media: 3 },
  { author: "ovulation_nation", source: "own_comment", text: "Predicted my ovulation day exactly right this month. Impressed.", h: 120, media: 2 },
  { author: "browsertweaks", source: "hashtag_media", text: "Reviewed 12 new tab extensions this month. #omahi is the only one I kept.", h: 140 },
  { author: "girlwhocodes_", source: "own_comment", text: "The phase card is gorgeous. Whoever designed this deserves a raise.", h: 160, media: 0 },
  { author: "softwaregardener", source: "caption_mention", text: "Been using @omahi.app for two weeks. It does one thing and does it beautifully.", h: 190 },
  { author: "lowtechlife", source: "own_comment", text: "Finally deleted the tracker app that kept selling my data. This replaces it completely.", h: 210, media: 1 },
  { author: "amna.reads", source: "own_comment", text: "The luteal survival kit post was hilarious and accurate. More of this please.", h: 230, media: 4 },
  { author: "pixel_priya", source: "hashtag_media", text: "Aesthetic AND useful. Rare combo. #cycletracking", h: 260 },
  { author: "steadyhabits", source: "own_comment", text: "Two cycles in, predictions keep getting better. It learns quietly. Love it.", h: 290, media: 2 },
  { author: "casual_carrie", source: "own_comment", text: "I don't even track seriously and I still love seeing the phase color change.", h: 310, media: 0 },
  { author: "thebrowsergal", source: "caption_mention", text: "New favorite extension alert: @omahi.app. My tab group thanks me.", h: 330 },

  // --- questions ---
  { author: "tabfresh", source: "own_comment", text: "Does this sync across devices or is it per browser?", h: 3, media: 0 },
  { author: "devdaisy", source: "own_comment", text: "Is my data actually private? What happens to it when I uninstall?", h: 25, media: 1 },
  { author: "curious_cat22", source: "own_comment", text: "How does it predict phases without asking a million questions?", h: 50, media: 2 },
  { author: "healthnerd_hs", source: "own_comment", text: "Can I export my data somewhere? Want to show my doctor.", h: 74, media: 1 },
  { author: "spreadsheet_sam", source: "own_comment", text: "What algorithm do you use for predictions? Genuinely curious.", h: 98, media: 2 },
  { author: "modest_muser", source: "comment_mention", text: "@omahi.app does it work if my cycle is all over the place?", h: 122 },
  { author: "nightowl_nadia", source: "own_comment", text: "Is there a dark mode? The white flash at 2am is brutal.", h: 150, media: 0 },
  { author: "privacy_prof", source: "own_comment", text: "Which permissions does the extension actually request and why?", h: 175, media: 1 },
  { author: "new_here_nina", source: "own_comment", text: "Just found this. Do I need to log anything daily or does it just work?", h: 200, media: 0 },
  { author: "skeptical_sister", source: "comment_mention", text: "@omahi.app what happens on shared computers? Can my brother see my cycle??", h: 245 },
  { author: "genuinely_asking", source: "own_comment", text: "Is this medically reviewed or vibes-based? Honest question.", h: 280, media: 2 },

  // --- feature requests ---
  { author: "firefoxfaithful", source: "own_comment", text: "Any plans for Firefox support? Would install today.", h: 14, media: 0 },
  { author: "gadgetgrrl", source: "own_comment", text: "Gorgeous design, but I wish the phase card was smaller. It takes over the whole tab.", h: 16, media: 2 },
  { author: "safari_sailor", source: "own_comment", text: "Safari version when? Some of us are stuck in the Apple garden.", h: 105, media: 0 },
  { author: "widget_wisher", source: "own_comment", text: "A tiny mood log would be perfect. Nothing heavy, just an emoji a day.", h: 130, media: 4 },
  { author: "notify_me_pls", source: "own_comment", text: "Optional heads-up a day before period start would be so useful.", h: 185, media: 2 },
  { author: "mobile_mona", source: "caption_mention", text: "Wish @omahi.app existed on my phone's browser too. Desktop only hurts.", h: 220 },
  { author: "partner_pete", source: "own_comment", text: "Could there be a discreet shared view? My wife wants me to stop asking questions.", h: 255, media: 3 },

  // --- purchase / install intent ---
  { author: "noorulain_x", source: "caption_mention", text: "Okay where do I get this?? My new tab has been a wasteland forever. @omahi.app", h: 6 },
  { author: "impulse_installer", source: "own_comment", text: "Sold. Installing right now.", h: 28, media: 1 },
  { author: "tab_collector", source: "hashtag_media", text: "Adding #omahi to the setup tonight, the screenshots alone convinced me", h: 62 },
  { author: "hana.switches", source: "own_comment", text: "Uninstalling my old tracker for this. Where's the migration guide?", h: 90, media: 1 },
  { author: "linkplease_lena", source: "comment_mention", text: "@omahi.app dropping the store link? Asking for me and three friends.", h: 145 },
  { author: "weekend_wanda", source: "own_comment", text: "Saved this post. Installing when I'm back at my laptop, promise.", h: 265, media: 0 },

  // --- complaints ---
  { author: "maya_reads", source: "own_comment", text: "The phase seems off by a day for me. Logged my start date twice and it still shows follicular.", h: 4, media: 2 },
  { author: "salikaz", source: "comment_mention", text: "@omahi.app my phase card disappeared after the last update. Reinstalled twice already.", h: 9 },
  { author: "grumpy_gwen", source: "own_comment", text: "New tab loads a beat slower since installing. Anyone else notice?", h: 55, media: 0 },
  { author: "syncless_in_seattle", source: "own_comment", text: "Set my cycle length on the laptop, desktop still shows defaults. Frustrating.", h: 112, media: 0 },
  { author: "detail_dana", source: "own_comment", text: "The tooltip says day 14 but the card says day 15. Which is it?", h: 170, media: 2 },
  { author: "quietly_annoyed", source: "own_comment", text: "Update reset my start date. Small thing but I had to dig for where to fix it.", h: 240, media: 3 },

  // --- privacy-skeptic ---
  { author: "privacywonk", source: "caption_mention", text: "Skeptical of any cycle app tbh, but @omahi.app being local-only is a good start. Watching.", h: 11 },
  { author: "datadoubter", source: "own_comment", text: "\"Local-only\" until the acquisition, right? Hope I'm wrong.", h: 80, media: 1 },
  { author: "burned_before", source: "own_comment", text: "The last tracker that promised privacy got subpoenaed. What's different here?", h: 155, media: 1 },
  { author: "vpn_vera", source: "hashtag_media", text: "Audited the network tab while using #omahi. Zero outbound calls. Receipts attached.", h: 225 },

  // --- spam ---
  { author: "growthhacks365", source: "comment_mention", text: "We help extensions 10x their installs. Check my profile for a free audit.", h: 18 },
  { author: "crypto_queen_x", source: "own_comment", text: "Ladies! Turn your cycle into passive income, DM me \"MOON\"", h: 135, media: 0 },
  { author: "followers4cheap", source: "own_comment", text: "Grow your page 5k followers weekly, link in bio", h: 250, media: 4 },
  { author: "dropship_dan", source: "hashtag_media", text: "Anyone selling wellness products? Hot supplier list #cycletracking", h: 300 },

  // --- sarcasm / mixed ---
  { author: "sarcastic_sam", source: "caption_mention", text: "Oh great, another extension that knows my body better than my doctor. (It's actually fine — @omahi.app keeps it all local, I checked.)", h: 49 },
  { author: "deadpan_dee", source: "own_comment", text: "Wow, can't wait for my browser to judge my luteal phase too. ...okay it's actually tasteful. Annoyed at how much I like it.", h: 115, media: 2 },
  { author: "eyeroll_emma", source: "own_comment", text: "Because what I needed was ANOTHER extension. Kept it though. It's good. Whatever.", h: 275, media: 0 },

  // --- Roman Urdu / mixed Urdu-English (genuine part of Omahi's audience) ---
  { author: "mahnoor.k", source: "own_comment", text: "yeh extension bohat pyari hai, install karte hi tab khubsurat lag gaya", h: 8, media: 0 },
  { author: "fatima_codes", source: "own_comment", text: "kya mera data sach mein browser se bahar nahi jata? confirm karo please", h: 22, media: 1 },
  { author: "areeba.z", source: "own_comment", text: "phase aik din peechay chal raha hai mera, kaise theek karun?", h: 36, media: 2 },
  { author: "hira_designs", source: "caption_mention", text: "behen ne recommend kiya tha @omahi.app, ab har tab pe cycle dikh raha hai, zabardast", h: 47 },
  { author: "zoya_skeptic", source: "own_comment", text: "yaar yeh privacy wala feature asli hai ya sirf marketing? koi tech wali behen bataye", h: 66, media: 1 },
  { author: "laiba.installs", source: "comment_mention", text: "@omahi.app install kar liya, ab dekhte hain kitna accurate hai", h: 78 },
  { author: "ammi_ki_beti", source: "own_comment", text: "Urdu support kab aa rahi hai? ammi ko English samajh nahi aati", h: 88, media: 0 },
  { author: "mashal.m", source: "own_comment", text: "mashallah kya design hai, minimal aur kaam ka", h: 102, media: 2 },
  { author: "sehar_speaks", source: "hashtag_media", text: "period tracker jo creepy nahi, finally yaar #omahi", h: 118 },
  { author: "irregular_iqra", source: "own_comment", text: "mera cycle irregular hai, yeh handle karta hai kya ya sirf perfect 28 din walon ke liye hai?", h: 138, media: 2 },
  { author: "raat_ki_rani", source: "own_comment", text: "dark mode hai kya is mein? raat ko aankhen dukhti hain white screen se", h: 165, media: 0 },
  { author: "do_computer", source: "own_comment", text: "sync nahi hota office aur ghar ke computer mein, thora annoying hai", h: 195, media: 0 },
  { author: "savings_sana", source: "own_comment", text: "free hai ya baad mein paise mangega? pehle batao phir install karungi", h: 215, media: 3 },
  { author: "edge_ki_awaz", source: "own_comment", text: "bhai yeh sirf Chrome pe kyun? Edge users ka kya qasoor hai", h: 235, media: 0 },
  { author: "teesra_din", source: "hashtag_media", text: "aaj teesra din hai use karte hue, ab tak predictions bilkul sahi #cycletracking", h: 270 },
  { author: "khud_check_kiya", source: "own_comment", text: "spam nahi hai yeh, maine khud network check kiya, sab local hi rehta hai", h: 320, media: 1 },

  // --- filling out the week ---
  { author: "tea_and_tabs", source: "own_comment", text: "Opened a new tab mid-meeting and my phase card said luteal. Explains the meeting.", h: 40, media: 4 },
  { author: "unfollowed_apps", source: "caption_mention", text: "Replaced three wellness apps with one quiet extension. @omahi.app gets it.", h: 128 },
  { author: "notes_by_noor", source: "own_comment", text: "acha yeh batao, cycle length change karne ka option kahan hai? mil nahi raha", h: 180, media: 2 },
  { author: "graceful_exit", source: "own_comment", text: "Tried it for a week, not for me — but respect for the no-account uninstall. Clean exit.", h: 296, media: 0 },
  { author: null, source: "hashtag_media", text: "New tab, but make it useful. #omahi #cycletracking", h: 12 },
];

const pad = (n: number): string => String(n).padStart(3, "0");

/** Deterministic events relative to `now`, so seeded charts always look alive. */
export function buildFixtureEvents(now: Date): MentionEvent[] {
  return S.map((s, i) => {
    const occurredAt = new Date(now.getTime() - s.h * 3_600_000).toISOString();
    const isComment = s.source === "own_comment" || s.source === "comment_mention";
    return mentionEventSchema.parse({
      id: `fx-${pad(i)}`,
      accountId: FIXTURE_ACCOUNT_ID,
      source: s.source,
      igObjectId: `${isComment ? "178" : "179"}${pad(i)}0000${s.h}`,
      mediaId: s.media !== undefined ? `media-${s.media}` : null,
      authorUsername: s.author,
      text: s.text,
      permalink: null,
      occurredAt,
      ingestedVia: i % 3 === 0 ? "poll" : "webhook",
      raw: { fixture: true },
    });
  });
}

export const FIXTURE_COUNT = S.length;
