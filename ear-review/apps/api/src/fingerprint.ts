import { createHash } from 'node:crypto';
export const fingerprint = (text: string) => createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, '').toLowerCase()).digest('hex');
