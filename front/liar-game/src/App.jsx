import React, { useState, useRef, useEffect, useCallback } from "react";
import io from 'socket.io-client';

// ----------------------------------------------------
// 💡 환경 설정 및 전역 변수
// ----------------------------------------------------

// ⚠️ [중요] 백엔드(api.py)를 실행하는 컴퓨터의 주소입니다.
// 1. 부스에서 서버/운영자/사용자 PC가 모두 동일한 1대의 컴퓨터라면: "http://localhost:5000"
// 2. 서버(운영자) PC와 사용자 PC가 2대라면: "http://[서버 PC의 IP 주소]:5000"
// (예: "http://192.168.0.10:5000")
//
// 💡 [수정] 부스 환경을 고려하여 localhost를 기본값으로 제안합니다.
const SOCKET_SERVER_URL = "http://localhost:5000"; 
// const SOCKET_SERVER_URL = "http://10.198.137.44:5000"; // 기존 IP

let socket;

// 고유 사용자 ID 생성
const generateUserId = () => {
    // 💡 [수정] 린트 오류 방지 주석 추가
    // eslint-disable-next-line no-undef
    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    return token || crypto.randomUUID();
};

const MY_UNIQUE_USER_ID = generateUserId();

// --- 컴포넌트 정의 ---

// 로비 화면
function LobbyScreen({ onJoin, onCreate }) {
    const [roomId, setRoomId] = useState("");

    return (
        <div className="flex flex-col items-center justify-center h-full text-white p-8">
            <h1 className="text-5xl font-extrabold mb-4 text-red-500 shadow-red-500/50" style={{ textShadow: '0 0 15px rgba(239, 68, 68, 0.7)' }}>Liar Game</h1>
            <p className="text-xl mb-10 text-zinc-300">정보 축전 부스 에디션</p>

            <div className="w-full max-w-sm p-6 bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-700">
                {/* 방 생성 (운영자) */}
                <button
                    onClick={onCreate}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg text-lg shadow-lg shadow-red-500/30 transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95 mb-6"
                >
                    운영자 (라이어) 방 생성
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
                        className="w-full bg-zinc-600 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-lg text-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        사용자 (시민) 참가
                    </button>
                </div>
            </div>
            <p className="mt-8 text-sm text-zinc-500">당신의 고유 ID: {MY_UNIQUE_USER_ID}</p>
        </div>
    );
}

