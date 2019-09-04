const readline = require('readline');
const nSQL = require('@nano-sql/core').nSQL;

const setUpDB = require('./set-up-db');
const { capitalize, languagePairs } = require('./language-config');

const STREAK_INTERVAL = 5;
// likely don't need this:
const MAX_WORDS = 5;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
}); 

const getTermsForLanguage = (lang, limit) => {
    return nSQL("terms").getView('get_all_terms_by_language', { language: lang, limit: limit });
}

// TODO: this SHOULD be joinable
const getTranslationsForTerm = async (termId, lang) => {
    return nSQL("translations").query("select")
        .where([
            ['fromId','=',termId],'OR',['toId','=',termId]
        ]).exec()
    .then((translations) => {
        return translations.map((trans) => {
            return trans.toId === termId 
                ? trans.fromId
                : trans.toId;
        });
    })
    .then((translationIds) => {
        return nSQL("terms").query("select")
            .where([
                ['id', 'IN', translationIds],'AND',['language','=',lang]
            ])
            .exec();
    });
};

const listLanguages = (pairings) => {
    return pairings.reduce((str, pairing, i) => {
        let fromName = capitalize(pairing[0].englishName, 'en'),
            toName = capitalize(pairing[1].englishName, 'en');
        str += `${i + 1}: translate ${fromName} to ${toName}\n`;
        return str;
    }, 'What would you like to work on?\n');
}

const pickLanguagePair = () => {
    return new Promise((resolve, reject) => {
        rl.question(listLanguages(languagePairs), (answer) => {
            return resolve(
                languagePairs[parseInt(answer, 10) - 1]
            );
        });
    });
};

const suggestArchive = (term) => {
    return new Promise((resolve, reject) => {
        rl.question(`You've correctly translated ${term.self} ${term.streak} times in a row! ` +
            'Would you like to remove it from future quizzes? (You can always undo this.)\n[Y/n]\n', (answer) => {
                answer = answer.trim();
                if (answer === 'n') {
                    return resolve(updateStreak(term));
                } else {
                    return resolve(archiveTerm(term));
                }
            }
        );
    });
};

const updateStreak = (term) => {
    return nSQL("terms").query("upsert", {streak: term.streak}).where(['id','=',term.id]).exec();
};

const archiveTerm = (term) => {
    const clone = Object.assign({}, term, {
        archived: true,
        streak: 0
    });
    return nSQL("terms").query("upsert", clone).where(['id','=',term.id]).exec();
};

const quiz = (term, translations) => {
    return new Promise((resolve, reject) => {
        // let timeout = setTimeout(reject, 25);
        rl.question(`${term.self}${term.part ? ' [' + term.part + '] ' : ''}${term.sense}\n`, (answer) => {
            // clearTimeout(timeout);
            answer = answer.trim().toLowerCase();
            if (translations.find((trans) => {
                // TODO: strip [qqch], etc
                return trans.self === answer;
            })) {
                term.streak += 1;
                console.log(`Correct! ${term.streak} in a row for this word!`);
                if (term.streak > 0 && term.streak % STREAK_INTERVAL === 0) {
                    return resolve(suggestArchive(term));
                } else {
                    return resolve(updateStreak(term));
                }
            } else {
                term.streak = 0;
                console.log('Wrong :-( Correct answers: ' + translations.map((trans) => trans.self).join(', '));
                return resolve(updateStreak(term));
            }
        });
    });
};

const quizGenerator = async function*(terms, toLang) {
    let term;
    while (term = terms.shift()) {
        const translatedTerms = await getTranslationsForTerm(term.id, toLang);
        yield [term, translatedTerms];
    }
};

const suggestRepeat = () => {
    return new Promise((resolve, reject) => {
        rl.question('No more words. Repeat? [Y/n] ', (answer) => {
            return resolve(answer.toLowerCase() !== 'n');
        });
    });
};


// TODO: generator/async iterator
const startQuiz = async ([fromLang, toLang]) => {
    const terms = await getTermsForLanguage(fromLang.wordRefCode, MAX_WORDS); 
    for await (const [term, translations] of quizGenerator(terms, toLang.wordRefCode)) {
        try {
            await quiz(term, translations);
        } catch(err) {
            console.error(err);
        }
    }

    if (await suggestRepeat()) {
        startQuiz([fromLang, toLang]);
    } else {
        process.exit(0);
    }
}

setUpDB().then(pickLanguagePair).then(startQuiz);
