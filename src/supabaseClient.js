import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pbzptliuiwbifbrizkoi.supabase.co'

const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBienB0bGl1aXdiaWZicml6a29pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTk4NTcsImV4cCI6MjA4NTE5NTg1N30.vK_FRa4P-kbdc7WtZ78RzLe7KFbZGlRs2bUyC9vy-ik'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})