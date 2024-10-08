import chalk from 'chalk';

const getTimestamp = () => new Date().toISOString();

const formatContent = (content) => {
  if (content instanceof Error) {
    return `\n${chalk.red('Name:')} ${chalk.red(content.name)}\n${chalk.red('Message:')} ${chalk.red(content.message)}\n${chalk.red('Stack:')} ${chalk.red(content.stack)}`;
  }
  return typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
};

const log = async (message, content = '') => {
  console.log(
    `${chalk.green('[LOG]')} ${chalk.gray(getTimestamp())} ${chalk.green(message)}: ${chalk.green(formatContent(content))}`
  );
};

const warn = async (message, content = '') => {
  console.log(
    `${chalk.yellow('[WARNING]')} ${chalk.gray(getTimestamp())} ${chalk.yellow(message)}: ${chalk.yellow(formatContent(content))}`
  );
};

const error = async (message, content = '') => {
  console.log(
    `${chalk.red('[ERROR]')} ${chalk.gray(getTimestamp())} ${chalk.red(message)}: ${chalk.red(formatContent(content))}`
  );
};

const debug = async (message, content = '') => {
  console.log(
    `${chalk.blue('[DEBUG]')} ${chalk.gray(getTimestamp())} ${chalk.blue(message)}: ${chalk.blue(formatContent(content))}`
  );
};

const logger = {
  log,
  warn,
  error,
  debug
};

export default logger;
