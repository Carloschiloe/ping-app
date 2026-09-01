import 'dotenv/config';

const projectRef = 'oonijgmddgyymhrlnvuu';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) throw new Error('Missing SUPABASE_ACCESS_TOKEN');
if (process.env.SUPABASE_URL) {
  const target = new URL(process.env.SUPABASE_URL);
  if (target.protocol !== 'https:' || target.hostname !== `${projectRef}.supabase.co`) {
    throw new Error('C-4C staging target mismatch');
  }
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `
      select jsonb_build_object(
        'bucket', (
          select jsonb_build_object(
            'id', id,
            'name', name,
            'public', public,
            'file_size_limit', file_size_limit,
            'allowed_mime_types', allowed_mime_types
          )
          from storage.buckets
          where id = 'chat-media'
        ),
        'policies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', policyname,
            'roles', roles,
            'command', cmd
          ) order by policyname)
          from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
        ), '[]'::jsonb),
        'grants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'grantee', grantee,
            'privilege', privilege_type
          ) order by grantee, privilege_type)
          from information_schema.role_table_grants
          where table_schema = 'storage'
            and table_name = 'objects'
            and grantee in ('anon', 'authenticated', 'service_role')
        ), '[]'::jsonb),
        'attachments_before_migration', to_regclass('public.attachments')
      ) as preflight;
    `,
  }),
  signal: AbortSignal.timeout(30_000),
});

if (!response.ok) throw new Error(`Staging preflight query failed with HTTP ${response.status}`);
const rows = await response.json();
const preflight = rows?.[0]?.preflight;
if (!preflight?.bucket) throw new Error('chat-media bucket not found');
if (preflight.bucket.public !== false) throw new Error('chat-media bucket is not private');
if (preflight.attachments_before_migration !== null) {
  throw new Error('Unexpected pre-existing public.attachments table');
}

process.stdout.write(`${JSON.stringify({ projectRef, ...preflight }, null, 2)}\n`);
