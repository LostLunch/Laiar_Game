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
CORS(app) # CORS는 Socket.IO에서도 필요합니다.
# ⚠️ Socket.IO 설정: 모든 Origin에서의 연결을 허용합니다.
socketio = SocketIO(app, cors_allowed_origins="*")

# ---------------------
# OpenAI 클라이언트 (기존과 동일)
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
            def create(self): return {'choices': [{'message': {'content': '더미 응답: API 키 오류'}}]}
        clients.append(DummyClient())

# ---------------------
# 게임 데이터 (기존과 동일)
# ---------------------
categories = {
    "동물": ['사자', '호랑이', '코끼리', '치타', '독수리'],
    "음식": ['김치', '비빔밥', '떡볶이', '김밥', '사과'],
    "교통수단": ['버스', '택시', '기차', '배', '비행기'],
    "직업": ['경찰', '소방관', '판사', '선생님', '의사'],
    "날씨": ['눈', '비', '바람', '안개', '맑음']
}
ai_names = ["AI-Alpha", "AI-Beta", "AI-Gamma", "AI-Delta"]
personalities = [
    "당신은 제시어를 알고 있으며, 거칠고 끈질기게 라이어를 추궁합니다.",
    "당신은 제시어를 알고 있으며, 예리하고 논리적으로 추론합니다.",
    "당신은 제시어를 알고 있으며, 교활하고 애매모호한 발언을 하여 라이어를 혼란시킵니다.",
    "당신은 제시어를 알고 있으며, 재미있고 엉뚱한 비유를 사용하여 라이어를 방심하게 합니다."
]
# 프론트엔드와 페이즈(단계) 이름을 동기화합니다.
PHASES = ['1차 진술', '1차 토론', '2차 진술', '2차 토론', '투표']

# ---------------------
# 💡 핵심: 상태 관리
# ---------------------
# 모든 방의 상태를 이 딕셔너리에서 관리합니다.
rooms = {}

def generate_room_code(length=6):
    """6자리 영문 대문자, 숫자로 구성된 방 코드 생성"""
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for i in range(length))

def setting():
    """제시어 랜덤 선택 (기존과 동일)"""
    category = random.choice(list(categories.keys()))
    word = random.choice(categories[category])
    return category, word

def init_room_state():
    """
    💡 [수정] 방 상태 초기화 함수
    프론트엔드가 필요로 하는 모든 정보를 포함하도록 수정합니다.
    """
    return {
        "players": [],      # 참가자 목록 (AI 포함)
        "messages": [],     # 전체 채팅 기록
        "ai_messages": [ [] for _ in range(4) ], # AI별 대화 기록 (GPT 컨텍스트용)
        "current_word": None,
        "current_category": None,
        "phase": 0,         # 페이즈 인덱스 (0: 1차 진술, 1: 1차 토론...)
        "liar_id": None,
        "game_started": False,
        "discussion_turns": 0 # 토론 턴 카운트용
    }

