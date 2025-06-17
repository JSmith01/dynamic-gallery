export function generateRandomWordLike() {
    const consonants = 'bcdfghjklmnpqrstvwxyz';
    const vowels = 'aeiou';
    const commonDigraphs = ['th', 'ch', 'sh', 'ph', 'wh', 'st', 'nd', 'ng', 'ck', 'nt'];
    const vowelCombos = ['ea', 'ou', 'ai', 'ie', 'oo', 'ee'];
    const length = Math.floor(Math.random() * 7) + 3; // 3-7 characters
    let word = '';
    let i = 0;
    while (i < length) {
        const remainingLength = length - i;
        const useDigraph = remainingLength >= 2 && Math.random() < 0.3;
        const useVowel = i % 2 === 1 || Math.random() < 0.4;
        if (useDigraph && useVowel && Math.random() < 0.5) {
            // Use vowel combination
            const combo = vowelCombos[Math.floor(Math.random() * vowelCombos.length)];
            word += combo;
            i += 2;
        }
        else if (useDigraph && !useVowel) {
            // Use consonant digraph
            const digraph = commonDigraphs[Math.floor(Math.random() * commonDigraphs.length)];
            word += digraph;
            i += 2;
        }
        else {
            // Use a single letter
            const chars = useVowel ? vowels : consonants;
            word += chars[Math.floor(Math.random() * chars.length)];
            i += 1;
        }
    }
    return word[0].toUpperCase() + word.slice(1);
}
