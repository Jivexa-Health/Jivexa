import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MarkdownText } from '../../components/common/MarkdownText';
import { 
  streamAIHealthAssistant, 
  fetchBackendConversations,
  saveBackendConversation,
  deleteBackendConversation,
  clearAllBackendConversations,
  StructuredMedicalData
} from '../../services/ai';
import { 
  MessageSquare, Plus, Search, Trash2, Send, 
  AlertTriangle, ShieldCheck, Check, Info, Loader2, Sparkles, User,
  FileText, Activity, Pill, Stethoscope, Menu, X, ChevronRight, HeartPulse,
  Copy, Apple, ArrowUp, RefreshCw
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  isEmergency?: boolean;
  provider?: string;
  isStreaming?: boolean;
  suggestions?: string[];
  errorCode?: string;
  structuredData?: StructuredMedicalData;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastUpdated: Date;
}

export const AIAssistantChat: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    const loadConversations = async () => {
      if (user?.id) {
        try {
          const backendList = await fetchBackendConversations();
          if (isMounted && Array.isArray(backendList) && backendList.length > 0) {
            const formatted = backendList.map((c: any) => ({
              id: c.id || c._id,
              title: c.title || 'New Conversation',
              lastUpdated: new Date(c.lastUpdated || Date.now()),
              messages: (c.messages || [])
                .filter((m: any) => typeof m.text === 'string' && m.text.trim().length > 0)
                .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
            }));
            setConversations(formatted);
            setActiveConvId(formatted[0].id);
            localStorage.setItem(`jivexa_chats_${user?.id}`, JSON.stringify(formatted));
            return;
          }
        } catch (err) {
          console.warn('[AI Assistant] Failed to load conversations from backend:', err);
        }
      }

      const saved = localStorage.getItem(`jivexa_chats_${user?.id}`);
      if (saved && isMounted) {
        try {
          const parsed = JSON.parse(saved);
          const formatted = parsed.map((c: any) => ({
            ...c,
            lastUpdated: new Date(c.lastUpdated),
            messages: (c.messages || [])
              .filter((m: any) => typeof m.text === 'string' && m.text.trim().length > 0)
              .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
          }));
          setConversations(formatted);
          if (formatted.length > 0) {
            setActiveConvId(formatted[0].id);
          }
        } catch (e) {
          localStorage.removeItem(`jivexa_chats_${user?.id}`);
        }
      }
    };

    loadConversations();
    return () => { isMounted = false; };
  }, [user?.id]);

  const syncConversations = (list: Conversation[], convToSync?: Conversation) => {
    setConversations(list);
    const sanitized = list.map(c => ({
      ...c,
      messages: c.messages.filter(m => typeof m.text === 'string' && m.text.trim().length > 0)
    }));
    localStorage.setItem(`jivexa_chats_${user?.id}`, JSON.stringify(sanitized));

    if (convToSync && user?.id) {
      saveBackendConversation({
        id: convToSync.id,
        title: convToSync.title,
        messages: convToSync.messages.filter(m => typeof m.text === 'string' && m.text.trim().length > 0)
      }).catch(err => console.warn('[AI Assistant] Sync error:', err));
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConvId, isLoading]);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const startNewConversation = (initialTitle = 'New Conversation') => {
    const newConv: Conversation = {
      id: `chat_${Date.now()}`,
      title: initialTitle,
      messages: [],
      lastUpdated: new Date()
    };
    const updated = [newConv, ...conversations];
    syncConversations(updated, newConv);
    setActiveConvId(newConv.id);
    setIsMobileSidebarOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };


  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    let currentConvId = activeConvId;
    let currentConvs = [...conversations];

    if (!currentConvId) {
      const newId = `chat_${Date.now()}`;
      const newTitle = textToSend.slice(0, 32) + (textToSend.length > 32 ? '...' : '');
      const newConv: Conversation = {
        id: newId,
        title: newTitle,
        messages: [],
        lastUpdated: new Date()
      };
      currentConvs = [newConv, ...currentConvs];
      currentConvId = newId;
      setActiveConvId(newId);
    }

    const targetConvIndex = currentConvs.findIndex((c) => c.id === currentConvId);
    if (targetConvIndex === -1) return;

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    const targetConv = { ...currentConvs[targetConvIndex] };
    targetConv.messages = [...targetConv.messages, userMsg];
    targetConv.lastUpdated = new Date();
    
    if (targetConv.title === 'New Conversation' || targetConv.title.startsWith('chat_')) {
      targetConv.title = textToSend.slice(0, 32) + (textToSend.length > 32 ? '...' : '');
    }

    currentConvs[targetConvIndex] = targetConv;
    const sorted = [
      targetConv,
      ...currentConvs.filter((c) => c.id !== currentConvId)
    ];

    syncConversations(sorted, targetConv);
    setInputMessage('');
    setIsLoading(true);

    const aiMsgId = `msg_ai_${Date.now()}`;
    let streamingText = '';
    let currentProvider = 'JIVEXA AI (Google Gemini)';
    let isEmergencyFlag = false;

    // Insert initial "Thinking..." placeholder
    setConversations((prev) => 
      prev.map((c) => {
        if (c.id === currentConvId) {
          return {
            ...c,
            messages: [
              ...c.messages,
              {
                id: aiMsgId,
                sender: 'ai',
                text: '',
                timestamp: new Date(),
                isStreaming: true
              }
            ]
          };
        }
        return c;
      })
    );

    let lastUpdate = 0;

    try {
      // Construct clean prior conversation history (excluding empty text and the new user message)
      const cleanHistory = targetConv.messages
        .filter(m => m.id !== userMsg.id && typeof m.text === 'string' && m.text.trim().length > 0)
        .map(m => ({ sender: m.sender, text: m.text.trim() }));

      const responseResult = await streamAIHealthAssistant(
        textToSend,
        cleanHistory,
        (chunk, provider, isEmerg) => {
          streamingText += chunk;
          if (provider) currentProvider = provider;
          if (isEmerg) isEmergencyFlag = true;

          const now = Date.now();
          if (now - lastUpdate > 20 || chunk.includes('\n')) {
            lastUpdate = now;
            setConversations((prev) => 
              prev.map((c) => {
                if (c.id === currentConvId) {
                  const existingAiIndex = c.messages.findIndex(m => m.id === aiMsgId);
                  const aiMsgObj: ChatMessage = {
                    id: aiMsgId,
                    sender: 'ai',
                    text: streamingText,
                    timestamp: new Date(),
                    provider: currentProvider,
                    isEmergency: isEmergencyFlag,
                    isStreaming: true
                  };
                  if (existingAiIndex === -1) {
                    return { ...c, messages: [...c.messages, aiMsgObj] };
                  } else {
                    const updatedMsgs = [...c.messages];
                    updatedMsgs[existingAiIndex] = aiMsgObj;
                    return { ...c, messages: updatedMsgs };
                  }
                }
                return c;
              })
            );
          }
        },
        user?.id,
        currentConvId
      );

      // Finalize streaming message state and sync to storage
      const finalAiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: streamingText || responseResult?.text || 'JIVEXA Assistant provided no response.',
        timestamp: new Date(),
        provider: currentProvider,
        isEmergency: isEmergencyFlag,
        isStreaming: false,
        suggestions: responseResult?.errorCode ? [] : (responseResult?.suggestions || []),
        errorCode: responseResult?.errorCode,
        structuredData: responseResult?.structuredData
      };

      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id === currentConvId) {
            const msgsWithoutStreaming = c.messages.filter(m => m.id !== aiMsgId);
            return {
              ...c,
              lastUpdated: new Date(),
              messages: [...msgsWithoutStreaming, finalAiMsg]
            };
          }
          return c;
        });
        const activeOne = updated.find(c => c.id === currentConvId);
        syncConversations(updated, activeOne);
        return updated;
      });

    } catch (err) {
      console.error('[AI Chat Error]', err);
      // Ensure we never leave an empty message on error, and persist the state
      const errorAiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: streamingText || 'JIVEXA Assistant is temporarily unable to connect to the backend server. Please verify the backend is running and try again.',
        timestamp: new Date(),
        provider: currentProvider,
        isStreaming: false,
        suggestions: [],
        errorCode: 'NETWORK_ERROR'
      };

      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id === currentConvId) {
            const msgsWithoutStreaming = c.messages.filter(m => m.id !== aiMsgId);
            return {
              ...c,
              lastUpdated: new Date(),
              messages: [...msgsWithoutStreaming, errorAiMsg]
            };
          }
          return c;
        });
        const activeOne = updated.find(c => c.id === currentConvId);
        syncConversations(updated, activeOne);
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = conversations.filter((c) => c.id !== id);
    syncConversations(filtered);
    if (activeConvId === id) {
      setActiveConvId(filtered.length > 0 ? filtered[0].id : null);
    }
    if (user?.id) {
      deleteBackendConversation(id).catch(err => console.warn('[AI Assistant] Delete backend error:', err));
    }
  };

  const clearAllConversations = () => {
    syncConversations([]);
    setActiveConvId(null);
    if (user?.id) {
      clearAllBackendConversations().catch(err => console.warn('[AI Assistant] Clear backend error:', err));
    }
  };

  const filteredConvs = conversations.filter((c) => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.messages.some((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 4 Apple-Inspired Healthcare Suggestion Cards
  const emptyStateSuggestions = [
    {
      title: 'Analyze Health Report',
      category: 'Diagnostics',
      subtext: 'Explain lab vitals, blood panels & clinical indicators',
      prompt: 'Can you help me understand a blood or lab test report? What are the key parameters, reference ranges, and abnormal indicators to look out for?',
      icon: <FileText size={20} className="text-teal-600 card-svg-icon" />
    },
    {
      title: 'Assess Symptoms',
      category: 'Clinical Triage',
      subtext: 'Evaluate symptom patterns, severity & when to see a doctor',
      prompt: 'Can you explain common causes and red-flag warning signs when experiencing symptoms like persistent headache, fatigue, or fever?',
      icon: <Activity size={20} className="text-emerald-600 card-svg-icon" />
    },
    {
      title: 'Medication Safety & Usage',
      category: 'Pharmacology',
      subtext: 'Review dosage guidelines, precautions & drug interactions',
      prompt: 'What are the essential safety rules, common side effects, and precautions to verify when starting a newly prescribed medicine?',
      icon: <Pill size={20} className="text-teal-600 card-svg-icon" />
    },
    {
      title: 'Doctor Consultation Prep',
      category: 'Care Navigation',
      subtext: 'Generate structured questions to ask your specialist',
      prompt: 'How can I prepare effectively for an upcoming physician consultation? What key questions and symptom timelines should I present?',
      icon: <Stethoscope size={20} className="text-emerald-600 card-svg-icon" />
    }
  ];

  // Quick Starter Chips
  const starterChips = [
    { label: '🩺 Symptom Triage', prompt: 'I have had a dry cough and mild body aches for 2 days. What could this indicate and what self-care steps help?' },
    { label: '🔬 Lipid Profile Reading', prompt: 'Explain the difference between LDL, HDL, and Triglycerides in a lipid panel test report.' },
    { label: '💊 Antibiotic Precautions', prompt: 'What are the most crucial rules when taking prescribed oral antibiotics?' },
    { label: '🥗 Blood Sugar & Diet', prompt: 'What are evidence-based dietary recommendations for maintaining healthy fasting blood sugar levels?' },
    { label: '📋 Questions for Cardiologist', prompt: 'What questions should I ask my cardiologist during a routine heart checkup?' }
  ];

  return (
    <div className="jivexa-ai-wrapper">
      
      {/* APPLE-INSPIRED TRANSLUCENT TOP HEADER */}
      <header className="jivexa-ai-topbar">
        <div className="topbar-branding">
          <div className="avatar-orb">
            <Sparkles size={22} className="avatar-icon" />
            <span className="live-status-dot" />
          </div>
          <div className="topbar-titles">
            <div className="topbar-title-row">
              <h1 className="topbar-title">JIVEXA Health AI</h1>
              <span className="clinical-pill">
                <span className="pulse-beacon" />
                Clinical Intelligence 3.3
              </span>
            </div>
            <p className="topbar-subtitle">
              Your 24/7 intelligent companion for lab interpretation, symptom insights & wellness guidance.
            </p>
          </div>
        </div>

        {/* TOPBAR CONTROLS */}
        <div className="topbar-actions">
          {/* Desktop New Chat Quick Shortcut */}
          <button
            type="button"
            onClick={() => startNewConversation()}
            className="topbar-new-chat-btn sr-mobile-hide"
            title="Start new consultation"
          >
            <Plus size={15} />
            <span>New Consultation</span>
          </button>

          {/* Mobile History Toggle */}
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="mobile-sidebar-toggle"
            aria-label="Toggle conversation history"
          >
            {isMobileSidebarOpen ? <X size={17} /> : <MessageSquare size={17} />}
            <span>History</span>
          </button>
        </div>
      </header>

      {/* MAIN TWO-COLUMN SPLIT CONTAINER */}
      <div className="jivexa-chat-split">
      
        {/* Backdrop for mobile history sidebar */}
        {isMobileSidebarOpen && (
          <div 
            className="sidebar-backdrop"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Close conversation history"
          />
        )}

        {/* LEFT SIDEBAR: CONVERSATION ARCHIVE */}
        <aside className={`jivexa-sidebar ${isMobileSidebarOpen ? 'sidebar-mobile-open' : ''}`}>
          
          {/* Mobile Sidebar Close Header */}
          <div className="sidebar-mobile-header">
            <div className="sidebar-mobile-title-wrap">
              <MessageSquare size={16} />
              <span className="sidebar-mobile-title">Chat History</span>
            </div>
            <button 
              type="button" 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="sidebar-close-btn"
              aria-label="Close chat history"
            >
              <X size={18} />
            </button>
          </div>

          {/* New Consultation Button */}
          <button 
            type="button"
            onClick={() => {
              startNewConversation();
              setIsMobileSidebarOpen(false);
            }} 
            className="new-chat-btn"
          >
            <Plus size={18} />
            <span>New Consultation</span>
          </button>

          {/* Search Bar */}
          <div className="sidebar-search-box">
            <Search size={15} className="search-icon" />
            <input 
              type="text"
              placeholder="Search previous chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sidebar-search-input"
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                className="search-clear-btn"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Conversations Scrollable List */}
          <div className="sidebar-chat-list">
            {filteredConvs.length === 0 ? (
              <div className="empty-history-state">
                <div className="empty-history-icon">
                  <MessageSquare size={22} />
                </div>
                <h4 className="empty-history-title">No consultations yet</h4>
                <p className="empty-history-desc">
                  Start a private conversation with JIVEXA Health AI.
                </p>
                <button
                  type="button"
                  onClick={() => startNewConversation()}
                  className="start-first-chat-btn"
                >
                  <Plus size={14} /> Start Consultation
                </button>
              </div>
            ) : (
              filteredConvs.map((conv) => {
                const isActive = conv.id === activeConvId;
                const messageCount = conv.messages.length;
                return (
                  <div 
                    key={conv.id}
                    onClick={() => {
                      setActiveConvId(conv.id);
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`sidebar-conv-card ${isActive ? 'active' : ''}`}
                  >
                    <div className="conv-indicator">
                      <MessageSquare size={16} />
                    </div>
                    <div className="conv-metadata">
                      <div className="conv-title" title={conv.title}>
                        {conv.title}
                      </div>
                      <div className="conv-subinfo">
                        <span>{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
                      </div>
                    </div>
                    <button 
                      type="button"
                      title="Delete conversation"
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="conv-delete-btn"
                      aria-label="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Clear Option */}
          {conversations.length > 0 && (
            <div className="sidebar-footer">
              <button 
                type="button"
                onClick={clearAllConversations}
                className="clear-all-btn"
              >
                <Trash2 size={13} />
                <span>Clear All Chat History</span>
              </button>
            </div>
          )}
        </aside>

        {/* RIGHT WORKSPACE: ACTIVE CHAT SCREEN */}
        <main className="jivexa-chat-main">
          
          {/* SUB-HEADER INSIDE ACTIVE CHAT */}
          <div className="chat-viewport-header">
            <div className="viewport-status">
              <div className="viewport-avatar">
                <HeartPulse size={18} />
              </div>
              <div className="viewport-labels">
                <div className="viewport-title-row">
                  <span className="viewport-name">
                    {activeConv && activeConv.messages.length > 0
                      ? (activeConv.title.length > 36 ? activeConv.title.slice(0, 36) + '...' : activeConv.title)
                      : 'JIVEXA Clinical Assistant'}
                  </span>
                  <span className="live-pill">Clinical AI</span>
                </div>
                <span className="viewport-model-label">
                  Google Gemini · Structured Medical Intelligence
                </span>
              </div>
            </div>

            <div className="viewport-controls">
              {activeConv && activeConv.messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => startNewConversation()}
                  className="viewport-action-btn"
                  title="New conversation"
                >
                  <Plus size={15} />
                  <span className="btn-label-desktop">New Chat</span>
                </button>
              )}
            </div>
          </div>

          {/* SCROLLABLE MESSAGES STREAM */}
          <div className="chat-messages-container">
            
            {/* COMPACT APPLE-STYLE CLINICAL DISCLAIMER */}
            <div className="clinical-advisory-banner">
              <ShieldCheck size={16} className="advisory-icon" />
              <div className="advisory-content">
                <span className="advisory-title">Clinical Advisory:</span>
                <span className="advisory-text">
                  JIVEXA Health AI provides supportive healthcare guidance. In urgent medical situations, call 112 or 108 immediately.
                </span>
              </div>
            </div>

            {/* EMPTY STATE: WHEN NO MESSAGES IN ACTIVE CONVERSATION */}
            {(!activeConv || activeConv.messages.length === 0) ? (
              <div className="chat-empty-hero">
                
                {/* Apple Health Glowing Hero Emblem */}
                <div className="hero-emblem-wrapper">
                  <div className="hero-emblem-glow" />
                  <div className="hero-emblem">
                    <HeartPulse size={34} className="hero-emblem-icon" />
                  </div>
                </div>

                <div className="hero-headings">
                  <span className="hero-eyebrow">Medical & Diagnostic AI</span>
                  <h2 className="hero-title">How can JIVEXA assist your health today?</h2>
                  <p className="hero-desc">
                    Ask questions about lab reports, analyze symptom patterns, review medications, or prepare structured questions for your next doctor appointment.
                  </p>
                </div>

                {/* 4 Apple-Style Suggestion Cards */}
                <div className="hero-suggestions-grid">
                  {emptyStateSuggestions.map((item, idx) => (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSendMessage(item.prompt)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSendMessage(item.prompt);
                        }
                      }}
                      className="suggestion-apple-card"
                    >
                      <div className="card-top-row">
                        <div className="card-icon-bubble">
                          {item.icon}
                        </div>
                        <span className="card-category-badge">{item.category}</span>
                      </div>
                      <div className="card-content">
                        <h3 className="card-title">{item.title}</h3>
                        <p className="card-subtext">{item.subtext}</p>
                      </div>
                      <div className="card-arrow-row">
                        <span className="card-cta-label">Ask assistant</span>
                        <ChevronRight size={15} className="card-arrow" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Horizontal Quick Starter Pills */}
                <div className="quick-starter-section">
                  <span className="quick-starter-label">Trending Health Topics</span>
                  <div className="quick-starter-chips">
                    {starterChips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(chip.prompt)}
                        className="quick-starter-chip"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              /* ACTIVE MESSAGES STREAM */
              <div className="messages-stream">
                {activeConv.messages.map((msg) => {
                  const isUser = msg.sender === 'user';
                  const isCopied = copiedMsgId === msg.id;
                  
                  return (
                    <div 
                      key={msg.id}
                      className={`message-row ${isUser ? 'user-row' : 'ai-row'}`}
                    >
                      <div className={`message-bubble-container ${isUser ? 'user-container' : 'ai-container'}`}>
                        
                        {/* Avatar */}
                        <div className={`message-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`}>
                          {isUser ? (
                            <User size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}
                        </div>

                        {/* Speech Bubble */}
                        <div className={`speech-bubble ${isUser ? 'user-bubble' : 'ai-bubble'} ${msg.isEmergency ? 'emergency-bubble' : ''}`}>
                          
                          {/* AI Assistant Bubble Header */}
                          {!isUser && (
                            <div className="ai-bubble-meta-header">
                              <div className="ai-meta-identity">
                                <span className="ai-meta-name">JIVEXA Health AI</span>
                                {msg.provider && (
                                  <span className="ai-meta-model">{msg.provider}</span>
                                )}
                              </div>
                              
                              {!msg.isStreaming && msg.text && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, msg.text)}
                                  className="copy-bubble-btn"
                                  title="Copy response"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check size={12} className="text-emerald-600" />
                                      <span className="text-emerald-700">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Emergency Alert Header (When Triggered) */}
                          {msg.isEmergency && (
                            <div className="emergency-alert-card">
                              <AlertTriangle size={18} className="emergency-alert-icon" />
                              <div className="emergency-alert-body">
                                <strong>Urgent Medical Attention Recommended</strong>
                                <p>
                                  Your query contains indicators that may require prompt medical evaluation. Please call <strong>112</strong> or <strong>108</strong> (Ambulance) or visit the nearest emergency healthcare facility immediately.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Bubble Content / Markdown */}
                          {!isUser && (!msg.text || !msg.text.trim()) ? (
                            <div className="ai-typing-indicator">
                              <span className="typing-dot dot-1" />
                              <span className="typing-dot dot-2" />
                              <span className="typing-dot dot-3" />
                              <span className="typing-text">Analyzing clinical data...</span>
                            </div>
                          ) : !isUser && msg.structuredData && !msg.isStreaming ? (
                            <div className="structured-medical-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {/* Urgency Badge */}
                              {msg.structuredData.urgency_level && (
                                <div 
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '9999px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.01em',
                                    alignSelf: 'flex-start',
                                    backgroundColor: 
                                      msg.structuredData.urgency_level === 'emergency' ? '#fef2f2' :
                                      msg.structuredData.urgency_level === 'high_priority' ? '#fffbeb' :
                                      msg.structuredData.urgency_level === 'self_care' ? '#f0fdf4' : '#eff6ff',
                                    color: 
                                      msg.structuredData.urgency_level === 'emergency' ? '#b91c1c' :
                                      msg.structuredData.urgency_level === 'high_priority' ? '#b45309' :
                                      msg.structuredData.urgency_level === 'self_care' ? '#15803d' : '#1d4ed8',
                                    border: `1px solid ${
                                      msg.structuredData.urgency_level === 'emergency' ? '#fecaca' :
                                      msg.structuredData.urgency_level === 'high_priority' ? '#fde68a' :
                                      msg.structuredData.urgency_level === 'self_care' ? '#bbf7d0' : '#bfdbfe'
                                    }`
                                  }}
                                >
                                  {msg.structuredData.urgency_level === 'emergency' && <AlertTriangle size={13} />}
                                  {msg.structuredData.urgency_level === 'high_priority' && <AlertTriangle size={13} />}
                                  {msg.structuredData.urgency_level === 'self_care' && <ShieldCheck size={13} />}
                                  {msg.structuredData.urgency_level === 'routine' && <Info size={13} />}
                                  {msg.structuredData.urgency_level === 'informational' && <FileText size={13} />}
                                  <span>
                                    {msg.structuredData.urgency_level === 'emergency' ? 'EMERGENCY: Immediate Medical Care Required' :
                                     msg.structuredData.urgency_level === 'high_priority' ? 'HIGH PRIORITY: Clinical Review Within 12-24h' :
                                     msg.structuredData.urgency_level === 'self_care' ? 'SELF CARE: Monitored Supportive Recovery' :
                                     msg.structuredData.urgency_level === 'informational' ? 'INFORMATIONAL: Healthcare Education' :
                                     'ROUTINE: Consult Healthcare Professional'}
                                  </span>
                                </div>
                              )}

                              {/* Answer Summary */}
                              {msg.structuredData.answer_summary && (
                                <div style={{ fontSize: '0.90rem', lineHeight: '1.6', color: '#0f172a', fontWeight: 500 }}>
                                  {msg.structuredData.answer_summary}
                                </div>
                              )}

                              {/* Key Information */}
                              {Array.isArray(msg.structuredData.key_information) && msg.structuredData.key_information.length > 0 && (
                                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px' }}>
                                  <h5 style={{ margin: '0 0 6px 0', fontSize: '0.84rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Activity size={14} style={{ color: '#0284c7' }} /> Key Clinical Information
                                  </h5>
                                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {msg.structuredData.key_information.map((item, idx) => (
                                      <li key={idx} style={{ fontSize: '0.85rem', lineHeight: '1.5', color: '#334155' }}>
                                        <MarkdownText content={item} />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Precautions */}
                              {Array.isArray(msg.structuredData.precautions) && msg.structuredData.precautions.length > 0 && (
                                <div style={{ backgroundColor: '#fffdf5', border: '1px solid #fef08a', borderRadius: '8px', padding: '10px 14px' }}>
                                  <h5 style={{ margin: '0 0 6px 0', fontSize: '0.84rem', fontWeight: 700, color: '#854d0e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ShieldCheck size={14} style={{ color: '#ca8a04' }} /> Important Precautions
                                  </h5>
                                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {msg.structuredData.precautions.map((item, idx) => (
                                      <li key={idx} style={{ fontSize: '0.84rem', lineHeight: '1.5', color: '#713f12' }}>
                                        <MarkdownText content={item} />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Warning Signs */}
                              {Array.isArray(msg.structuredData.warning_signs) && msg.structuredData.warning_signs.length > 0 && (
                                <div style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px' }}>
                                  <h5 style={{ margin: '0 0 6px 0', fontSize: '0.84rem', fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertTriangle size={14} style={{ color: '#dc2626' }} /> Warning Signs (Seek Immediate Medical Care If)
                                  </h5>
                                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {msg.structuredData.warning_signs.map((item, idx) => (
                                      <li key={idx} style={{ fontSize: '0.84rem', lineHeight: '1.5', color: '#7f1d1d' }}>
                                        <MarkdownText content={item} />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Recommended Next Steps */}
                              {Array.isArray(msg.structuredData.recommended_next_steps) && msg.structuredData.recommended_next_steps.length > 0 && (
                                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px' }}>
                                  <h5 style={{ margin: '0 0 6px 0', fontSize: '0.84rem', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Check size={14} style={{ color: '#16a34a' }} /> Recommended Next Steps
                                  </h5>
                                  <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {msg.structuredData.recommended_next_steps.map((item, idx) => (
                                      <li key={idx} style={{ fontSize: '0.84rem', lineHeight: '1.5', color: '#14532d' }}>
                                        <MarkdownText content={item} />
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}

                              {/* Medical Sources */}
                              {Array.isArray(msg.structuredData.medical_sources) && msg.structuredData.medical_sources.length > 0 && (
                                <div style={{ paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                                  <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                    Verified Medical References:
                                  </span>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {msg.structuredData.medical_sources.map((src, sIdx) => (
                                      <a
                                        key={sIdx}
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '3px 8px',
                                          borderRadius: '6px',
                                          backgroundColor: '#f1f5f9',
                                          color: '#0369a1',
                                          fontSize: '0.78rem',
                                          textDecoration: 'none',
                                          fontWeight: 500,
                                          border: '1px solid #e2e8f0'
                                        }}
                                        title={src.title}
                                      >
                                        <Check size={11} style={{ color: '#10b981' }} />
                                        <span>{src.organization}: {src.title.length > 34 ? `${src.title.slice(0, 34)}...` : src.title}</span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Disclaimer */}
                              <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic', lineHeight: '1.4' }}>
                                Disclaimer: {msg.structuredData.disclaimer || 'JIVEXA Health AI is an educational assistant and does not provide formal diagnosis or treatment.'}
                              </div>
                            </div>
                          ) : (
                            <div className="bubble-text-content">
                              <MarkdownText content={msg.text} isUser={isUser} />
                            </div>
                          )}

                          {/* Message Timestamp */}
                          <div className={`message-timestamp ${isUser ? 'user-time' : 'ai-time'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>

                          {!isUser && msg.errorCode && !isLoading && (
                            <div className="chat-error-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  const convMsgs = activeConv.messages;
                                  const currentIdx = convMsgs.findIndex(m => m.id === msg.id);
                                  const lastUser = currentIdx > 0 ? convMsgs[currentIdx - 1] : null;
                                  if (lastUser && lastUser.sender === 'user') {
                                    handleSendMessage(lastUser.text);
                                  }
                                }}
                                className="chat-retry-pill-btn"
                              >
                                <RefreshCw size={13} className="retry-btn-icon" />
                                <span>Retry Question</span>
                              </button>
                            </div>
                          )}

                        </div>

                      </div>
                    </div>
                  );
                })}

                <div ref={chatEndRef} />
              </div>
            )}

          </div>

          {/* FOLLOW-UP QUICK PROMPTS (ONLY WHEN AI FINISHED RESPONDING TO CLINICAL TOPICS) */}
          {activeConv && activeConv.messages.length >= 2 && !isLoading && (() => {
            const lastAiMsg = activeConv.messages[activeConv.messages.length - 1];
            const lastUserMsg = [...activeConv.messages].reverse().find(m => m.sender === 'user');
            if (lastAiMsg.sender !== 'ai' || !lastUserMsg) return null;
            
            // If the latest message had an error, DO NOT SHOW SUGGESTIONS!
            if (lastAiMsg.errorCode) return null;

            const userText = lastUserMsg.text.toLowerCase().trim();
            const casualKeywords = [
              'hi', 'hello', 'hey', 'namaste', 'naam', 'name', 'who', 'kaun',
              'kaise', 'how are you', 'thank', 'dhanyawad', 'shukriya', 'bye', 'ok', 'okay', 'yes', 'no'
            ];
            const isCasual = casualKeywords.some(k => userText.includes(k));
            if (isCasual) return null;

            // Use the context-aware suggestions predicted for this response
            const displaySuggestions = (Array.isArray(lastAiMsg.suggestions) && lastAiMsg.suggestions.length > 0)
              ? lastAiMsg.suggestions
              : [];

            if (displaySuggestions.length === 0) return null;

            return (
              <div className="followup-prompts-bar" role="region" aria-label="Suggested follow-up questions">
                <span className="followup-prompts-label">
                  <Sparkles size={12} style={{ color: '#059669' }} />
                  Suggested follow-up questions:
                </span>
                <div className="followup-chips-container">
                  {displaySuggestions.map((q, idx) => (
                    <button 
                      key={idx}
                      type="button"
                      data-prompt={q}
                      aria-label={q}
                      title={q}
                      disabled={isLoading}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isLoading) {
                          handleSendMessage(q);
                        }
                      }}
                      className="followup-prompt-chip"
                    >
                      <Sparkles size={12} className="chip-sparkle" />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* INPUT FORM: APPLE-STYLE FLOATING PILL COMPOSER */}
          <div className="chat-composer-wrapper">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputMessage); }}
              className="chat-composer-form"
            >
              <div className="composer-input-pill">
                <input 
                  ref={inputRef}
                  placeholder={isLoading ? "JIVEXA Health AI is analyzing your medical query..." : "Ask JIVEXA Health AI anything (symptoms, lab reports, medications)..."}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isLoading}
                  className="composer-input-field"
                />
                
                <button 
                  type="submit" 
                  disabled={isLoading || !inputMessage.trim()} 
                  className={`composer-send-btn ${inputMessage.trim() ? 'active' : ''}`}
                  aria-label="Send query"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ArrowUp size={18} strokeWidth={2.5} />
                  )}
                </button>
              </div>

              <div className="composer-security-footer">
                <span>🔒 Confidential healthcare channel · Not a substitute for primary emergency services</span>
              </div>
            </form>
          </div>

        </main>

      </div>


      {/* APPLE-INSPIRED STYLESHEET */}
      <style>{`
        /* Root container */
        .jivexa-ai-wrapper {
          width: 100%;
          max-width: 1360px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: calc(100vh - var(--header-height, 62px) - 24px);
          min-height: 580px;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        /* Top Bar */
        .jivexa-ai-topbar {
          background: linear-gradient(135deg, #064e3b 0%, #0f766e 55%, #059669 100%);
          border-radius: 16px;
          padding: 12px 20px;
          color: white;
          box-shadow: 0 6px 20px -4px rgba(15, 118, 110, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(20px);
        }

        .topbar-branding {
          display: flex;
          align-items: center;
          gap: 14px;
          z-index: 1;
        }

        .avatar-orb {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.16);
          border: 1px solid rgba(255, 255, 255, 0.28);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          backdrop-filter: blur(12px);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
        }

        .avatar-icon {
          color: #ffffff;
        }

        .live-status-dot {
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: #34d399;
          border: 2px solid #064e3b;
          box-shadow: 0 0 6px #34d399;
        }

        .topbar-titles {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .topbar-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .topbar-title {
          font-size: 1.15rem;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .clinical-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.24);
          padding: 2px 8px;
          border-radius: 16px;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .pulse-beacon {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: #34d399;
          animation: pulseBeacon 2s infinite ease-in-out;
        }

        @keyframes pulseBeacon {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }

        .topbar-subtitle {
          color: rgba(255, 255, 255, 0.88);
          font-size: 0.78rem;
          margin: 0;
          font-weight: 450;
        }

        .topbar-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 1;
        }

        .topbar-new-chat-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.32);
          color: #ffffff;
          font-size: 0.78rem;
          font-weight: 700;
          padding: 6px 13px;
          border-radius: 10px;
          cursor: pointer;
          backdrop-filter: blur(10px);
          transition: all 0.2s ease;
        }

        .topbar-new-chat-btn:hover {
          background: #ffffff;
          color: #064e3b;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .mobile-sidebar-toggle {
          display: none;
          padding: 6px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.18);
          color: white;
          font-weight: 700;
          font-size: 0.78rem;
          cursor: pointer;
          align-items: center;
          gap: 5px;
        }

        /* Main Split */
        .jivexa-chat-split {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 14px;
          flex: 1;
          min-height: 0;
          position: relative;
        }

        /* Left Sidebar: Conversation Archive */
        .jivexa-sidebar {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
        }

        .new-chat-btn {
          height: 40px;
          background: linear-gradient(135deg, #059669 0%, #0d9488 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 3px 10px -2px rgba(5, 150, 105, 0.35);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .new-chat-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px -2px rgba(5, 150, 105, 0.45);
        }

        .sidebar-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 11px;
          color: #94a3b8;
          pointer-events: none;
        }

        .sidebar-search-input {
          width: 100%;
          height: 36px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 0 30px 0 32px;
          font-size: 0.80rem;
          color: #0f172a;
          outline: none;
          transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
        }

        .sidebar-search-input:focus {
          border-color: #059669;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
        }

        .search-clear-btn {
          position: absolute;
          right: 9px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .sidebar-chat-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-right: 2px;
        }

        .empty-history-state {
          padding: 28px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
        }

        .empty-history-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: #ecfdf5;
          color: #059669;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-history-title {
          font-size: 0.86rem;
          font-weight: 750;
          color: #1e293b;
          margin: 0;
        }

        .empty-history-desc {
          font-size: 0.74rem;
          color: #64748b;
          line-height: 1.4;
          margin: 0;
        }

        .start-first-chat-btn {
          margin-top: 6px;
          padding: 6px 13px;
          border-radius: 8px;
          border: 1px solid #059669;
          background: #ecfdf5;
          color: #059669;
          font-size: 0.76rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .start-first-chat-btn:hover {
          background: #059669;
          color: white;
        }

        .sidebar-conv-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 11px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          gap: 8px;
        }

        .sidebar-conv-card:hover {
          background: #f8fafc;
          border-color: #f1f5f9;
        }

        .sidebar-conv-card.active {
          background: #ecfdf5;
          border-color: #a7f3d0;
          border-left: 3px solid #059669;
          box-shadow: 0 1px 4px rgba(5, 150, 105, 0.08);
        }

        .conv-indicator {
          color: #94a3b8;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .sidebar-conv-card.active .conv-indicator {
          color: #059669;
        }

        .conv-metadata {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .conv-title {
          font-size: 0.81rem;
          font-weight: 600;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-conv-card.active .conv-title {
          font-weight: 750;
          color: #047857;
        }

        .conv-subinfo {
          font-size: 0.67rem;
          color: #94a3b8;
        }

        .conv-delete-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 3px;
          border-radius: 6px;
          opacity: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;
        }

        .sidebar-conv-card:hover .conv-delete-btn,
        .sidebar-conv-card.active .conv-delete-btn {
          opacity: 0.7;
        }

        .conv-delete-btn:hover {
          opacity: 1 !important;
          color: #ef4444 !important;
          background: #fee2e2;
        }

        .sidebar-footer {
          border-top: 1px solid #f1f5f9;
          padding-top: 6px;
          display: flex;
          justify-content: center;
        }

        .clear-all-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.73rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 3px 6px;
          border-radius: 6px;
          transition: color 0.15s ease;
        }

        .clear-all-btn:hover {
          color: #ef4444;
        }

        /* Right Chat Workspace */
        .jivexa-chat-main {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
        }

        /* Active Chat Sub-Header */
        .chat-viewport-header {
          padding: 10px 18px;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .viewport-status {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .viewport-avatar {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: #ecfdf5;
          color: #059669;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #a7f3d0;
        }

        .viewport-labels {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .viewport-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .viewport-name {
          font-size: 0.88rem;
          font-weight: 750;
          color: #0f172a;
        }

        .live-pill {
          font-size: 0.63rem;
          font-weight: 750;
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #a7f3d0;
          border-radius: 10px;
          padding: 1px 6px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .viewport-model-label {
          font-size: 0.70rem;
          color: #64748b;
        }

        .viewport-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .viewport-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 5px 11px;
          font-size: 0.76rem;
          font-weight: 700;
          color: #059669;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .viewport-action-btn:hover {
          background: #ecfdf5;
          border-color: #a7f3d0;
        }

        /* Scrollable Message List */
        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: #fcfdfd;
        }

        /* Compact Medical Disclaimer Banner */
        .clinical-advisory-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .advisory-icon {
          color: #059669;
          flex-shrink: 0;
        }

        .advisory-content {
          font-size: 0.73rem;
          color: #64748b;
          line-height: 1.4;
        }

        .advisory-title {
          font-weight: 700;
          color: #1e293b;
          margin-right: 4px;
        }

        /* Empty Hero Welcome Screen */
        .chat-empty-hero {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 16px 8px;
          gap: 16px;
          max-width: 680px;
          margin: 0 auto;
          width: 100%;
        }

        .hero-emblem-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hero-emblem-glow {
          position: absolute;
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, transparent 70%);
          filter: blur(8px);
        }

        .hero-emblem {
          width: 50px;
          height: 50px;
          border-radius: 15px;
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 20px -3px rgba(5, 150, 105, 0.38);
          position: relative;
          z-index: 1;
        }

        .hero-headings {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
        }

        .hero-eyebrow {
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #059669;
        }

        .hero-title {
          font-size: 1.35rem;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .hero-desc {
          font-size: 0.83rem;
          color: #64748b;
          margin: 0;
          max-width: 520px;
          line-height: 1.45;
        }

        /* 4 Suggestion Cards */
        .hero-suggestions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          width: 100%;
        }

        .suggestion-apple-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.02);
        }

        .suggestion-apple-card:hover {
          border-color: #059669;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px -3px rgba(5, 150, 105, 0.14);
          background: #fcfffd;
        }

        .card-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .card-icon-bubble {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: #ecfdf5;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #059669;
        }

        .card-category-badge {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #047857;
          background: #f0fdf4;
          padding: 2px 7px;
          border-radius: 6px;
          border: 1px solid #dcfce7;
        }

        .card-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .card-title {
          font-size: 0.86rem;
          font-weight: 750;
          color: #0f172a;
          margin: 0;
        }

        .card-subtext {
          font-size: 0.73rem;
          color: #64748b;
          margin: 0;
          line-height: 1.35;
        }

        .card-arrow-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 3px;
          border-top: 1px solid #f1f5f9;
        }

        .card-cta-label {
          font-size: 0.70rem;
          font-weight: 700;
          color: #059669;
        }

        .card-arrow {
          color: #94a3b8;
          transition: transform 0.2s ease, color 0.2s ease;
        }

        .suggestion-apple-card:hover .card-arrow {
          color: #059669;
          transform: translateX(3px);
        }

        /* Trending Starter Chips */
        .quick-starter-section {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: center;
        }

        .quick-starter-label {
          font-size: 0.68rem;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #94a3b8;
        }

        .quick-starter-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
        }

        .quick-starter-chip {
          padding: 5px 12px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 0.74rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .quick-starter-chip:hover {
          background: #ecfdf5;
          border-color: #a7f3d0;
          color: #047857;
          transform: translateY(-1px);
        }

        /* Active Messages */
        .messages-stream {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
        }

        .message-row {
          display: flex;
          width: 100%;
          animation: appleBubbleIn 0.20s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes appleBubbleIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .user-row {
          justify-content: flex-end;
        }

        .ai-row {
          justify-content: flex-start;
        }

        .message-bubble-container {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          max-width: 82%;
        }

        .user-container {
          flex-direction: row-reverse;
          max-width: 76%;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .user-avatar {
          background: #f1f5f9;
          color: #059669;
          border: 1px solid #e2e8f0;
        }

        .ai-avatar {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          box-shadow: 0 2px 8px -1px rgba(5, 150, 105, 0.3);
        }

        .speech-bubble {
          padding: 12px 16px;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .user-bubble {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          color: #ffffff;
          border-radius: 16px 16px 4px 16px;
          box-shadow: 0 3px 10px -2px rgba(5, 150, 105, 0.25);
        }

        .ai-bubble {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          border-radius: 16px 16px 16px 4px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
        }

        .emergency-bubble {
          border-color: #fca5a5 !important;
          background: #fff5f5 !important;
        }

        .ai-bubble-meta-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 5px;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 3px;
        }

        .ai-meta-identity {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ai-meta-name {
          font-size: 0.74rem;
          font-weight: 750;
          color: #059669;
        }

        .ai-meta-model {
          font-size: 0.64rem;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 5px;
          font-weight: 600;
        }

        .copy-bubble-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.69rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 5px;
          border-radius: 5px;
          transition: all 0.15s ease;
        }

        .copy-bubble-btn:hover {
          color: #059669;
          background: #f1f5f9;
        }

        /* Emergency warning block */
        .emergency-alert-card {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 9px 12px;
          display: flex;
          gap: 9px;
          align-items: flex-start;
          margin-bottom: 6px;
        }

        .emergency-alert-icon {
          color: #dc2626;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .emergency-alert-body {
          font-size: 0.74rem;
          color: #991b1b;
          line-height: 1.4;
        }

        .emergency-alert-body strong {
          display: block;
          font-size: 0.80rem;
          margin-bottom: 2px;
          color: #b91c1c;
        }

        .bubble-text-content {
          font-size: 0.90rem;
          line-height: 1.6;
        }

        .message-timestamp {
          font-size: 0.65rem;
          font-weight: 500;
          margin-top: 2px;
        }

        .user-time {
          color: rgba(255, 255, 255, 0.7);
          text-align: right;
        }

        .ai-time {
          color: #94a3b8;
        }

        /* AI Typing Indicator */
        .ai-typing-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 4px;
        }

        .typing-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #059669;
          animation: dotPulse 1.2s infinite ease-in-out;
        }

        .dot-1 { animation-delay: 0s; }
        .dot-2 { animation-delay: 0.2s; }
        .dot-3 { animation-delay: 0.4s; }

        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.35; }
          40% { transform: scale(1.15); opacity: 1; }
        }

        .typing-text {
          font-size: 0.74rem;
          font-weight: 600;
          color: #059669;
          margin-left: 3px;
        }

        /* Followup Prompts Bar */
        .followup-prompts-bar {
          padding: 8px 18px 10px 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #f8fafc;
          border-top: 1px solid #f1f5f9;
        }

        .followup-prompts-label {
          font-size: 0.70rem;
          font-weight: 750;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .followup-chips-container {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .followup-prompt-chip {
          padding: 5px 12px;
          border-radius: 9999px;
          border: 1px solid #a7f3d0;
          background: #ffffff;
          font-size: 0.76rem;
          font-weight: 600;
          color: #047857;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
          transition: all 0.2s ease;
        }

        .followup-prompt-chip:hover {
          background: #ecfdf5;
          border-color: #6ee7b7;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(5, 150, 105, 0.12);
        }

        .followup-prompt-chip:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .chat-error-actions {
          margin-top: 6px;
          display: flex;
          align-items: center;
        }

        .chat-retry-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 11px;
          font-size: 0.73rem;
          font-weight: 600;
          color: #dc2626;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .chat-retry-pill-btn:hover {
          background: #fee2e2;
          border-color: #fca5a5;
          transform: translateY(-1px);
        }

        .retry-btn-icon {
          color: #dc2626;
        }

        .chip-sparkle {
          color: #059669;
          flex-shrink: 0;
        }

        /* Pill Composer */
        .chat-composer-wrapper {
          padding: 10px 18px;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
        }

        .chat-composer-form {
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 100%;
        }

        .composer-input-pill {
          display: flex;
          align-items: center;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 20px;
          padding: 3px 5px 3px 16px;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.02);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .composer-input-pill:focus-within {
          border-color: #059669;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
        }

        .composer-input-field {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.90rem;
          color: #0f172a;
          padding: 7px 4px;
          font-family: inherit;
        }

        .composer-input-field::placeholder {
          color: #94a3b8;
        }

        .composer-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: #e2e8f0;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: not-allowed;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }

        .composer-send-btn.active {
          background: linear-gradient(135deg, #059669 0%, #0d9488 100%);
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 3px 10px rgba(5, 150, 105, 0.35);
        }

        .composer-send-btn.active:hover {
          transform: scale(1.05);
        }

        .composer-security-footer {
          font-size: 0.67rem;
          color: #94a3b8;
          text-align: center;
          font-weight: 500;
        }

        /* Mobile Drawer Header and Backdrop */
        .sidebar-backdrop {
          display: none;
        }

        .sidebar-mobile-header {
          display: none;
        }

        .hero-emblem-icon {
          width: 28px;
          height: 28px;
        }

        .card-svg-icon {
          width: 18px;
          height: 18px;
        }

        /* Responsive Tablet Breakpoint (max-width: 860px) */
        @media (max-width: 860px) {
          .jivexa-ai-wrapper {
            height: auto;
            min-height: calc(100vh - 110px);
            width: 100%;
            max-width: 100%;
            margin: 0;
            padding: 0;
          }

          .jivexa-chat-split {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .mobile-sidebar-toggle {
            display: inline-flex;
          }

          .hero-suggestions-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .btn-label-desktop {
            display: none;
          }

          .message-bubble-container {
            max-width: 92%;
          }

          .user-container {
            max-width: 90%;
          }

          .sidebar-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.45);
            backdrop-filter: blur(2px);
            z-index: 998;
          }

          .jivexa-sidebar {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 82%;
            max-width: 320px;
            height: 100vh;
            z-index: 999;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
            border-radius: 0 16px 16px 0;
            background: #ffffff;
          }

          .jivexa-sidebar.sidebar-mobile-open {
            display: flex;
          }

          .sidebar-mobile-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 8px;
            border-bottom: 1px solid #f1f5f9;
          }

          .sidebar-mobile-title-wrap {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #059669;
          }

          .sidebar-mobile-title {
            font-size: 0.86rem;
            font-weight: 750;
            color: #0f172a;
          }

          .sidebar-close-btn {
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 5px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .sidebar-close-btn:hover {
            background: #f1f5f9;
            color: #0f172a;
          }
        }

        /* Mobile Phone Breakpoint (max-width: 480px) */
        @media (max-width: 480px) {
          .jivexa-ai-wrapper {
            gap: 8px;
            min-height: 0;
            overflow-x: hidden;
            width: 100%;
          }

          .jivexa-ai-topbar {
            padding: 10px 12px;
            border-radius: 12px;
            gap: 6px;
          }

          .topbar-branding {
            gap: 9px;
            min-width: 0;
            flex: 1;
          }

          .avatar-orb {
            width: 34px;
            height: 34px;
            min-width: 34px;
            border-radius: 9px;
          }

          .avatar-icon {
            width: 17px;
            height: 17px;
          }

          .topbar-title {
            font-size: 1rem;
            line-height: 1.2;
          }

          .clinical-pill {
            font-size: 0.60rem;
            padding: 2px 6px;
            border-radius: 8px;
          }

          .topbar-subtitle {
            font-size: 0.72rem;
            line-height: 1.3;
          }

          .mobile-sidebar-toggle {
            padding: 5px 9px;
            border-radius: 8px;
            font-size: 0.74rem;
            min-height: 32px;
          }

          .jivexa-chat-main {
            border-radius: 14px;
          }

          .chat-viewport-header {
            padding: 8px 10px;
          }

          .viewport-avatar {
            width: 28px;
            height: 28px;
            min-width: 28px;
            border-radius: 7px;
          }

          .viewport-name {
            font-size: 0.80rem;
          }

          .chat-messages-container {
            padding: 8px 10px;
            gap: 10px;
          }

          .hero-title {
            font-size: 1.10rem;
          }

          .hero-desc {
            font-size: 0.76rem;
          }

          .suggestion-apple-card {
            padding: 11px 12px;
            border-radius: 12px;
          }

          .chat-composer-wrapper {
            padding: 6px 8px;
          }

          .composer-input-pill {
            padding: 2px 3px 2px 10px;
            border-radius: 16px;
            min-height: 38px;
          }

          .composer-send-btn {
            width: 32px;
            height: 32px;
            min-width: 32px;
          }

          .message-bubble-container {
            max-width: 95%;
          }

          .user-container {
            max-width: 90%;
          }

          .speech-bubble {
            padding: 9px 12px;
            border-radius: 12px;
          }

          .bubble-text-content {
            font-size: 0.86rem;
          }
        }
      `}</style>
    </div>
  );
};