# ---------------------
# 💡 핵심: AI 응답 생성 (run_phase 수정)
# ---------------------
def run_phase(room_code, word, phase_str, context_text=None):
    """
    [수정] run_phase 함수:
    전역 변수 대신 rooms[room_code]에서 상태를 읽고 쓰도록 수정
    """
    if room_code not in rooms:
        raise ValueError(f"Room code {room_code} not found.")

    room = rooms[room_code]
    
    system_base = f"당신은 라이어 게임 참가자입니다. 제시어는 '{word}'입니다. "
    
    # 1. 이전 대화 기록 추가 (phase=진술인 경우 초기화)
    if phase_str == "진술":
        system_phase = f"지금은 1차 진술 단계이며, 다른 참가자의 진술({context_text})을 들었습니다. 당신의 제시어('{word}')와 관련하여 추상적이거나 모호하게 발언하세요. 제시어를 직접 언급하지 마세요. 30자 내외로 짧게 답변하세요."
        # AI의 이전 대화 기록 초기화
        for i in range(4):
            room["ai_messages"][i] = []
            
    else: # phase_str == "토론"
        system_phase = f"지금은 {phase_str} 단계입니다. 다른 참가자들(AI, 라이어, 사용자)과의 자유 토론입니다. 가장 최근 발언({context_text})에 대해 반박, 동의, 또는 질문을 하세요. 30자 내외로 짧게 답변하세요."
        # 모든 AI의 대화 기록에 사용자 메시지 추가
        for i in range(4):
            room["ai_messages"][i].append({"role": "user", "content": context_text})


    def get_ai_response(client_index):
        client = clients[client_index]
        personality = personalities[client_index]
        # 💡 [수정] 전역 변수 대신 room 상태에서 AI 기록을 가져옴
        history = room["ai_messages"][client_index]
        
        system_prompt = system_base + personality + system_phase
        
        try:
            messages = [{"role": "system", "content": system_prompt}] + history
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=100
            )
            ai_response = response.choices[0].message.content
            # 💡 [수정] 전역 변수 대신 room 상태에 AI 응답을 기록
            room["ai_messages"][client_index].append({"role": "assistant", "content": ai_response})
            return ai_response
            
        except Exception as e:
            print(f"GPT Client {client_index+1} Error: {e}")
            return f"오류: {client_index+1}번 AI 응답 실패"

    # 4명의 AI 응답을 병렬 처리 (기존과 동일)
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(get_ai_response, i) for i in range(4)]
        ai_responses = [f.result() for f in futures]
    
    return ai_responses

# ---------------------
# 💡 핵심: Socket.IO 이벤트 핸들러
# ---------------------

def emit_room_state(room_id):
    """[신규] 특정 방의 현재 상태를 모든 클라이언트에게 전송하는 헬퍼 함수"""
    if room_id in rooms:
        # 프론트엔드가 정의한 'roomStateUpdate' 이벤트로 현재 방 상태(rooms[room_id])를 보냅니다.
        socketio.emit('roomStateUpdate', rooms[room_id], to=room_id)
    else:
        print(f"Attempted to emit state for non-existent room: {room_id}")

@socketio.on('connect')
def handle_connect():
    """클라이언트 연결 시 로그"""
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    """클라이언트 연결 해제 시 처리"""
    print(f"Client disconnected: {request.sid}")
    
    # 💡 [신규] 클라이언트가 어떤 방에 있었는지 찾아서 퇴장 처리
    room_to_leave = None
    player_to_remove = None
    for room_id, room_data in rooms.items():
        for player in room_data['players']:
            if player.get('socketId') == request.sid:
                room_to_leave = room_id
                player_to_remove = player
                break
        if room_to_leave:
            break
            
    if room_to_leave and player_to_remove:
        try:
            room = rooms[room_to_leave]
            room['players'].remove(player_to_remove)
            print(f"Player {player_to_remove['name']} removed from room {room_to_leave}")
            
            # 방이 비었으면 방 삭제
            if not any(p['isHuman'] for p in room['players']):
                print(f"Room {room_to_leave} is empty, deleting.")
                del rooms[room_to_leave]
            else:
                # 방이 비지 않았으면, 상태 업데이트 전송
                emit_room_state(room_to_leave)
                
        except Exception as e:
            print(f"Error during disconnect: {e}")


