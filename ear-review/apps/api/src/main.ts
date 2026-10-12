import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import express from 'express';
import { inspectPort } from './startup.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('PORT 必须是 1～65535 的整数，请检查 .env。'); process.exit(1); }
const portState = await inspectPort(port);
if (portState === 'our-app') { console.log(`听见已在运行，无需重复启动。请访问 http://127.0.0.1:${port}/ 。此窗口可以关闭。`); process.exit(0); }
if (portState === 'occupied') { console.error(`端口 ${port} 已被其他程序占用。请在 .env 中设置其他 PORT（例如 3003），或关闭占用该端口的程序后重试。`); process.exit(1); }
const { Store } = await import('./store.js'); const { Auth } = await import('./auth.js'); const { ApiController } = await import('./controller.js');
const store = new Store(); const auth = new Auth(store);
@Module({ controllers: [ApiController], providers: [{ provide: 'STORE', useValue: store }, { provide: 'AUTH', useValue: auth }] })
class AppModule {}
const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error','warn'] });
app.use(express.json({ limit: '6mb' }));
const web = resolve('dist/web');
if (existsSync(web)) { app.use(express.static(web)); app.use((req: express.Request, res: express.Response, next: express.NextFunction) => { if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(resolve(web, 'index.html')); else next(); }); }
app.enableShutdownHooks();
try { await app.listen(port, '127.0.0.1'); }
catch (error) { await app.close(); if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') { console.error(`端口 ${port} 刚被另一个启动进程占用，请稍后重试或访问现有服务。`); process.exit(1); } throw error; }
console.log(`听见已启动：http://127.0.0.1:${port}。首次管理员密码见 data/runtime/admin-password.txt（或 ADMIN_PASSWORD 配置）。`);
