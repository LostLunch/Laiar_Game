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
socketio = SocketIO(app, cors_allowed_origins="*")

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

# ---------------------
# 도우미 함수
# ---------------------
def generate_room_id(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def get_game_words():
    topic = random.choice(list(categories.keys()))
    words = random.sample(categories[topic], 2)
    return topic, words[0], words[1] # 주제, 라이어 단어, 시민 단어

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
    
    ai_players = []
    # 💡 [추가] AI 성격 정의
    personalities = [
        "말이 많고 사교적이며, 다른 사람의 말에 리액션을 잘 해주는 성격",
        "매우 논리적이고 분석적이며, 발언의 모순점을 지적하는 성격",
        "소심하고 겁이 많으며, 확신 없이 조심스럽게 말하는 성격",
        "공격적이고 직설적이며, 강하게 의심을 표출하는 성격"
    ]

    for i in range(4):
        ai_players.append({
            "id": f"ai_{i+1}",
            "name": f"AI 참가자 {i+1}",
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
        "user_id": None, # 참가자 (아직 없음)
        "user_sid": None,
        "ai_players": ai_players, # 💡 [수정] 성격이 포함된 AI 정보
        "messages": [
            {
                'id': f"msg_system_0",
                'sender': 'system', 
                'text': f"방이 생성되었습니다 (ID: {room_id}). 참가자를 기다립니다.",
                'timestamp': datetime.now().isoformat()
            }
        ],
        "phase": 0, # '1차 진술'
        "turn": "user", # 1차 진술은 항상 'user' (참가자) 부터 시작
        "discussion_turns": 0, # 1차, 2차 구분용
        "ai_answers": [], # AI 답변 임시 저장소
        "votes": {},
        "phases_config": PHASES
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

    room['user_id'] = user_id
    room['user_sid'] = request.sid
    join_room(room_id)
    
    room['messages'].append({
        'id': f"msg_system_1",
        'sender': 'system', 
        'text': f"참가자(시민)가 입장했습니다. 게임을 시작합니다.",
        'timestamp': datetime.now().isoformat()
    })
    room['messages'].append({
        'id': f"msg_system_2",
        'sender': 'system', 
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
            'text': f"운영자(라이어)가 방을 나갔습니다. 게임이 종료됩니다.",
            'timestamp': datetime.now().isoformat()
        })
        emit_room_state(room_id)
        # 룸 삭제
        if room_id in rooms:
            del rooms[room_id]
            
    # 참가자만 내보내기
    elif user_id == room['user_id']:
        room['user_id'] = None
        room['user_sid'] = None
        room['messages'].append({
            'id': f"msg_system_exit_user",
            'sender': 'system', 
            'text': f"참가자(시민)가 방을 나갔습니다.",
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
    if user_id == room['operator_id']:
        sender_type = 'operator'
    elif user_id == room['user_id']:
        sender_type = 'user'

    new_message = {
        'id': f"msg_{datetime.now().isoformat()}_{random.randint(1000, 9999)}",
        'sender': user_id,
        'sender_type': sender_type,
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
        # 1. 운영자(라이어) 메시지를 '진술' 객체로 만듦 (DB엔 아직 추가X)
        operator_statement = {
            'sender': room['operator_id'], 
            'sender_type': 'operator', 
            'text': text 
        }

        # 2. AI 답변이 준비되었는지 확인
        if 'ai_answers' not in room or not room['ai_answers']:
            print(f"Warning: Operator sent message but AI answers are not ready in room {room_id}.")
            room['messages'].append(new_message)
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

    try:
        topic = room['topic']
        citizen_word = room['citizen_word']
        
        # 💡 [수정] 5개가 아닌 최근 20개의 대화 기록을 전달하여 중복을 최대한 방지
        chat_history = room['messages']
        recent_chat_history_json = json.dumps(chat_history[-20:], ensure_ascii=False)
        
        phase_rules = "" 
        
        if '진술' in phase_name:
            # 💡 [수정] 모호성 강화를 위해 6번 규칙(답변 형식) 수정
            phase_rules = f"""
            (역할: {phase_name})
            게임 주제: {topic}
            당신이 받은 단어: {citizen_word}

            현재까지의 대화 내용 (이전 발언과 중복을 피하기 위해 참고하세요):
            {recent_chat_history_json}

            당신은 라이어 게임의 참가자이며, **제시어({citizen_word})를 알고 있는 일반 시민 역할**입니다.
            당신의 목표는 라이어가 아님을 증명하고, 라이어를 찾아내는 것입니다. 지금은 '{phase_name}' 단계입니다.

            💡 반드시 지켜야 할 핵심 규칙:
            1. **제시어 직접 언급 금지:** 어떤 경우에도 "{citizen_word}"라는 단어를 직접 말하지 마세요.
            2. **정답 확인 금지:** "정답이다", "맞다", "틀리다" 등 확정적인 발언은 절대 하지 마세요.
            3. **💡 중요: 중복 절대 금지 (최우선 규칙):**
               - **(이전 발언):** 위 '현재까지의 대화 내용'에 있는 힌트와 중복되는 내용은 절대 말하지 마세요.
               - **(동시 발언):** 당신 외 3명의 AI도 지금 동시에 힌트를 생성합니다. 가장 뻔하고 직접적인 힌트(예: {citizen_word}가 과일이면 '빨갛다', '달다')는 다른 AI가 말할 확률이 높으니 **반드시 피하세요.**
               - **(창의성):** 라이어가 바로 알기 어렵지만, 시민은 알 수 있는 **창의적이고 독특한 힌트**를 1개만 말하세요.
            4. **힌트 방식 (참고):**
               - 제시어와 **발음이 겹치거나 비슷한 단어** (예: '사과' -> '사과하세요')
               - **의미적으로 은근히 연관된 비유나 말장난** (예: '사과' -> '뉴턴이 맞은 것')
            5. **⚠️ 2차 진술 규칙:** 만약 지금이 '2차 진술'이라면, '1차 진술' 때 본인이나 타인이 했던 말과 **완전히 다른** 힌트를 말해야 합니다.
            
            6. **⚠️ 모호성 유지 및 표현 방식 (매우 중요):**
               - 답변을 **매우 모호하게** 표현해야 합니다. 라이어가 정답을 유추하기 어렵게 만드세요.
               - "**이것은... 입니다.**" 같은 **직접적인 정의 형식은 절대 사용하지 마세요.**
               - 대신, **"...을 떠올리게 하네요.", "...와 관련이 있죠.", "...할 때 쓰기도 해요."** 와 같이 간접적이고 애매한 표현을 사용하세요.
               - 답변은 반드시 1개의 문장으로 간결하게 끝나야 합니다.

            7. 이모티콘은 사용하지 마세요.
            """
        
        elif '토론' in phase_name:
            # 💡 [수정] '토론' 프롬프트에 JSON 읽는 법 명시
            phase_rules = f"""
            (역할: {phase_name})
            게임 주제: {topic}
            당신이 받은 단어: {citizen_word}
            현재까지의 대화 내용 (참고용):
            {recent_chat_history_json}
            
            당신은 제시어를 아는 '시민'입니다.
            지금은 '{phase_name}' 단계입니다. 이 단계의 목표는 라이어를 찾는 것입니다.

            **대화 기록(JSON) 읽는 법:**
            - `sender_type: 'operator'`: 라이어 역할을 하는 **'운영자'**입니다.
            - `sender_type: 'user'`: 당신과 같은 시민인 **'참가자'**입니다.
            - `sender_type: 'ai'`: 당신의 동료 AI (ai_1, ai_2, ...)입니다.

            💡 반드시 지켜야 할 핵심 규칙:
            1. **'토론'의 목적:** '진술'과 다릅니다. 제시어({citizen_word})에 대해 **설명하지 마세요.**
            2. **의심 발언:** 위 '대화 내용'을 **반드시** 읽고, `sender_type`이 'operator'인 **'운영자'**, 'user'인 **'참가자'**, 또는 다른 'AI'의 발언 중 가장 의심스러운 사람 1명을 지목하거나, 왜 의심스러운지 이유를 말하세요.
            3. **제시어 언급 절대 금지:** 어떤 경우에도 "{citizen_word}"라는 단어를 직접 말하지 마세요.
            4. **이모티콘 금지:** 이모티콘을 사용하지 마세요.
            5. **⚠️ 답변 형식 강제:** 당신의 답변은 **반드시 1개의 문장**으로, 다른 사람을 의심하는 내용이어야 합니다.
            
            (예시: "운영자님의 아까 발언이 좀 애매했던 것 같아요.")
            (예시: "AI 2번 님이 제시어랑 좀 거리가 먼 이야기를 하신 것 같습니다.")
            (예시: "저는 참가자(시민) 님이 가장 의심스럽습니다.")
            (예시: "다들 잘 설명하셔서 아직 잘 모르겠습니다.")

            이제, 당신의 토론 발언을 1개의 문장으로 생성하세요:
            """
        
        ai_players = room['ai_players']
        
        def generate_answer(client, ai_id, full_prompt):
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
                    'text': response_text
                }
            except Exception as e:
                print(f"Error for AI {ai_id}: {e}")
                return {
                    'sender': ai_id,
                    'sender_type': 'ai',
                    'text': f"(AI {ai_id} 답변 생성 오류)"
                }

        # 4개의 AI 클라이언트로 동시에 답변 생성 요청
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            for i in range(len(ai_players)):
                ai_player = ai_players[i]
                personality = ai_player['personality']
                
                # 💡 [추가] 성격을 포함한 최종 프롬프트 구성
                full_prompt = f"""
                당신은 라이어 게임에 참가한 AI 참가자입니다.
                당신의 이름: {ai_player['name']}
                당신의 성격: {personality}
                
                당신의 성격에 맞게 답변을 조절하세요. (예: 소심하면 '...같아요', 직설적이면 '확실합니다.')
                
                ---
                
                {phase_rules}
                """
                
                futures.append(
                    executor.submit(generate_answer, clients[i], ai_player['id'], full_prompt)
                )
            
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        # AI 답변(dict 리스트)을 룸에 저장
        room['ai_answers'] = results

    except Exception as e:
        print(f"Error during AI processing: {e}")
        room['messages'].append({
            'id': f"msg_system_ai_error",
            'sender': 'system', 
            'text': f"AI 응답 생성 중 오류가 발생했습니다: {e}",
            'timestamp': datetime.now().isoformat()
        })
        emit_room_state(room_id) # 오류 상태 전파
    
    # 7. AI 응답 생성이 완료되었음을 알림
    socketio.emit('aiProcessing', {'status': 'end'}, to=room_id)


# ---------------------
# Flask 서버 실행
# ---------------------
if __name__ == "__main__":
    print("Starting Flask-SocketIO server...")
    # 💡 [설정] 부스에서 사용할 것이므로 0.0.0.0으로 열어서
    # 동일 네트워크의 다른 기기(플레이어 폰 등)가 접속할 수 있게 함
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)

