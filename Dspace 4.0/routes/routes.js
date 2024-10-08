import express from "express";
import upload from "../middlewares/multer.js";
import { handleRetrieval, handleRoot, handleUpload } from "../controllers/controllers.js";

const router = express.Router();

// Define routes
router.get("/", handleRoot);
router.post("/upload", upload.array("files"), handleUpload);
router.get("/retrieve/:identifier", handleRetrieval);

export default router;
