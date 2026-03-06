import { app } from './app';
import { checkDueCommitments } from './services/push.service';
import { startMorningRoutineCron } from './services/morningRoutine.service';

const PORT = process.env.PORT || 3000;

// Env check
const requiredEnvs = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
    console.error('❌ ERROR FATAL: Faltan las siguientes variables de entorno:');
    missingEnvs.forEach(env => console.error(`   - ${env}`));
    console.error('\nPor favor, crea un archivo .env en la carpeta /backend o configúralas en tu entorno.\n');
    process.exit(1);
}

// Ensure the pushing cron job runs every 60 seconds
setInterval(() => {
    checkDueCommitments().catch(console.error);
}, 60000);

// Phase 24: Start morning routine cron job (runs daily at 8 AM Santiago time)
startMorningRoutineCron();

app.listen(PORT, () => {
    console.log(`✅ PING Backend listening on port ${PORT}`);
});
