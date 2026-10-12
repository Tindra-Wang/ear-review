import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lockText = readFileSync('package-lock.json', 'utf8');
const lock = JSON.parse(lockText);
const requirements = [
  '# Environment requirements for this Node.js / TypeScript project.',
  '# This is NOT a Python pip requirements file. Do not use pip install -r.',
  '# Install automatically: double-click 安装环境.bat or 启动系统.bat.',
  '# With Node.js already installed: npm run setup',
  '# package.json + package-lock.json are the authoritative dependency manifests.',
  '# Exact npm package versions below are generated from package-lock.json.',
  'Node.js >=24.14.0 (LTS recommended)',
  'npm (included with Node.js)',
  'SQLite (built into Node.js; no separate server installation)',
  '',
  '# Application dependencies',
  ...Object.keys(manifest.dependencies).sort().map(name => `${name}@${lock.packages[`node_modules/${name}`].version}`),
  '', '# Build and test dependencies',
  ...Object.keys(manifest.devDependencies).sort().map(name => `${name}@${lock.packages[`node_modules/${name}`].version}`),
  '', '# Optional for browser tests: Chromium via npm run setup:tests',
  '# No Python, GPU driver, CUDA or online model API is required.', ''
].join('\n');
if (!process.argv.includes('--check') && (!existsSync('requirements.txt') || readFileSync('requirements.txt','utf8') !== requirements)) writeFileSync('requirements.txt',requirements);
if (process.argv.includes('--requirements-only')) process.exit(0);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 14)) { console.error('需要 Node.js 24.14 或更高版本，请运行 安装环境.bat。'); process.exit(1); }

const dependencyNames = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)];
const dependenciesReady = dependencyNames.every(name => {
  const path = join('node_modules',name,'package.json');
  try { return JSON.parse(readFileSync(path,'utf8')).version === lock.packages[`node_modules/${name}`].version; } catch { return false; }
});
const npmCli = [resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'), resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(existsSync);
function npm(args) {
  if (!npmCli) throw new Error('未找到随 Node.js 安装的 npm，请重新安装 Node.js LTS。');
  const result = spawnSync(process.execPath,[npmCli,...args],{ stdio:'inherit',env:process.env });
  if (result.error || result.status !== 0) throw new Error(`npm ${args.join(' ')} 执行失败，请检查上方错误。`);
}
function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory,{ withFileTypes:true }).flatMap(entry => {
    if (entry.name === 'runtime') return [];
    const path = join(directory,entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|vue|css|html)$/.test(entry.name) ? [path] : [];
  });
}
const files = [...sourceFiles('apps'),...sourceFiles('packages'),...sourceFiles('data'),...sourceFiles('scripts'), 'package.json','package-lock.json','tsconfig.server.json','tsconfig.web.json','tsconfig.json','vite.config.ts'].sort();
const hash = createHash('sha256'); for (const path of files) hash.update(path).update(readFileSync(path));
const buildHash = hash.digest('hex');
const statePath = 'node_modules/.ear-review-setup.json';
let previous = {}; try { previous = JSON.parse(readFileSync(statePath,'utf8')); } catch {}
const buildReady = previous.buildHash === buildHash && existsSync('dist/web/index.html') && existsSync('dist/server/apps/api/src/startup.js');
if (process.argv.includes('--check')) { console.log(JSON.stringify({ node:process.version,dependenciesReady,buildReady },null,2)); process.exit(dependenciesReady && buildReady ? 0 : 1); }
try {
  if (!dependenciesReady || process.argv.includes('--force')) { console.log('安装锁定的 npm 依赖…'); npm(['ci','--no-audit','--no-fund']); }
  else console.log('npm 依赖已就绪，跳过重复安装。');
  if (!buildReady || process.argv.includes('--force')) { console.log('构建当前源码…'); npm(['run','build']); }
  else console.log('构建已是当前版本，跳过重复构建。');
  if (process.argv.includes('--with-browser')) { console.log('准备浏览器测试环境…'); npm(['exec','--','playwright','install','chromium']); }
  writeFileSync(statePath,JSON.stringify({ buildHash,node:process.version },null,2));
  console.log('环境准备完成。运行 npm start，或双击 启动系统.bat。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
