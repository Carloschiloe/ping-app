import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const TypingIndicator = () => {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const createAnimation = (anim: Animated.Value, delay: number) => {
            return Animated.sequence([
                Animated.delay(delay),
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
                        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.delay(600) // pause between loops
                    ])
                )
            ]);
        };

        Animated.parallel([
            createAnimation(dot1, 0),
            createAnimation(dot2, 200),
            createAnimation(dot3, 400),
        ]).start();
    }, []);

    const getDotStyle = (anim: Animated.Value) => ({
        transform: [{
            translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -5]
            })
        }],
        opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.4, 1]
        })
    });

    return (
        <View style={styles.typingBubble}>
            <Animated.View style={[styles.typingDot, getDotStyle(dot1)]} />
            <Animated.View style={[styles.typingDot, getDotStyle(dot2)]} />
            <Animated.View style={[styles.typingDot, getDotStyle(dot3)]} />
        </View>
    );
};

export default TypingIndicator;

const styles = StyleSheet.create({
    typingBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        marginRight: 8,
        height: 16,
    },
    typingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#9ca3af',
    },
});
