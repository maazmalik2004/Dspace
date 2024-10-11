import path from 'path';
import { Client, GatewayIntentBits } from 'discord.js';
import logger from "../logger/logger.js";

class DiscordServices {
    constructor(token, config, client = null, channelObjects = null) {
        this.token = token;
        this.config = config;

        this.client = client || new Client({ 
            intents: config.intents.map(intent => GatewayIntentBits[intent]),
            rest: { timeout: config.timeout } 
        });

        this.channelIndex = 0;
        this.channelObjects = channelObjects || [];
    }

    async prefetchChannelObjects() {
        try {
            this.channelObjects = await Promise.all(
                this.config.channels.map(channelId => this.client.channels.fetch(channelId))
            );
            logger.log("Channel objects prefetched successfully.");
            return this.channelObjects;
        } catch (error) {
            logger.error("Error in prefetchChannelObjects()", error);
        }
    }

    async login() {
        try {
            this.client.once('ready', () => {
                logger.log(`${this.client.user.tag} has logged in successfully.`);
            });

            while (!this.client.user) {
                try {
                    logger.log("Attempting to log in...");
                    await this.client.login(this.token);
                    await this.prefetchChannelObjects();
                } catch (error) {
                    logger.error(`Login failed, retrying in ${this.config.backoff}ms...`, error);
                }
                await new Promise(resolve => setTimeout(resolve, this.config.backoff));
            }
            return this.client;
        } catch (error) {
            logger.error("Unexpected error during DiscordServices.login()", error);
        }
    }

    async uploadFile(file) {
        try {
            logger.log("Uploading file", file.originalname);
            
            const chunkSize = this.config.chunkSize * 1024 * 1024;
            const numberOfChunks = Math.ceil(file.buffer.length / chunkSize);
            const extension = path.extname(file.originalname);
    
            const uploadPromises = await Promise.all(
                Array.from({ length: numberOfChunks }, async (_, i) => {
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, file.buffer.length);
                    const chunkData = file.buffer.slice(start, end);
                    
                    let chunkName;
                    if (numberOfChunks === 1) {
                        chunkName = `${this.getUniqueDateTimeLabel()}${extension}.${i}.atomic`;
                    } else {
                        chunkName = `${this.getUniqueDateTimeLabel()}${extension}.${i}.chunk`;
                    }
    
                    return this.uploadChunk({ buffer: chunkData, name: chunkName });
                })
            );

            logger.log("upload complete", file.originalname);
            return uploadPromises;
        } catch (error) {
            logger.error("Unexpected error during file upload", error);
        }
    }

    async uploadChunk(chunk) {
        while (true) {
            try {
                const channel = this.channelObjects[this.channelIndex];
                this.channelIndex = (this.channelIndex + 1) % this.config.channels.length;

                const message = await channel.send({
                    files: [{ attachment: chunk.buffer, name: chunk.name }]
                });

                const chunkLink = `https://discord.com/channels/${channel.guild.id}/${channel.id}/${message.id}`;
                logger.log(`Chunk uploaded: ${chunkLink}`);
                return chunkLink;
            } catch (error) {
                logger.error("Error during chunk upload. Retrying...", error);
                await new Promise(resolve => setTimeout(resolve, this.config.backoff));
            }
        }
    }

    async retrieveFile(links) {
        try {
            logger.log("Beginning file retrieval");
            
            const retrievalPromises = links.map(link => this.retrieveChunk(link));
            const downloadedChunks = await Promise.all(retrievalPromises);
            const cumulativeBuffer = Buffer.concat(downloadedChunks.map(chunk => chunk.buffer));
            const extension = downloadedChunks[0].name.split('.')[1];
                
            logger.log("File retrieval completed successfully.");
            return {
                name: `retrieved.${extension}`,
                extension: extension,
                buffer: cumulativeBuffer
            };
        } catch (error) {
            logger.error("Error during file retrieval", error);
            throw new Error('Failed to retrieve file chunks');
        }
    }
    
    async retrieveChunk(link) {
        logger.log("Retrieving", link);
        const regex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = link.match(regex);

        if (!match) {
            logger.warn('Invalid Discord link', link);
            throw new Error('Invalid Discord link');
        }

        const [, guildId, channelId, messageId] = match;
        const channel = this.channelObjects[this.config.channels.indexOf(channelId)];

        while (true) {
            try {
                const message = await channel.messages.fetch(messageId);
                const attachment = message.attachments.first();

                if (!attachment) {
                    logger.warn('No attachment found in the message for link:', link);
                    throw new Error('No attachment found in the message');
                }

                const response = await fetch(attachment.url);
                const buffer = Buffer.from(await response.arrayBuffer());

                logger.log("Chunk retrieved successfully:", attachment.name);
                return {
                    name: attachment.name,
                    buffer: buffer
                };
            } catch (error) {
                logger.error(`Error retrieving chunk: ${error.message}`, error);
                await new Promise(resolve => setTimeout(resolve, this.config.backoff));
            }
        }
    }  
    
    getUniqueDateTimeLabel() {
        return Date.now();
    } 
}

