import mongoose from "mongoose";
import { userSchema } from "./schemas.js";

const User = mongoose.model('User', userSchema);

const connect = async () => {
    try {
        await mongoose.connect("mongodb://localhost:27017/dspace", {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("MongoDB connected!");
    } catch (error) {
        console.error("MongoDB connection error:", error);
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
            return user;
        } else {
            console.log("User not found");
            return null;
        }
    } catch (error) {
        console.error("Error fetching user details:", error);
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
            console.log("User not found");
            return null;
        }

        user[field] = value;
        await user.save();

        console.log(`User's ${field} updated to:`, user[field]);
        return user; 
    } catch (error) {
        console.error("Error updating user details:", error);
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
            console.log("User deleted successfully.");
            return true;
        } else {
            console.log("User not found.");
            return false;
        }
    } catch (error) {
        console.error("Error deleting user:", error);
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
        console.log("User created:", user);
    } catch (error) {
        console.error("Error creating user:", error);
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
            return user.virtualDirectory;
        } else {
            console.log("User not found");
            return null;
        }
    } catch (error) {
        console.error("Error fetching user's virtual directory:", error);
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
            console.log("User not found");
            return null;
        }

        user.virtualDirectory = updatedVirtualDirectory;
        await user.save();

        console.log("User's virtual directory updated:", user.virtualDirectory);
        return user;
    } catch (error) {
        console.error("Error updating user's virtual directory:", error);
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
            console.log("User not found");
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
            console.log("Record found:", foundRecord);
            return foundRecord;
        } else {
            console.log("Record not found");
            return null;
        }
    } catch (error) {
        console.error("Error searching record in virtual directory:", error);
        return null;
    }
};

export {getUserVirtualDirectory, setUserVirtualDirectory, searchRecordInVirtualDirectory, createUser};