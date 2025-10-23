import React, { useState, useRef, useEffect } from "react";

// --- 상수 정의 ---
const ANIMAL_NAMES = ['호랑이', '사자', '독수리', '코끼리', '여우', '토끼', '고래', '펭귄', '하마', '팬더'];
const PHASES = ['1차 진술', '1차 토론', '2차 진술', '2차 토론'];

// 백엔드 API 주소 (로컬 환경 기준)
const API_BASE_URL = "http://127.0.0.1:5000/api";

/**
 * 메시지 배열을 섞는 유틸리티 함수
 */
const shuffleArray = (array) => {
    // 셔플 알고리즘: Fisher-Yates
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};


// --- 더미 메시지 생성 함수 (글로벌 선언) ---

/**
 * Operator/Liar 메시지 생성 (고정된 더미 메시지)
 * 사용자가 참가자일 때, 비사용자 역할이 라이어일 경우의 발언을 시뮬레이션
 */
const generateOperatorMessage = (operatorName, commonKeyword, currentPhase, lastUserText) => {
    let content = "";
    const phaseText = PHASES[currentPhase];

    if (phaseText.includes('진술')) {
        // 라이어는 제시어를 알고 있지만, 일반적인 속성만 언급하여 의심을 피함
        content = `저희의 ${commonKeyword}는 일상생활에서 쉽게 접할 수 있는 것이죠. 특히 특정 상황에서 필수적인 역할을 합니다.`;
    } else if (phaseText.includes('토론')) {
         // 라이어는 혼란을 유도하거나, 명확한 질문을 피해 모호하게 대응함
         const context = lastUserText ? lastUserText.substring(0, 10).trim() : '이전 발언';
         content = `${context}에 대한 의견이신데... 저는 조금 더 포괄적인 측면에서 생각해 볼 필요가 있다고 봅니다.`;
    }
    
    return { sender: operatorName, text: content, role: '운영자 (라이어)' };
};

/**
 * Non-user Participant 메시지 생성 (고정된 더미 메시지)
 * 사용자가 라이어일 때, 일반 참가자 역할을 하는 비사용자 플레이어의 발언을 시뮬레이션
 */
const generateParticipantDummyMessage = (participantName, commonKeyword, currentPhase, lastContextText) => {
    let content = "";
    const phaseText = PHASES[currentPhase];
    const context = lastContextText ? lastContextText.substring(0, 10).trim() : '이전 발언';

    if (phaseText.includes('진술')) {
        // 일반 참가자: 제시어를 아는 상태로 발언
        content = `저의 제시어는 ${commonKeyword}와 깊은 연관이 있습니다. 그중에서도 특히 활동적인 측면이 중요하죠.`;
    } else if (phaseText.includes('토론')) {
         // 일반 참가자: 라이어가 아닌 다른 사람의 발언에 동의하거나 일반적인 질문
         content = `(${participantName}님) 저는 ${context} 부분에 동의합니다. 라이어는 너무 광범위한 이야기를 하고 있는 것 같습니다.`;
    }
    
    return { sender: participantName, text: content, role: '일반 참가자' };
};


// --- 컴포넌트 정의 ---

