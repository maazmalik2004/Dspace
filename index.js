import express from 'express';//for setting up a node server
import cors from 'cors';//for cross origin resource sharing
import multer from 'multer';//for file buffer handling
import path from 'path';//for file path management
import { fileURLToPath } from 'url';//ooga booga does something something
import fs from 'fs';//to read and write files and interface with the system's file system
import { Client, GatewayIntentBits, REST } from 'discord.js';//to interface with discord
import { config } from 'dotenv';//to configure the system environment variables ie. .env file
import { v4 as uuidv4 } from 'uuid';//to assign a unique identifier to each file and folder record in the virtual directory structure
import archiver from 'archiver';//to archive the retrieved folder and store it in the project directory
import fetch from 'node-fetch';//ooga booga does something something, should work without this i believe

//configure the system environment variables
config();

//accessing the system environment variables
const TOKEN = process.env.DSPACE_TOKEN;//highly confidential, enables the bot to log in to discord remotely
const CLIENT_ID = process.env.DSPACE_CLIENT_ID;//each discord bot and user is assigned a client ID
const DIRNAME = path.dirname(fileURLToPath(import.meta.url)); //extracting the project directory name

//initializing multer for file handling. we are not storing the files we are processing to disc as it would add unnecessary overheads. we process the file directly from buffers in main memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

//setting up middleware and server
const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

//discord client object, dont worry bout it
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    restRequestTimeout: 50000,
});

//discord rest object, dont worry bout it
const rest = new REST({ version: '10' });
rest.setToken(TOKEN);

//ensures client login by retrying everytime an error occurs
async function ensureClientLogin(token, retryDelay = 2000) {
    while (true) {
        try {
            console.log('Attempting to login...');
            await client.login(token);
            console.log('Login successful!');
            return;
        } catch (error) {
            console.error('Login attempt failed:', error.message);
            console.log(`Retrying in ${retryDelay / 1000} seconds...`);
            await new Promise(res => setTimeout(res, retryDelay));
        }
    }
}
ensureClientLogin(TOKEN);

//client has logged in and is ready and online in the discord server
client.on('ready', () => {
    console.log(`${client.user.tag} has logged in successfully!`);
});

//virtual directory, will be shifted to mongo DB and incorporated with multiple users. each user will have his own virtual file space
//KEEP EXTRA FOCUS ON THE DIRECTORY STRUCTURE
const virtualDirectory = {
    name: 'root',
    type: 'directory',
    path: 'root',
    size: 0,
    createdAt: getUniqueDateTimeLabel(),
    modifiedAt: getUniqueDateTimeLabel(),
    children: []
};

