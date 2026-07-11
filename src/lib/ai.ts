const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

export async function aiChat(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置');

  // 🔴修复：整个函数加 try/catch，避免网络异常直接崩溃调用方
  try {
    const res = await fetch(DEEPSEEK_API, {
      signal: AbortSignal.timeout(120000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
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
    // 🟡修复：返回空内容时明确抛错，而非返回空字符串让调用方 JSON.parse 崩溃
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 返回空内容');
    return content;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error('AI 请求失败');
  }
}
