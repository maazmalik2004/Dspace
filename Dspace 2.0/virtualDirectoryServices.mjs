import fs from 'fs/promises';
import path from 'path';
import { DIRNAME } from './config.mjs';

async function initializeVirtualDirectory() {
    try {
        const isEmpty = await virtualDirectoryIsEmpty();
        if(isEmpty){
            const initialValue = {
                name: 'root',
                type: 'directory',
                path: 'root',
                children: []
            };
            const virtualDirectoryPath = path.join(DIRNAME, 'virtualDirectory.json');
            await fs.writeFile(virtualDirectoryPath, JSON.stringify(initialValue));
            console.log("Virtual directory initialized.");
        }
        else{
            console.log("Virtual directory already initialized.");
        }
    } catch (error) {
        console.error("Could not initialize virtual directory: ", error);
        throw error;
    }
}

async function virtualDirectoryIsEmpty() {
    try {
        const virtualDirectoryPath = path.join(DIRNAME, 'virtualDirectory.json');
        const stat = await fs.stat(virtualDirectoryPath);
        if (stat.size === 0) {
            return true;
        }
        return false;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return true;
        } else {
            console.error("Could not check if virtual directory is empty: ", error);
            throw error;
        }
    }
}


async function virtualDirectoryExists() {
    try {
        const virtualDirectoryPath = path.join(DIRNAME, 'virtualDirectory.json');
        await fs.access(virtualDirectoryPath, fs.constants.F_OK);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        } else {
            console.error("Could not check if virtual directory exists: ", error);
            throw error;
        }
    }
}


async function getVirtualDirectory() {
    try {
        const virtualDirectoryPath = path.join(DIRNAME, 'virtualDirectory.json');
        const virtualDirectory = JSON.parse(await fs.readFile(virtualDirectoryPath, { encoding: 'utf-8' }));
        return virtualDirectory;
    } catch (error) {
        console.error("Could not fetch virtual directory: ", error);
        throw error;
    }
}

async function setVirtualDirectory(virtualDirectory){
    try{
        if(!virtualDirectory)
            return;
        const virtualDirectoryPath = path.join(DIRNAME, 'virtualDirectory.json');
        await fs.writeFile(virtualDirectoryPath, JSON.stringify(virtualDirectory), { encoding: 'utf-8'});
    }catch(error){
        console.error("Could not set virtual directory: ", error);
        throw error;
    }
}
export {getVirtualDirectory, setVirtualDirectory, initializeVirtualDirectory};