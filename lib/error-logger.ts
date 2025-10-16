import { getCurrentUser } from './firebase-auth';
import { writeData } from './firebase-database';

export type LogSeverity = 'error' | 'warning' | 'info';
export type LogSource = 'TeacherDashboard' | 'ParentDashboard' | 'AdminDashboard' | 'StudentExercise' | 'StudentExerciseAnswering' | 'System';

export interface ErrorLogData {
  id: string;
  timestamp: string;
  message: string;
  severity: LogSeverity;
  source?: LogSource;
  userId?: string;
  userEmail?: string;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

/**
 * Log an error, warning, or info message to Firebase for admin monitoring
 * @param message - The log message
 * @param severity - The severity level ('error', 'warning', 'info')
 * @param source - The source component/dashboard
 * @param metadata - Additional metadata about the error
 */
export async function logError(
  message: string,
  severity: LogSeverity = 'error',
  source?: LogSource,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const user = getCurrentUser();
    const timestamp = new Date().toISOString();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const logData: ErrorLogData = {
      id: logId,
      timestamp,
      message,
      severity,
      source,
      userId: user?.uid,
      userEmail: user?.email || undefined,
      metadata,
    };

    await writeData(`/errorLogs/${logId}`, logData);
    
    // Also log to console for development
    if (severity === 'error') {
      console.error(`[${source}] ${message}`, metadata);
    } else if (severity === 'warning') {
      console.warn(`[${source}] ${message}`, metadata);
    } else {
      console.info(`[${source}] ${message}`, metadata);
    }
  } catch (error) {
    // Fallback to console if Firebase write fails
    console.error('Failed to write error log to Firebase:', error);
    console.error(`Original log - [${source}] ${message}`, metadata);
  }
}

/**
 * Log an error with stack trace
 */
export async function logErrorWithStack(
  error: Error,
  severity: LogSeverity = 'error',
  source?: LogSource,
  additionalContext?: string
): Promise<void> {
  const message = additionalContext 
    ? `${additionalContext}: ${error.message}`
    : error.message;

  await logError(message, severity, source, {
    errorName: error.name,
    stackTrace: error.stack,
  });
}

/**
 * Create a wrapper for async functions that automatically logs errors
 */
export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  source: LogSource,
  context?: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error) {
        await logErrorWithStack(error, 'error', source, context);
      } else {
        await logError(String(error), 'error', source, { context });
      }
      throw error;
    }
  }) as T;
}

/**
 * Log user actions for audit trail
 */
export async function logUserAction(
  action: string,
  source: LogSource,
  metadata?: Record<string, any>
): Promise<void> {
  await logError(action, 'info', source, metadata);
}

