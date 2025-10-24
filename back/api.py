import eventlet

eventlet.monkey_patch()

import os
import random
import string
import json
import concurrent.futures
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from openai import OpenAI
from dotenv import load_dotenv


load_dotenv()

# ---------------------
# Flask 및 Socket.IO 초기화
# ---------------------
app = Flask(__name__, template_folder="templates")
CORS(app) 
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# ---------------------
# OpenAI 클라이언트
# ---------------------
clients = []
for i in range(1, 5):
    try:
        clients.append(OpenAI(api_key=os.getenv(f"GPT_API_KEY_{i}")))
    except Exception as e:
        print(f"Error initializing OpenAI client {i}: {e}")
        class DummyClient:
            def chat(self): return self
            def completions(self): return self
            def create(self, **kwargs): 
                return {
                    'choices': [{'message': {'content': f'더미 응답: API 키 오류 (AI {i})'}}]
                }
        clients.append(DummyClient())

# ---------------------
# 게임 데이터
# ---------------------
categories = {
    "음식": ["사과", "바나나", "딸기", "수박", "포도", "오렌지", "피자", "햄버거", "치킨", "라면", "김밥", "떡볶이", "짜장면", "초밥"],
    "동물": ["강아지", "고양이", "호랑이", "사자", "코끼리", "기린", "원숭이", "토끼", "거북이", "악어", "펭귄", "북극곰", "판다"],
    "사물": ["컴퓨터", "스마트폰", "텔레비전", "냉장고", "세탁기", "전자레인지", "책상", "의자", "침대", "시계", "자동차", "자전거"],
    "장소": ["학교", "병원", "공원", "도서관", "영화관", "백화점", "마트", "경찰서", "소방서", "우체국", "은행", "공항", "지하철역"]
}
rooms = {} # 메모리 기반 룸 저장소
PHASES = ['1차 진술', '1차 토론', '2차 진술', '2차 토론', '투표']

# 💡 [추가] 프론트에서 가져온 닉네임 리스트
ANIMAL_NAMES = [
    "날랜 사자", "용맹한 호랑이", "거대한 코끼리", "목이 긴 기린", "느긋한 하마", "줄무늬 얼룩말", "강철 코뿔소", "은밀한 표범", "민첩한 치타",
    "영리한 늑대", "교활한 여우", "육중한 곰", "손 씻는 너구리", "우아한 사슴", "볼 빵빵 다람쥐", "귀여운 토끼", "시끄러운 원숭이", 
    "힘센 고릴라", "숲속의 오랑우탄", "점프왕 캥거루", "잠꾸러기 코알라", "대나무 판다", "뒤뚱뒤뚱 펭귄", "북극곰", "바다표범", "돌고래", 
    "바다의 왕 고래", "무서운 상어", "늪지대의 악어", "장수 거북이", "또아리 튼 뱀", "카멜레온 도마뱀"
]

