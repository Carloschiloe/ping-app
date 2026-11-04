import React from 'react';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

// Private files come with a signed link that changes every minute but points
// at the same file. Keying the cache on the file (the link without its token)
// keeps a photo on screen and on disk instead of downloading it again.
export function stableImageKey(uri: string): string {
    return uri.split('?')[0];
}

type CachedImageProps = {
    uri: string;
    style?: StyleProp<ImageStyle>;
    contentFit?: ImageContentFit;
    onError?: () => void;
};

export function CachedImage({ uri, style, contentFit = 'cover', onError }: CachedImageProps) {
    const cacheKey = stableImageKey(uri);
    return (
        <Image
            source={{ uri, cacheKey }}
            recyclingKey={cacheKey}
            cachePolicy="memory-disk"
            contentFit={contentFit}
            transition={120}
            style={style}
            onError={onError}
        />
    );
}
