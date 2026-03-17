import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

export type ChatRouteParams = {
    conversationId: string;
    otherUser?: any | null;
    isSelf?: boolean;
    isGroup?: boolean;
    groupMetadata?: any | null;
    mode?: 'chat' | 'operation';
    scrollToMessageId?: string;
};

export type ConversationsStackParamList = {
    ConversationsList: undefined;
    Chat: ChatRouteParams;
    NewChat: undefined;
    NewGroup: undefined;
    ChatInfo: {
        conversationId: string;
        otherUser?: any | null;
        isGroup?: boolean;
        isSelf?: boolean;
        groupMetadata?: any | null;
        mode?: 'chat' | 'operation';
    };
    AddParticipants: {
        conversationId: string;
    };
    PingAI: undefined;
    QuickCapture: undefined;
};

export type MainTabParamList = {
    Chats: NavigatorScreenParams<ConversationsStackParamList> | undefined;
    Tablero: undefined;
    Insights: undefined;
    Perfil: undefined;
};

export type RootStackParamList = {
    Main: undefined;
    Auth: undefined;
    IncomingCall: any;
    Call: {
        conversationId: string;
        otherUser?: any | null;
        isGroup?: boolean;
        type: 'voice' | 'video';
    };
};

export type ChatsTabNavigationProp = BottomTabNavigationProp<MainTabParamList, 'Chats'>;
export type ConversationsStackNavigationProp = NativeStackNavigationProp<ConversationsStackParamList>;
export type ChatScreenProps = NativeStackScreenProps<ConversationsStackParamList, 'Chat'>;
export type ChatInfoScreenProps = NativeStackScreenProps<ConversationsStackParamList, 'ChatInfo'>;
export type AddParticipantsScreenProps = NativeStackScreenProps<ConversationsStackParamList, 'AddParticipants'>;
export type ChatCompositeNavigationProp = CompositeNavigationProp<
    NativeStackNavigationProp<ConversationsStackParamList, 'Chat'>,
    NativeStackNavigationProp<RootStackParamList>
>;
