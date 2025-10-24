import React, { useState, useRef, useEffect, useCallback } from "react";
import io from 'socket.io-client';

// ----------------------------------------------------
// 💡 환경 설정 및 전역 변수
// ----------------------------------------------------

// ⚠️ [중요] 백엔드(app.py)를 실행하는 컴퓨터의 주소입니다.
// 1. 내 컴퓨터에서만 테스트: "http://localhost:5000"
// 2. 다른 컴퓨터와 같이 테스트: "http://[app.py를 실행한 컴퓨터의 IP주소]:5000"
const SOCKET_SERVER_URL = "http://10.198.137.44:5000"; 
const PHASES = ['1차 진술', '1차 토론', '2차 진술', '2차 토론', '투표'];

let socket;

// 고유 사용자 ID 생성 (Firestore 대신 사용)
const generateUserId = () => {
    // 캔버스 환경에서 제공되는 인증 토큰을 UID로 사용하거나, 없으면 UUID를 생성합니다.
    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    return token || crypto.randomUUID();
};

const MY_UNIQUE_USER_ID = generateUserId();

// --- 컴포넌트 정의 ---

// 로비 화면 컴포넌트 (Firestore 로직은 App에서 처리)
function LobbyScreen({ onJoin }) {
    const [roomId, setRoomId] = useState("");
    const [playerName, setPlayerName] = useState("");
    const [error, setError] = useState(null);

    const handleJoin = (e) => {
        e.preventDefault();
        setError(null);
        if (!roomId.trim() || !playerName.trim()) {
            setError("방 ID와 닉네임을 모두 입력하세요.");
            return;
        }
        onJoin(roomId.trim(), playerName.trim());
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-900/90 text-white">
            <div className="text-center w-full max-w-sm">
                <h1 className="text-5xl sm:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-red-600 mb-6 tracking-tighter drop-shadow-lg font-serif">
                    라AI어 게임 (Socket.IO)
                </h1>
                <p className="text-sm text-gray-400 mb-8 font-medium">
                    방 ID와 닉네임을 입력하여 입장하세요.
                </p>

                <form onSubmit={handleJoin} className="flex flex-col gap-4">
                    <input
                        type="text"
                        placeholder="방 ID 입력 (예: Game101)"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="w-full py-3 px-5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                        required
                    />
                    <input
                        type="text"
                        placeholder="닉네임 입력"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        className="w-full py-3 px-5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                        required
                    />

                    {error && (
                        <div className="text-red-400 text-sm font-medium">{error}</div>
                    )}
                    
                    <button
                        type="submit"
                        className="w-full mt-4 py-4 px-6 rounded-3xl text-xl font-bold text-white bg-red-700 shadow-xl shadow-red-900/50 hover:bg-red-800 transition-all duration-300 transform hover:scale-[1.03] active:scale-100 border border-red-500"
                    >
                        방 참가/생성하기
                    </button>
                </form>
            </div>
        </div>
    );
}


