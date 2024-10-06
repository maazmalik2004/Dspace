import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { initializeServer, getConfiguration, app, upload } from "./config.js";
import { initializeVirtualDirectory, getVirtualDirectory, setVirtualDirectory } from "./virtualDirectoryServices.js";
import { initializeDiscord, uploadSingleFileToDiscord, retrieveSingleFileFromDiscord } from "./discordServices.js";
import { getTimeElapsed } from "./utils.js";
import archiver from 'archiver';
import { fileURLToPath } from "url";

let configuration, port;
let DIRNAME = path.dirname(fileURLToPath(import.meta.url));

await initialize();

async function initialize() {
    try {
        configuration = await getConfiguration();
        port = configuration.port;
        await initializeServer();
        await initializeVirtualDirectory();
        await initializeDiscord();
        console.log("Initialization sequence complete");
    } catch (error) {
        console.error("Initialization sequence failed: ", error);
        throw error;
    }
}

async function assignUniqueIdentifiers(directory) {
    try {
        directory.id = uuidv4();
        if (directory.children) {
            for (const child of directory.children) {
                await assignUniqueIdentifiers(child);
            }
        }
    } catch (error) {
        console.error("Could not assign unique identifiers: ", error);
        throw error;
    }
}

async function findRecordByField(directory, key, value) {
    try {
        if (directory[key] === value) {
            return directory;
        }
        if (directory.children) {
            for (const child of directory.children) {
                const found = await findRecordByField(child, key, value);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    } catch (error) {
        console.error("Could not find record by field: ", error);
        throw error;
    }
}

async function insertRecordRecursivelyBasedOnFilePath(record, directory) {
    try {
        if (record.path === directory.path) {
            return;
        }

        const parentPath = path.dirname(record.path);
        const parentName = path.basename(parentPath);
        const parentRecord = await findRecordByField(directory, "path", parentPath);

        if (parentRecord) {
            parentRecord.children.push(record);
        } else {
            const newParentRecord = {
                id: uuidv4(),
                name: parentName,
                type: "directory",
                path: parentPath,
                children: []
            };
            await insertRecordRecursivelyBasedOnFilePath(newParentRecord, directory);
            newParentRecord.children.push(record);
        }
    } catch (error) {
        console.error("Error inserting record recursively: ", error);
        throw error;
    }
}

async function normalizePath(inputPath) {
    return inputPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

app.get("/", async (req, res) => {
    try {
        console.log("Root endpoint hit");
        const response = {
            message: "Root endpoint hit, server is active",
            success: true
        };
        res.status(200).send(response);
    } catch (error) {
        console.error("Error in /: ", error);
        res.status(500).send({
            message: "Error in root endpoint",
            success: false,
            error: error.message
        });
    }
});

app.post("/upload", upload.array("files"), async (req, res) => {
    try {
        console.log("Beginning file upload sequence");
        const startTime = Date.now();
        const directoryStructure = JSON.parse(req.body.directoryStructure);
        const files = req.files;
        await assignUniqueIdentifiers(directoryStructure);
        const virtualDirectory = await getVirtualDirectory();

        for (const file of files) {
            const fileEntry = await findRecordByField(directoryStructure, "name", file.originalname);
            if (fileEntry && fileEntry.type === "file") {
                const links = await uploadSingleFileToDiscord(file);
                fileEntry.links = [];
                fileEntry.links.push(...links);
            }
        }

        await insertRecordRecursivelyBasedOnFilePath(directoryStructure, virtualDirectory);
        await setVirtualDirectory(virtualDirectory);

        const endTime = Date.now();
        const uploadTime = getTimeElapsed(startTime, endTime);

        res.status(200).send({
            message: "File uploaded successfully",
            success: true,
            uploadTime: uploadTime,
            virtualDirectory: virtualDirectory
        });
    } catch (error) {
        console.error("Error in /upload: ", error.message);
        res.status(500).send({
            message: "Error in /upload",
            success: false,
            error: error.message
        });
    }
});

app.post('/retrieve', async (req, res) => {
    try {
        console.log('Beginning Retrieval Sequence for resource ', req.body.identifier);
        const startTime = Date.now();
        
        const virtualDirectory = await getVirtualDirectory();
        const identifier = req.body.identifier;
        if (!identifier) throw new Error("Identifier missing");

        const record = await findRecordByField(virtualDirectory, 'id', identifier);
        if (!record) throw new Error('Record not found in the virtualDirectory');

        if (record.type === 'file' && record.links.length != 0) {
            const retrievedFile = await retrieveSingleFileFromDiscord(record.links);
            
            const fileObject = {
                name: record.name,
                extension: path.extname(retrievedFile.name),
                buffer: retrievedFile.buffer.toString('base64')
            };

            await saveFile(fileObject.buffer, fileObject.name);

            const endTime = Date.now();
            const retrievalTime = getTimeElapsed(startTime, endTime);
        
            res.status(200).json({
                message: 'File retrieved successfully',
                success: true,
                retrievalTime,
                file: fileObject
            });

        } else if (record.type === 'directory') {
            const retrievedFiles = await retrieveFilesFromDirectory(record);
            const zipBuffer = await saveZip(retrievedFiles, record);

            const endTime = Date.now();
            const retrievalTime = getTimeElapsed(startTime, endTime);

            res.status(200).json({
                message: 'Folder retrieved successfully',
                success: true,
                retrievalTime,
                file: {
                    name: `${record.name}.zip`,
                    extension: '.zip',
                    buffer: zipBuffer.toString('base64')
                }
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to retrieve record',
            success: false,
            error: error.message
        });
    }
});

app.get('/virtualDirectory', async (req, res) => {
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
            error: error.message
        });
    }
});

app.post('/delete', async (req, res) => {
    try {
        const virtualDirectory = await getVirtualDirectory();
        const identifier = req.body.identifier;

        deleteById(identifier, virtualDirectory);
        await setVirtualDirectory(virtualDirectory);

        console.log("Resource deleted successfully");
        
        res.status(200).json({
            message: 'Resource deleted successfully',
            success: true,
            virtualDirectory: virtualDirectory
        });
    } catch (error) {
        console.error("Could not delete the requested resource: ", error);
        res.status(500).json({
            message: 'Could not delete the requested resource',
            success: false,
            error: error.message
        });
    }
});

app.listen(port, async () => {
    console.log(`Bot server is listening on http://localhost:${port}`);
});

async function saveFile(buffer, fileName) {
    try {
        const filePath = path.join(DIRNAME, 'downloads', fileName);
        await fs.promises.writeFile(filePath, buffer, { encoding: 'base64' });
        console.log(`File ${fileName} saved successfully`);
    } catch (error) {
        console.error("Could not save the retrieved file: ", error);
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

        const zipBuffer = Buffer.concat(buffers);
        const zipFileName = `${record.name}.zip`;
        const zipFilePath = path.join(DIRNAME, "downloads", zipFileName);

        await fs.promises.writeFile(zipFilePath, zipBuffer);
        return zipBuffer;
    } catch (error) {
        console.error("Could not save zip:", error);
        throw error;
    }
}

async function retrieveFilesFromDirectory(directory) {
    try {
        let files = [];
        for (const child of directory.children) {
            if (child.type === 'file') {
                const file = await retrieveSingleFileFromDiscord(child.links);
                files.push({
                    type: 'file',
                    name: child.name,
                    buffer: file.buffer
                });
            } else if (child.type === 'directory') {
                const childFiles = await retrieveFilesFromDirectory(child);
                files.push({
                    type: 'directory',
                    name: child.name,
                    children: childFiles
                });
            }
        }
        return files;
    } catch (error) {
        console.error("Could not retrieve files from directory:", error);
        throw error;
    }
}

function deleteById(id, virtualDirectory) {
    try {
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
    } catch (error) {
        console.error("Could not delete by id:", error);
        throw error;
    }
}
