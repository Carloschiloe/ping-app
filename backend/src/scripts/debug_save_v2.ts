
import * as commitmentService from '../services/commitment.service';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function debug() {
    const userId = '33cea535-c781-41ad-9b6e-a22762d44958';
    const mockData = {
        "assigned_to_user_id": userId,
        "due_at": "2026-03-12T18:31:23.445Z",
        "priority": "medium",
        "status": "accepted",
        "title": "DEBUG: Quick Capture Task"
    };

    console.log('--- Debugging createCommitment ---');
    try {
        const result = await commitmentService.createCommitment(userId, mockData);
        console.log('SUCCESS:', result);
    } catch (err: any) {
        console.error('FAILED!');
        console.error('Error:', err);
        if (err.message) console.error('Message:', err.message);
        if (err.details) console.error('Details:', err.details);
        if (err.code) console.error('Code:', err.code);
        if (err.hint) console.error('Hint:', err.hint);
    }
}

debug();
