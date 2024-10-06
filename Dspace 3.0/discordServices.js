import path from "path";
import { getUniqueDateTimeLabel } from "./utils.js";
import { Client, GatewayIntentBits, REST } from 'discord.js';
import { getConfiguration } from "./config.js";
import fetch from 'node-fetch';
import dotenv from "dotenv";

let configuration;
let token;
let client, rest;
let channelIndex = 0;

await initializeDiscord();

async function initializeDiscord() {
    try {
        dotenv.config();
        token = process.env.DSPACE_TOKEN;
        configuration = await getConfiguration();

        await configureDiscord();
        await login();
        console.log("Discord client initialized");
    } catch (error) {
        console.error("Error initializing Discord client: ", error);
        throw error;
    }
}

async function configureDiscord() {
    try {
        const intents = configuration.discord.intents.map(intent => GatewayIntentBits[intent]);
        client = new Client({ intents: intents, restTimeout: configuration.discord.timeout || 20000 });
        rest = new REST({ version: configuration.discord.restVersion || 10 });
        rest.setToken(token);
        console.log("Discord client configured");
    } catch (error) {
        console.error("Could not configure discord client: ", error);
        throw error;
    }
}

async function login() {
    let backoff = configuration.discord.backoff || 500;
    while (true) {
        try {
            console.log("Attempting to login");
            await client.login(token);
            client.once('ready', () => {
                if (client.user) {
                    console.log(`${client.user.tag} has logged in successfully`);
                } else {
                    console.error("Client not ready, retrying...");
                    throw new Error("Client not ready");
                }
            });
            return;
        } catch (error) {
            console.error("Could not login to Discord: ", error);
            console.log("Retrying in ", backoff, "ms");
            backoff *= configuration.discord.exponentialBackoffCoefficient || 1.3;
            await new Promise(res => setTimeout(res, backoff));
        }
    }
}

async function uploadSingleFileToDiscord(file) {
    try {
        console.log("................................................");
        console.log("Beginning singular file upload sequence for file ", file.originalname);

        let links = [];
        async function uploadSingleChunkToDiscord(chunkData, chunkName, attempts = configuration.discord.attempts, backoff = configuration.discord.backoff) {
            const channel = await client.channels.fetch(configuration.discord.channels[channelIndex]);
            channelIndex = (channelIndex + 1) % configuration.discord.channels.length;
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
                    console.error("Error uploading chunk to Discord: ", error);
                    console.log("Retrying in ", backoff, "ms");
                    if (attempt == attempts) {
                        console.error("Failed to upload chunk to Discord after ", attempts, " attempts");
                        return false;
                    }
                    await new Promise(res => setTimeout(res, backoff));
                }
            }
        }

        if (file.size < configuration.discord.maxChunkSizeAllowed * 1024 * 1024) {
            const timeStamp = getUniqueDateTimeLabel();
            const fileExtension = path.extname(file.originalname);
            const chunkName = `${timeStamp}${fileExtension}.0.atomic`;
            await uploadSingleChunkToDiscord(file.buffer, chunkName);
        } else {
            const timeStamp = getUniqueDateTimeLabel();
            const fileExtension = path.extname(file.originalname);

            const fileBuffer = file.buffer;
            const chunkSize = configuration.discord.chunkSize * 1024 * 1024;
            const numberOfChunks = Math.ceil(fileBuffer.length / chunkSize);

            for (let i = 0; i < numberOfChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, fileBuffer.length);
                const chunkData = fileBuffer.slice(start, end);
                const chunkName = `${timeStamp}${fileExtension}.${i + 1}.chunk`;
                await uploadSingleChunkToDiscord(chunkData, chunkName);
            }
        }
        console.log('Singular file upload complete');
        console.log("................................................");
        return links;
    } catch (error) {
        console.error("Could not upload file to discord:", error);
        throw error;
    }
}

async function retrieveSingleFileFromDiscord(links) {
    try {
        console.log('..............................');
        console.log('Beginning singular file retrieval sequence');

        const downloadedChunks = [];

        for (const link of links) {
            const regex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
            const match = link.match(regex);
            const [_, guildId, channelId, messageId] = match;

            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            const attachmentReference = message.attachments.first();
            const attachment = await fetch(attachmentReference.url);
            const arrayBuffer = await attachment.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            downloadedChunks.push({
                name: attachmentReference.name,
                buffer: buffer,
            });
        }
        console.log('Singular file retrieval sequence complete');
        console.log('..............................');
        console.log('Beginning recombination of file');
        const combinedBuffer = Buffer.concat(downloadedChunks.map(chunk => chunk.buffer));
        console.log(downloadedChunks);
        console.log(downloadedChunks[0])
        console.log(downloadedChunks[0].name)
        const combinedBufferName = `combined.${downloadedChunks[0].name.split(".")[1]}`;
        return {
            name: combinedBufferName,
            buffer: combinedBuffer,
        };
    } catch (error) {
        console.error("Could not retrieve file from discord:", error);
        throw error;
    }
}

export { initializeDiscord, uploadSingleFileToDiscord, retrieveSingleFileFromDiscord };
