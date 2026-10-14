import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
mkdirSync('data/runtime', { recursive: true });
const log = message => appendFileSync('data/runtime/launcher.log', `${new Date().toISOString()} ${message}\n`);
log('启动器开始运行');
process.on('uncaughtException', error => { log(`启动异常：${error.message}`); console.error(`启动异常：${error.message}。请查看 data/runtime/launcher.log。`); process.exitCode = 1; });
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 14)) { console.error('需要 Node.js 24.14 或更高版本。'); process.exit(1); }
if (existsSync('.env')) process.loadEnvFile('.env');
const { ensureLocalModelService } = await import('./ollama-service.mjs');
try { await ensureLocalModelService(); } catch (error) { log(`Ollama启动失败：${error.message}`); console.error(`本地语义模型未就绪：${error.message}`); }
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('请检查 .env：PORT 必须是 1～65535 的整数。'); process.exit(1); }
const { inspectPort } = await import('../dist/server/apps/api/src/startup.js');
const url = `http://127.0.0.1:${port}/`;
async function openBrowser() {
  if (process.argv.includes('--no-open')) return;
  try {
    if (process.platform === 'win32') await promisify(execFile)('powershell.exe', ['-NoProfile','-NonInteractive','-Command', `$ErrorActionPreference='Stop'; Start-Process -FilePath '${url}'`], { windowsHide: true, timeout: 15_000 });
    else await promisify(execFile)(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { timeout: 15_000 });
    log(`已请求浏览器打开 ${url}`); console.log(`已请求打开浏览器。如果没有显示，请手动访问 ${url}`);
  } catch (error) { log(`浏览器启动失败：${error.message}`); console.error(`自动打开浏览器失败：${error.message}\n请手动访问 ${url}`); }
}
const state = await inspectPort(port);
log(`端口 ${port} 检查结果：${state}`);
if (state === 'our-app') { console.log(`系统已经运行，访问地址：${url}`); await openBrowser(); process.exit(0); }
if (state === 'occupied') { console.error(`端口 ${port} 被其他程序占用。请在 .env 中修改 PORT（例如 3003）后重新双击启动。`); process.exit(1); }
console.log('正在启动听见，请保留这个窗口；按 Ctrl+C 可停止服务。');
const server = spawn(process.execPath, [resolve('dist/server/apps/api/src/main.js')], { stdio: 'inherit', windowsHide: true });
let ended = false;
server.on('error', error => { ended = true; console.error(`启动失败：${error.message}`); process.exitCode = 1; });
server.on('exit', code => { ended = true; process.exitCode = code ?? 0; });
process.on('SIGINT', () => { server.kill('SIGINT'); });
let ready = false;
for (let attempt = 0; attempt < 40 && !ended; attempt++) {
  try { const response = await fetch(`${url}api/health`, { signal: AbortSignal.timeout(500) }); const health = await response.json(); if (response.ok && health.app === 'ear-review') { ready = true; break; } } catch {}
  await delay(250);
}
if (ready) { log(`系统就绪 ${url}`); console.log(`系统就绪：${url}`); await openBrowser(); }
else if (!ended) { console.error('等待启动超时，请检查上述错误。'); server.kill(); process.exitCode = 1; }