/*
// Function to create a file from a buffer and save it at a specified location
async function createFile(buffer, filePath) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, buffer, (err) => {
            if (err) {
                return reject(err);
            }
            console.log(`File saved successfully at ${filePath}`);
            resolve();
        });
    });
}

// Function to read a file from the specified path
async function readFileBuffer(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                return reject(err);
            }
            resolve(data);
        });
    });
}

async function test(filePath) {
    let token = "";

    const config = {
        intents: [
            "Guilds",
            "GuildMessages",
            "MessageContent"
        ],
        restVersion: 10,
        timeout: 50000,
        backoff: 1000,
        exponentialBackoffCoefficient: 1.5,
        attempts: 100,
        chunkSize: 8,
        maxChunkSizeAllowed: 24,
        channels: [
            "1047921563447590994",
            "1047922054831284255",
            "1047921640840908910",
            "1047921823179874324",
            "1047921706972487721",
            "1047921950871265281"
        ]
    };

    async function simulateUserUploadIndividualInstance(userId) {
        const discordService = new DiscordServices(token, config);
        await discordService.login(); // Login for each instance
        await discordService.prefetchChannelObjects();

        // Read the file buffer from the specified file path
        const fileBuffer = await readFileBuffer(filePath);
        const simulatedFileName = path.basename(filePath); // Use the actual file name

        const file = {
            originalname: simulatedFileName,
            buffer: fileBuffer,
            size: fileBuffer.length
        };

        const uploadStartTime = Date.now(); // Start time for upload
        const links = await discordService.uploadFile(file);
        const uploadEndTime = Date.now(); // End time for upload

        console.log(`Uploaded file links for user ${userId}:`, links);

        // Simulate file retrieval after upload
        try {
            const retrievalStartTime = Date.now(); // Start time for retrieval
            const retrievedFile = await discordService.retrieveFile(links);
            const retrievalEndTime = Date.now(); // End time for retrieval

            const uploadTime = uploadEndTime - uploadStartTime; // Calculate upload time
            const retrievalTime = retrievalEndTime - retrievalStartTime; // Calculate retrieval time
            
            console.log(`Retrieved file for user ${userId}:`, retrievedFile.name);
            console.log(`User ${userId} - Upload Time: ${uploadTime} ms, Retrieval Time: ${retrievalTime} ms`);

            // Save the retrieved buffer to a specified file path
            const outputPath = "C:\\Users\\MI\\Downloads\\meow.mp4" // Specify your path here
            await createFile(retrievedFile.buffer, outputPath); // Save retrieved buffer to file
        } catch (error) {
            console.error(`Error retrieving file for user ${userId}:`, error);
        }
    }

    const startIndividualInstance = Date.now();

    const userUploadPromisesIndividual = [];
    for (let i = 1; i <= 10; i++) { // Simulate uploads for 1 user (you can increase this to simulate more)
        userUploadPromisesIndividual.push(simulateUserUploadIndividualInstance(i));
    }
    await Promise.all(userUploadPromisesIndividual);

    const endIndividualInstance = Date.now();
    const elapsedIndividualInstance = endIndividualInstance - startIndividualInstance;

    console.log(`All users completed uploads and retrievals (Individual Instances) in ${elapsedIndividualInstance} ms.`);
}

const filePathToUpload = "C:\\\Users\\\MI\\\Downloads\\aalu.mp4";

test(filePathToUpload).catch(console.error);
*/

export default DiscordServices;
