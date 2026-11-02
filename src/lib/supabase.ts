import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
// Support both current Supabase publishable keys and legacy public anon keys.
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "";

export const isSupabaseConfigured =
  /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/.*)?$/.test(supabaseUrl) &&
  Boolean(supabaseKey) &&
  !/your-project|example\.supabase\.co/i.test(supabaseUrl) &&
  !/your-publishable-key|placeholder-publishable-key/i.test(supabaseKey);

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : "https://example.supabase.co",
  isSupabaseConfigured ? supabaseKey : "placeholder-publishable-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
