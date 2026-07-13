import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: [
                'src/utils/commitmentStatus.ts',
                'src/utils/commitmentType.ts',
                'src/schemas/commitment.schema.ts',
                'src/services/date-parser.service.ts',
            ],
        },
    },
});
