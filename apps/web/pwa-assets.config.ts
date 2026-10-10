import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA icon set from the hanko seal favicon (run: pnpm pwa-assets).
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#1b1916' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#1b1916' } },
  },
  images: ['public/favicon.svg'],
});
