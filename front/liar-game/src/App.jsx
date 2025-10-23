import React, { useState, useRef, useEffect } from "react";

// --- 상수 정의 ---
const ANIMAL_NAMES = ['호랑이', '사자', '독수리', '코끼리', '여우', '토끼', '고래', '펭귄', '하마', '팬더'];
const PHASES = ['1차 진술', '1차 토론', '2차 진술', '2차 토론'];

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


// --- 컴포넌트 정의 ---

// 로비 화면 컴포넌트
function LobbyScreen({ onStart }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-900/90 text-white">
      <div className="text-center">
        {/* 크라임씬 테마 타이틀 */}
        <h1 className="text-6xl sm:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-red-600 mb-8 tracking-tighter drop-shadow-lg font-serif">
          라AI어 게임
        </h1>
        <p className="text-lg text-gray-400 mb-12 font-medium">
          거짓말을 숨기고 진실을 유추하라!
        </p>

        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-sm mx-auto">
          {/* 어두운 테마 버튼 */}
          <button
            onClick={() => onStart('create')}
            className="flex-1 py-4 px-6 rounded-3xl text-xl font-bold text-white bg-red-700 shadow-xl shadow-red-900/50 hover:bg-red-800 transition-all duration-300 transform hover:scale-[1.03] active:scale-100 border border-red-500"
          >
            방 생성하기
          </button>
          <button
            onClick={() => onStart('join')}
            className="flex-1 py-4 px-6 rounded-3xl text-xl font-bold text-red-500 bg-zinc-700 border-2 border-red-500 shadow-lg hover:bg-zinc-600 transition-all duration-300 transform hover:scale-[1.03] active:scale-100"
          >
            참가하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [gameState, setGameState] = useState("lobby"); // 'lobby', 'inGame', 'voting'
  const [gamePhase, setGamePhase] = useState(0); // 0: 1차 진술, 1: 1차 토론, ...
  const [players, setPlayers] = useState([]); // 6명의 플레이어 정보
  const [gameInfo, setGameInfo] = useState({ // 유저에게 보여줄 정보
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

  // 메시지 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // AI 메시지 생성 시뮬레이션 (현재 페이즈에 맞춰 더미 메시지 생성)
  const generateAIMessages = async (userPlayer) => {
    const aiPlayers = players.filter(p => !p.isHuman);
    
    // AI가 메시지를 생성하는 시간 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500)); 

    return aiPlayers.map(ai => {
        let content = "";
        // 일반 참가자 제시어 (사용자 역할과 관계없이 실제 제시어)
        const commonKeyword = players.find(p => !p.isLiar && p.keyword !== '???')?.keyword || '제시어'; 

        // 페이즈에 따른 AI 발언 시뮬레이션
        if (PHASES[gamePhase].includes('진술')) {
            content = ai.isLiar ? 
                `제시어는 [진술]할 때 저에게 꼭 필요한 물건이었습니다. 하지만 최근에는 [진술]의 경향이 바뀌고 있죠. (AI: ${ai.name})` : 
                `이 ${commonKeyword}은(는) 크기와 상관없이 [진술]하기 좋은 곳에 있습니다. (AI: ${ai.name})`;
        } else if (PHASES[gamePhase].includes('토론')) {
             // 토론 단계에서는 유저의 마지막 발언을 받은 것처럼 응답
             const lastUserText = userPlayer.text || '발언';
             content = ai.isLiar ? 
                `(${userPlayer.name}님께) '경향이 바뀐다'는 말씀이 무슨 뜻인가요? ${commonKeyword}에 대해 좀 더 구체적으로 설명해 주시겠어요? (AI: ${ai.name})` : 
                `(${userPlayer.name}님께) 저도 그 점에 동의합니다. ${commonKeyword}은(는) [토론]을 통해 더 잘 이해될 수 있는 특징을 가지고 있죠. (AI: ${ai.name})`;
        }
        
        // AI 메시지에서 임시로 넣어둔 이름 제거
        return { sender: ai.name, text: content.replace(` (AI: ${ai.name})`, ''), role: ai.role };
    });
  };

  // 게임 시작 (방 생성 또는 참가)
  const enterGame = (mode) => {
    // 1. 카테고리/제시어 설정 (더미)
    const category = '가전제품';
    const keyword = '로봇 청소기';
    
    const isUserLiar = mode === 'create'; // 방 생성 = Liar (운영자) 역할

    // 2. 이름 목록 생성 및 셔플 (총 6명)
    const availableNames = shuffleArray([...ANIMAL_NAMES]);
    const usedNames = availableNames.slice(0, 6);

    // 3. 플레이어 및 역할 정의 (총 6명)
    const players = [];
    let liarAssigned = false;

    // P1: Human Player (User)
    players.push({
        id: 'p_user',
        name: usedNames[0],
        role: isUserLiar ? '라이어' : '일반 참가자',
        // 운영자(라이어)에게 실제 제시어를 받음
        keyword: keyword, 
        isLiar: isUserLiar,
        isHuman: true,
    });
    liarAssigned = isUserLiar;
    
    // P2-P6: AI Players (총 5명. 유저가 일반인일 경우 AI 중 1명이 라이어)
    const aiCount = 5;
    for (let i = 0; i < aiCount; i++) {
        const isAILiar = !liarAssigned; // 유저가 일반인이면 첫 번째 AI가 라이어
        if (isAILiar) liarAssigned = true; // 라이어 역할 할당 완료

        players.push({
            id: `p_ai_${i}`,
            name: usedNames[i + 1],
            role: isAILiar ? 'AI 라이어' : 'AI 참가자',
            // AI 라이어에게만 '???'를 할당 (토론 시 혼란 유도)
            keyword: isAILiar ? '???' : keyword, 
            isLiar: isAILiar,
            isHuman: false,
        });
    }

    setPlayers(players);
    setGameInfo({
        playerName: usedNames[0],
        occupation: isUserLiar ? '운영자 (라이어)' : '참가자',
        category: category,
        // 운영자(라이어)도 실제 제시어를 표시함
        keyword: keyword, 
        isLiar: isUserLiar,
    });
    setMessages([
      { sender: "system", text: `게임이 시작되었습니다. 당신은 "${usedNames[0]} (${isUserLiar ? '운영자' : '참가자'})"입니다. ${PHASES[0]} 타임이 시작됩니다. 제시어에 맞게 발언을 준비하세요.` }
    ]);
    setGamePhase(0); // 0 = 1차 진술
    setGameState('inGame');
  };
  
  // 메시지 전송 및 턴 처리
  const sendMessage = async () => {
    const txt = inputValue.trim();
    if (!txt || isLoading || gameState !== 'inGame') return;
    
    setIsLoading(true);

    const userPlayer = players.find(p => p.isHuman);
    
    // 1. 유저 메시지 수집 (유저의 텍스트를 AI 메시지 생성 시에도 활용하기 위해 임시 저장)
    const userMessage = { 
        sender: userPlayer.name, 
        text: txt, 
        role: userPlayer.role 
    };
    
    setInputValue(""); 
    
    // 2. AI 메시지 생성
    const aiMessages = await generateAIMessages({ ...userPlayer, text: txt });

    // 3. 모든 메시지 수집 및 셔플
    const allMessages = [userMessage, ...aiMessages];
    const shuffledMessages = shuffleArray(allMessages);

    // 4. 메시지 업데이트
    setMessages((prev) => [...prev, ...shuffledMessages]);

    // 5. 다음 단계로 전환
    const nextPhaseIndex = gamePhase + 1;
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
        setGameState('voting'); // 게임 종료 (투표) 단계로 가정
        setMessages((prev) => [...prev, { 
            sender: "system", 
            text: `------------------------------------------------------` 
        }, { 
            sender: "system", 
            text: `모든 토론이 종료되었습니다. 이제 라이어를 지목하고 투표를 시작하세요!` 
        }]);
    }
    
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { // Shift+Enter는 줄바꿈 허용
      e.preventDefault();
      sendMessage();
    }
  };

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
                {messages.length === 0 ? (
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
              onSend={sendMessage}
              onKeyDown={handleKeyDown}
              isDisabled={isLoading || gameState === 'voting'}
              placeholder={gameState === 'voting' ? "토론이 종료되었습니다. 투표를 진행하세요." : `${PHASES[gamePhase]} 발언을 입력하세요...`}
            />
          </>
        )}
      </div>
    </div>
  );
}

