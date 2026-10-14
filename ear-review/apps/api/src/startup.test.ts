import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { inspectPort } from './startup.js';
async function serve(body: unknown): Promise<{ server: Server; port: number }> {
  const server = createServer((_req,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  return { server, port: (server.address() as AddressInfo).port };
}
const close = (server: Server) => new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
test('识别已运行的本系统，关闭后端口可用', async () => {
  const { server,port } = await serve({ app:'ear-review',status:'ok' });
  try { expect(await inspectPort(port)).toBe('our-app'); } finally { await close(server); }
  expect(await inspectPort(port)).toBe('free');
});
test('其他程序占用时不误识别为本系统', async () => {
  const { server,port } = await serve({ app:'other-app',status:'ok' });
  try { expect(await inspectPort(port)).toBe('occupied'); } finally { await close(server); }
});
test('兼容旧健康接口，重复启动不打开或修改数据库', async () => {
  const { server,port } = await serve({ status:'ok',modelVersion:'mnb-8a862b69',dataMode:'教学样例 + 用户导入' });
  const dataDir = resolve(`output/unit/duplicate-start-${Date.now()}`);
  try {
    expect(await inspectPort(port)).toBe('our-app');
    const result = await promisify(execFile)(process.execPath,['--import','tsx','apps/api/src/main.ts'], { env: { ...process.env,PORT:String(port),DATA_DIR:dataDir }, timeout:10_000 });
    expect(result.stdout).toContain('已在运行'); expect(result.stderr).not.toContain('EADDRINUSE'); expect(existsSync(dataDir)).toBe(false);
  } finally { await close(server); }
},15000);
