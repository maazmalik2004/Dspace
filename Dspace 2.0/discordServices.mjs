import {Client, GatewayIntentBits, REST} from 'discord.js';
import {TOKEN, getConfigData} from './config.mjs';
import {getUniqueDateTimeLabel} from './utils.mjs';
import path from 'path';

//global data
let CLIENT;
let REST_OBJECT;
let CHANNEL_INDEX = 0;

//everything required to set up a discord client/bot
async function initializeDiscord(){
    try{
        await configureDiscord();
        await botLogin();
        console.log("discord client initialized");
    }catch(error){
        console.error("Could not initialize discord services:", error);
        throw error;
    }
}

async function configureDiscord(){
    try{
        const config = await getConfigData();
        const intents = config.discord.intents.map(intent => GatewayIntentBits[intent]);
        const timeout = config.discord.timeout || 30000;
        const restVersion = config.discord.restVersion || 10;

        const client = new Client({
            intents: intents,
            restRequestTimeout:timeout
        });
        const rest = new REST({ version: restVersion });
        rest.setToken(TOKEN);

        CLIENT = client;
        REST_OBJECT = rest;
        console.log("discord client configured");
    }catch(error){
        console.error("Could not configure discord:", error);
        throw error;
    }
}

async function botLogin(){
    const config = await getConfigData();
    const client = CLIENT;
    let backoff = config.discord.backoff || 500;
    while(true){
        try{
            console.log("Attempting to login...");
            await client.login(TOKEN);

            client.on('ready', () => {
                console.log(`${client.user.tag} has logged in successfully`);
            });

            return;
        }catch(error){
            console.error("Could not login to discord:", error);
            console.log("Trying again...")
            backoff = backoff*config.discord.exponentialBackoffCoefficient;
            await new Promise(res => setTimeout(res, backoff));
        }
    }
}

async function uploadSingleFileToDiscord(file) {
    try {
        console.log('..............................');
        console.log('Beginning singular file upload sequence...');

        const config = await getConfigData();
        const client = CLIENT;
        
        const links = [];
        const uploadChunk = async (chunkData, chunkName, attempts = config.discord.attempts, retryDelay = config.discord.backoff) => {
            
            const channel = await client.channels.fetch(config.discord.channels[CHANNEL_INDEX]);
            CHANNEL_INDEX = (CHANNEL_INDEX+1)%config.discord.channels.length;
            for (let attempt = 1; attempt <= attempts; attempt++) {
                try {
                    const sentMessage = await channel.send({
                        files: [{ attachment: chunkData, name: chunkName }]
                    });
                    const chunkLink = `https://discord.com/channels/${channel.guild.id}/${channel.id}/${sentMessage.id}`;
                    links.push(chunkLink);
                    console.log(`Successfully uploaded chunk ${chunkName} to Discord!`);
                    return true;
                } catch (error) {
                    console.error(`Could not upload chunk ${chunkName}`, error);
                    console.log(`Attempt ${attempt} : Retrying...`);

                    if (attempt === attempts) {
                        console.error(`Could not upload chunk ${chunkName} after ${attempts} attempts.`);
                        throw error;
                    }

                    await new Promise(res => setTimeout(res, retryDelay));
                }
            }
        }
        if (file.size < config.discord.maxChunkSizeAllowed * 1024 * 1024) {
            const timeStamp = getUniqueDateTimeLabel();
            const fileExtension = path.extname(file.originalname);
            const chunkName = `${timeStamp}${fileExtension}.0.atomic`;
            await uploadChunk(file.buffer, chunkName);
        } else {
            const fileBuffer = file.buffer;
            const chunkSize = config.discord.chunkSize * 1024 * 1024;
            const numberOfChunks = Math.ceil(fileBuffer.length / chunkSize);
            const timeStamp = getUniqueDateTimeLabel();
            const fileExtension = path.extname(file.originalname);
            for (let i = 0; i < numberOfChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, fileBuffer.length);
                const chunkData = fileBuffer.slice(start, end);
                const chunkName = `${timeStamp}${fileExtension}.${i + 1}.chunk`;
                await uploadChunk(chunkData, chunkName);
            }
        }
        console.log('Singular file upload complete');
        console.log('..............................');
        return links;
    } catch (error) {
        console.error("Could not upload file to discord:", error);
        throw error;
    }
}

async function retrieveSingleFileFromDiscord(links){
    try{
        const client = CLIENT;
        console.log('..............................');
        console.log('Beginning singular file retrieval sequence');
        const downloadedChunks=[];
        const chunkNames=[];

        for(const currentLink of links){
            const regex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
            const match = currentLink.match(regex);
            const [_, guildId, channelId, messageId] = match;

            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);

            const attachment = message.attachments.first();//URL of the attached chunk to be retrieved
            const response = await fetch(attachment.url);//fetches the chunk data from the specified URL
            const arrayBuffer = await response.arrayBuffer();//converts the response to a buffer
            const buffer = Buffer.from(arrayBuffer);//converts general buffer to node.js buffer
            //these set of three commands produce the required buffer on which further action can be taken

            downloadedChunks.push(buffer);
            chunkNames.push(attachment.name);
        }

        console.log('Singular file retrieval sequence complete');
        console.log('..............................');
        console.log('Beginning recombination of file');
        const combinedBuffer = Buffer.concat(downloadedChunks);
        const combinedFileName = `combinedFile.${chunkNames[0].split('.')[1]}`;
        console.log('Recombination of file complete');
        console.log('..............................');
        return { buffer: combinedBuffer, name: combinedFileName };

    }catch(error){
        console.error("Could not retrieve file from discord:", error);
        throw error;
    }
}

export {CLIENT, REST_OBJECT, CHANNEL_INDEX, initializeDiscord, uploadSingleFileToDiscord, retrieveSingleFileFromDiscord};