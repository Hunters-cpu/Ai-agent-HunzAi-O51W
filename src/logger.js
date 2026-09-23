import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = isProduction
  ? pino({ level: LOG_LEVEL })
  : pino({
      level: LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false
        }
      }
    });

export function log(prefix, message, data = null) {
  if (data) logger.info({ data }, `[${prefix}] ${message}`);
  else logger.info(`[${prefix}] ${message}`);
}

export function logWarn(prefix, message, data = null) {
  if (data) logger.warn({ data }, `[${prefix}] ${message}`);
  else logger.warn(`[${prefix}] ${message}`);
}

export function logError(prefix, message, error = null) {
  if (error) logger.error({ err: error }, `[${prefix}] ${message}`);
  else logger.error(`[${prefix}] ${message}`);
}
