/**
 * The anchor matcher of build-scenes.mjs and build-story-starts.mjs, built
 * once per book instead of once per anchor.
 *
 * Those two resolve a prose anchor by normalising the whole book into one
 * separator-free stream (lower case, letters and digits only) and finding
 * the anchor's normalised form in it: the token holding the first matched
 * character is where the anchor starts. Rebuilding that stream for every
 * anchor is fine for a dozen scenes and slow for a book whose parts are its
 * few hundred chapters. This builds the stream once and answers any number
 * of anchors from it. Same normalisation, same first match, same answers.
 *
 *   const find = anchorFinder(tokenize(text));
 *   find('It was the best of times')  -> token index, or -1
 */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function anchorFinder(words) {
    const parts = [];
    const starts = new Int32Array(words.length + 1);
    let length = 0;
    for (let i = 0; i < words.length; i += 1) {
        const p = norm(words[i]);
        starts[i] = length;
        parts.push(p);
        length += p.length;
    }
    starts[words.length] = length;
    const joined = parts.join('');
    /** The token whose normalised characters include stream position `pos`. */
    const tokenAt = (pos) => {
        let lo = 0;
        let hi = words.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
        }
        // Tokens with no letters or digits share a start with the next real
        // one: the match belongs to the last token starting at or before it
        // that has characters, which is what the per-character map gave.
        while (lo < words.length - 1 && starts[lo + 1] === starts[lo]) lo += 1;
        return lo;
    };
    return (anchor) => {
        const needle = norm(anchor);
        if (!needle) return -1;
        const pos = joined.indexOf(needle);
        return pos >= 0 ? tokenAt(pos) : -1;
    };
}
