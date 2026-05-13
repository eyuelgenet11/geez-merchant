import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  Mail, Lock, Loader2, Zap, 
  ArrowLeft, ShieldCheck, AlertCircle, 
  FileText, CheckSquare, Square, Building2, Clock
} from 'lucide-react';

const Login = ({ onLoginSuccess }) => {
  const [view, setView] = useState('login'); 
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false); 
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [email, setEmail] = useState('');
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) throw error;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.role !== 'translator') {
        await supabase.auth.signOut();
        setMsg({ type: 'error', text: 'Access Denied: Translators only.' });
        return;
      }

      if (profile?.status !== 'Approved') {
        setMsg({ 
          type: 'pending', 
          text: 'Verification Pending: Your license is currently being reviewed.' 
        });
        return;
      }

      if (onLoginSuccess) onLoginSuccess(data.session);
    } catch (err) {
      setMsg({ type: 'error', text: 'Credentials invalid or account not found.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (selectedLanguages.length === 0) {
      setMsg({ type: 'error', text: 'Please select at least one language.' });
      return;
    }
    setLoading(true);

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

      // --- UPDATED SIGNUP WITH METADATA ---
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: officeName, 
            office_name: officeName,
            office_address: officeAddress,
            role: 'translator'
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // --- UPDATED PROFILE INSERT ---
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([
            {
              id: authData.user.id,
              email: email.trim(),
              full_name: officeName, 
              office_name: officeName,
              office_address: officeAddress,
              languages: selectedLanguages,
              category: selectedCategories, 
              license_url: licenseUrl, 
              status: 'Pending', 
              role: 'translator'
            }
          ], { onConflict: 'id' });

        if (profileError) throw profileError;
      }

      setIsSubmitted(true);

    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // UI RENDER LOGIC
  if (isSubmitted) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={brandHeader}>
             <div style={{...brandSquare, background: '#f59e0b'}}>
                <Clock size={28} color="#fff" />
             </div>
             <h1 style={logoText}>APPLICATION PENDING</h1>
          </div>
          <div style={waitingBox}>
            <p style={{margin: '0 0 10px 0', fontSize: '15px', color: '#92400e', fontWeight: '700'}}>Success! Profile Created</p>
            <p style={{margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#a16207'}}>
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

  return (
    <div style={containerStyle}>
      <div style={{...cardStyle, maxWidth: view === 'login' ? '420px' : '520px'}}>
        <div style={brandHeader}>
          <div style={brandSquare}><img src="/logo.png" alt="Geez Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '14px' }} /></div>
          <h1 style={logoText}>GEEZ SCRIPT</h1>
          <p style={subtitleStyle}>{view === 'login' ? 'Translator Portal' : 'Apply for Professional Access'}</p>
        </div>

        <form onSubmit={view === 'login' ? handleLogin : handleRegister} style={formStack}>
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

          <div style={inputGroup}>
            <label style={labelStyle}>Email Address</label>
            <div style={inputWrapper}>
              <Mail size={16} style={iconStyle} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputField} required />
            </div>
          </div>

          <div style={inputGroup}>
            <label style={labelStyle}>Password</label>
            <div style={inputWrapper}>
              <Lock size={16} style={iconStyle} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputField} required />
            </div>
          </div>

          {view === 'register' && (
            <>
              <div style={inputGroup}>
                <label style={labelStyle}>Business License (PDF/JPG)</label>
                <div style={inputWrapper}>
                  <FileText size={16} style={iconStyle} />
                  <input type="file" onChange={e => setLicense(e.target.files[0])} style={{...inputField, paddingLeft: '42px', paddingTop: '10px'}} required />
                </div>
              </div>
              <div style={inputGroup}>
                <label style={labelStyle}>Translation Languages</label>
                <div style={checkboxGrid}>
                  {languageOptions.map(lang => (
                    <div key={lang} onClick={() => toggleLanguage(lang)} style={checkboxItem}>
                      {selectedLanguages.includes(lang) ? <CheckSquare size={16} color={brandColor} /> : <Square size={16} color="#d1d5db" />}
                      <span style={{fontSize: '13px', color: '#374151'}}>{lang}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={inputGroup}>
                <label style={labelStyle}>Expertise / Specifications</label>
                <div style={checkboxGrid}>
                  {categoryOptions.map(cat => (
                    <div key={cat} onClick={() => toggleCategory(cat)} style={checkboxItem}>
                      {selectedCategories.includes(cat) ? <CheckSquare size={16} color={brandColor} /> : <Square size={16} color="#d1d5db" />}
                      <span style={{fontSize: '13px', color: '#374151'}}>{cat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <button type="submit" style={primaryBtn(loading)} disabled={loading}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : view === 'login' ? 'Enter Dashboard' : 'Submit Application'}
          </button>
        </form>

        {msg.text && (
          <div style={statusBox(msg.type)}>
            {msg.type === 'error' ? <AlertCircle size={14} /> : <Clock size={14} />}
            <span>{msg.text}</span>
          </div>
        )}

        <div style={toggleArea}>
          <button onClick={() => setView(view === 'login' ? 'register' : 'login')} style={textBtn}>
            {view === 'login' ? "Register New Office" : "Back to Login"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Styles
const brandColor = '#78350f';
const containerStyle = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fcfcfc', fontFamily: 'Inter, sans-serif', padding: '20px' };
const cardStyle = { background: '#fff', padding: '40px', borderRadius: '24px', border: '1px solid #eee', width: '100%', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.04)' };
const brandHeader = { textAlign: 'center', marginBottom: '24px' };
const brandSquare = { width: '56px', height: '56px', background: '#fff', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', padding: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' };
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
const primaryBtn = (loading) => ({ width: '100%', padding: '14px', background: loading ? '#d4d4d4' : brandColor, color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' });
const secondaryBtn = { width: '100%', padding: '12px', background: '#fff', color: brandColor, border: `1px solid ${brandColor}`, borderRadius: '12px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const waitingBox = { background: '#fffbeb', padding: '20px', borderRadius: '16px', border: '1px solid #fef3c7', marginBottom: '20px' };
const statusBox = (type) => ({ marginTop: '16px', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', background: type === 'error' ? '#fef2f2' : '#fffbeb', color: type === 'error' ? '#b91c1c' : '#b45309', border: `1px solid ${type === 'error' ? '#fee2e2' : '#fef3c7'}` });
const toggleArea = { textAlign: 'center', marginTop: '20px' };
const textBtn = { background: 'none', border: 'none', color: brandColor, fontSize: '13px', fontWeight: '700', cursor: 'pointer' };

export default Login;