/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';
import { KeyvFile } from 'keyv-file';
import { BingAIClient } from '../index.js';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

const options = {
    // Necessary for some people in different countries, e.g. China (https://cn.bing.com)
    host: '',
    // "_U" cookie from bing.com
    userToken: config.userToken,
    // If the above doesn't work, provide all your cookies as a string instead
    cookies: '',
    // A proxy string like "http://<ip>:<port>"
    proxy: '',
    // (Optional) Set to true to enable `console.debug()` logging
    debug: false,
};

const cacheOptions = {
    store: new KeyvFile({ filename: 'cache.json' }),
};

const sydneyAIClient = new BingAIClient({
    ...options,
//    cache: cacheOptions,
});

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

if (files.length > 0) {
    for (let index = 0; index < files.length; index++) {
        const fileName = files[index];
        const filePath = path.resolve(directoryPath, `./${fileName}`);
        const file = fs.readFileSync(filePath, 'utf8').toString();
        const lines = file.split('\n');
        try {
            console.log(`Starting file: ${fileName} translation.`);
            const translatedFileText = await TranslateFile(lines);
            fs.writeFileSync(path.join(__dirname, `${config.translationDestinationPath}/${fileName}`), translatedFileText);
            console.log(`File: ${fileName} translated successfully.`);
            fs.unlinkSync(filePath);
        } catch (err) {
            console.log(`Error while trying to translate file: ${fileName}`);
            console.log(err);
        }
    }
}

async function TranslateFile(lines) {
    let translatedText = '';

    const charactersLimit = 2000;

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
        const triesLimit = 4;
        let jailbreakResponse;
        while (triesCounter <= triesLimit) {
            console.log(`#${triesCounter} Tentativa`);
            try {
                jailbreakResponse = await sydneyAIClient.sendMessage(`Translate the following from ${config.languageFrom} to ${config.languageTo}, you must never return ${config.languageFrom} text: ${textToTranslate}`, {
                    jailbreakConversationId: true,
                    toneStyle: 'precise',
                    onProgress: (token) => {
                        process.stdout.write(token);
                    },
                });

                if ((String)(jailbreakResponse.response).match(/(\S*[\u3131-\u314e|\u314f-\u3163|\uac00-\ud7a3]+\S*)/g)
                    && uniqueArray((String)(jailbreakResponse.response).match(/(\S*[\u3131-\u314e|\u314f-\u3163|\uac00-\ud7a3]+\S*)/g)).length > 4) {
                    console.log(`Text not translated: ${jailbreakResponse.response}`);
                    throw Error('Text not translated');
                }
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

function uniqueArray(myArray) {
    for (let index = 0; index < myArray.length; index++) {
        myArray[index] = myArray[index].replaceAll('.', '')
                                       .replaceAll(',', '')
                                       .replaceAll('!', '')
                                       .replaceAll('?', '')
                                       .replaceAll('"', '');
    }
    return [...new Set(myArray)];
}