export default function App() {
    const [gameState, setGameState] = useState("lobby"); // 'lobby', 'inGame', 'voting'
    const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0); // 0, 1, 2...
    const [players, setPlayers] = useState([]); // 모든 플레이어 정보 (AI 포함)
    const [currentRoomId, setCurrentRoomId] = useState(null);
    
    // 💡 [신규] 게임 시작 여부를 서버로부터 받아서 저장
    const [gameStarted, setGameStarted] = useState(false);

    // 유저에게 보여줄 정보
    const [myGameInfo, setMyGameInfo] = useState({ 
        playerName: null,
        occupation: "미정",
        category: "미정",
        keyword: "미정",
        isLiar: false,
    });

    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [isAILoading, setIsAILoading] = useState(false); // AI 응답 대기 중
    const messagesEndRef = useRef(null);

    // 메시지 스크롤 자동 이동
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages]);


    // ------------------------------------
    // 💡 1. Socket.IO 연결 및 이벤트 리스너 설정
    // ------------------------------------
    useEffect(() => {
        // 💡 [수정] SOCKET_SERVER_URL 변수 사용
        socket = io(SOCKET_SERVER_URL, {
            transports: ['websocket'],
            autoConnect: true // 바로 연결 시도
        });
        
        // 🚨 서버로부터 게임 상태 업데이트 수신 (핵심) 🚨
        socket.on('roomStateUpdate', (roomState) => {
            console.log("Room State Updated:", roomState);
            
            // 1. 전체 게임 상태 업데이트
            setCurrentPhaseIndex(roomState.phase);
            setPlayers(roomState.players || []);
            setMessages(roomState.messages || []);
            
            // 💡 [신규] 서버로부터 받은 game_started 상태를 업데이트
            setGameStarted(roomState.game_started);

            // 2. 현재 사용자 정보 추출 및 업데이트
            const myPlayerData = roomState.players?.find(p => p.id === MY_UNIQUE_USER_ID);
            
            if (myPlayerData) {
                 setMyGameInfo({
                     playerName: myPlayerData.name,
                     occupation: myPlayerData.role,
                     category: roomState.category,
                     keyword: myPlayerData.keyword, // 라이어에게는 ???, 시민에게는 제시어
                     isLiar: myPlayerData.isLiar,
                 });
                 setGameState('inGame');
            } else if (currentRoomId) {
                 // 방에 있었는데 플레이어 목록에서 사라졌다면, 로비로 복귀
                 setGameState('lobby');
                 setCurrentRoomId(null);
            }
            
            setIsAILoading(false); // 상태 업데이트 완료 시 로딩 종료
        });

        // 💬 시스템 메시지 수신
        socket.on('systemMessage', (data) => {
            setMessages(prev => [...prev, { sender: 'system', text: data.text, timestamp: Date.now() }]);
        });

        // ⏳ AI 처리 중 알림 (서버에서 GPT 호출을 시작/종료할 때 받음)
        socket.on('aiProcessing', (data) => {
            if (data.status === 'start') {
                setIsAILoading(true);
            } 
            // 💡 'end'는 'roomStateUpdate' 이벤트에서 isAILoading(false)로 처리됩니다.
        });
        
        // ❌ 오류 메시지 수신
        socket.on('roomError', (data) => {
            console.error(data.message);
            alert(`오류: ${data.message}`);
            // 방 정보 초기화 및 로비로 복귀
            setCurrentRoomId(null);
            setGameState('lobby');
            setIsAILoading(false);
        });

        return () => {
            socket.disconnect();
        };
    // 💡 [수정] 의존성 배열에서 currentRoomId 제거 (연결은 한 번만 하도록)
    }, []); 


    // ------------------------------------
    // 💡 2. 소켓 이벤트 발생 함수
    // ------------------------------------

    // 1. 방 참가/생성 요청
    const handleJoinRoom = (roomId, playerName) => {
        if (!socket.connected) {
            alert("서버 연결 실패. Flask 서버(app.py)가 실행 중인지 확인해주세요.");
            return;
        }

        setIsAILoading(true);
        
        // 서버에 방 참가/생성 명령 전송.
        socket.emit('joinRoom', { 
            roomId, 
            playerName, 
            userId: MY_UNIQUE_USER_ID, // 사용자 고유 ID
            socketId: socket.id 
        });
        
        setCurrentRoomId(roomId);
        setGameState('inGame'); // 서버 응답을 기다리지만 UI는 바로 전환
        setMyGameInfo(prev => ({ ...prev, playerName }));
    };
    
    // 2. 1차 진술 시작 요청
    const startDeclaration = () => {
        if (!socket.connected || !currentRoomId) return;
        setIsAILoading(true);
        // 💡 [수정] 'startDeclaration' 이벤트 발생
        socket.emit('startDeclaration', { roomId: currentRoomId });
    };

    // 3. 메시지 전송 및 AI 응답 요청
    const sendMessage = () => {
        const txt = inputValue.trim();
        if (!txt || isAILoading || gameState !== 'inGame' || !socket.connected) return;
        
        setInputValue("");
        setIsAILoading(true);
        
        // 서버에 채팅 메시지 명령 전송. 서버는 메시지를 처리하고 상태 업데이트를 emit 할 것입니다.
        socket.emit('chatMessage', { 
            roomId: currentRoomId, 
            sender: myGameInfo.playerName, 
            text: txt,
            userId: MY_UNIQUE_USER_ID,
        });
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { // Shift+Enter는 줄바꿈 허용
            e.preventDefault();
            sendMessage();
        }
    };

    const currentPhase = PHASES[currentPhaseIndex];
    const isDisabled = isAILoading || currentPhase === '투표' || !gameStarted;

    if (gameState === 'lobby' && !socket?.connected) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
                <div className="text-xl text-red-400 animate-pulse">Socket.IO 서버({SOCKET_SERVER_URL}) 연결 대기 중...</div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-gray-900 via-gray-800 to-black font-sans">
            <div className="w-full max-w-2xl h-[90vh] sm:h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden bg-zinc-900 border border-zinc-700">
                
                {gameState === 'lobby' && (
                    <LobbyScreen onJoin={handleJoinRoom} />
                )}

                {gameState !== 'lobby' && (
                    <>
                        <Header 
                            gameInfo={myGameInfo} 
                            currentPhase={currentPhase} 
                            players={players} 
                            roomId={currentRoomId}
                            onStart={startDeclaration}
                            // 💡 [신규] gameStarted prop을 Header로 전달
                            gameStarted={gameStarted}
                        />

                        {/* 채팅 영역 */}
                        <main className="flex-1 p-6 overflow-y-auto bg-zinc-900/90">
                            <div className="flex flex-col gap-4">
                                {messages.length === 0 ? (
                                    <div className="self-center text-sm italic text-gray-500 mt-4">
                                        { gameStarted ? "메시지가 없습니다. 토론을 시작해보세요." : "참가자들이 모였습니다. 방장이 게임을 시작할 때까지 대기해주세요." }
                                    </div>
                                ) : (
                                    messages.map((m, i) => (
                                        <MessageItem key={m.timestamp || i} msg={m} players={players} myName={myGameInfo.playerName} />
                                    ))
                                )}
                                
                                {isAILoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-zinc-800 text-gray-400 text-sm rounded-3xl rounded-bl-lg px-5 py-3 max-w-[75%] shadow">
                                            <span className="animate-pulse">다른 참가자들이 응답을 준비 중입니다...</span>
                                        </div>
                                    </div>
                                )}
                                
                                <div ref={messagesEndRef} />
                            </div>
                        </main>

                        <Composer
                            inputValue={inputValue}
                            setInputValue={setInputValue}
                            onSend={sendMessage}
                            onKeyDown={handleKeyDown}
                            isDisabled={isDisabled}
                            placeholder={
                                !gameStarted ? "게임이 시작되기를 기다리는 중입니다..." :
                                isAILoading ? "AI 응답 대기 중입니다." :
                                currentPhase === '투표' ? "투표 단계입니다." :
                                `${currentPhase} 발언을 입력하세요...`
                            }
                        />
                    </>
                )}
            </div>
        </div>
    );
}

