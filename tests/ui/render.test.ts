import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { GitState } from '../../src/git/types';
import type { ClassifyState } from '../../src/ai/classify';
import { ClassifyConfig } from '../../src/ui/ClassifyConfig';
import { GitSettings } from '../../src/ui/GitSettings';
import { Library } from '../../src/ui/Library';
import { PromptSettings } from '../../src/ui/PromptSettings';
import { ToastStack } from '../../src/ui/Toast';
import type { GitController } from '../../src/ui/use-git';
import type { ClassifyController } from '../../src/ui/use-ai';

const controller = (state: GitState | null, patch: Partial<GitController> = {}): GitController => ({
  state, busy: false, pending: null, loading: false, error: '', refreshKey: 'render-test', clearError: () => undefined, send: async () => true, ...patch,
});
const emptyClassify = (patch: Partial<ClassifyController> = {}): ClassifyController => ({
  state: null, prompt: null, defaults: null, config: null, error: '', notice: '', saving: false, running: false,
  progress: { processed: 0, total: 0 },
  read: async () => undefined, readPrompt: async () => undefined, savePrompt: async () => true,
  readConfig: async () => undefined, saveConfig: async () => true,
  run: async () => ({ ok: true, applied: 0, categoriesCreated: 0, message: '' }),
  clearError: () => undefined, clearNotice: () => undefined, ...patch,
});
const prompted = (): ClassifyController => emptyClassify({
  prompt: { version: 1, systemGuideline: '按用途分类', userPrompt: '分类名用中文' },
  defaults: { version: 1, systemGuideline: '默认准则', userPrompt: '' },
});
const classifyState = (over: Partial<ClassifyState> = {}): ClassifyState => ({
  draft: null, unclassified: 2, config: { includePrivate: false, timeoutSeconds: 120, batchSize: 30 }, result: null, ...over,
});
/** React 在文本插值边界插入注释节点，断言渲染结果前先剥离。 */
const visible = (html: string) => html.replace(/<!-- -->/g, '');
const giteeState: GitState = {
  kind: 'git',
  accounts: [{
    account: { id: 'gitee:1', accountId: 'gitee:1', login: 'gitee-user', avatarUrl: '', provider: 'gitee', syncMode: 'stars' },
    provider: 'gitee', syncMode: 'stars', connected: true, remember: false, sync: null,
  }],
};
const runningState: GitState = {
  kind: 'git',
  accounts: [{
    account: { id: 'github:1001', accountId: 'github:1001', login: 'monk233', avatarUrl: '', provider: 'github', syncMode: 'stars+lists' },
    provider: 'github', syncMode: 'stars+lists', connected: true, remember: true,
    sync: { state: 'running', phase: 'items', mode: 'stars+lists', repositories: 93, lists: 13, memberships: 83, error: null },
  }],
};

describe('管理页渲染路径', () => {
  it('renders the Git panel with both platform sub-tabs', () => {
    const html = visible(renderToString(createElement(GitSettings, { git: controller(null, { loading: true }) })));
    expect(html).toContain('Git');
    expect(html).toContain('GitHub');
    expect(html).toContain('Gitee');
    expect(html).toContain('Access Token');
    expect(html).toContain('正在读取 GitHub 连接状态…');
    expect(html).toContain('settings-subtabs');
    expect(html).toContain('添加账号');
    expect(html).toContain('已连接账号');
  });
  it('keeps Gitee accounts out of the GitHub panel and reports its fixed rule', () => {
    const html = visible(renderToString(createElement(GitSettings, { git: controller(giteeState) })));
    expect(html).toContain('还没有连接 GitHub 账号。');
    expect(html).not.toContain('只同步 Stars（Gitee 没有 Lists）');
  });
  it('renders the library shell with the category rail while data loads', () => {
    const html = renderToString(createElement(Library, {
      git: controller(null), classify: emptyClassify(), route: 'library', notice: null, children: null,
    }));
    expect(html).toContain('分类');
    expect(html).toContain('aria-label="新建分类"');
    expect(html).toContain('正在读取本地收藏');
    // 还没有数据时未分类计数为 0，整行不渲染。
    expect(html).not.toContain('unlisted-row');
  });
  it('keeps the connect label and the cancel button usable while a sync is running', () => {
    const html = visible(renderToString(createElement(GitSettings, { git: controller(runningState, { busy: true, pending: 'GIT_STEP' }) })));
    expect(html).toContain('验证并保存');
    expect(html).not.toContain('处理中…');
    const cancel = html.match(/<button[^>]*>取消同步<\/button>/)?.[0] ?? '';
    expect(cancel).not.toContain('disabled');
  });
  it('shows the pending label only while a connect request is in flight', () => {
    const html = visible(renderToString(createElement(GitSettings, { git: controller(giteeState, { busy: true, pending: 'GIT_CONNECT' }) })));
    expect(html).toContain('处理中…');
  });
  it('renders the settings route with the Git panel mounted', () => {
    const html = renderToString(createElement(Library, {
      git: controller(giteeState), classify: emptyClassify(), route: 'settings', notice: null,
      children: createElement(GitSettings, { git: controller(giteeState) }),
    }));
    expect(html).toContain('设置与偏好');
    expect(html).toContain('管理外观、Git 连接、AI 服务与数据边界。');
    expect(html).toContain('Gitee');
  });
});