// 룸 화면
function RoomScreen({ roomState, onLeave, onSendMessage, isAILoading, isOperator }) {
    const { id: roomId, topic, liar_word, citizen_word, messages, phases_config, phase: phaseIndex } = roomState;

    // 운영자인지 확인
    const myWord = isOperator ? liar_word : citizen_word;
    const myRole = isOperator ? "라이어" : "시민";
    
    // 현재 페이즈 이름
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
                <div className="flex flex-col items-end">
                    <span className="text-xs text-zinc-400">내 단어 ({myRole})</span>
                    <span className="text-xl font-bold">{myWord}</span>
                </div>
                <button
                    onClick={onLeave}
                    className="absolute top-4 right-4 bg-zinc-700 hover:bg-red-600 text-xs px-2 py-1 rounded-md transition-all"
                    style={{ top: '-10px', right: '10px' }} // (예시: 위치 조정)
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

            {/* 참가자 목록 (간략) */}
            <PlayerList roomState={roomState} />

            {/* 채팅 메시지 */}
            <ChatMessages messages={messages} roomState={roomState} />

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

// 참가자 목록
function PlayerList({ roomState }) {
    const { operator_id, user_id, ai_players } = roomState;
    
    // 모든 플레이어 병합
    const allPlayers = [
        { id: operator_id, name: "운영자 (라이어)", type: 'operator' },
        user_id ? { id: user_id, name: "참가자 (시민)", type: 'user' } : null,
        ...ai_players.map(ai => ({ ...ai, name: ai.name, type: 'ai' }))
    ].filter(Boolean); // null 제거

    return (
        <div className="flex justify-center space-x-2 p-2 bg-zinc-800 border-b border-zinc-700 overflow-x-auto">
            {allPlayers.map(player => (
                <div 
                    key={player.id} 
                    className={`px-3 py-1 rounded-full text-sm font-medium
                        ${player.type === 'operator' ? 'bg-red-600 text-white' : ''}
                        ${player.type === 'user' ? 'bg-blue-600 text-white' : ''}
                        ${player.type === 'ai' ? 'bg-zinc-600 text-zinc-200' : ''}
                    `}
                >
                    {player.name}
                </div>
            ))}
        </div>
    );
}


// 채팅 메시지 목록
function ChatMessages({ messages, roomState }) {
    const messagesEndRef = useRef(null);
    const { operator_id, user_id, ai_players } = roomState;
    
    // 플레이어 이름 매핑 (ID로 이름을 찾기 위함)
    const playerNames = {
        [operator_id]: "운영자 (라이어)",
        [user_id]: "참가자 (시민)",
        ...ai_players.reduce((acc, ai) => ({ ...acc, [ai.id]: ai.name }), {}),
        'system': 'System'
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
                if (msg.sender === 'system') {
                    return <SystemMessage key={msg.id} text={msg.text} />;
                }
                
                const senderName = playerNames[msg.sender] || "알 수 없음";
                const isMe = msg.sender === MY_UNIQUE_USER_ID;
                
                // sender_type으로 스타일 구분
                return (
                    <UserMessage
                        key={msg.id}
                        senderName={senderName}
                        text={msg.text}
                        timestamp={msg.timestamp}
                        isMe={isMe}
                        senderType={msg.sender_type}
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

// 사용자/AI 메시지
function UserMessage({ senderName, text, timestamp, isMe, senderType }) {
    const alignment = isMe ? "items-end" : "items-start";
    const bubbleColor = 
        isMe ? (senderType === 'operator' ? "bg-red-600" : "bg-blue-600") 
             : (senderType === 'ai' ? "bg-zinc-700" : "bg-zinc-800");
    const nameColor = 
        isMe ? "text-zinc-300"
             : (senderType === 'operator' ? "text-red-400" 
                : (senderType === 'user' ? "text-blue-400"
                   : "text-zinc-400"));
    
    return (
        <div className={`flex flex-col ${alignment}`}>
            <span className={`text-sm font-semibold mb-1 ${nameColor}`}>{senderName}</span>
            <div className={`px-4 py-3 rounded-2xl max-w-xs md:max-w-md shadow-md ${bubbleColor}`}>
                <p className="text-white">{text}</p>
            </div>
            <span className="text-xs text-zinc-500 mt-1">
                {new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
    );
}


// 메시지 입력창
function MessageBox({ onSendMessage, isAILoading, roomState, isOperator }) {
    const [inputValue, setInputValue] = useState("");
    
    const phaseName = roomState.phases_config[roomState.phase];

    // 💡 [추가] '토론' 페이즈인지 확인
    const isDiscussionPhase = ['1차 토론', '2차 토론'].includes(phaseName);
    
    // 💡 [수정] '진술' 페이즈인지 확인
    const isTurnPhase = ['1차 진술', '2차 진술'].includes(phaseName);

    let isMyTurn = false;
    if (isTurnPhase) {
        // '진술' 페이즈일 때만 턴을 검사
        if (isOperator) {
            isMyTurn = roomState.turn === 'operator';
        } else {
            isMyTurn = roomState.turn === 'user';
        }
    }
    
    // 💡 [수정] isDisabled 로직
    // AI 로딩 중이거나,
    // (토론 페이즈도 아니고 AND 내 턴도 아니면) -> 비활성화
    const isDisabled = isAILoading || (!isDiscussionPhase && !isMyTurn);

    // 💡 [수정] 플레이스홀더 텍스트
    let placeholder = "메시지를 입력하세요...";
    if (isAILoading) {
        placeholder = "AI가 답변을 생성중입니다. 잠시만 기다려주세요...";
    } else if (isDiscussionPhase) {
        placeholder = "자유롭게 토론하세요..."; // 토론 페이즈
    } else if (isTurnPhase) {
        if (isMyTurn) {
            placeholder = "내 턴: 진술을 입력하세요..."; // 내 턴 (진술)
        } else {
            placeholder = "상대방의 턴을 기다리는 중..."; // 상대 턴 (진술)
        }
    } else {
        placeholder = "투표 또는 다음 페이즈 대기 중..."; // 투표 또는 기타
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
                {/* 전송 아이콘 (SVG) */}
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
    const [roomState, setRoomState] = useState(null); // null: 로비, object: 룸
    const [error, setError] = useState(null);
    const [isAILoading, setIsAILoading] = useState(false);
    const [isOperator, setIsOperator] = useState(false); // 내가 운영자인지 여부

    // 소켓 연결 및 이벤트 핸들러 설정
    useEffect(() => {
        socket = io(SOCKET_SERVER_URL);

        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
            setIsConnected(true);
            setError(null);
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsConnected(false);
            setError("서버와 연결이 끊겼습니다.");
            setRoomState(null); // 연결 끊기면 로비로
        });

        socket.on('connect_error', (err) => {
            console.error('Connection error:', err.message);
            setError(`서버 연결 실패: ${SOCKET_SERVER_URL} (서버가 실행 중인지 확인하세요)`);
        });

        socket.on('roomState', (newRoomState) => {
            console.log('Room state updated:', newRoomState);
            setRoomState(newRoomState);
            setError(null);
        });

        socket.on('error', (err) => {
            console.error('Server error:', err.message);
            setError(err.message);
        });

        socket.on('aiProcessing', (data) => {
            setIsAILoading(data.status === 'start');
        });

        return () => {
            socket.disconnect();
        };
    }, []);
    
    // --- 이벤트 핸들러 함수 ---

    const handleCreateRoom = useCallback(() => {
        setIsOperator(true); // 방을 만들면 운영자(라이어)
        socket.emit('create_room', {
            userId: MY_UNIQUE_USER_ID,
            isOperator: true
        });
    }, []);

    const handleJoinRoom = useCallback((roomId) => {
        if (!roomId || roomId.length !== 6) {
            setError("올바른 6자리 방 코드를 입력하세요.");
            return;
        }
        setIsOperator(false); // 방에 참가하면 사용자(시민)
        socket.emit('join_room', {
            roomId,
            userId: MY_UNIQUE_USER_ID,
            isOperator: false
        });
    }, []);

    const handleLeaveRoom = useCallback(() => {
        if (roomState) {
            socket.emit('leave_room', {
                roomId: roomState.id,
                userId: MY_UNIQUE_USER_ID
            });
            setRoomState(null); // 즉시 로비로 이동
            setIsOperator(false);
            setError(null);
        }
    }, [roomState]);

    const handleSendMessage = useCallback((text) => {
        if (roomState) {
            socket.emit('send_message', {
                roomId: roomState.id,
                userId: MY_UNIQUE_USER_ID,
                text: text
            });
        }
    }, [roomState]);

    // --- 렌더링 ---

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