// 로비 화면 컴포넌트
function LobbyScreen({ onStart }) {
    const [roomCode, setRoomCode] = useState('');
    
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-900/90 text-white">
      <div className="text-center">
        {/* 크라임씬 테마 타이틀 */}
        <h1 className="text-6xl sm:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-red-600 mb-8 tracking-tighter drop-shadow-lg font-serif">
          라AI어 게임
        </h1>
        <p className="text-lg text-gray-400 mb-12 font-medium">
          거짓말을 숨기고 진실을 유추하라! (총 6명: Human 1 + Operator 1 + AI 4)
        </p>
        
        {/* 방 코드 입력 (Join 시 필요) */}
        <div className="w-full max-w-sm mx-auto mb-6">
            <input 
                type="text" 
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="방 코드 입력 (Join 시)"
                className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center text-lg font-bold"
            />
        </div>

        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-sm mx-auto">
          {/* 방 생성 (운영자/라이어) */}
          <button
            onClick={() => onStart('create', '')} // Create 시 코드는 백엔드에서 생성
            className="flex-1 py-4 px-6 rounded-3xl text-xl font-bold text-red-500 bg-zinc-700 border-2 border-red-500 shadow-lg hover:bg-zinc-600 transition-all duration-300 transform hover:scale-[1.03] active:scale-100"
          >
            방 생성 (운영자/라이어)
          </button>
          {/* 참가 (일반 참가자) */}
          <button
            onClick={() => onStart('join', roomCode)}
            disabled={!roomCode}
            className={`flex-1 py-4 px-6 rounded-3xl text-xl font-bold text-green-500 border-2 shadow-lg transition-all duration-300 ${!roomCode ? 'bg-zinc-600 border-green-700 opacity-50 cursor-not-allowed' : 'bg-zinc-700 border-green-500 hover:bg-zinc-600 transform hover:scale-[1.03] active:scale-100'}`}
          >
            참가 (일반 참가자)
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-6">
            **규칙:** 운영자 역할이 라이어입니다. 참가자는 누가 운영자인지 모릅니다.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [gameState, setGameState] = useState("lobby"); // 'lobby', 'inGame', 'voting'
  const [gamePhase, setGamePhase] = useState(0); // 0: 1차 진술, 1: 1차 토론, ...
  const [players, setPlayers] = useState([]); // 6명의 플레이어 정보
  const [gameInfo, setGameInfo] = useState({ // 유저에게 보여줄 정보
    roomCode: null, // 방 코드 추가
    playerName: null,
    occupation: null, 
    category: null,
    keyword: null, 
    isLiar: false, 
  });
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // New state for the dual-trigger mechanism (when user is Participant)
  const [pendingAIMessages, setPendingAIMessages] = useState(null); // Stores 4 AI responses after user submission
  const [userSubmittedMessage, setUserSubmittedMessage] = useState(null); // Stores user's message
  // 사용자가 참가자일 때, AI 메시지 저장이 완료되면 운영자 입력 차례로 간주
  const isOperatorTurn = gameInfo.isLiar === false && pendingAIMessages !== null && gamePhase > 0;

  // 메시지 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);


  // 게임 시작 (방 생성 또는 참가)
  const enterGame = async (mode, providedRoomCode) => {
    setIsLoading(true);
    const isCreator = mode === 'create';
    
    try {
        // 1. 방 코드 설정 및 제시어/카테고리 요청
        const setGameResponse = await fetch(`${API_BASE_URL}/set_game_word`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_code: providedRoomCode })
        });
        const gameData = await setGameResponse.json();
        const { room_code, category, word } = gameData; // 응답에서 room_code를 받아옴
        
        // 2. 이름 목록 생성 및 셔플 (총 6명)
        const availableNames = shuffleArray([...ANIMAL_NAMES]);
        const playerNames = availableNames.slice(0, 6); 
        
        const humanPlayerName = playerNames[0]; 
        const nonUserRoleName = playerNames[1]; // 비사용자 역할 (운영자 또는 일반 참가자)
        const aiNames = playerNames.slice(2, 6); 

        let newPlayers = [];

        // 2.1. P1: User Setup (N0)
        const humanPlayer = {
            id: 'p_user',
            name: humanPlayerName,
            role: isCreator ? '운영자 (라이어)' : '일반 참가자',
            keyword: word, 
            isLiar: isCreator, 
            isHuman: true,
            isOperator: isCreator, 
        };
        newPlayers.push(humanPlayer);

        // 2.2. P2: Non-User Role Setup (N1)
        const nonUserRolePlayer = {
            id: 'p_non_user_role',
            name: nonUserRoleName,
            role: isCreator ? '일반 참가자' : '운영자 (라이어)', 
            keyword: word, 
            isLiar: !isCreator, 
            isHuman: false,
            isOperator: !isCreator, 
        };
        newPlayers.push(nonUserRolePlayer);
        
        // 2.3. P3-P6: AI Setup (4 players) - 모두 일반 참가자
        for (let i = 0; i < 4; i++) {
             newPlayers.push({
                id: `p_ai_${i}`, 
                name: aiNames[i], 
                role: 'AI 참가자', 
                keyword: word, 
                isLiar: false, 
                isHuman: false,
                isOperator: false,
            });
        }

        setPlayers(newPlayers);
        setGameInfo({
            roomCode: room_code, // 방 코드 저장
            playerName: humanPlayerName,
            occupation: humanPlayer.role,
            category: category, 
            keyword: word,      
            isLiar: humanPlayer.isLiar,
        });

        // 3. 메시지 설정 (1차 진술 트리거 대기 상태로 시작)
        setMessages([
          { sender: "system", text: `[${room_code}] 방에 입장하셨습니다. 당신은 "${humanPlayerName} (${humanPlayer.role})"입니다. 카테고리: ${category}, 제시어: ${word}` },
          { sender: "system", text: `------------------------------------------------------` },
          { sender: "system", text: `${PHASES[0]} 타임이 시작되었습니다. 당신의 **1차 진술**을 입력하여 게임을 시작하세요.` },
        ]);
        
        // 1차 진술 단계는 0으로 유지 (사용자 입력이 트리거)
        setGamePhase(0); 
        setGameState('inGame');
        
    } catch (error) {
        console.error("게임 시작 오류:", error);
        alert("게임 설정 중 오류가 발생했습니다. 백엔드 서버를 확인해 주세요.");
    } finally {
        setIsLoading(false);
    }
  };
  
  // 다음 페이즈로 이동 로직
  const goToNextPhase = () => {
    // 현재 Phase가 0 (1차 진술)이면 다음은 1 (1차 토론)
    const nextPhaseIndex = gamePhase === 0 ? 1 : gamePhase + 1;
    
    if (nextPhaseIndex < PHASES.length) {
        setGamePhase(nextPhaseIndex);
        setMessages((prev) => [...prev, { 
            sender: "system", 
            text: `------------------------------------------------------` 
        }, { 
            sender: "system", 
            text: `${PHASES[nextPhaseIndex]} 타임이 시작되었습니다. 발언을 입력하세요.` 
        }]);
    } else {
        setGameState('voting'); 
        setMessages((prev) => [...prev, { 
            sender: "system", 
            text: `------------------------------------------------------` 
        }, { 
            sender: "system", 
            text: `모든 토론이 종료되었습니다. 이제 라이어를 지목하고 투표를 시작하세요!` 
        }]);
    }
  }


  // 메시지 전송 및 턴 처리 (사용자 발언 및 AI/Operator 응답)
  const handleSubmission = async () => {
    const txt = inputValue.trim();
    if (!txt || isLoading || gameState !== 'inGame') return;
    
    setIsLoading(true);

    const userPlayer = players.find(p => p.isHuman);
    const actualLiar = players.find(p => p.isLiar);
    const roomCode = gameInfo.roomCode;

    try {
        if (gamePhase === 0) {
            // Case 0: Start Trigger (사용자의 1차 진술)
            
            // 1. 유저 (참가자 또는 라이어) 메시지 생성
            const userMessage = { 
                sender: userPlayer.name, 
                text: txt, 
                role: userPlayer.role 
            };
            setMessages((prev) => [...prev, userMessage]);
            
            // 2. AI 4명 + Non-User Role 응답 요청 (신설 API 사용)
            const startDecResponse = await fetch(`${API_BASE_URL}/start_dec_with_input`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_code: roomCode,
                    user_declaration: txt, 
                })
            });
            const decData = await startDecResponse.json();
            const aiResponses = decData.ai_response;

            // 3. AI 4명의 메시지를 플레이어 이름에 매핑
            const aiMessages = aiResponses.map((text, index) => {
                const aiPlayer = players.find(p => p.id === `p_ai_${index}`);
                return { sender: aiPlayer.name, text: text, role: aiPlayer.role };
            });
            
            // 4. Non-User Role의 1차 진술 생성 (실제 라이어 역할이 누구인지 확인)
            const nonUserRolePlayer = players.find(p => p.isOperator !== userPlayer.isOperator);
            let nonUserRoleMessage;
            
            if (nonUserRolePlayer.isLiar) {
                 nonUserRoleMessage = generateOperatorMessage(nonUserRolePlayer.name, gameInfo.keyword, 0, txt); // Operator(Liar)
            } else {
                 nonUserRoleMessage = generateParticipantDummyMessage(nonUserRolePlayer.name, gameInfo.keyword, 0, txt); // Participant
            }
            
            // 5. AI (4명) + Non-User Role (1명) 메시지를 합쳐 셔플
            const shuffledMessages = shuffleArray([...aiMessages, nonUserRoleMessage]);
            
            // 6. 메시지 업데이트 및 다음 단계로 이동
            setMessages((prev) => [...prev, { 
                sender: "system", 
                text: `(참가자들의 1차 진술이 이어집니다...)` 
            }, ...shuffledMessages]);
            
            goToNextPhase(); // Phase 0 -> 1 (1차 토론)

        } else if (gameInfo.isLiar) {
            // Case 1: User is Operator/Liar (단일 단계)
            
            // 1. 유저 (라이어) 메시지 생성
            const liarMessage = { 
                sender: userPlayer.name, 
                text: txt, 
                role: userPlayer.role 
            };

            // 2. AI 4명의 응답 (백엔드 호출) - Liar의 발언을 컨텍스트로 전달
            const aiResponse = await fetch(`${API_BASE_URL}/ai_response`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_code: roomCode,
                    prompt: txt, // Liar의 발언을 AI에게 컨텍스트로 전달
                    phase: PHASES[gamePhase].includes('진술') ? '진술' : '토론'
                })
            });
            const aiData = await aiResponse.json();
            const aiResponses = aiData.ai_response; 

            // 2.1. AI 4명의 메시지를 플레이어 이름에 매핑
            const aiMessages = aiResponses.map((text, index) => {
                const aiPlayer = players.find(p => p.id === `p_ai_${index}`);
                return { sender: aiPlayer.name, text: text, role: aiPlayer.role };
            });

            // 2.2. Non-user Participant의 응답 생성 (더미 메시지)
            const nonUserParticipant = players.find(p => !p.isHuman && !p.isLiar); 
            const participantMessage = generateParticipantDummyMessage(nonUserParticipant.name, gameInfo.keyword, gamePhase, txt);

            // 3. 모든 메시지 수집 및 셔플 
            const allMessages = [liarMessage, ...aiMessages, participantMessage];
            const shuffledMessages = shuffleArray(allMessages);
            
            setMessages((prev) => [...prev, ...shuffledMessages]);
            
            // 4. 다음 단계로 전환
            goToNextPhase();

        } else if (isOperatorTurn) {
            // Case 2b: User is Participant, submitting the Operator's message (Trigger 2: AI 답변 출력)
            
            // 1. Operator/Liar 메시지 생성 (User's input is the Operator's message)
            const operatorMessage = { 
                sender: actualLiar.name, // Non-user Operator/Liar's name
                text: txt, 
                role: actualLiar.role 
            };

            // 2. 저장된 메시지들
            const userMessage = userSubmittedMessage;
            const aiMessages = pendingAIMessages;

            // 3. 모든 메시지 수집 및 셔플 (User 1명 + AI 4명 + Operator/Liar 1명)
            // 사용자 메시지를 이미 표시했으므로, AI+Operator만 섞어 표시하거나
            // 아니면 전체를 섞기 위해 시스템 메시지로 분리하고 여기서 일괄 표시
            const allMessages = [userMessage, ...aiMessages, operatorMessage];
            const shuffledMessages = shuffleArray(allMessages);
            
            // 이전 userMessage를 이미 표시했으므로, 여기서는 시스템 메시지와 AI+Operator 응답만 추가
            setMessages((prev) => {
                // 이전에 추가된 userMessage를 제외하고, 새로운 메시지들만 추가
                const newMessages = prev.filter(m => m.sender !== 'system' || m.text !== `라이어(${actualLiar.name})의 발언을 기다리고 있습니다. 운영자의 발언을 입력하세요.`);
                
                return [...prev, { 
                    sender: "system", 
                    text: `------------------------------------------------------` 
                }, ...shuffledMessages.filter(m => m !== userMessage)]; // userMessage는 이미 표시됨
            });
            
            // 4. 상태 초기화 및 다음 단계로 전환
            setPendingAIMessages(null);
            setUserSubmittedMessage(null);
            goToNextPhase();
            
        } else {
            // Case 2a: User is Participant, submitting their own message (Trigger 1: AI 답변 생성)
            
            // 1. 유저 메시지 생성 및 표시 (먼저 유저 메시지만 표시)
            const userMessage = { 
                sender: userPlayer.name, 
                text: txt, 
                role: userPlayer.role 
            };
            setUserSubmittedMessage(userMessage);
            setMessages((prev) => [...prev, userMessage]);
            
            // 2. AI 4명의 응답 (백엔드 호출) - User의 발언을 컨텍스트로 전달
            const aiResponse = await fetch(`${API_BASE_URL}/ai_response`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_code: roomCode,
                    prompt: txt, 
                    phase: PHASES[gamePhase].includes('진술') ? '진술' : '토론'
                })
            });
            const aiData = await aiResponse.json();
            const aiResponses = aiData.ai_response; 

            // 2.1. AI 4명의 메시지를 플레이어 이름에 매핑
            const aiPlayerNames = players.filter(p => p.id.startsWith('p_ai_'));
            const aiMessages = aiResponses.map((text, index) => {
                const aiPlayer = aiPlayerNames[index];
                return { sender: aiPlayer.name, text: text, role: aiPlayer.role };
            });
            
            // 3. AI 메시지 저장 및 Operator 입력 대기 상태로 전환
            setPendingAIMessages(aiMessages);
            
            // 라이어 발언을 기다린다는 시스템 메시지 추가
            setMessages((prev) => [...prev, { 
                sender: "system", 
                text: `------------------------------------------------------` 
            }, {
                sender: "system",
                text: `라이어(${actualLiar.name})의 발언을 기다리고 있습니다. 운영자의 발언을 입력하세요.`
            }]);
        }

    } catch (error) {
        console.error("메시지 전송 및 응답 오류:", error);
        alert("메시지 처리 중 오류가 발생했습니다. 백엔드 서버를 확인해 주세요.");
    } finally {
        setInputValue(""); 
        setIsLoading(false);
    }
  };


  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { 
      e.preventDefault();
      handleSubmission(); 
    }
  };
  
  // Composer Placeholder 결정
  const getPlaceholder = () => {
    if (gameState === 'voting') return "토론이 종료되었습니다. 투표를 진행하세요.";
    
    // Phase 0: 1차 진술 (트리거)
    if (gamePhase === 0) {
        return `당신의 ${PHASES[gamePhase]} 발언을 입력하여 게임을 시작하세요...`;
    }
    
    // Phase > 0
    if (gameInfo.isLiar) {
        return `당신(라이어)의 ${PHASES[gamePhase]} 발언을 입력하세요...`;
    }
    
    if (isOperatorTurn) {
        const actualLiar = players.find(p => p.isLiar);
        return `${actualLiar.name}(라이어)의 ${PHASES[gamePhase]} 발언을 대신 입력하세요... (트리거)`;
    }
    
    return `당신의 ${PHASES[gamePhase]} 발언을 입력하세요...`;
  }
  
  // Composer Disabled 상태
  const isInputDisabled = isLoading || gameState === 'voting';


  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-gray-900 via-gray-800 to-black font-sans">
      <div className="w-full max-w-2xl h-[90vh] sm:h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden bg-zinc-900 border border-zinc-700">
        
        {gameState === 'lobby' && (
          <LobbyScreen onStart={enterGame} />
        )}

        {gameState !== 'lobby' && (
          <>
            <Header gameInfo={gameInfo} currentPhase={PHASES[gamePhase]} players={players} />

            {/* 채팅 영역 */}
            <main className="flex-1 p-6 overflow-y-auto bg-zinc-900/90">
              <div className="flex flex-col gap-4">
                {messages.length === 0 && !isLoading ? (
                  <div className="self-center text-sm italic text-gray-500 mt-4">메시지가 없습니다. 토론을 시작해보세요.</div>
                ) : (
                  messages.map((m, i) => (
                    <MessageItem key={i} msg={m} players={players} />
                  ))
                )}
                
                {isLoading && (
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
              onSend={handleSubmission}
              onKeyDown={handleKeyDown}
              isDisabled={isInputDisabled}
              placeholder={getPlaceholder()}
            />
          </>
        )}
      </div>
    </div>
  );
}

