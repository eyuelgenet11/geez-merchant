import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { X, Clock, UploadCloud, ShieldCheck, Image as ImageIcon, ExternalLink, MessageCircle, Send } from 'lucide-react';

const JobDetailsModal = ({ job: initialJob, isOpen, onClose, onRefresh }) => {
  const [job, setJob] = useState(initialJob);
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'chat'
  const [price, setPrice] = useState(initialJob?.price ? initialJob.price : '');
  const [deliveryFee, setDeliveryFee] = useState(initialJob?.delivery_fee || '');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // Chat State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    setJob(initialJob);
    setPrice(initialJob?.price ? initialJob.price : '');
    setDeliveryFee(initialJob?.delivery_fee || '');

    if (initialJob?.id && isOpen) {
      const channel = supabase
        .channel(`sync_${initialJob.id}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${initialJob.id}` },
          (payload) => { setJob(payload.new); }
        )
        .subscribe();
      
      fetchMessages();
      const msgChannel = supabase
        .channel(`chat_${initialJob.id}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'job_messages', filter: `job_id=eq.${initialJob.id}` },
          (payload) => { fetchMessages(); }
        )
        .subscribe();

      return () => { 
        supabase.removeChannel(channel); 
        supabase.removeChannel(msgChannel);
      };
    }
  }, [initialJob, isOpen]);

  const fetchMessages = async () => {
    if (!initialJob?.id) return;
    const { data } = await supabase
      .from('job_messages')
      .select('*, profiles:sender_id(full_name, role)')
      .eq('job_id', initialJob.id)
      .order('created_at', { ascending: true });
    
    if (data) {
      setMessages(data);
      scrollToBottom();
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const text = newMessage;
    setNewMessage('');
    
    await supabase.from('job_messages').insert({
      job_id: job.id,
      sender_id: user.id,
      content: text
    });
  };

  const updateStatus = async (newStatus, extra = {}) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus, ...extra })
        .eq('id', job.id);
      if (error) throw error;
      onRefresh();
    } catch (err) {
      alert("Status Update Failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeliverWork = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fileName = `final/${job.id}_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('translations')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('translations').getPublicUrl(fileName);

      await supabase.from('jobs').update({
        status: 'pending_review',
        translated_file_url: publicData.publicUrl
      }).eq('id', job.id);

      onRefresh();
      setFile(null);
    } catch (err) {
      alert("Delivery failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <ImageIcon size={20} color="#78350f" />
            <h3 style={styles.title}>{job.from_lang} → {job.to_lang}</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button 
            style={activeTab === 'details' ? styles.activeTabBtn : styles.tabBtn}
            onClick={() => setActiveTab('details')}
          >
            Job Details
          </button>
          <button 
            style={activeTab === 'chat' ? styles.activeTabBtn : styles.tabBtn}
            onClick={() => { setActiveTab('chat'); scrollToBottom(); }}
          >
            <MessageCircle size={14} style={{ marginRight: '6px' }} /> Chat
          </button>
        </div>

        <div style={styles.body}>
          {activeTab === 'details' ? (
            <>
              <div style={styles.filePreviewBox}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={styles.label}>Source Document</span>
              <span style={styles.subText}>Customer's original file</span>
            </div>
            <button
              onClick={() => window.open(job.file_url, '_blank')}
              style={styles.secondaryBtn}
            >
              <ExternalLink size={16} /> View Original
            </button>
          </div>

          {/* URGENCY INFO */}
          <div style={{ ...styles.filePreviewBox, background: job.urgency === 'Rush' ? '#fef2f2' : job.urgency === 'Express' ? '#fffbeb' : 'var(--bg-main)', borderColor: job.urgency === 'Rush' ? '#fecaca' : job.urgency === 'Express' ? '#fde68a' : 'var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ ...styles.label, color: job.urgency === 'Rush' ? '#b91c1c' : job.urgency === 'Express' ? '#b45309' : 'var(--primary)' }}>
                {job.urgency || 'Normal'} Delivery
              </span>
              <span style={styles.subText}>
                {job.urgency === 'Rush' ? 'Less than 1hr' : job.urgency === 'Express' ? 'Less than 2hr' : 'Today'}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
               <div style={{ fontSize: '14px', fontWeight: '900', color: job.urgency === 'Rush' ? '#b91c1c' : job.urgency === 'Express' ? '#b45309' : 'var(--text-main)' }}>
                 +{job.urgency_fee || 0} ETB
               </div>
               <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: '700' }}>URGENCY FEE</div>
            </div>
          </div>

          {/* DELIVERY INFO SECTION - RESTRICTED */}
          {job.delivery_requested && (
            <div style={{...styles.deliveryInfoBox, background: '#fef3c7', borderColor: '#f59e0b'}}>
              <div style={styles.deliveryHeader}>
                <ShieldCheck size={16} color="#92400e" />
                <span style={{...styles.label, color: '#92400e'}}>PHYSICAL DELIVERY MANAGED BY ADMIN</span>
              </div>
              <p style={{...styles.subText, fontSize: '12px', margin: 0}}>
                The customer has requested a hard copy. Your only task is to translate and upload the digital file. 
                <strong> The Admin will handle the physical delivery and courier arrangements.</strong>
              </p>
            </div>
          )}

          {/* STEP 1: PENDING -> QUOTED */}
          {job.status === 'pending' && (
            <div style={styles.actionBox}>
              <p style={styles.label}>Proposed Translation Price (ETB)</p>
              <input
                type="number"
                style={styles.input}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
              <button
                onClick={() => {
                  const newStatus = job.delivery_requested ? 'pending' : 'quoted';
                  updateStatus(newStatus, { price: parseFloat(price) });
                }}
                style={styles.primaryBtn}
                disabled={loading || !price}
              >
                {loading ? 'Sending...' : (job.delivery_requested ? 'Save Quote' : 'Send Quote')}
              </button>
              {job.delivery_requested && price > 0 && job.status === 'pending' && (
                <p style={{...styles.subText, color: '#92400e', fontSize: '12px', textAlign: 'center', fontWeight: 'bold'}}>
                  Note: Since physical delivery is requested, this quote will be held until the Admin adds the delivery fee.
                </p>
              )}
            </div>
          )}

          {/* STEP 2: WAITING FOR CUSTOMER */}
          {job.status === 'quoted' && (
            <div style={styles.waitState}>
              <Clock size={48} color="#f59e0b" />
              <h4 style={{ marginTop: '16px' }}>Quote Sent</h4>
              <p style={styles.subText}>Waiting for customer to accept your {job.price ? job.price : ''} ETB offer.</p>
            </div>
          )}

          {/* STEP 3: WAITING FOR PAYMENT/VERIFICATION */}
          {(job.status === 'awaiting payment' || job.status === 'awaiting verification' || job.status === 'Awaiting Payment' || job.status === 'Awaiting Verification') && (
            <div style={styles.waitState}>
              <Clock size={48} color="#f59e0b" />
              <h4 style={{ marginTop: '16px' }}>Waiting for Payment</h4>
              <p style={styles.subText}>
                {['awaiting verification', 'Awaiting Verification'].includes(job.status)
                  ? "Customer uploaded receipt. Waiting for Admin verification before you can start translating."
                  : "Quote accepted! Waiting for customer to pay via Telebirr and upload receipt."}
              </p>
            </div>
          )}

          {/* STEP 4: IN PROGRESS -> DELIVERING */}
          {(job.status === 'in_progress' || job.status === 'In Progress' || job.status === 'in progress' || job.status === 'accepted' || job.status === 'Accepted' || job.status === 'approved') && (
            <div style={styles.actionBox}>
              <div style={styles.successBanner}>Payment Verified! You can now translate and upload the final file.</div>
              <label style={styles.dropzone}>
                <UploadCloud size={32} color="#78350f" />
                <p style={{ fontSize: '14px', marginTop: '8px' }}>
                  {file ? file.name : "Select Completed File"}
                </p>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </label>
              <button
                onClick={handleDeliverWork}
                style={styles.primaryBtn}
                disabled={!file || loading}
              >
                {loading ? "Delivering..." : "Deliver Work"}
              </button>
            </div>
          )}

          {/* STEP 5: PENDING REVIEW — Awaiting Customer Approval */}
          {['pending_review', 'pending review'].includes(job.status?.toLowerCase()) && (
            <div style={styles.waitState}>
              <div style={{ fontSize: '40px' }}>🔍</div>
              <h4 style={{ marginTop: '16px', color: '#f59e0b' }}>Under Customer Review</h4>
              <p style={styles.subText}>Your translation has been delivered! The customer is reviewing it and will either accept it or request a revision.</p>
              <div style={{ marginTop: '12px', padding: '8px 16px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #f59e0b' }}>
                <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 700 }}>⏳ Waiting for customer acceptance</span>
              </div>
            </div>
          )}

          {/* STEP 6: REVISION REQUESTED — Customer found errors */}
          {job.status === 'revision_requested' && (
            <div style={styles.actionBox}>
              <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '10px', border: '1px solid #fecaca', marginBottom: '16px' }}>
                <p style={{ margin: 0, fontWeight: 800, color: '#991b1b', fontSize: '13px' }}>✏️ REVISION REQUESTED</p>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#7f1d1d', lineHeight: 1.5 }}>
                  {job.revision_notes || 'The customer has requested a revision. Please check the document and re-upload.'}
                </p>
                {job.revision_count > 0 && (
                  <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#b91c1c', fontWeight: 600 }}>
                    Revision #{job.revision_count}
                  </p>
                )}
              </div>
              <label style={styles.dropzone}>
                <UploadCloud size={32} color="#78350f" />
                <p style={{ fontSize: '14px', marginTop: '8px' }}>
                  {file ? file.name : 'Upload Revised File'}
                </p>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </label>
              <button
                onClick={handleDeliverWork}
                style={styles.primaryBtn}
                disabled={!file || loading}
              >
                {loading ? 'Re-delivering...' : 'Submit Revision'}
              </button>
            </div>
          )}

          {job.status === 'completed' && (
            <div style={styles.waitState}>
              <ShieldCheck size={48} color="#10b981" />
              <h4 style={{ marginTop: '16px', color: '#10b981' }}>✅ Customer Accepted!</h4>
              <p style={styles.subText}>The customer has reviewed and accepted the translation. This job is now fully complete.</p>
            </div>
          )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '400px' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '40px' }}>No messages yet.</div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.profiles?.role !== 'customer'; // Translator is not customer
                    return (
                      <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '4px', textAlign: isMe ? 'right' : 'left' }}>
                          {isMe ? 'You' : msg.profiles?.full_name || 'Client'}
                        </div>
                        <div style={{
                          background: isMe ? 'var(--primary)' : '#f3f4f6',
                          color: isMe ? 'white' : 'black',
                          padding: '10px 14px',
                          borderRadius: '16px',
                          borderBottomRightRadius: isMe ? '0' : '16px',
                          borderBottomLeftRadius: !isMe ? '0' : '16px',
                          fontSize: '14px'
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: '10px 16px', borderRadius: '20px', border: '1px solid var(--border)', outline: 'none' }}
                />
                <button type="submit" disabled={!newMessage.trim()} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newMessage.trim() ? 'pointer' : 'not-allowed', opacity: newMessage.trim() ? 1 : 0.5 }}>
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- STYLES OBJECT ---
const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(8px)',
  },
  modal: {
    backgroundColor: 'var(--surface)',
    borderRadius: 'var(--radius-xl)',
    width: '90%',
    maxWidth: '460px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 30px 60px rgba(0, 0, 0, 0.3)',
    border: '1px solid var(--border)',
  },
  header: {
    padding: '22px 26px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '900',
    color: 'var(--text-main)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  tabBtn: {
    flex: 1,
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--text-dim)',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: '0.2s'
  },
  activeTabBtn: {
    flex: 1,
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid var(--primary)',
    color: 'var(--primary)',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: '0.2s'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-dim)',
    display: 'flex',
    alignItems: 'center',
  },
  body: {
    padding: '26px',
    overflowY: 'auto',
    flex: 1,
  },
  actionBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '900',
    color: 'var(--primary)',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  input: {
    padding: '14px 18px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--border)',
    fontSize: '16px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--bg-main)',
    color: 'var(--text-main)',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    backgroundColor: 'var(--secondary)',
    color: 'white',
    padding: '16px',
    borderRadius: 'var(--radius-full)',
    border: 'none',
    fontWeight: '800',
    cursor: 'pointer',
    fontSize: '14px',
    letterSpacing: '0.5px',
    transition: 'all 0.2s ease',
  },
  waitState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '24px 0',
  },
  subText: {
    color: 'var(--text-dim)',
    fontSize: '14px',
    marginTop: '8px',
    lineHeight: '1.6',
  },
  successBanner: {
    backgroundColor: 'rgba(137, 81, 41, 0.1)',
    color: 'var(--primary)',
    padding: '14px',
    borderRadius: 'var(--radius-full)',
    fontSize: '13px',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: '8px',
    border: '1px solid rgba(137, 81, 41, 0.2)',
  },
  dropzone: {
    border: '2px dashed var(--border)',
    borderRadius: 'var(--radius-xl)',
    padding: '40px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
    backgroundColor: 'var(--bg-main)',
    transition: 'background-color 0.2s'
  },
  filePreviewBox: {
    background: 'var(--bg-main)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  secondaryBtn: {
    backgroundColor: 'var(--surface)',
    color: 'var(--primary)',
    padding: '8px 18px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--primary)',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  },
  deliveryInfoBox: {
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 'var(--radius-xl)',
    padding: '16px',
    marginBottom: '20px'
  },
  deliveryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px'
  },
  deliveryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  infoLabel: {
    fontSize: '9px',
    fontWeight: '900',
    color: 'var(--primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  infoValue: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-main)',
    marginTop: '2px'
  },
  deliveryStatusControl: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid var(--border)'
  },
  miniStatusBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    border: 'none',
    fontSize: '10px',
    fontWeight: '800',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

export default JobDetailsModal;