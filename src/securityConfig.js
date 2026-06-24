export function isApprovedTranslatorStatus(status) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'approved' || s === 'active';
}

export function isPendingTranslatorStatus(status) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'pending' || s === 'new';
}

export async function verifyTranslatorSession(supabase, session) {
  if (!session?.user) {
    return { ok: false, reason: 'no_session' };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !profile) {
    return { ok: false, reason: 'no_profile' };
  }

  if (profile.role !== 'translator') {
    return { ok: false, reason: 'not_translator' };
  }

  if (!isApprovedTranslatorStatus(profile.status)) {
    return {
      ok: false,
      reason: isPendingTranslatorStatus(profile.status) ? 'pending' : 'not_approved',
    };
  }

  return { ok: true, profile };
}
