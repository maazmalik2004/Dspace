import express from "express";
import upload from "../middlewares/multer.js";
import { handleRetrieval, handleRoot, handleUpload, handleDelete,handleGetUserDirectory } from "../controllers/controllers.js";

const router = express.Router();

// Define routes
router.get("/", handleRoot);
router.post("/upload", upload.array("files"), handleUpload);
router.get("/retrieve/:identifier", handleRetrieval);
router.delete("/delete/:identifier", handleDelete);
router.get("/directory", handleGetUserDirectory);

export default router;
