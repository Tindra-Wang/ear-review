const TOKEN = 'ear-review-admin';
export const token = () => sessionStorage.getItem(TOKEN);
export const saveToken = (value: string | null) => value ? sessionStorage.setItem(TOKEN, value) : sessionStorage.removeItem(TOKEN);
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers } });
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.message ?? `请求失败（${response.status}）`); }
  return response.json() as Promise<T>;
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export async function download(path: string, filename: string) {
  const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.message ?? '下载失败'); }
  const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
