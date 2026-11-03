import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Glass } from './Glass';
import { colors, gradients, radius } from './tokens';
import { fonts } from './typography';

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
    Chats: ['chatbubbles', 'chatbubbles-outline'],
    Hoy: ['sunny', 'sunny-outline'],
    Perfil: ['person-circle', 'person-circle-outline'],
};

// Space a screen leaves at its bottom so its last item clears the bar.
export const TAB_BAR_CLEARANCE = 96;

function TabButton({ label, focused, onPress }: { label: string; focused: boolean; onPress: () => void }) {
    const pill = useAnimatedStyle(() => ({
        opacity: withSpring(focused ? 1 : 0, { damping: 18 }),
        transform: [{ scale: withSpring(focused ? 1 : 0.6, { damping: 14 }) }],
    }));
    const [active, idle] = ICONS[label] ?? ['ellipse', 'ellipse-outline'];

    return (
        <Pressable
            onPress={onPress}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
        >
            <View style={styles.iconWrap}>
                <Animated.View style={[StyleSheet.absoluteFill, pill]}>
                    <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill} />
                </Animated.View>
                <Ionicons name={focused ? active : idle} size={21} color={focused ? colors.onGold : colors.textSoft} />
            </View>
            <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
        </Pressable>
    );
}

// Floating frosted bar with a gold pill under the active tab.
export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const focusedOptions = state.routes[state.index];
    const nested = (focusedOptions.state as any)?.index ?? 0;
    // Inside a conversation the bar steps aside so the composer has the room.
    if (nested > 0) return null;

    return (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
            <Glass style={styles.bar} intensity={50}>
                {state.routes.map((route, index) => {
                    const focused = state.index === index;
                    return (
                        <TabButton
                            key={route.key}
                            label={route.name}
                            focused={focused}
                            onPress={() => {
                                Haptics.selectionAsync();
                                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                            }}
                        />
                    );
                })}
            </Glass>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16 },
    bar: { flexDirection: 'row', height: 66, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'space-around' },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
    iconWrap: { width: 54, height: 32, alignItems: 'center', justifyContent: 'center' },
    pill: { flex: 1, borderRadius: radius.md },
    label: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textFaint },
    labelActive: { color: colors.gold },
});
