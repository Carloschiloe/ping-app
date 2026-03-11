import { NotificationService } from './src/services/notification.service';

async function testPush() {
    const tokens = [
        "ExponentPushToken[p9DJ_nLt2tNIoL7JTM30VW]",
        "ExponentPushToken[onZkIsH3tHTHdiS7wIz_JU]"
    ];

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
