// Simple logger for KALE Weather Farming System

class Logger {
  info(message: string, context?: any): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`${timestamp} [INFO]: ${message}${contextStr}`);
  }

  warn(message: string, context?: any): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    console.warn(`${timestamp} [WARN]: ${message}${contextStr}`);
  }

  error(message: string, error?: Error, context?: any): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    const errorStr = error ? ` Error: ${error.message}` : '';
    console.error(`${timestamp} [ERROR]: ${message}${contextStr}${errorStr}`);
  }

  debug(message: string, context?: any): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    console.debug(`${timestamp} [DEBUG]: ${message}${contextStr}`);
  }
}

const logger = new Logger();
export default logger;