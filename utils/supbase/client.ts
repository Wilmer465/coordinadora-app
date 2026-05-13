import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.'https://llkfdckqovgfguponutg.supabase.co';
const supabaseAnonKey = process.env.'sb_publishable_3LLyKJdKoG1ag4bIdDfpQg_IolLFXUQ';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const createClient = () =>
  createBrowserClient(supabaseUrl, supabaseAnonKey);
