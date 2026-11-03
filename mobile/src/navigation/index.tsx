import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { View, StyleSheet } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { ConversationsStackParamList, MainTabParamList, RootStackParamList } from './types';
import { FloatingTabBar } from '../design/FloatingTabBar';
import { GlassBackdrop } from '../design/Glass';
import { PingOrb } from '../design/PingOrb';
import { colors } from '../design/tokens';

import AuthScreen from '../screens/AuthScreen';
import PasswordRecoveryScreen from '../screens/PasswordRecoveryScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen from '../screens/ChatScreen';
import TaskHistoryScreen from '../screens/TaskHistoryScreen';
import NewChatScreen from '../screens/NewChatScreen';
import NewGroupScreen from '../screens/NewGroupScreen';
import ChatInfoScreen from '../screens/ChatInfoScreen';
import SharedContentScreen from '../screens/SharedContentScreen';
import SharedVisualContentScreen from '../screens/SharedVisualContentScreen';
import AddParticipantsScreen from '../screens/AddParticipantsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AgentPreviewScreen from '../screens/AgentPreviewScreen';
import HoyScreen from '../screens/HoyScreen';
import CallScreen from '../screens/CallScreen';
import IncomingCallScreen from '../screens/IncomingCallScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const ConversationsStackNav = createNativeStackNavigator<ConversationsStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Every screen paints its own glass; the navigator only needs to stay dark
// underneath so nothing flashes white between screens.
const navigationTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        background: colors.ink,
        card: colors.surfaceSolid,
        text: colors.text,
        border: colors.separator,
        primary: colors.accent,
        notification: colors.accent,
    },
};

const ConversationsStack = () => {
    return (
    <ConversationsStackNav.Navigator>
        <ConversationsStackNav.Screen
            name="ConversationsList"
            component={ConversationsScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="Chat"
            component={ChatScreen}
            options={{ headerShown: false }}
        />
        <ConversationsStackNav.Screen
            name="TaskHistory"
            component={TaskHistoryScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="NewChat"
            component={NewChatScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="NewGroup"
            component={NewGroupScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="ChatInfo"
            component={ChatInfoScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="SharedContent"
            component={SharedContentScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="SharedVisualContent"
            component={SharedVisualContentScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="AddParticipants"
            component={AddParticipantsScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
        <ConversationsStackNav.Screen
            name="PingAI"
            component={AgentPreviewScreen}
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
    </ConversationsStackNav.Navigator>
    );
};

const MainTabs = () => (
    <GlassBackdrop>
    <Tab.Navigator
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: 'transparent' } }}
    >
        <Tab.Screen name="Chats" component={ConversationsStack} options={{ title: 'Chats' }} />
        <Tab.Screen name="Hoy" component={HoyScreen} options={{ title: 'Hoy' }} />
        <Tab.Screen name="Perfil" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
    </GlassBackdrop>
);

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Inner component to use hooks with navigation context
const PushNotificationHandler = () => {
    usePushNotifications(navigationRef);
    return null;
};

export const AppNavigator = () => {
    const { session, initialized, profileComplete, passwordRecoveryPending } = useAuth();
    if (!initialized || (session && profileComplete === null)) {
        return (
            <GlassBackdrop>
                <View style={styles.loading}>
                    <PingOrb size={72} />
                </View>
            </GlassBackdrop>
        );
    }

    return (
        <NavigationContainer
            ref={navigationRef}
            theme={navigationTheme}
        >
            {session && profileComplete && !passwordRecoveryPending && <PushNotificationHandler />}
            <RootStack.Navigator screenOptions={{ headerShown: false }}>
                {passwordRecoveryPending ? (
                    <RootStack.Screen name="PasswordRecovery" component={PasswordRecoveryScreen} />
                ) : session && profileComplete ? (
                    <RootStack.Screen name="Main" component={MainTabs} />
                ) : session ? (
                    <RootStack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
                ) : (
                    <RootStack.Screen name="Auth" component={AuthScreen} />
                )}
                {/* Always registered so navigationRef can reach them from root */}
                <RootStack.Screen
                    name="IncomingCall"
                    component={IncomingCallScreen}
                    options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
                />
                <RootStack.Screen
                    name="Call"
                    component={CallScreen}
                    options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
                />
            </RootStack.Navigator>
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
