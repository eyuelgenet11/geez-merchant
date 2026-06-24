import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { useNotifications, ToastContainer } from './useNotifications';
import JobDetailsModal from './JobDetailsModal';
import {
  LayoutDashboard, Search, FolderOpen,
  TrendingUp, LogOut, Zap, Clock, ShieldCheck,
  Wallet, OctagonX, CircleCheckBig, RefreshCw, User, Download, ExternalLink,
  BookOpen, ChevronDown, ChevronRight, Banknote, CalendarCheck
} from 'lucide-react';
import { requestNotificationPermission, subscribeFCMMessages } from './firebase';

const Dashboard = ({ user }) => {
  const { toasts, addToast, dismiss } = useNotifications();
  const [jobs, setJobs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [activeView, setActiveView] = useState('Overview');
  const [selectedJob, setSelectedJob] = useState(null);
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState(null);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, office_name')
      .eq('id', user.id)
      .single();
    if (!error) setProfile(data);
  }, [user?.id]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.href = '/';
    } catch (err) {
      console.error("Logout error:", err.message);
    }
  };

  const fetchMyJobs = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Only fetch ACTIVE (unsettled) jobs for the workspace view
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('translator_id', user.id)
        .or('settled.is.null,settled.eq.false')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (err) {
      console.error("Fetch error:", err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchLedger = useCallback(async () => {
    if (!user?.id) return;
    setLedgerLoading(true);
    try {
      // Fetch all settled jobs for this translator
      const [jobsRes, reportsRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, from_lang, to_lang, price, z_report_id, created_at')
          .eq('translator_id', user.id)
          .eq('settled', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('z_reports')
          .select('id, report_date, net_payout, jobs_count, total_volume')
          .order('report_date', { ascending: false })
      ]);

      const settledJobs = jobsRes.data || [];
      const reports = reportsRes.data || [];

      // Group settled jobs under their Z-Report period
      const grouped = reports
        .map(r => ({
          ...r,
          jobs: settledJobs.filter(j => j.z_report_id === r.id)
        }))
        .filter(r => r.jobs.length > 0);

      // Also include settled jobs not linked to any report (edge case)
      const unlinked = settledJobs.filter(j => !j.z_report_id);
      if (unlinked.length > 0) {
        grouped.push({
          id: 'unlinked',
          report_date: null,
          net_payout: unlinked.reduce((s, j) => s + ((Number(j.price) || 0) / 1.15), 0),
          jobs_count: unlinked.length,
          jobs: unlinked
        });
      }

      setLedgerEntries(grouped);
    } catch (err) {
      console.error("Ledger fetch error:", err.message);
    } finally {
      setLedgerLoading(false);
    }
  }, [user?.id]);

  const notifySystem = useCallback((title, body) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "denied" && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchMyJobs();
    fetchLedger();

    // Channel 1: Watch for any job changes (status updates, new quotes etc.)
    const jobChannel = supabase
      .channel(`db_sync_${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs', filter: `translator_id=eq.${user.id}` },
        (payload) => {
          fetchMyJobs();
          const title = '🆕 New Job Assigned!';
          const body = `You have a new translation request: ${payload.new?.from_lang} → ${payload.new?.to_lang}. Open your portal to review and send a quote.`;
          addToast(title, body, 'info');
          notifySystem(title, body);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `translator_id=eq.${user.id}` },
        (payload) => {
          const status = (payload.new?.status || '').toLowerCase();
          if (payload.new?.settled === true && payload.old?.settled !== true) {
            fetchMyJobs();
            fetchLedger();
            addToast('💰 Payment Settled!', `The admin has settled your earnings. Check your Ledger for details.`, 'success');
          } else {
            fetchMyJobs();
            if (status === 'awaiting verification') {
              const title = '💳 Client Paid';
              const body = `A client has uploaded their payment receipt and is awaiting your verification.`;
              addToast(title, body, 'warning');
              notifySystem(title, body);
            } else if (status === 'revision_requested') {
              const title = '✏️ Revision Requested';
              const body = `A client has requested changes to their translation. Please review their feedback.`;
              addToast(title, body, 'warning');
              notifySystem(title, body);
            } else if (status === 'in progress') {
              addToast('⚡ Job Activated', `Admin approved the payment. You can now start translating.`, 'success');
            } else if (status === 'completed') {
              addToast('✅ Job Complete', `This job has been marked as completed.`, 'success');
            }
          }
        }
      )
      .subscribe();

    // Channel 2: Watch for new Z-Reports (admin closing period for this translator)
    const reportChannel = supabase
      .channel(`z_report_sync_${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'z_reports' },
        () => {
          // A new Z-Report was generated — refresh both views
          fetchMyJobs();
          fetchLedger();
        }
      )
      .subscribe();

    // Foreground FCM notification listener (persistent, with proper cleanup)
    const unsubscribeFCM = subscribeFCMMessages((payload) => {
      addToast(
        payload.notification?.title || 'Notification',
        payload.notification?.body || '',
        'info'
      );
    });

    if (user?.id) requestNotificationPermission(user.id);

    return () => {
      supabase.removeChannel(jobChannel);
      supabase.removeChannel(reportChannel);
      if (typeof unsubscribeFCM === 'function') unsubscribeFCM();
    };
  }, [user?.id, fetchMyJobs, fetchProfile, fetchLedger]);

  const handleTelebirrSearch = (ref) => {
    if (!ref) return;
    window.open(`https://transactioninfo.ethiotelecom.et/receipt/${ref}`, '_blank');
  };

  // --- UPDATED CALCULATED STATS (Synced with Flutter) ---
  const stats = useMemo(() => {
    // We normalize to lowercase to prevent "pending" vs "Pending" mismatches
    const normalize = (s) => s?.toLowerCase() || '';

    return {
      // In Queue: Statuses sent by mobile before processing starts (Pending for quote)
      pending: jobs.filter(j =>
        ['pending', 'quoted', 'new'].includes(normalize(j.status))
      ).length,

      // Awaiting Payment: Jobs where customer needs to pay/admin needs to verify
      awaitingPayment: jobs.filter(j =>
        ['awaiting payment', 'awaiting verification'].includes(normalize(j.status))
      ).length,

      // Active: Jobs currently being worked on (Payment verified)
      activeJobs: jobs.filter(j =>
        ['in progress', 'accepted'].includes(normalize(j.status))
      ),

      completed: jobs.filter(j => normalize(j.status) === 'completed').length,

      // Earnings from completed jobs
      earnings: jobs
        .filter(j => normalize(j.status) === 'completed')
        .reduce((acc, curr) => acc + (Number(curr.price) || 0), 0)
    };
  }, [jobs]);

  // --- UPDATED SEARCH & FILTER ---
  const filteredJobs = jobs.filter(j => {
    const matchesFilter = filter === 'All' || j.status === filter;
    // Mobile app now sends title, but we provide a fallback for safety
    const displayTitle = j.title || `${j.from_lang} to ${j.to_lang}`;
    const matchesSearch = displayTitle.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div style={layout}>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <aside style={sidebar}>
        <div>
          <div style={logoSection}>
            <div style={brandSquare}><img src="/logo.png" alt="Geez Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '4px' }} /></div>
            <span style={logoText}>GEEZ SCRIPT</span>
          </div>
          <div style={userBrief}>
            <div style={avatarCircle}><User size={16} color={brandColor} /></div>
            <div>
              <div style={userName}>{profile?.full_name || profile?.office_name || "Expert"}</div>
              <div style={userRole}>Professional Translator</div>
            </div>
          </div>
          <nav style={navStack}>
            <NavBtn icon={<LayoutDashboard size={18} />} label="Overview" active={activeView === 'Overview'} onClick={() => setActiveView('Overview')} />
            <NavBtn icon={<FolderOpen size={18} />} label="My Projects" active={activeView === 'Projects'} onClick={() => setActiveView('Projects')} />
            <NavBtn icon={<TrendingUp size={18} />} label="Earnings" active={activeView === 'Earnings'} onClick={() => setActiveView('Earnings')} />
            <NavBtn icon={<BookOpen size={18} />} label="Ledger" active={activeView === 'Ledger'} onClick={() => { setActiveView('Ledger'); fetchLedger(); }} />
            <NavBtn icon={<ShieldCheck size={18} />} label="Verification Kit" active={activeView === 'Verification'} onClick={() => setActiveView('Verification')} />
          </nav>
        </div>
        <div style={sidebarFooter}>
          <button onClick={handleLogout} style={logoutBtn}><LogOut size={18} /> <span style={{ fontWeight: '700' }}>Sign Out</span></button>
        </div>
      </aside>

      <main style={main}>
        <header style={header}>
          <div style={searchBox}>
            <Search size={16} color="#737373" />
            <input style={input} placeholder="Search jobs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={liveBadge}>Live Sync Active</div>
            <button onClick={fetchMyJobs} style={iconBtn}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </header>

        <section style={content}>
          {activeView === 'Overview' && (
            <>
              <div style={statGrid}>
                <StatCard icon={<Clock />} label="In Queue" value={stats.pending} color={brandColor} />
                <StatCard icon={<Wallet />} label="Pending Payment" value={stats.awaitingPayment} color="#b45309" />
                <StatCard icon={<Zap />} label="Active Tasks" value={stats.activeJobs.length} color="#1d4ed8" />
              </div>
              <div style={activeTasksContainer}>
                <h3 style={sectionLabel}>Live Tasks ({stats.activeJobs.length})</h3>
                <div style={taskStripList}>
                  {stats.activeJobs.map(task => (
                    <div key={task.id} style={taskStrip} onClick={() => setSelectedJob(task)}>
                      <div style={dotPulse} />
                      <span style={taskTitle}>{task.title || `${task.from_lang} to ${task.to_lang}`}</span>
                      <span style={taskStatusPill}>{task.status}</span>
                    </div>
                  ))}
                  {stats.activeJobs.length === 0 && <p style={emptyText}>No active tasks currently</p>}
                </div>
              </div>
            </>
          )}

          {(activeView === 'Overview' || activeView === 'Projects') && (
            <div style={tableCard}>
              <div style={tableHeader}>
                <h3 style={cardTitle}>Project & Payment Audit</h3>
                <div style={pillBox}>
                  {['All', 'pending', 'Awaiting Payment', 'In Progress', 'Completed'].map(t => (
                    <button key={t} onClick={() => setFilter(t)} style={filterPill(filter === t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={tableWrapper}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={trHead}>
                      <th style={th}>Project</th>
                      <th style={th}>Verification</th>
                      <th style={th}>Status</th>
                      <th style={{ ...th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map(job => (
                      <tr key={job.id} style={trStyle}>
                        <td style={td}>
                                <div style={pTitle}>{job.title || `${job.from_lang} → ${job.to_lang}`}</div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                  <div style={{ fontSize: '12px', color: brandColor, fontWeight: '700' }}>{job.price ? Number(job.price).toLocaleString(undefined, {maximumFractionDigits: 2}) : 0} ETB</div>
                                  {job.urgency && job.urgency !== 'Normal' && (
                                    <div style={{ 
                                      fontSize: '9px', 
                                      background: job.urgency === 'Rush' ? '#fef2f2' : '#fffbeb', 
                                      color: job.urgency === 'Rush' ? '#b91c1c' : '#b45309', 
                                      padding: '2px 8px', 
                                      borderRadius: '10px', 
                                      fontWeight: '900',
                                      border: `1px solid ${job.urgency === 'Rush' ? '#fecaca' : '#fde68a'}`
                                    }}>
                                      ⚡ {job.urgency.toUpperCase()}
                                    </div>
                                  )}
                                </div>
                        </td>
                        <td style={td}>
                          {job.verification_id ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <div style={{ 
                                background: '#fffbeb', 
                                border: `1px solid ${brandColor}`, 
                                padding: '4px 8px', 
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '900',
                                color: brandColor
                              }}>
                                {job.verification_id}
                              </div>
                              <button 
                                onClick={() => {
                                  if (navigator.clipboard) {
                                    navigator.clipboard.writeText(job.verification_id)
                                      .then(() => alert("Verification ID copied!"))
                                      .catch(err => console.error("Copy failed", err));
                                  }
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#737373' }}
                                title="Copy ID"
                              >
                                <Zap size={14} />
                              </button>
                            </div>
                          ) : job.transaction_ref ? (
                            <a 
                              href={`https://transactioninfo.ethiotelecom.et/receipt/${job.transaction_ref}`} 
                              target="_blank" 
                              rel="noreferrer"
                              style={{ 
                                fontSize: '11px', 
                                color: '#0067b8', 
                                fontWeight: '700', 
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <ExternalLink size={10} /> {job.transaction_ref}
                            </a>
                          ) : <span style={{ color: '#a3a3a3' }}>No Ref</span>}
                        </td>
                        <td style={td}><StatusTag status={job.status} /></td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button onClick={() => setSelectedJob(job)} style={actionBtn}>View Portal</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === 'Verification' && (
            <div style={{ maxWidth: '800px', margin: '0 auto', animation: 'fadeIn 0.5s ease' }}>
              <div style={{ background: '#fff', borderRadius: '24px', padding: '40px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #F4EFEA' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#FDFBFA', padding: '8px 16px', borderRadius: 'full', border: '1px solid #895129/20', marginBottom: '24px' }}>
                  <ShieldCheck size={16} color="#895129" />
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '900', color: '#895129', letterSpacing: '1px' }}>Official Verification Kit</span>
                </div>
                <h2 style={{ fontSize: '32px', fontFamily: 'serif', fontWeight: 'bold', color: '#895129', marginBottom: '16px' }}>Portal Verification QR</h2>
                <p style={{ color: '#737373', fontSize: '14px', maxWidth: '500px', margin: '0 auto 32px auto', lineHeight: '1.6' }}>
                  Download and place this QR code on the footer of every translated document. Scanning this will lead clients directly to the Geez Script Verification Portal.
                </p>
                
                <div style={{ position: 'relative', display: 'inline-block', padding: '20px', background: '#F4EFEA', borderRadius: '32px' }}>
                  <img 
                    src="/qr_verification.png" 
                    alt="Official QR Code" 
                    style={{ width: '200px', height: '200px', borderRadius: '16px', border: '2px solid white', boxShadow: '0 8px 30px rgba(137,81,41,0.1)' }}
                  />
                </div>

                <div style={{ marginTop: '40px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
                  <a 
                    href="/qr_verification.png" 
                    download="Geez_Script_Verification_QR.png"
                    style={{ background: '#895129', color: 'white', padding: '12px 32px', borderRadius: '50px', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Download size={18} /> Download Asset
                  </a>
                  <button 
                    onClick={() => window.open('http://localhost:3000', '_blank')}
                    style={{ background: 'white', border: '2px solid #895129', color: '#895129', padding: '12px 32px', borderRadius: '50px', fontWeight: 'bold' }}
                  >
                    Open Portal
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
                 <div style={{ background: '#fff', padding: '24px', borderRadius: '20px' }}>
                    <h4 style={{ fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', marginBottom: '12px' }}>Instructions</h4>
                    <p style={{ fontSize: '12px', color: '#737373', lineHeight: '1.5' }}>
                      Place the QR code in a clear, visible location on your translation. Verifiers will scan this to access the portal and then enter the unique Ref Number you provide.
                    </p>
                 </div>
                 <div style={{ background: '#fff', padding: '24px', borderRadius: '20px' }}>
                    <h4 style={{ fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', marginBottom: '12px' }}>portal URL</h4>
                    <code style={{ fontSize: '12px', background: '#F4EFEA', padding: '4px 8px', borderRadius: '6px', color: '#895129' }}>http://localhost:3000</code>
                 </div>
              </div>
            </div>
          )}

          {activeView === 'Earnings' && (
            <div style={tableCard}>
              <div style={tableHeader}><h3 style={cardTitle}>Financial Statement</h3></div>
              <div style={{ padding: '80px', textAlign: 'center' }}>
                <div style={balanceMain}>{stats.earnings.toLocaleString()} ETB</div>
                <p style={{ color: 'var(--text-dim)', fontSize: '18px', marginTop: '10px' }}>Active Unsettled Earnings</p>
                <div style={verifiedBadge}><CircleCheckBig size={16} /> Secured — awaiting next settlement</div>
              </div>
            </div>
          )}

          {/* ================================================
              LEDGER TAB
              ================================================ */}
          {activeView === 'Ledger' && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(137,81,41,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={24} color="var(--primary)" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Settlement Ledger</h2>
                  <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '13px' }}>All completed jobs settled by the admin appear here.</p>
                </div>
                <button onClick={fetchLedger} style={{ ...actionBtn, marginLeft: 'auto' }}>
                  <RefreshCw size={14} className={ledgerLoading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {ledgerLoading && (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)' }}>
                  <RefreshCw size={28} className="animate-spin" style={{ marginBottom: '12px', color: 'var(--primary)' }} />
                  <p style={{ margin: 0, fontWeight: '700' }}>Loading ledger...</p>
                </div>
              )}

              {!ledgerLoading && ledgerEntries.length === 0 && (
                <div style={{ ...tableCard, padding: '60px', textAlign: 'center' }}>
                  <BookOpen size={48} color="var(--border)" style={{ marginBottom: '16px' }} />
                  <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontWeight: '800' }}>No Settled Records Yet</h3>
                  <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '14px', maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto' }}>
                    When the Admin closes the day and generates a Z-Report, your completed jobs will be archived here automatically.
                  </p>
                </div>
              )}

              {!ledgerLoading && ledgerEntries.map((period) => (
                <div key={period.id} style={{ ...tableCard, marginBottom: '16px' }}>
                  {/* Period Header */}
                  <div
                    onClick={() => setExpandedPeriod(expandedPeriod === period.id ? null : period.id)}
                    style={{
                      padding: '20px 28px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      cursor: 'pointer',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: expandedPeriod === period.id ? 'var(--border)' : 'transparent',
                      transition: '0.2s'
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(137,81,41,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CalendarCheck size={20} color="var(--primary)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '900', fontSize: '15px', color: 'var(--text-main)' }}>
                        {period.report_date
                          ? new Date(period.report_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                          : 'Legacy Settled Jobs'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px', fontWeight: '600' }}>
                        {period.jobs.length} job{period.jobs.length !== 1 ? 's' : ''} settled
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '900', fontSize: '18px', color: 'var(--primary)' }}>
                        {Number(period.net_payout || period.jobs.reduce((s, j) => s + ((Number(j.price) || 0) / 1.15), 0)).toLocaleString(undefined, {maximumFractionDigits: 2})} ETB
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '700', marginTop: '2px' }}>NET PAYOUT</div>
                    </div>
                    <div style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                      {expandedPeriod === period.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>

                  {/* Expanded Jobs List */}
                  {expandedPeriod === period.id && (
                    <div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={trHead}>
                            <th style={th}>Project</th>
                            <th style={th}>Languages</th>
                            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {period.jobs.map((job, i) => (
                            <tr key={job.id} style={{ ...trStyle, background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                              <td style={td}>
                                <div style={pTitle}>{job.title || `${job.from_lang} → ${job.to_lang}`}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>
                                  {new Date(job.created_at).toLocaleDateString()}
                                </div>
                              </td>
                              <td style={td}>
                                <span style={{ background: 'rgba(137,81,41,0.08)', color: 'var(--primary)', padding: '4px 12px', borderRadius: 'var(--radius-full)', fontSize: '12px', fontWeight: '800' }}>
                                  {job.from_lang} → {job.to_lang}
                                </span>
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <div style={{ fontWeight: '900', fontSize: '15px', color: 'var(--text-main)' }}>
                                  {Number(job.price || 0).toLocaleString(undefined, {maximumFractionDigits: 2})} ETB
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: 'var(--bg-main)', borderTop: '2px solid var(--border)' }}>
                            <td colSpan={2} style={{ ...td, fontWeight: '900', fontSize: '13px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              Settlement Total
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: '900', fontSize: '18px', color: 'var(--primary)' }}>
                              {period.jobs.reduce((s, j) => s + ((Number(j.price) || 0) / 1.15), 0).toLocaleString(undefined, {maximumFractionDigits: 2})} ETB
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {selectedJob && <JobDetailsModal job={selectedJob} isOpen={true} onClose={() => setSelectedJob(null)} onRefresh={fetchMyJobs} />}
    </div>
  );
};

// --- HELPER COMPONENTS ---
const NavBtn = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} style={active ? navActive : navPassive}>{icon} <span>{label}</span></button>
);

const StatCard = ({ icon, label, value, color }) => (
  <div style={statCardStyle}>
    <div style={{ ...iconBox, background: `${color}10`, color: color }}>{icon}</div>
    <div><div style={statLabel}>{label}</div><div style={statValueSmall}>{value}</div></div>
  </div>
);

const StatusTag = ({ status }) => {
  const s = status?.toLowerCase() || '';
  const styles = {
    'awaiting payment': { background: '#fffbeb', color: '#d97706' },
    'awaiting verification': { background: '#fffbeb', color: '#d97706' },
    'pending': { background: '#fffbeb', color: '#d97706' },
    'completed': { background: '#f0fdf4', color: '#166534' },
    'in progress': { background: '#eff6ff', color: '#1d4ed8' },
    'approved': { background: '#eff6ff', color: '#1d4ed8' },
    'fraud restricted': { background: '#fef2f2', color: '#b91c1c' },
    'default': { background: '#f5f5f5', color: '#525252' }
  };
  const style = styles[s] || styles['default'];
  return <div style={{ ...statusBase, ...style }}>{status}</div>;
};

// --- STYLES (Premium Theme — Black, White & Brown) ---
const brandColor = 'var(--primary)';
const layout = { display: 'flex', background: 'var(--bg-main)', minHeight: '100vh', color: 'var(--text-main)', fontFamily: "'Outfit', 'Inter', sans-serif", transition: '0.3s' };
const sidebar = { width: '260px', minWidth: '260px', borderRight: '1px solid var(--border)', padding: '36px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'fixed', height: '100vh', background: 'var(--secondary)', zIndex: 100 };
const brandSquare = { width: '32px', height: '32px', background: '#fff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '4px', overflow: 'hidden' };
const logoSection = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' };
const logoText = { fontWeight: '900', fontSize: '14px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.9)' };
const userBrief = { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)', marginBottom: '28px', border: '1px solid rgba(255,255,255,0.08)' };
const avatarCircle = { width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(137, 81, 41, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(137, 81, 41, 0.4)', flexShrink: 0 };
const userName = { fontSize: '14px', fontWeight: '800', color: 'rgba(255,255,255,0.9)' };
const userRole = { fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: '600' };
const navStack = { display: 'flex', flexDirection: 'column', gap: '6px' };
const navPassive = { display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', borderRadius: 'var(--radius-full)', color: 'rgba(255,255,255,0.5)', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700', transition: '0.2s', width: '100%', textAlign: 'left' };
const navActive = { ...navPassive, background: 'var(--primary)', color: '#fff', boxShadow: '0 4px 12px rgba(137, 81, 41, 0.4)' };
const sidebarFooter = { borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', paddingBottom: '10px' };
const logoutBtn = { ...navPassive, color: '#ef4444' };
const main = { flex: 1, marginLeft: '260px', minWidth: 0 };
const header = { height: '80px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 10 };
const searchBox = { display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', padding: '10px 20px', borderRadius: 'var(--radius-full)', width: '340px', border: '1px solid var(--border)' };
const input = { background: 'none', border: 'none', outline: 'none', fontSize: '14px', width: '100%', color: 'var(--text-main)', fontFamily: 'inherit' };
const iconBtn = { width: '40px', height: '40px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', cursor: 'pointer', background: 'var(--surface)' };
const content = { padding: '40px' };
const statGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' };
const statCardStyle = { background: 'var(--surface)', padding: '28px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '18px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', transition: '0.2s' };
const iconBox = { width: '56px', height: '56px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const statLabel = { fontSize: '11px', color: 'var(--text-dim)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' };
const statValueSmall = { fontSize: '26px', fontWeight: '900', color: 'var(--text-main)' };
const activeTasksContainer = { marginBottom: '32px' };
const sectionLabel = { fontSize: '13px', fontWeight: '900', marginBottom: '16px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const taskStripList = { display: 'flex', flexDirection: 'column', gap: '10px' };
const taskStrip = { background: 'var(--surface)', padding: '16px 22px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' };
const dotPulse = { width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)', animation: 'pulse 2s infinite', flexShrink: 0 };
const taskTitle = { flex: 1, fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' };
const taskStatusPill = { fontSize: '11px', fontWeight: '800', color: 'var(--primary)', background: 'rgba(137, 81, 41, 0.1)', padding: '5px 12px', borderRadius: 'var(--radius-full)' };
const emptyText = { fontSize: '13px', color: 'var(--text-dim)', fontStyle: 'italic', padding: '20px 0' };
const tableCard = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.07)' };
const tableHeader = { padding: '24px 30px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const cardTitle = { margin: 0, fontSize: '18px', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-0.5px' };
const pillBox = { display: 'flex', gap: '8px', flexWrap: 'wrap' };
const filterPill = (active) => ({ padding: '7px 16px', borderRadius: 'var(--radius-full)', border: active ? `2px solid var(--primary)` : '1px solid var(--border)', background: active ? 'rgba(137, 81, 41, 0.1)' : 'var(--surface)', color: active ? 'var(--primary)' : 'var(--text-dim)', fontSize: '11px', fontWeight: '800', cursor: 'pointer', transition: '0.2s' });
const tableWrapper = { overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const th = { textAlign: 'left', padding: '18px 30px', fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '1px', background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' };
const trHead = { background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' };
const trStyle = { borderBottom: '1px solid var(--border)', transition: '0.15s' };
const td = { padding: '20px 30px', color: 'var(--text-main)' };
const pTitle = { fontWeight: '800', fontSize: '14px', color: 'var(--text-main)' };
const statusBase = { padding: '5px 14px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: '800', display: 'inline-block', textTransform: 'uppercase', letterSpacing: '0.5px' };
const teleBtn = { background: 'var(--primary)', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' };
const actionBtn = { background: 'var(--surface)', border: '1px solid var(--border)', padding: '9px 18px', borderRadius: 'var(--radius-full)', fontWeight: '800', fontSize: '12px', cursor: 'pointer', color: 'var(--text-main)', transition: '0.2s' };
const liveBadge = { fontSize: '10px', fontWeight: '800', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '5px 12px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(16, 185, 129, 0.25)' };
const balanceMain = { fontSize: '60px', fontWeight: '900', color: 'var(--primary)', letterSpacing: '-2px' };
const verifiedBadge = { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(22, 101, 52, 0.1)', color: '#166534', padding: '10px 20px', borderRadius: 'var(--radius-full)', fontSize: '13px', fontWeight: '800', marginTop: '20px' };


export default Dashboard;