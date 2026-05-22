import { useState } from 'react';
import { Upload, FileText, BookOpen, Sparkles } from 'lucide-react';

interface TextInputProps {
    onTextSubmit: (text: string) => void;
}

const SAMPLE_TEXTS = [
    {
        label: 'Shakespeare — Hamlet',
        text: `To be, or not to be: that is the question: Whether 'tis nobler in the mind to suffer The slings and arrows of outrageous fortune, Or to take Arms against a Sea of troubles, And by opposing end them: to dye, to sleepe No more; and by a sleepe, to say we end The Heart-ake, and the thousand Naturall shockes That Flesh is heyre too? 'Tis a consummation Devoutly to be wish'd. To dye, to sleepe, To sleepe, perchance to Dreame; I, there's the rub, For in that sleepe of death, what dreames may come, When we have shufflel'd off this mortall coile, Must give us pawse. There's the respect That makes Calamity of so long life: For who would beare the Whips and Scornes of time, The Oppressors wrong, the proud mans Contumely, The pangs of dispriz'd Love, the Lawes delay, The insolence of Office, and the Spurnes That patient merit of the unworthy takes, When he himselfe might his Quietus make With a bare Bodkin? Who would Fardles beare, To grunt and sweat under a weary life, But that the dread of something after death, The undiscover'd Country, from whose Borne No Traveller returnes, puzzles the will, And makes us rather beare those ills we have, Than flye to others that we know not of? Thus Conscience does make Cowards of us all, And thus the native hew of Resolution Is sicklied o'er, with the pale cast of Thought, And enterprises of great pith and moment, With this regard their Currents turne awry, And lose the name of Action. Soft you now, The faire Ophelia? Nimph, in thy Orizons Be all my sinnes remembred. Good my lord, How does your honour for this many a day? I humbly thank you; well, well, well. My lord, I have remembrances of yours, That I have longed long to redeliver; I pray you, now receive them. No, not I; I never gave you aught. My honour'd lord, you know right well you did; And, with them, words of so sweet breath composed As made the things more rich: their perfume lost, Take these again; for to the noble mind Rich gifts wax poor when givers prove unkind. There, my lord. Ha, ha! are you honest? My lord? Are you fair? What means your lordship? That if you be honest and fair, your honesty should admit no discourse to your beauty. Could beauty, my lord, have better commerce than with honesty? Ay, truly; for the power of beauty will sooner transform honesty from what it is to a bawd than the force of honesty can translate beauty into his likeness: this was sometime a paradox, but now the time gives it proof. I did love you once. Indeed, my lord, you made me believe so. You should not have believed me; for virtue cannot so inoculate our old stock but we shall relish of it: I loved you not. I was the more deceived. Get thee to a nunnery: why wouldst thou be a breeder of sinners? I am myself indifferent honest; but yet I could accuse me of such things that it were better my mother had not borne me: I am very proud, revengeful, ambitious; with more offences at my beck than I have thoughts to put them in, imagination to give them shape, or time to act them in. What should such fellows as I do crawling between earth and heaven? We are arrant knaves, all; believe none of us. Go thy ways to a nunnery.`,
    },
    {
        label: 'Marcus Aurelius — Meditations',
        text: `Begin the morning by saying to thyself, I shall meet with the busybody, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil. But I who have seen the nature of the good that it is beautiful, and of the bad that it is ugly, and the nature of him who does wrong, that it is akin to me, not only of the same blood or seed, but that it participates in the same intelligence and the same portion of the divinity, I can neither be injured by any of them, for no one can fix on me what is ugly, nor can I be angry with my kinsman, nor hate him. For we are made for co-operation, like feet, like hands, like eyelids, like the rows of the upper and lower teeth. To act against one another then is contrary to nature; and it is acting against one another to be vexed and to turn away. Whatever this is that I am, it is a little flesh and breath, and the ruling part. Throw away thy books; no longer distract thyself: it is not allowed; but as if thou wast now dying, despise the flesh; it is blood and bones and a network, a contexture of nerves, veins, and arteries. See the breath also, what kind of a thing it is, air, and not always the same, but every moment sent out and again sucked in. The third then is the ruling part: consider thus: Thou art an old man; no longer let this be a slave, no longer be pulled by the strings like a puppet to unsocial movements, no longer be either dissatisfied with thy present lot, or shrink from the future. All that is from the gods is full of providence. That which is from fortune is not separated from nature or without an interweaving and involution with the things which are ordered by providence. From thence all things flow; and there is besides necessity, and that which is for the advantage of the whole universe, of which thou art a part. But that is good for every part of nature which the nature of the whole brings, and what serves to maintain this nature. Now the universe is preserved, as by the changes of the elements so by the changes of things compounded of the elements. Let these principles be enough for thee, let them always be fixed opinions. But cast away the thirst after books, that thou mayest not die murmuring, but cheerfully, truly, and from thy heart thanking the gods. Remember how long thou hast been putting off these things, and how often thou hast received an opportunity from the gods, and yet dost not use it. Thou must now at last perceive of what universe thou art a part, and of what administrator of the universe thy existence is an efflux, and that a limit of time is fixed for thee, which if thou dost not use for clearing away the clouds from thy mind, it will go and thou wilt go, and it will never return. Every moment think steadily as a Roman and a man to do what thou hast in hand with perfect and simple dignity, and feeling of affection, and freedom, and justice; and to give thyself relief from all other thoughts. And thou wilt give thyself relief, if thou doest every act of thy life as if it were the last, laying aside all carelessness and passionate aversion from the commands of reason, and all hypocrisy, and self-love, and discontent with the portion which has been given to thee. Thou seest how few the things are, the which if a man lays hold of, he is able to live a life which flows in quiet, and is like the existence of the gods; for the gods on their part will require nothing more from him who observes these things. Wrong not thyself, wrong not thyself, O my soul; but thou wilt no longer have the opportunity of honouring thyself. Every man’s life is sufficient. But thine is nearly finished, though thy soul reverences not itself, but places thy felicity in the souls of others. Do the things external which fall upon thee distract thee? Give thyself time to learn something new and good, and cease to be whirled around. But then thou must also avoid being carried about the other way. For those too are triflers who have wearied themselves in life by their activity, and yet have no object to which to direct every movement, and, in a word, all their thoughts.`,
    },
    {
        label: 'Carl Sagan — Pale Blue Dot',
        text: `Look again at that dot. That's here. That's home. That's us. On it everyone you love, everyone you know, everyone you ever heard of, every human being who ever was, lived out their lives. The aggregate of our joy and suffering, thousands of confident religions, ideologies, and economic doctrines, every hunter and forager, every hero and coward, every creator and destroyer of civilization, every king and peasant, every young couple in love, every mother and father, hopeful child, inventor and explorer, every teacher of morals, every corrupt politician, every "superstar," every "supreme leader," every saint and sinner in the history of our species lived there—on a mote of dust suspended in a sunbeam. The Earth is a very small stage in a vast cosmic arena. Think of the rivers of blood spilled by all those generals and emperors so that, in glory and triumph, they could become the momentary masters of a fraction of a dot. Think of the endless cruelties visited by the inhabitants of one corner of this pixel on the scarcely distinguishable inhabitants of some other corner, how frequent their misunderstandings, how eager they are to kill one another, how fervent their hatreds. Our posturings, our imagined self-importance, the delusion that we have some privileged position in the Universe, are challenged by this point of pale light. Our planet is a lonely speck in the great enveloping cosmic dark. In our obscurity, in all this vastness, there is no hint that help will come from elsewhere to save us from ourselves. The Earth is the only world known so far to harbor life. There is nowhere else, at least in the near future, to which our species could migrate. Visit, yes. Settle, not yet. Like it or not, for the moment the Earth is where we make our stand. It has been said that astronomy is a humbling and character-building experience. There is perhaps no better demonstration of the folly of human conceits than this distant image of our tiny world. To me, it underscores our responsibility to deal more kindly with one another, and to preserve and cherish the pale blue dot, the only home we've ever known. The Earth is a very small stage in a vast cosmic arena. Think of the rivers of blood spilled by all those generals and emperors so that, in glory and triumph, they could become the momentary masters of a fraction of a dot. Think of the endless cruelties visited by the inhabitants of one corner of this pixel on the scarcely distinguishable inhabitants of some other corner, how frequent their misunderstandings, how eager they are to kill one another, how fervent their hatreds.`,
    },
    {
        label: 'Mary Shelley — Frankenstein',
        text: `I am by birth a Genevese, and my family is one of the most distinguished of that republic. My ancestors had been for many years counsellors and syndics, and my father had filled several public situations with honour and reputation. He was respected by all who knew him for his integrity and indefatigable attention to public business. He passed his younger days perpetually occupied by the affairs of his country; a variety of circumstances had prevented his marrying early, nor was it until the decline of life that he became a husband and the father of a family. As the circumstances of his marriage illustrate his character, I cannot refrain from relating them. One of his most intimate friends was a merchant who, from a flourishing state, fell, through numerous mischances, into poverty. This man, whose name was Beaufort, was of a proud and unbending disposition, and could not bear to live in poverty and oblivion in the same country where he had formerly been distinguished for his rank and magnificence. Having paid his debts, therefore, in the most honourable manner, he retreated with his daughter to the town of Lucerne, where he lived unknown and in wretchedness. My father loved Beaufort with the truest friendship, and was deeply grieved by his retreat in these unfortunate circumstances. He bitterly deplored the false pride which led his friend to a conduct so little worthy of the affection that united them. He lost no time in endeavouring to seek him out, with the hope of persuading him to begin the world again through his credit and assistance. Beaufort had taken effectual measures to conceal himself, and it was ten months before my father discovered his abode. Overjoyed at this discovery, he hastened to the house, which was situated in a mean street near the Reuss. But when he entered, misery and despair alone welcomed him. Beaufort had saved but a very small sum of money from the wreck of his fortunes; but it was sufficient to provide him with sustenance for some months, and in the mean time he hoped to procure some employment in a town, where he was unknown. This design was, however, frustrated by the illness which he contracted through the incessant grief he felt for his ruined hopes; and undermined by the depression of spirits incident to poverty, he died in my father's arms, leaving his daughter an orphan and a beggar. This was not destined to be my father's only trial. He had ever been devoted to the welfare of his country, and a variety of public affairs had continually occupied his time. But the death of his friend, and the desolate state of his daughter, called loudly for the exercise of his benevolence. He did not hesitate, nor once consider his own peace in comparison of the happiness of others. He took the orphan to his home, and bestowed on her the tenderest care. She was at that time about fourteen years of age. My father had an unconquerable aversion to idleness, and he took pains to instil the same in his protegée. He therefore provided her with an excellent education, and encouraged her in the cultivation of her mind.`,
    },
    {
        label: 'Oscar Wilde — The Picture of Dorian Gray',
        text: `The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn. From the corner of the divan of Persian saddle-bags on which he was lying, smoking, as was his custom, innumerable cigarettes, Lord Henry Wotton could just catch the gleam of the honey-sweet and honey-coloured blossoms of a laburnum, whose tremulous branches seemed hardly able to bear the burden of a beauty so flamelike as theirs. And now and then the fantastic shadows of birds in flight flitted across the long tussore-silk curtains that were stretched in front of the huge window, producing a kind of momentary Japanese effect, and making him think of those pallid, jade-faced painters of Tokyo who, through the medium of an art that is necessarily immobile, seek to convey the sense of swiftness and motion. The sullen murmur of the bees shouldering their way through the long unmown grass, or circling with monotonous insistence round the dusty gilt horns of the straggling woodbine, seemed to make the stillness more oppressive. The dim roar of London was like the bourdon note of a distant organ. In the centre of the room, clamped to an upright easel, stood the full-length portrait of a young man of extraordinary personal beauty, and in front of it, some little distance away, was sitting the artist himself, Basil Hallward, whose sudden disappearance some years ago caused, at the time, such public excitement and gave rise to so many strange conjectures. As the painter looked at the gracious and comely form he had so skilfully mirrored in his art, a smile of pleasure passed across his face, and seemed about to linger there. But he suddenly started up, and closing his eyes, placed his fingers upon the lids, as though he sought to imprison within his brain some curious dream from which he feared he might awake. “It is your best work, Basil, the best thing you have ever done,” said Lord Henry languidly. “You must certainly send it to the Grosvenor. The Academy is too large and too vulgar. Whenever I have gone there, there have been either far too many people or far too many clothes. The Grosvenor is really the only place.” “I don’t think I shall send it anywhere,” he answered, tossing his head back in that odd way that used to make his friends laugh at him at Oxford. “No, I won’t send it anywhere.” Lord Henry elevated his eyebrows and looked at him in amazement through the thin blue wreaths of smoke that curled up in fanciful spirals from his heavy, opium-tainted cigarette. “Not send it anywhere? My dear fellow, why? Have you any reason? What odd people you painters are! You do anything in the world to gain a reputation. As soon as you have one, you seem to want to throw it away. It is silly of you, for there is only one thing in the world worse than being talked about, and that is not being talked about. A portrait like this would set you far above all the young men in England, and make the old men quite jealous, if old men are ever capable of any emotion.” “I know you will laugh at me,” he replied, “but I really can’t exhibit it. I have put too much of myself into it.” Lord Henry stretched himself out on the divan and laughed.`,
    },
];

