import { describe, expect, it } from 'vitest';
import { repositoryUrl } from '../src/library/library';

describe('repositoryUrl', () => {
  it('默认指向 GitHub', () => {
    expect(repositoryUrl('facebook/react')).toBe('https://github.com/facebook/react');
  });

  it('Gitee 账号指向 gitee.com', () => {
    expect(repositoryUrl('gitee/hello', 'gitee')).toBe('https://gitee.com/gitee/hello');
  });

  it('拒绝非法路径，避免拼出越界地址', () => {
    expect(repositoryUrl('no-slash')).toBeNull();
    expect(repositoryUrl('../etc/passwd')).toBeNull();
    expect(repositoryUrl('owner/..')).toBeNull();
  });
});
