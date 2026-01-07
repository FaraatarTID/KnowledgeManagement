# eslint-plugin-aikb

Custom ESLint rules for the AI Knowledge Management project to detect common anti-patterns that lead to production bugs.

## Installation

```bash
npm install --save-dev eslint-plugin-aikb
```

## Usage

Add to your `.eslintrc.js`:

```javascript
module.exports = {
  plugins: ['aikb'],
  extends: [
    'plugin:aikb/recommended'
  ],
  rules: {
    // Or enable individually
    'aikb/no-stale-closures': 'error',
    'aikb/require-catch-telemetry': 'warn',
    'aikb/no-empty-finally': 'error',
    'aikb/require-hook-cleanup': 'warn'
  }
};
```

## Rules

### `no-stale-closures`

Detects `useCallback` with empty dependency arrays that are used inside `useEffect` with non-empty dependencies. This pattern can cause stale closures that capture outdated state.

**❌ Bad:**
```javascript
const syncData = useCallback(async () => {
  await fetch('/api', { body: JSON.stringify(state) });
}, []); // Empty deps

useEffect(() => {
  syncData(); // Called with stale state
}, [state]); // Non-empty deps
```

**✅ Good:**
```javascript
useEffect(() => {
  const syncData = async () => {
    await fetch('/api', { body: JSON.stringify(state) });
  };
  syncData();
}, [state]);
```

### `require-catch-telemetry`

Ensures catch blocks include logging or telemetry. Silent failures make debugging impossible in production.

**❌ Bad:**
```javascript
try {
  await dangerousOperation();
} catch (e) {
  // Silent failure
}
```

**✅ Good:**
```javascript
try {
  await dangerousOperation();
} catch (e) {
  console.error('OPERATION_FAILED', JSON.stringify({
    error: e.message,
    timestamp: new Date().toISOString()
  }));
  // Or send to monitoring service
}
```

### `no-empty-finally`

Prevents empty finally blocks that might leave resources in a bad state.

**❌ Bad:**
```javascript
try {
  lock.acquire();
  // ...
} finally {
  // Forgot to release lock
}
```

**✅ Good:**
```javascript
try {
  lock.acquire();
  // ...
} finally {
  lock.release();
}
```

### `require-hook-cleanup`

Detects `useEffect` hooks that add event listeners or subscriptions without proper cleanup.

**❌ Bad:**
```javascript
useEffect(() => {
  window.addEventListener('resize', handler);
  // No cleanup
}, []);
```

**✅ Good:**
```javascript
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

## Development

```bash
cd eslint-plugin-aikb
npm test
```

## License

MIT