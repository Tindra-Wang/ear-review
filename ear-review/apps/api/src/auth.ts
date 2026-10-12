import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UnauthorizedException, TooManyRequestsException } from './errors.js';
import type { Request } from 'express';
import { RUNTIME_DIR, Store } from './store.js';
export class Auth {
  sessions = new Map<string, number>(); attempts = new Map<string, { count: number; until: number }>();
  constructor(private store: Store) {
    if (!store.one('SELECT username FROM admins WHERE username=?', 'admin')) {
      const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');
      const salt = randomBytes(16).toString('hex'); const hash = scryptSync(password, salt, 64).toString('hex');
      store.run('INSERT INTO admins VALUES(?,?)', 'admin', `${salt}:${hash}`);
      if (!process.env.ADMIN_PASSWORD) writeFileSync(resolve(RUNTIME_DIR, 'admin-password.txt'), password, { mode: 0o600 });
    }
  }
  login(username: string, password: string, ip: string): string {
    const now = Date.now(); const previous = this.attempts.get(ip); const attempt = previous && previous.until > now ? previous : { count: 0, until: now + 15 * 60_000 };
    if (attempt.count >= 10) throw new TooManyRequestsException('登录尝试过多，15 分钟后重试');
    const user = this.store.one<{ password_hash: string }>('SELECT password_hash FROM admins WHERE username=?', username);
    const [salt, hash] = (user?.password_hash ?? 'dummy:').split(':');
    const actual = scryptSync(password, salt!, 64); const expected = hash ? Buffer.from(hash, 'hex') : Buffer.alloc(64);
    if (!user || expected.length !== actual.length || !timingSafeEqual(expected, actual)) { attempt.count++; this.attempts.set(ip, attempt); throw new UnauthorizedException('账号或密码错误'); }
    this.attempts.delete(ip); for (const [key, expiry] of this.sessions) if (expiry < now) this.sessions.delete(key);
    const token = randomBytes(32).toString('hex'); this.sessions.set(token, now + 8 * 60 * 60_000); return token;
  }
  require(req: Request) { const token = req.headers.authorization?.replace(/^Bearer /, '') ?? ''; if ((this.sessions.get(token) ?? 0) < Date.now()) throw new UnauthorizedException('请先登录管理员'); return 'admin'; }
  logout(req: Request) { this.require(req); this.sessions.delete(req.headers.authorization!.replace(/^Bearer /, '')); }
}
