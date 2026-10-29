// Usage: node tools/validate-tajweed.js
// Validates js/tajweed.js against the whole Qur'an text in data/quran/*.json.
const fs = require("fs"), path = require("path");
const T = require("../js/tajweed.js");
const ROOT = path.join(__dirname, "..", "data", "quran");
const load = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, `${n}.json`), "utf8")).verses;

let verses = 0, roundTripFail = 0;
const counts = Object.fromEntries(T.RULES.map((r) => [r.id, 0]));
const consistency = { openTanweenNoRule: [], plainTanweenWithRule: [], bareNoonNoRule: [], sukunNoonRuleLetter: [], bareMeemNoRule: [] };
const OPEN = new Set([0x656, 0x657, 0x65e]);

for (let n = 1; n <= 114; n += 1) {
  for (const v of load(n)) {
    verses += 1;
    const segs = T.segments(v.text);
    if (segs.map((s) => s.text).join("") !== v.text) roundTripFail += 1;
    for (const s of segs) if (s.rule) counts[s.rule] += 1;

    // --- consistency with the mushaf's own markings (non-final words only) ---
    const { words } = T.analyze(v.text);
    const lettered = words.map((w) => w.filter((t) => t.base));
    const nextWordFirst = (wi) => { for (let k = wi + 1; k < words.length; k += 1) if (lettered[k].length) return lettered[k][0]; return null; };
    for (let wi = 0; wi < lettered.length; wi += 1) {
      const lets = lettered[wi];
      lets.forEach((t, ti) => {
        const trailing = lets.slice(ti + 1).every((x) => x.base === "ا" || x.base === "ى") && (t.openTanween || t.smallMeem || /[\u064B\u064C\u064D]/.test(t.text));
        const next = (ti === lets.length - 1 || trailing) ? nextWordFirst(wi) : lets[ti + 1];
        if (!next) return; // verse end = stop
        const cp = [...t.text].map((c) => c.codePointAt(0));
        const ref = `${n}:${v.id} ${lets.map((x) => x.text).join("")} → ${next.base}`;
        if (t.openTanween && !t.rule && !"ءهعحغخاٱأإ".includes(next.base)) consistency.openTanweenNoRule.push(ref);
        const plain = cp.some((c) => c === 0x64b || c === 0x64c || c === 0x64d);
        if (plain && t.rule) consistency.plainTanweenWithRule.push(ref);
        if (t.base === "ن" && t.bare && !t.rule && !"ءهعحغخاٱأإ".includes(next.base)) consistency.bareNoonNoRule.push(ref);
        if (t.base === "ن" && t.sukun && ti < lets.length - 1 || (t.base === "ن" && t.sukun)) {
          if (T.IKHFA.has(next.base) || T.IDGHAM_GHUNNAH.has(next.base) || T.IDGHAM_BILA.has(next.base) || next.base === "ب") consistency.sukunNoonRuleLetter.push(ref);
        }
        if (t.base === "م" && t.bare && !t.rule && !"ءهعحغخاٱأإ".includes(next.base)) consistency.bareMeemNoRule.push(ref);
      });
    }
  }
}
console.log(`verses analysed: ${verses}   round-trip failures: ${roundTripFail}`);
console.log("\ncolored runs per rule across the whole Qur'an:");
for (const r of T.RULES) console.log(`  ${r.id.padEnd(15)} ${String(counts[r.id]).padStart(6)}`);
console.log("\nself-consistency with the mushaf's own marking (should be ~0):");
for (const [k, list] of Object.entries(consistency)) console.log(`  ${k.padEnd(22)} ${String(list.length).padStart(5)}   ${list.slice(0, 4).join("  |  ")}`);

// ---- known textbook examples: [surah, verse, rule, expected colored text (letters, with marks)] ----
const find = (s, v, rule) => T.segments(load(s)[v - 1].text).filter((x) => x.rule === rule).map((x) => x.text);
const strip = (t) => t.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
const cases = [
  [112, 1, "qalqalah", "د", "verse-final dal (Ahad)"],
  [112, 2, "qalqalah", "د", "verse-final dal (Samad)"],
  [112, 3, "qalqalah", "د", "yalid has sukun on dal"],
  [112, 4, "idgham-bila", "ن ل", "yakun lahu: noon + lam"],
  [108, 3, "qalqalah", "ب", "al-abtar: ba with sukun"],
  [2, 27, "qalqalah", "ق", "yaqta'un: qaf with sukun"],
  [2, 5, "idgham-ghunnah", "د م", "hudan min: tanween + meem"],
  [2, 5, "idgham-bila", "ن ر", "min rabbihim: noon + ra"],
  [2, 2, "idgham-bila", "د ل", "hudan lil-muttaqin: tanween + lam"],
  [2, 27, "iqlab", "ن", "min ba'di"],
  [2, 96, "iqlab", "ر", "basirun bima (tanween before ba)"],
  [2, 60, "mithlayn", "ب ب", "idrib bi-asaka: ba + ba"],
  [2, 8, "ghunnah", "ن", "inna / ummah style shaddah noon"],
  [114, 1, "ghunnah", "ن", "an-nas: noon with shaddah"],
];
console.log("\nknown examples:");
let ok = 0;
for (const [s, v, rule, expect, note] of cases) {
  const got = find(s, v, rule).map(strip);
  const wanted = expect.split(" ");
  const pass = wanted.every((w) => got.some((g) => g.includes(w)));
  if (pass) ok += 1;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${s}:${v} ${rule.padEnd(15)} ${note}  (got: ${got.join(" ")})`);
}
console.log(`\nknown examples: ${ok}/${cases.length}`);
