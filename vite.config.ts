import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Build-only plugin for the Electron desktop app.
 *
 * 1. Emits dist/desktop-config.json. VITE_* variables are compiled into the
 *    renderer but are invisible to Electron's main process in a packaged app, and
 *    the main process needs the Supabase origin to validate document downloads.
 * 2. Adds a Content-Security-Policy to the built index.html. It is skipped in
 *    dev because Vite's HMR needs inline scripts.
 */
function desktopRuntime(supabaseUrl: string): Plugin {
  const origin = (() => {
    try { return supabaseUrl ? new URL(supabaseUrl).origin : ''; } catch { return ''; }
  })();
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${origin ? ' ' + origin : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join('; ');

  return {
    name: 'printomatic-desktop-runtime',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'desktop-config.json',
        source: JSON.stringify({ supabaseUrl: supabaseUrl.replace(/\/$/, '') }),
      });
    },
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), tailwindcss(), desktopRuntime(env.VITE_SUPABASE_URL || '')],
    resolve: { alias: { '@': path.resolve(__dirname, '.') } },
    server: { hmr: process.env.DISABLE_HMR !== 'true' }
  };
});
