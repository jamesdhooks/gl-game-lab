import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GL_GAME_LAB_BASE_PATH ?? '/',
  plugins: [react()],
});
