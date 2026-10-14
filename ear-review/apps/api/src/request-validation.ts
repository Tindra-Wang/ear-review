import { BadRequestException } from '@nestjs/common';
export function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('请求应为 JSON 对象'); return value as Record<string, unknown>; }
export function string(value: unknown, field: string, max = 1000): string { if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max)
    throw new BadRequestException(`${field}不能为空且最多 ${max} 字`); return value.trim(); }
export function id(value: string | unknown): number { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0)
    throw new BadRequestException('ID 无效'); return n; }
export function csvCell(value: unknown) { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text))
    text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
