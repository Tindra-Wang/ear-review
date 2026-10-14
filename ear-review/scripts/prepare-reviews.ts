// Stream downloaded JSONL (e.g. SetFit data), retain original text, filter before exporting CSV.
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i < 0 ? '' : args[i + 1] ?? ''; };
const input = arg('--input'); const output = arg('--output'); const product = arg('--product'); const source = arg('--source');
const limit = Number(arg('--limit') || 500); const textField = arg('--text') || 'text';
const terms = (arg('--contains') || '耳机,耳塞,headphone,earbud,headset').split(',').filter(Boolean);
if (!input || !output || !product || !source || !Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('用法：npm run prepare:data -- --input 原始.jsonl --output 输出.csv --product 产品或集合ID --source 来源说明 [--text text] [--contains 耳机,耳塞] [--limit 500]');
if (existsSync(output)) throw new Error('输出文件已存在，请换一个输出文件名，避免覆盖原始数据');
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
// --input 可直接给公开数据集的 HTTPS 地址：huggingface.co 在部分网络不可达时自动改用 hf-mirror.com 镜像，并缓存到 data/raw 避免重复下载。
let inputPath = input;
if (/^https?:\/\//i.test(input)) {
  const segments = new URL(input).pathname.split('/').filter(Boolean);
  const file = basename(new URL(input).pathname) || 'download.jsonl';
  const resolveIndex = segments.indexOf('resolve');
  const name = resolveIndex > 0 ? `${segments[resolveIndex - 1]}-${file}` : file;
  inputPath = resolve('data/raw', name);
  if (!existsSync(inputPath)) {
    const candidates = new URL(input).hostname === 'huggingface.co' ? [input.replace('huggingface.co', 'hf-mirror.com'), input] : [input];
    let failure = '';
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        mkdirSync(dirname(inputPath), { recursive: true });
        writeFileSync(inputPath, Buffer.from(await response.arrayBuffer()));
        console.log(JSON.stringify({ downloaded: candidate, cache: inputPath }));
        failure = '';
        break;
      } catch (error) { failure = `${candidate}：${(error as Error).message}`; }
    }
    if (failure) throw new Error(`数据集下载失败（${failure}）；请手动下载后把 --input 指向本地文件`);
  } else console.log(JSON.stringify({ cached: inputPath }));
}
const rows: string[][] = [['productId', 'reviewId', 'text', 'source']]; const seen = new Set<string>();
let scanned = 0; let unrelated = 0; let invalid = 0;
const reader = createInterface({ input: createReadStream(inputPath, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of reader) {
  if (!line.trim()) continue; scanned++;
  let record: Record<string, unknown>;
  try { record = JSON.parse(line.replace(/^\uFEFF/, '')) as Record<string, unknown>; }
  catch { throw new Error(`第 ${scanned} 条无法解析；该工具只接受每行一个对象的 JSONL，不是 JSON 数组或 Parquet`); }
  if (!record || typeof record !== 'object' || typeof record[textField] !== 'string') { invalid++; continue; }
  const text = (record[textField] as string).trim();
  if (!text || Array.from(text).length > 5000) { invalid++; continue; }
  if (terms.length && !terms.some(t => text.toLowerCase().includes(t.toLowerCase()))) { unrelated++; continue; }
  const hash = createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, '').toLowerCase()).digest('hex');
  if (seen.has(hash)) continue; seen.add(hash);
  const id = String(record.review_id ?? record.id ?? `auto-${hash.slice(0,24)}`);
  rows.push([product, id, text, source]);
  if (rows.length - 1 >= limit) break;
}
if (rows.length < 2) throw new Error('没有找到符合条件的评论，请核对字段名和关键词');
const csv = '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n');
if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024) throw new Error('输出超过 5 MB，请降低 --limit');
mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(output, csv);
console.log(JSON.stringify({ output: resolve(output), scanned, selected: rows.length - 1, unrelated, invalid, note: '关键词筛选不保证领域正确，请人工核对；星级未转换为方面标签，未推测产品身份' }, null, 2));
