# Developer Quick Reference - Pre-Mortem Fixes

## 🚨 Critical Patterns to AVOID

### 1. Never Use Empty Dependency Arrays with State Access
```typescript
// ❌ WRONG - Stale closure
const syncData = useCallback(async () => {
  await fetch('/api', { body: JSON.stringify(state) });
}, []); // Empty deps but uses state

// ✅ CORRECT - Proper dependencies
const syncData = useCallback(async () => {
  await fetch('/api', { body: JSON.stringify(state) });
}, [state]);
```

### 2. Always Add Telemetry to Catch Blocks
```typescript
// ❌ WRONG - Silent failure
try {
  await dangerousOperation();
} catch (e) {
  console.warn('Failed'); // Not enough!
}

// ✅ CORRECT - Full telemetry
try {
  await dangerousOperation();
} catch (e: any) {
  console.error('OPERATION_FAILED', JSON.stringify({
    error: e.message,
    timestamp: new Date().toISOString(),
    context: { userId, operation }
  }));
  // Also log to history/audit service
}
```

### 3. Always Clean Up Event Listeners
```typescript
// ❌ WRONG - Memory leak
useEffect(() => {
  window.addEventListener('resize', handler);
}, []);

// ✅ CORRECT - Proper cleanup
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

### 4. Prevent Hydration Mismatches
```typescript
// ❌ WRONG - SSR reads localStorage
const [user, setUser] = useState(null);
useEffect(() => {
  setUser(localStorage.getItem('user'));
}, []);

// ✅ CORRECT - Mount guard
const [user, setUser] = useState(null);
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
  setUser(localStorage.getItem('user'));
}, []);

if (!mounted) return <Skeleton />;
```

### 5. Handle Race Conditions in Async Operations
```typescript
// ❌ WRONG - No request tracking
const queryAI = async () => {
  const response = await fetch(...);
  setChatHistory([...chatHistory, response]); // Stale!
};

// ✅ CORRECT - Track requests
const queryAI = async () => {
  const queryId = uuidv4();
  setChatHistory(prev => [...prev, { id: queryId, ... }]);
  
  try {
    const response = await fetch(..., { 
      signal: AbortSignal.timeout(30000) 
    });
    
    setChatHistory(prev => {
      if (!prev.some(m => m.id === queryId)) return prev;
      // ... update logic
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      toast.error('Timeout');
    }
    setChatHistory(prev => prev.filter(m => m.id !== queryId));
  }
};
```

---

## 🔧 Quick Fixes Checklist

When reviewing code, check for:

- [ ] **Closures**: Does `useCallback` have empty deps but uses state?
- [ ] **Catch blocks**: Do they log to console.error and telemetry?
- [ ] **Finally blocks**: Are they empty or missing?
- [ ] **Event listeners**: Are they removed in cleanup?
- [ ] **localStorage**: Is component mount-guarded?
- [ ] **fetch requests**: Do they have timeouts and request tracking?
- [ ] **setChatHistory**: Uses `prev => ...` pattern, not stale closure?
- [ ] **Race conditions**: Are there mutex locks for shared resources?

---

## 📊 Telemetry Events to Monitor

### Client-Side
```
STORAGE_LOAD_FAILED
STORAGE_SAVE_FAILED
STORAGE_RECOVERY_SUCCESS
STORAGE_CLEARED_ALL
```

### Server-Side
```
RAG_QUERY_FAILED
SYNC_FAILED
SYNC_SUCCESS
EXTRACTION_FAILED
```

### Format
```json
{
  "timestamp": "2026-01-07T10:30:00.000Z",
  "event": "RAG_QUERY_FAILED",
  "data": {
    "query": "...",
    "userId": "...",
    "error": "...",
    "stack": "..."
  }
}
```

---

## 🧪 Testing Commands

### Run Integration Tests
```bash
# Server
cd server
npm test -- race-conditions.test.ts

# Client
cd client
npm test -- race-conditions.test.tsx
```

### Run ESLint with Custom Rules
```bash
cd client
npm run lint
```

### Stress Test (Manual)
```bash
# 100 concurrent document uploads
for i in {1..100}; do
  curl -X POST http://localhost:3001/api/v1/documents/sync \
    -H "Content-Type: application/json" \
    -d "{\"documents\": [{\"id\": \"doc$i\", \"title\": \"Test $i\", \"content\": \"Content $i\"}]}" &
done
```

---

## 🎯 Production Monitoring

### Key Metrics to Watch
1. **Error Rate**: Should be < 0.1%
2. **Sync Failures**: Should be < 1%
3. **Query Timeouts**: Should be < 0.5%
4. **Memory Usage**: Should be stable
5. **Data Corruption**: Should be 0

### Alert Thresholds
```javascript
if (errorRate > 0.01) {
  alert('High error rate detected');
}

if (syncFailures > 0.05) {
  alert('Sync failures increasing');
}

if (memoryLeakDetected) {
  alert('Memory leak detected');
}
```

---

## 📚 Related Documentation

- `PREMORTEM_FIXES_SUMMARY.md` - Detailed fix documentation
- `eslint-plugin-aikb/README.md` - ESLint rules
- `README.md` - Project overview
- `QUICK_START.md` - Setup guide

---

## 🆘 Emergency Procedures

### If Data Corruption Detected
1. Stop all writes immediately
2. Restore from backup: `cp vectors.json.bak vectors.json`
3. Clear client caches
4. Investigate logs for `SYNC_FAILED`

### If Memory Leak Detected
1. Check for event listener leaks
2. Verify useEffect cleanup
3. Profile with React DevTools
4. Monitor `STORAGE_SAVE_FAILED` rates

### If Race Conditions Occur
1. Check VectorService logs
2. Verify mutex is working
3. Review concurrent test results
4. Add more logging if needed

---

## ✅ Pre-Commit Checklist

Before pushing code:
- [ ] ESLint passes with custom rules
- [ ] No empty catch blocks
- [ ] All hooks have cleanup
- [ ] No stale closures
- [ ] Hydration-safe patterns
- [ ] Timeout handling on fetch
- [ ] Request tracking for race prevention
- [ ] Telemetry in error paths

---

**Remember:** These fixes prevent production incidents. Always follow these patterns!