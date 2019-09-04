const readline = require('readline');
const wr = require('wordreference-api');
const nSQL = require('@nano-sql/core').nSQL;

const setUpDB = require('./set-up-db');
const { capitalize, languagePairs } = require('./language-config');


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
}); 

const listLanguages = (pairings) => {
    return pairings.reduce((str, pairing, i) => {
        let fromName = capitalize(pairing[0].englishName, 'en'),
            toName = capitalize(pairing[1].englishName, 'en');
        str += `${i + 1}: ${fromName} to ${toName}\n`;
        return str;
    }, 'Choose a translation type:\n');
}

const pickLanguage = () => {
    return new Promise((resolve, reject) => {
        rl.question(listLanguages(languagePairs), (answer) => {
            resolve(languagePairs[parseInt(answer, 10) - 1]);
        });
    });
};

const acceptTranslation = (translation) => {
    let sense = translation.toSense;
    if (sense) {
        sense = ' ' + sense.trim();
    }
    return new Promise((resolve, reject) => {
        rl.question(`Use this translation: ${translation.to.trim()}${sense}? [Y/n]`, (answer) => {
            answer = answer.trim().toLowerCase();
            resolve(answer === 'y' || answer === '');
        });
    });
};

const chooseTranslations = (translations, index, acceptedTranslations) => {
    let translation;
    return new Promise(async (resolve, reject) => {
        if (translation = translations[index]) {
            if (await acceptTranslation(translation)) {
                acceptedTranslations.push(translation);
            }
            return resolve(
                chooseTranslations(translations, index+1, acceptedTranslations)
            );
        } else {
            return resolve(acceptedTranslations);
        }
    });
};

const chooseMethod = () => {
    return new Promise((resolve, reject) => {
        rl.question('Use (1) wordreference or (2) enter manually?\n', (answer) => {
            answer = parseInt(answer.trim(), 10);
            if (answer === 1 || !answer) {
                resolve(1);
            } else
            if (answer === 2) {
                resolve(2);
            } else {
                resolve(chooseMethod());
            }
        });
    });
};

const inputWordManual = (fromLang) => {
    return new Promise((resolve) => {
        rl.question(`What ${capitalize(fromLang.englishName, 'en')} word do you want to add?\n`, async (answer) => {
            resolve(answer.trim());
        });
    });
};

const inputDefinition = (word, toLang) => {
    return new Promise((resolve) => {
        rl.question(`What\'s the ${capitalize(toLang.englishName, 'en')} translation of ${word}?\n`, (answer) => {
            resolve(answer.trim());
        });
    });
};

const addAcceptedTranslations = async (translations, fromLang, toLang) => {
    let result, fromId, toId;
    for (let translation of translations) {
        try {
            result = await addWord(translation.from, fromLang, translation.fromSense, translation.fromType);
            fromId = result[0].id;
        } catch(err) {
            console.error(err);
        }
        translation.to.split(',').forEach(async (word) => {
            try {
                result = await addWord(word.trim(), toLang, translation.toSense, translation.toType);
                toId = result[0].id;
            }
            catch(err) {
                console.error(err);
            }

            try {
                await addTranslation(
                    fromId,
                    toId
                )
            }
            catch(err) {
                console.error(err);
            }
            return;
        });

    }
    return;
};

const inputWordWR = (fromLang, toLang) => {
    return new Promise((resolve, reject) => {
        rl.question('What word are you searching for?\n', (answer) => {
            answer = answer.trim();
            searchForWord(answer, fromLang, toLang).then((results) => {
                const translations = (
                    results &&
                    results.translations &&
                    results.translations.length
                ) 
                ? results.translations[0].translations
                : [];
                resolve(translations);
            }, reject);
        });
    });
};

const searchForWord = (word, fromLang, toLang) => {
    return wr(word, fromLang.wordRefCode, toLang.wordRefCode);
};

const addTranslation = (fromId, toId) => {
    return new Promise((resolve, reject) => {
        if (fromId && toId) {
            const record = {
                fromId: fromId,
                toId: toId
            };
            nSQL("translations").query("upsert", record).exec()
                .then(resolve).catch(reject);
        } else {
            resolve();
        }
    });
};

const addWord = (word, lang, sense, partOfSpeech) => {
    word = word.replace('⇒', '');
    return new Promise(async (resolve, reject) => {
        const record = {
            self: word,
            language: lang,
            sense: sense,
            part: partOfSpeech,
            streak: 0,
            archived: false
        };
        nSQL("terms").query("upsert", record).exec()
            .then(resolve).catch(reject);
    });
};

const addWordFromWordReference = async (fromLang, toLang) => {
    const translations = await inputWordWR(fromLang, toLang);
    if (translations.length) {
        const acceptedTranslations = await chooseTranslations(translations, 0, []);
        await addAcceptedTranslations(acceptedTranslations, fromLang.wordRefCode, toLang.wordRefCode);
    } else {
        console.log('No results found.');
    }
    return repeat(addWordFromWordReference.bind(addWordFromWordReference, fromLang, toLang));
};

const addWordManually = async (fromLang, toLang) => {
    const fromWord = await inputWordManual(fromLang);
    const fromResult = await addWord(fromWord, fromLang.wordRefCode, '', '');
    const fromId = fromResult[0].id;

    const toWord = await inputDefinition(fromWord, toLang);
    const toResult = await addWord(toWord, toLang.wordRefCode, '', '');
    const toId = toResult[0].id;

    try {
        await addTranslation(
            fromId,
            toId
        )
    }
    catch(err) {
        console.error(err);
    }
    return repeat(addWordManually.bind(addWordManually, fromLang, toLang));
};

const repeat = async (method) => {
    return new Promise((resolve, reject) => {
        rl.question("Add another word?\n(1) Yes\n(2) No\n(3) Main menu\n", (answer) => {
            answer = parseInt(answer.trim(), 10);
            if (answer === 1) {
                resolve(method());
            } else
            if (answer === 3) {
                resolve(mainMenu());
            }
            resolve();
        });
    });
};

const mainMenu = async () => {
    const [fromLang, toLang] = await pickLanguage();
    const method = await chooseMethod();
    if (method === 1) {
        await addWordFromWordReference(fromLang, toLang);
    } else {
        await addWordManually(fromLang, toLang);
    }
    return;
};


setUpDB().then(async () => {
    await mainMenu();
    rl.close();
}).catch(console.error);
