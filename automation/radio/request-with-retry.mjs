import { setTimeout as delay } from 'node:timers/promises';

export async function requestWithRetry(url, options, { wait = delay, attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(180000) });
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    const retryAfter = Number(response.headers.get('retry-after'));
    const seconds = Math.min(60, Math.max(10 * (attempt + 1), Number.isFinite(retryAfter) ? retryAfter : 0));
    await response.body?.cancel();
    console.warn(`API HTTP ${response.status}: ${seconds}秒後に再試行 (${attempt + 1}/${attempts - 1})`);
    await wait(seconds * 1000);
  }
}

export async function apiError(response, label) {
  let detail = '';
  try { const body = await response.json(); detail = body.error?.message || ''; } catch {}
  for (const key of [process.env.GEMINI_API_KEY, process.env.AZURE_SPEECH_KEY].filter(Boolean)) detail = detail.split(key).join('[redacted]');
  return new Error(`${label}: HTTP ${response.status} ${detail.slice(0, 1200)}`);
}
