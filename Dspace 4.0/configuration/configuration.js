import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import logger from "../logger/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getConfiguration() {
    try {
        const configurationPath = path.join(__dirname, "configuration.json");
        const data = JSON.parse(await fs.readFile(configurationPath, { encoding: "utf-8" }));
        return data
    } catch (error) {
        logger.error("Error in getConfiguration()", error);
    }
}

export {getConfiguration};