import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import Dashboard from './Dashboard';
import { requestNotificationPermission } from './firebase';
import { logActivity } from './activityLogger';
import './index.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auto-detect system dark/light mode
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 1. Check if a session exists
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (initialSession) {
          // 2. Check if the profile is approved
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('status')
            .eq('id', initialSession.user.id)
            .maybeSingle();

          if (profile?.status === 'Approved') {
            setSession(initialSession);
            requestNotificationPermission(initialSession.user.id);
            logActivity(initialSession.user.id, 'login');
          }
        }
      } catch (err) {
        console.error("Critical Auth Error:", err);
      } finally {
        // THIS IS THE FIX: This line MUST run no matter what happens above
        setLoading(false); 
      }
    };

    initializeApp();

    // Listen for sign-in/out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // If someone logs out, we need to show the login screen
      if (!session) {
        setSession(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={fullPageCenter}>
        <div className="animate-pulse" style={loadingTextStyle}>
          GEEZ SCRIPT IS LOADING...
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      {!session ? <Login onLoginSuccess={(s) => {
        setSession(s);
        requestNotificationPermission(s.user.id);
        logActivity(s.user.id, 'login');
      }} /> : <Dashboard user={session.user} />}
    </div>
  );
}

const fullPageCenter = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-main)' };
const loadingTextStyle = { color: 'var(--primary)', fontWeight: '900', letterSpacing: '2px', fontFamily: "'Outfit', 'Inter', sans-serif" };

export default App;