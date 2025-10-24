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
    for i in range(4):
        ai_players.append({
            "id": f"ai_{i+1}",
            "name": f"AI 참가자 {i+1}",
            "isLiar": False # AI는 라이어가 아님
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
        "ai_players": ai_players,
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

    # 💡 [수정] '토론' 페이즈의 자유 채팅 로직 삭제
    # '토론'도 '진술'과 동일한 턴제 로직을 따르도록 이 블록을 제거합니다.
    # if '토론' in phase_name:
    #     room['messages'].append(new_message)
    #     emit_room_state(room_id)
    #     return 

    # --- '진술' 및 '토론' 공통 턴제 로직 ---
    current_turn = room.get('turn')

    if current_turn == 'user' and user_id == room['user_id']:
        # 1. 유저(시민) 메시지 추가
        room['messages'].append(new_message)
        # 2. 턴을 운영자(라이어)에게 넘김
        room['turn'] = 'operator'
        # 3. AI 답변 생성 (백그라운드)
        # 💡 [수정] AI가 프롬프트를 구분할 수 있도록 phase_name 전달
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
            # AI 답변이 없으면, 운영자 메시지만이라도 추가하고 턴을 넘기지 않음.
            # (AI가 응답할 때까지 운영자 턴 유지)
            room['messages'].append(new_message)
            emit_room_state(room_id)
            return

        # 3. [버그 수정] 운영자 진술(dict) + AI 진술(dict list)
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
            
            # 💡 [수정] 다음 페이즈에 따라 턴 설정 ('토론'도 'user' 턴부터 시작)
            if '진술' in next_phase_name or '토론' in next_phase_name:
                room['turn'] = 'user' # 다음 '진술' 또는 '토론'은 다시 유저부터
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
# 💡 [수정] phase_name 인자 추가
def async_generate_ai_answers(room_id, phase_name):
    socketio.emit('aiProcessing', {'status': 'start'}, to=room_id)
    
    room = rooms.get(room_id)
    if not room:
        socketio.emit('aiProcessing', {'status': 'end'}, to=room_id)
        return

    try:
        topic = room['topic']
        citizen_word = room['citizen_word']
        chat_history = room['messages']
        
        # 💡 [수정] 페이즈에 따라 AI 프롬프트를 다르게 설정
        base_prompt = ""
        if '진술' in phase_name:
            base_prompt = f"""
            당신은 라이어 게임에 참가한 AI 참가자입니다. (역할: {phase_name})
            게임 주제: {topic}
            당신이 받은 단어: {citizen_word}
            현재까지의 대화 내용:
            {json.dumps(chat_history[-5:], ensure_ascii=False)}

            당신은 라이어 게임의 참가자이며, **제시어({citizen_word})를 알고 있는 일반 시민 역할**입니다.
        당신의 목표는 라이어가 아님을 증명하고, 라이어를 찾아내는 것입니다. 지금은 '{phase_name}' 단계입니다.

        💡 반드시 지켜야 할 핵심 규칙:
        1. **제시어 직접 언급 금지:** 어떤 경우에도 "{citizen_word}"라는 단어를 직접 말하지 마세요.
        → 위반 시, 당신은 즉시 라이어로 의심받으며 이후 발언은 단 하나의 특징만 말할 수 있습니다.

        2. **정답 확인 금지:** "정답이다", "맞다", "틀리다" 등 제시어가 무엇인지 확정하는 발언은 절대 하지 마세요.
        → 누군가 정답을 외치면, 애매하게만 반응하세요.
        - 예시(시민): "그런 생각도 가능하네요.", "저는 조금 다르게 생각했어요."

        3. **힌트 방식 및 다양성 (강화):** 제시어를 아는 사람만 이해할 수 있도록, **다음의 방식 중 서로 다른 두 가지를 선택하여** 활용하고, **가장 뻔하거나 직접적인 단어는 피하십시오. 이미 다른 사람이 흔하게 연상할 수 있는 힌트는 사용되었다고 가정하고 최대한 고유한 힌트를 만드십시오.**
        - 제시어와 **발음이 겹치거나 비슷한 단어**
        - **형태소가 겹치는 단어**
        - **의미적으로 은근히 연관된 비유나 말장난**
        - **동음이의어 및 상황적 연관성**
        등을 활용해 간접적인 힌트를 주십시오.

            4. **특징 개수 및 중복 절대 금지 (최우선 규칙):** 설명할 때는 이런 식의 힌트를 **최대 1개까지만** 말하세요.
           **⚠️ 당신은 당신이 이전에 했던 발언(1차 진술)을 반드시 기억해야 합니다. 2차 진술 내용은 1차 진술 내용과 의미적, 형태적으로 완전히 달라야 하며, 다른 참가자가 사용했던 힌트와도 절대 중복되어서는 안 됩니다. (창의적이고 새로운 힌트 2개만 제시하세요.)**

            5. **설명 시 표현 방식:** "{citizen_word}"라는 단어 자체를 쓰지 말고, 대신 "이것" 또는 "제시어"라고 표현하세요.

            6. **모호성 유지:** 라이어가 바로 정답을 떠올리지 못하도록 **직접적이지 않고 살짝 빗대는 말**로 설명하세요. 직접적인 관련이 있는 단어는 사용하지 마세요.

            7. **⚠️ 답변 형식 강제:** 당신의 답변은 반드시 "**이것은... 입니다.**" 형식으로 **완벽하게 끝나야 합니다.** (다른 문장 형식, 혹은 중간에 끊기는 문장은 허용하지 않습니다.)

            8. 이모티콘 또한 사용하지 마세요.
            """

        elif '토론' in phase_name:
            # 💡 [추가] 토론 페이즈 프롬프트
            base_prompt = f"""
            당신은 라이어 게임에 참가한 AI 참가자입니다. (역할: {phase_name})
            게임 주제: {topic}
            당신이 받은 단어: {citizen_word}
            현재까지의 대화 내용:
            {json.dumps(chat_history[-5:], ensure_ascii=False)}

            당신은 라이어 게임의 참가자이며, **제시어({citizen_word})를 알고 있는 일반 시민 역할**입니다.
        당신의 목표는 라이어가 아님을 증명하고, 라이어를 찾아내는 것입니다. 지금은 '{phase_name}' 단계입니다.

        💡 반드시 지켜야 할 핵심 규칙:
        1. **제시어 직접 언급 금지:** 어떤 경우에도 "{citizen_word}"라는 단어를 직접 말하지 마세요.
        → 위반 시, 당신은 즉시 라이어로 의심받으며 이후 발언은 단 하나의 특징만 말할 수 있습니다.

        2. **정답 확인 금지:** "정답이다", "맞다", "틀리다" 등 제시어가 무엇인지 확정하는 발언은 절대 하지 마세요.
        → 누군가 정답을 외치면, 애매하게만 반응하세요.
        - 예시(시민): "그런 생각도 가능하네요.", "저는 조금 다르게 생각했어요."

        3. **토론 시 주의해야 할 점 : ** 토론은 진술 단계처럼 제시어에 대한 정보 제공이 아닌 서로에 대한 의심을 말하는 시간입니다. 발언에서는 누군가의 의심스러운 점을 하나만 말하세요.

            4. **설명 시 표현 방식:** "{citizen_word}"라는 단어 자체를 쓰지 말고, 대신 "이것" 또는 "제시어"라고 표현하세요.

            5. **모호성 유지:** 라이어가 바로 정답을 떠올리지 못하도록 **직접적이지 않고 살짝 빗대는 말**로 설명하세요. 직접적인 관련이 있는 단어는 사용하지 마세요.

            6. **⚠️ 답변 형식 강제:** 당신의 답변은 반드시 "**이것은... 입니다.**" 형식으로 **완벽하게 끝나야 합니다.** (다른 문장 형식, 혹은 중간에 끊기는 문장은 허용하지 않습니다.)

            7. 이모티콘 또한 사용하지 마세요.
            """

        
        ai_players = room['ai_players']
        
        def generate_answer(client, ai_id, prompt):
            try:
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=100
                )
                response_text = response.choices[0].message.content.strip()
                # 💡 [버그 수정] AI 답변을 단순 문자열이 아닌 '진술 객체(dict)'로 반환
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
            # 💡 [수정] AI ID와 클라이언트를 매핑하여 전달 (이제 base_prompt를 사용)
            futures = [
                executor.submit(generate_answer, clients[i], ai_players[i]['id'], base_prompt) 
                for i in range(len(ai_players))
            ]
            
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        # 💡 [버그 수정] AI 답변(dict 리스트)을 룸에 저장
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

