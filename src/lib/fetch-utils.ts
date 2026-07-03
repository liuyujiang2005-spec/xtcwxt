export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);

      if (res.ok || res.status < 500) return res;

      if (res.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (res.status >= 500 && i < retries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return res;
    } catch (err: any) {
      if (i < retries && err?.name !== 'AbortError') {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('请求失败，请稍后重试');
}

export function getErrorMessage(res: Response): string {
  if (res.status === 429) return '请求过于频繁，请稍后再试';
  if (res.status >= 500) return '服务器繁忙，请稍后重试';
  return '操作失败，请重试';
}
