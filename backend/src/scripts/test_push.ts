import { NotificationService } from '../services/notification.service';

async function testPush() {
    const tokens = (process.env.EXPO_TEST_PUSH_TOKENS || '')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);

    if (tokens.length === 0) {
        throw new Error('EXPO_TEST_PUSH_TOKENS must contain at least one test token');
    }

    console.log("Sending test push to both accounts...");

    try {
        const result = await NotificationService.sendPushNotifications({
            to: tokens,
            title: "🔔 ¡Notificación de Prueba Ping!",
            body: "Carlos, si estás leyendo esto, las notificaciones push están funcionando perfectamente en tu celular físico. 🚀",
            sound: "default"
        });
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}

testPush();
