import { assignIDRecursive, findRecordByField, insertRecordRecursivelyBasedOnFilePath } from "../utils/utils.js";
import { getUserVirtualDirectory, setUserVirtualDirectory} from "../models/virtualDirectoryServices.js";
import DiscordServices from "../discord-services/discordServices.js";
import { getConfiguration } from "../configuration/configuration.js";
import logger from "../logger/logger.js";
import mime from "mime";
import archiver from "archiver";
import Performance from "../performance/performance.js";

//we will pre login and prefetch so that we dont have to login for every upload and retrieval job.
let configuration, client, channelObjects;

//tmp
let username = "testuser";

(async () => {
    try{
        configuration = await getConfiguration();
        let discordServices = new DiscordServices(process.env.DSPACE_TOKEN, configuration.discord);
        client = await discordServices.login();
        channelObjects = await discordServices.prefetchChannelObjects();
    }catch(error){
        logger.error("Error in top level of ./controllers/controllers.js",error);
    }
})();

async function handleRoot(req, res) {
    try {
        return res.status(200).json({
            message: "Welcome to Dspace",
            success: true,
            version: "4.0",
            requiredHeaders:{
                //empty for now
            },
            api: {
                upload: {
                    route: "/upload",
                    method: "POST",
                    bodyType: "form-data",
                    fields: {
                        files: "array of files",
                        directoryStructure: "A valid directory structure format corresponding to the hierarchical organization of files"
                    },
                    description: "Endpoint for uploading resources to remote storage."
                },
                retrieve: {
                    route: "/retrieve/{resource_identifier}",
                    method: "GET",
                    description: "Retrieve a resource using its unique resource identifier (UUID)."
                },
                delete: {
                    route: "/delete/{resource_identifier}",
                    method: "DELETE",
                    description: "Delete a resource from the user's virtual directory."
                },
                getUserDirectory: {
                    route: "/directory",
                    method: "GET",
                    description: "Retrieve the virtual directory structure"
                }
            }
        });
    } catch (error) {
        logger.error("Error in handleRoot()", error);
        return res.status(500).json({ 
            message: "Internal server error",
            success:false, 
        });
    }
}

//assumption all file names are unique (will be ensured by the client code)
async function handleUpload(req, res) {
    try {
        logger.log("Starting upload sequence",username);
        
        const performance = new Performance();
        performance.start();

        const directoryStructure = JSON.parse(req.body.directoryStructure);
        if(!directoryStructure){
            throw new Error("Directory structure not provided");
        }
        //will be an array of multer objects
        const files = req.files;
        if(!files){
            throw new Error("Files not provided");
        }if(!Array.isArray(files)){
            throw new Error("Files must be an array");
        }

        //await assignIDRecursive(directoryStructure);

        const userDirectory = await getUserVirtualDirectory(username);
        if(!userDirectory){
            throw new Error("User directory not found");
        }

        const uploadPromises = files.map(async (file) => {
            //is not needed when sending each file individually
            const fileEntry = await findRecordByField(directoryStructure, "name", file.originalname);
            if(!fileEntry){
                throw new Error("File name does not match the name mentioned in its directory structure");
            }
            
            if (fileEntry && fileEntry.type == "file") {
                fileEntry.links = [];
                const discordService = new DiscordServices(process.env.DSPACE_TOKEN, configuration.discord, client, channelObjects);
                fileEntry.links.push(...await discordService.uploadFile(file));
            }
        });

        await Promise.all(uploadPromises);

        await insertRecordRecursivelyBasedOnFilePath(directoryStructure, userDirectory);

        await setUserVirtualDirectory(username, userDirectory);

        performance.end();

        res.status(200).json({
            message: "Resource uploaded successfully",
            success:true,
            uploadTime:performance.elapsed(),
            userDirectory:userDirectory
        });
    } catch (error) {
        logger.error("Error uploading file", error);
        res.status(500).json({ 
            message: "Could not upload resource" ,
            success:false,
        });
    }
}

