import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import multer from 'multer';
import express from 'express';
import cors from 'cors';
import {getUniqueDateTimeLabel} from "./utils.mjs";

dotenv.config();

const TOKEN = process.env.DSPACE_TOKEN;
const CLIENT_ID = process.env.DSPACE_CLIENT_ID;
const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

let MULTER_OBJECT;
let APP;

async function initializeServer(){
    try{
        await configureMulter();
        await configureServer();
        console.log("server initialized");
    }catch(error){
        console.error("Could not initialize server:", error);
        throw error;
    }
}

async function getConfigData() {
    try {
        const configPath = path.join(DIRNAME, 'config.json');
        const configData = JSON.parse(await fs.readFile(configPath, { encoding: 'utf-8' }));
        return configData;
    } catch (error) {
        console.error("Could not fetch configuration details:", error);
        throw error;
    }
}

async function configureMulter(){
    try{
        const configData = await getConfigData();
        if(configData.multer.storage == "memory"){
            //configure multer for main memory
            const storage = multer.memoryStorage();
            MULTER_OBJECT = multer({storage});
            console.log("multer configured");
            return MULTER_OBJECT;
        }
        else if(configData.multer.storage == "disk"){
            //configure multer for disk storage
            const storage = multer.diskStorage({
                destination: function(req, file, cb){
                    cb(null,'uploads/');
                },
                filename: function(req, file, cb){
                    cb(null, getUniqueDateTimeLabel() + file.originalname);
            }});
            const MULTER_OBJECT = multer({storage});
            console.log("multer configured");
            return MULTER_OBJECT;
        }
        else{
            throw new Error("Invalid storage type for multer configuration. Rectify ./config.json/ multer storage property");
        }
    }catch(error){
        console.error("Could not configure multer:", error);
        throw error;
    }
}

async function configureServer(){
    try{
        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({extended: true}));
        app.use(cors());
        APP = app;
        console.log("express configured");
        return APP;
    }catch(error){
        console.error("Could not configure the server:", error);
        throw error;
    }
}

export {TOKEN, CLIENT_ID, DIRNAME, MULTER_OBJECT, APP, getConfigData, initializeServer};