// 참가자 정보 및 제목 표시
function Header({ gameInfo, currentPhase, players }) {
  const { occupation, category, keyword, isLiar: isUserLiar, roomCode } = gameInfo;

  // 실제 운영자 역할의 이름을 찾습니다.
  const actualOperator = players.find(p => p.isOperator);
  
  const operatorName = actualOperator ? actualOperator.name : '미정';

  // 사용자가 일반 참가자일 경우 (라이어를 찾아야 할 경우) 라이어 이름을 숨김
  const liarDisplay = isUserLiar 
    ? `${actualOperator.name} (당신)` 
    : `미확인 (당신이 찾아야 합니다)`;


  return (
    <header className="flex flex-col px-6 py-4 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-700 shadow-md">
      <div className="flex items-center justify-between mb-3">
        
        {/* 현재 단계 표시 */}
        <div className="flex items-center gap-3">
            <div className="text-lg font-bold text-gray-200 tracking-tight">
                <span className="text-red-500 font-bold text-base border-b border-red-500 pb-1">{currentPhase}</span> 진행 중
            </div>
        </div>

        {/* 참가 인원 수 표시 */}
        <div className="text-sm font-medium text-gray-400 px-3 py-1 bg-zinc-700 rounded-full border border-zinc-600">
            {roomCode && <span className="text-yellow-400 mr-2">CODE: {roomCode}</span>}
          <svg className="w-4 h-4 inline mr-1 -mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2a3 3 0 00-5.356-1.857M9 20h5v-2a3 3 0 00-5.356-1.857M9 20v-2a3 3 0 00-5.356-1.857M12 10a3 3 0 110-6 3 3 0 010 6zm0 2a3 3 0 110-6 3 3 0 010 6z" />
          </svg>
          총 {players.length}명 참여
        </div>
      </div>
      
      {/* 라이어 정보 표시 (역할에 따라 노출 정보 다름) */}
      <div className="text-sm text-center font-bold mb-2">
            <span className={isUserLiar ? "text-green-400" : "text-red-400"}>
                🚨 라이어: {liarDisplay}
            </span>
      </div>

      {/* 직업, 카테고리, 제시어 표시 영역 */}
      <div className="flex justify-around items-center bg-zinc-800 rounded-xl p-3 border border-zinc-700 shadow-inner text-center text-sm font-semibold">
        <InfoBadge title="내 역할" value={occupation} color={isUserLiar ? 'text-red-500' : 'text-green-400'} />
        <InfoBadge title="카테고리" value={category} color="text-yellow-400" />
        <InfoBadge title="나의 제시어" value={keyword} color="text-white" />
      </div>
    </header>
  );
}

