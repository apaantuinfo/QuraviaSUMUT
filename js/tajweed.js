/*
 * Tajweed analysis of Uthmani (Tanzil-style) Arabic text.
 *
 * The mushaf text itself carries the tajweed decisions, and this engine reads them:
 *   - a noon/meem with NO mark at all is assimilated or hidden (idgham / ikhfa),
 *   - a sukun (ۡ) means the letter is pronounced clearly (izhar),
 *   - a small meem (ۢ ۭ) marks iqlab,
 *   - "open" tanween (ٗ ٖ ٞ) marks tanween that merges with the next letter, while a plain
 *     tanween (ً ٌ ٍ) is pronounced clearly.
 * The next letter then decides which rule applies. Verse ends are treated as a stop (waqf), so rules
 * that depend on the following word are not applied there.
 *
 * Rules (ids are also CSS class suffixes: .tj-<id>):
 *   ghunnah        noon/meem with shaddah
 *   idgham-ghunnah noon sakin / tanween + ي ن م و (across two words)
 *   idgham-bila    noon sakin / tanween + ل ر (across two words)
 *   mithlayn       two identical letters meet, the first one sakin (meem+meem, ba+ba, ...)
 *   iqlab          noon sakin / tanween + ب
 *   ikhfa          noon sakin / tanween + one of the 15 ikhfa letters
 *   ikhfa-shafawi  meem sakin + ب
 *   qalqalah       ق ط ب ج د with sukun, or as the last letter of a verse (stop)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Tajweed = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const RULES = [
    { id: "ghunnah", color: "#D4620A", label: "Ghunnah", name: "Ghunnah", colorName: "Oranye" },
    { id: "idgham-ghunnah", color: "#7B2FBE", label: "Idgham bi-ghunnah", name: "Idgham bi-ghunnah", colorName: "Ungu" },
    { id: "idgham-bila", color: "#6B737B", label: "Idgham bila-ghunnah", name: "Idgham bila-ghunnah", colorName: "Abu-abu" },
    { id: "mithlayn", color: "#A87C00", label: "Idgham mithlayn", name: "Idgham mithlayn", colorName: "Kuning" },
    { id: "iqlab", color: "#1565D8", label: "Iqlab", name: "Iqlab", colorName: "Biru" },
    { id: "ikhfa", color: "#D32F2F", label: "Ikhfa", name: "Ikhfa", colorName: "Merah" },
    { id: "ikhfa-shafawi", color: "#D81B8A", label: "Ikhfa shafawi", name: "Ikhfa shafawi", colorName: "Merah muda" },
    { id: "qalqalah", color: "#168A35", label: "Qalqalah", name: "Qalqalah", colorName: "Hijau" },
  ];

  const set = (chars) => new Set(chars.split(""));
  const IDGHAM_GHUNNAH = set("ينمو");
  const IDGHAM_BILA = set("لر");
  const IKHFA = set("تثجدذزسشصضطظفقك");
  const QALQALAH = set("قطبجد");
  // madd / silent letters can never be the first half of an idgham mithlayn
  const NOT_A_SOURCE = set("اىيوءأإؤئةٱآ");

  const BASE_LETTER = /[\u0621-\u063A\u0641-\u064A\u0671-\u06D3]/;
  // marks that change how a letter is pronounced; a letter without any of them is "bare"
  const STRUCTURAL = new Set([
    0x64b, 0x64c, 0x64d, 0x64e, 0x64f, 0x650, 0x651, 0x652, 0x653, 0x656, 0x657, 0x65e, 0x670, 0x6e1, 0x6e2, 0x6e5, 0x6e6, 0x6ed,
  ]);
  const OPEN_TANWEEN = new Set([0x656, 0x657, 0x65e]);
  const SMALL_MEEM = new Set([0x6e2, 0x6ed]);
  const SUKUN = new Set([0x652, 0x6e1]);

  function makeToken(base, marks, wordIndex) {
    const codes = [];
    for (const ch of marks) codes.push(ch.codePointAt(0));
    return {
      base,
      text: base + marks,
      wordIndex,
      bare: !codes.some((c) => STRUCTURAL.has(c)),
      shadda: codes.includes(0x651),
      sukun: codes.some((c) => SUKUN.has(c)),
      openTanween: codes.some((c) => OPEN_TANWEEN.has(c)),
      smallMeem: codes.some((c) => SMALL_MEEM.has(c)),
      rule: null,
    };
  }

  function tokenize(text) {
    const parts = text.split(/(\s+)/);
    const words = [];
    const layout = []; // [{ space: " " } | { word: index }]
    for (const part of parts) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) {
        layout.push({ space: part });
        continue;
      }
      const tokens = [];
      for (const ch of part) {
        if (BASE_LETTER.test(ch)) tokens.push(makeToken(ch, "", words.length));
        else if (tokens.length) {
          const last = tokens[tokens.length - 1];
          if (last.base === null) {
            last.text += ch; // another sign after a leading sign
          } else {
            const marks = last.text.slice(last.base.length) + ch;
            tokens[tokens.length - 1] = makeToken(last.base, marks, words.length);
          }
        } else tokens.push({ base: null, text: ch, wordIndex: words.length, rule: null }); // leading sign such as ۞
      }
      layout.push({ word: words.length });
      words.push(tokens);
    }
    return { words, layout };
  }

  /** options.verseEnd === false: the text is a loose phrase, so its last letter is not a verse-final stop. */
  function analyze(text, options) {
    const verseEnd = !options || options.verseEnd !== false;
    const { words, layout } = tokenize(text);
    const letterTokens = words.map((tokens) => tokens.filter((t) => t.base));

    // first lettered token of the next word that has letters
    const firstOfNextWord = (wi) => {
      for (let k = wi + 1; k < words.length; k += 1) if (letterTokens[k].length) return letterTokens[k][0];
      return null;
    };
    const claim = (token, rule) => {
      if (token && !token.rule) token.rule = rule;
    };

    for (let wi = 0; wi < words.length; wi += 1) {
      const lets = letterTokens[wi];
      for (let ti = 0; ti < lets.length; ti += 1) {
        const token = lets[ti];
        // Tanween (and small-meem iqlab) sits on the carrier letter, which may be followed by a silent
        // trailing alif / alif maqsura (هُدٗى, نَارٗا): those do not count as "the next letter".
        const carriesTanween = token.openTanween || token.smallMeem;
        const onlyTrailingMadd = lets.slice(ti + 1).every((t) => t.base === "ا" || t.base === "ى");
        const atWordEnd = ti === lets.length - 1 || (carriesTanween && onlyTrailingMadd);
        const inWordNext = atWordEnd ? null : lets[ti + 1] || null;
        const crossNext = atWordEnd ? firstOfNextWord(wi) : null;
        const next = inWordNext || crossNext;
        const isCross = !inWordNext && Boolean(crossNext);

        // --- iqlab: small meem written on the noon or on the tanween carrier
        if (token.smallMeem) {
          if (next) claim(token, "iqlab");
          continue;
        }

        const noonSakin = token.base === "ن" && token.bare;
        if (noonSakin || token.openTanween) {
          if (!next) continue; // verse end = stop: no rule
          const letter = next.base;
          if (IDGHAM_GHUNNAH.has(letter) || IDGHAM_BILA.has(letter)) {
            if (isCross) {
              const rule = IDGHAM_GHUNNAH.has(letter) ? "idgham-ghunnah" : "idgham-bila";
              claim(token, rule);
              claim(next, rule);
            }
          } else if (IKHFA.has(letter)) {
            claim(token, "ikhfa");
          }
          continue;
        }

        if (token.base === "م" && token.bare && next) {
          if (next.base === "ب") claim(token, "ikhfa-shafawi");
          else if (next.base === "م" && isCross) {
            claim(token, "mithlayn");
            claim(next, "mithlayn");
          }
          continue;
        }

        // other identical letters: first one bare (sakin, assimilated), second one carries the shaddah
        if (token.bare && isCross && next && next.base === token.base && next.shadda && !NOT_A_SOURCE.has(token.base)) {
          claim(token, "mithlayn");
          claim(next, "mithlayn");
        }
      }
    }

    // ghunnah on noon / meem with shaddah (after idgham targets have been claimed)
    for (const lets of letterTokens) {
      for (const token of lets) {
        if ((token.base === "ن" || token.base === "م") && token.shadda) claim(token, "ghunnah");
      }
    }

    // qalqalah: sakin letter, or the last letter of the verse (the reader stops there)
    for (const lets of letterTokens) {
      for (const token of lets) {
        if (QALQALAH.has(token.base) && token.sukun) claim(token, "qalqalah");
      }
    }
    for (let wi = words.length - 1; verseEnd && wi >= 0; wi -= 1) {
      const lets = letterTokens[wi];
      if (!lets.length) continue;
      const last = lets[lets.length - 1];
      if (QALQALAH.has(last.base)) claim(last, "qalqalah");
      break;
    }

    return { words, layout };
  }

  /** Text split into runs: [{ text, rule|null }], whitespace kept, adjacent equal rules merged. */
  function segments(text, options) {
    const { words, layout } = analyze(text, options);
    const out = [];
    const push = (value, rule) => {
      const last = out[out.length - 1];
      if (last && last.rule === rule) last.text += value;
      else out.push({ text: value, rule });
    };
    for (const item of layout) {
      if (item.space !== undefined) push(item.space, null);
      else for (const token of words[item.word]) push(token.text, token.rule);
    }
    return out;
  }

  /** Words for canvas drawing: [{ runs: [{ text, rule }] }] plus the original whitespace is dropped. */
  function words(text, options) {
    const { words: ws } = analyze(text, options);
    return ws.map((tokens) => {
      const runs = [];
      for (const token of tokens) {
        const last = runs[runs.length - 1];
        if (last && last.rule === token.rule) last.text += token.text;
        else runs.push({ text: token.text, rule: token.rule });
      }
      return { text: tokens.map((t) => t.text).join(""), runs };
    });
  }

  function toHTML(text, escape, options) {
    const esc = escape || ((s) => s);
    return segments(text, options)
      .map((seg) => (seg.rule ? `<span class="tj tj-${seg.rule}">${esc(seg.text)}</span>` : esc(seg.text)))
      .join("");
  }

  return { RULES, analyze, segments, words, toHTML, IKHFA, IDGHAM_GHUNNAH, IDGHAM_BILA };
});
