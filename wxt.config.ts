import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Tailwind v4 runs as a Vite plugin; utilities are pulled in by src/ui/tailwind.css.
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Amazing Stars',
    description: '更从容地浏览、分类和整理 GitHub 与 Gitee Stars。',
    permissions: ['storage'],
    host_permissions: ['https://api.github.com/*', 'https://gitee.com/*'],
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    action: { default_title: 'Amazing Stars' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
    },
  },
});
