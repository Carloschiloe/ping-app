import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
// Provide option to use anon key or service role key based on requirement. 
// For our backend when creating commitments triggered by system, 
// we might need the service role key.
// But mostly we insert data under the user's RLS. If we use the anon key 
// and attach the JWT token in auth header, we act as the user.
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// We define a separate client that uses the service role to bypass RLS 
// if we need to do background jobs.
export const supabaseAdmin = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey
);
