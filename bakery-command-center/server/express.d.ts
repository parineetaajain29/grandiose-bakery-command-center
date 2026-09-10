import type { EmployeeSession } from './auth.ts';

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware in server/index.ts; undefined when not logged in. */
      employeeSession?: EmployeeSession;
    }
  }
}

export {};
