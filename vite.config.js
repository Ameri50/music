import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relativo: funciona igual en GitHub Pages (/music/) y en Vercel (raíz)
  base: './',
  plugins: [react()],
});
