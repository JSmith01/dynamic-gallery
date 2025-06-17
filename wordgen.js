export function createPRNG(seed = Date.now()) {
    // LCG parameters from Numerical Recipes (good distribution)
    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32);
    
    let state = seed >>> 0; // Ensure 32-bit unsigned integer
    
    return function random() {
        state = (a * state + c) % m;
        return state / m; // Returns [0, 1)
    };
}

function generateEnglishLikeWord(minLength = 4, maxLength = 8, random = Math.random) {
    // Common English digram frequencies (normalized)
    const digrams = {
        'th': 0.031, 'he': 0.030, 'in': 0.022, 'er': 0.020, 'an': 0.020,
        're': 0.018, 'ed': 0.017, 'nd': 0.016, 'on': 0.016, 'en': 0.015,
        'at': 0.015, 'ou': 0.013, 'ea': 0.013, 'ha': 0.013, 'ng': 0.012,
        'as': 0.012, 'or': 0.012, 'ti': 0.012, 'is': 0.011, 'et': 0.011,
        'it': 0.011, 'ar': 0.011, 'te': 0.011, 'se': 0.010, 'hi': 0.010,
        'of': 0.010, 'st': 0.010, 'al': 0.009, 'le': 0.009, 'sa': 0.008,
        've': 0.008, 'ro': 0.008, 'ra': 0.008, 'ri': 0.008, 'oo': 0.008
    };

    // Common English trigram frequencies (normalized)
    const trigrams = {
        'the': 0.018, 'and': 0.007, 'ing': 0.007, 'ent': 0.004, 'ion': 0.004,
        'her': 0.004, 'for': 0.004, 'tha': 0.003, 'nth': 0.003, 'int': 0.003,
        'tio': 0.003, 'ere': 0.003, 'ter': 0.003, 'est': 0.003, 'ers': 0.003,
        'ati': 0.003, 'hat': 0.003, 'ate': 0.003, 'all': 0.003, 'eth': 0.002,
        'hes': 0.002, 'ver': 0.002, 'his': 0.002, 'oft': 0.002, 'ith': 0.002,
        'fth': 0.002, 'dth': 0.002, 'ons': 0.002, 'ugh': 0.002, 'ome': 0.002
    };

    // Starting letter frequencies
    const startingLetters = {
        't': 0.16, 'a': 0.12, 'o': 0.08, 'h': 0.07, 'w': 0.07, 'i': 0.07,
        's': 0.06, 'b': 0.05, 'c': 0.05, 'd': 0.04, 'f': 0.04, 'm': 0.04,
        'l': 0.04, 'p': 0.04, 'r': 0.03, 'n': 0.03, 'g': 0.03, 'u': 0.03,
        'e': 0.02, 'v': 0.01, 'j': 0.01, 'k': 0.01, 'y': 0.01, 'z': 0.01
    };

    // Weighted random selection function
    function weightedRandom(weights) {
        const keys = Object.keys(weights);
        const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
        let r = random() * totalWeight;
        
        for (const key of keys) {
            r -= weights[key];
            if (r <= 0) return key;
        }
        return keys[keys.length - 1];
    }

    // Get possible continuations for a given context
    function getPossibleContinuations(context, ngramType = 'digram') {
        const ngrams = ngramType === 'trigram' ? trigrams : digrams;
        const contextLength = ngramType === 'trigram' ? 2 : 1;
        const suffix = context.slice(-contextLength);
        
        const matches = {};
        for (const [ngram, freq] of Object.entries(ngrams)) {
            if (ngram.startsWith(suffix)) {
                const nextChar = ngram[contextLength];
                matches[nextChar] = (matches[nextChar] || 0) + freq;
            }
        }
        
        return Object.keys(matches).length > 0 ? matches : null;
    }

    // Generate word
    const targetLength = Math.floor(random() * (maxLength - minLength + 1)) + minLength;
    let word = weightedRandom(startingLetters);
    
    while (word.length < targetLength) {
        let nextChar = null;
        
        // Try trigram first if we have enough context
        if (word.length >= 2) {
            const trigramContinuations = getPossibleContinuations(word, 'trigram');
            if (trigramContinuations && random() < 0.7) { // 70% chance to use trigram
                nextChar = weightedRandom(trigramContinuations);
            }
        }
        
        // Fall back to digram
        if (!nextChar && word.length >= 1) {
            const digramContinuations = getPossibleContinuations(word, 'digram');
            if (digramContinuations) {
                nextChar = weightedRandom(digramContinuations);
            }
        }
        
        // If no continuation found (rare), pick a random vowel/consonant
        if (!nextChar) {
            const vowels = 'aeiou';
            const consonants = 'bcdfghjklmnpqrstvwxyz';
            const lastChar = word[word.length - 1];
            
            if (vowels.includes(lastChar)) {
                nextChar = consonants[Math.floor(random() * consonants.length)];
            } else {
                nextChar = vowels[Math.floor(random() * vowels.length)];
            }
        }
        
        word += nextChar;
    }
    
    return word;
}

export function generateRandomWordLike(randomFn = Math.random) {
    const word = generateEnglishLikeWord(4, 8, randomFn);
    
    return word[0].toUpperCase() + word.slice(1);
}
