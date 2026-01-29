import { type Result, ok, err } from './result.js';

export const validateMessage = (message: unknown): Result<string, string> => {
  if (typeof message !== 'string') {
    return err('message must be a string');
  }
  if (message.trim().length === 0) {
    return err('message must not be empty');
  }
  if (message.length > 10000) {
    return err('message must not exceed 10000 characters');
  }
  return ok(message.trim());
};

export const validateSessionId = (sessionId: unknown): Result<string | undefined, string> => {
  if (sessionId === undefined || sessionId === null) {
    return ok(undefined);
  }
  if (typeof sessionId !== 'string') {
    return err('sessionId must be a string');
  }
  return ok(sessionId);
};
