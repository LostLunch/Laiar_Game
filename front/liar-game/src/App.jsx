import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import io from 'socket.io-client';

// ----------------------------------------------------
// 💡 환경 설정 및 전역 변수
// ----------------------------------------------------

const SOCKET_SERVER_URL = "http://localhost:5000"; 
let socket;

// 고유 사용자 ID 생성
const generateUserId = () => {
  // eslint-disable-next-line no-undef
  const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
  return token || crypto.randomUUID();
};

const MY_UNIQUE_USER_ID = generateUserId();

// 💡 [삭제] 닉네임 생성을 위한 동물 이름 리스트
// const ANIMAL_NAMES = [ ... ];

// 💡 [삭제] 배열을 무작위로 섞는 함수
// function shuffleArray(array) { ... }


// --- 컴포넌트 정의 ---

// 💡 [수정] 로비 화면 (디자인 유지)
function LobbyScreen({ onJoin, onCreate }) {
  const [roomId, setRoomId] = useState("");

  return (
    <div className="flex flex-col items-center justify-center h-full text-white p-8">
      <h1 className="text-5xl font-extrabold mb-4 text-red-500 shadow-red-500/50" style={{ textShadow: '0 0 15px rgba(239, 68, 68, 0.7)' }}>라AI어 게임</h1>
      <p className="text-xl mb-10 text-zinc-300">정보 축전 부스 에디션</p>

      <div className="w-full max-w-sm p-6 bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-700">
        {/* 방 생성 (운영자) */}
        <button
          onClick={onCreate}
                  // 💡 [수정] whitespace-nowrap 클래스 추가 (원본 유지)
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg text-lg shadow-lg shadow-red-500/30 transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95 mb-6 whitespace-nowrap"
        >
          방 생성
        </button>

        {/* 방 참가 (사용자) */}
        <div className="flex flex-col space-y-3">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            placeholder="방 코드 (6자리)"
            maxLength={6}
            className="w-full px-4 py-3 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-center text-lg tracking-widest"
          />
          <button
            onClick={() => onJoin(roomId)}
            disabled={roomId.length !== 6}
                            // 💡 [수정] whitespace-nowrap 클래스 추가 (원본 유지)
            className="w-full bg-zinc-600 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-lg text-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 whitespace-nowrap"
          >
            방 참가
          </button>
        </div>
      </div>
      <p className="mt-8 text-sm text-zinc-500">당신의 고유 ID: {MY_UNIQUE_USER_ID}</p>
    </div>
  );
}

// 룸 화면
// 💡 [수정] nicknameMap 프롭 제거
function RoomScreen({ roomState, onLeave, onSendMessage, isAILoading, isOperator }) {
  const { id: roomId, topic, liar_word, citizen_word, messages, phases_config, phase: phaseIndex } = roomState;
  
  // 💡 [수정] phases_config가 없을 경우 대비
  const currentPhaseName = (phases_config && phaseIndex < phases_config.length)
      ? phases_config[phaseIndex]
      : '대기 중...';

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-white">
      {/* 상단 헤더 (디자인 유지) */}
      <header className="flex items-center justify-between p-4 bg-zinc-800 border-b border-zinc-700 shadow-lg sticky top-0 z-10">
        <div className="flex flex-col">
          <span className="text-xs text-zinc-400">방 코드</span>
          <span className="text-xl font-bold text-red-500 tracking-wider">{roomId}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs text-zinc-400">주제</span>
          <span className="text-2xl font-bold">{topic}</span>
        </div>
        
        {/* 운영자/참가자 단어 표시 (디자인 유지) */}
        <div className="flex flex-col items-end text-right">
          {isOperator ? (
            <>
              <span className="text-xs text-zinc-400">내 단어 (라이어)</span>
              <span className="text-lg font-bold text-red-400">{liar_word}</span>
              <span className="text-xs text-zinc-400 mt-1">참가자 제시어</span>
              <span className="text-base font-medium">{citizen_word}</span>
            </>
          ) : (
            <>
              <span className="text-xs text-zinc-400">내 단어 (시민)</span>
              <span className="text-xl font-bold">{citizen_word}</span>
            </>
          )}
        </div>
        <button
          onClick={onLeave}
          className="absolute bg-zinc-700 hover:bg-red-600 text-xs px-2 py-1 rounded-md transition-all"
          style={{ top: '5px', right: '5px' }}
        >
          나가기
        </button>
      </header>

      {/* 페이즈 표시줄 (디자인 유지) */}
      <div className="p-3 bg-zinc-800 text-center">
        <span className="text-lg font-semibold text-yellow-400">{currentPhaseName}</span>
        {isAILoading && (
          <span className="ml-3 text-sm text-zinc-400 animate-pulse">AI가 생각 중...</span>
        )}
      </div>

      {/* 참가자 목록 */}
      <PlayerList 
        roomState={roomState} 
        // 💡 [삭제] nicknameMap 프롭 제거
        isOperator={isOperator}
      />

      {/* 채팅 메시지 */}
      <ChatMessages 
        messages={messages} 
        roomState={roomState} 
        // 💡 [삭제] nicknameMap 프롭 제거
        isOperator={isOperator}
      />

      {/* 하단 메시지 입력창 */}
      <MessageBox
        onSendMessage={onSendMessage}
        isAILoading={isAILoading}
        roomState={roomState}
        isOperator={isOperator}
      />
    </div>
  );
}

