import mongoose from "mongoose";
import { v4 as uuid } from "uuid";

// Define userSchema last
const userSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        default: uuid
    },
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        //unique: true
    },
    password:{
        type: String,
        required: true,
    },
    virtualDirectory:{
        type: mongoose.Schema.Types.Mixed,
        required: true,
        default: () => ({
            id: uuid(),
            name: "root",
            type: "directory",
            path: "root",
            children: []
        })
    }
});

export { userSchema };
