import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MarkdownText } from '../../components/common/MarkdownText';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { 
  streamAIHealthAssistant, 
  fetchBackendConversations,
  saveBackendConversation,
  deleteBackendConversation,
  clearAllBackendConversations,
  StructuredMedicalData
} from '../../services/ai';
import { 
  MessageSquare, Plus, Search, Trash2,
  AlertTriangle, ShieldCheck, Check, Loader2, Sparkles, User,
  FileText, Activity, Pill, Stethoscope, X, ChevronRight, HeartPulse,
  Copy, ArrowUp, RefreshCw
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
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef<boolean>(false);

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
    chatEndRef.current?.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth' });
  }, [conversations, activeConvId, isLoading]);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const startNewConversation = (initialTitle = 'New Conversation') => {
    if (isLoading) return;
    if (activeConv && activeConv.messages.length === 0) {
      setIsMobileSidebarOpen(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
      return;
    }
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

  const handleCopyMessage = async (id: string, text: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (e) {
        console.warn('[Copy Error]:', e);
        return;
      }
    }
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSendMessage = async (textToSend: string, options?: { retryAiMsgId?: string }) => {
    const cleanText = textToSend.trim();
    if (!cleanText || isLoading || isSendingRef.current) return;
    isSendingRef.current = true;

    let currentConvId = activeConvId;
    let currentConvs = [...conversations];

    if (!currentConvId) {
      const newId = `chat_${Date.now()}`;
      const newTitle = cleanText.slice(0, 32) + (cleanText.length > 32 ? '...' : '');
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
    if (targetConvIndex === -1) {
      isSendingRef.current = false;
      return;
    }

    const targetConv = { ...currentConvs[targetConvIndex] };
    let historySourceMessages = targetConv.messages;
    let excludeUserIdForHistory: string | null = null;

    if (options?.retryAiMsgId) {
      // On retry: strip the failed AI message and reuse the existing user turn instead of duplicating it
      const failedIdx = targetConv.messages.findIndex(m => m.id === options.retryAiMsgId);
      const baseMessages = failedIdx >= 0
        ? targetConv.messages.filter(m => m.id !== options.retryAiMsgId)
        : targetConv.messages;
      targetConv.messages = baseMessages;
      historySourceMessages = failedIdx > 0 ? baseMessages.slice(0, failedIdx - 1) : [];
    } else {
      const userMsg: ChatMessage = {
        id: `msg_user_${Date.now()}`,
        sender: 'user',
        text: cleanText,
        timestamp: new Date()
      };
      excludeUserIdForHistory = userMsg.id;
      targetConv.messages = [...targetConv.messages, userMsg];
      historySourceMessages = targetConv.messages;
    }

    targetConv.lastUpdated = new Date();
    
    if (targetConv.title === 'New Conversation' || targetConv.title.startsWith('chat_')) {
      targetConv.title = cleanText.slice(0, 32) + (cleanText.length > 32 ? '...' : '');
    }

    currentConvs[targetConvIndex] = targetConv;
    const sorted = [
      targetConv,
      ...currentConvs.filter((c) => c.id !== currentConvId)
    ];

    // Local state & localStorage updated immediately; backend auto-persists in /api/ai/chat
    setConversations(sorted);
    localStorage.setItem(`jivexa_chats_${user?.id}`, JSON.stringify(
      sorted.map(c => ({ ...c, messages: c.messages.filter(m => typeof m.text === 'string' && m.text.trim().length > 0) }))
    ));
    if (!options?.retryAiMsgId) {
      setInputMessage('');
    }
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
      // Construct clean prior conversation history (excluding empty/error text and the current user message)
      const cleanHistory = historySourceMessages
        .filter(m => m.id !== excludeUserIdForHistory && !m.errorCode && typeof m.text === 'string' && m.text.trim().length > 0)
        .map(m => ({ sender: m.sender, text: m.text.trim() }));

      const responseResult = await streamAIHealthAssistant(
        cleanText,
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

      // Finalize streaming message state (use sanitized responseResult.text if provided)
      const finalAiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: responseResult?.text || streamingText || 'JIVEXA Assistant provided no response.',
        timestamp: new Date(),
        provider: responseResult?.provider || currentProvider,
        isEmergency: responseResult?.isEmergency ?? isEmergencyFlag,
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
        localStorage.setItem(`jivexa_chats_${user?.id}`, JSON.stringify(
          updated.map(c => ({ ...c, messages: c.messages.filter(m => typeof m.text === 'string' && m.text.trim().length > 0) }))
        ));
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
      isSendingRef.current = false;
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
    setIsClearConfirmOpen(false);
    setIsMobileSidebarOpen(false);
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

          {/* Primary New Chat Button */}
          <button 
            type="button"
            onClick={() => startNewConversation()} 
            disabled={isLoading}
            className="new-chat-btn"
          >
            <Plus size={18} />
            <span>New Chat</span>
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
                onClick={() => setIsClearConfirmOpen(true)}
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
                  Google Gemini · Patient-Friendly Health Educator
                </span>
              </div>
            </div>

            <div className="viewport-controls">
              {activeConv && activeConv.messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => startNewConversation()}
                  disabled={isLoading}
                  className="viewport-action-btn viewport-mobile-only"
                  title="Start a new chat"
                >
                  <Plus size={15} />
                  <span>New Chat</span>
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
                                {msg.isStreaming ? (
                                  <span className="ai-streaming-badge">
                                    <span className="streaming-pulse-dot" />
                                    Typing...
                                  </span>
                                ) : msg.provider ? (
                                  <span className="ai-meta-model">{msg.provider}</span>
                                ) : null}
                              </div>
                              
                              {!msg.isStreaming && msg.text && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, msg.text)}
                                  className={`copy-bubble-btn ${isCopied ? 'copied' : ''}`}
                                  title="Copy response"
                                  aria-label="Copy response"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check size={12} />
                                      <span>Copied</span>
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
                                  Please call <strong>112</strong> (Emergency) or <strong>108</strong> (Ambulance), or visit the nearest hospital emergency department immediately.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Bubble Content / Loading & Typing Indicator */}
                          {!isUser && (!msg.text || !msg.text.trim()) ? (
                            <div className="ai-typing-indicator" role="status" aria-live="polite">
                              <div className="typing-dots-row">
                                <span className="typing-dot dot-1" />
                                <span className="typing-dot dot-2" />
                                <span className="typing-dot dot-3" />
                                <span className="typing-text">JIVEXA Health AI is typing...</span>
                              </div>
                              <div className="typing-shimmer-lines">
                                <span className="shimmer-line shimmer-long" />
                                <span className="shimmer-line shimmer-short" />
                              </div>
                            </div>
                          ) : (
                            <div className="bubble-text-content">
                              <MarkdownText content={msg.text} isUser={isUser} />

                              {!isUser && !msg.isStreaming && Array.isArray(msg.structuredData?.medical_sources) && msg.structuredData.medical_sources.length > 0 && (
                                <div className="verified-sources-wrap">
                                  <span className="verified-sources-label">Sources:</span>
                                  <div className="verified-sources-list">
                                    {msg.structuredData.medical_sources.map((src, sIdx) => (
                                      <a
                                        key={sIdx}
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="verified-source-pill"
                                        title={src.title}
                                      >
                                        <Check size={11} />
                                        <span>{src.organization}</span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {!isUser && !msg.isStreaming && msg.structuredData?.disclaimer && !msg.errorCode && (
                                <div className="ai-subtle-disclaimer">
                                  {msg.structuredData.disclaimer}
                                </div>
                              )}
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
                                  if (isSendingRef.current || isLoading) return;
                                  const convMsgs = activeConv.messages;
                                  const currentIdx = convMsgs.findIndex(m => m.id === msg.id);
                                  const lastUser = currentIdx > 0 ? convMsgs[currentIdx - 1] : null;
                                  if (lastUser && lastUser.sender === 'user') {
                                    handleSendMessage(lastUser.text, { retryAiMsgId: msg.id });
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
            const casualPatterns = [
              /^(hi|hello|hey|namaste|ok|okay|yes|no|thanks|thank you|dhanyawad|shukriya|bye)[!.\s]*$/i,
              /\b(mera naam|what is my name|who are you|tum kaun ho|kaise ho|how are you)\b/i
            ];
            if (casualPatterns.some(p => p.test(userText))) return null;

            // Use the context-aware suggestions predicted for this response (capped nicely)
            const displaySuggestions = (Array.isArray(lastAiMsg.suggestions) && lastAiMsg.suggestions.length > 0)
              ? lastAiMsg.suggestions.slice(0, 3)
              : [];

            if (displaySuggestions.length === 0) return null;

            return (
              <div className="followup-prompts-bar" role="region" aria-label="Suggested follow-up questions">
                <span className="followup-prompts-label">
                  <Sparkles size={12} style={{ color: 'var(--primary)' }} />
                  Suggested follow-up:
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

      {/* CLEAR ALL HISTORY CONFIRMATION MODAL */}
      <Modal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        title="Clear All Chat History?"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.6', color: 'var(--text-muted)' }}>
            This will permanently delete all your saved JIVEXA Health AI consultations from this device and your account. This action cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsClearConfirmOpen(false)}
              style={{ borderRadius: '10px' }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={clearAllConversations}
              style={{
                borderRadius: '10px',
                backgroundColor: '#dc2626',
                borderColor: '#dc2626',
                color: '#ffffff'
              }}
            >
              Clear All History
            </Button>
          </div>
        </div>
      </Modal>


      {/* JIVEXA EMERALD/TEAL CHAT STYLESHEET */}
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
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
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

        .new-chat-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px -2px rgba(5, 150, 105, 0.45);
        }

        .new-chat-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .sidebar-search-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 11px;
          color: var(--text-light);
          pointer-events: none;
        }

        .sidebar-search-input {
          width: 100%;
          height: 36px;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0 30px 0 32px;
          font-size: 0.80rem;
          color: var(--text-main);
          outline: none;
          transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
        }

        .sidebar-search-input:focus {
          border-color: var(--primary);
          background: var(--surface);
          box-shadow: 0 0 0 3px var(--ring-focus);
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
          color: var(--text-main);
          margin: 0;
        }

        .empty-history-desc {
          font-size: 0.74rem;
          color: var(--text-muted);
          line-height: 1.4;
          margin: 0;
        }

        .start-first-chat-btn {
          margin-top: 6px;
          padding: 6px 13px;
          border-radius: 8px;
          border: 1px solid var(--primary);
          background: var(--primary-light);
          color: var(--primary);
          font-size: 0.76rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .start-first-chat-btn:hover {
          background: var(--primary);
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
          background: var(--surface-raised);
          border-color: var(--border);
        }

        .sidebar-conv-card.active {
          background: var(--primary-light);
          border-color: rgba(5, 150, 105, 0.35);
          border-left: 3px solid var(--primary);
          box-shadow: 0 1px 4px rgba(5, 150, 105, 0.08);
        }

        .conv-indicator {
          color: var(--text-light);
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .sidebar-conv-card.active .conv-indicator {
          color: var(--primary);
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
          color: var(--text-main);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-conv-card.active .conv-title {
          font-weight: 750;
          color: var(--primary);
        }

        .conv-subinfo {
          font-size: 0.67rem;
          color: var(--text-light);
        }

        .conv-delete-btn {
          background: transparent;
          border: none;
          color: var(--text-light);
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
          background: var(--error-light);
        }

        .sidebar-footer {
          border-top: 1px solid var(--border);
          padding-top: 8px;
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
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          box-shadow: var(--shadow-sm);
        }

        /* Active Chat Sub-Header */
        .chat-viewport-header {
          padding: 10px 18px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
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
          background: var(--primary-light);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(5, 150, 105, 0.25);
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
          color: var(--text-main);
        }

        .live-pill {
          font-size: 0.63rem;
          font-weight: 750;
          background: var(--primary-light);
          color: var(--primary);
          border: 1px solid rgba(5, 150, 105, 0.25);
          border-radius: 10px;
          padding: 1px 6px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .viewport-model-label {
          font-size: 0.70rem;
          color: var(--text-muted);
        }

        .viewport-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .viewport-mobile-only {
          display: none;
        }

        .viewport-action-btn {
          align-items: center;
          gap: 5px;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 5px 11px;
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--primary);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .viewport-action-btn:hover {
          background: var(--primary-light);
          border-color: var(--primary);
        }

        /* Scrollable Message List */
        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: var(--background);
        }

        /* Compact Medical Disclaimer Banner */
        .clinical-advisory-banner {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .advisory-icon {
          color: var(--primary);
          flex-shrink: 0;
        }

        .advisory-content {
          font-size: 0.73rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        .advisory-title {
          font-weight: 700;
          color: var(--text-main);
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
          color: var(--text-main);
          margin: 0;
          letter-spacing: -0.02em;
        }

        .hero-desc {
          font-size: 0.83rem;
          color: var(--text-muted);
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
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 14px;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: var(--shadow-sm);
        }

        .suggestion-apple-card:hover {
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px -3px rgba(5, 150, 105, 0.16);
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
          background: var(--primary-light);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
        }

        .card-category-badge {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--primary);
          background: var(--primary-light);
          padding: 2px 7px;
          border-radius: 6px;
          border: 1px solid rgba(5, 150, 105, 0.2);
        }

        .card-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .card-title {
          font-size: 0.86rem;
          font-weight: 750;
          color: var(--text-main);
          margin: 0;
        }

        .card-subtext {
          font-size: 0.73rem;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.35;
        }

        .card-arrow-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 3px;
          border-top: 1px solid var(--border);
        }

        .card-cta-label {
          font-size: 0.70rem;
          font-weight: 700;
          color: var(--primary);
        }

        .card-arrow {
          color: var(--text-light);
          transition: transform 0.2s ease, color 0.2s ease;
        }

        .suggestion-apple-card:hover .card-arrow {
          color: var(--primary);
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
          color: var(--text-light);
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
          background: var(--surface);
          border: 1px solid var(--border);
          font-size: 0.74rem;
          font-weight: 600;
          color: var(--text-main);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .quick-starter-chip:hover {
          background: var(--primary-light);
          border-color: var(--primary);
          color: var(--primary);
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
          padding: 13px 17px;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-width: 72ch;
        }

        .user-bubble {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          color: #ffffff;
          border-radius: 18px 18px 4px 18px;
          box-shadow: 0 4px 12px -2px rgba(5, 150, 105, 0.28);
        }

        .ai-bubble {
          background: var(--surface);
          color: var(--text-main);
          border: 1px solid var(--border);
          border-left: 3px solid var(--primary);
          border-radius: 18px 18px 18px 4px;
          box-shadow: var(--shadow-sm);
        }

        .emergency-bubble {
          border-color: #fca5a5 !important;
          border-left: 4px solid #dc2626 !important;
          background: #fff5f5 !important;
          color: #7f1d1d !important;
        }

        .ai-bubble-meta-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 4px;
        }

        .ai-meta-identity {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .ai-meta-name {
          font-size: 0.75rem;
          font-weight: 750;
          color: var(--primary);
        }

        .ai-meta-model {
          font-size: 0.64rem;
          color: var(--text-muted);
          background: var(--surface-raised);
          padding: 2px 7px;
          border-radius: 6px;
          font-weight: 600;
        }

        .ai-streaming-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.66rem;
          font-weight: 700;
          color: #047857;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          padding: 2px 8px;
          border-radius: 9999px;
        }

        .streaming-pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          animation: dotPulse 1s infinite ease-in-out;
        }

        .copy-bubble-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-light);
          font-size: 0.70rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 7px;
          border-radius: 6px;
          transition: all 0.15s ease;
        }

        .copy-bubble-btn:hover,
        .copy-bubble-btn.copied {
          color: var(--primary);
          background: var(--primary-light);
          border-color: rgba(5, 150, 105, 0.25);
        }

        /* Emergency warning block */
        .emergency-alert-card {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          gap: 9px;
          align-items: flex-start;
          margin-bottom: 4px;
        }

        .emergency-alert-icon {
          color: #dc2626;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .emergency-alert-body {
          font-size: 0.78rem;
          color: #991b1b;
          line-height: 1.45;
        }

        .emergency-alert-body strong {
          display: inline;
          color: #b91c1c;
        }

        .emergency-alert-body > strong {
          display: block;
          font-size: 0.82rem;
          margin-bottom: 2px;
        }

        .emergency-alert-body p {
          margin: 0;
        }

        .bubble-text-content {
          font-size: 0.92rem;
          line-height: 1.65;
          word-break: break-word;
        }

        .verified-sources-wrap {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }

        .verified-sources-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-muted);
        }

        .verified-sources-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .verified-source-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 9999px;
          background: var(--secondary-light);
          color: var(--secondary);
          font-size: 0.72rem;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid rgba(15, 118, 110, 0.25);
        }

        .verified-source-pill:hover {
          text-decoration: underline;
        }

        .ai-subtle-disclaimer {
          margin-top: 8px;
          font-size: 0.72rem;
          color: var(--text-light);
          line-height: 1.4;
        }

        .message-timestamp {
          font-size: 0.65rem;
          font-weight: 500;
          margin-top: 2px;
        }

        .user-time {
          color: rgba(255, 255, 255, 0.78);
          text-align: right;
        }

        .ai-time {
          color: var(--text-light);
        }

        /* AI Typing & Loading Shimmer Indicator */
        .ai-typing-indicator {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 6px 2px;
          min-width: 210px;
        }

        .typing-dots-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .typing-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--primary);
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
          font-size: 0.78rem;
          font-weight: 650;
          color: var(--primary);
          margin-left: 3px;
        }

        .typing-shimmer-lines {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .shimmer-line {
          display: block;
          height: 8px;
          border-radius: 9999px;
          background: linear-gradient(90deg, var(--surface-raised) 25%, rgba(16, 185, 129, 0.16) 50%, var(--surface-raised) 75%);
          background-size: 200% 100%;
          animation: shimmerSlide 1.5s infinite linear;
        }

        .shimmer-long { width: 92%; }
        .shimmer-short { width: 64%; }

        @keyframes shimmerSlide {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Followup Prompts Bar */
        .followup-prompts-bar {
          padding: 10px 18px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          background: var(--secondary-light);
          border-top: 1px solid var(--border);
        }

        .followup-prompts-label {
          font-size: 0.71rem;
          font-weight: 750;
          color: var(--secondary);
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
          padding: 6px 13px;
          border-radius: 9999px;
          border: 1px solid rgba(5, 150, 105, 0.35);
          background: var(--surface);
          font-size: 0.79rem;
          font-weight: 600;
          color: var(--secondary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          text-align: left;
          box-shadow: var(--shadow-sm);
          transition: all 0.2s ease;
        }

        .followup-prompt-chip:hover:not(:disabled) {
          background: var(--primary-light);
          border-color: var(--primary);
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(5, 150, 105, 0.15);
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
          border-top: 1px solid var(--border);
          background: var(--surface);
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
          background: var(--surface-raised);
          border: 1.5px solid var(--border);
          border-radius: 20px;
          padding: 3px 5px 3px 16px;
          box-shadow: var(--shadow-sm);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .composer-input-pill:focus-within {
          border-color: var(--primary);
          background: var(--surface);
          box-shadow: 0 0 0 3px var(--ring-focus);
        }

        .composer-input-field {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.90rem;
          color: var(--text-main);
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

          .viewport-mobile-only {
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
            background: var(--surface);
          }

          .jivexa-sidebar.sidebar-mobile-open {
            display: flex;
          }

          .sidebar-mobile-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
          }

          .sidebar-mobile-title-wrap {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--primary);
          }

          .sidebar-mobile-title {
            font-size: 0.86rem;
            font-weight: 750;
            color: var(--text-main);
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