import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import AuthScreen from '../screens/AuthScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen from '../screens/ChatScreen';
import NewChatScreen from '../screens/NewChatScreen';
import HoyScreen from '../screens/HoyScreen';
import SearchScreen from '../screens/SearchScreen';
import ProfileScreen from '../screens/ProfileScreen';

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
                title: route.params?.otherUser?.email || 'Chat',
                headerBackTitle: '',
            })}
        />
        <Stack.Screen
            name="NewChat"
            component={NewChatScreen}
            options={{ headerShown: false }}
        />
    </Stack.Navigator>
);

const MainTabs = () => (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#3b82f6' }}>
        <Tab.Screen name="Chats" component={ConversationsStack} options={{ title: 'Chats' }} />
        <Tab.Screen name="Hoy" component={HoyScreen} options={{ title: 'Hoy' }} />
        <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Buscar' }} />
        <Tab.Screen name="Perfil" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
);

export const AppNavigator = () => {
    const { session, initialized } = useAuth();

    if (!initialized) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {session ? (
                    <Stack.Screen name="Main" component={MainTabs} />
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
