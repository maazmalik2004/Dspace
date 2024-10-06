import { v4 as uuidv4 } from 'uuid';
import {CLIENT, REST_OBJECT, CHANNEL_INDEX, initializeDiscord, uploadSingleFileToDiscord, retrieveSingleFileFromDiscord} from './discordServices.mjs';

import {TOKEN, CLIENT_ID, DIRNAME, MULTER_OBJECT as upload, APP as app, getConfigData, initializeServer, MULTER_OBJECT} from './config.mjs';
import { getVirtualDirectory, initializeVirtualDirectory, setVirtualDirectory } from './virtualDirectoryServices.mjs';
import {getUniqueDateTimeLabel, getTimeElapsed} from './utils.mjs';
import path from 'path';
import archiver from 'archiver';
import fs from 'fs';

await initializeServer();
await initializeDiscord();
await initializeVirtualDirectory();

const configData = await getConfigData();
const port = configData.port

//for a newly uploaded job, it must first assign id's and links field throughout the uploaded directory structure
function addLinksAndIds(directoryStructure) {
    try{
        directoryStructure.id = uuidv4();
    if (directoryStructure.type === 'file') 
        directoryStructure.links = [];
    if (directoryStructure.children && directoryStructure.children.length > 0)
        directoryStructure.children.forEach(child => addLinksAndIds(child));
    }catch(error){
        console.error("could not add links and ids: ",error);
        throw error;
    }
}

//finds a record in a directory structure by any field and any value
function findRecordByField(directory, fieldName, searchValue) {
    try{
        if (directory[fieldName] == searchValue) 
            return directory;
        if (directory.children) {
            for (const child of directory.children) {
                const found = findRecordByField(child, fieldName, searchValue);
                if (found) 
                    return found;
            }
        }
        return null;
    }catch(error){
        console.error("Could not find record by field: ",error);
        throw error;
    }
}

async function retrieveFilesFromDirectory(directory) {
    try{
        const retrievedFiles = [];
    for (const child of directory.children) {
        if (child.type === 'file' && child.links.length != 0) {
            const retrievedFile = await retrieveSingleFileFromDiscord(child.links);
            retrievedFiles.push({ name: child.name, buffer: retrievedFile.buffer, type: 'file' });
        } else if (child.type === 'directory') {
            const retrievedDirectoryFiles = await retrieveFilesFromDirectory(child);
            retrievedFiles.push({ name: child.name, type: 'directory', children: retrievedDirectoryFiles });
        }
    }
    return retrievedFiles;
    }catch(error){
        console.error("could not retrieve files using the given directory structure");
        throw error;
    }
}

//used to search for the child record to the root with the right job
function findAmongImmediateChildren(directory, fieldName, fieldValue) {
    try{
        if (directory.type === 'directory') {
            for (const job of directory.children) {
                if (job[fieldName] === fieldValue)
                    return job;
            }
        }
        return null;
    }
    catch(error)
    {
        console.error("Job not found: ",error);
        throw error;
    }
}

//insets a record into the directory structure based on path
function insertRecordRecursively(record, directory) {
    try{
        if (record.path === directory.path) {
            return;
        }
    
        const parentPath = record.path.substring(0, record.path.lastIndexOf('\\'));
        const parentName = record.path.substring(
            record.path.lastIndexOf('\\', record.path.lastIndexOf('\\') - 1) + 1, 
            record.path.lastIndexOf('\\')
        );
    
        const parentRecord = findRecordByField(directory, "path", parentPath);
    
        if (parentRecord)
            parentRecord.children.push(record);
        else{
            const newParentRecord = {
                id: uuidv4(),
                jobId: record.jobId,
                name: parentName,
                type: "directory",
                path: parentPath,
                children: []
            };
            insertRecordRecursively(newParentRecord, directory);
    
            newParentRecord.children.push(record);
        }
    }catch(error){
        console.error("Error inserting record reursively: ",error);
        throw error;
    }
}

function insertFileRecordIntoVirtualDirectory(record, virtualDirectory)
{
    try{
        const JobRecord = findAmongImmediateChildren(virtualDirectory,'jobId',record.jobId);

        if(JobRecord){
            insertRecordRecursively(record, JobRecord);
        }
        else{
            throw new Error("Job doesnt exist yet, create a job first");
        }
    }
    catch(error){
        console.error("could not insert file record into virtual directory: ",error);
        throw error;
    }
}

app.get('/', (req, res) => {
    console.log('Root endpoint hit');
    res.send({ 
        message: 'Hello',
        success:true,
     });
});

app.post("/uploadSingle", upload.single('file'), async (req, res) => {
    try {
        const startTime = Date.now();
        const virtualDirectory = await getVirtualDirectory();
        const file = req.file;
        const fileRecord = JSON.parse(req.body.record);//is in plain text format hence must be converted. just how multer works
        
        fileRecord.id = uuidv4();
        fileRecord.links = [];
        fileRecord.size = file.size;
        
        const links = await uploadSingleFileToDiscord(file);
        fileRecord.links = [...links];

        insertFileRecordIntoVirtualDirectory(fileRecord, virtualDirectory);

        await setVirtualDirectory(virtualDirectory);

        const endTime = Date.now();
        const uploadTime = getTimeElapsed(startTime,endTime);
        res.status(200).json({
            message: "file uploaded successfully",
            success: true,
            uploadTime: uploadTime,
            virtualDirectory:virtualDirectory
        });
    } catch (error) {
        console.error("error in /uploadSingular : ", error.message);
        res.status(500).json({
            message: "error in /uploadSingular",
            success: false,
            error: error
        });
    }
});