// 💡 [수정] 참가자 목록: nicknameMap 대신 roomState에서 직접 이름 조회
function PlayerList({ roomState, isOperator }) {
  const { operator_id, user_id, ai_players, operator_name, user_name } = roomState;
  
  // 모든 플레이어 병합
  const allPlayers = [
    { id: operator_id, name: "운영자 (라이어)", type: 'operator', nickname: operator_name || "운영자..." }, 
    user_id ? { id: user_id, name: "참가자 (시민)", type: 'user', nickname: user_name || "참가자..." } : null,
    ...ai_players.map(ai => ({ ...ai, type: 'ai', nickname: ai.name })) // ai.name은 "AI 참가자 1" 등
  ].filter(Boolean); // null 제거

  return (
    <div className="flex justify-center space-x-2 p-2 bg-zinc-800 border-b border-zinc-700 overflow-x-auto whitespace-nowrap">
      {allPlayers.map(player => {
        // 💡 [수정] 닉네임 가져오는 로직 변경
        const nickname = player.nickname;
        const isThisPlayerLiar = player.id === operator_id;

        // 색상 결정 로직 (디자인 유지)
        let colorClass = 'bg-zinc-600 text-zinc-200'; // 기본값 (참가자 뷰)
        
        if (isOperator) {
          // 운영자 뷰: 라이어(빨강) / 시민(파랑) 구분
          colorClass = isThisPlayerLiar ? 'bg-red-600 text-white' : 'bg-blue-600 text-white';
        }

        return (
          <div 
            key={player.id} 
            className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}
          >
            {nickname}
          </div>
        );
      })}
    </div>
  );
}


