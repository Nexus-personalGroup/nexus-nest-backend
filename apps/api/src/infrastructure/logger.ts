import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * App 啟動階段（NestJS 尚未建立）使用的 Pino logger。
 * App 建立後改用 app.get('fastify').log。
 */
export const log = pino({
  name: process.env.SERVICE_NAME || 'nexus-api',
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' },
    },
  }),
});
