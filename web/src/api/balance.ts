import type { BalanceRequest, BalanceResponse } from '../types';

export async function fetchBalance(
  request: BalanceRequest,
): Promise<BalanceResponse> {
  const response = await fetch('/api/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    let message = `服务端返回 ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(message);
  }
  return (await response.json()) as BalanceResponse;
}
