/**
 * useNotifications - Shared hook for real-time toast notifications
 * Works in both the Admin and Translator dashboards.
 * Uses the Web Audio API to play a chime with NO external dependencies.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// --- Web Audio chime (no external files needed) ---
function playChime(type = 'notify') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Two-tone success chime: C5 then E5
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else {
      // Single notification ping
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    console.warn('Audio not available:', e);
  }
}

// --- Browser Notification API helper ---
function sendBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'geez-update',
      renotify: true,
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    });
  }
}

export function useNotifications() {
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const addToast = useCallback((title, message, type = 'info') => {
    const id = ++toastId.current;

    // Play sound
    playChime(type === 'success' ? 'success' : 'notify');

    // Browser-level notification (visible even if tab is in background)
    sendBrowserNotification(title, message);

    // In-app toast
    setToasts((prev) => [...prev, { id, title, message, type }]);

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return { toasts, addToast, dismiss };
}

// --- Toast UI Component ---
export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={containerStyle}>
      {toasts.map((toast) => (
        <div key={toast.id} style={toastStyle(toast.type)}>
          <div style={toastIconStyle(toast.type)}>
            {toast.type === 'success' ? '✓' : toast.type === 'warning' ? '!' : '🔔'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={toastTitle}>{toast.title}</div>
            <div style={toastMsg}>{toast.message}</div>
          </div>
          <button onClick={() => onDismiss(toast.id)} style={closeBtn}>×</button>
        </div>
      ))}
    </div>
  );
}

// --- Styles ---
const containerStyle = {
  position: 'fixed',
  top: '20px',
  right: '20px',
  zIndex: 99999,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxWidth: '380px',
  width: '100%',
};

const toastStyle = (type) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '14px',
  background: type === 'success' ? '#f0fdf4' : type === 'warning' ? '#fffbeb' : '#fff',
  border: `1px solid ${type === 'success' ? '#86efac' : type === 'warning' ? '#fde68a' : '#e5e7eb'}`,
  borderLeft: `4px solid ${type === 'success' ? '#16a34a' : type === 'warning' ? '#d97706' : '#895129'}`,
  borderRadius: '14px',
  padding: '16px 18px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  animation: 'slideIn 0.3s ease',
});

const toastIconStyle = (type) => ({
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  background: type === 'success' ? '#16a34a' : type === 'warning' ? '#d97706' : '#895129',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 'bold',
  fontSize: '16px',
  flexShrink: 0,
});

const toastTitle = {
  fontWeight: '800',
  fontSize: '14px',
  color: '#111',
  marginBottom: '4px',
};

const toastMsg = {
  fontSize: '13px',
  color: '#555',
  lineHeight: '1.4',
};

const closeBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '20px',
  color: '#999',
  lineHeight: 1,
  padding: '0 4px',
  flexShrink: 0,
};
