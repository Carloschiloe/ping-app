import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HighlightText = ({ text, highlight, style, numberOfLines, highlightStyle }: any) => {
    if (!highlight.trim()) {
        return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
    }
    const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeHighlight})`, 'gi');
    const parts = text.split(regex);
    return (
        <Text style={style} numberOfLines={numberOfLines}>
            {parts.map((part: string, i: number) =>
                regex.test(part) ? (
                    <Text key={i} style={highlightStyle}>{part}</Text>
                ) : (
                    <Text key={i}>{part}</Text>
                )
            )}
        </Text>
    );
};

type GlobalSearchSectionProps = {
    section: any;
    searchQuery: string;
    styles: any;
    onPress: (item: any, type: string) => void;
};

export function GlobalSearchSection({ section, searchQuery, styles, onPress }: GlobalSearchSectionProps) {
    return (
        <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.data.map((item: any) => (
                <TouchableOpacity
                    key={item.id}
                    style={styles.resultCard}
                    onPress={() => onPress(item, item.type || section.type)}
                >
                    <View style={styles.resultIcon}>
                        {item.avatar_url ? (
                            <Image source={{ uri: item.avatar_url }} style={styles.resultAvatar} />
                        ) : (
                            <View style={[styles.resultIconInner, { backgroundColor: item.type === 'person' ? '#3b82f6' : (item.type === 'group' ? '#10b981' : '#f59e0b') }]}> 
                                <Ionicons
                                    name={item.type === 'person' ? 'person' : (item.type === 'group' ? 'people' : (section.type === 'tasks' ? 'calendar' : 'chatbubble'))}
                                    size={14}
                                    color="white"
                                />
                            </View>
                        )}
                    </View>
                    <View style={styles.resultInfo}>
                        <HighlightText
                            text={item.full_name || item.name || item.title || item.text}
                            highlight={searchQuery}
                            style={styles.resultText}
                            highlightStyle={styles.resultTextHighlight}
                            numberOfLines={1}
                        />
                        <Text style={styles.resultSubtext}>
                            {item.type === 'person' ? item.email : (item.type === 'group' ? 'Grupo' : (section.type === 'tasks' ? 'Tarea' : `De ${item.sender?.full_name || 'Enviado'}`))}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
                </TouchableOpacity>
            ))}
        </View>
    );
}
