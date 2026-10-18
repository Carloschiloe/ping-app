import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        // Unit tests must be able to import modules that depend on the
        // server-side Supabase client without requiring a developer's local
        // credentials. The setup file installs inert loopback values only
        // when the caller did not provide real integration-test settings;
        // production startup validation remains fail-closed.
        setupFiles: ['./tests/setup.ts'],
        // morningRoutine.test.ts importa node-cron (transform/parse lento en
        // el primer import) y ha mostrado timeouts intermitentes con el
        // default de 5000ms bajo carga; 15s da margen sin ocultar bugs reales.
        testTimeout: 15000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: [
                'src/utils/commitmentStatus.ts',
                'src/utils/commitmentType.ts',
                'src/utils/commitmentTransitions.ts',
                'src/utils/commitmentEvents.ts',
                'src/utils/commitmentCompat.ts',
                'src/schemas/commitment.schema.ts',
                'src/schemas/contact.schema.ts',
                'src/services/date-parser.service.ts',
                'src/services/commitment.service.ts',
                'src/services/contact.service.ts',
                'src/controllers/insights.controller.ts',
                'src/utils/messageCompat.ts',
                'src/utils/conversationCompat.ts',
                'src/utils/authz.ts',
                'src/services/conversation.service.ts',
            ],
        },
    },
});