describe('AI 整理界面渲染路径', () => {
  it('renders the prompt panel with editable fields and the read-only contract', () => {
    const html = visible(renderToString(createElement(PromptSettings, { classify: prompted() })));
    expect(html).toContain('分类提示词');
    expect(html).toContain('系统提示词：分类准则');
    expect(html).toContain('用户提示词');
    expect(html).toContain('恢复默认');
    expect(html).toContain('查看固定的输出契约与安全约束');
    expect(html).toContain('只输出 JSON');
    expect(html).toContain('按用途分类');
    expect(html).toContain('分类名用中文');
  });

  it('renders the classify config panel without a save button', () => {
    const html = visible(renderToString(createElement(ClassifyConfig, {
      classify: emptyClassify({ config: { includePrivate: true, timeoutSeconds: 200, batchSize: 40 } }),
    })));
    expect(html).toContain('整理配置');
    expect(html).toContain('改动会自动保存');
    expect(html).toContain('请求超时（秒）');
    expect(html).toContain('每批整理数量');
    expect(html).toContain('1 到 100 之间');
    expect(html).toContain('把私有仓库也交给 AI 分类');
    expect(html).toContain('15 到 600 秒之间');
    expect(html).toContain('私有项目的名称、描述、语言与 topics 会发送到 AI 服务地址');
    expect(html).not.toContain('保存整理配置');
  });

  it('renders the prompt panel without a save button', () => {
    const html = visible(renderToString(createElement(PromptSettings, { classify: prompted() })));
    expect(html).toContain('停止输入后自动保存');
    expect(html).not.toContain('保存提示词');
  });

  it('shows classification progress on the library button instead of opening a dialog', () => {
    const idle = visible(renderToString(createElement(Library, {
      git: controller(giteeState), classify: emptyClassify(), route: 'library', notice: null, children: null,
    })));
    expect(idle).toContain('AI 整理');
    expect(idle).not.toContain('整理中');

    const busy = visible(renderToString(createElement(Library, {
      git: controller(giteeState), route: 'library', notice: null, children: null,
      classify: emptyClassify({ running: true, progress: { processed: 12, total: 63 } }),
    })));
    expect(busy).toContain('整理中 12 / 63');
    expect(busy).toContain('spinner');
    expect(busy).not.toContain('dialog-backdrop');
  });

  it('renders toast messages with honest success and error semantics', () => {
    const empty = renderToString(createElement(ToastStack, { toasts: [], onDismiss: () => undefined }));
    expect(empty).toBe('');
    const html = visible(renderToString(createElement(ToastStack, {
      toasts: [
        { id: 'one', kind: 'success', message: '已整理 5 个项目，新建 2 个分类。' },
        { id: 'two', kind: 'error', message: '整理中断：请求超时（120 秒）。已经处理的 5 个项目保留在本地。' },
      ],
      onDismiss: () => undefined,
    })));
    expect(html).toContain('已整理 5 个项目，新建 2 个分类。');
    expect(html).toContain('整理中断：请求超时（120 秒）');
    expect(html).toContain('role="alert"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="关闭提示"');
  });

  it('reports the unclassified count from the classify state', () => {
    expect(classifyState({ unclassified: 63 }).unclassified).toBe(63);
    expect(emptyClassify({ state: classifyState({ unclassified: 63 }) }).state?.unclassified).toBe(63);
  });
});
