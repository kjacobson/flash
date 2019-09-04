const LANGUAGES = {
    en : {
        wordRefCode: 'en',
        englishName: 'english',
        nativeName: 'english'
    },
    fr : {
        wordRefCode: 'fr',
        englishName: 'french',
        nativeName: 'français'
    },
    es : {
        wordRefCode: 'es',
        englishName: 'spanish',
        nativeName: 'español'
    }
};
const LANGUAGE_PAIRS = [
    [ LANGUAGES.en.wordRefCode, LANGUAGES.fr.wordRefCode ],
    [ LANGUAGES.en.wordRefCode, LANGUAGES.es.wordRefCode ]
];

const capitalize = (word, lang) => {
    return word.charAt(0).toLocaleUpperCase(lang) + word.slice(1);
};

const expandLanguagePairs = (pairs, languages) => {
    return pairs.reduce((acc, pair) => {
        let from = languages[pair[0]],
            to = languages[pair[1]];
        acc.push([from, to], [to, from]);
        return acc;
    }, []);
};


module.exports = { capitalize, languagePairs: expandLanguagePairs(LANGUAGE_PAIRS, LANGUAGES) };