@socketio.on('joinRoom')
def handle_join_room(data):
    """
    [신규] 'joinRoom' 이벤트 핸들러 (기존 /api/set_game_word 대체)
    프론트에서 { roomId, playerName, userId, socketId } 데이터를 받습니다.
    """
    room_id = data.get('roomId')
    player_name = data.get('playerName')
    user_id = data.get('userId')
    socket_id = request.sid # data.get('socketId') 대신 request.sid 사용 (더 신뢰성 높음)

    if not room_id or not player_name or not user_id:
        emit('roomError', {'message': '방 ID, 이름, 유저 ID가 필요합니다.'})
        return

    # 1. 방 생성 또는 찾기
    if room_id not in rooms:
        print(f"Creating new room: {room_id}")
        rooms[room_id] = init_room_state()
        
        # [신규] 방 생성 시만 제시어 설정 (기존 set_game_word 로직)
        category, word = setting()
        rooms[room_id]["current_category"] = category
        rooms[room_id]["current_word"] = word
        
    room = rooms[room_id]

    # 2. 이미 시작된 게임인지 확인
    if room['game_started']:
        emit('roomError', {'message': '이미 시작된 게임입니다.'})
        return
        
    # 3. 이미 참가한 유저인지 확인 (중복 참가 방지)
    if any(p['id'] == user_id for p in room['players']):
        # 이미 있는 유저의 socketId만 업데이트 (재접속 처리)
        for p in room['players']:
            if p['id'] == user_id:
                p['socketId'] = socket_id
                break
    else:
        # 새로운 플레이어 추가
        new_player = {
            "id": user_id,
            "name": player_name,
            "socketId": socket_id,
            "isHuman": True,
            "isLiar": False,
            "role": "미정",
            "keyword": "미정"
        }
        room['players'].append(new_player)
    
    # 4. Socket.IO 방에 참가
    join_room(room_id)
    print(f"Player {player_name} ({socket_id}) joined room {room_id}")
    
    # 5. [중요] 방의 모든 클라이언트에게 최신 상태 전송
    emit_room_state(room_id)


@socketio.on('startDeclaration')
def handle_start_declaration(data):
    """
    [신규] 'startDeclaration' 이벤트 핸들러 (게임 시작 트리거)
    프론트에서 { roomId } 데이터를 받습니다.
    """
    room_id = data.get('roomId')
    if room_id not in rooms:
        emit('roomError', {'message': '존재하지 않는 방입니다.'})
        return

    room = rooms[room_id]
    
    if room['game_started']:
        emit('roomError', {'message': '이미 시작된 게임입니다.'})
        return

    human_players = [p for p in room['players'] if p['isHuman']]
    
    if not human_players:
        emit('roomError', {'message': '게임에 참가한 유저가 없습니다.'})
        return
        
    # 1. 라이어 선정
    liar_player = random.choice(human_players)
    room['liar_id'] = liar_player['id']
    word = room['current_word']
    
    # 2. 플레이어(사람) 역할 및 키워드 할당
    for p in human_players:
        if p['id'] == room['liar_id']:
            p['isLiar'] = True
            p['role'] = "라이어"
            p['keyword'] = "???"
        else:
            p['isLiar'] = False
            p['role'] = "시민"
            p['keyword'] = word
            
    # 3. AI 플레이어 추가
    for i in range(4):
        ai_player = {
            "id": f"ai_{i+1}",
            "name": ai_names[i],
            "isHuman": False,
            "isLiar": False, # AI는 라이어가 될 수 없음
            "role": "시민 (AI)",
            "keyword": word # AI는 항상 제시어를 알고 있음
        }
        room['players'].append(ai_player)
        
    # 4. 게임 상태 변경
    room['game_started'] = True
    room['phase'] = 0 # 0 = 1차 진술
    room['messages'].append({
        'sender': 'system', 
        'text': f"게임이 시작되었습니다! 카테고리는 '{room['current_category']}'입니다. 1차 진술을 시작해주세요.",
        'timestamp': datetime.now().isoformat()
    })
    
    # 5. [중요] 변경된 상태 전파
    emit_room_state(room_id)


