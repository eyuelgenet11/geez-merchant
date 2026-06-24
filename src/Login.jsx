import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import {
  isApprovedTranslatorStatus,
  isPendingTranslatorStatus,
} from './securityConfig';
import {
  Mail, Loader2, Zap, KeyRound,
  ArrowLeft, ShieldCheck, AlertCircle,
  FileText, CheckSquare, Square, Building2, Clock
} from 'lucide-react';

const Login = ({ onLoginSuccess }) => {
  // 'login' | 'otp' | 'register'
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [otpSent, setOtpSent] = useState(false);

  // Shared field
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Register-only fields
  const [password, setPassword] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [license, setLicense] = useState(null);
  const languageOptions = ['Amharic', 'Oromo', 'Tigrinya', 'Somali', 'English', 'Arabic', 'French', 'Afar'];
  const categoryOptions = ['Legal', 'Medical', 'Business', 'Academic', 'Books'];
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);

  const toggleLanguage = (lang) => {
    setSelectedLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const toggleCategory = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // ── Step 1: send OTP ────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      const normalized = email.trim().toLowerCase();

      // Guard: make sure this email belongs to an approved translator
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('email', normalized)
        .maybeSingle();

      if (profileError || !profile) {
        setMsg({ type: 'error', text: 'No translator account found for this email.' });
        return;
      }
      if (profile.role !== 'translator') {
        setMsg({ type: 'error', text: 'Access denied. This portal is for approved professional translators only.' });
        return;
      }
      if (!isApprovedTranslatorStatus(profile.status)) {
        setMsg({
          type: 'pending',
          text: isPendingTranslatorStatus(profile.status)
            ? 'Verification pending: Your license is being reviewed (24–48 hours).'
            : 'Your translator account is not approved yet. Contact support if you need help.',
        });
        return;
      }

      // All good — send OTP
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;

      setOtpSent(true);
      setView('otp');
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Could not send verification code. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ──────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode.trim(),
        type: 'email',
      });
      if (verifyError) throw verifyError;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session could not be established after verification.');

      if (onLoginSuccess) onLoginSuccess(session);
    } catch (err) {
      setMsg({ type: 'error', text: 'Invalid or expired verification code. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ──────────────────────────────────────────────────────
  const handleResend = async () => {
    setLoading(true);
    setMsg({ type: '', text: '' });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setMsg({ type: 'pending', text: 'A new code has been sent to your email.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Could not resend code.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Register ────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    if (selectedLanguages.length === 0) {
      setMsg({ type: 'error', text: 'Please select at least one language.' });
      return;
    }
    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      let licenseUrl = '';
      if (license) {
        const fileExt = license.name.split('.').pop();
        const fileName = `${Date.now()}_license.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('licenses')
          .upload(fileName, license);
        if (uploadError) throw uploadError;
        licenseUrl = fileName;
      }

      let userId = null;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: officeName,
            office_name: officeName,
            office_address: officeAddress,
            role: 'translator',
          },
        },
      });

      if (authError) {
        if (authError.message.includes('User already registered') || authError.status === 400) {
          // User already exists (e.g. a mobile app customer applying as a translator).
          // We MUST sign them in first so subsequent profile updates are authenticated —
          // otherwise Supabase RLS will silently block setting role/status.
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          });
          if (signInError) {
            // Wrong password or some other auth issue
            throw new Error("Could not authenticate your existing account. Please check your password and try again.");
          }
          const existingProfile = signInData?.user;
          if (existingProfile) {
            // Fetch their current profile to check if they're already approved
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, status, role')
              .eq('id', existingProfile.id)
              .maybeSingle();
            if (profile?.role === 'translator' && profile?.status?.toLowerCase() === 'approved') {
              throw new Error("You are already an approved translator! Please go back and Login instead.");
            }
            userId = existingProfile.id;
          } else {
            throw new Error("Could not retrieve your account. Please contact support.");
          }
        } else {
          throw authError;
        }
      } else if (authData?.user) {
        userId = authData.user.id;
      }

      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([{
            id: userId,
            email: email.trim().toLowerCase(),
            full_name: officeName,
            office_name: officeName,
            office_address: officeAddress,
            languages: selectedLanguages,
            category: selectedCategories,
            license_url: licenseUrl,
            status: 'Pending',
            role: 'translator',
          }], { onConflict: 'id' });
        if (profileError) {
          console.error("Profile upsert error:", profileError);
          throw new Error("Your application was received but we couldn't save all details. Please contact support. Code: " + profileError.code);
        }
        // Sign out after registration so they must log in via the OTP flow
        await supabase.auth.signOut();
      }

      setIsSubmitted(true);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Application submitted screen ────────────────────────────────────
  if (isSubmitted) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={brandHeader}>
            <div style={{ ...brandSquare, background: '#f59e0b' }}>
              <Clock size={28} color="#fff" />
            </div>
            <h1 style={logoText}>APPLICATION PENDING</h1>
          </div>
          <div style={waitingBox}>
            <p style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#92400e', fontWeight: '700' }}>Success! Profile Created</p>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#a16207' }}>
              We have received the license for <strong>{officeName}</strong>.
              Our team will review your documents within 24-48 hours.
            </p>
          </div>
          <button onClick={() => { setIsSubmitted(false); setView('login'); }} style={secondaryBtn}>
            <ArrowLeft size={16} /> Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ── OTP entry screen ────────────────────────────────────────────────
  if (view === 'otp') {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, maxWidth: '420px' }}>
          <div style={brandHeader}>
            <div style={{ ...brandSquare, background: '#895129' }}>
              <KeyRound size={26} color="#fff" />
            </div>
            <h1 style={logoText}>GEEZ SCRIPT</h1>
            <p style={subtitleStyle}>Email Verification</p>
          </div>

          <p style={{ fontSize: '14px', color: '#525252', textAlign: 'center', marginBottom: '24px', lineHeight: '1.6' }}>
            A 6-digit verification code was sent to<br />
            <strong style={{ color: '#1a1a1a' }}>{email}</strong>
          </p>

          <form onSubmit={handleVerifyOtp} style={formStack}>
            <div style={inputGroup}>
              <label style={labelStyle}>Verification Code</label>
              <div style={inputWrapper}>
                <KeyRound size={16} style={iconStyle} />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value)}
                  style={{ ...inputField, letterSpacing: '0.3em', textAlign: 'center', fontSize: '20px', fontWeight: '800' }}
                  maxLength={8}
                  autoFocus
                  required
                />
              </div>
            </div>

            {msg.text && (
              <div style={statusBox(msg.type)}>
                {msg.type === 'error' ? <AlertCircle size={14} /> : <Clock size={14} />}
                <span>{msg.text}</span>
              </div>
            )}

            <button type="submit" style={primaryBtn(loading)} disabled={loading}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <><ShieldCheck size={16} /> Verify & Enter Dashboard</>}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              style={{ background: 'none', border: 'none', color: '#737373', fontSize: '13px', cursor: 'pointer' }}
            >
              Didn't receive it? Resend code
            </button>
            <button
              type="button"
              onClick={() => { setView('login'); setOtpCode(''); setMsg({ type: '', text: '' }); }}
              style={{ background: 'none', border: 'none', color: brandColor, fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
            >
              ← Back to email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main login / register form ──────────────────────────────────────
  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, maxWidth: view === 'login' ? '420px' : '520px' }}>
        <div style={brandHeader}>
          <div style={brandSquare}>
            <img src="/logo.png" alt="Geez Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '14px' }} />
          </div>
          <h1 style={logoText}>GEEZ SCRIPT</h1>
          <p style={subtitleStyle}>{view === 'login' ? 'Translator Portal' : 'Apply for Professional Access'}</p>
        </div>

        <form onSubmit={view === 'login' ? handleSendOtp : handleRegister} style={formStack}>

          {/* Register-only top fields */}
          {view === 'register' && (
            <>
              <div style={inputGroup}>
                <label style={labelStyle}>Office / Business Name</label>
                <div style={inputWrapper}>
                  <Building2 size={16} style={iconStyle} />
                  <input type="text" placeholder="Addis Translation Hub" value={officeName} onChange={e => setOfficeName(e.target.value)} style={inputField} required />
                </div>
              </div>
              <div style={inputGroup}>
                <label style={labelStyle}>Physical Office Address</label>
                <div style={inputWrapper}>
                  <Building2 size={16} style={iconStyle} />
                  <input type="text" placeholder="Bole, Medhanialem Mall, Floor 3" value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} style={inputField} required />
                </div>
              </div>
            </>
          )}

          {/* Email field — shared */}
          <div style={inputGroup}>
            <label style={labelStyle}>Email Address</label>
            <div style={inputWrapper}>
              <Mail size={16} style={iconStyle} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputField} placeholder="your@email.com" required />
            </div>
          </div>

          {/* Password — register only */}
          {view === 'register' && (
            <div style={inputGroup}>
              <label style={labelStyle}>Set a Password</label>
              <div style={inputWrapper}>
                <Zap size={16} style={iconStyle} />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputField} required />
              </div>
            </div>
          )}

          {/* Register-only bottom fields */}
          {view === 'register' && (
            <>
              <div style={inputGroup}>
                <label style={labelStyle}>Business License (PDF/JPG)</label>
                <div style={inputWrapper}>
                  <FileText size={16} style={iconStyle} />
                  <input type="file" onChange={e => setLicense(e.target.files[0])} style={{ ...inputField, paddingLeft: '42px', paddingTop: '10px' }} required />
                </div>
              </div>

              <div style={inputGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={labelStyle}>Translation Languages</label>
                  <button type="button" onClick={() => setSelectedLanguages(selectedLanguages.length === languageOptions.length ? [] : [...languageOptions])} style={{ ...textBtn, fontSize: '11px', marginTop: 0 }}>
                    {selectedLanguages.length === languageOptions.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={checkboxGrid}>
                  {languageOptions.map(lang => (
                    <div key={lang} onClick={() => toggleLanguage(lang)} style={checkboxItem}>
                      {selectedLanguages.includes(lang) ? <CheckSquare size={16} color={brandColor} /> : <Square size={16} color="#d1d5db" />}
                      <span style={{ fontSize: '13px', color: '#374151' }}>{lang}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={inputGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={labelStyle}>Expertise / Specifications</label>
                  <button type="button" onClick={() => setSelectedCategories(selectedCategories.length === categoryOptions.length ? [] : [...categoryOptions])} style={{ ...textBtn, fontSize: '11px', marginTop: 0 }}>
                    {selectedCategories.length === categoryOptions.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={checkboxGrid}>
                  {categoryOptions.map(cat => (
                    <div key={cat} onClick={() => toggleCategory(cat)} style={checkboxItem}>
                      {selectedCategories.includes(cat) ? <CheckSquare size={16} color={brandColor} /> : <Square size={16} color="#d1d5db" />}
                      <span style={{ fontSize: '13px', color: '#374151' }}>{cat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {msg.text && (
            <div style={statusBox(msg.type)}>
              {msg.type === 'error' ? <AlertCircle size={14} /> : <Clock size={14} />}
              <span>{msg.text}</span>
            </div>
          )}

          <button type="submit" style={primaryBtn(loading)} disabled={loading}>
            {loading
              ? <Loader2 size={18} className="animate-spin" />
              : view === 'login'
                ? <><Mail size={16} /> Send Verification Code</>
                : 'Submit Application'}
          </button>
        </form>

        <div style={toggleArea}>
          <button onClick={() => { setView(view === 'login' ? 'register' : 'login'); setMsg({ type: '', text: '' }); }} style={textBtn}>
            {view === 'login' ? 'Register New Office' : 'Back to Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────
const brandColor = '#895129';
const containerStyle = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #FDFBFA 0%, #F4EFEA 100%)', fontFamily: "'Outfit', 'Inter', sans-serif", padding: '20px' };
const cardStyle = { background: '#fff', padding: '40px', borderRadius: '24px', border: '1px solid rgba(137,81,41,0.1)', width: '100%', boxShadow: '0 25px 50px -12px rgba(137, 81, 41, 0.12)' };
const brandHeader = { textAlign: 'center', marginBottom: '24px' };
const brandSquare = { width: '56px', height: '56px', background: '#fff', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', padding: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.07)' };
const logoText = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#1a1a1a' };
const subtitleStyle = { color: '#737373', fontSize: '11px', marginTop: '4px', textTransform: 'uppercase', fontWeight: '700' };
const formStack = { display: 'flex', flexDirection: 'column', gap: '16px' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '6px' };
const labelStyle = { fontSize: '11px', fontWeight: '800', color: '#737373', textTransform: 'uppercase' };
const inputWrapper = { position: 'relative', display: 'flex', alignItems: 'center' };
const iconStyle = { position: 'absolute', left: '14px', color: '#a3a3a3' };
const inputField = { width: '100%', padding: '12px 12px 12px 42px', borderRadius: '10px', border: '1px solid #eee', fontSize: '14px', background: '#f9f9f9', outline: 'none', boxSizing: 'border-box' };
const checkboxGrid = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', background: '#f9f9f9', padding: '12px', borderRadius: '10px', border: '1px solid #eee' };
const checkboxItem = { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' };
const primaryBtn = (loading) => ({ width: '100%', padding: '14px', background: loading ? '#d4d4d4' : brandColor, color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: loading ? 'none' : '0 10px 20px rgba(137,81,41,0.2)' });
const secondaryBtn = { width: '100%', padding: '12px', background: '#fff', color: brandColor, border: `1px solid ${brandColor}`, borderRadius: '12px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const waitingBox = { background: '#fffbeb', padding: '20px', borderRadius: '16px', border: '1px solid #fef3c7', marginBottom: '20px' };
const statusBox = (type) => ({ padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', background: type === 'error' ? '#fef2f2' : '#fffbeb', color: type === 'error' ? '#b91c1c' : '#b45309', border: `1px solid ${type === 'error' ? '#fee2e2' : '#fef3c7'}` });
const toggleArea = { textAlign: 'center', marginTop: '20px' };
const textBtn = { background: 'none', border: 'none', color: brandColor, fontSize: '13px', fontWeight: '700', cursor: 'pointer' };

export default Login;