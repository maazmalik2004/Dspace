import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from "url";
import chalk from 'chalk';  // For colored console output

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, 'logs.json');

// Global log level settings
const LOG_LEVELS = { error: 0, warn: 1, log: 2, debug: 3 };
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'debug']; // Set via environment variables or defaults to 'debug'

function getTimestamp() {
    return new Date().toISOString();
}

async function writeToFile(logEntry) {
    try {
        let logs = [];
        if (await fs.stat(logFilePath).catch(() => false)) {
            const existingLogs = await fs.readFile(logFilePath, 'utf-8');
            logs = existingLogs ? JSON.parse(existingLogs) : [];
        }

        logs.unshift(logEntry); // New logs go on top

        await fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (err) {
        console.error(`[LOGGER ERROR] Failed to write log: ${err.message}`);
    }
}

function shouldLog(level) {
    return LOG_LEVELS[level] <= currentLogLevel;
}

function coloredLog(level, message) {
    switch (level) {
        case 'error': return chalk.red(`[ERROR] ${message}`);
        case 'warn': return chalk.yellow(`[WARN] ${message}`);
        case 'log': return chalk.blue(`[LOG] ${message}`);
        case 'debug': return chalk.green(`[DEBUG] ${message}`);
        default: return message;
    }
}

const logger = {
    log: (message, context = null) => {
        if (!shouldLog('log')) return;

        const logEntry = {
            timestamp: getTimestamp(),
            type: 'log',
            content: message,
            context: context || null,
        };

        writeToFile(logEntry);
        console.log(coloredLog('log', `[${logEntry.timestamp}] ${logEntry.content}`));
        if (context) {
            console.log(coloredLog('log', `Context: ${JSON.stringify(context)}`));
        }
    },

    error: (message, errorObject = null) => {
        if (!shouldLog('error')) return;

        const context = errorObject ? {
            message: errorObject.message,
            stack: errorObject.stack,
            name: errorObject.name,
        } : null;

        const logEntry = {
            timestamp: getTimestamp(),
            type: 'error',
            content: message,
            context: context || null,
        };

        writeToFile(logEntry);
        console.error(coloredLog('error', `[${logEntry.timestamp}] ${logEntry.content}`));
        if (context) {
            console.error(coloredLog('error', `Error Context: ${JSON.stringify(context)}`));
        }
    },

    warn: (message, context = null) => {
        if (!shouldLog('warn')) return;

        const logEntry = {
            timestamp: getTimestamp(),
            type: 'warn',
            content: message,
            context: context || null,
        };

        writeToFile(logEntry);
        console.warn(coloredLog('warn', `[${logEntry.timestamp}] ${logEntry.content}`));
        if (context) {
            console.warn(coloredLog('warn', `Context: ${JSON.stringify(context)}`));
        }
    },

    debug: (message, context = null) => {
        if (!shouldLog('debug')) return;

        const logEntry = {
            timestamp: getTimestamp(),
            type: 'debug',
            content: message,
            context: context || null,
        };

        writeToFile(logEntry);
        console.debug(coloredLog('debug', `[${logEntry.timestamp}] ${logEntry.content}`));
        if (context) {
            console.debug(coloredLog('debug', `Context: ${JSON.stringify(context)}`));
        }
    }
};

export default logger;