app.post('/upload', upload.array('files'),async(req,res)=>{
    try{
        console.log('..............................');
        console.log('Beginning upload Sequence for job ',req.body.directoryStructure.jobId);
        const startTime = Date.now();

        const directoryStructure = JSON.parse(req.body.directoryStructure);
        const files = req.files;
        addLinksAndIds(directoryStructure);
        
        const virtualDirectory = await getVirtualDirectory();
        virtualDirectory.children.push(directoryStructure);

        const newIndex = virtualDirectory.children.length - 1;
        const searchCheckpoint = virtualDirectory.children[newIndex];

        for(const file of files){
            const fileName = file.originalname;
            const fileEntry = findRecordByField(searchCheckpoint, 'name', fileName);
            if (fileEntry && fileEntry.type === 'file') {
                const links = await uploadSingleFileToDiscord(file);
                console.log("links"+ links);
                fileEntry.links.push(...links);
            }
        }

        await setVirtualDirectory(virtualDirectory);

        const endTime = Date.now();
        const uploadTime = getTimeElapsed(startTime,endTime);

        res.status(200).json({
            message: 'Files uploaded and sent to Discord successfully',
            success: true,
            uploadTime,
            virtualDirectory:virtualDirectory
        });
    }catch(error){
        res.status(500).json({
            message: 'Upload failed',
            success: false,
            error
        });
        throw error;
    }
});

async function saveFile(buffer, fileName){
    try{
        const filePath = path.join(DIRNAME, 'downloads', fileName);
        await fs.promises.writeFile(filePath, buffer,{encoding:'base64'});
        console.log(`file ${fileName} saved successfully`);
    }catch(error){
        console.error("Could not save the retrived file: ",error)
        throw error;
    }
}

async function saveZip(retrievedFiles, record) {
    try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const buffers = [];

        archive.on('data', data => buffers.push(data));

        const finalizePromise = new Promise((resolve, reject) => {
            archive.on('end', () => resolve());
            archive.on('error', err => reject(err));
        });

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

        await finalizePromise;

        const zipBuffer = Buffer.concat(buffers).toString('base64');
        const zipFileName = `${record.name}.zip`;
        const zipFilePath = path.join(DIRNAME, "downloads", zipFileName);

        await fs.promises.writeFile(zipFilePath, zipBuffer,{encoding:'base64'});
        return zipBuffer;
    } catch (error) {
        console.error("Could not save zip:", error);
        throw error;
    }
}

app.post('/retrieve', async (req, res) => {
    try {
        console.log('..............................');
        console.log('Beginning Retrieval Sequence for resource ',req.body.identifier);
        const startTime = Date.now();
        
        const virtualDirectory = await getVirtualDirectory();

        const identifier = req.body.identifier;
        if(!identifier)
            throw new Error("Identifier missing");

        const record = findRecordByField(virtualDirectory, 'id', identifier);
        if (!record) 
            throw new Error('Record not found in the virtualDirectory');

        if (record.type === 'file' && record.links.length!=0) {
            const retrievedFile = await retrieveSingleFileFromDiscord(record.links);
            
            const fileObject = {
                name: record.name,
                extension: path.extname(retrievedFile.name),
                buffer: retrievedFile.buffer.toString('base64')
            };

            //.toString('base64')

            await saveFile(fileObject.buffer, fileObject.name);

            const endTime = Date.now();
            const retrievalTime = getTimeElapsed(startTime, endTime);
        
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

            const zipBuffer = await saveZip(retrievedFiles, record);

            const endTime = Date.now();
            const retrievalTime = getTimeElapsed(startTime, endTime);

            res.status(200).json({
                message: 'folder retrieved successfully',
                success: true,
                retrievalTime,
                file: {
                    name: `${record.name}.zip`,
                    extension: '.zip',
                    buffer: zipBuffer.toString('base64')
                }
            });
            
            console.log('Retrieval sequence complete');
            console.log('..............................');
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to retrieve record',
            success: false,
            error: error
        });
    }
});


app.get('/virtualDirectory', async(req, res) => {
    try {
        const virtualDirectory = await getVirtualDirectory();
        res.status(200).json({
            message: 'Virtual directory fetched successfully',
            success: true,
            virtualDirectory: virtualDirectory
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to retrieve virtual directory structure',
            success: false,
            error: error
        });
    }
});

function deleteById(id, virtualDirectory) {
    try{
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
    }catch(error){
        console.error("Could not delete by id:", error);
        throw error;
    }
}

app.post('/delete',async(req,res)=>{
    try{
        const virtualDirectory = await getVirtualDirectory();
        const identifier = req.body.identifier;

        deleteById(identifier,virtualDirectory);

        await setVirtualDirectory(virtualDirectory);

        console.log("resource deleted successfully");
        
        res.status(200).json({
            message: 'resource deleted successfully',
            success: true,
            virtualDirectory: virtualDirectory
        });
    }
    catch(error){
        console.error("could not delete the requested resource: ",error);
        res.status(500).json({
            message: 'could not delete the requested resource',
            success: false,
            error: error
        });
    }
});

app.listen(port,async() => {
    console.log(`Bot server is listening on http://localhost:${port}`);
});