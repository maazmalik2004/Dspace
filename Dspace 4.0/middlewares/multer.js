import multer from 'multer';
import logger from "../logger/logger.js";

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage
});

logger.log("multer configured");

export default upload;