async function handleRetrieval(req, res) {
    try {
        const performance = new Performance();
        performance.start();
        
        const { identifier } = req.params;
        if (!identifier) throw new Error("Identifier missing");

        logger.log("Starting retrieval sequence",{
            user : username,
            resource : identifier
        });

        const userDirectory = await getUserVirtualDirectory(username);
        if(!userDirectory) throw new Error("User not found");
        
        const record = await findRecordByField(userDirectory, "id", identifier);
        if (!record) throw new Error("Record not found");

        const discordService = new DiscordServices(process.env.DSPACE_TOKEN, configuration.discord, client, channelObjects);

        if (record.type == "file" && record.links && record.links.length!=0) {
            const retrievedFile = await discordService.retrieveFile(record.links);
            const mimeType = mime.getType(retrievedFile.extension);
            res.setHeader('Content-Disposition', `attachment; filename="${record.name}.${retrievedFile.extension}"`);
            res.setHeader('Content-Type', mimeType);
            res.send(retrievedFile.buffer);
        
        } else if (record.type == "directory") {
            async function createFilesArray(record, discordService, basePath = '', files = []) {
                const currentPath = basePath ? `${basePath}/${record.name}` : record.name;
            
                if (record.type == "file" && record.links && record.links.length!=0) {
                    const retrievedFilePromise = discordService.retrieveFile(record.links)
                        .then(retrievedFile => {
                            files.push({
                                name: record.name,
                                buffer: retrievedFile.buffer,
                                path: currentPath
                            });
                        });
                    return retrievedFilePromise;
                }else if (record.type === "directory" && record.children && record.children.length!=0) {
                    const retrievalPromises = record.children.map(child =>
                        createFilesArray(child, discordService, currentPath, files)
                    );
                    await Promise.all(retrievalPromises);
                }
            
                return files;
            }
            
            
            async function createAndSendZip(res, files, zipFileName) {
                const archive = archiver('zip', { zlib: { level: 6 } });
            
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}.zip"`);
                res.setHeader('Transfer-Encoding', 'chunked'); 
            
                archive.pipe(res);
            
                archive.on('error', (error) => {
                    throw new Error("Archiver error",error);
                });
            
                for (const file of files) {
                    archive.append(file.buffer, { name: file.path });
                }
            
                await archive.finalize();
            }

            const retrievedFilesArray = await createFilesArray(record, discordService);

            await createAndSendZip(res, retrievedFilesArray, record.name, performance);

            performance.end();
            logger.log("Retrieval time",performance.elapsed());
        }

    } catch (error) {
        logger.error("Error in handleRetrieval()", error);
        return res.status(500).json({
            message: "Could not retrieve resource",
            success: false,
            error: error.message
        });
    }
}

async function handleDelete(req, res) {
    try {
        const { identifier } = req.params;
        logger.log(`${username} deleting ${identifier}`);

        const userDirectory = await getUserVirtualDirectory(username);
        if(!userDirectory){
            throw new Error("User not found");
        }

        function deleteById(id, virtualDirectory) {
            if (virtualDirectory.children) {
                const index = virtualDirectory.children.findIndex(child => child.id === id);
                if (index !== -1) {
                    virtualDirectory.children.splice(index, 1);
                    return true;
                } else {
                    for (const child of virtualDirectory.children) {
                        if (deleteById(id, child)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        const isDeleted = deleteById(identifier, userDirectory);

        if (!isDeleted) {
            return res.status(200).json({
                message: "Record not found, but deletion can be considered successful",
                success: true
            });
        }

        await setUserVirtualDirectory(username, userDirectory);
        
        logger.log("Resource deleted successfully");

        res.status(200).json({
            message: 'Resource deleted successfully',
            success: true,
            userDirectory: userDirectory
        });

    } catch (error) {
        logger.error("Error in handleDelete()", error);
        res.status(500).json({
            message: "Could not delete resource",
            success: false,
            error: error.message
        });
    }
}

async function handleGetUserDirectory(req, res) {
    try {
        logger.log("Fetching virtual directory",username);

        const userDirectory = await getUserVirtualDirectory(username);

        if (!userDirectory) {
            return res.status(404).json({
                message: 'User directory not found',
                success: false
            });
        }

        res.status(200).json({
            message: 'User directory fetched successfully',
            success: true,
            userDirectory: userDirectory
        });
    } catch (error) {
        logger.error(`Error fetching user directory for ${identifier}`, error);
        res.status(500).json({
            message: "Could not fetch user directory",
            success: false,
            error: error.message
        });
    }
}


export { handleRoot, handleUpload, handleRetrieval, handleDelete, handleGetUserDirectory};
