import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import Dashboard from './Dashboard';
import { requestNotificationPermission } from './firebase';
import { logActivity } from './activityLogger';
import { verifyTranslatorSession } from './securityConfig';
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
    let cancelled = false;

    // Step 1: Check for an existing session on page load / refresh.
    // Using getSession() here avoids the Supabase INITIAL_SESSION deadlock.
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!session) {
          setLoading(false);
          return;
        }

        const check = await verifyTranslatorSession(supabase, session);
        if (cancelled) return;

        if (check.ok) {
          setSession(session);
          requestNotificationPermission(session.user.id);
        } else {
          // Not an approved translator — sign them out cleanly
          await supabase.auth.signOut();
        }
      } catch (err) {
        console.error('Session init error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkInitialSession();

    // Step 2: React to subsequent auth events (login, logout, token refresh).
    // We deliberately skip INITIAL_SESSION here — it's handled above.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setLoading(false);
        } else if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          // Session already verified at login time; just update state.
          setSession(nextSession);
          setLoading(false);
        }
        // INITIAL_SESSION is intentionally ignored here.
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
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