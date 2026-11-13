// Supabase connection settings.
// The URL and anon key are safe to be public — Row Level Security in
// supabase/schema.sql is what protects the data.
// NEVER put the service_role key here.
//
// Values come from environment variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
// if set, otherwise from the fallbacks below.
const FALLBACK_URL = 'https://hwtivovryaotctipgikp.supabase.co'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3dGl2b3ZyeWFvdGN0aXBnaWtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MjgyODksImV4cCI6MjExMDEwNDI4OX0.UyNNetM4Aa3lr6JDxO-TE-KHfpKG5gkfh4ogd_6pd3k'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
