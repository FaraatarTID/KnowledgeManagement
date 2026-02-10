import { describe, expect, it } from 'vitest';
import { TimeoutUtil, TimeoutError } from '../../../utils/timeout.util.js';

describe('TimeoutUtil.timeout', () => {
  it('rejects with TimeoutError when operation exceeds timeout', async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('ok'), 40);
    });

    await expect(TimeoutUtil.timeout(slowPromise, 5, 'slow op')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('does not surface late rejection as unhandledRejection after timeout', async () => {
    const unhandledEvents: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandledEvents.push(reason);
    };

    process.on('unhandledRejection', onUnhandled);

    const lateRejectingPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('late failure')), 20);
    });

    await expect(
      TimeoutUtil.timeout(lateRejectingPromise, 1, 'late reject op')
    ).rejects.toBeInstanceOf(TimeoutError);

    // Wait past the original rejection timing so any unhandledRejection can fire.
    await new Promise((resolve) => setTimeout(resolve, 40));

    process.off('unhandledRejection', onUnhandled);

    expect(unhandledEvents).toHaveLength(0);
  });
});
