import { describe, expect, it, vi } from 'vitest';
import { AiService } from '../../src/ai/service';
import { isAiInput, normalizeBaseUrl, permissionOrigin } from '../../src/ai/config';
import { MemoryStorage } from '../helpers/storage';

const baseUrl = 'https://provider.example/v1';
const input = { baseUrl, apiKey: 'secret-test-key', model: '', remember: false, headers: '' };
function fixture(fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] }))) {
  const local = new MemoryStorage(), session = new MemoryStorage();
  const permission = vi.fn(async () => true);
  return { local, session, fetcher, permission, service: new AiService(local, session, permission, fetcher) };
}

describe('AI 配置与地址边界', () => {
  it('normalizes HTTPS and permits only explicit HTTP loopback', () => {
    expect(normalizeBaseUrl(' https://provider.example/v1/ ')).toBe(baseUrl);
    expect(normalizeBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(permissionOrigin('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1/*');
    for (const url of ['http://provider.example/v1', 'file:///x', 'https://user:password@provider.example', 'https://provider.example/?key=x', 'https://provider.example/#x', 'invalid']) {
      expect(() => normalizeBaseUrl(url)).toThrow();
    }
  });
  it('rejects extra message fields, malformed credentials and oversized values', () => {
    expect(isAiInput(input)).toBe(true);
    expect(isAiInput({ ...input, apiKey: 'key\r\nInjected: value' })).toBe(false);
    expect(isAiInput({ ...input, extra: true })).toBe(false);
    expect(isAiInput({ ...input, model: 'a'.repeat(257) })).toBe(false);
  });
  it('defaults to session-only storage and never returns the API Key', async () => {
    const f = fixture();
    expect(await f.service.read()).toEqual({ config: null, hasApiKey: false });
    const saved = await f.service.save(input);
    expect(JSON.stringify(f.local.items)).not.toContain(input.apiKey);
    expect(JSON.stringify(f.session.items)).toContain(input.apiKey);
    expect(JSON.stringify(saved)).not.toContain(input.apiKey);
    const restarted = new AiService(f.local, new MemoryStorage(), f.permission, f.fetcher);
    expect((await restarted.read()).hasApiKey).toBe(false);
    await expect(restarted.models(baseUrl)).rejects.toThrow('当前会话没有 API Key');
  });
  it('persists only by explicit opt-in and removes the durable copy when disabled', async () => {
    const f = fixture();
    await f.service.save({ ...input, remember: true });
    expect(JSON.stringify(f.local.items)).toContain(input.apiKey);
    expect(JSON.stringify(f.session.items)).not.toContain(input.apiKey);
    await f.service.save({ ...input, apiKey: '', model: 'chosen', remember: false });
    expect(JSON.stringify(f.local.items)).not.toContain(input.apiKey);
    expect((await f.service.read()).config?.model).toBe('chosen');
    expect(JSON.stringify(f.session.items)).toContain(input.apiKey);
  });
  it('requires a new explicit key when either origin or API path changes', async () => {
    const f = fixture();
    await f.service.save(input);
    for (const target of ['https://other.example/v1', 'https://provider.example/v2']) {
      await expect(f.service.save({ ...input, baseUrl: target, apiKey: '' })).rejects.toThrow('请输入 API Key');
    }
    const target = 'https://other.example/v1';
    await f.service.save({ ...input, baseUrl: target, apiKey: 'replacement-secret' });
    expect(JSON.stringify(f.session.items)).not.toContain(input.apiKey);
    await expect(f.service.models(baseUrl)).rejects.toThrow('其他页面修改');
    await f.service.models(target);
    expect(f.fetcher).toHaveBeenCalledWith(`${target}/models`, expect.objectContaining({ headers: { Authorization: 'Bearer replacement-secret', Accept: 'application/json' } }));
  });
  it('does not send a newly entered key to the old endpoint when config persistence fails', async () => {
    const f = fixture(); await f.service.save(input);
    vi.spyOn(f.local, 'set').mockRejectedValueOnce(new Error('disk failure'));
    await expect(f.service.save({ ...input, baseUrl: 'https://other.example/v1', apiKey: 'replacement-secret' })).rejects.toThrow();
    await f.service.models(baseUrl);
    expect(f.fetcher).toHaveBeenCalledWith(`${baseUrl}/models`, expect.objectContaining({ headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json' } }));
  });
});

describe('真实模型目录请求', () => {
  it('only makes a bounded GET without cookies, redirects or a generation body', async () => {
    const f = fixture(); await f.service.save(input);
    expect(await f.service.models(baseUrl)).toEqual(['model-a', 'model-b']);
    expect(f.permission).toHaveBeenCalledWith('https://provider.example/*');
    expect(f.fetcher).toHaveBeenCalledWith(`${baseUrl}/models`, expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer' }));
    expect(f.fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
  it('does not send any request when permission is denied', async () => {
    const f = fixture(); await f.service.save(input); f.permission.mockResolvedValue(false);
    await expect(f.service.models(baseUrl)).rejects.toThrow('尚未授权');
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 429, 500])('handles HTTP %s without exposing the upstream error body', async status => {
    const f = fixture(vi.fn(async () => new Response(input.apiKey, { status }))); await f.service.save(input);
    const error = await f.service.models(baseUrl).catch(error => error as Error);
    if (!(error instanceof Error)) throw new Error('预期服务请求失败。');
    expect(error.message).toContain(`HTTP ${status}`); expect(error.message).not.toContain(input.apiKey);
  });
  it.each([{ data: [] }, { data: [{ id: 'valid' }] }])('accepts a valid or empty model catalog', async body => {
    const f = fixture(vi.fn(async () => Response.json(body))); await f.service.save(input);
    expect(await f.service.models(baseUrl)).toEqual(body.data.map(model => model.id));
  });
  it.each(['not JSON', '{}', '{"data":[{}]}', '{"data":[{"id":""}]}', JSON.stringify({ data: [{ id: input.apiKey }] })])('rejects incompatible or sensitive response %s', async body => {
    const f = fixture(vi.fn(async () => new Response(body))); await f.service.save(input);
    await expect(f.service.models(baseUrl)).rejects.toThrow();
  });
  it('bounds the response size', async () => {
    const f = fixture(vi.fn(async () => new Response('x'.repeat(1_048_577)))); await f.service.save(input);
    await expect(f.service.models(baseUrl)).rejects.toThrow('响应过大');
  });
  it('calls the global fetch without an instance receiver', async () => {
    const original = globalThis.fetch;
    let receiver: unknown = 'unset';
    globalThis.fetch = function (this: unknown) { receiver = this; return Promise.resolve(Response.json({ data: [] })); } as unknown as typeof fetch;
    try {
      const service = new AiService(new MemoryStorage(), new MemoryStorage(), async () => true);
      await service.save({ ...input, remember: false });
      expect(await service.models(baseUrl)).toEqual([]);
      expect(receiver === undefined || receiver === globalThis).toBe(true);
    } finally { globalThis.fetch = original; }
  });
  it('strips zero-width characters from a pasted key before storing and sending it', async () => {
    const f = fixture(); await f.service.save({ ...input, apiKey: 'key\u200b-with-hidden' });
    await f.service.models(baseUrl);
    expect(f.fetcher).toHaveBeenCalledWith(`${baseUrl}/models`, expect.objectContaining({ headers: { Authorization: 'Bearer key-with-hidden', Accept: 'application/json' } }));
  });
  it('reports network errors without reflecting secrets', async () => {
    const f = fixture(vi.fn(async () => { throw new Error(input.apiKey); })); await f.service.save(input);
    const error = await f.service.models(baseUrl).then(() => null, (reason: unknown) => reason as Error);
    expect(error?.message).toContain('网络请求失败'); expect(error?.message).not.toContain(input.apiKey);
  });
  it('includes the browser reason when it is safe and flags blocked responses', async () => {
    const f = fixture(vi.fn(async () => { throw new TypeError('Failed to fetch'); })); await f.service.save(input);
    await expect(f.service.models(baseUrl)).rejects.toThrow('Failed to fetch');
    const blocked = fixture(vi.fn(async () => Response.error())); await blocked.service.save(input);
    await expect(blocked.service.models(baseUrl)).rejects.toThrow('请求被浏览器拦截');
  });
  it('aborts after 15 seconds and releases the operation queue', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })));
      await f.service.save(input);
      const pending = expect(f.service.models(baseUrl)).rejects.toThrow('请求超时');
      await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(15_001); await pending;
      expect((await f.service.read()).hasApiKey).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('serializes config changes with in-flight requests so endpoints and keys do not mix', async () => {
    let respond!: (response: Response) => void;
    const f = fixture(vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    await f.service.save(input);
    const pending = f.service.models(baseUrl);
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalled());
    const save = f.service.save({ ...input, baseUrl: 'https://other.example/v1', apiKey: 'replacement-secret' });
    respond(Response.json({ data: [] }));
    await pending; await save;
    expect(f.fetcher.mock.calls[0]?.[0]).toBe(`${baseUrl}/models`);
    expect((await f.service.read()).config?.baseUrl).toBe('https://other.example/v1');
  });
});

describe('生成请求', () => {
  const messages = [{ role: 'system' as const, content: '契约' }, { role: 'user' as const, content: '项目清单' }];

  it('posts only the given messages and returns the generated content', async () => {
    const f = fixture(vi.fn(async () => Response.json({ choices: [{ message: { content: '{"suggestions":[]}' } }] })));
    await f.service.save({ ...input, model: 'demo-model' });
    expect(await f.service.chat(messages)).toBe('{"suggestions":[]}');
    expect(f.fetcher).toHaveBeenCalledWith(`${baseUrl}/chat/completions`, expect.objectContaining({
      method: 'POST', credentials: 'omit', redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    }));
    const body = JSON.parse(String((f.fetcher.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ model: 'demo-model', messages, response_format: { type: 'json_object' } });
  });

  it('refuses to send without a model name or permission', async () => {
    const f = fixture(); await f.service.save(input);
    await expect(f.service.chat(messages)).rejects.toThrow('请先填写模型名称');
    await f.service.save({ ...input, model: 'demo-model' });
    f.permission.mockResolvedValue(false);
    await expect(f.service.chat(messages)).rejects.toThrow('尚未授权');
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('surfaces the service error message for a rejected request', async () => {
    const f = fixture(vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Unsupported parameter: response_format' } }), { status: 400 })));
    await f.service.save({ ...input, model: 'demo-model' });
    const error = await f.service.chat(messages).then(() => null, (reason: unknown) => reason as Error);
    if (!(error instanceof Error)) throw new Error('预期生成请求失败。');
    expect(error.message).toContain('HTTP 400');
    expect(error.message).toContain('Unsupported parameter: response_format');
  });

  it('never reflects the key, control characters or oversized error text', async () => {
    const leaking = fixture(vi.fn(async () => new Response(JSON.stringify({ error: { message: `bad key ${input.apiKey}` } }), { status: 400 })));
    await leaking.service.save({ ...input, model: 'demo-model' });
    const leak = await leaking.service.chat(messages).then(() => null, (reason: unknown) => reason as Error);
    if (!(leak instanceof Error)) throw new Error('预期生成请求失败。');
    expect(leak.message).not.toContain(input.apiKey);

    const noisy = fixture(vi.fn(async () => new Response(JSON.stringify({ error: { message: 'a\u0007'.repeat(400) } }), { status: 422 })));
    await noisy.service.save({ ...input, model: 'demo-model' });
    const noisyError = await noisy.service.chat(messages).then(() => null, (reason: unknown) => reason as Error);
    if (!(noisyError instanceof Error)) throw new Error('预期生成请求失败。');
    expect(noisyError.message).toContain('HTTP 422');
    expect(noisyError.message).not.toContain('\u0007');
    expect(noisyError.message.length).toBeLessThan(600);

    const htmlish = fixture(vi.fn(async () => new Response('<html>bad gateway</html>', { status: 500 })));
    await htmlish.service.save({ ...input, model: 'demo-model' });
    await expect(htmlish.service.chat(messages)).rejects.toThrow('HTTP 500');
  });

  it('rejects empty, malformed and self-referential generation responses', async () => {
    for (const body of ['not JSON', '{}', JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ message: { content: '' } }] }), JSON.stringify({ choices: [{ message: { content: input.apiKey } }] })]) {
      const f = fixture(vi.fn(async () => new Response(body)));
      await f.service.save({ ...input, model: 'demo-model' });
      await expect(f.service.chat(messages)).rejects.toThrow();
    }
  });

  it('aborts a slow generation after two minutes and keeps the queue usable', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })));
      await f.service.save({ ...input, model: 'demo-model' });
      const pending = expect(f.service.chat(messages)).rejects.toThrow('请求超时');
      await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(120_001);
      await pending;
      expect((await f.service.read()).hasApiKey).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

describe('自定义请求头', () => {
  it('sends configured headers on both the catalog and the generation request', async () => {
    const f = fixture(vi.fn(async () => Response.json({ data: [], choices: [{ message: { content: '{}' } }] })));
    await f.service.save({ ...input, model: 'demo-model', headers: 'x-opencode-session: session-123' });
    await f.service.models(baseUrl);
    expect(f.fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json', 'x-opencode-session': 'session-123' },
    });
    await f.service.chat([{ role: 'user', content: 'hi' }]);
    expect(f.fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json', 'x-opencode-session': 'session-123' },
    });
  });

  it('rejects protected, malformed, duplicated and oversized headers without saving', async () => {
    const f = fixture();
    const invalid = [
      'Authorization: Bearer other', 'accept: */*', 'CONTENT-TYPE: text/plain', 'host: evil.test', 'cookie: a=1',
      'no-colon-here', ': empty name', 'bad name: value', 'x-a: a\u0007b', 'X-A: 1\nx-a: 2',
      Array.from({ length: 21 }, (_, index) => `x-h${index}: v`).join('\n'),
      'x-a: ' + 'v'.repeat(2001),
    ];
    for (const headers of invalid) await expect(f.service.save({ ...input, headers })).rejects.toThrow();
    expect((await f.service.read()).config).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('keeps the headers in the stored configuration', async () => {
    const f = fixture();
    await f.service.save({ ...input, headers: 'x-trace: abc' });
    expect((await f.service.read()).config?.headers).toBe('x-trace: abc');
    const restarted = new AiService(f.local, new MemoryStorage(), f.permission, f.fetcher);
    expect((await restarted.read()).config?.headers).toBe('x-trace: abc');
  });

  it('still loads configurations written before the headers field existed', async () => {
    const f = fixture();
    f.local.items['ai:config:v1'] = { version: 1, baseUrl, model: 'legacy-model', remember: false };
    expect((await f.service.read()).config).toMatchObject({ model: 'legacy-model', headers: '' });
  });
});
