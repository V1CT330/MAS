import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_MAS_SUPABASE_URL = "https://hbwfgjpqgopearavplqb.supabase.co";
const DEFAULT_MAS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_7gCVgi4SoqzoAE4G0U3mGA_ag_o2g8w";

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_MAS_SUPABASE_URL).trim();
// Both Supabase key names are public client keys. Never put service-role or provider secrets here.
const configuredSupabaseKey = (
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  ""
).trim();
const supabaseKey = configuredSupabaseKey &&
  !configuredSupabaseKey.startsWith("sb_secret_") &&
  !configuredSupabaseKey.includes("service_role")
  ? configuredSupabaseKey
  : DEFAULT_MAS_SUPABASE_PUBLISHABLE_KEY;

const isValidSupabaseUrl = (() => {
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.protocol === "https:" && Boolean(parsed.hostname) &&
      !parsed.hostname.includes("example.supabase.co") &&
      !parsed.hostname.includes("your-project");
  } catch {
    return false;
  }
})();

export const isSupabaseConfigured =
  isValidSupabaseUrl &&
  Boolean(supabaseKey) &&
  !supabaseKey.includes("placeholder-publishable-key") &&
  !supabaseKey.includes("your-publishable-key");

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
