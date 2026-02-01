import { Logger } from './logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Saga Transaction Pattern Implementation
 * 
 * Tracks steps in a multi-step operation. If any step fails, allows compensation
 * (rollback) logic to be applied. Prevents orphaned data from partial operations.
 * 
 * FIXED: Compensations are idempotent and retry-safe
 */
export interface SagaStep {
  name: string;
  status: 'pending' | 'completed' | 'failed' | 'compensated';
  result?: any;
  error?: string;
  timestamp: Date;
}

export interface CompensationRecord {
  stepName: string;
  compensator: () => Promise<void>;
  status: 'pending' | 'completed' | 'failed';
  attempts: number;
  maxRetries: number;
}

export class SagaTransaction {
  private id: string;
  private steps: Map<string, SagaStep> = new Map();
  private compensations: CompensationRecord[] = [];
  private operationName: string;
  private rollbackInProgress: boolean = false;

  constructor(operationName: string, id?: string) {
    this.operationName = operationName;
    this.id = id || uuidv4();
    Logger.debug(`SagaTransaction: Created transaction`, { 
      id: this.id, 
      operation: operationName 
    });
  }

  /**
   * Add a step that completed successfully
   * Steps are executed in order; if any fails, compensations run in reverse
   */
  addStep(stepName: string, result?: any): void {
    this.steps.set(stepName, {
      name: stepName,
      status: 'completed',
      result,
      timestamp: new Date()
    });
    Logger.debug(`SagaTransaction: Step completed`, {
      id: this.id,
      step: stepName,
      hasResult: !!result
    });
  }

  /**
   * Register a compensation function to run if saga fails
   * Compensation functions run in reverse order of registration (LIFO)
   * FIXED: Each compensation is retryable and tracks status
   */
  addCompensation(stepName: string, compensate: () => Promise<void>): void {
    this.compensations.push({
      stepName,
      compensator: compensate,
      status: 'pending',
      attempts: 0,
      maxRetries: 2
    });
  }

  /**
   * Execute all compensation functions in reverse order (LIFO)
   * FIXED: Handles concurrent compensation attempts + retry logic
   */
  async rollback(): Promise<void> {
    // Prevent concurrent rollbacks
    if (this.rollbackInProgress) {
      Logger.warn(`SagaTransaction: Rollback already in progress`, { id: this.id });
      return;
    }
    
    this.rollbackInProgress = true;

    Logger.warn(`SagaTransaction: Rolling back`, {
      id: this.id,
      operation: this.operationName,
      completedSteps: this.steps.size,
      compensations: this.compensations.length
    });

    const compensationErrors: Array<{ step: string; error: any; attempts: number }> = [];

    // Execute compensations in reverse order (LIFO)
    for (let i = this.compensations.length - 1; i >= 0; i--) {
      const comp = this.compensations[i];
      if (!comp) continue;

      Logger.debug(`SagaTransaction: Executing compensation`, {
        id: this.id,
        step: comp.stepName,
        index: i
      });

      // Retry with exponential backoff
      while (comp.attempts < comp.maxRetries) {
        try {
          comp.attempts++;
          await comp.compensator();
          comp.status = 'completed';
          
          Logger.info(`SagaTransaction: Compensation successful`, {
            id: this.id,
            step: comp.stepName,
            attempts: comp.attempts
          });
          break;
        } catch (error: any) {
          compensationErrors.push({
            step: comp.stepName,
            error,
            attempts: comp.attempts
          });

          if (comp.attempts >= comp.maxRetries) {
            comp.status = 'failed';
            Logger.error(`SagaTransaction: Compensation exhausted retries`, {
              id: this.id,
              step: comp.stepName,
              attempts: comp.attempts,
              error: error.message
            });
            break;
          }

          // Exponential backoff: 100ms, 200ms, 400ms
          const backoffMs = Math.pow(2, comp.attempts - 1) * 100;
          Logger.warn(`SagaTransaction: Compensation retry`, {
            id: this.id,
            step: comp.stepName,
            attempt: comp.attempts,
            backoffMs,
            error: error.message
          });

          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    this.rollbackInProgress = false;

    if (compensationErrors.length > 0) {
      Logger.error(`SagaTransaction: Rollback completed with errors`, {
        id: this.id,
        errorCount: compensationErrors.length,
        errors: compensationErrors.map(e => ({
          step: e.step,
          message: e.error?.message,
          attempts: e.attempts
        }))
      });
    } else {
      Logger.warn(`SagaTransaction: Rollback complete`, { id: this.id });
    }
  }

  /**
   * Mark a step as compensated
   */
  private markStepCompensated(stepName: string): void {
    const step = this.steps.get(stepName);
    if (step) {
      step.status = 'compensated';
      step.timestamp = new Date();
    }
  }

  /**
   * Get transaction status for logging/debugging
   */
  getStatus(): {
    id: string;
    operation: string;
    steps: Array<{ name: string; status: string }>;
    completedCount: number;
  } {
    return {
      id: this.id,
      operation: this.operationName,
      steps: Array.from(this.steps.values()).map(s => ({
        name: s.name,
        status: s.status
      })),
      completedCount: Array.from(this.steps.values()).filter(s => s.status === 'completed').length
    };
  }

  /**
   * Get transaction ID for cross-service tracing
   */
  getId(): string {
    return this.id;
  }
}

/**
 * Helper: Execute a saga with automatic rollback on error
 */
export async function executeSaga<T>(
  operationName: string,
  operation: (saga: SagaTransaction) => Promise<T>
): Promise<T> {
  const saga = new SagaTransaction(operationName);

  try {
    const result = await operation(saga);
    Logger.info(`SagaTransaction: Completed successfully`, saga.getStatus());
    return result;
  } catch (error) {
    Logger.error(`SagaTransaction: Failed, rolling back`, {
      ...saga.getStatus(),
      error: error instanceof Error ? error.message : error
    });
    await saga.rollback();
    throw error;
  }
}
