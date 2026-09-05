// SDK 57 hotfix — expo-av (retirado de Expo Go: "Cannot find native module
// 'ExponentAV'") migrado a expo-video para VIDEO. expo-av cargaba Audio y
// Video de forma incondicional en su entrypoint, por lo que los 3 usos de
// Video/ResizeMode seguían disparando el crash aunque el audio ya estuviera
// migrado a expo-audio (ver tests/expoAudioMigration.test.ts). Pure-logic /
// static-audit tests (sin renderer, consistente con vitest.config.ts).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

const MIGRATED_FILES = [
    'src/screens/ChatScreen.tsx',
    'src/components/MessageItem.tsx',
    'src/components/shared-content/SharedMediaViewer.tsx',
];

describe('SDK57 hotfix: ningún archivo de video real importa expo-av', () => {
    for (const f of MIGRATED_FILES) {
        it(`${f} nunca importa expo-av`, () => {
            const src = readSrc(f);
            expect(src).not.toMatch(/from ['"]expo-av['"]/);
        });

        it(`${f} importa la API real de expo-video`, () => {
            const src = readSrc(f);
            expect(src).toMatch(/from ['"]expo-video['"]/);
        });
    }
});

describe('SDK57 hotfix: SharedMediaViewer (visor a pantalla completa) migrado a expo-video', () => {
    const src = readSrc('src/components/shared-content/SharedMediaViewer.tsx');

    it('usa useVideoPlayer y VideoView', () => {
        expect(src).toContain('useVideoPlayer(');
        expect(src).toContain('<VideoView');
    });

    it('preserva contentFit=contain (equivalente a ResizeMode.CONTAIN)', () => {
        expect(src).toContain('contentFit="contain"');
    });

    it('preserva controles nativos visibles (useNativeControls -> nativeControls)', () => {
        expect(src).toMatch(/<VideoView[^>]*nativeControls/);
    });

    it('sincroniza la fuente cuando la url resuelta cambia (replace)', () => {
        expect(src).toContain('player.replace(url)');
    });

    it('preserva shouldPlay={active}: reproduce cuando la página está activa, pausa si no', () => {
        expect(src).toContain('player.play()');
        expect(src).toContain('player.pause()');
    });
});

describe('SDK57 hotfix: MessageItem (miniatura de video en la lista) migrado a expo-video', () => {
    const src = readSrc('src/components/MessageItem.tsx');

    it('extrae la miniatura de video a un subcomponente memoizado (evita 1 VideoPlayer nativo por mensaje)', () => {
        expect(src).toMatch(/const InlineVideoThumbnail = React\.memo\(/);
    });

    it('el subcomponente de miniatura nunca reproduce (preview estático, igual que antes con shouldPlay={false})', () => {
        const start = src.indexOf('const InlineVideoThumbnail');
        const end = src.indexOf('\n});', start);
        const thumbnailSrc = src.slice(start, end);
        expect(thumbnailSrc).not.toMatch(/\.play\(\)/);
    });

    it('preserva silencio (isMuted=true -> p.muted = true)', () => {
        expect(src).toContain('p.muted = true');
    });

    it('preserva contentFit=cover (equivalente a ResizeMode.COVER) y controles ocultos', () => {
        expect(src).toContain('contentFit="cover"');
        expect(src).toMatch(/<VideoView[^>]*nativeControls=\{false\}/);
    });

    it('solo se monta la miniatura de video cuando el mensaje es de tipo video (isVideo && mediaUrl)', () => {
        expect(src).toMatch(/isVideo && mediaUrl[\s\S]{0,300}<InlineVideoThumbnail/);
    });
});

describe('SDK57 hotfix: ChatScreen (visor modal de imagen/video) migrado a expo-video', () => {
    const src = readSrc('src/screens/ChatScreen.tsx');

    it('usa un único useVideoPlayer a nivel de componente (sin riesgo de lista, no es un item repetido)', () => {
        expect(src).toContain('const viewerVideoPlayer = useVideoPlayer(null)');
    });

    it('sincroniza fuente y autoplay con viewerMedia (equivalente a shouldPlay del <Video> anterior)', () => {
        expect(src).toContain('viewerVideoPlayer.replace(viewerMedia.url)');
        expect(src).toContain('viewerVideoPlayer.play()');
    });

    it('pausa el player cuando el visor se cierra o no es video (no sigue sonando en segundo plano)', () => {
        expect(src).toContain('viewerVideoPlayer.pause()');
    });

    it('preserva contentFit=contain y controles nativos en el visor modal', () => {
        expect(src).toMatch(/<VideoView[^>]*contentFit="contain"/);
        expect(src).toMatch(/<VideoView[^>]*nativeControls/);
    });
});

describe('SDK57 hotfix: expo-av eliminado del package.json (ya no es una dependencia del runtime)', () => {
    it('package.json no declara expo-av', () => {
        const pkg = readSrc('package.json');
        expect(pkg).not.toMatch(/"expo-av"/);
    });
});