@socketio.on('chatMessage')
def handle_chat_message(data):
    """
    [신규] 'chatMessage' 이벤트 핸들러 
    (기존 /api/start_dec_with_input 및 /api/ai_response 통합)
    """
    room_id = data.get('roomId')
    text = data.get('text')
    sender_name = data.get('sender')
    
    if room_id not in rooms:
        emit('roomError', {'message': '존재하지 않는 방입니다.'})
        return
        
    room = rooms[room_id]
    
    # 1. 사용자 메시지를 채팅 기록에 추가
    room['messages'].append({
        'sender': sender_name,
        'text': text,
        'timestamp': datetime.now().isoformat()
    })
    
    # 2. 사용자 메시지를 즉시 클라이언트에 전파 (빠른 응답)
    emit_room_state(room_id)
    
    # 3. AI 처리 중 알림 (프론트 UI 로딩 표시용)
    socketio.emit('aiProcessing', {'status': 'start'}, to=room_id)
    
    try:
        current_phase_index = room['phase']
        phase_name = PHASES[current_phase_index] # '1차 진술', '1차 토론' 등
        word = room['current_word']
        
        # 4. 현재 페이즈에 맞춰 AI 응답 생성
        # (run_phase가 '진술' 또는 '토론' 문자열을 받도록 설계되어 있음)
        phase_type_for_ai = "진술" if "진술" in phase_name else "토론"
        
        ai_responses = run_phase(room_id, word, phase_type_for_ai, context_text=text)
        
        # 5. AI 응답을 채팅 기록에 추가
        ai_players = [p for p in room['players'] if not p['isHuman']]
        for i, resp in enumerate(ai_responses):
            if i < len(ai_players):
                room['messages'].append({
                    'sender': ai_players[i]['name'],
                    'text': resp,
                    'timestamp': datetime.now().isoformat()
                })
        
        # 6. 페이즈(단계) 전환 로직
        if "진술" in phase_name:
            # 진술 단계는 한 턴 후 바로 다음 토론 단계로 넘어감
            room['phase'] += 1
            room['discussion_turns'] = 0 # 토론 턴 카운트 초기화
            room['messages'].append({
                'sender': 'system', 
                'text': f"--- {PHASES[room['phase']]}이 시작되었습니다. ---",
                'timestamp': datetime.now().isoformat()
            })
            
        elif "토론" in phase_name:
            # 토론 단계는 N턴(예: 3턴) 후 다음 진술 단계로 넘어감
            room['discussion_turns'] += 1
            
            # 💡 예시: 1차 토론(인덱스 1)에서 3턴, 2차 토론(인덱스 3)에서 3턴 진행
            turns_limit = 3 
            if room['discussion_turns'] >= turns_limit:
                room['phase'] += 1 # 다음 단계로 (2차 진술 또는 투표)
                room['discussion_turns'] = 0 # 턴 초기화
                
                if room['phase'] < len(PHASES):
                    room['messages'].append({
                        'sender': 'system', 
                        'text': f"--- {PHASES[room['phase']]}이 시작되었습니다. ---",
                        'timestamp': datetime.now().isoformat()
                    })
                else:
                    # TODO: 투표 로직
                    room['messages'].append({
                        'sender': 'system', 
                        'text': f"--- 모든 토론이 종료되었습니다. 투표를 시작합니다. (미구현) ---",
                        'timestamp': datetime.now().isoformat()
                    })

    except Exception as e:
        print(f"Error during AI processing: {e}")
        room['messages'].append({
            'sender': 'system', 
            'text': f"AI 응답 생성 중 오류가 발생했습니다: {e}",
            'timestamp': datetime.now().isoformat()
        })
    
    # 7. AI 응답 및 페이즈 변경이 완료된 '최종' 상태를 전파
    emit_room_state(room_id)
    # 8. AI 처리 완료 알림 (프론트 UI 로딩 종료용)
    socketio.emit('aiProcessing', {'status': 'end'}, to=room_id)


# ---------------------
# Flask 서버 실행
# ---------------------
if __name__ == "__main__":
    # 💡 [중요] app.run() 대신 socketio.run()을 사용해야 합니다.
    # host='0.0.0.0'을 사용해야 다른 노트북(로컬 네트워크)에서 접속 가능합니다.
    print("Starting Socket.IO server on http://10.198.137.44:5000")
    socketio.run(app, debug=True, host='10.198.137.44', port=5000)