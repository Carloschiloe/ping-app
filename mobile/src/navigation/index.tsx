import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePushNotifications } from '../hooks/usePushNotifications';

import AuthScreen from '../screens/AuthScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen from '../screens/ChatScreen';
import NewChatScreen from '../screens/NewChatScreen';
import NewGroupScreen from '../screens/NewGroupScreen';
import ChatInfoScreen from '../screens/ChatInfoScreen';
import AddParticipantsScreen from '../screens/AddParticipantsScreen';
import InsightsScreen from '../screens/InsightsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PingAIScreen from '../screens/PingAIScreen';
import QuickCaptureScreen from '../screens/QuickCaptureScreen';
import TaskDashboardScreen from '../screens/TaskDashboardScreen';
import CallScreen from '../screens/CallScreen';
import IncomingCallScreen from '../screens/IncomingCallScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ConversationsStack = () => (
    <Stack.Navigator>
        <Stack.Screen
            name="ConversationsList"
            component={ConversationsScreen}
            options={{ headerShown: false }}
        />
        <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({ route }: any) => ({
                title: route.params?.isSelf ? '📌 Mis Recordatorios' : (route.params?.otherUser?.email?.split('@')[0] || 'Chat'),
                headerBackTitle: '',
                headerStyle: { backgroundColor: '#1e3a5f' },
                headerTintColor: 'white',
                headerTitleStyle: { fontWeight: '700', color: 'white' },
            })}
        />
        <Stack.Screen
            name="NewChat"
            component={NewChatScreen}
            options={{ headerShown: false }}
        />
        <Stack.Screen
            name="NewGroup"
            component={NewGroupScreen}
            options={{
                headerShown: true,
                title: 'Nuevo Grupo',
                headerBackTitle: 'Atrás',
                headerStyle: { backgroundColor: '#1e3a5f' },
                headerTintColor: 'white',
            }}
        />
        <Stack.Screen
            name="ChatInfo"
            component={ChatInfoScreen}
            options={{
                headerShown: true,
                title: 'Info del Chat',
                headerBackTitle: 'Atrás',
                headerStyle: { backgroundColor: '#1e3a5f' },
                headerTintColor: 'white',
            }}
        />
        <Stack.Screen
            name="AddParticipants"
            component={AddParticipantsScreen}
            options={{
                headerShown: true,
                title: 'Añadir Integrantes',
                headerBackTitle: 'Atrás',
                headerStyle: { backgroundColor: '#1e3a5f' },
                headerTintColor: 'white',
            }}
        />
        <Stack.Screen
            name="PingAI"
            component={PingAIScreen}
            options={{ headerShown: false }}
        />
        <Stack.Screen
            name="QuickCapture"
            component={QuickCaptureScreen}
            options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
            name="Call"
            component={CallScreen}
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
    </Stack.Navigator>
);

const MainTabs = () => (
    <Tab.Navigator
        screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: '#1e3a5f',
            tabBarInactiveTintColor: '#9ca3af',
            tabBarStyle: {
                backgroundColor: 'white',
                borderTopColor: '#f0f0f0',
                height: 60,
                paddingBottom: 8,
                paddingTop: 4,
            },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            tabBarIcon: ({ focused, color, size }) => {
                let iconName: any;
                if (route.name === 'Chats') {
                    iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                } else if (route.name === 'Tablero') {
                    iconName = focused ? 'layers' : 'layers-outline';
                } else if (route.name === 'Insights') {
                    iconName = focused ? 'sparkles' : 'sparkles-outline';
                } else if (route.name === 'Perfil') {
                    iconName = focused ? 'person-circle' : 'person-circle-outline';
                }
                return <Ionicons name={iconName} size={24} color={color} />;
            },
        })}
    >
        <Tab.Screen name="Chats" component={ConversationsStack} options={{ title: 'Chats' }} />
        <Tab.Screen name="Tablero" component={TaskDashboardScreen} options={{ title: 'Tablero' }} />
        <Tab.Screen name="Insights" component={InsightsScreen} options={{ title: 'Insights' }} />
        <Tab.Screen name="Perfil" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
);

export const navigationRef = createNavigationContainerRef();

// Inner component to use hooks with navigation context
const PushNotificationHandler = () => {
    usePushNotifications(navigationRef);
    return null;
};

export const AppNavigator = () => {
    const { session, initialized } = useAuth();

    if (!initialized) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color="#1e3a5f" />
            </View>
        );
    }

    return (
        <NavigationContainer ref={navigationRef}>
            <PushNotificationHandler />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {session ? (
                    <>
                        <Stack.Screen name="Main" component={MainTabs} />
                        <Stack.Screen
                            name="Call"
                            component={CallScreen}
                            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
                        />
                        <Stack.Screen
                            name="IncomingCall"
                            component={IncomingCallScreen}
                            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
                        />
                    </>
                ) : (
                    <Stack.Screen name="Auth" component={AuthScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' },
});
