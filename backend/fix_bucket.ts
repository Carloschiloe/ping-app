import { supabaseAdmin } from './src/lib/supabaseAdmin';

async function fixBucket() {
    console.log('Checking bucket "chat-media"...');
    const { data: buckets, error: getErr } = await supabaseAdmin.storage.listBuckets();

    if (getErr) {
        console.error('Error listing buckets:', getErr);
        return;
    }

    const exists = buckets.find(b => b.id === 'chat-media');
    if (!exists) {
        console.log('Creating "chat-media" bucket...');
        const { error: createErr } = await supabaseAdmin.storage.createBucket('chat-media', {
            public: true,
            allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
        });
        if (createErr) console.error('Error creating bucket:', createErr);
        else console.log('Bucket created successfully!');
    } else {
        console.log('Updating "chat-media" bucket to public...');
        const { error: updateErr } = await supabaseAdmin.storage.updateBucket('chat-media', {
            public: true
        });
        if (updateErr) console.error('Error updating bucket:', updateErr);
        else console.log('Bucket updated to public successfully!');
    }
}

fixBucket();
