import { afterEach, describe, expect, it } from 'vitest';
import createConfig from '../app.config';

const originalVariant = process.env.APP_VARIANT;
const originalEasBuild = process.env.EAS_BUILD;

afterEach(() => {
    if (originalVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = originalVariant;
    if (originalEasBuild === undefined) delete process.env.EAS_BUILD;
    else process.env.EAS_BUILD = originalEasBuild;
});

describe('identidad de la build staging', () => {
    it('usa una versión superior y una marca visible para impedir confundirla con la build anterior', () => {
        process.env.APP_VARIANT = 'staging';
        delete process.env.EAS_BUILD;

        const config = createConfig({ config: {} } as any);

        expect(config.name).toBe('Ping Staging');
        expect(config.version).toBe('1.0.3');
        expect(config.android?.package).toBe('com.carloschiloe.ping.staging');
        expect(config.android?.versionCode).toBe(4);
        expect(config.extra?.buildLabel).toBe('STAGING 1.0.3 (4) · AUTH UI V1');
    });
});
