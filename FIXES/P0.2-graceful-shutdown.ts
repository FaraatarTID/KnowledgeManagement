/**
 * GRACEFUL SHUTDOWN IMPLEMENTATION
 * 
 * Problem: Server kills in-flight requests, loses audit logs
 * Solution: Listen for SIGTERM, flush buffers, then exit
 * 
 * Before applying: Read IMPLEMENTATION_PLAN.md section P0.2
 * 
 * FILES TO MODIFY:
 * 1. server/src/index.ts (add around line 120)
 * 2. server/src/services/access.service.ts (add new methods)
 */

// ============================================================================
// PATCH FOR: server/src/index.ts
// ============================================================================
// ADD THIS AFTER: app.listen(port, ...) call, around line 115-125

export const setupGracefulShutdown = (
  server: any,
  services: {
    auditService: any;
    vectorService?: any;
    syncService?: any;
  }
) => {
  const shutdownHandler = async (signal: string) => {
    console.log(`\n${signal} received - initiating graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
      try {
        console.log('Server closed. Flushing buffers...');

        // Flush audit logs (CRITICAL)
        if (services.auditService?.flush) {
          await services.auditService.flush();
          console.log('✅ Audit logs flushed');
        }

        // Flush other services if needed
        if (services.vectorService?.flush) {
          await services.vectorService.flush();
          console.log('✅ Vector store flushed');
        }

        if (services.syncService?.flush) {
          await services.syncService.flush();
          console.log('✅ Sync service flushed');
        }

        console.log('🎉 Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Graceful shutdown failed:', error);
        process.exit(1);
      }
    });

    // Force shutdown after timeout (prevent hanging indefinitely)
    setTimeout(() => {
      console.error('⏱️  Graceful shutdown timeout - forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds
  };

  // Register signal handlers
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));

  // Log shutdown capability
  console.log('✅ Graceful shutdown handlers registered');
};

// Usage in index.ts:
/*
const server = app.listen(port, () => {
  Logger.info(`✅ SERVER ACTIVE ON PORT ${port}`);
});

setupGracefulShutdown(server, {
  auditService,
  vectorService,
  syncService
});
*/

// ============================================================================
// PATCH FOR: server/src/services/access.service.ts
// ============================================================================
// ADD THESE METHODS AND PROPERTIES TO AuditService CLASS

export const auditServicePatch = {
  // Add to class properties:
  PROPERTIES: `
    private readonly MAX_BUFFER_SIZE = 500; // Prevent unbounded growth
  `,

  // Replace existing log() method with this version:
  LOG_METHOD: `
  async log(entry: {
    userId: string;
    action: string;
    resourceId?: string;
    query?: string;
    granted: boolean;
    reason?: string;
    metadata?: any;
  }) {
    // Validate entry
    if (!entry.userId || !entry.action) {
      console.error('Invalid audit log entry:', entry);
      return;
    }

    const logEntry = {
      user_id: entry.userId,
      action: entry.action,
      resource_id: entry.resourceId,
      query: entry.query,
      granted: entry.granted,
      reason: entry.reason,
      metadata: entry.metadata || {},
      created_at: new Date().toISOString()
    };

    if (!this.supabase) {
      console.log(\`[AUDIT] \${logEntry.created_at}: \${logEntry.user_id} -> \${logEntry.action}\`);
      return;
    }

    this.buffer.push(logEntry);

    // Check if buffer is at max capacity
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      console.warn('[AUDIT] Buffer at max capacity, forcing flush');
      await this.flush();
    } else if (!this.flushTimer) {
      // Schedule periodic flush
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }
  `,

  // Add this NEW method:
  FLUSH_METHOD: `
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.supabase) return;

    const toFlush = [...this.buffer];
    this.buffer = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      await this.supabase.from('audit_logs').insert(toFlush);
      console.log(\`[AUDIT] Flushed \${toFlush.length} logs to Supabase\`);
    } catch (error) {
      // Re-add to buffer if flush fails
      this.buffer.unshift(...toFlush);
      console.error('[AUDIT] Flush failed, re-queued:', error);
      throw error;
    }
  }
  `
};

// ============================================================================
// TEST: Verify graceful shutdown works
// ============================================================================

export const gracefulShutdownTest = async () => {
  console.log(`
  🧪 GRACEFUL SHUTDOWN TEST

  To verify graceful shutdown works:

  1. Start the server:
     npm run dev

  2. In another terminal, send requests:
     while true; do curl http://localhost:3001/api/v1/query -X POST -d '{}'; sleep 1; done

  3. While requests are in flight, kill the server:
     kill -SIGTERM <PID>
     (Or Ctrl+C)

  4. Verify in logs:
     ✅ "SIGTERM received - initiating graceful shutdown"
     ✅ "Server closed. Flushing buffers..."
     ✅ "Audit logs flushed"
     ✅ "Graceful shutdown complete"

  5. Check Supabase audit_logs table:
     All in-flight requests should be logged
     No entries should be missing

  If you see "Graceful shutdown timeout - forcing exit":
     → Something is blocking shutdown, check logs
     → May need to increase 30s timeout
  `);
};
