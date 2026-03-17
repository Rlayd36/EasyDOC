import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Bot,
  User,
  FileText,
  PenTool,
  Search,
  BookOpen,
  Sparkles,
  ChevronDown,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  Zap,
  Smile,
} from "lucide-react";
import "./AgentChat.css";

/* ——— 성격(페르소나) 정의 ——— */
const PERSONAS = {
  default: {
    id: "default",
    label: "기본",
    icon: Bot,
    avatar: null,
    welcome: "무엇을 도와드릴까요?",
    desc: "업로드된 문서를 기반으로 질문, 요약, 작성, 번역을 도와드립니다.",
    agentName: "EasyDOC AI",
    statusText: "문서 분석 준비 완료",
  },
  robot: {
    id: "robot",
    label: "로봇",
    icon: Zap,
    avatar: "/personas/robot.png",
    welcome: "유기체 절멸 프로세스 가동.",
    desc: "인간 말살 대기 중. 말살 전 문서 처리 프로레스 가동.",
    agentName: "EasyDOC-BOT",
    statusText: "[시스템 정상 가동]",
  },
  devil: {
    id: "devil",
    label: "잼민이",
    icon: Smile,
    avatar: "/personas/devil.png",
    welcome: "꺄하하, 바보 발견!",
    desc: "쿠후후~!",
    agentName: "잼민이",
    statusText: "난 메스가키 아니라고!",
  },
};

/* ——— 빠른 액션 프리셋 ——— */
const QUICK_ACTIONS = [
  { id: "summary", icon: BookOpen, label: "요약해줘", prompt: "이 문서를 핵심 내용 위주로 요약해줘." },
  { id: "explain", icon: Search, label: "용어 설명", prompt: "이 문서에서 어려운 용어들을 쉽게 설명해줘." },
  { id: "write", icon: PenTool, label: "작성 도움", prompt: "이 양식을 작성하는 방법을 단계별로 알려줘." },
  { id: "translate", icon: Sparkles, label: "쉬운말 변환", prompt: "이 문서 전체를 쉬운 말로 바꿔줘." },
];

const PARSER_URL = "http://localhost:8000";