// 💡 [수정] Header 컴포넌트: gameStarted prop 수신
function Header({ gameInfo, currentPhase, players, roomId, onStart, gameStarted }) {
    const { occupation, category, keyword, isLiar } = gameInfo;

    // 💡 [수정] 게임 시작 버튼 표시 조건
    // 게임이 아직 시작하지 않았고 (gameStarted === false)
    // 인간 플레이어가 1명 이상일 때
    const showStartButton = !gameStarted && players.filter(p => p.isHuman).length >= 1;

    return (
        <header className="flex flex-col px-6 py-4 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-700 shadow-md">
            <div className="flex items-center justify-between mb-3">
                
                {/* 현재 단계 & 방 ID 표시 */}
                <div className="flex items-center gap-3">
                    <div className="text-sm font-medium text-gray-400 px-3 py-1 bg-zinc-700 rounded-full border border-zinc-600">
                        방 ID: {roomId}
                    </div>
                    
                    {/* 💡 [수정] 게임이 시작된 경우에만 단계 표시 */}
                    {gameStarted && (
                        <div className="text-lg font-bold text-gray-200 tracking-tight">
                            <span className="text-red-500 font-bold text-base border-b border-red-500 pb-1">{currentPhase}</span> 진행 중
                        </div>
                    )}
                </div>

                {/* 게임 시작 버튼 */}
                {showStartButton && (
                    <button
                        onClick={onStart}
                        className="py-1.5 px-3 rounded-xl text-xs font-bold text-white bg-green-600 hover:bg-green-700 transition-all duration-300 shadow-lg"
                    >
                        게임 시작하기
                    </button>
                )}
                
                {/* 참가 인원 수 표시 */}
                <div className="text-sm font-medium text-gray-400 px-3 py-1 bg-zinc-700 rounded-full border border-zinc-600">
                    <svg className="w-4 h-4 inline mr-1 -mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2a3 3 0 00-5.356-1.857M9 20h5v-2a3 3 0 00-5.356-1.857M9 20v-2a3 3 0 00-5.356-1.857M12 10a3 3 0 110-6 3 3 0 010 6zm0 2a3 3 0 110-6 3 3 0 010 6z" />
                    </svg>
                    총 {players.length}명 참여
                </div>
            </div>

            {/* 직업, 카테고리, 제시어 표시 영역 */}
            <div className="flex justify-around items-center bg-zinc-800 rounded-xl p-3 border border-zinc-700 shadow-inner text-center text-sm font-semibold">
                <InfoBadge title="내 역할" value={occupation} color={isLiar ? 'text-red-500' : 'text-green-400'} />
                <InfoBadge title="카테고리" value={category} color="text-yellow-400" />
                <InfoBadge title="나의 제시어" value={keyword} color="text-white" />
            </div>
        </header>
    );
}