/**
 * TextInput Component
 * 
 * Handles text ingestion from:
 * - Direct paste
 * - File upload (TXT)
 * - Sample text selection
 * 
 * Dark-themed to match the app's aesthetic.
 */
export function TextInput({ onTextSubmit }: TextInputProps) {
    const [text, setText] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const handleSubmit = () => {
        if (text.trim()) {
            onTextSubmit(text.trim());
        }
    };

    const handleFileSelect = async (file: File) => {
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'txt') {
            const content = await file.text();
            setText(content);
        } else if (extension === 'pdf') {
            setText(`[PDF support coming soon: ${file.name}]`);
        } else if (extension === 'epub') {
            setText(`[EPUB support coming soon: ${file.name}]`);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleSampleSelect = (sampleText: string) => {
        setText(sampleText);
    };

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    return (
        <div className="w-full max-w-3xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold text-transparent bg-clip-text"
                    style={{ backgroundImage: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
                    Focus Reader
                </h1>
                <p className="text-gray-400 text-sm">
                    Speed read anything. Paste text, upload a file, or try a sample below.
                </p>
            </div>

            {/* Drop Zone / Text Area */}
            <div
                className={`
                    relative rounded-2xl transition-all duration-200
                    ${isDragging
                        ? 'border-2 border-dashed border-red-400/60 bg-red-900/10'
                        : 'border border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15]'
                    }
                `}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste your text here, or drop a .txt file..."
                    className="w-full h-56 p-5 bg-transparent resize-none focus:outline-none text-[15px] leading-relaxed text-gray-200 placeholder-gray-600"
                />

                {/* Word count badge */}
                {text.trim() && (
                    <div className="absolute bottom-3 right-4 text-xs text-gray-500 tabular-nums">
                        {wordCount} word{wordCount !== 1 ? 's' : ''}
                    </div>
                )}

                {/* Drag overlay */}
                {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-950/80 rounded-2xl">
                        <div className="text-center">
                            <Upload className="w-10 h-10 mx-auto text-red-400 mb-2" />
                            <p className="text-red-300 font-medium text-sm">Drop to upload</p>
                        </div>
                    </div>
                )}
            </div>

            {/* File type hints */}
            <div className="flex justify-center gap-6 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>.txt</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-40">
                    <FileText className="w-3.5 h-3.5" />
                    <span>.pdf (soon)</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-40">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>.epub (soon)</span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-3">
                <label className="px-5 py-2.5 rounded-xl cursor-pointer font-medium text-sm
                    bg-white/[0.06] border border-white/[0.08] text-gray-300
                    hover:bg-white/[0.1] hover:border-white/[0.15] transition-all">
                    <input
                        type="file"
                        accept=".txt,.pdf,.epub"
                        onChange={handleFileInput}
                        className="hidden"
                    />
                    Choose File
                </label>

                <button
                    onClick={handleSubmit}
                    disabled={!text.trim()}
                    className={`
                        px-7 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200
                        ${text.trim()
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/30 hover:bg-red-500 hover:shadow-red-800/40'
                            : 'bg-white/[0.04] border border-white/[0.06] text-gray-600 cursor-not-allowed'
                        }
                    `}
                >
                    Start Reading
                </button>
            </div>

            {/* ─── Sample Texts ─── */}
            <div className="pt-4 border-t border-white/[0.05]">
                <div className="flex items-center justify-center gap-2 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-red-400/60" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Or try a sample
                    </span>
                    <Sparkles className="w-3.5 h-3.5 text-red-400/60" />
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                    {SAMPLE_TEXTS.map((sample, i) => (
                        <button
                            key={i}
                            onClick={() => handleSampleSelect(sample.text)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-medium
                                bg-white/[0.04] border border-white/[0.07] text-gray-400
                                hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-300
                                transition-all duration-200"
                        >
                            {sample.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
