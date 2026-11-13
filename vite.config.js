import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' makes the built site work from any sub-path, like
// https://<username>.github.io/cove/
export default defineConfig({
  plugins: [react()],
  base: './',
})
