import { createServer } from 'node:net';

export type PortState = 'free' | 'our-app' | 'occupied';
/** 在打开 SQLite 之前检查端口，重复启动不得执行数据库恢复操作。 */
export async function inspectPort(port: number): Promise<PortState> {
  const free = await new Promise<boolean>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve(true)));
  });
  if (free) return 'free';
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const health = await response.json() as Record<string, unknown>;
    const matchesCurrent = health.app === 'ear-review';
    const matchesPrevious = health.status === 'ok' && health.dataMode === '教学样例 + 用户导入' && typeof health.modelVersion === 'string' && health.modelVersion.startsWith('mnb-');
    return response.ok && (matchesCurrent || matchesPrevious) ? 'our-app' : 'occupied';
  } catch { return 'occupied'; }
}
