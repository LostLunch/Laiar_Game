import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Send, Users, Mic, ChevronRight, Check, Zap, LogIn } from 'lucide-react';

// API 호스트 설정 (백엔드와 통신할 주소를 설정합니다. 기본값은 localhost:8000)
const API_HOST = "http://localhost:8000";

// 게임 상태 정의
const GAME_STATE = {
  CONNECT: 'CONNECT',       // 초기 연결 및 역할 선택
  SETUP: 'SETUP',           // 게임 시작 전 (주제 설정)
  STATEMENT_1: 'STATEMENT_1', // 1차 진술
  DISCUSSION_1: 'DISCUSSION_1', // 1차 토론 (플레이어/운영자 개입 가능)
  STATEMENT_2: 'STATEMENT_2', // 2차 진술 (선택적)
  DISCUSSION_2: 'DISCUSSION_2', // 2차 토론 (플레이어/운영자 개입 가능)
  VOTE: 'VOTE',             // 투표
  ENDED: 'ENDED'            // 게임 종료
};

// 사용자 역할 정의
const USER_ROLE = {
  ADMIN: 'ADMIN',
  PARTICIPANT: 'PARTICIPANT',
  NONE: 'NONE',
};

// AI 참가자 스타일 (api.py의 styles와 순서 일치)
const AI_STYLES = [
  '까칠한 (AI 1)',
  '치밀한 (AI 2)',
  '얍삽한 (AI 3)',
  '광대 (AI 4)'
];

// 익명 참가자 ID 목록 (라이어(인간)에게 할당됨)
const ANON_STYLES = ['익명 1', '익명 2', '익명 3', '익명 4', '익명 5'];

// 메시지 타입
const MESSAGE_TYPE = {
  SYSTEM: 'system',
  USER: 'user',             // 인간 플레이어 (라이어) 메시지
  AI_STATEMENT: 'ai_statement', 
  AI_RESPONSE: 'ai_response',
  OPERATOR: 'operator_message'  // 운영자 개입 메시지
};

/**
 * 기본 메시지 박스 컴포넌트
 */
const ChatMessage = ({ text, type, participantIndex, humanLiarAnonId, role }) => {
  let senderInfo = '';
  let bgColor = 'bg-gray-200';
  let textColor = 'text-gray-800';
  let align = 'self-start';
  let Icon = Users;

  switch (type) {
    case MESSAGE_TYPE.SYSTEM:
      bgColor = 'bg-yellow-100/70 border border-yellow-300';
      textColor = 'text-yellow-800';
      Icon = Play;
      break;
    case MESSAGE_TYPE.USER:
      // 인간 플레이어(라이어/어드민)의 익명 ID 사용
      senderInfo = humanLiarAnonId || '익명 (나)'; 
      // ADMIN 자신에게만 "나" 표시
      if (role === USER_ROLE.ADMIN) {
        senderInfo += ' (나)';
      }
      bgColor = 'bg-teal-200';
      textColor = 'text-teal-900';
      align = 'self-end';
      Icon = Check;
      break;
    case MESSAGE_TYPE.AI_STATEMENT:
    case MESSAGE_TYPE.AI_RESPONSE:
      // AI 참가자 스타일 사용
      senderInfo = AI_STYLES[participantIndex] || 'AI 오류';
      bgColor = 'bg-sky-100';
      textColor = 'text-sky-900';
      Icon = Mic;
      break;
    case MESSAGE_TYPE.OPERATOR:
      senderInfo = '게임 운영자';
      bgColor = 'bg-red-100/70 border border-red-300';
      textColor = 'text-red-800';
      Icon = Zap;
      break;
    default:
      break;
  }

  return (
    <div className={`${align} max-w-lg w-full`}>
      <div className="flex items-start mb-1 text-xs space-x-1">
        <Icon size={12} className={type === MESSAGE_TYPE.USER ? 'text-teal-600' : 'text-sky-600'} />
        <span className={`font-semibold ${type === MESSAGE_TYPE.USER ? 'text-teal-700' : 'text-sky-700'}`}>
          {senderInfo}
        </span>
      </div>
      <div className={`px-4 py-3 rounded-2xl break-words shadow-sm transition-all duration-300 ${bgColor} ${textColor}`}>
        {text.split('\n').map((line, index) => (
          <p key={index} className="my-0">{line}</p>
        ))}
      </div>
    </div>
  );
};


