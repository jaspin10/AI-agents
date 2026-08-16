export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  child: (scope: string) => Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

function activeWeight(): number {
  const raw = process.env['LOG_LEVEL'];
  const level = LEVELS.find((candidate) => candidate === raw) ?? 'info';
  return LEVEL_WEIGHT[level];
}

function emit(
  scope: string,
  level: LogLevel,
  message: string,
  data?: unknown
): void {
  if (LEVEL_WEIGHT[level] < activeWeight()) return;
  const line = `${new Date().toISOString()} ${level
    .toUpperCase()
    .padStart(5)} [${scope}] ${message}`;
  const payload = data === undefined ? line : `${line} ${JSON.stringify(data)}`;
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}

/** Dependency-free structured logger. Set LOG_LEVEL=debug for verbose output. */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => emit(scope, 'debug', message, data),
    info: (message, data) => emit(scope, 'info', message, data),
    warn: (message, data) => emit(scope, 'warn', message, data),
    error: (message, data) => emit(scope, 'error', message, data),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}
