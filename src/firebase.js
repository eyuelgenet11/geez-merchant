import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { supabase } from "./supabaseClient";

const firebaseConfig = {
  apiKey: "AIzaSyCJtJ30P0mlbxjG31Klc2qKhRoF9FkF_s4",
  authDomain: "geez-market.firebaseapp.com",
  projectId: "geez-market",
  storageBucket: "geez-market.firebasestorage.app",
  messagingSenderId: "1060637839102",
  appId: "1:1060637839102:web:f0247ee88ca5a3a29f9faf"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export const requestNotificationPermission = async (userId) => {
  try {
    // If already denied, don't trigger the browser warning by attempting to re-prompt.
    if (Notification.permission === 'denied') return;

    // Only request the prompt if state is 'default' (never asked).
    // If already 'granted', skip straight to getting the token.
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission === 'granted') {
      const currentToken = await getToken(messaging, {
        vapidKey: 'BHSg40OpeJCobX5bATPywZ8gBn2TR3DRP4CnaVevDnZDT3dHj7_cNk41NvzKALRndaKHi3CgGOWWhsFRh9bvQvg'
      });
      if (currentToken) {
        await saveTokenToSupabase(currentToken, userId);
      }
    }
  } catch (err) {
    // Silently ignore — notifications are non-critical.
    console.debug('Notification setup skipped:', err.message);
  }
};

const saveTokenToSupabase = async (token, userId) => {
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('user_devices')
      .upsert({
        user_id: userId,
        fcm_token: token,
        platform: 'web'
      }, { onConflict: 'fcm_token' });

    if (error) throw error;
    console.log('Token saved to Supabase successfully');
  } catch (error) {
    console.error('Error saving token to Supabase:', error.message);
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
