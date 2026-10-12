import { CredentialVault } from '../data/credentials';
import type { StorageArea } from '../data/storage';
import { AiError, isAiInput, normalizeBaseUrl, parseHeaders, permissionOrigin, type AiConfig, type AiInput, type AiState } from './config';

const CONFIG_KEY = 'ai:config:v1';
const MAX_RESPONSE_BYTES = 1_048_576;
export class AiService {
  private tail: Promise<unknown> = Promise.resolve();
  private vault: CredentialVault;
  private fetcher: typeof fetch;
  constructor(private local: StorageArea, session: StorageArea,
    private hasPermission: (origin: string) => Promise<boolean>, fetcher?: typeof fetch) {
    this.vault = new CredentialVault(local, session);
    // 原生 fetch 必须无接收者调用；存成实例属性再 this.fetcher(...) 会让 Chrome 抛 Illegal invocation。
    this.fetcher = fetcher ?? ((input, init) => fetch(input, init));
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation);
    this.tail = task.catch(() => undefined);
    return task;
  }
  private async credentialId(baseUrl: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(baseUrl));
    return `ai:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  private async readConfig(): Promise<AiConfig | null> {
    const raw = (await this.local.get(CONFIG_KEY))[CONFIG_KEY];
    if (raw === undefined) return null;
    if (!raw || typeof raw !== 'object') throw new AiError('AI 配置损坏，未覆盖原数据。');
    const value = raw as Record<string, unknown>;
    // 早期版本没有自定义请求头字段，缺失时按空处理。
    const headers = typeof value.headers === 'string' ? value.headers : '';
    if (value.version !== 1 || !isAiInput({ baseUrl: value.baseUrl, model: value.model, remember: value.remember, headers, apiKey: '' })) {
      throw new AiError('AI 配置版本或内容无效，未覆盖原数据。');
    }
    const baseUrl = normalizeBaseUrl(value.baseUrl as string);
    return { baseUrl, model: value.model as string, remember: value.remember as boolean, headers };
  }

  /** 请求头：扩展管理的部分在前，用户自定义的额外头追加；受保护头在解析时已经被拒绝。 */
  private headerInit(config: AiConfig, secret: string): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${secret}`, Accept: 'application/json' };
    for (const [name, value] of parseHeaders(config.headers)) headers[name] = value;
    return headers;
  }
  private async snapshot(): Promise<AiState> {
    const config = await this.readConfig();
    return { config, hasApiKey: config ? !!await this.vault.read(await this.credentialId(config.baseUrl), 'ai') : false };
  }
  read(): Promise<AiState> { return this.serialize(() => this.snapshot()); }
  save(input: AiInput): Promise<AiState> {
    return this.serialize(async () => {
      if (!isAiInput(input)) throw new AiError('AI 配置格式无效。');
      parseHeaders(input.headers);
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      const previous = await this.readConfig();
      const id = await this.credentialId(baseUrl);
      // 粘贴常带入零宽字符；留着会让浏览器判定请求头非法。
      const pastedKey = input.apiKey.replace(/[\u200b-\u200f\u2060\ufeff]/g, '');
      // 即使旧地址曾经使用过，更换地址时也必须重新明确输入 Key。
      const secret = pastedKey.trim() || (previous?.baseUrl === baseUrl ? await this.vault.read(id, 'ai') : null);
      if (!secret) throw new AiError('请输入 API Key；更换 Base URL 或浏览器会话结束后需要重新输入。');
      await this.vault.save(id, 'ai', secret, input.remember);
      const config: AiConfig = { baseUrl, model: input.model.trim(), remember: input.remember, headers: input.headers };
      await this.local.set({ [CONFIG_KEY]: { version: 1, ...config } });
      if (previous && previous.baseUrl !== baseUrl) await this.vault.forget(await this.credentialId(previous.baseUrl), 'ai');
      return this.snapshot();
    });
  }
  models(expectedBaseUrl: string): Promise<string[]> {
    return this.serialize(async () => {
      const config = await this.readConfig();
      if (!config) throw new AiError('请先保存 AI 服务配置。');
      if (normalizeBaseUrl(expectedBaseUrl) !== config.baseUrl) throw new AiError('服务地址已被其他页面修改，请重新加载配置后重试。');
      if (!await this.hasPermission(permissionOrigin(config.baseUrl))) throw new AiError('尚未授权访问该服务，请再次点击并允许主机权限。');
      const secret = await this.vault.read(await this.credentialId(config.baseUrl), 'ai');
      if (!secret) throw new AiError('当前会话没有 API Key，请重新输入并保存。');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await this.fetcher(`${config.baseUrl}/models`, {
          method: 'GET', headers: this.headerInit(config, secret),
          credentials: 'omit', redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        });
        // 浏览器按规范返回 opaqueredirect；Node 的 fetch 直接暴露 3xx 状态，两者都按重定向处理。
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
          throw new AiError('服务返回了重定向，出于安全考虑已停止；请直接填写最终可用的 API 根地址。');
        }
        if (response.type === 'opaque' || response.status === 0) throw new AiError('请求被浏览器拦截，请确认已允许该服务的主机权限后重试。');
        if (!response.ok) {
          if (response.body) await response.body.cancel();
          const detail = response.status === 401 || response.status === 403 ? '请检查 API Key 和访问权限。' :
            response.status === 404 ? '该地址可能不支持 /models；仍可手动填写模型。' :
            response.status === 429 ? '服务限流，请稍后重试。' : '请检查服务状态。';
          throw new AiError(`模型目录请求失败（HTTP ${response.status}）。${detail}`);
        }
        const text = await this.readBody(response, '模型目录响应过大，已停止读取。');
        let data: unknown;
        try { data = JSON.parse(text); } catch { throw new AiError('服务未返回有效的 JSON 模型目录。'); }
        if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data) || data.data.length > 5000) {
          throw new AiError('模型目录格式不兼容，需要 data 数组；可以手动填写模型。');
        }
        const ids: string[] = [];
        for (const model of data.data) {
          if (!model || typeof model.id !== 'string' || !model.id.trim() || model.id.length > 256 || /[\x00-\x1f\x7f]/.test(model.id)) {
            throw new AiError('模型目录包含无效的模型 ID。');
          }
          // 不接受服务把凭证回显到可见的模型名称中。
          if (model.id.includes(secret)) throw new AiError('服务返回的模型目录包含敏感内容，已拒绝展示。');
          ids.push(model.id);
        }
        return [...new Set(ids)].sort();
      } catch (error) {
        if (error instanceof AiError) throw error;
        if (controller.signal.aborted) throw new AiError('请求超时（15 秒），请检查服务后重试。');
        // 附带浏览器给出的原因便于排查；消息里若含凭证则丢弃。
        const raw = error instanceof Error ? error.message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160) : '';
        const reason = raw && !raw.includes(secret) ? `（${raw}）` : '';
        throw new AiError(`网络请求失败${reason}，请检查服务地址、主机权限和网络。`);
      } finally { clearTimeout(timer); }
    });
  }

  /** 有上限地读取响应体，避免服务返回超大内容拖垮后台。 */
  private async readBody(response: Response, tooLarge: string): Promise<string> {
    if (!response.body) throw new AiError('服务返回空响应。');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, text = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new AiError(tooLarge); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return text;
  }

  /**
   * 取服务端错误说明：只认 error/message/detail 字段，去掉控制字符并截断。
   * 内容含凭证时整体丢弃，避免把敏感内容回显到界面。
   */
  private async readErrorDetail(response: Response, secret: string): Promise<string> {
    try {
      const message = errorMessage(JSON.parse(await this.readBody(response, '')) as unknown);
      if (typeof message !== 'string') return '';
      const clean = message.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean || clean.includes(secret)) return '';
      return clean.length > 300 ? clean.slice(0, 300) + '…' : clean;
    } catch { return ''; }
  }

  /**
   * 生成请求：只发送调用方给定的消息内容，不附带仓库文件或凭证之外的资料。
   * 返回模型输出的文本，解析与校验由调用方负责。
   */
  chat(messages: { role: 'system' | 'user'; content: string }[], timeoutMs = 120_000): Promise<string> {
    return this.serialize(async () => {
      const config = await this.readConfig();
      if (!config) throw new AiError('请先保存 AI 服务配置。');
      if (!config.model.trim()) throw new AiError('请先填写模型名称。');
      if (!await this.hasPermission(permissionOrigin(config.baseUrl))) throw new AiError('尚未授权访问该服务，请再次点击并允许主机权限。');
      const secret = await this.vault.read(await this.credentialId(config.baseUrl), 'ai');
      if (!secret) throw new AiError('当前会话没有 API Key，请重新输入并保存。');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetcher(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { ...this.headerInit(config, secret), 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.model, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
          credentials: 'omit', redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        });
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
          throw new AiError('服务返回了重定向，出于安全考虑已停止；请直接填写最终可用的 API 根地址。');
        }
        if (response.type === 'opaque' || response.status === 0) throw new AiError('请求被浏览器拦截，请确认已允许该服务的主机权限后重试。');
        if (!response.ok) {
          // 服务端拒绝请求时给出的说明是定位问题的关键；读取后脱敏呈现，缺失时退回通用提示。
          const detail = await this.readErrorDetail(response, secret);
          const hint = response.status === 400 || response.status === 422 ? '服务拒绝了这次请求，常见原因是模型名或某个请求参数不被这个服务支持。' :
            response.status === 401 || response.status === 403 ? '请检查 API Key 与访问权限。' :
            response.status === 404 ? '该地址可能不支持 /chat/completions 生成接口。' :
            response.status === 429 ? '服务限流，请稍后重试。' : '请检查服务状态。';
          throw new AiError(`生成请求失败（HTTP ${response.status}）。${hint}${detail ? '服务端说明：' + detail : ''}`);
        }
        const text = await this.readBody(response, '服务响应过大，已停止读取。');
        let data: unknown;
        try { data = JSON.parse(text); } catch { throw new AiError('服务未返回有效的 JSON。'); }
        const content = messageContent(data);
        if (!content) throw new AiError('服务没有返回可用的生成内容。');
        if (content.includes(secret)) throw new AiError('服务返回的内容包含敏感信息，已拒绝。');
        return content;
      } catch (error: unknown) {
        if (error instanceof AiError) throw error;
        if (controller.signal.aborted) throw new AiError(`请求超时（${Math.round(timeoutMs / 1000)} 秒），服务可能仍在处理；可以重试本批，或在 AI 服务设置里放大超时。`);
        const raw = error instanceof Error ? error.message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160) : '';
        const reason = raw && !raw.includes(secret) ? `（${raw}）` : '';
        throw new AiError(`网络请求失败${reason}，请检查服务地址、主机权限和网络。`);
      } finally { clearTimeout(timer); }
    });
  }
}

/** 从错误响应里取一句人话说明；结构不符时返回 null。 */
function errorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  for (const key of ['error', 'message', 'detail']) {
    const value = record[key];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).message;
      if (typeof nested === 'string') return nested;
    }
  }
  return null;
}

/** 取第一条选择的消息文本；结构不符时返回 null，由调用方给出可读错误。 */
function messageContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const choice = choices[0];
  if (!choice || typeof choice !== 'object') return null;
  const message = (choice as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') return null;
  const content = (message as Record<string, unknown>).content;
  return typeof content === 'string' && content.trim() ? content : null;
}
