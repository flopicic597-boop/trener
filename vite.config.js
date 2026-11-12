import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  // релативне путање: апликација ради и из подфасцикле (нпр. GitHub Pages /име-репозиторијума/)
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    VitePWA({
      // 'prompt': нова верзија се НЕ активира сама — корисник потврђује када заврши унос
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        id: './',
        name: 'Тренер – евиденција клијената',
        short_name: 'Тренер',
        description: 'Евиденција клијената, планирање тренинга и праћење напретка. Ради без интернета.',
        lang: 'sr-Cyrl',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#121822',
        theme_color: '#121822',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        // при ПРВОЈ инсталацији SW одмах преузима страницу (рад без интернета без поновног учитавања);
        // касније верзије и даље чекају потврду корисника (registerType: 'prompt')
        clientsClaim: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