# ---------------------
# 도우미 함수
# ---------------------
def generate_room_id(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def get_game_words():
    topic = random.choice(list(categories.keys()))
    words = random.sample(categories[topic], 2)
    return topic, words[0], words[1] # 주제, 라이어 단어, 시민 단어

# 💡 [오류 수정] 헬스 체크를 위한 기본 HTTP 루트 추가
@app.route('/')
def index():
    return "Liar Game Server is running."

# ---------------------
# Socket.IO 이벤트 핸들러
# ---------------------
@socketio.on('connect')
def connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def disconnect():
    print(f"Client disconnected: {request.sid}")
    # 유저가 속한 방 찾아서 퇴장 처리
    room_id_to_leave = None
    user_id_to_leave = None
    for room_id, room in rooms.items():
        if room.get('operator_sid') == request.sid:
            room_id_to_leave = room_id
            user_id_to_leave = room['operator_id']
            break
        if room.get('user_sid') == request.sid:
            room_id_to_leave = room_id
            user_id_to_leave = room['user_id']
            break
    
    if room_id_to_leave and user_id_to_leave:
        handle_leave_room({'roomId': room_id_to_leave, 'userId': user_id_to_leave}, is_disconnect=True)

def emit_room_state(room_id):
    if room_id in rooms:
        socketio.emit('roomState', rooms[room_id], to=room_id)

@socketio.on('create_room')
def create_room(data):
    user_id = data.get('userId')
    is_operator = data.get('isOperator', False) # 운영자(라이어)
    
    room_id = generate_room_id()
    while room_id in rooms:
        room_id = generate_room_id()

    topic, liar_word, citizen_word = get_game_words()
    
    # 💡 [수정] 닉네임 생성을 위해 이름 풀 복사
    available_names = ANIMAL_NAMES[:]
    
    # 💡 [수정] 운영자 닉네임 할당
    operator_name = random.choice(available_names)
    available_names.remove(operator_name) # 중복 제거
    
    ai_players = []
    # 💡 [추가] AI 성격 정의
    personalities = [
        "말이 많고 사교적이며, 다른 사람의 말에 리액션을 잘 해주는 성격",
        "매우 논리적이고 분석적이며, 발언의 모순점을 지적하는 성격",
        "소심하고 겁이 많으며, 확신 없이 조심스럽게 말하는 성격",
        "공격적이고 직설적이며, 강하게 의심을 표출하는 성격"
    ]

    for i in range(4):
        # 💡 [수정] AI에게도 랜덤 동물 닉네임 할당
        ai_name = random.choice(available_names)
        available_names.remove(ai_name) # 중복 제거
        
        ai_players.append({
            "id": f"ai_{i+1}",
            "name": ai_name, # 💡 [수정] AI 이름 저장
            "isLiar": False, # AI는 라이어가 아님
            "personality": personalities[i] # 💡 [추가] 성격 할당
        })

    rooms[room_id] = {
        "id": room_id,
        "topic": topic,
        "liar_word": liar_word,
        "citizen_word": citizen_word,
        "operator_id": user_id, # 운영자가 라이어
        "operator_sid": request.sid,
        "operator_name": operator_name, # 💡 [추가] 운영자 닉네임 저장
        "user_id": None, # 참가자 (아직 없음)
        "user_sid": None,
        "user_name": None, # 💡 [추가] 참가자 닉네임 (아직 없음)
        "ai_players": ai_players, # 💡 [수정] 성격/이름이 포함된 AI 정보
        "messages": [
            {
                'id': f"msg_system_0",
                'sender': 'system', 
                'sender_name': '시스템', # 💡 [추가]
                'text': f"방이 생성되었습니다 (ID: {room_id}). 참가자를 기다립니다.",
                'timestamp': datetime.now().isoformat()
            }
        ],
        "phase": 0, # '1차 진술'
        "turn": "user", # 1차 진술은 항상 'user' (참가자) 부터 시작
        "discussion_turns": 0, # 1차, 2차 구분용
        "ai_answers": [], # AI 답변 임시 저장소
        "votes": {},
        "phases_config": PHASES,
        "available_names": available_names # 💡 [추가] 남은 닉네임 풀 저장
    }
    join_room(room_id)
    emit_room_state(room_id)

@socketio.on('join_room')
def join_room_event(data):
    room_id = data.get('roomId')
    user_id = data.get('userId')

    if room_id not in rooms:
        emit('error', {'message': '존재하지 않는 방입니다.'})
        return

    room = rooms[room_id]
    if room['user_id'] is not None:
        emit('error', {'message': '방이 꽉 찼습니다.'})
        return
        
    # 💡 [수정] 참가자 닉네임 할당
    if not room.get('available_names') or len(room['available_names']) == 0: # 혹시 모를 오류 방지
        room['available_names'] = ANIMAL_NAMES[:]
        
    user_name = random.choice(room['available_names'])
    room['available_names'].remove(user_name) # 중복 제거

    room['user_id'] = user_id
    room['user_sid'] = request.sid
    room['user_name'] = user_name # 💡 [추가] 참가자 닉네임 저장
    
    join_room(room_id)
    
    room['messages'].append({
        'id': f"msg_system_1",
        'sender': 'system', 
        'sender_name': '시스템', # 💡 [추가]
        'text': f"'{user_name}' 참가자(시민)가 입장했습니다. 게임을 시작합니다.",
        'timestamp': datetime.now().isoformat()
    })
    room['messages'].append({
        'id': f"msg_system_2",
        'sender': 'system', 
        'sender_name': '시스템', # 💡 [추가]
        'text': f"--- {PHASES[room['phase']]}이 시작되었습니다. ---",
        'timestamp': datetime.now().isoformat()
    })
    
    emit_room_state(room_id)

@socketio.on('leave_room')
def handle_leave_room(data, is_disconnect=False):
    room_id = data.get('roomId')
    user_id = data.get('userId')
    
    if room_id not in rooms:
        return
        
    room = rooms[room_id]
    
    # 방 자체를 삭제 (운영자가 나갈 경우)
    if user_id == room['operator_id']:
        room['messages'].append({
            'id': f"msg_system_exit_op",
            'sender': 'system', 
            'sender_name': '시스템', # 💡 [추가]
            'text': f"운영자('{room.get('operator_name')}')가 방을 나갔습니다. 게임이 종료됩니다.",
            'timestamp': datetime.now().isoformat()
        })
        emit_room_state(room_id)
        # 룸 삭제
        if room_id in rooms:
            del rooms[room_id]
            
    # 참가자만 내보내기
    elif user_id == room['user_id']:
        user_name = room.get('user_name', '참가자')
        # 💡 [수정] 닉네임 반환 로직
        if room.get('available_names') is not None and user_name in ANIMAL_NAMES:
             room['available_names'].append(user_name) # 닉네임 반환

        room['user_id'] = None
        room['user_sid'] = None
        room['user_name'] = None
        
        room['messages'].append({
            'id': f"msg_system_exit_user",
            'sender': 'system', 
            'sender_name': '시스템', # 💡 [추가]
            'text': f"참가자('{user_name}')가 방을 나갔습니다.",
            'timestamp': datetime.now().isoformat()
        })
        if not is_disconnect:
            leave_room(room_id)
        emit_room_state(room_id)


@socketio.on('send_message')
def send_message(data):
    room_id = data.get('roomId')
    user_id = data.get('userId')
    text = data.get('text')

    if room_id not in rooms:
        return
        
    room = rooms[room_id]
    
    sender_type = 'unknown'
    sender_name = 'Unknown' # 💡 [추가]
    
    if user_id == room['operator_id']:
        sender_type = 'operator'
        sender_name = room.get('operator_name', '운영자') # 💡 [추가]
    elif user_id == room['user_id']:
        sender_type = 'user'
        sender_name = room.get('user_name', '참가자') # 💡 [추가]

    new_message = {
        'id': f"msg_{datetime.now().isoformat()}_{random.randint(1000, 9999)}",
        'sender': user_id,
        'sender_type': sender_type,
        'sender_name': sender_name, # 💡 [추가]
        'text': text,
        'timestamp': datetime.now().isoformat()
    }
    
    phase_name = PHASES[room['phase']]

    # --- '진술' 및 '토론' 페이즈 공통 로직 ---
    current_turn = room.get('turn')

    if current_turn == 'user' and user_id == room['user_id']:
        # 1. 유저(시민) 메시지 추가
        room['messages'].append(new_message)
        # 2. 턴을 운영자(라이어)에게 넘김
        room['turn'] = 'operator'
        # 3. AI 답변 생성 (백그라운드)
        socketio.start_background_task(async_generate_ai_answers, room_id, phase_name)
        # 4. 상태 전파 (유저 메시지 보임, 턴이 운영자에게 넘어감)
        emit_room_state(room_id) 

    elif current_turn == 'operator' and user_id == room['operator_id']:
        # 1. 운영자(라이어) 메시지를 '진술' 객체로 만듦
        operator_statement = {
            'sender': room['operator_id'], 
            'sender_type': 'operator', 
            'sender_name': room.get('operator_name', '운영자'), # 💡 [수정]
            'text': text 
        }

        # 2. AI 답변이 준비되었는지 확인
        if 'ai_answers' not in room or not room['ai_answers']:
            print(f"Warning: Operator sent message but AI answers are not ready in room {room_id}.")
            room['messages'].append(new_message) # 💡 [수정] new_message(sender_name 포함) 사용
            emit_room_state(room_id)
            return

        # 3. 운영자 진술(dict) + AI 진술(dict list)
        all_statements = [operator_statement] + room['ai_answers']
        random.shuffle(all_statements)

        # 4. 섞인 진술들을 완전한 메시지 객체로 변환
        shuffled_messages = []
        for stmt in all_statements:
            shuffled_messages.append({
                'id': f"msg_{datetime.now().isoformat()}_{random.randint(1000, 9999)}",
                'sender': stmt['sender'],
                'sender_type': stmt['sender_type'],
                'sender_name': stmt.get('sender_name', 'AI'), # 💡 [수정]
                'text': stmt['text'],
                'timestamp': datetime.now().isoformat()
            })
        
        # 5. 섞인 메시지들을 DB에 추가
        room['messages'].extend(shuffled_messages)
        room['ai_answers'] = [] # 임시 답변 초기화
        
        # 6. 페이즈 진행
        room['phase'] += 1
        
        if room['phase'] < len(PHASES):
            next_phase_name = PHASES[room['phase']]
            room['messages'].append({
                'id': f"msg_system_phase_{room['phase']}",
                'sender': 'system', 
                'sender_name': '시스템', # 💡 [추가]
                'text': f"--- {next_phase_name}이 시작되었습니다. ---",
                'timestamp': datetime.now().isoformat()
            })
            
            # 다음 페이즈에 따라 턴 설정
            if '진술' in next_phase_name or '토론' in next_phase_name:
                room['turn'] = 'user' # '진술'/'토론'은 다시 유저부터
            else:
                room['turn'] = 'voting' # '투표' 턴
        
        else:
            # TODO: 모든 페이즈 종료 -> 투표 시작
            room['turn'] = 'voting'
            room['messages'].append({
                'id': f"msg_system_vote",
                'sender': 'system', 
                'sender_name': '시스템', # 💡 [추가]
                'text': f"--- 모든 토론이 종료되었습니다. 투표를 시작합니다. (투표 기능 미구현) ---",
                'timestamp': datetime.now().isoformat()
            })

        # 7. 최종 상태 전파
        emit_room_state(room_id)


# ---------------------
# AI 답변 생성 (백그라운드)
# ---------------------
def async_generate_ai_answers(room_id, phase_name):
    socketio.emit('aiProcessing', {'status': 'start'}, to=room_id)
    
    room = rooms.get(room_id)
    if not room:
        socketio.emit('aiProcessing', {'status': 'end'}, to=room_id)
        return

    # 💡 [오류 수정] try...finally 구문으로 변경
    # AI 응답 생성 중 오류가 발생하더라도, finally에서 'end' 신호를 보내
    # 프론트엔드가 무한 로딩에 빠지는 것을 방지합니다.
    try: 
        try:
            topic = room['topic']
            citizen_word = room['citizen_word']
            chat_history = room['messages']
            
            # 💡 [추가] AI 프롬프트에 '닉네임 대조표' 추가
            nickname_map = {
                room['operator_id']: room.get('operator_name', '운영자'),
                room['user_id']: room.get('user_name', '참가자'),
            }
            for ai in room['ai_players']:
                nickname_map[ai['id']] = ai['name']

            # 💡 [수정] 대화 기록에 닉네임 추가
            recent_chat_history = []
            for msg in chat_history[-20:]: # 20개로 늘림
                sender_name = nickname_map.get(msg.get('sender'), msg.get('sender_name', 'Unknown'))
                recent_chat_history.append({
                    "sender_name": sender_name,
                    "text": msg.get('text')
                })
            recent_chat_history_json = json.dumps(recent_chat_history, ensure_ascii=False)
            
            phase_rules = "" 
            
            if '진술' in phase_name:
                phase_rules = f"""
                (역할: {phase_name})
                게임 주제: {topic}
                당신이 받은 단어: {citizen_word}
                최근 대화 내용(이전 진술과 중복을 피하기 위해 참고하세요):
                {recent_chat_history_json}

                당신은 라이어 게임의 참가자이며, **제시어({citizen_word})를 알고 있는 일반 시민 역할**입니다.
                당신의 목표는 라이어가 아님을 증명하고, 라이어를 찾아내는 것입니다.
                
                💡 핵심 규칙:
                1. **제시어 직접 언급 금지:** "{citizen_word}" 단어를 절대 말하지 마세요.
                2. **모호성 유지 (가장 중요):** 라이어가 유추하기 어렵도록, **"이것은... 입니다"** 같은 직접적인 정의 대신, **"...을(를) 떠올리게 하네요"** 또는 **"...와(과) 관련이 있죠"** 처럼 매우 간접적이고 모호한 방식으로 힌트를 주세요.
                3. **중복 금지:** 다른 참가자(대화 내용 참고)가 이미 말한 힌트나, 1차 진술 때 자신이 했던 말과 겹치는 힌트는 절대 말하지 마세요.
                4. **창의성:** 다른 AI들도 동시에 답변을 생성중입니다. 가장 뻔한 힌트(예: 사과 -> '빨갛다', '과일이다')는 반드시 피하고, 창의적인 힌트를 1개만 말하세요.
                5. **답변 형식:** 이모티콘 없이, 당신의 성격에 맞는 1개의 문장으로 답변을 생성하세요.
                """
            
            elif '토론' in phase_name:
                phase_rules = f"""
                (역할: {phase_name})
                게임 주제: {topic}
                당신이 받은 단어: {citizen_word}
                
                💡 참가자 명단 (ID와 닉네임):
                {json.dumps(nickname_map, ensure_ascii=False)}

                💡 최근 대화 내용:
                {recent_chat_history_json}
                
                당신은 제시어를 아는 '시민'입니다. 이 단계의 목표는 라이어를 찾는 것입니다.
                대화 내용을 보고, 참가자 명단에서 **닉네임**을 사용해 가장 의심스러운 사람 1명을 지목하거나 이유를 말하세요.

                💡 핵심 규칙:
                1. **'토론'의 목적:** 제시어({citizen_word})를 설명하지 마세요.
                2. **닉네임 사용:** ID(ai_1, user_id 등)가 아닌, **반드시 참가자 명단의 '닉네임'을 사용**하여 의심하세요.
                3. **제시어 언급 금지:** "{citizen_word}" 단어를 절대 말하지 마세요.
                4. **답변 형식:** 이모티콘 없이, 당신의 성격에 맞는 1개의 문장으로 답변을 생성하세요.
                
                (예시: "{nickname_map.get(room['operator_id'], '운영자')} 님의 아까 발언이 좀 애매했던 것 같아요.")
                (예시: "{nickname_map.get(room['user_id'], '참가자')} 님이 제시어랑 좀 거리가 먼 이야기를 하신 것 같습니다.")
                """
            
            ai_players = room['ai_players']
            
            # 💡 [수정] generate_answer가 ai_player 객체를 받도록 수정
            def generate_answer(client, ai_player, full_prompt):
                ai_id = ai_player['id']
                ai_name = ai_player['name'] # 💡 [추가]
                try:
                    response = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": full_prompt}],
                        max_tokens=100
                    )
                    response_text = response.choices[0].message.content.strip()
                    return {
                        'sender': ai_id,
                        'sender_type': 'ai',
                        'sender_name': ai_name, # 💡 [수정]
                        'text': response_text
                    }
                except Exception as e:
                    print(f"Error for AI {ai_id}: {e}")
                    return {
                        'sender': ai_id,
                        'sender_type': 'ai',
                        'sender_name': ai_name, # 💡 [수정]
                        'text': f"(AI {ai_name} 답변 생성 오류)" # 💡 [수정]
                    }

            # 4개의 AI 클라이언트로 동시에 답변 생성 요청
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = []
                for i in range(len(ai_players)):
                    ai_player = ai_players[i]
                    personality = ai_player['personality']
                    
                    full_prompt = f"""
                    당신은 라이어 게임에 참가한 AI 참가자입니다.
                    당신의 이름: {ai_player['name']}
                    당신의 성격: {personality}
                    
                    당신의 성격에 맞게 답변을 조절하세요. (예: 소심하면 '...같아요', 직설적이면 '확실합니다.')
                    
                    ---
                    
                    {phase_rules}
                    """
                    
                    futures.append(
                        # 💡 [수정] ai_player 객체 전체 전달
                        executor.submit(generate_answer, clients[i], ai_player, full_prompt)
                    )
                
                results = [future.result() for future in concurrent.futures.as_completed(futures)]
            
            room['ai_answers'] = results

        except Exception as e:
            print(f"Error during AI processing: {e}")
            room['messages'].append({
                'id': f"msg_system_ai_error",
                'sender': 'system', 
                'sender_name': '시스템', # 💡 [추가]
                'text': f"AI 응답 생성 중 오류가 발생했습니다: {e}",
                'timestamp': datetime.now().isoformat()
            })
            emit_room_state(room_id) # 오류 상태 전파
        
    finally:
        # 💡 [오류 수정]
        # AI 응답이 성공하든, 위에서 'except'로 잡히든,
        # 'finally'는 항상 실행되어 프론트엔드의 로딩 상태를 'end'로 변경합니다.
        socketio.emit('aiProcessing', {'status': 'end'}, to=room_id)


# ---------------------
# Flask 서버 실행
# ---------------------
if __name__ == "__main__":
    print("Starting Flask-SocketIO server with eventlet...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, use_reloader=False)

