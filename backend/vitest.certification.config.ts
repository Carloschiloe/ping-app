import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['certification/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/.git/**'],
    },
});
