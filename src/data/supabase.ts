import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lê as credenciais do .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Se não estiverem definidas, o app cai no store mock (dev sem backend).
const env = import.meta.env as unknown as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(url && anon)
export const supabase: SupabaseClient | null = hasSupabase ? createClient(url!, anon!) : null
