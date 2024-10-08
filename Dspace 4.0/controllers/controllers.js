import { assignIDRecursive, findRecordByField, insertRecordRecursivelyBasedOnFilePath } from "../utils/utils.js";
import { getUserVirtualDirectory, setUserVirtualDirectory, searchRecordInVirtualDirectory } from "../models/virtualDirectoryServices.js";
import DiscordServices from "../discord-services/discordServices.js";
import { getConfiguration } from "../configuration/configuration.js";
import logger from "../logger/logger.js";
import mime from "mime";
import archiver from "archiver";

//we will pre login and prefetch so that we dont have to login for every upload job.
let configuration, client, channelObjects;
let username = "testuser";

(async () => {
    try{
        configuration = await getConfiguration();
        let discordServices = new DiscordServices(process.env.DSPACE_TOKEN, configuration.discord);
        client = await discordServices.login();
        channelObjects = await discordServices.prefetchChannelObjects();
    }catch(error){
        console.error("Error in top level of controller.js ",error);
        throw error;
    }
})();

async function handleUpload(req, res) {
    try {
        logger.log(`${username} : starting upload sequence`);
        const directoryStructure = JSON.parse(req.body.directoryStructure); 
        //will be an array of multer objects
        const files = req.files;
        //console.log(`${username} : directory structure recieved ${directoryStructure}`);
        //console.log(`${username} : files received ${directoryStructure}`);

        await assignIDRecursive(directoryStructure);

        const uploadPromises = files.map(async (file) => {
            const fileEntry = await findRecordByField(directoryStructure, "name", file.originalname);
            //console.log("file entry ",fileEntry);
            if (fileEntry && fileEntry.type === "file") {
                fileEntry.links = [];
                const discordService = new DiscordServices(process.env.DSPACE_TOKEN, configuration.discord, client, channelObjects);
                fileEntry.links.push(...await discordService.uploadFile(file));
            }
        });

        await Promise.all(uploadPromises);

        const userDirectory = await getUserVirtualDirectory(username);
        //console.log(`${username} : user directory ${userDirectory}`);

        await insertRecordRecursivelyBasedOnFilePath(directoryStructure, userDirectory);
        await setUserVirtualDirectory(username, userDirectory);

        res.status(200).json({
            message: "Files uploaded successfully",
            success:true,
            userDirectory:userDirectory
        });
    } catch (error) {
        console.error("Error uploading file:", error);
        res.status(500).json({ 
            message: "Internal server error" ,
            success:false,
            error:error
        });
    }
}

async function handleRoot(req, res) {
    try {
        return res.status(200).json({ 
            message: "Root endpoint hit", 
            success: true 
        });
    } catch (error) {
        logger.error("Error in handleRoot()", error);
        return res.status(500).json({ 
            message: "Internal server error" ,
            success:false, 
            error:error
        });
    }
}

async function handleRetrieval(req, res) {
    try {
        logger.log(`${username} : starting retrieval sequence`);
        
        const { identifier } = req.params;
        if (!identifier) throw new Error("Identifier missing");
        console.log(identifier);

        const userDirectory = await getUserVirtualDirectory(username);
        const record = await findRecordByField(userDirectory, "id", identifier);
        if (!record) throw new Error("Record not found");
        console.log(record);

        const discordService = new DiscordServices(process.env.DSPACE_TOKEN, configuration.discord, client, channelObjects);

        if (record.type == "file") {
            const retrievedFile = await discordService.retrieveFile(record.links);
            const mimeType = mime.getType(retrievedFile.extension);
            res.setHeader('Content-Disposition', `attachment; filename="${record.name}.${retrievedFile.extension}"`);
            res.setHeader('Content-Type', mimeType);
            res.send(retrievedFile.buffer);
        
        } else if (record.type == "directory") {
            // Handle directory retrieval
            console.log("inside directory handler");
            const retrievedFilesArray = await createFilesArray(record, discordService);
            console.log(retrievedFilesArray);
            await createAndSendZip(res, retrievedFilesArray, record.name);
        } else {
            throw new Error("Invalid record type. Allowed types are 'file' or 'folder'.");
        }

    } catch (error) {
        logger.error("Error in handleRetrieval()", error);
        return res.status(500).json({
            message: "Could not retrieve file",
            success: false,
            error: error.message // Provide a more user-friendly error message
        });
    }
}

async function createFilesArray(record, discordService, basePath = '', files = []) {
    const currentPath = basePath ? `${basePath}/${record.name}` : record.name;

    if (record.type === "file") {
        const retrievedFile = await discordService.retrieveFile(record.links);
        files.push({
            name: record.name,
            buffer: retrievedFile.buffer,
            path: currentPath 
        });
    } else if (record.type === "directory" && record.children) {
        const retrievalPromises = record.children.map(child =>
            createFilesArray(child, discordService, currentPath, files) 
        );

        await Promise.all(retrievalPromises);
    }
    
    return files;
}



async function createAndSendZip(res, files, zipFileName) {
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set headers for the response
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}.zip"`);
    res.setHeader('Transfer-Encoding', 'chunked'); 

    archive.pipe(res);

    archive.on('error', (err) => {
        console.error('Archiver error:', err);
        res.status(500).send('Internal server error');
    });

    for (const file of files) {
        archive.append(file.buffer, { name: file.path });
    }

    await archive.finalize();
}

export { handleRoot, handleUpload, handleRetrieval };