// --- (이하 컴포넌트는 수정 없음) ---

function InfoBadge({ title, value, color }) {
    return (
        <div className="flex flex-col items-center flex-1 min-w-0 px-1">
            <span className="text-xs text-gray-400 mb-1 truncate">{title}</span>
            <span className={`text-base font-bold ${color} truncate`}>{value}</span>
        </div>
    );
}

// 메시지 버블 컴포넌트
function MessageItem({ msg, players, myName }) {
    const isSystem = msg.sender === "system";
    const isUser = msg.sender === myName;
    const player = players.find(p => p.name === msg.sender);

    // 메시지 버블 기본 스타일
    const base =
        "max-w-[85%] sm:max-w-[70%] px-5 py-3 text-sm leading-relaxed break-words shadow-xl transition-all duration-300";

    if (isSystem) {
        // 시스템 메시지
        return (
            <div className="flex justify-center animate-in fade-in">
                <div className={`${base} bg-zinc-800/80 text-gray-500 text-xs rounded-full px-4 py-2 max-w-[90%] shadow-inner border border-zinc-700 text-center`}>
                    {msg.text}
                </div>
            </div>
        );
    }

    if (isUser) {
        // 사용자 메시지 (오른쪽)
        return (
            <div className="flex justify-end animate-in fade-in slide-in-from-right-2">
                <div className={`${base} bg-blue-700 text-white rounded-3xl rounded-br-lg font-medium`}>
                    <div className="mb-1 text-xs font-bold text-blue-300">{msg.sender} (나)</div>
                    {msg.text}
                </div>
            </div>
        );
    }

    // AI 메시지 (왼쪽)
    // 💡 [수정] player가 undefined일 수 있는 경우(AI가 player 목록에 늦게 추가될 때)를 대비
    const isLiar = player?.isLiar; 
    const colorClass = isLiar ? 'from-red-600 to-red-800' : 'from-zinc-600 to-zinc-800';

    return (
        <div className="flex justify-start items-start animate-in fade-in slide-in-from-left-2">
            <div className="flex-shrink-0 mr-3 mt-1">
                {/* AI 프로필 아이콘 */}
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white text-xs font-bold shadow-md border border-zinc-700`}>
                    {msg.sender[0]}
                </div>
            </div>
            <div className={`${base} bg-zinc-800 text-gray-200 border border-zinc-700 rounded-3xl rounded-bl-lg`}>
                <div className={`mb-1 text-xs font-bold ${isLiar ? 'text-red-500' : 'text-gray-400'}`}>
                    {msg.sender}
                </div>
                {msg.text}
            </div>
        </div>
    );
}

// 입력창 컴포넌트
function Composer({ inputValue, setInputValue, onSend, onKeyDown, isDisabled, placeholder }) {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSend();
            }}
            className="px-4 sm:px-6 py-3 bg-zinc-900/80 backdrop-blur-sm border-t border-zinc-700 flex items-center gap-2 sm:gap-3 shadow-inner"
        >
            <textarea
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="flex-1 min-h-[40px] max-h-[120px] rounded-2xl bg-zinc-800 px-4 py-2 border border-zinc-700 resize-none text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-200 placeholder:text-gray-500 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isDisabled}
            />

            {/* 전송 버튼 */}
            <button
                type="submit"
                className={`rounded-full text-white px-4 py-2 shadow-lg font-semibold transition-all duration-300 flex items-center justify-center h-10 w-20 
        ${inputValue.trim() && !isDisabled
                        ? "bg-red-600 hover:bg-red-700 active:scale-95 shadow-red-500/50"
                        : "bg-red-400 cursor-not-allowed opacity-80"
                    }`}
                disabled={!inputValue.trim() || isDisabled}
            >
                {isDisabled && inputValue.trim() === "" ? ( // 💡 [수정] 로딩 조건 명확화 (isAILoading은 isDisabled에 포함됨)
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    "전송"
                )}
            </button>
        </form>
    );
}