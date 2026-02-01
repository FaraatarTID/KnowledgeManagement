import { Logger } from './logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Saga Transaction Pattern Implementation
 * 
 * Tracks steps in a multi-step operation. If any step fails, allows compensation
 * (rollback) logic to be applied. Prevents orphaned data from partial operations.
 */
export interface SagaStep {
  name: string;
  status: 'pending' | 'completed' | 'failed' | 'compensated';
  result?: any;
  error?: string;
  timestamp: Date;
}

export class SagaTransaction {
  private id: string;
  private steps: Map<string, SagaStep> = new Map();
  private compensations: Array<() => Promise<void>> = [];
  private operationName: string;

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
   */
  addCompensation(stepName: string, compensate: () => Promise<void>): void {
    // Store the name for reference
    this.compensations.push(async () => {
      try {
        await compensate();
        this.markStepCompensated(stepName);
      } catch (error) {
        Logger.error(`SagaTransaction: Compensation failed`, {
          id: this.id,
          step: stepName,
          error
        });
        // Don't throw - continue with other compensations
      }
    });
  }

  /**
   * Execute all compensation functions in reverse order (LIFO)
   */
  async rollback(): Promise<void> {
    Logger.warn(`SagaTransaction: Rolling back`, {
      id: this.id,
      operation: this.operationName,
      completedSteps: this.steps.size
    });

    // Execute compensations in reverse order
    for (let i = this.compensations.length - 1; i >= 0; i--) {
      const compensation = this.compensations[i];
      if (compensation) {
        try {
          await compensation();
        } catch (error) {
          Logger.error(`SagaTransaction: Compensation step failed`, {
            id: this.id,
            index: i,
            error
          });
          // Continue with remaining compensations
        }
      }
    }

    Logger.warn(`SagaTransaction: Rollback complete`, { id: this.id });
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
