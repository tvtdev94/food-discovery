/** JSON-structured console logger. Safe to import on server and client (no server-only). */

type LogData = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", evt: string, data?: LogData) {
  const entry = JSON.stringify({ level, evt, ...data, t: Date.now() });
  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

export const log = {
  info(evt: string, data?: LogData) {
    emit("info", evt, data);
  },
  warn(evt: string, data?: LogData) {
    emit("warn", evt, data);
  },
  error(evt: string, data?: LogData) {
    emit("error", evt, data);
  },
};
