import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'sem-configuracao', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'portal-sicoob-unb-auth',
  },
});

export const BUCKET = 'documentos';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
