import { DarkTheme, DefaultTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { ConversationsStackParamList, MainTabParamList, RootStackParamList } from './types';
import { useAppTheme } from '../theme/ThemeContext';
import { FloatingTabBar } from '../design/FloatingTabBar';

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

const ConversationsStack = () => {
    const { theme: appTheme } = useAppTheme();
    const stackHeaderStyle = { backgroundColor: appTheme.colors.primary };
    const stackTintColor = appTheme.colors.white;

    return (
    <ConversationsStackNav.Navigator>
        <ConversationsStackNav.Screen
            name="ConversationsList"
            component={ConversationsScreen}
            options={{ headerShown: false }}
        />
        <ConversationsStackNav.Screen
            name="Chat"
            component={ChatScreen}
            options={({ route }: any) => ({
                title: route.params?.isSelf ? 'Para mí' : (route.params?.otherUser?.full_name || route.params?.otherUser?.email?.split('@')[0] || 'Chat'),
                headerBackTitle: '',
                headerStyle: stackHeaderStyle,
                headerTintColor: stackTintColor,
                headerTitleStyle: { fontWeight: '700', color: stackTintColor },
            })}
        />
        <ConversationsStackNav.Screen
            name="TaskHistory"
            component={TaskHistoryScreen}
            options={{
                headerShown: true,
                title: 'Historial de tareas',
                headerBackTitle: 'Atrás',
                headerStyle: stackHeaderStyle,
                headerTintColor: stackTintColor,
            }}
        />
        <ConversationsStackNav.Screen
            name="NewChat"
            component={NewChatScreen}
            options={{ headerShown: false }}
        />
        <ConversationsStackNav.Screen
            name="NewGroup"
            component={NewGroupScreen}
            options={{
                headerShown: true,
                title: 'Nuevo Grupo',
                headerBackTitle: 'Atrás',
                headerStyle: stackHeaderStyle,
                headerTintColor: stackTintColor,
            }}
        />
        <ConversationsStackNav.Screen
            name="ChatInfo"
            component={ChatInfoScreen}
            options={{
                headerShown: true,
                title: 'Info del Chat',
                headerBackTitle: 'Atrás',
                headerStyle: stackHeaderStyle,
                headerTintColor: stackTintColor,
            }}
        />
        <ConversationsStackNav.Screen
            name="SharedContent"
            component={SharedContentScreen}
            options={{
                headerShown: true,
                title: 'Contenido compartido',
                headerBackTitle: 'Atrás',
                headerStyle: stackHeaderStyle,
                headerTintColor: stackTintColor,
            }}
        />
        <ConversationsStackNav.Screen
            name="SharedVisualContent"
            component={SharedVisualContentScreen}
            options={{
                headerShown: true,
                title: 'Fotos y videos',
                headerBackTitle: 'Atrás',
                headerStyle: stackHeaderStyle,
                headerTintColor: stackTintColor,
            }}
        />
        <ConversationsStackNav.Screen
            name="AddParticipants"
            component={AddParticipantsScreen}
            options={{
                headerShown: true,
                title: 'Añadir Integrantes',
                headerBackTitle: 'Atrás',
                headerStyle: stackHeaderStyle,
                headerTintColor: stackTintColor,
            }}
        />
        <ConversationsStackNav.Screen
            name="PingAI"
            component={AgentPreviewScreen}
            options={{ headerShown: false }}
        />
    </ConversationsStackNav.Navigator>
    );
};

const MainTabs = () => (
    <Tab.Navigator
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
    >
        <Tab.Screen name="Chats" component={ConversationsStack} options={{ title: 'Chats' }} />
        <Tab.Screen name="Hoy" component={HoyScreen} options={{ title: 'Hoy' }} />
        <Tab.Screen name="Perfil" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
);

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Inner component to use hooks with navigation context
const PushNotificationHandler = () => {
    usePushNotifications(navigationRef);
    return null;
};

export const AppNavigator = () => {
    const { session, initialized, profileComplete, passwordRecoveryPending } = useAuth();
    const { theme: appTheme, isDark } = useAppTheme();

    if (!initialized || (session && profileComplete === null)) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color="#1e3a5f" />
            </View>
        );
    }

    return (
        <NavigationContainer
            ref={navigationRef}
            theme={isDark ? {
                ...DarkTheme,
                colors: {
                    ...DarkTheme.colors,
                    background: appTheme.colors.background,
                    card: appTheme.colors.surface,
                    text: appTheme.colors.text.primary,
                    border: appTheme.colors.border,
                    primary: appTheme.colors.primary,
                    notification: appTheme.colors.accent,
                },
            } : {
                ...DefaultTheme,
                colors: {
                    ...DefaultTheme.colors,
                    background: appTheme.colors.background,
                    card: appTheme.colors.surface,
                    text: appTheme.colors.text.primary,
                    border: appTheme.colors.border,
                    primary: appTheme.colors.primary,
                    notification: appTheme.colors.accent,
                },
            }}
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
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' },
});
