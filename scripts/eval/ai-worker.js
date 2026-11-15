// Eval only: the same Workers AI model as the free openconstructor AI, without quotas.
// npx wrangler dev -c scripts/eval/wrangler.eval.jsonc  → http://127.0.0.1:8799/ai
export default {
  async fetch(request, env){
    if (request.method !== 'POST') return new Response('POST {model?, messages, max_tokens?}', { status: 405 });
    const body = await request.json();
    const model = body.model || '@cf/openai/gpt-oss-120b';
    const t0 = Date.now();
    try {
      const out = await env.AI.run(model, { messages: body.messages, max_tokens: body.max_tokens || 8000, ...(/gpt-oss/.test(model) ? { reasoning: { effort: body.effort || 'low' } } : {}) });
      const text = out?.choices?.[0]?.message?.content ?? out?.response ?? '';
      return Response.json({ choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: out?.usage || null, ms: Date.now() - t0 });
    } catch (err) {
      return Response.json({ error: { message: String(err?.message || err) } }, { status: 502 });
    }
  },
};
