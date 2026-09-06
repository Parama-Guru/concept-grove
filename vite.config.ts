import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Keep the same build portable across static hosts and GitHub Pages project paths.
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'question-bank', test: /src[\\/]data[\\/](machineLearning|deepLearning|naturalLanguage)\.ts$/ },
          ],
        },
      },
    },
  },
})
