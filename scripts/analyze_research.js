const fs = require('fs');
const path = require('path');

const inputFile = path.join('docs', 'user-research-raw.md');
const outputFile = path.join('docs', 'research-extraction.md');

// Keywords to look for - expanded for "Deep Dive"
const keywords = [
    // Reading Mechanics
    'fixation', 'saccade', 'eye movement', 'peripheral', 'span of vision', 'vocalization', 'subvocalization', 'inner speech', 'retina', 'fovea',
    // Psychology of Attention & Focus
    'attention', 'focus', 'concentrate', 'concentration', 'distracted', 'distraction', 'mind-wandering', 'fatigue', 'mental energy', 'will power', 'volition', 'flow state',
    // Memory & Learning
    'memory', 'retention', 'recall', 'forgetting', 'curve of forgetting', 'repetition', 'drill', 'practice', 'habit', 'association', 'comprehension',
    // Study Techniques
    'skim', 'scan', 'review', 'summarize', 'note-taking', 'underlining', 'cramatic', 'pacing', 'rhythm',
    // Speed Reading specific
    'speed', 'rate', 'rapid', 'slow', 'word per minute', 'wpm', 'rsvp', 'serial visual', 'flashing',
    // Patent specific
    'training', 'apparatus', 'display', 'textual matter', 'embodiment'
];

try {
    const data = fs.readFileSync(inputFile, 'utf8');
    const lines = data.split('\n');
    let currentSource = "Unknown Source";

    // Track lines to include (using a Set or boolean array to merge overlaps)
    let linesToInclude = new Set();
    let sourceMap = new Map(); // lineIndex -> SourceName

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Identify Source
        if (line.match(/^(#+ |Title:|Source:|US\d+)/) || line.includes('Project Gutenberg')) {
            currentSource = line.trim();
        }
        sourceMap.set(i, currentSource);

        // Keyword Match
        if (line.trim().length > 20) { // skip very short noise
            const lowerLine = line.toLowerCase();
            const hasKeyword = keywords.some(k => lowerLine.includes(k));

            if (hasKeyword) {
                // Add context (prev line, current, next line)
                if (i > 0) linesToInclude.add(i - 1);
                linesToInclude.add(i);
                if (i < lines.length - 1) linesToInclude.add(i + 1);
            }
        }
    }

    // Generate Output
    let output = [`# Raw Quote Extraction Report\n`];
    let sortedIndices = Array.from(linesToInclude).sort((a, b) => a - b);

    let lastIndex = -1;
    let lastSource = "";

    sortedIndices.forEach(index => {
        const line = lines[index];
        const source = sourceMap.get(index);

        if (source !== lastSource) {
            output.push(`\n## Source: ${source}\n`);
            lastSource = source;
        }

        if (index > lastIndex + 1) {
            output.push('\n---\n'); // Separator for non-contiguous blocks
        }

        output.push(`> ${line}`);
        lastIndex = index;
    });

    fs.writeFileSync(outputFile, output.join('\n'));
    console.log(`Extracted content to ${outputFile}`);

} catch (err) {
    console.error("Error processing file:", err);
}