// 참가자 정보 및 제목 표시
function Header({ gameInfo, currentPhase, players }) {
  const { occupation, category, keyword } = gameInfo;

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
          <svg className="w-4 h-4 inline mr-1 -mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2a3 3 0 00-5.356-1.857M9 20h5v-2a3 3 0 00-5.356-1.857M9 20v-2a3 3 0 00-5.356-1.857M12 10a3 3 0 110-6 3 3 0 010 6zm0 2a3 3 0 110-6 3 3 0 010 6z" />
          </svg>
          총 {players.length}명 참여
        </div>
      </div>

      {/* 직업, 카테고리, 제시어 표시 영역 */}
      <div className="flex justify-around items-center bg-zinc-800 rounded-xl p-3 border border-zinc-700 shadow-inner text-center text-sm font-semibold">
        <InfoBadge title="내 역할" value={occupation} color={gameInfo.isLiar ? 'text-red-500' : 'text-green-400'} />
        {/* JSX 속성 값의 따옴표 오류 수정: '}' 제거 */}
        <InfoBadge title="카테고리" value={category} color="text-yellow-400" />
        {/* 운영자(라이어)도 실제 제시어를 표시함 */}
        {/* JSX 속성 값의 따옴표 오류 수정: '}' 제거 */}
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
  const isUser = players.find(p => p.name === msg.sender)?.isHuman;
  const player = players.find(p => p.name === msg.sender);

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
    // AI 메시지 (왼쪽) - 어두운 회색 계열
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
            {/* 닉네임만 표시 (요청사항 반영) */}
            <div className={`mb-1 text-xs font-bold ${isLiar ? 'text-red-500' : 'text-gray-400'}`}>
                {msg.sender}
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