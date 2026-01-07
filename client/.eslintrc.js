module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:aikb/recommended'
  ],
  plugins: ['aikb'],
  rules: {
    // Custom rules configuration
    'aikb/no-stale-closures': 'error',
    'aikb/require-catch-telemetry': 'warn',
    'aikb/no-empty-finally': 'error',
    'aikb/require-hook-cleanup': 'warn'
  }
};