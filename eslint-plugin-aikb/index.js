const noStaleClosures = require('./rules/no-stale-closures');
const requireCatchTelemetry = require('./rules/require-catch-telemetry');
const noEmptyFinally = require('./rules/no-empty-finally');
const requireHookCleanup = require('./rules/require-hook-cleanup');

module.exports = {
  rules: {
    'no-stale-closures': noStaleClosures,
    'require-catch-telemetry': requireCatchTelemetry,
    'no-empty-finally': noEmptyFinally,
    'require-hook-cleanup': requireHookCleanup
  },
  configs: {
    recommended: {
      plugins: ['aikb'],
      rules: {
        'aikb/no-stale-closures': 'error',
        'aikb/require-catch-telemetry': 'warn',
        'aikb/no-empty-finally': 'error',
        'aikb/require-hook-cleanup': 'warn'
      }
    }
  }
};