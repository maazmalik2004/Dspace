import { v4 as uuid } from "uuid";
import path from "path";

import logger from "../logger/logger.js";

async function assignIDRecursive(record) {
    try {
        record.id = uuid();
        
        if (record.children && Array.isArray(record.children)) {
            const promises = record.children.map(child => assignIDRecursive(child));
            await Promise.all(promises);
        }
    } catch (error) {
        logger.error("Error in assignIDRecursive()", error);
    }
}

async function findRecordByField(record, key, value) {
    try {
        if (record[key] == value) {
            return record;
        }
        
        if (record.children) {
            const promises = record.children.map(child => findRecordByField(child, key, value));
            const results = await Promise.all(promises);
            return results.find(result => result !== null) || null;
        }
        
        return null;
    } catch (error) {
        logger.error("Error in findRecordByField()", error);
    }
}


// async function findRecordByField(record, key, value) {
//     try {
//         if (record[key] == value) {
//             return record;
//         }
//         if (record.children) {
//             for (const child of record.children) {
//                 const result = await findRecordByField(child, key, value);
//                 if (result) {
//                     return result;
//                 }
//             }
//         }
//         return null;
//     } catch (error) {
//         console.error("Error in findRecordByField:", error);
//     }
// }


async function insertRecordRecursivelyBasedOnFilePath(record, directory) {
    try {
        if (record.path == directory.path) {
            return;
        }

        const parentPath = path.dirname(record.path);
        const parentName = path.basename(parentPath);
        const parentRecord = await findRecordByField(directory, "path", parentPath);

        if (parentRecord) {
            parentRecord.children.push(record);
        } else {
            const newParentRecord = {
                id: uuid(),
                name: parentName,
                type: "directory",
                path: parentPath,
                children: [],
            };
            await insertRecordRecursivelyBasedOnFilePath(newParentRecord, directory);
            newParentRecord.children.push(record);
        }
    } catch (error) {
        logger.error("Error in insertRecordRecursivelyBasedOnFilePath()", error);
    }
}

export { assignIDRecursive, findRecordByField, insertRecordRecursivelyBasedOnFilePath };

