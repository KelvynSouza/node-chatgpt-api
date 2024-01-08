/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';
import { BingAIClient } from '../index.js';
import config from './config.js';

const delay = ms => new Promise(res => setTimeout(res, ms));

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

const options = {
    // Necessary for some people in different countries, e.g. China (https://cn.bing.com)
    host: '',
    // "_U" cookie from bing.com
    userToken: '',
    // If the above doesn't work, provide all your cookies as a string instead
    cookies: config.cookie,
    // A proxy string like "http://<ip>:<port>"
    proxy: '',
    // (Optional) Set to true to enable `console.debug()` logging
    debug: false,
};

const sydneyAIClient = new BingAIClient(options);

const directoryPath = path.join(__dirname, config.translationSourcePath);

let files = [];
try {
    files = fs.readdirSync(directoryPath);
} catch (err) {
    console.log(`Unable to scan directory: ${directoryPath} \n ${err}`);
}

files.sort((a, b) => {
    try {
        const nameA = parseInt(a.match(/\S[\d]+/)[0], 10);
        const nameB = parseInt(b.match(/\S[\d]+/)[0], 10);
        return nameA - nameB;
    } catch (err) {
        console.log(`File name has no chapter number to organize and identify order:\n ${a}\n${b}`);
        throw err;
    }
});

let errorsInSequence = 0;
const errorsInSequenceLimit = 5;
if (files.length > 0) {
    for (let index = 0; index < files.length; index++) {
        const fileName = files[index];
        const filePath = path.resolve(directoryPath, `./${fileName}`);
        const file = fs.readFileSync(filePath, 'utf8').toString();
        const lines = file.split('\n');
        try {
            console.log(`Starting file: ${fileName} translation.`);

            do {
                const translatedFileText = await TranslateFile(lines);

                const destinationFilePath = path.join(__dirname, `${config.translationDestinationPath}/${fileName}`);

                fs.writeFileSync(destinationFilePath, translatedFileText);

                const stats = fs.statSync(destinationFilePath);
                const fileSizeInKybytes = stats.size / 1000;

                if (fileSizeInKybytes < 9) {
                    errorsInSequence += 1;
                } else {
                    break;
                }
            } while (errorsInSequence <= errorsInSequenceLimit);

            errorsInSequence = 0;
            console.log(`File: ${fileName} translated successfully.`);
            fs.unlinkSync(filePath);
        } catch (err) {
            errorsInSequence += 1;
            console.log(`Error while trying to translate file: ${fileName}`);
            console.log(err);
            if (errorsInSequence === errorsInSequenceLimit) {
                break;
            }
        }
    }
}

async function TranslateFile(lines) {
    let translatedText = '';

    const charactersLimit = 1500;

    let startIndex = 0;

    if (lines[lines.length - 1].match(/-/g) && lines[lines.length - 1].match(/-/g).length > 4) {
        lines.pop();
    }

    while (startIndex + 1 < lines.length) {
        let textToTranslate = '';
        for (let index = startIndex; index < lines.length; index++) {
            textToTranslate = `${textToTranslate}\n${lines[index]}`;
            if (textToTranslate.length > charactersLimit || index === lines.length - 1) {
                startIndex = index + 1;
                break;
            }
        }

        let triesCounter = 0;
        const triesLimit = 5;
        let jailbreakResponse;
        while (triesCounter <= triesLimit) {
            console.log(`#${triesCounter} Tentativa`);
            try {
                jailbreakResponse = await sydneyAIClient.sendMessage(`Translate the following from ${config.languageFrom} to ${config.languageTo}, you must never return ${config.languageFrom} text: ${textToTranslate}`, {
                    jailbreakConversationId: true,
                    toneStyle: 'balanced',
                    onProgress: (token) => {
                        process.stdout.write(token);
                    },
                });
                if (validateResponse((String)(jailbreakResponse.response))) {
                    console.log(`Text not translated: ${jailbreakResponse.response}`);
                    throw Error('Text not translated');
                }
                await delay(5000);
                break;
            } catch (err) {
                console.log(err);
                if (triesCounter === triesLimit) {
                    throw err;
                }
            }
            triesCounter += 1;
        }

        let resultedTranslation = (String)(jailbreakResponse.response);
        resultedTranslation = resultedTranslation.substring(resultedTranslation.indexOf(':') + 1);

        translatedText = `${translatedText}\n${resultedTranslation}\n[Translated block]`;
    }

    return translatedText;
}

function validateResponse(response) {
    const iaRefusal = response.includes("I'm sorry, but I can't assist with that.");
    let koreanWordsValidation = false;
    if (!iaRefusal) {
        const myArray = response.match(/(\S*[\u3131-\u314e|\u314f-\u3163|\uac00-\ud7a3]+\S*)/g);
        if (myArray) {
            for (let index = 0; index < myArray.length; index++) {
                myArray[index] = myArray[index].replaceAll('.', '')
                                               .replaceAll(',', '')
                                               .replaceAll('!', '')
                                               .replaceAll('?', '')
                                               .replaceAll('"', '');
            }
            koreanWordsValidation = [...new Set(myArray)].length > 4;
        }
    }

    return iaRefusal || koreanWordsValidation;
}
