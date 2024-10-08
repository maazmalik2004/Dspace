import { assignIDRecursive, findRecordByField, insertRecordRecursivelyBasedOnFilePath } from "../utils/utils.js";
import { getUserVirtualDirectory, setUserVirtualDirectory, searchRecordInVirtualDirectory } from "../models/virtualDirectoryServices.js";
import DiscordServices from "../discord-services/discordServices.js";
import { getConfiguration } from "../configuration/configuration.js";

//we will pre login and prefetch so that we dont have to login for every upload job.
let configuration, client, channelObjects;
let username = "testuser3";

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
        console.log(`${username} : starting upload sequence`);
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
        console.error("Error in root endpoint:", error);
        return res.status(500).json({ 
            message: "Internal server error" ,
            success:false, 
            error:error
        });
    }
}

export { handleRoot, handleUpload };
