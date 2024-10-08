import express from "express";
import upload from "../middlewares/multer.js";
import { handleRoot, handleUpload } from "../controllers/controllers.js";

const router = express.Router();

// Define routes
router.get("/", handleRoot);
router.post("/upload", upload.array("files"), handleUpload);

export default router;