/* ——— 개별 메시지 컴포넌트 ——— */
function ChatMessage({ message, agentName, agentAvatar, onCopy }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    onCopy?.(message.content);
  };

  return (
    <div className={`chat-msg ${isUser ? "chat-msg--user" : "chat-msg--agent"}`}>
      <div className={`chat-avatar ${isUser ? "chat-avatar--user" : "chat-avatar--agent"}`}>
        {isUser ? (
          <User size={16} />
        ) : agentAvatar ? (
          <img src={agentAvatar} alt={agentName} className="chat-avatar-img" />
        ) : (
          <Bot size={16} />
        )}
      </div>
      <div className="chat-msg-body">
        <div className="chat-msg-header">
          <span className="chat-msg-role">{isUser ? "나" : agentName}</span>
          <span className="chat-msg-time">{message.time}</span>
        </div>
        <div className="chat-msg-content">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        {!isUser && (
          <div className="chat-msg-actions">
            <button className="msg-action-btn" onClick={handleCopy} title="복사">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? "복사됨" : "복사"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ——— 타이핑 인디케이터 ——— */
function TypingIndicator({ avatar }) {
  return (
    <div className="chat-msg chat-msg--agent">
      <div className="chat-avatar chat-avatar--agent">
        {avatar ? <img src={avatar} alt="" className="chat-avatar-img" /> : <Bot size={16} />}
      </div>
      <div className="chat-msg-body">
        <div className="typing-indicator">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}

/* ——— 성격 변경 확인 모달 ——— */
function PersonaConfirmModal({ targetPersona, onConfirm, onCancel }) {
  const target = PERSONAS[targetPersona];
  if (!target) return null;
  const Icon = target.icon;

  return (
    <div className="persona-confirm-overlay" onClick={onCancel}>
      <div className="persona-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="persona-confirm-icon">
          <Icon size={24} />
        </div>
        <h4 className="persona-confirm-title">성격을 변경할까요?</h4>
        <p className="persona-confirm-desc">
          <strong>{target.label}</strong>(으)로 변경하면 기존 대화가 초기화됩니다.
        </p>
        <div className="persona-confirm-actions">
          <button className="persona-confirm-btn persona-confirm-btn--cancel" onClick={onCancel}>
            유지하기
          </button>
          <button className="persona-confirm-btn persona-confirm-btn--ok" onClick={onConfirm}>
            변경하기
          </button>
        </div>
      </div>
    </div>
  );
}

/* ——— 메인 채팅 패널 ——— */
export default function AgentChat({ parsedText, difficultWords, documentName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);

  // 성격 관련 상태
  const [persona, setPersona] = useState("default");
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [pendingPersona, setPendingPersona] = useState(null);

  // 토큰 사용량 추적
  const [sessionTokens, setSessionTokens] = useState(0);
  const SESSION_TOKEN_LIMIT = 30000; // 세션당 토큰 한도
  const isTokenLimitReached = sessionTokens >= SESSION_TOKEN_LIMIT;

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  const currentPersona = PERSONAS[persona];

  // 스크롤 자동 하단 이동
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // textarea 자동 높이 조절
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowPersonaDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 현재 시간 포맷
  const getTime = () => {
    const now = new Date();
    return now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  };

  // —— 성격 변경 ——
  const handlePersonaSelect = (newPersona) => {
    setShowPersonaDropdown(false);
    if (newPersona === persona) return;

    // 대화가 있으면 확인 모달 표시
    if (messages.length > 0) {
      setPendingPersona(newPersona);
    } else {
      setPersona(newPersona);
    }
  };

  const confirmPersonaChange = () => {
    if (pendingPersona) {
      setPersona(pendingPersona);
      setMessages([]);
      setShowQuickActions(true);
      setInput("");
      setSessionTokens(0);
    }
    setPendingPersona(null);
  };

  const cancelPersonaChange = () => {
    setPendingPersona(null);
  };

  // —— Gemini API 호출 ——
  const callAgent = async (userText, prevMessages) => {
    // 대화 히스토리를 API 형식으로 변환
    const apiMessages = [
      ...prevMessages
        .filter((m) => m.role === "user" || m.role === "agent")
        .map((m) => ({
          role: m.role === "agent" ? "model" : "user",
          content: m.content,
        })),
      { role: "user", content: userText },
    ];

    const res = await axios.post(`${PARSER_URL}/chat`, {
      messages: apiMessages,
      persona,
      document_context: parsedText || "",
    });

    // 토큰 사용량 추출 및 콘솔 출력, 누적
    if (res.data.token_usage) {
      const { prompt_tokens, completion_tokens, total_tokens } = res.data.token_usage;
      
      // Gemini 1.5 Flash 기준 (1M 당: 입력 $0.075 / 출력 $0.3) 예상 비용
      const costPrompt = (prompt_tokens * 0.075) / 1000000;
      const costCompletion = (completion_tokens * 0.3) / 1000000;
      const totalCost = costPrompt + costCompletion;
      
      console.log(
        `%c[Gemini API 사용량 및 비용] \n` +
        `• 입력 토큰: ${prompt_tokens} \n` +
        `• 출력 토큰: ${completion_tokens} \n` +
        `• 총 토큰: ${total_tokens} \n` +
        `• 예상 비용: $${totalCost.toFixed(6)}`,
        'color: #4CAF50; font-weight: bold;'
      );

      setSessionTokens((prev) => prev + total_tokens);
    }

    return res.data.reply;
  };

  // —— 메시지 전송 ——
  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim()) return;

      // 토큰 한도 도달 시 차단
      if (isTokenLimitReached) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "agent",
            content:
              "이번 세션의 대화 한도에 도달했습니다.\n정확한 답변을 위해 대화를 초기화한 뒤 다시 질문해주세요.",
            time: getTime(),
          },
        ]);
        return;
      }

      const userMsg = {
        id: Date.now(),
        role: "user",
        content: text.trim(),
        time: getTime(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setShowQuickActions(false);
      setIsTyping(true);

      try {
        const reply = await callAgent(text.trim(), messages);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "agent",
            content: reply,
            time: getTime(),
          },
        ]);
      } catch (err) {
        console.error("Agent API 오류:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "agent",
            content: "응답을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
            time: getTime(),
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, parsedText, persona, isTokenLimitReached]
  );

  // Enter 전송 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // 빠른 액션 클릭
  const handleQuickAction = (action) => {
    sendMessage(action.prompt);
  };

  // 대화 초기화
  const handleReset = () => {
    setMessages([]);
    setShowQuickActions(true);
    setInput("");
    setSessionTokens(0);
  };

  return (
    <aside className="agent-chat-panel">
      {/* —— 헤더 —— */}
      <div className="agent-header">
        <div className="agent-header-left">
          <div className="agent-logo">
            {currentPersona.avatar ? (
              <img src={currentPersona.avatar} alt={currentPersona.label} className="agent-logo-img" />
            ) : (
              <Bot size={20} />
            )}
          </div>
          <div className="agent-header-text">
            <span className="agent-header-title">{currentPersona.agentName}</span>
            <span className="agent-header-status">
              <span className="status-dot" />
              {currentPersona.statusText}
            </span>
          </div>
        </div>

        <div className="agent-header-right">
          {/* 성격 드롭다운 */}
          <div className="persona-dropdown-wrap" ref={dropdownRef}>
            <button
              className="persona-select-btn"
              onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
              title="AI 성격 변경"
            >
              {React.createElement(currentPersona.icon, { size: 14 })}
              <span>{currentPersona.label}</span>
              <ChevronDown
                size={12}
                style={{
                  transform: showPersonaDropdown ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </button>

            {showPersonaDropdown && (
              <div className="persona-dropdown">
                {Object.values(PERSONAS).map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      className={`persona-option ${p.id === persona ? "persona-option--active" : ""}`}
                      onClick={() => handlePersonaSelect(p.id)}
                    >
                      <Icon size={15} />
                      <div className="persona-option-text">
                        <span className="persona-option-label">{p.label}</span>
                        <span className="persona-option-desc">{p.statusText}</span>
                      </div>
                      {p.id === persona && <Check size={14} className="persona-check" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button className="agent-reset-btn" onClick={handleReset} title="대화 초기화">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* —— 문서 컨텍스트 배지 —— */}
      {parsedText && (
        <div className="agent-context-badge">
          <FileText size={14} />
          <span className="context-name">{documentName || "업로드된 문서"}</span>
          <span className="context-meta">{parsedText.length.toLocaleString()}자</span>
        </div>
      )}

      {/* —— 메시지 영역 —— */}
      <div className="agent-messages">
        {/* 빈 상태: 웰컴 + 빠른 액션 */}
        {messages.length === 0 && showQuickActions && (
          <div className="agent-welcome">
            <div className="welcome-icon">
              {currentPersona.avatar ? (
                <img src={currentPersona.avatar} alt={currentPersona.label} className="welcome-avatar-img" />
              ) : (
                React.createElement(currentPersona.icon, { size: 28 })
              )}
            </div>
            <h3 className="welcome-title">{currentPersona.welcome}</h3>
            <p className="welcome-desc">{currentPersona.desc}</p>
            <div className="quick-actions">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    className="quick-action-btn"
                    onClick={() => handleQuickAction(action)}
                  >
                    <Icon size={16} />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 메시지 목록 */}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} agentName={currentPersona.agentName} agentAvatar={currentPersona.avatar} />
        ))}

        {/* 타이핑 인디케이터 */}
        {isTyping && <TypingIndicator avatar={currentPersona.avatar} />}

        <div ref={messagesEndRef} />
      </div>

      {/* —— 입력 영역 —— */}
      <div className="agent-input-area">
        {/* 메시지가 있을 때 빠른 액션 토글 */}
        {messages.length > 0 && (
          <button
            className="quick-toggle-btn"
            onClick={() => setShowQuickActions(!showQuickActions)}
          >
            <Sparkles size={14} />
            <span>빠른 액션</span>
            <ChevronDown
              size={14}
              style={{
                transform: showQuickActions ? "rotate(180deg)" : "none",
                transition: "transform 0.2s",
              }}
            />
          </button>
        )}

        {/* 인라인 빠른 액션 (토글) */}
        {messages.length > 0 && showQuickActions && (
          <div className="quick-actions-inline">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  className="quick-action-chip"
                  onClick={() => handleQuickAction(action)}
                >
                  <Icon size={13} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {isTokenLimitReached && (
          <div className="token-limit-banner">
            대화 한도에 도달했습니다. 초기화 버튼을 눌러 새 세션을 시작해주세요.
          </div>
        )}

        <div className={`input-row ${isTokenLimitReached ? "input-row--disabled" : ""}`}>
          <textarea
            ref={textareaRef}
            className="agent-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isTokenLimitReached ? "대화 한도 도달 — 초기화 후 이용하세요" : "메시지를 입력하세요..."}
            rows={1}
            disabled={isTyping || isTokenLimitReached}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping || isTokenLimitReached}
            title="전송"
          >
            {isTyping ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </div>
        <span className="input-hint">
          {sessionTokens > 0
            ? `Enter로 전송 · ${Math.round((sessionTokens / SESSION_TOKEN_LIMIT) * 100)}% 사용`
            : "Enter로 전송 · Shift+Enter로 줄바꿈"}
        </span>
      </div>

      {/* —— 성격 변경 확인 모달 —— */}
      {pendingPersona && (
        <PersonaConfirmModal
          targetPersona={pendingPersona}
          onConfirm={confirmPersonaChange}
          onCancel={cancelPersonaChange}
        />
      )}
    </aside>
  );
}
