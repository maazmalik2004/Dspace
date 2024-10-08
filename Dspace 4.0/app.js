import express from "express";
import routes from "./routes/routes.js";
import cors from "cors";
import dotenv from "dotenv";

import { getConfiguration } from "./configuration/configuration.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use("/", routes);

(async () => {
    try {
        const config = await getConfiguration();
        const PORT = config.port || 8000;
        app.listen(PORT, () => {
            console.log(`Server is listening on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
    }
})();