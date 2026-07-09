const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

export async function aiChat(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置');

  const res = await fetch(DEEPSEEK_API, {
      signal: AbortSignal.timeout(120000),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 65536,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API 错误: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
