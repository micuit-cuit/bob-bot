require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const username = process.env.USERNAMEBOB
const password = process.env.PASSWORDBOB
const discordToken = process.env.DISCORDTOKEN
var token = undefined;
const categories = config.categoriesId;
function numberToBlodNumber(number) {
    const newNumber = {
        0 : "𝟬",
        1 : "𝟭",
        2 : "𝟮",
        3 : "𝟯",
        4 : "𝟰",
        5 : "𝟱",
        6 : "𝟲",
        7 : "𝟳",
        8 : "𝟴",
        9 : "𝟵",
    }
    let numberString = number.toString();
    let newNumberString = "";
    for (let i = 0; i < numberString.length; i++) {
        newNumberString += newNumber[numberString[i]];
    }
    return newNumberString;
}

function bobRequette({ action = "get", collection = undefined, body = undefined, id = undefined, index = undefined, controller, token = undefined, strategy = "local", authorization = undefined, callback = () => { } }) {
    const jwt = token;
    const jsonData = {
        action,
        collection,
        body,
        controller,
        _id: id,
        jwt,
        index,
        strategy,
    };
    const jsonString = JSON.stringify(jsonData);
    fetch("https://bob-api.run.innovation-laposte.io/_query", {
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "authorization": authorization ? `Bearer ${authorization}` : ""
        },
        "body": jsonString,
        "method": "POST"
    }).then(response => { return response.json() })
        .then(data => {
            callback(data);
        })
        .catch(err => console.log(err));
}
function login(username, password, callback = () => { }) {
    bobRequette({
        action: "login", body: { username, password }, controller: "auth", callback: (data) => {
            token = data.result.jwt;
            setTimeout(() => {
                login(username, password)
            }, data.result.expiresAt - Date.now());
            callback(token);
        }
    });
}

function getMoods(callback) {
    bobRequette({
        action: "get", collection: "daily_moodsgroup", controller: "document", index: "bob", token, id: "cNY0t40BBT2uGxRqaH3l", callback: (data) => {
            callback(data.result._source.dailyMoods);
        }
    })
}
function sendMessage(client, channel, message) {
    client.channels.cache.get(channel).send(message);
}

function displayMood(client, mood, moodId) {
    const lastHumeurs = require('./lastHumeurs.json')[moodId];
    //date au format "2021-08-31"
    let actualDate = new Date().toISOString().split("T")[0];
    //si la date de la dernière humeur est différente de la date actuelle, on reset l'index
    if (lastHumeurs.lastDate != actualDate) {
        lastHumeurs.contenu = [];
    }
    //on supprime les messages déjà envoyés (dans lastHumeurs.contenu)
    let newHumeurs = mood.comments.filter((comment, index) => {
        return lastHumeurs.contenu.indexOf(comment) == -1;
    });
    let newHumeursLength = newHumeurs.length;
    let newHumeursList = []
    let i = 0;
    let intervale = setInterval(() => {
        if (i < newHumeurs.length) {
            //si newHumeurs[i] contient un mot de la liste des mots interdits, on le remplace par "·"*longueur du mot
            let badWords = config.badWords;
            for (let word of badWords) {
                newHumeurs[i] = newHumeurs[i].replace(new RegExp(word, "gi"), "·".repeat(word.length));
            }
            //si newHumeurs[i] contient un mot de la liste des mots a remplacer, on le remplace par le mot de remplacement
            let replaceWords = config.replaceWords;
            for (let word in replaceWords) {
                newHumeurs[i] = newHumeurs[i].replace(new RegExp(word, "gi"), replaceWords[word]);
            }
            let text = config.emoji[moodId] + " " + newHumeurs[i];
            sendMessage(client, categories.general, text);
            sendMessage(client, categories[moodId], text);
            newHumeursList.push(newHumeurs[i]);
            i+=1;
        }else{
            //arette la boucle
            clearInterval(intervale);
            //enregistre la dernière humeur
            lastHumeurs.contenu = lastHumeurs.contenu.concat(newHumeursList);
            lastHumeurs.lastDate = actualDate;
            let saveHumeurs = require('./lastHumeurs.json');
            saveHumeurs[moodId] = lastHumeurs;

            fs.writeFileSync('./lastHumeurs.json', JSON.stringify(saveHumeurs));
        }
    }, 100);//100ms pour éviter le spam de l'api de discord

    //update le nom des channels
    //optien le nom du channel actuel
    let channel = client.channels.cache.get(categories[moodId]);
    let channelName = channel.name.split(config.separator)[0] +config.separator + numberToBlodNumber(mood.count) + config.texts[moodId];
    //change le nom du channel
    channel.setName(channelName);
    let date = new Date();
    console.log(`${mood.count} personnes sont ${moodId== "happy" ? "heureuses" : moodId == "neutral" ? "neutres" : "tristes"}, ( ${newHumeursLength} depuis la dernière mise à jour), update à ${date.getHours() < 10 ? "0" + date.getHours() : date.getHours()}:${date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()}:${date.getSeconds() < 10 ? "0" + date.getSeconds() : date.getSeconds()}`);
}
function displayPubMessage() {
    bobRequette({
        action: "update",
        body: {
            userId: "",
            state: "happy",
            groupsInvolved: [
                "cNY0t40BBT2uGxRqaH3l"
            ],
            comment: config.pubMessage,
            sentDate: new Date().toISOString().split("T")[0]
        },
        collection: "moods",
        controller: "document",
        index: "bob",
        id: "mNRT_I0B4SaVy7Ibzp-a",
        token,
        callback: (data) => {
            console.log(data);
        }
    });
}
// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    setInterval(() => {
        updateChannel();
    }, 1000 * 60 * 10);//30 minutes
    //attemps minuit + 10 minutes
    let date = new Date();
    let minuit = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 10, 0);
    let time = minuit.getTime() - date.getTime();
    setInterval(function() {
        const date = new Date();
        const heures = date.getHours();
        const minutes = date.getMinutes();
        
        // Vérifier si l'heure est 00:10
        if (heures === 1 && minutes === 10) {
            displayPubMessage();
        }
    }, 60000);
    updateChannel();
    function updateChannel() {
        getMoods((moods) => {
            moods = moods[moods.length - 1];
            displayMood(client, moods.moods.happy, "happy");
            displayMood(client, moods.moods.neutral, "neutral");
            displayMood(client, moods.moods.sad, "sad");
            //potien le nom du channel general
            let channel = client.channels.cache.get(categories.general);
            let count = moods.moods.happy.count + moods.moods.neutral.count + moods.moods.sad.count;
            let channelName = channel.name.split(config.separator)[0] +config.separator + numberToBlodNumber(count) + config.texts.general;
            //change le nom du channel
            channel.setName(channelName);
        });
    }
});

// Log in to Discord with your client's token
login(username, password, (token) => {
    client.login(discordToken);
});
