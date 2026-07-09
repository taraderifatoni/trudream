// Shared Supabase client for client-side usage (browser)
// Uses NEXT_PUBLIC env vars — these are safe to expose in the browser.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bhrzwrvmcclggdxnubov.supabase.co'
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_x7n2-6TC0YTSuv4-Q-5Slg_Zs-adz5c'
