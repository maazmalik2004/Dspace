import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from 'uuid';

let DIRNAME = path.dirname(fileURLToPath(import.meta.url));

await initializeVirtualDirectory();

async function initializeVirtualDirectory() {
    try {
        const isEmpty = await virtualDirectoryIsEmpty();
        if (isEmpty) {
            const virtualDirectoryInitialValue = {
                id:uuidv4(),
                name: "root",
                type: "directory",
                path: "root",
                children: []
            };
            const virtualDirectoryPath = path.join(DIRNAME, "virtualDirectory.json");
            await fs.writeFile(virtualDirectoryPath, JSON.stringify(virtualDirectoryInitialValue), { encoding: 'utf-8' });
            console.log("Virtual directory initialized");
        } else {
            console.log("Virtual directory already initialized");
        }
    } catch (error) {
        console.error("Could not initialize virtual directory:", error);
        throw error;
    }
}

async function virtualDirectoryIsEmpty() {
    try {
        const virtualDirectoryPath = path.join(DIRNAME, 'virtualDirectory.json');
        const virtualDirectoryStat = await fs.stat(virtualDirectoryPath);
        if (virtualDirectoryStat.size == 0) {
            return true;
        }
        return false;
    }catch (error){
        if (error.code == 'ENOENT') {
            return true;
        } else {
            console.error("Could not check if virtual directory is empty: ", error);
            throw error;
        }
    }
}

async function getVirtualDirectory() {
    try {
        const virtualDirectoryPath = path.join(DIRNAME, "virtualDirectory.json");
        const virtualDirectory = JSON.parse(await fs.readFile(virtualDirectoryPath, { encoding: "utf-8" }));
        return virtualDirectory;
    } catch (error) {
        console.error("Could not get virtual directory:", error);
        throw error;
    }
}

async function setVirtualDirectory(virtualDirectory) {
    try {
        if (!virtualDirectory) {
            throw new Error("Invalid data for setting virtual directory");
        }
        const virtualDirectoryPath = path.join(DIRNAME, 'virtualDirectory.json');
        await fs.writeFile(virtualDirectoryPath, JSON.stringify(virtualDirectory), { encoding: 'utf-8' });
    } catch (error) {
        console.error("Could not set virtual directory:", error);
        throw error;
    }
}

export { initializeVirtualDirectory, getVirtualDirectory, setVirtualDirectory };
