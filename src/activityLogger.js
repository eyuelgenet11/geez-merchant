import { supabase } from './supabaseClient';

/**
 * Logs an activity event to the activity_logs table.
 * Silently fails — never blocks the user flow.
 *
 * @param {string} userId    - auth.users UUID
 * @param {string} eventType - e.g. 'login', 'job_created', 'payment_submitted'
 * @param {object} metadata  - optional extra data (job id, lang pair, etc.)
 */
export const logActivity = async (userId, eventType, metadata = {}) => {
  if (!userId) return;
  try {
    await supabase.from('activity_logs').insert({
      user_id:    userId,
      user_type:  'translator',
      event_type: eventType,
      metadata,
    });
  } catch {
    // Silently ignore — logs are non-critical
  }
};