//generates a unique date time label as the same date and time wont ever occur again
function getUniqueDateTimeLabel() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${day}${month}${year}${hours}${minutes}${seconds}${milliseconds}`;
}

//returns the time elapsed between the start of the operation and end of the operation
function getTimeElapsed(startTime, endTime) {
    const uploadTime = endTime - startTime;
    const hours = Math.floor(uploadTime / (1000 * 60 * 60));
    const minutes = Math.floor((uploadTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uploadTime % (1000 * 60)) / 1000);
    const milliseconds = uploadTime % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

//adds a link field to the received directory structure at the /upload endpoint (wayyy down).
//also adds a unique identifier to each and every file and folder record in the VDS(virtual directory structure)
function addLinksAndIds(directoryStructure) {
    directoryStructure.id = uuidv4();
    if (directoryStructure.type === 'file') {
        directoryStructure.links = [];
    }
    if (directoryStructure.children && directoryStructure.children.length > 0) {
        directoryStructure.children.forEach(child => addLinksAndIds(child));
    }
}

//find any record in the VDS by any field (eg. by name or by id)
function findRecordByField(directory, fieldName, searchValue) {
    if (directory[fieldName] === searchValue) return directory;
    if (directory.children) {
        for (const child of directory.children) {
            const found = findRecordByField(child, fieldName, searchValue);
            if (found) return found;
        }
    }
    return null;
}

//uploads a single file to to the specified channel and returns the links array associated with that single file
async function uploadSingleFileToDiscord(channelId, file) {
    try {
        console.log('---------------------');
        console.log('Beginning singular file upload sequence');
        
        const channel = await client.channels.fetch(channelId);
        const links = [];

        const uploadChunk = async (chunkData, chunkName, attempts = 100, retryDelay = 500) => {
            for (let attempt = 1; attempt <= attempts; attempt++) {
                try {
                    const sentMessage = await channel.send({
                        files: [{ attachment: chunkData, name: chunkName }]
                    });
                    const chunkLink = `https://discord.com/channels/${channel.guild.id}/${channel.id}/${sentMessage.id}`;
                    links.push(chunkLink);
                    return true;
                } catch (error) {
                    console.log(`Attempt ${attempt} - Error sending chunk ${chunkName}:`, error.message, `- Retrying after ${retryDelay / 1000} seconds...`);
                    if (attempt === attempts) 
                        throw new Error(`Failed to send chunk ${chunkName} after ${attempts} attempts.`);
                    await new Promise(res => setTimeout(res, retryDelay));
                }
            }
            return false;
        };

        if (file.size < 24 * 1024 * 1024) {
            const currentDateTime = getUniqueDateTimeLabel();
            const fileExtension = path.extname(file.originalname);
            const chunkName = `${currentDateTime}${fileExtension}.0.atomic`;
            const success = await uploadChunk(file.buffer, chunkName);
            if (!success) throw new Error(`Failed to send chunk ${chunkName} after retry.`);
        } else {
            const fileBuffer = file.buffer;
            const chunkSize = 10 * 1024 * 1024;
            const numberOfChunks = Math.ceil(fileBuffer.length / chunkSize);
            const currentDateTime = getUniqueDateTimeLabel();
            const fileExtension = path.extname(file.originalname);
            for (let i = 0; i < numberOfChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, fileBuffer.length);
                const chunkData = fileBuffer.slice(start, end);
                const chunkName = `${currentDateTime}${fileExtension}.${i + 1}.chunk`;
                const success = await uploadChunk(chunkData, chunkName);
                if (!success) throw new Error(`Failed to send chunk ${chunkName} after retry.`);
            }
        }

        console.log('Singular file upload complete');
        console.log('---------------------');
        return links;
    } catch (error) {
        console.error('Error uploading single file : ', error);
        throw error;
    }
}

