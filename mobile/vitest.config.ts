import { defineConfig } from 'vitest/config';

// Cubre unicamente logica pura de src/utils (sin renderizar componentes
// React Native: eso requeriria jest-expo + configuracion nativa, fuera de
// alcance de esta fase). Ver tests/*.test.ts.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
});
