import pino from "pino";
import { Redact } from "./credential-redaction";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: { paths: ["password", "key", "apiKey", "api_key", "token", "authorization", "*.password", "*.key", "*.apiKey", "*.api_key", "*.token", "*.authorization", 'headers["x-dauntless-unbroken-user-api-key"]', 'headers["x-dauntless-unbroken-gameserver-apikey"]'], censor: "<redacted>" },
  hooks: {
    logMethod(args, method) {
      for (let i = 0; i < args.length; i++) {
        const value = args[i];
        if (typeof value === "string") args[i] = Redact(value);
      }
      method.apply(this, args);
    }
  },
  serializers: {
    err(error) {
      const out = pino.stdSerializers.err(error);
      if (!out || typeof out !== "object") return out;
      if (typeof out.message === "string") out.message = Redact(out.message);
      if (typeof out.stack === "string") out.stack = Redact(out.stack);
      return out;
    }
  },

  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname"
          },
        }
      : undefined,
});
