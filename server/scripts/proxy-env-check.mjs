#!/usr/bin/env node

const strictMode = process.argv.includes('--strict') || process.env.PROXY_ENV_CHECK_STRICT === 'true';

const legacyProxyEnvKeys = [
  'npm_config_http_proxy',
  'npm_config_https_proxy',
  'NPM_CONFIG_HTTP_PROXY',
  'NPM_CONFIG_HTTPS_PROXY',
  'npm_config_http-proxy',
  'npm_config_https-proxy',
  'NPM_CONFIG_HTTP-PROXY',
  'NPM_CONFIG_HTTPS-PROXY',
];

const configuredLegacyKeys = legacyProxyEnvKeys.filter((key) => !!process.env[key]);

if (configuredLegacyKeys.length === 0) {
  console.log('✅ Proxy env check: no legacy npm proxy env vars detected.');
  process.exit(0);
}

console.warn('⚠️ Legacy npm proxy env vars detected:');
for (const key of configuredLegacyKeys) {
  console.warn(`   - ${key}`);
}

console.warn('\nRecommended modern setup:');
console.warn('1) Remove legacy npm_config_* proxy vars from shell/CI env.');
console.warn('2) Use standard proxy vars instead: HTTP_PROXY / HTTPS_PROXY (and lowercase variants if needed).');
console.warn('3) Re-run tests using: node scripts/run-vitest.mjs --maxWorkers=1');

console.warn('\nQuick shell cleanup (bash/zsh):');
console.warn('unset npm_config_http_proxy npm_config_https_proxy NPM_CONFIG_HTTP_PROXY NPM_CONFIG_HTTPS_PROXY');

if (strictMode) {
  console.error('\n❌ Strict mode enabled: failing due to legacy npm proxy env vars.');
  process.exit(1);
}

process.exit(0);
