import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import express from "express";
import cors from "cors";
import { getUniqueDateTimeLabel } from "./utils.js";

let DIRNAME = path.dirname(fileURLToPath(import.meta.url));
let configuration;
let app, upload;

await initializeServer();

async function initializeServer() {
    try {
        configuration = await getConfiguration();
        
        upload = await configureMulter();
        app = await configureExpress();
        console.log("Server initialized");
    } catch (error) {
        console.error("Could not initialize server: ", error);
        throw error;
    }
}

async function configureMulter() {
    try {
        switch (configuration.multer.storage) {
            case "memory":
                return multer({ storage: multer.memoryStorage() });

            case "disk":
                return multer({
                    storage: multer.diskStorage({
                        destination: (req, file, cb) => {
                            cb(null, 'uploads/');
                        },
                        filename: (req, file, cb) => {
                            cb(null, getUniqueDateTimeLabel() + file.originalname);
                        }
                    })
                });

            default:
                throw new Error("Invalid multer storage configuration");
        }
    } catch (error) {
        console.error("Could not configure multer: ", error);
        throw error;
    }
}

async function configureExpress() {
    try {
        const app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(cors());
        return app;
    } catch (error) {
        console.error("Could not configure express: ", error);
        throw error;
    }
}

async function getConfiguration() {
    try {
        const configurationPath = path.join(DIRNAME, "config.json");
        const configuration = JSON.parse(await fs.readFile(configurationPath, { encoding: "utf-8" }));
        return configuration;
    } catch (error) {
        console.error("Could not get configuration details: ", error);
        throw error;
    }
}

export { initializeServer, getConfiguration, app, upload };
