/*
 * Renders a verse as a shareable PNG: white background, green + golden-yellow accents, optional tajweed
 * colours and a "Quravia SUMUT" watermark with the app logo.
 *
 *   story  1080 x 1920  (WhatsApp, TikTok)
 *   square 1080 x 1080  (Instagram, Facebook)
 *
 * Everything is drawn on a <canvas>, so the result is a real image on every browser and works offline.
 */
(function (root, factory) {
  root.ShareImage = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  const FORMATS = {
    story: {
      width: 1080, height: 1920, label: "1080 × 1920",
      inset: 44, pillY: 196, pillH: 86, crestY: 120, contentTop: 330, contentBottom: 1590,
      sepY: 1650, markY: 1772, textInset: 120, arabicBase: 116, latinBase: 39, transBase: 47, logo: 104, markFont: 58,
    },
    square: {
      width: 1080, height: 1080, label: "1080 × 1080",
      inset: 36, pillY: 128, pillH: 74, crestY: 78, contentTop: 232, contentBottom: 842,
      sepY: 886, markY: 970, textInset: 90, arabicBase: 96, latinBase: 33, transBase: 40, logo: 88, markFont: 50,
    },
  };

  const PLATFORMS = {
    whatsapp: { name: "WhatsApp", format: "story" },
    tiktok: { name: "TikTok", format: "story" },
    instagram: { name: "Instagram", format: "square" },
    facebook: { name: "Facebook", format: "square" },
  };

  const C = {
    white: "#FFFFFF",
    green: "#0D6B4F",
    deepGreen: "#073F31",
    gold: "#F4C345",
    goldLine: "#D9A92B",
    goldDark: "#9A7000",
    ink: "#0A100D",
    soft: "#33453D",
  };

  const LATIN_FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const ZWJ = "\u200D";
  const NON_JOINING_NEXT = /[ادذرزوؤأإآٱءةى]/; // right-joining letters never connect to the letter after them
  const BASE_LETTER = /[\u0621-\u063A\u0641-\u064A\u0671-\u06D3]/;

  let logoPromise = null;
  function loadLogo(src) {
    if (!logoPromise) {
      logoPromise = new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });
    }
    return logoPromise;
  }

  // ---------------------------------------------------------------- decoration
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground(ctx, W, H) {
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, W, H);
    const top = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.75);
    top.addColorStop(0, "rgba(244,195,69,0.16)");
    top.addColorStop(1, "rgba(244,195,69,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H);
    const bottom = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, W * 0.8);
    bottom.addColorStop(0, "rgba(13,107,79,0.10)");
    bottom.addColorStop(1, "rgba(13,107,79,0)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 0, W, H);
  }

  function drawOctagram(ctx, cx, cy, R, stroke, width) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    for (let k = 0; k < 2; k += 1) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 4);
      ctx.strokeRect(-R, -R, R * 2, R * 2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFrame(ctx, W, H, inset) {
    ctx.save();
    ctx.strokeStyle = C.goldLine;
    ctx.lineWidth = 6;
    roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, 36);
    ctx.stroke();
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 2.5;
    roundRect(ctx, inset + 18, inset + 18, W - (inset + 18) * 2, H - (inset + 18) * 2, 24);
    ctx.stroke();
    ctx.fillStyle = C.gold;
    for (const [x, y] of [
      [inset + 18, inset + 18], [W - inset - 18, inset + 18], [inset + 18, H - inset - 18], [W - inset - 18, H - inset - 18],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStar(ctx, cx, cy, outer, inner, fill) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawCrest(ctx, cx, cy, r) {
    const size = Math.ceil(r * 2 + 4);
    const layer = document.createElement("canvas");
    layer.width = size;
    layer.height = size;
    const lc = layer.getContext("2d");
    lc.fillStyle = C.gold;
    lc.beginPath();
    lc.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    lc.fill();
    lc.globalCompositeOperation = "destination-out";
    lc.beginPath();
    lc.arc(size / 2 + r * 0.42, size / 2 - r * 0.08, r * 0.82, 0, Math.PI * 2);
    lc.fill();
    ctx.drawImage(layer, cx - size / 2, cy - size / 2);
    drawStar(ctx, cx + r * 0.46, cy - r * 0.05, r * 0.34, r * 0.14, C.goldLine);
  }

  function drawDivider(ctx, cx, y, w) {
    ctx.save();
    const grad = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    grad.addColorStop(0, "rgba(217,169,43,0)");
    grad.addColorStop(0.5, C.goldLine);
    grad.addColorStop(1, "rgba(217,169,43,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y);
    ctx.lineTo(cx + w / 2, y);
    ctx.stroke();
    ctx.fillStyle = C.green;
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  }

  function drawPill(ctx, text, cx, y, h, font) {
    ctx.save();
    ctx.font = font;
    ctx.direction = "ltr";
    const padX = 54;
    const w = ctx.measureText(text).width + padX * 2;
    const x = cx - w / 2;
    ctx.shadowColor = "rgba(7,63,49,0.25)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = C.green;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4;
    roundRect(ctx, x + 6, y + 6, w - 12, h - 12, (h - 12) / 2);
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, y + h / 2 + 2);
    ctx.restore();
  }

  function drawWatermark(ctx, W, y, logo, logoSize, fontPx) {
    ctx.save();
    ctx.direction = "ltr";
    ctx.font = `800 ${fontPx}px ${LATIN_FONT}`;
    const text = "Quravia SUMUT";
    const textW = ctx.measureText(text).width;
    const gap = 24;
    const total = (logo ? logoSize + gap : 0) + textW;
    let x = (W - total) / 2;
    if (logo) {
      ctx.drawImage(logo, x, y - logoSize / 2, logoSize, logoSize);
      x += logoSize + gap;
    }
    ctx.fillStyle = C.deepGreen;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Quravia", x, y + 2);
    const quraviaW = ctx.measureText("Quravia ").width;
    ctx.fillStyle = C.goldDark;
    ctx.fillText("SUMUT", x + quraviaW, y + 2);
    ctx.restore();
  }

  // ---------------------------------------------------------------- text layout
  function joinsForward(run) {
    const letters = run.match(new RegExp(BASE_LETTER.source, "g"));
    if (!letters) return false;
    return !NON_JOINING_NEXT.test(letters[letters.length - 1]);
  }
  function startsWithJoinable(run) {
    const first = run.match(BASE_LETTER);
    return Boolean(first) && first[0] !== "ء";
  }

  // The pieces of a word that must be drawn separately because their colour differs. A zero-width joiner at
  // a colour boundary keeps the Arabic letters connected exactly as they are inside the whole word.
  function wordPieces(word, tajweed, palette) {
    if (!tajweed || word.runs.length === 1) {
      const rule = word.runs.length === 1 ? word.runs[0].rule : null;
      return [{ text: word.text, color: rule && tajweed ? palette[rule] : C.ink }];
    }
    return word.runs.map((run, i) => {
      const prev = word.runs[i - 1];
      const next = word.runs[i + 1];
      const joinPrev = prev && joinsForward(prev.text) && startsWithJoinable(run.text);
      const joinNext = next && joinsForward(run.text) && startsWithJoinable(next.text);
      return { text: (joinPrev ? ZWJ : "") + run.text + (joinNext ? ZWJ : ""), color: run.rule ? palette[run.rule] : C.ink };
    });
  }

  function measurePieces(ctx, pieces) {
    return pieces.reduce((sum, piece) => sum + ctx.measureText(piece.text).width, 0);
  }

  function wrapArabic(ctx, words, maxWidth, tajweed, palette) {
    const space = ctx.measureText(" ").width;
    const lines = [];
    let current = null;
    for (const word of words) {
      const pieces = wordPieces(word, tajweed, palette);
      const width = measurePieces(ctx, pieces);
      if (current && current.width + space + width <= maxWidth) {
        current.items.push({ pieces, width });
        current.width += space + width;
      } else {
        current = { items: [{ pieces, width }], width };
        lines.push(current);
      }
    }
    return { lines, space };
  }

  function wrapLatin(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function limitLines(lines, max) {
    if (lines.length <= max) return { lines, cut: false };
    const kept = lines.slice(0, Math.max(1, max));
    kept[kept.length - 1] = `${kept[kept.length - 1].replace(/[\s,.;:،]+$/, "")} …`;
    return { lines: kept, cut: true };
  }

  /**
   * options: { format, surahName, verseId, arabic, latin, translation, tajweed, showLatin, showTranslation,
   *            arabicFamily, logoSrc }
   * returns Promise<HTMLCanvasElement> (with canvas.info describing the layout)
   */
  async function render(options) {
    const g = FORMATS[options.format] || FORMATS.story;
    const W = g.width;
    const H = g.height;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const logo = options.logoSrc ? await loadLogo(options.logoSrc) : null;

    const palette = {};
    if (root.Tajweed) for (const rule of root.Tajweed.RULES) palette[rule.id] = rule.color;
    const useTajweed = Boolean(options.tajweed && root.Tajweed);
    const arabicWords = useTajweed
      ? root.Tajweed.words(options.arabic)
      : options.arabic.split(/\s+/).filter(Boolean).map((text) => ({ text, runs: [{ text, rule: null }] }));

    drawBackground(ctx, W, H);
    const patternR = Math.min(W * 0.34, ((g.contentBottom - g.contentTop) / 2) * 0.74);
    drawOctagram(ctx, W / 2, (g.contentTop + g.contentBottom) / 2, patternR, "rgba(13,107,79,0.07)", 3);
    drawOctagram(ctx, W / 2, (g.contentTop + g.contentBottom) / 2, patternR * 0.78, "rgba(217,169,43,0.10)", 3);
    drawFrame(ctx, W, H, g.inset);
    drawCrest(ctx, W / 2, g.crestY, options.format === "story" ? 38 : 30);
    drawPill(ctx, `QS. ${options.surahName} : ${options.verseId}`, W / 2, g.pillY, g.pillH, `800 ${Math.round(g.pillH * 0.44)}px ${LATIN_FONT}`);

    const textWidth = W - g.textInset * 2;
    const avail = g.contentBottom - g.contentTop;
    const family = options.arabicFamily || '"Noto Naskh Arabic", "Noto Sans Arabic", Amiri, "Times New Roman", serif';
    const wantLatin = Boolean(options.showLatin && options.latin);
    const wantTrans = Boolean(options.showTranslation && options.translation);

    const build = (scale) => {
      const arabicPx = Math.round(g.arabicBase * scale);
      ctx.direction = "rtl";
      ctx.font = `${arabicPx}px ${family}`;
      const arabic = wrapArabic(ctx, arabicWords, textWidth, useTajweed, palette);
      const arabicLine = arabicPx * 1.95;
      const latinPx = Math.round(g.latinBase * scale);
      const transPx = Math.round(g.transBase * scale);
      ctx.direction = "ltr";
      ctx.font = `italic 600 ${latinPx}px ${LATIN_FONT}`;
      const latin = wantLatin ? wrapLatin(ctx, options.latin, textWidth) : [];
      ctx.font = `500 ${transPx}px ${LATIN_FONT}`;
      const trans = wantTrans ? wrapLatin(ctx, `“${options.translation}”`, textWidth) : [];
      const gap = Math.round(46 * scale);
      const heights = {
        arabic: arabic.lines.length * arabicLine,
        latin: latin.length * latinPx * 1.5,
        trans: trans.length * transPx * 1.5,
      };
      const total = heights.arabic + (latin.length ? gap + heights.latin : 0) + (trans.length ? gap + heights.trans : 0) + gap + 20;
      return { arabicPx, arabicLine, latinPx, transPx, arabic, latin, trans, gap, heights, total };
    };

    let scale = 1;
    let layout = build(scale);
    while (layout.total > avail && scale > 0.34) {
      scale = Math.round((scale - 0.03) * 100) / 100;
      layout = build(scale);
    }
    let truncated = false;
    if (layout.total > avail) {
      // Extremely long verse: keep as much as fits, mark the cut with an ellipsis.
      const spare = avail - (layout.gap * 3 + 20);
      const transShare = layout.trans.length ? Math.min(layout.heights.trans, spare * 0.28) : 0;
      const maxTransLines = Math.floor(transShare / (layout.transPx * 1.5));
      if (layout.trans.length) {
        const cut = limitLines(layout.trans, Math.max(2, maxTransLines));
        layout.trans = cut.lines;
        truncated = truncated || cut.cut;
      }
      layout.latin = [];
      const used = layout.trans.length * layout.transPx * 1.5 + layout.gap * (layout.trans.length ? 1 : 0);
      const maxArabicLines = Math.max(1, Math.floor((avail - used - layout.gap - 20) / layout.arabicLine));
      if (layout.arabic.lines.length > maxArabicLines) {
        layout.arabic.lines = layout.arabic.lines.slice(0, maxArabicLines);
        const last = layout.arabic.lines[layout.arabic.lines.length - 1];
        last.items.push({ pieces: [{ text: "…", color: C.goldDark }], width: 0 });
        truncated = true;
      }
    }

    // vertical centring inside the content area
    const arabicH = layout.arabic.lines.length * layout.arabicLine;
    const latinH = layout.latin.length * layout.latinPx * 1.5;
    const transH = layout.trans.length * layout.transPx * 1.5;
    const total = arabicH + (layout.latin.length ? layout.gap + latinH : 0) + (layout.trans.length ? layout.gap + transH : 0) + layout.gap + 20;
    let y = g.contentTop + Math.max(0, (avail - total) / 2);

    // Arabic (right-to-left, centred line by line)
    ctx.direction = "rtl";
    ctx.font = `${layout.arabicPx}px ${family}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    for (const line of layout.arabic.lines) {
      let x = (W + line.width) / 2;
      const baseline = y + layout.arabicLine * 0.68;
      for (const item of line.items) {
        for (const piece of item.pieces) {
          ctx.fillStyle = piece.color;
          ctx.fillText(piece.text, x, baseline);
          x -= ctx.measureText(piece.text).width;
        }
        x -= layout.arabic.space;
      }
      y += layout.arabicLine;
    }
    y += layout.gap * 0.5;
    drawDivider(ctx, W / 2, y, Math.min(520, textWidth * 0.6));
    y += layout.gap * 0.5 + 6;

    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (layout.latin.length) {
      ctx.font = `italic 600 ${layout.latinPx}px ${LATIN_FONT}`;
      ctx.fillStyle = C.green;
      for (const line of layout.latin) {
        ctx.fillText(line, W / 2, y + layout.latinPx * 1.05);
        y += layout.latinPx * 1.5;
      }
      y += layout.gap * 0.7;
    }
    if (layout.trans.length) {
      ctx.font = `500 ${layout.transPx}px ${LATIN_FONT}`;
      ctx.fillStyle = C.soft;
      for (const line of layout.trans) {
        ctx.fillText(line, W / 2, y + layout.transPx * 1.05);
        y += layout.transPx * 1.5;
      }
    }

    // footer: separator + watermark
    drawDivider(ctx, W / 2, g.sepY, Math.min(640, W * 0.62));
    drawWatermark(ctx, W, g.markY, logo, g.logo, g.markFont);

    canvas.info = {
      format: options.format, width: W, height: H, scale, truncated,
      arabicLines: layout.arabic.lines.length, arabicPx: layout.arabicPx, contentTop: g.contentTop, contentBottom: g.contentBottom,
      sepY: g.sepY, markY: g.markY, textBottom: y,
    };
    return canvas;
  }

  function toBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), type || "image/png");
    });
  }

  return { FORMATS, PLATFORMS, render, toBlob };
});