// 채팅 메시지 목록
// 💡 [수정] nicknameMap 프롭 제거
function ChatMessages({ messages, roomState, isOperator }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => {
        if (msg.sender === 'system') {
          return <SystemMessage key={msg.id} text={msg.text} />;
        }
        
        // 💡 [수정] 닉네임을 msg.sender_name에서 직접 가져옴
        const senderName = msg.sender_name || "알 수 없음";
        const isMe = msg.sender === MY_UNIQUE_USER_ID;
        
        return (
          <UserMessage
            key={msg.id}
            senderName={senderName}
            text={msg.text}
            timestamp={msg.timestamp}
            isMe={isMe}
            senderType={msg.sender_type}
            isOperatorView={isOperator} 
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}

// 시스템 메시지 (디자인 유지)
function SystemMessage({ text }) {
  return (
    <div className="text-center my-2">
      <span className="bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1 rounded-full">{text}</span>
    </div>
  );
}

// 💡 [수정] 사용자/AI 메시지: (디자인 유지)
function UserMessage({ senderName, text, timestamp, isMe, senderType, isOperatorView }) {
  const alignment = isMe ? "items-end" : "items-start";
  // const isLiar = senderType === 'operator'; // 원본 파일에 있지만 사용되지 않음

  let bubbleColor = 'bg-zinc-700'; // 기본값 (참가자 뷰 - 다른 사람)
  let nameColor = 'text-zinc-400'; // 기본값 (참가자 뷰 - 다른 사람)

  if (isOperatorView) {
    // --- 운영자 뷰 ---
    if (isMe) {
      // 내 메시지 (라이어)
      bubbleColor = 'bg-red-600';
      nameColor = 'text-zinc-300';
    } else {
      // 다른 사람 메시지 (시민)
      bubbleColor = 'bg-blue-600'; // 💡 [수정됨] (원본 파일 기준)
      nameColor = 'text-blue-300'; // 💡 [수정됨] (원본 파일 기준)
    }
  } else {
    // --- 참가자 뷰 ---
    if (isMe) {
      // 내 메시지 (시민)
      bubbleColor = 'bg-blue-600';
      nameColor = 'text-zinc-300';
    } else {
      // 다른 사람 메시지 (라이어, AI) - 구별 불가
      bubbleColor = 'bg-zinc-700';
      nameColor = 'text-zinc-400';
    }
  }
  
  return (
    <div className={`flex flex-col ${alignment}`}>
      <span className={`text-sm font-semibold mb-1 ${nameColor}`}>{senderName}</span>
      <div className={`px-4 py-3 rounded-2xl max-w-xs md:max-w-md shadow-md ${bubbleColor}`}>
        <p className="text-white" style={{ whiteSpace: "pre-wrap" }}>{text}</p>
      </div>
      <span className="text-xs text-zinc-500 mt-1">
        {new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}


// 메시지 입력창 (디자인 유지)
function MessageBox({ onSendMessage, isAILoading, roomState, isOperator }) {
  const [inputValue, setInputValue] = useState("");
  
  // 💡 [수정] phases_config가 없을 경우 대비
  const phaseName = (roomState.phases_config && roomState.phase < roomState.phases_config.length)
    ? roomState.phases_config[roomState.phase]
    : '대기 중...';

  const isTurnBasedPhase = ['1차 진술', '1차 토론', '2차 진술', '2차 토론'].includes(phaseName);

  let isMyTurn = false;
  if (isTurnBasedPhase) {
    if (isOperator) {
      isMyTurn = roomState.turn === 'operator';
    } else {
      isMyTurn = roomState.turn === 'user';
    }
  }
  
  const isDisabled = isAILoading || !isMyTurn;

  let placeholder = "메시지를 입력하세요...";
  if (isAILoading) {
    placeholder = "AI가 답변을 생성중입니다. 잠시만 기다려주세요...";
  } else if (isTurnBasedPhase) {
    if (isMyTurn) {
      if (phaseName.includes('토론')) {
        placeholder = "내 턴: 의심가는 점을 말하세요...";
      } else {
        placeholder = "내 턴: 진술을 입력하세요...";
      }
    } else {
      placeholder = "상대방의 턴을 기다리는 중...";
    }
  } else {
    placeholder = "투표 또는 다음 페이즈 대기 중...";
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isDisabled) {
      onSendMessage(inputValue);
      setInputValue("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-zinc-800 border-t border-zinc-700 flex items-center space-x-3 sticky bottom-0">
      <textarea
        rows={1}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder={placeholder}
        className="flex-1 rounded-full bg-zinc-700 px-5 py-3 border border-zinc-600 resize-none text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-200 placeholder:text-zinc-400 disabled:opacity-60 disabled:cursor-not-allowed"
        disabled={isDisabled}
      />
      <button
        type="submit"
        className={`rounded-full text-white p-3 shadow-lg font-semibold transition-all duration-300 flex items-center justify-center h-12 w-12 
          ${inputValue.trim() && !isDisabled
            ? "bg-red-600 hover:bg-red-700 active:scale-95 shadow-red-500/50"
            : "bg-red-400 cursor-not-allowed opacity-80"
          }`}
        disabled={!inputValue.trim() || isDisabled}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M3.105 3.105a.5.5 0 01.83-.09l14 8a.5.5 0 010 .97l-14 8a.5.5 0 01-.83-.09V3.105z" />
        </svg>
      </button>
    </form>
  );
}


// --- 메인 App 컴포넌트 ---
export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [roomState, setRoomState] = useState(null); 
  const [error, setError] = useState(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isOperator, setIsOperator] = useState(false); 

  // 소켓 연결
  useEffect(() => {
    socket = io(SOCKET_SERVER_URL, {
        transports: ['websocket', 'polling'] // 💡 [추가] 안정적인 연결을 위해 polling fallback
    });

    socket.on('connect', () => { setIsConnected(true); setError(null); console.log('Socket connected:', socket.id); });
    socket.on('disconnect', () => { setIsConnected(false); setError("서버와 연결이 끊겼습니다."); setRoomState(null); console.log('Socket disconnected'); });
    socket.on('connect_error', (err) => { setError(`서버 연결 실패: ${SOCKET_SERVER_URL} (서버가 실행 중인지 확인하세요)`); console.error('Connection error:', err.message); });
    
    // 💡 [수정] roomState 업데이트 시 AI 로딩 상태 동기화
    socket.on('roomState', (newRoomState) => {
        setRoomState(prevState => ({
          ...prevState,
          ...newRoomState
        }));
        setError(null);
        console.log('Room state updated:', newRoomState);
      
        // 🔥 [추가] AI 자동 시작 방지
        // AI가 생각 중이거나 phase가 초기 상태일 때 자동 응답 방지
        if (!newRoomState.messages || newRoomState.messages.length === 0) {
          setIsAILoading(false);
        }
      });
    
    socket.on('error', (err) => { 
        setError(err.message); 
        console.error('Server error:', err.message); 
        setTimeout(() => setError(null), 3000); // 3초 후 에러 숨김
    });
    
    // 💡 [수정] AI 로딩 상태 관리
    socket.on('aiProcessing', (data) => { 
        const loading = data.status === 'start';
        setIsAILoading(loading);
        setRoomState(prevState => {
            if (!prevState) return null;
            return { ...prevState, isAILoading: loading };
        });
    });
    
    return () => { socket.disconnect(); };
  }, []); // 💡 [수정] isAILoading 의존성 추가
 
  // 💡 [삭제] nicknameMap useMemo 훅
  // const nicknameMap = useMemo(() => { ... });


  // --- 이벤트 핸들러 함수 ---
  const handleCreateRoom = useCallback(() => {
    if (!socket || !isConnected) {
      console.error("Socket not connected yet");
      setError("서버에 연결 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setIsOperator(true); 
    socket.emit('create_room', {
      userId: MY_UNIQUE_USER_ID,
      isOperator: true
    });
  }, [isConnected]); 

  const handleJoinRoom = useCallback((roomId) => {
    if (!socket || !isConnected) {
      console.error("Socket not connected yet");
      setError("서버에 연결 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (!roomId || roomId.length !== 6) {
      setError("올바른 6자리 방 코드를 입력하세요.");
      return;
    }
    setIsOperator(false); 
    socket.emit('join_room', {
      roomId,
      userId: MY_UNIQUE_USER_ID,
      isOperator: false
    });
  }, [isConnected]); 

  const handleLeaveRoom = useCallback(() => {
    if (roomState && socket) {
      socket.emit('leave_room', {
           roomId: roomState.id,
           userId: MY_UNIQUE_USER_ID
      });
      setRoomState(null); 
      setIsOperator(false);
      setError(null);
    }
  }, [roomState]);

  const handleSendMessage = useCallback((text) => {
    if (roomState && socket) {
      socket.emit('send_message', {
        roomId: roomState.id,
        userId: MY_UNIQUE_USER_ID,
        text: text
      });
    }
  }, [roomState]);

  // --- 렌더링 --- (디자인 유지)

  return (
    <main className="font-sans h-screen w-screen bg-zinc-900 text-white">
      {/* 에러 메시지 */}
      {error && (
        <div className="absolute top-0 left-0 right-0 bg-red-800 text-white p-3 text-center z-50">
          {error}
          <button onClick={() => setError(null)} className="ml-4 font-bold">[X]</button>
        </div>
      )}
      
      {/* 연결 상태 */}
      {!isConnected && !error && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-600 text-white p-3 text-center z-50 animate-pulse">
          서버에 연결 중...
        </div>
      )}

      {/* 화면 전환 */}
      <div className="h-full w-full max-w-2xl mx-auto bg-zinc-900 shadow-2xl overflow-hidden">
        {roomState ? (
          <RoomScreen
            roomState={roomState}
            onLeave={handleLeaveRoom}
            onSendMessage={handleSendMessage}
            isAILoading={isAILoading}
            isOperator={isOperator}
            // 💡 [삭제] nicknameMap 프롭 제거
          />
        ) : (
          <LobbyScreen
            onJoin={handleJoinRoom}
            onCreate={handleCreateRoom}
          />
        )}
      </div>
    </main>
  );
}

