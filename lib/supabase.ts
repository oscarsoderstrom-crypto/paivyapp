import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { sessionStorage } from './secureStorage';

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    storage:            sessionStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
