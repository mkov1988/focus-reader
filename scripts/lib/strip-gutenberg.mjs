/**
 * THE canonical Gutenberg boilerplate strip. Both mirror scripts import this
 * file, so every text we store passes through this exact implementation.
 *
 * Two runtime copies of the same function still exist for defense in depth on
 * live Gutenberg fetches and MUST stay behaviorally identical to this one:
 *
 *   - web  src/services/library.ts   stripGutenbergBoilerplate (retired app,
 *          still built into the deployed Pages site)
 *   - app  Focus Reader Android/src/services/gutenberg.ts (tier 3 strips live
 *          text and caches it forever on device)
 *
 * `node scripts/check-strip-sync.mjs` verifies all copies agree, both by body
 * and by behavior over fixtures. Run it after touching ANY copy.
 *
 * Legally load bearing: removing every Project Gutenberg reference is what
 * frees the stored text from the Gutenberg trademark license so the product
 * can charge money. See LEGAL.md at the repo root.
 */
export function stripGutenbergBoilerplate(raw) {
    let text = raw.replace(/\r\n/g, '\n');

    // Header: jump past the modern START marker, or the old "small print" block.
    const start = text.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    if (start?.index !== undefined) {
        text = text.slice(start.index + start[0].length);
    } else {
        const smallPrint = text.match(/\*\s*END[^\n]*SMALL PRINT[^\n]*/i);
        if (smallPrint?.index !== undefined) text = text.slice(smallPrint.index + smallPrint[0].length);
    }

    // Footer: stop at the modern END marker, or the old "End of ... Gutenberg" line.
    const end = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*\*\*/i);
    if (end?.index !== undefined) {
        text = text.slice(0, end.index);
    } else {
        const oldEnd = text.match(/\n\s*End of (?:the |this )?Project Gutenberg[^\n]*/i);
        if (oldEnd?.index !== undefined) text = text.slice(0, oldEnd.index);
    }

    // Drop the leading transcriber/credit/admin block (very common right after the
    // header) so the reader opens on the actual book, not "E-text prepared by…".
    // Also consume the bare URL and "or" lines those notes wrap across.
    const creditRe = /(produced by|prepared by|transcrib|proofread|distributed proofreading|pgdp\.net|gutenberg\.org|project gutenberg|updated editions|this e-?(?:text|book) was|html version|original illustrations|see \S+-h\.(?:htm|zip))/i;
    const skip = (l) => l.trim() === '' || creditRe.test(l) || /^\s*\(?https?:\/\//i.test(l) || /^\s*(?:or|and)\s*$/i.test(l);
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && skip(lines[i])) i++;
    text = lines.slice(i).join('\n');

    // The trademark phrase survives hard line wrapping ("Project\nGutenberg"),
    // so join any wrapped occurrence first; the line filter below then drops
    // the joined line the same way it drops a same-line occurrence.
    text = text.replace(/project(?:\s*\n\s*)gutenberg/gi, 'Project Gutenberg');

    // Final safeguard: never keep a line carrying the Project Gutenberg trademark.
    text = text.split('\n').filter((l) => !/project gutenberg/i.test(l)).join('\n');

    return text.trim();
}
