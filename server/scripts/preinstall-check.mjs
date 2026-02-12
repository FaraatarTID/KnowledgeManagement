const isWindows = process.platform === 'win32';
const [major] = process.versions.node.split('.').map(Number);

if (isWindows && major >= 22) {
  console.warn('\n[server preinstall] Detected Windows + Node.js ' + process.versions.node + '.');
  console.warn('[server preinstall] Native dependency better-sqlite3 may need Visual Studio 2022 Build Tools (Desktop development with C++).');
  console.warn('[server preinstall] If install fails with node-gyp/VS errors, use one of these fixes:');
  console.warn('  1) Install VS 2022 Build Tools + C++ workload, then rerun npm install');
  console.warn('  2) Switch to Node.js 20 LTS for local development, then reinstall deps');
  console.warn('[server preinstall] See README section: "Windows install issue: better-sqlite3 / node-gyp".\n');
}
