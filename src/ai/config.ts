export interface AiConfig { baseUrl: string; model: string; remember: boolean; headers: string }
export interface AiInput extends AiConfig { apiKey: string }
export interface AiState { config: AiConfig | null; hasApiKey: boolean }
export class AiError extends Error {}

export const MAX_HEADERS_LENGTH = 2000;
export const MAX_HEADER_LINES = 20;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
/** 请求头值只允许可见 ASCII 与空格，避免换行造成的头部注入。 */
const HEADER_VALUE = /^[\x20-\x7e]*$/;
/** 这些头由扩展自己管理，用户不能覆盖，否则会出现两套互相矛盾的取值。 */
export const PROTECTED_HEADERS = new Set([
  'authorization', 'content-type', 'accept', 'host', 'cookie', 'origin', 'referer',
  'user-agent', 'content-length', 'connection', 'transfer-encoding',
]);

export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new AiError('请输入有效的 Base URL。'); }
  if (url.username || url.password || url.search || url.hash) throw new AiError('Base URL 不能包含账号、密码、查询参数或片段。');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new AiError('服务地址必须使用 HTTPS；仅 localhost 和 127.0.0.1 允许 HTTP。');
  }
  return url.href.replace(/\/+$/, '');
}

// Chrome 的主机权限不按端口隔离；凭证另行绑定完整的规范化 Base URL。
export function permissionOrigin(baseUrl: string): string {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return `${url.protocol}//${url.hostname}/*`;
}

/** 把「每行一个 Name: Value」的文本解析成请求头，格式或取值不合法时直接拒绝。 */
export function parseHeaders(raw: string): [string, string][] {
  if (typeof raw !== 'string' || raw.length > MAX_HEADERS_LENGTH) {
    throw new AiError(`自定义请求头不能超过 ${MAX_HEADERS_LENGTH} 个字符。`);
  }
  const lines = raw.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (lines.length > MAX_HEADER_LINES) throw new AiError(`自定义请求头最多 ${MAX_HEADER_LINES} 行。`);
  const result: [string, string][] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) throw new AiError(`请求头「${line.slice(0, 40)}」不是「名称: 值」格式。`);
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!HEADER_NAME.test(name)) throw new AiError(`请求头名称「${name.slice(0, 40)}」不合法。`);
    if (!HEADER_VALUE.test(value)) throw new AiError(`请求头「${name.slice(0, 40)}」的值只能使用可见 ASCII 字符，且不能换行。`);
    const key = name.toLowerCase();
    if (PROTECTED_HEADERS.has(key)) throw new AiError(`「${name}」由扩展自己管理，不能在这里覆盖。`);
    if (seen.has(key)) throw new AiError(`请求头「${name}」重复了。`);
    seen.add(key);
    result.push([name, value]);
  }
  return result;
}

export function isAiInput(value: unknown): value is AiInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 5 && typeof item.baseUrl === 'string' && item.baseUrl.length <= 2048 &&
    typeof item.model === 'string' && item.model.length <= 256 && typeof item.remember === 'boolean' &&
    typeof item.headers === 'string' && item.headers.length <= MAX_HEADERS_LENGTH &&
    typeof item.apiKey === 'string' && item.apiKey.length <= 16_384 && !/[\r\n]/.test(item.apiKey);
}
