import mongoose from "mongoose";
import { userSchema } from "./schemas.js";
import { getConfiguration } from "../configuration/configuration.js";

import logger from "../logger/logger.js";

const User = mongoose.model('User', userSchema);

const connect = async () => {
    try {
        const configuration = await getConfiguration();
        const url = configuration.mongodb.url;
        await mongoose.connect(url);
        logger.log(`MongoDB connected at ${url}`);
    } catch (error) {
        logger.error("MongoDB connection error", error);
    }
};

connect();

const getUserDetails = async (identifier) => {
    try {
        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier },
                { id: identifier }
            ]
        });

        if (user) {
            logger.debug(`User ${identifier} found`, user);
            return user;
        } else {
            logger.warn(`User ${identifier} not found`);
            return null;
        }
    } catch (error) {
        logger.error(`Error fetching user details for ${identifier}`, error);
        return null;
    }
};

const updateUserDetails = async (identifier, field, value) => {
    try {
        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier },
                { id: identifier }
            ]
        });

        if (!user) {
            logger.warn(`User ${identifier} not found for update`);
            return null;
        }

        user[field] = value;
        await user.save();

        logger.log(`User ${identifier}'s ${field} updated to ${user[field]}`);
        return user; 
    } catch (error) {
        logger.error(`Error updating user details for ${identifier}`, error);
        return null;
    }
};

const deleteUser = async (identifier) => {
    try {
        const result = await User.deleteOne({
            $or: [
                { username: identifier },
                { email: identifier },
                { id: identifier }
            ]
        });

        if (result.deletedCount > 0) {
            logger.log(`User ${identifier} deleted successfully`);
            return true;
        } else {
            logger.warn(`User ${identifier} not found for deletion`);
            return false;
        }
    } catch (error) {
        logger.error(`Error deleting user ${identifier}`, error);
        return false;
    }
};

const createUser = async (username, email, password) => {
    try {
        const user = new User({
            username,
            email,
            password
        });

        await user.save();
        logger.log("User created", user);
    } catch (error) {
        logger.error("Error creating user", error);
    }
};

const getUserVirtualDirectory = async (identifier) => {
    try {
        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier },
                { id: identifier }
            ]
        });

        if (user) {
            logger.debug(`Fetched virtual directory for user ${identifier}`);
            return user.virtualDirectory;
        } else {
            logger.warn(`User ${identifier} not found when fetching virtual directory`);
            return null;
        }
    } catch (error) {
        logger.error(`Error fetching user's virtual directory for ${identifier}`, error);
        return null;
    }
};

const setUserVirtualDirectory = async (identifier, updatedVirtualDirectory) => {
    try {
        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier },
                { id: identifier }
            ]
        });

        if (!user) {
            logger.warn(`User ${identifier} not found when updating virtual directory`);
            return null;
        }

        user.virtualDirectory = updatedVirtualDirectory;
        await user.save();

        logger.log(`User ${identifier}'s virtual directory updated`);
        return user;
    } catch (error) {
        logger.error(`Error updating user's virtual directory for ${identifier}`, error);
        return null;
    }
};

const searchRecordInVirtualDirectory = async (identifier, field, value) => {
    try {
        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier },
                { id: identifier }
            ]
        });

        if (!user) {
            logger.warn(`User ${identifier} not found when searching virtual directory`);
            return null;
        }

        const findRecord = (children) => {
            for (const child of children) {
                if (child[field] === value) {
                    return child;
                }

                if (child.type === "directory" && child.children) {
                    const found = findRecord(child.children);
                    if (found) {
                        return found;
                    }
                }
            }
            return null;
        };

        const foundRecord = findRecord(user.virtualDirectory.children);

        if (foundRecord) {
            logger.log(`Record found in virtual directory for ${identifier}`, foundRecord);
            return foundRecord;
        } else {
            logger.debug(`Record not found in virtual directory for ${identifier}`);
            return null;
        }
    } catch (error) {
        logger.error(`Error searching record in virtual directory for ${identifier}`, error);
        return null;
    }
};

export {
    getUserVirtualDirectory,
    setUserVirtualDirectory,
    searchRecordInVirtualDirectory,
    createUser,
    connect,
    getUserDetails,
    updateUserDetails,
    deleteUser
};