//retrieve a single file from the discord server from the links associated with that files obtained from the virtual directory records
//returns buffer of the file after combining the chunks and what to name it
async function retrieveSingleFileFromDiscord(links) {
    try {
        console.log('---------------------');
        console.log('Beginning singular file retrieval sequence');
        const downloadedChunks = [];
        const chunkNames = [];

        for (const currentLink of links) {
            const regex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
            const match = currentLink.match(regex);
            if (!match) throw new Error(`Invalid Discord message link: ${currentLink}`);
            const [_, guildId, channelId, messageId] = match;

            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            const attachment = message.attachments.first();
            if (!attachment) throw new Error(`No attachment found in message: ${messageId}`);

            const response = await fetch(attachment.url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            downloadedChunks.push(buffer);
            chunkNames.push(attachment.name);
        }

        console.log('Singular file retrieval sequence complete');
        console.log('---------------------');
        console.log('Beginning recombination of file');
        const combinedBuffer = Buffer.concat(downloadedChunks);
        const combinedFileName = `combinedFile.${chunkNames[0].split('.')[1]}`;
        console.log('Recombination of file complete');
        console.log('---------------------');
        return { buffer: combinedBuffer, name: combinedFileName };
    } catch (error) {
        console.error(error);
        throw error;
    }
}

//honestly dont worry about it. if curious ask GPT or console.log it
async function retrieveFilesFromDirectory(directory) {
    const retrievedFiles = [];
    for (const child of directory.children) {
        if (child.type === 'file') {
            const retrievedFile = await retrieveSingleFileFromDiscord(child.links);
            retrievedFiles.push({ name: child.name, buffer: retrievedFile.buffer, type: 'file' });
        } else if (child.type === 'directory') {
            const retrievedDirectoryFiles = await retrieveFilesFromDirectory(child);
            retrievedFiles.push({ name: child.name, type: 'directory', children: retrievedDirectoryFiles });
        }
    }
    return retrievedFiles;
}

//root endpoint that can be used to check if the server is active or not
app.get('/', (req, res) => {
    console.log('root endpoint hit');
    res.send({ message: 'hello' });
});

//upload endpoint
app.post('/upload', upload.array('files'), async (req, res) => {
    try {
        const startTime = Date.now();
        
        const directoryStructure = JSON.parse(req.body.directoryStructure);
        const files = req.files;
        console.log('Received directory structure:', directoryStructure);
        console.log('Received files:', files);

        addLinksAndIds(directoryStructure);
        virtualDirectory.children.push(directoryStructure);
        const newIndex = virtualDirectory.children.length - 1;
        const searchCheckpoint = virtualDirectory.children[newIndex];

        console.log('before links:', JSON.stringify(virtualDirectory, null, 2));
        for (const file of files) {
            const fileName = file.originalname;
            const fileEntry = findRecordByField(searchCheckpoint, 'name', fileName);
            if (fileEntry && fileEntry.type === 'file') {
                const links = await uploadSingleFileToDiscord('1047921563447590994', file);
                fileEntry.links.push(...links);
            }
        }
        console.log('after links:', JSON.stringify(virtualDirectory, null, 2));

        const endTime = Date.now();
        const uploadTime = getTimeElapsed(startTime, endTime);
        res.status(200).json({
            message: 'Files uploaded and sent to Discord successfully',
            success: true,
            uploadTime,
            virtualDirectory
        });
    } catch (error) {
        res.status(500).json({
            message: 'File upload failed',
            success: false,
            error
        });
    }
});

//retrieve endpoint
app.post('/retrieve', async (req, res) => {
    try {
        console.log('..............................');
        console.log('Initiating retrieval sequence');
        const startTime = Date.now();
        const identifier = req.body.identifier;

        const record = findRecordByField(virtualDirectory, 'id', identifier);
        if (!record) throw new Error('Record not found in the virtualDirectory');

        if (record.type === 'file') {
            const retrievedFile = await retrieveSingleFileFromDiscord(record.links);
            const endTime = Date.now();
            const retrievalTime = getTimeElapsed(startTime, endTime);
            
            const fileObject = {
                name: retrievedFile.name,
                extension: path.extname(retrievedFile.name),
                buffer: retrievedFile.buffer.toString('base64')
            };
        
            res.status(200).json({
                message: 'File retrieved successfully',
                success: true,
                retrievalTime,
                file: fileObject
            });
        
            console.log('Retrieval sequence complete');
            console.log('..............................');
        
        } else if (record.type === 'directory') {
            const retrievedFiles = await retrieveFilesFromDirectory(record);
            
            const archive = archiver('zip', { zlib: { level: 9 } });
            const buffers = [];
            
            archive.on('data', data => buffers.push(data));
            
            archive.on('end', () => {
                const endTime = Date.now();
                const retrievalTime = getTimeElapsed(startTime, endTime);
                
                const zipBuffer = Buffer.concat(buffers);
        
                // Save zip file to server
                const zipFileName = `${record.name}.zip`;
                const zipFilePath = path.join(DIRNAME, zipFileName); 
        
                fs.writeFile(zipFilePath, zipBuffer, (err) => {
                    if (err) {
                        console.error('Failed to save zip file:', err);
                        res.status(500).json({
                            message: 'Failed to save zip file on the server',
                            success: false,
                            error: err.message
                        });
                        return;
                    }
        
                    // Successful save, send response
                    res.status(200).json({
                        message: 'Directory retrieved and zipped successfully',
                        success: true,
                        retrievalTime,
                        file: {
                            name: `${record.name}.zip`,
                            extension: '.zip',
                            buffer: zipBuffer.toString('base64')
                        }
                    });
                }); // <-- Closing brace for fs.writeFile callback
        
            }); // <-- Closing brace for archive.on('end')
        
            archive.on('error', err => { throw err; });
        
            function addFilesToArchive(files, basePath = '') {
                files.forEach(file => {
                    if (file.type === 'file') {
                        archive.append(file.buffer, { name: path.join(basePath, file.name) });
                    } else if (file.type === 'directory') {
                        addFilesToArchive(file.children, path.join(basePath, file.name));
                    }
                });
            }
        
            addFilesToArchive(retrievedFiles);
            archive.finalize();
            
            console.log('Retrieval sequence complete');
            console.log('..............................');
        } // <-- Closing brace for else if (record.type === 'directory')
    } catch (error) {
        res.status(500).json({
            message: 'Failed to retrieve record',
            success: false,
            error: error.message
        });
    }
});

//to get the virtual directory structure in order to refer to the identifiers
app.get('/virtualDirectory', (req, res) => {
    try {
        res.status(200).json({
            message: 'Virtual directory structure retrieved successfully',
            success: true,
            virtualDirectory: virtualDirectory
        });
    } catch (error) {
        console.error('Failed to retrieve virtual directory structure:', error);
        res.status(500).json({
            message: 'Failed to retrieve virtual directory structure',
            success: false,
            error: error.message
        });
    }
});


app.listen(port, () => {
    console.log(`Bot server is listening on http://localhost:${port}`);
});
