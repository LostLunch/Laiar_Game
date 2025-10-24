import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import io from 'socket.io-client';

// ----------------------------------------------------
// 💡 환경 설정 및 전역 변수
// ----------------------------------------------------

const SOCKET_SERVER_URL = "http://10.198.138.43:5000"; 
let socket;

// 고유 사용자 ID 생성
const generateUserId = () => {
  // eslint-disable-next-line no-undef
  const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
  return token || crypto.randomUUID();
};

const MY_UNIQUE_USER_ID = generateUserId();

// 닉네임 생성을 위한 동물 이름 리스트
const ANIMAL_NAMES = [
 "날랜 사자", "용맹한 호랑이", "거대한 코끼리", "목이 긴 기린", "느긋한 하마", "줄무늬 얼룩말", "강철 코뿔소", "은밀한 표범", "민첩한 치타",
 "영리한 늑대", "교활한 여우", "육중한 곰", "손 씻는 너구리", "우아한 사슴", "볼 빵빵 다람쥐", "귀여운 토끼", "시끄러운 원숭이", 
 "힘센 고릴라", "숲속의 오랑우탄", "점프왕 캥거루", "잠꾸러기 코알라", "대나무 판다", "뒤뚱뒤뚱 펭귄", "북극곰", "바다표범", "돌고래", 
 "바다의 왕 고래", "무서운 상어", "늪지대의 악어", "장수 거북이", "또아리 튼 뱀", "카멜레온 도마뱀"
];

// 배열을 무작위로 섞는 함수 (Fisher-Yates Shuffle)
function shuffleArray(array) {
  let newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}


// --- 컴포넌트 정의 ---

// 💡 [수정] 로비 화면
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
                    // 💡 [수정] whitespace-nowrap 클래스 추가
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
                        // 💡 [수정] whitespace-nowrap 클래스 추가
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
function RoomScreen({ roomState, onLeave, onSendMessage, isAILoading, isOperator, nicknameMap }) {
  const { id: roomId, topic, liar_word, citizen_word, messages, phases_config, phase: phaseIndex } = roomState;
  const currentPhaseName = phases_config[phaseIndex];

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-white">
      {/* 상단 헤더 */}
      <header className="flex items-center justify-between p-4 bg-zinc-800 border-b border-zinc-700 shadow-lg sticky top-0 z-10">
        <div className="flex flex-col">
          <span className="text-xs text-zinc-400">방 코드</span>
          <span className="text-xl font-bold text-red-500 tracking-wider">{roomId}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs text-zinc-400">주제</span>
          <span className="text-2xl font-bold">{topic}</span>
        </div>
        
        {/* 운영자/참가자 단어 표시 */}
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

      {/* 페이즈 표시줄 */}
      <div className="p-3 bg-zinc-800 text-center">
        <span className="text-lg font-semibold text-yellow-400">{currentPhaseName}</span>
        {isAILoading && (
          <span className="ml-3 text-sm text-zinc-400 animate-pulse">AI가 생각 중...</span>
        )}
      </div>

      {/* 참가자 목록 */}
      <PlayerList 
        roomState={roomState} 
        nicknameMap={nicknameMap}
        isOperator={isOperator}
      />

      {/* 채팅 메시지 */}
      <ChatMessages 
        messages={messages} 
        roomState={roomState} 
        nicknameMap={nicknameMap}
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

// 💡 [수정] 참가자 목록: 닉네임과 조건부 색상 적용 (이전 답변과 동일)
function PlayerList({ roomState, nicknameMap, isOperator }) {
  const { operator_id, user_id, ai_players } = roomState;
  
  // 모든 플레이어 병합
  const allPlayers = [
    { id: operator_id, name: "운영자 (라이어)", type: 'operator' }, 
    user_id ? { id: user_id, name: "참가자 (시민)", type: 'user' } : null,
    ...ai_players.map(ai => ({ ...ai, name: ai.name, type: 'ai' }))
  ].filter(Boolean); // null 제거

  return (
    <div className="flex justify-center space-x-2 p-2 bg-zinc-800 border-b border-zinc-700 overflow-x-auto whitespace-nowrap">
      {allPlayers.map(player => {
        const nickname = nicknameMap[player.id] || "로딩중...";
        const isThisPlayerLiar = player.id === operator_id;

        // 색상 결정 로직
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
function ChatMessages({ messages, roomState, nicknameMap, isOperator }) {
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
        
        const senderName = nicknameMap[msg.sender] || "알 수 없음";
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

// 시스템 메시지
function SystemMessage({ text }) {
  return (
    <div className="text-center my-2">
      <span className="bg-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1 rounded-full">{text}</span>
    </div>
  );
}

// 💡 [수정] 사용자/AI 메시지: 색상 로직 수정 (이전 답변과 동일)
function UserMessage({ senderName, text, timestamp, isMe, senderType, isOperatorView }) {
  const alignment = isMe ? "items-end" : "items-start";
  const isLiar = senderType === 'operator';

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
      bubbleColor = 'bg-blue-600'; // 💡 [수정됨]
      nameColor = 'text-blue-300'; // 💡 [수정됨]
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


// 메시지 입력창 (이전 답변과 동일)
function MessageBox({ onSendMessage, isAILoading, roomState, isOperator }) {
  const [inputValue, setInputValue] = useState("");
  
  const phaseName = roomState.phases_config[roomState.phase];
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

  // 소켓 연결 (이전 답변과 동일)
  useEffect(() => {
    socket = io(SOCKET_SERVER_URL);
    socket.on('connect', () => { setIsConnected(true); setError(null); console.log('Socket connected:', socket.id); });
    socket.on('disconnect', () => { setIsConnected(false); setError("서버와 연결이 끊겼습니다."); setRoomState(null); console.log('Socket disconnected'); });
    socket.on('connect_error', (err) => { setError(`서버 연결 실패: ${SOCKET_SERVER_URL} (서버가 실행 중인지 확인하세요)`); console.error('Connection error:', err.message); });
    socket.on('roomState', (newRoomState) => { setRoomState(newRoomState); setError(null); console.log('Room state updated:', newRoomState); });
    socket.on('error', (err) => { setError(err.message); console.error('Server error:', err.message); });
    socket.on('aiProcessing', (data) => { setIsAILoading(data.status === 'start'); });
    return () => { socket.disconnect(); };
  }, []);
  
  // 닉네임 맵 생성 (이전 답변과 동일)
  const nicknameMap = useMemo(() => {
    if (!roomState) return {};

    const { operator_id, user_id, ai_players } = roomState;
    const allPlayerIds = [
      operator_id,
      user_id,
      ...ai_players.map(ai => ai.id)
    ].filter(Boolean); 

    const shuffledNames = shuffleArray(ANIMAL_NAMES);
    
    const map = {};
    allPlayerIds.forEach((id, index) => {
      map[id] = shuffledNames[index % shuffledNames.length]; 
    });
    
    return map;
  }, [roomState?.operator_id, roomState?.user_id, roomState?.ai_players]);


  // --- 이벤트 핸들러 함수 --- (이전 답변과 동일)
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

  // --- 렌더링 --- (이전 답변과 동일)

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
            nicknameMap={nicknameMap}
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
