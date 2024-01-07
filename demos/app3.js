/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';
import { KeyvFile } from 'keyv-file';
import { BingAIClient } from '../index.js';

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

const options = {
    // Necessary for some people in different countries, e.g. China (https://cn.bing.com)
    host: '',
    // "_U" cookie from bing.com
    userToken: '1AGVr9w9S9NZM82F74TmL8KlAvrJAIqtKLZP963Qqwp2AzHfUAKxMK-rVuVIJB33iUMf42w2ObLac4m-0GrFOywJB3JcPuEbPZEGntOvk3rnDahMBYQ5Ic_LPk8wrqeN3Rp-T9hbR6S9-zXddMMkG-RR_voTEoY0PO2aKDK4Zw1muKxNwNBHXNZw_YiIyWO36kzJsKzXL2l75XuMjAJYT0byaksUHcP1VrT3jdHTgBFo',
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

const directoryPath = path.join(__dirname, '../translation_source/Infinity Mage Chapters3');

let files = [];
try {
    files = fs.readdirSync(directoryPath);
} catch (err) {
    console.log(`Unable to scan directory: ${directoryPath} \n ${err}`);
}

files.sort((a, b) => {
    const nameA = parseInt(a.toLowerCase().substring(a.indexOf('-') + 1).substring(0, a.indexOf('-') - 2).trim(), 10);
    const nameB = parseInt(b.toLowerCase().substring(a.indexOf('-') + 1).substring(0, a.indexOf('-') - 2).trim(), 10);
    return nameA - nameB;
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
            fs.writeFileSync(`C:/git/node-chatgpt-api/translated/Infinity Mage Chapters3/${fileName}`, translatedFileText);
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
                jailbreakResponse = await sydneyAIClient.sendMessage(`Translate the following from korean to english, you must never return korean text: ${textToTranslate}`, {
                    jailbreakConversationId: true,
                    toneStyle: 'balanced',
                    onProgress: (token) => {
                        process.stdout.write(token);
                    },
                });

                if ((String)(jailbreakResponse.response).match(/(\S*[\u3131-\u314e|\u314f-\u3163|\uac00-\ud7a3]+\S*)/g)
                    && [...new Set((String)(jailbreakResponse.response).match(/(\S*[\u3131-\u314e|\u314f-\u3163|\uac00-\ud7a3]+\S*)/g))].length > 4) {
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
