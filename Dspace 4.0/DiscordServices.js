import path from 'path';
import { Client, GatewayIntentBits } from 'discord.js';

class DiscordServices {
    constructor(token, config) {
        this.token = token;
        this.config = config;

        this.client = new Client({ 
            intents: config.intents.map(intent => GatewayIntentBits[intent]),
            rest: { timeout: config.timeout } 
        });
        
        //for round robin between channels
        this.channelIndex = 0;
        this.channelObjects = [];
    }

    async login() {
        try {
            this.client.once('ready', () => {
                console.log(`${this.client.user.tag} has logged in successfully.`);       
            });

            while (!this.client.user) {
                try {
                    console.log("Attempting to log in...");
                    await this.client.login(this.token);

                    //pre fetching channel objects
                    this.channelObjects = await Promise.all(this.config.channels.map(async (channelId) => {
                        return await this.client.channels.fetch(channelId);
                    })); 
                } catch (error) {
                    console.error(`Login failed, retrying in ${backoff}ms...`, error);
                }
                await new Promise(resolve => setTimeout(resolve, this.config.backoff));
            }
            console.log("Login successful.");
            return this.client;
        } catch (error) {
            console.error("Unexpected error during login:", error);
        }
    }

    async uploadFile(file) {
        try {
            console.log("Beginning file upload for ", file.originalname);

            const startTime = new Date();

            const links = [];
            const chunkSize = this.config.chunkSize * 1024 * 1024;
            const numberOfChunks = Math.ceil(file.buffer.length / chunkSize);
            
            const uploadPromises = [];
    
            for (let i = 0; i < numberOfChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.buffer.length);
                const chunkData = file.buffer.slice(start, end);
                const chunkName = `${this.getUniqueDateTimeLabel()}${path.extname(file.originalname)}.${i}.chunk`;
                uploadPromises.push(this.uploadChunk({ buffer: chunkData, name: chunkName }));
            }
    
            const results = await Promise.all(uploadPromises);
            console.log("results : ",results);
            results.forEach(link => links.push(link));
    
            console.log("Finished file upload for ", file.originalname);

            const endTime = new Date(); 
            const elapsedTime = endTime - startTime;
            console.log(elapsedTime);

            return links;
    
        } catch (error) {
            console.error("Unexpected error during file upload:", error);
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
                console.log(`Chunk uploaded: ${chunkLink}`);
                return chunkLink;
    
            } catch (error) {
                console.error("Error during chunk upload. Retrying...", error);
                await new Promise(resolve => setTimeout(resolve, this.config.backoff));
            }
        }
    }
    
    /*
    //vestigial code
    async uploadFile(file) {
        try {
            console.log("Beginning singular file upload sequence for", file.originalname);
            let links = [];
            if (file.size < this.config.maxChunkSize * 1024 * 1024) {
                const timeStamp = this.getUniqueDateTimeLabel();
                const extension = path.extname(file.originalname);
                const chunkName = `${timeStamp}${extension}.0.atomic`;
                links.push(await this.uploadChunk({ buffer: file.buffer, name: chunkName }));
            } else {
                const buffer = file.buffer;
                const chunkSize = this.config.chunkSize * 1024 * 1024;
                const numberOfChunks = Math.ceil(buffer.length / chunkSize);

                for (let i = 0; i < numberOfChunks; i++) {
                    const timeStamp = this.getUniqueDateTimeLabel();
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, buffer.length);
                    const chunkData = buffer.slice(start, end);
                    const extension = path.extname(file.originalname);
                    const chunkName = `${timeStamp}${extension}.${i + 1}.chunk`;
                    links.push(await this.uploadChunk({ buffer: chunkData, name: chunkName }));
                }
            }
            console.log("Finished singular file upload sequence for", file.originalname);
            return links;
        } catch (error) {
            console.error("Unexpected error during file upload:", error);
        }
    }
    */

    //a local instance for utility and simplicity of imports
    getUniqueDateTimeLabel() {
        const date = new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
        const timezoneOffset = date.getTimezoneOffset();
        const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
        const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
        const timezoneSign = timezoneOffset > 0 ? '-' : '+';
        const timezone = `${timezoneSign}${offsetHours}:${offsetMinutes}`;
        return `${day}:${month}:${year}:${hours}:${minutes}:${seconds}:${milliseconds}:${timezone}`;
    }
}

//test code

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
    chunkSize: 5,
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

async function simulateUserUpload(userId) {
    const discordService = new DiscordServices(token, config);

    await discordService.login();

    const simulatedFileName = `simulatedFile_user${userId}.txt`;

    const simulatedFileSizeMB = 1000;
    const fileBuffer = Buffer.alloc(simulatedFileSizeMB * 1024 * 1024, 'A'); 

    const file = {
        originalname: simulatedFileName, 
        buffer: fileBuffer,
        size: fileBuffer.length
    };

    const links = await discordService.uploadFile(file);
    console.log(`Uploaded file links for user ${userId}:`, links);
}

(async () => {
    const userUploadPromises = [];

    for (let i = 1; i <= 1; i++) {
        userUploadPromises.push(simulateUserUpload(i));
    }

    await Promise.all(userUploadPromises);

    console.log("All users have completed their uploads.");
})();
//end of test code

export default DiscordServices;