function InfoBadge({ title, value, color }) {
    return (
        <div className="flex flex-col items-center flex-1 min-w-0 px-1">
            <span className="text-xs text-gray-400 mb-1 truncate">{title}</span>
            <span className={`text-base font-bold ${color} truncate`}>{value}</span>
        </div>
    );
}

// 메시지 버블 컴포넌트
function MessageItem({ msg, players }) {
  const isSystem = msg.sender === "system";
  const player = players.find(p => p.name === msg.sender);
  const isUser = player?.isHuman;
  const isLiar = player?.isLiar;
  const isOperator = player?.isOperator || isLiar; 

  // 메시지 버블 기본 스타일
  const base =
    "max-w-[85%] sm:max-w-[70%] px-5 py-3 text-sm leading-relaxed break-words shadow-xl transition-all duration-300";

  if (isUser) {
    // 사용자 메시지 (오른쪽) - 어두운 파란색 계열
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-right-2">
        <div className={`${base} bg-blue-700 text-white rounded-3xl rounded-br-lg font-medium`}>
          <div className="mb-1 text-xs font-bold text-blue-300">{msg.sender} (나)</div>
          {msg.text}
        </div>
      </div>
    );
  }

  if (!isSystem) {
    // AI/Liar 메시지 (왼쪽) - 역할에 따라 색상 구분
    const colorClass = isLiar ? 'from-red-600 to-red-800' : (isOperator ? 'from-purple-600 to-purple-800' : 'from-zinc-600 to-zinc-800'); 
    const textColorClass = isLiar ? 'text-red-500' : (isOperator ? 'text-purple-400' : 'text-gray-400');
    
    let roleText = '';
    if (isLiar && isOperator) {
        roleText = ' (운영자/라이어)';
    } else if (isOperator) {
        roleText = ' (운영자)';
    } else {
        roleText = '';
    }

    return (
      <div className="flex justify-start items-start animate-in fade-in slide-in-from-left-2">
        <div className="flex-shrink-0 mr-3 mt-1">
          {/* AI/Operator 프로필 아이콘 */}
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white text-xs font-bold shadow-md border border-zinc-700`}>
            {msg.sender[0]}
          </div>
        </div>
        <div className={`${base} bg-zinc-800 text-gray-200 border border-zinc-700 rounded-3xl rounded-bl-lg`}>
            {/* 닉네임 + 역할 표시 */}
            <div className={`mb-1 text-xs font-bold ${textColorClass}`}>
                {msg.sender}{roleText}
            </div>
            {msg.text}
        </div>
      </div>
    );
  }

  // 시스템 메시지 (중앙) - 톤다운된 회색
  return (
    <div className="flex justify-center animate-in fade-in">
      <div className={`${base} bg-zinc-800/80 text-gray-500 text-xs rounded-full px-4 py-2 max-w-[90%] shadow-inner border border-zinc-700 text-center`}>
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
        {isDisabled ? (
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