// ----------------------------------------------------
// 메인 앱 컴포넌트
// ----------------------------------------------------
export default function App() {
  const [gameState, setGameState] = useState(GAME_STATE.CONNECT);
  const [role, setRole] = useState(USER_ROLE.NONE);
  const [humanLiarAnonId, setHumanLiarAnonId] = useState(''); // 랜덤 배정된 인간 플레이어의 익명 ID
  const [roomId, setRoomId] = useState('Game001'); // 단순 Room ID (백엔드 미지원으로 고정값 사용)
  
  const [category, setCategory] = useState('');
  const [word, setWord] = useState(''); // 디버깅/운영자용 제시어 (ADMIN에게만 표시)
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 현재 라운드 진행 상태를 표시
  const roundSteps = [
    { state: GAME_STATE.STATEMENT_1, label: '1차 진술', step: 1 },
    { state: GAME_STATE.DISCUSSION_1, label: '1차 토론', step: 2 },
    { state: GAME_STATE.STATEMENT_2, label: '2차 진술', step: 3 },
    { state: GAME_STATE.DISCUSSION_2, label: '2차 토론', step: 4 },
    { state: GAME_STATE.VOTE, label: '투표', step: 5 },
  ];

  const currentStep = roundSteps.find(r => r.state === gameState)?.step || 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ----------------------------------------------------
  // 역할 선택 핸들러
  // ----------------------------------------------------
  const handleConnect = (selectedRole) => {
    setRole(selectedRole);
    setGameState(GAME_STATE.SETUP);
    if (selectedRole === USER_ROLE.ADMIN) {
      // ADMIN이 방을 만들면, 익명 ID 중 하나를 라이어(ADMIN) 역할로 랜덤 배정
      const randomAnonId = ANON_STYLES[Math.floor(Math.random() * ANON_STYLES.length)];
      setHumanLiarAnonId(randomAnonId);
      setMessages([{ 
        type: MESSAGE_TYPE.SYSTEM, 
        text: `ADMIN 권한으로 게임방 [${roomId}]에 연결되었습니다. 당신은 "${randomAnonId}"로 표시되며 라이어 역할을 수행합니다. 게임을 시작해주세요.` 
      }]);
    } else {
      // PARTICIPANT는 익명 ID를 배정받지 않음 (모두를 관찰)
      setHumanLiarAnonId('');
      setMessages([{ 
        type: MESSAGE_TYPE.SYSTEM, 
        text: `참가자 권한으로 게임방 [${roomId}]에 연결되었습니다. 관리자가 게임을 시작할 때까지 기다려 주세요. 채팅은 불가능하며 관전만 가능합니다.` 
      }]);
    }
  };


  // ----------------------------------------------------
  // API 통신 함수
  // ----------------------------------------------------

  // 1. 게임 제시어 설정 및 초기화
  const handleSetGame = async () => {
    if (role !== USER_ROLE.ADMIN) return;
    setIsLoading(true);
    setMessages([]);
    setGameState(GAME_STATE.SETUP);

    // 새 게임 시작 시 익명 ID 재배정 (사용자의 요청)
    const randomAnonId = ANON_STYLES[Math.floor(Math.random() * ANON_STYLES.length)];
    setHumanLiarAnonId(randomAnonId);

    try {
      const res = await fetch(`${API_HOST}/api/set_game_word`, { method: 'PATCH' });
      if (!res.ok) throw new Error('게임 설정 실패');
      const data = await res.json();
      
      setCategory(data.category);
      setWord(data.word); // ADMIN에게만 제시어 정보 저장
      
      setMessages([{ 
        type: MESSAGE_TYPE.SYSTEM, 
        text: `새 게임이 시작되었습니다. 카테고리: [${data.category}]. 당신의 익명 ID는 "${randomAnonId}"로 설정되었습니다. (총 4명의 AI + 1명의 라이어(익명ID))` 
      }]);
      setGameState(GAME_STATE.STATEMENT_1); // 설정 완료 후 바로 1차 진술 단계로 이동
    } catch (error) {
      console.error('게임 설정 오류:', error);
      setMessages([{ type: MESSAGE_TYPE.SYSTEM, text: `오류: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. AI 진술 요청 (1차 또는 2차)
  const handleStartStatement = useCallback(async (nextState) => {
    if (role !== USER_ROLE.ADMIN) return;
    setIsLoading(true);
    
    setMessages(prev => [...prev, { 
      type: MESSAGE_TYPE.SYSTEM, 
      text: nextState === GAME_STATE.DISCUSSION_1 ? '--- 1차 진술 시작 ---' : '--- 2차 진술 시작 ---'
    }]);

    try {
      const res = await fetch(`${API_HOST}/api/start_dec`, { method: 'PATCH' });
      if (!res.ok) throw new Error('AI 진술 요청 실패');
      const data = await res.json();
      
      const newStatements = data.declaration_messages.map((text, index) => ({
        type: MESSAGE_TYPE.AI_STATEMENT,
        text: text,
        participantIndex: index,
      }));
      
      setMessages(prev => [...prev, ...newStatements]);
      setGameState(nextState); // 다음 단계로 전환 (토론 단계)

    } catch (error) {
      console.error('진술 요청 오류:', error);
      setMessages(prev => [...prev, { type: MESSAGE_TYPE.SYSTEM, text: `오류: ${error.message}` }]);
      setGameState(GAME_STATE.SETUP); 
    } finally {
      setIsLoading(false);
    }
  }, [role]);

  // 3. 플레이어(라이어) 메시지 전송 또는 운영자 개입 및 AI 토론 응답 요청
  const handlePlayerOrOperatorInput = async (isOperator = false) => {
    if (role !== USER_ROLE.ADMIN) return;
    const txt = inputValue.trim();
    if (!txt || isLoading) return;

    setIsLoading(true);
    setInputValue('');
    
    // 1. 사용자/운영자 메시지 기록
    setMessages(prev => [...prev, { 
      type: isOperator ? MESSAGE_TYPE.OPERATOR : MESSAGE_TYPE.USER, 
      text: txt,
      humanLiarAnonId: humanLiarAnonId // USER 타입 메시지에 익명 ID 전달
    }]);

    try {
      let res;
      let apiPath = isOperator ? '/api/operator_ai' : '/api/ai_response';
      let body = isOperator 
        ? JSON.stringify({ operator_message: txt }) 
        : JSON.stringify({ prompt: txt, phase: '토론' });
      
      res = await fetch(`${API_HOST}${apiPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      });

      if (!res.ok) throw new Error(`AI 응답 요청 실패: HTTP ${res.status}`);
      const data = await res.json();

      // 응답 메시지를 AI 스타일 순서대로 추가
      const aiResponses = data.ai_responses || data.declaration_messages;
      
      const newResponses = aiResponses.map((text, index) => ({
        type: MESSAGE_TYPE.AI_RESPONSE,
        text: text,
        participantIndex: index,
      }));

      setMessages(prev => [...prev, ...newResponses]);
      
    } catch (error) {
      console.error('AI 응답 요청 오류:', error);
      setMessages(prev => [...prev, { type: MESSAGE_TYPE.SYSTEM, text: `오류: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };


  // Enter 키 입력 처리
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // ADMIN이고 현재 토론 단계일 때만 입력 허용 (라이어로서 발언)
      if (role === USER_ROLE.ADMIN && (gameState === GAME_STATE.DISCUSSION_1 || gameState === GAME_STATE.DISCUSSION_2)) {
        handlePlayerOrOperatorInput(false); 
      }
    }
  };

  // ----------------------------------------------------
  // UI 렌더링 함수
  // ----------------------------------------------------

  const renderGameControls = () => {
    if (role !== USER_ROLE.ADMIN) {
      return (
        <p className="text-center text-red-500 font-semibold py-3 bg-red-100 rounded-xl">
          당신은 참가자입니다. 게임 관리 및 채팅 권한이 없습니다.
        </p>
      );
    }

    switch (gameState) {
      case GAME_STATE.SETUP:
      case GAME_STATE.ENDED:
        return (
          <button
            onClick={handleSetGame}
            disabled={isLoading}
            className="w-full bg-blue-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-600 transition-all duration-200 flex items-center justify-center space-x-2"
          >
            <RefreshCw size={20} />
            <span>{gameState === GAME_STATE.ENDED ? '새 게임 다시 시작 (익명 ID 섞임)' : '게임 설정 및 시작'}</span>
          </button>
        );

      case GAME_STATE.STATEMENT_1:
        return (
          <button
            onClick={() => handleStartStatement(GAME_STATE.DISCUSSION_1)}
            disabled={isLoading}
            className="w-full bg-green-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-green-600 transition-all duration-200 flex items-center justify-center space-x-2"
          >
            <Mic size={20} />
            <span>1차 진술 시작</span>
          </button>
        );

      case GAME_STATE.DISCUSSION_1:
      case GAME_STATE.DISCUSSION_2:
        return (
          <div className="flex flex-col space-y-2">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`"${humanLiarAnonId}"로서 라이어인 척하며 질문하세요...`}
                className="flex-1 border border-sky-300 rounded-full px-4 py-2 bg-white bg-opacity-70 focus:outline-none focus:ring-2 focus:ring-sky-300"
                disabled={isLoading}
              />
              <button
                onClick={() => handlePlayerOrOperatorInput(false)}
                disabled={isLoading || !inputValue.trim()}
                className="bg-teal-500 text-white rounded-full p-3 hover:bg-teal-600 transition-colors shadow-md"
                title="라이어(익명ID)로서 발언"
              >
                <Send size={20} />
              </button>
            </div>
            
            <div className="flex justify-between space-x-2">
              <button
                onClick={() => handlePlayerOrOperatorInput(true)}
                disabled={isLoading || !inputValue.trim()}
                className="flex-1 bg-red-400 text-white rounded-full px-4 py-2 hover:bg-red-500 transition-colors shadow-md text-sm flex items-center justify-center space-x-1"
                title="관리자 전용: AI에게 직접적인 지시/질문 전달"
              >
                <Zap size={16} />
                <span>운영자 개입 (Admin 전용)</span>
              </button>
              
              {(gameState === GAME_STATE.DISCUSSION_1) ? (
                <button
                  onClick={() => handleStartStatement(GAME_STATE.DISCUSSION_2)}
                  disabled={isLoading}
                  className="bg-yellow-500 text-white rounded-full px-4 py-2 hover:bg-yellow-600 transition-colors shadow-md flex items-center space-x-1 text-sm"
                >
                  <ChevronRight size={16} />
                  <span>2차 진술로 이동</span>
                </button>
              ) : (
                <button
                  onClick={() => setGameState(GAME_STATE.VOTE)}
                  disabled={isLoading}
                  className="bg-purple-500 text-white rounded-full px-4 py-2 hover:bg-purple-600 transition-colors shadow-md flex items-center space-x-1 text-sm"
                >
                  <Check size={16} />
                  <span>투표 단계로 이동</span>
                </button>
              )}
            </div>
          </div>
        );
      
      case GAME_STATE.VOTE:
        return (
          <div className="flex flex-col space-y-2">
            <p className="text-lg text-center font-bold text-purple-700">
              라이어(익명 ID)를 선택하고 투표하세요!
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ANON_STYLES.map((anonId, index) => (
                <button key={index} 
                  className="bg-purple-200 text-purple-800 font-semibold py-2 rounded-xl hover:bg-purple-300 transition-colors shadow-sm text-sm"
                  onClick={() => {
                    setMessages(prev => [...prev, { type: MESSAGE_TYPE.SYSTEM, text: `[투표 결과] 당신은 "${anonId}"를 라이어로 지목했습니다. 정답은 "${humanLiarAnonId}"였습니다. 승패 처리 및 정답 공개 로직이 필요합니다.` }]);
                    setGameState(GAME_STATE.ENDED);
                  }}
                >
                  {anonId}
                </button>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };
  
  // 역할 선택 화면 렌더링
  if (gameState === GAME_STATE.CONNECT) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-100 to-sky-200 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6 text-center">
          <h2 className="text-3xl font-extrabold text-blue-700 mb-4 flex items-center justify-center space-x-2">
            <LogIn size={28} />
            <span>게임방 접속</span>
          </h2>
          <p className="text-gray-600">역할을 선택하고 게임에 입장하세요. (방 ID: {roomId})</p>
          
          <div className="space-y-4">
            <button
              onClick={() => handleConnect(USER_ROLE.ADMIN)}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-600 transition-all duration-200"
            >
              방 만들기 (관리자/라이어)
            </button>
            <button
              onClick={() => handleConnect(USER_ROLE.PARTICIPANT)}
              className="w-full bg-gray-300 text-gray-800 font-bold py-3 rounded-xl shadow-lg hover:bg-gray-400 transition-all duration-200"
            >
              방 참여 (참가자/관전자)
            </button>
          </div>
          <p className="text-xs text-red-500 mt-4">
            *주의: 현재는 싱글 파일 구성으로, 참가자 모드는 동기화 없이 관전만 가능합니다.
          </p>
        </div>
      </div>
    );
  }

  // 메인 게임 화면 렌더링
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-100 to-sky-200 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col p-6 space-y-4">
        
        {/* 헤더 및 진행 상황 */}
        <div className="flex flex-col items-center border-b pb-3 border-sky-200">
          <h1 className="text-3xl font-extrabold text-blue-700">AI Liar Game</h1>
          <div className="flex items-center space-x-4 mt-2">
            <span className="text-sm font-medium text-gray-600">
              역할: <span className={role === USER_ROLE.ADMIN ? 'text-blue-600 font-bold' : 'text-gray-600'}>{role === USER_ROLE.ADMIN ? '관리자(ADMIN)' : '참가자'}</span>
            </span>
            {role === USER_ROLE.ADMIN && (
              <span className="text-sm font-medium text-teal-600">
                나의 익명 ID: <span className="font-bold">{humanLiarAnonId}</span>
              </span>
            )}
          </div>
          
          {/* Admin에게만 보이는 제시어 정보 */}
          {role === USER_ROLE.ADMIN && gameState !== GAME_STATE.CONNECT && (
            <div className="text-center mt-2 p-1 bg-red-50 rounded-md text-sm text-red-600 font-medium">
              카테고리: {category || '미설정'} / 제시어: {word || '???'} (ADMIN 전용 정보)
            </div>
          )}
          
          <div className="w-full max-w-lg mt-4">
            <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
              {roundSteps.map(r => (
                <span key={r.step} className={currentStep >= r.step ? 'text-blue-600' : 'text-gray-400'}>{r.label}</span>
              ))}
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500 ease-in-out"
                style={{ width: `${(currentStep / roundSteps.length) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 bg-gray-50 rounded-xl p-4 sm:p-6 overflow-y-auto shadow-inner border border-gray-100">
          <div className="flex flex-col space-y-4">
            {messages.length === 0 && gameState === GAME_STATE.SETUP ? (
              <p className="text-gray-500 italic text-center py-10">
                {role === USER_ROLE.ADMIN ? 
                  "게임을 설정하고 **'게임 설정 및 시작'** 버튼을 눌러주세요." : 
                  "관리자가 게임을 시작할 때까지 기다려 주세요."}
              </p>
            ) : (
              messages.map((msg, idx) => (
                <ChatMessage
                  key={idx}
                  text={msg.text}
                  type={msg.type}
                  participantIndex={msg.participantIndex}
                  humanLiarAnonId={msg.type === MESSAGE_TYPE.USER ? msg.humanLiarAnonId : humanLiarAnonId} // 메시지 타입에 따라 익명 ID 전달
                  role={role}
                />
              ))
            )}
            {isLoading && (
              <div className="self-center p-3 text-blue-500 flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>AI들이 생각 중입니다...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 컨트롤 영역 */}
        <div className="w-full">
          {renderGameControls()}
        </div>
        
      </div>
    </div>
  );
}
