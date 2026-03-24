/**
 * Offline word square generator
 * Run once: npx tsx scripts/generate-squares.ts
 * Output: lib/games/wordSquares.json (committed to repo)
 *
 * A word square is a 5x5 grid where every row AND every column is a valid word.
 * This equals the constraint for a fully-open 5x5 crossword grid.
 * Uses symmetric backtracking: word at row r must have word[c] === placed[c][r]
 */

import * as fs from "fs";
import * as path from "path";
import { getWordBank } from "./crosswordWordList";

// ─── Word list ────────────────────────────────────────────────────────────────
// Curated additions: common 5-letter words with varied letter distributions
// Focus on words with common letters at each position to increase square density

const CROSSWORD_WORDS = [
  // Common at position 0
  "ABOUT","ABOVE","ACTOR","AFTER","AGAIN","AGREE","AHEAD","ALARM","ALERT","ALIEN",
  "ALIGN","ALIVE","ALLOW","ALONE","ALONG","ALTER","ANGEL","ANGER","ANGLE","ANKLE",
  "APPLY","ARENA","ARGUE","ARISE","ARMOR","AROMA","BASIC","BASIN","BATCH","BEACH",
  "BENCH","BIRTH","BLAME","BLAND","BLANK","BLAST","BLAZE","BLEND","BLESS","BLIND",
  "BLOCK","BLOOD","BLOOM","BLUSH","BONUS","BOOST","BOUND","BRACE","BRAIN","BRAND",
  "BRAVE","BREAD","BREAK","BRICK","BRIEF","BRING","BROAD","BROOK","BROWN","BRUSH",
  "BUILT","BURST","BUYER","CANDY","CARGO","CARRY","CATCH","CAUSE","CHALK","CHART",
  "CHASE","CHEAP","CHECK","CHEER","CHESS","CHEST","CHIEF","CHILD","CLAIM","CLASS",
  "CLEAN","CLEAR","CLERK","CLIFF","CLIMB","CLOCK","CLONE","CLOSE","CLOUD","COACH",
  "COAST","COUNT","COURT","COVER","CRACK","CRAFT","CRANE","CRASH","CRAZY","CREAM",
  "CREEK","CREST","CRIME","CROSS","CROWD","CRUSH","CURVE","CYCLE","DAILY","DANCE",
  "DEATH","DELAY","DENSE","DEPTH","DOUBT","DRAFT","DRAIN","DRAMA","DREAM","DRESS",
  "DRIFT","DRINK","DRIVE","DROWN","EAGLE","EARLY","EARTH","ELDER","ELECT","ELITE",
  "EMPTY","ENJOY","ENTRY","EQUAL","ERROR","ESSAY","FAINT","FALSE","FANCY","FEAST",
  "FERRY","FETCH","FIELD","FIGHT","FINAL","FIRST","FIXED","FLAME","FLASH","FLEET",
  "FLESH","FLOAT","FLOOR","FLOUR","FLUID","FOCUS","FORCE","FORGE","FORUM","FOUND",
  "FRAME","FRANK","FRESH","FRONT","FROST","FRUIT","GHOST","GIVEN","GLASS","GLOBE",
  "GLOOM","GLOVE","GRACE","GRADE","GRAIN","GRAND","GRAPH","GRASP","GRAVE","GREAT",
  "GREEN","GRIEF","GROUP","GROVE","GROWN","GUARD","GUEST","GUILT","HAPPY","HARSH",
  "HAVEN","HEART","HEAVY","HERBS","HONOR","HORSE","HOTEL","HOUSE","HUMAN","HUMOR",
  "IDEAL","IMAGE","INDEX","INNER","INPUT","ISSUE","IVORY","JELLY","JUICE","KNIFE",
  "KNOCK","KNOWN","LABEL","LANCE","LATER","LAUGH","LAYER","LEARN","LEASE","LEGAL",
  "LEVEL","LIGHT","LIMIT","LOCAL","LODGE","LOGIC","LOOSE","LOWER","LUCKY","MAGIC",
  "MAKER","MANOR","MARCH","MAYOR","MEDIA","MERCY","MERGE","MERIT","METAL","MIXER",
  "MODEL","MONEY","MONTH","MORAL","MOTOR","MOUSE","MOUTH","MOVIE","MURAL","MUSIC",
  "NAIVE","NERVE","NEVER","NIGHT","NOBLE","NOISE","NORTH","NOTED","NOVEL","NURSE",
  "OCEAN","OFFER","OFTEN","ORDER","OUTER","OZONE","PAINT","PAUSE","PEACE","PEARL",
  "PHASE","PHONE","PHOTO","PIANO","PILOT","PLACE","PLAIN","PLANE","PLANT","POINT",
  "POLAR","POWER","PRESS","PRICE","PRIDE","PRIME","PRINT","PROBE","PRONE","PROOF",
  "PROSE","PROUD","PROVE","PROXY","PULSE","PUNCH","QUEEN","QUEST","QUICK","QUIET",
  "QUOTA","QUOTE","RABBI","RADAR","RADIO","RAISE","RALLY","RANGE","RAPID","REACH",
  "REACT","REALM","REFER","RELAY","RIDGE","RIGHT","RISKY","ROBIN","ROUND","ROUTE",
  "ROYAL","RULER","RURAL","SAINT","SALON","SAUCE","SCENE","SCOPE","SCORE","SENSE",
  "SERVE","SEVEN","SHAFT","SHAME","SHAPE","SHARE","SHARP","SHIFT","SHINE","SHIRT",
  "SHORE","SHORT","SHOUT","SIGHT","SINCE","SKILL","SLATE","SLAVE","SLEEP","SLICE",
  "SLIDE","SLOPE","SMART","SMILE","SMOKE","SNAKE","SOLVE","SORRY","SOUTH","SPACE",
  "SPARE","SPARK","SPEAK","SPEND","SPIKE","SPINE","SPOKE","SPOON","SPORT","SPRAY",
  "SQUAD","STACK","STAFF","STAGE","STAIN","STAIR","STAKE","STALE","STAMP","STAND",
  "STARE","START","STATE","STEAL","STEAM","STEEL","STEEP","STEER","STERN","STICK",
  "STIFF","STILL","STOCK","STONE","STOOD","STOOL","STORM","STORY","STOUT","STOVE",
  "STRAP","STRAW","STRIP","STUCK","STUDY","STUMP","STYLE","SUGAR","SUNNY","SUPER",
  "SURGE","SWEAR","SWEAT","SWEEP","SWEET","SWIFT","SWING","SWORD","TABLE","TASTE",
  "TEACH","TENSE","THICK","THINK","THOSE","THREE","TIRED","TITLE","TODAY","TOKEN",
  "TORCH","TOTAL","TOUCH","TOUGH","TOWER","TRACK","TRADE","TRAIL","TRAIN","TRAIT",
  "TRICK","TROOP","TRUST","TRUTH","TWICE","TWIST","UNDER","UNION","UNITE","UNTIL",
  "UPPER","UPSET","USUAL","UTTER","VALID","VALUE","VAULT","VAPOR","VERSE","VIDEO",
  "VIGOR","VIRAL","VIRUS","VISIT","VITAL","VIVID","VOICE","VOTER","WASTE","WATCH",
  "WATER","WEAVE","WEDGE","WEIRD","WHITE","WHOLE","WIDEN","WITTY","WORLD","WORRY",
  "WORSE","WORST","WORTH","WOULD","WOUND","WROTE","YACHT","YIELD","YOUNG","YOUTH",
  // Additional crossword-friendly words
  "ABOUT","ABODE","ABOVE","ABUSE","ACUTE","ADORE","ADULT","AILED","AIRED","AISLE",
  "AMBLE","AMPLE","APPLE","APTLY","ARGUE","AROSE","ATONE","ATTIC","AUDIT","AVERT",
  "BESET","BRAVE","BREVE","BRIDE","BRINE","BUILT","CABLE","CHIDE","CHIVE","CLOSE",
  "CLONE","CLOVE","CRONE","CROSS","DROVE","DWELL","DWELT","EASEL","EASED","ELDER",
  "ELIDE","EMOTE","EPOXY","ERODE","EVADE","EVOKE","FABLE","FACET","FAMED","FIBRE",
  "FILED","FINAL","FIORD","FIRED","FIXED","FLIER","FILED","FOIST","FORTE","FORTY",
  "FROZE","FRUGAL","GABLE","GATOR","GENRE","GLARE","GLIDE","GRAZE","GUILE","GUISE",
  "HASTE","HERON","HOIST","IRATE","IRKED","ISLET","JOUST","KNAVE","LAPSE","LARVA",
  "LASER","LATCH","LATENT","LATHED","LITRE","LOFTY","LOVER","LUSTRE","MATTE","MOTIF",
  "NAIVE","NAVEL","NINETY","NOBLE","NONCE","NOTER","OBESE","OCTET","OPINE","OVATE",
  "PACED","PAVED","PEDAL","PERCH","PETTY","POISE","POSED","POSIT","POSTE","PRIVY",
  "RACED","RAGED","RATED","RAVEL","RAVED","RECTO","REFIT","RELAX","REPAY","RESIN",
  "REVEL","RIPEN","RISEN","RIVET","RIVEN","ROVER","RULED","RUMEN","SADLY","SALVE",
  "SAVED","SAVOR","SCONE","SETUP","SIREN","SIZED","SKIMP","SLAIN","SLANT","SLEPT",
  "SLIME","SLUNK","SMITE","SNARE","SNIDE","SPIED","SPITE","SPLIT","SPOKE","SPURN",
  "STAID","STALE","STANK","STEAD","STERN","STIFFEN","STOMP","STONE","STUNG","SUAVE",
  "SWIPE","TAKEN","TAMED","TAPED","TAPER","TARDY","TENET","TEPID","TERSE","TITHE",
  "TILED","TIMED","TOPER","TOTEM","TRIPE","TROVE","TUNED","ULCER","UNDUE","UNFIT",
  "UNTIE","UNWED","USURP","VAGUE","VALET","VIPER","VISIT","VISOR","VITAL","VOGUE",
  "VOILE","VYING","WAGED","WAGER","WANED","WAVER","WIDER","WIRED","WITTY","WOKEN",
];

const bank = getWordBank(undefined);
const themed = bank.filter(w => w.word.length === 5).map(w => w.word);
const allWords = [...new Set([...themed, ...CROSSWORD_WORDS])].sort();
const wordSet = new Set(allWords);

console.log(`Total words: ${allWords.length}`);

// Build position index
const posLetIdx: string[][][] = Array.from({ length: 5 }, (_, pos) =>
  Array.from({ length: 26 }, (_, li) => {
    const l = String.fromCharCode(65 + li);
    return allWords.filter(w => w[pos] === l);
  })
);

const li = (c: string) => c.charCodeAt(0) - 65;

// Word square backtracking
const squares: string[][] = [];
const TARGET = 200;

function solve(placed: string[]): void {
  if (squares.length >= TARGET) return;
  const r = placed.length;
  if (r === 5) { squares.push([...placed]); return; }

  const used = new Set(placed);
  let cands = allWords.filter(w => !used.has(w));

  // Symmetric constraint: word[c] === placed[c][r] for c < r
  for (let c = 0; c < r; c++) {
    const required = placed[c][r];
    cands = cands.filter(w => w[c] === required);
    if (cands.length === 0) return;
  }

  // 1-step lookahead
  cands = cands.filter(w => {
    for (let f = r + 1; f < 5; f++) {
      if (posLetIdx[r][li(w[f])].length === 0) return false;
    }
    return true;
  });

  cands.sort(() => Math.random() - 0.5);

  for (const w of cands) {
    if (squares.length >= TARGET) return;
    placed.push(w);
    solve(placed);
    placed.pop();
  }
}

console.log("Generating...");
const t = Date.now();
// Run multiple times with different random seeds to get more variety
for (let seed = 0; seed < 20 && squares.length < TARGET; seed++) {
  solve([]);
}
const elapsed = Date.now() - t;

// Deduplicate
const seen = new Set<string>();
const unique = squares.filter(sq => {
  const key = sq.join("|");
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Validate
const valid = unique.filter(sq =>
  sq.every(w => wordSet.has(w)) &&
  Array.from({ length: 5 }, (_, c) => sq.map(r => r[c]).join("")).every(c => wordSet.has(c))
);

console.log(`Found ${valid.length} unique valid squares in ${elapsed}ms`);
if (valid.length > 0) {
  console.log("Sample:");
  for (const row of valid[0]) console.log(" ", row);
}

// Save
const outPath = path.join(__dirname, "wordSquares.json");
fs.writeFileSync(outPath, JSON.stringify({
  squares: valid,
  count: valid.length,
  generatedAt: new Date().toISOString(),
  wordBankSize: allWords.length,
}, null, 2));
console.log(`\nSaved ${valid.length} squares to wordSquares.json`);
