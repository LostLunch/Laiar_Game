from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS
import os
from dotenv import load_dotenv
import random
import json
import concurrent.futures
import string

load_dotenv()

# ---------------------
# OpenAI 클라이언트 4명
# ---------------------
clients = []
for i in range(1, 5):
    try:
        clients.append(OpenAI(api_key=os.getenv(f"GPT_API_KEY_{i}")))
    except Exception as e:
        print(f"Error initializing OpenAI client {i}: {e}")
        # API 키가 없어도 실행은 가능하게 더미 객체 추가 (실제 API 호출은 실패함)
        class DummyClient:
            def chat(self): return self
            def completions(self): return self
            def create(self): return {'choices': [{'message': {'content': '더미 응답: API 키 오류'}}]}
        clients.append(DummyClient())

# ---------------------
# 상태 관리
# 각 클라이언트별로 대화 히스토리(역사)를 유지합니다. role: "user"/"assistant" 형태의 dict 리스트
user_messages = [ [] for _ in range(4) ]
current_word = None  # 제시어 저장용
current_category = None
current_phase = "진술"

rooms = {}

# 초기 게임 상태
def init_room_state():
    return {
        "user_messages": [ [] for _ in range(4) ], # 4명 AI의 대화 이력
        "current_word": None,
        "current_category": None,
        "current_phase": "진술",
    }


categories = {
    "동물": ['사자', '호랑이', '코끼리', '치타', '독수리'],
    "음식": ['김치', '비빔밥', '떡볶이', '김밥', '사과'],
    "교통수단": ['버스', '택시', '기차', '배', '비행기'],
    "직업": ['경찰', '소방관', '판사', '선생님', '의사'],
    "날씨": ['눈', '비', '바람', '안개', '맑음']
}

styles = [
    '까칠한',
    '치밀한, 옹졸한, 웃긴, 센스 있는, 힌트를 잘 활용하는',
    '얍삽한, 꼴보기 싫은, 옹졸한, 졸렬한',
    '사람들을 웃기는 광대 같은'
]

# ---------------------
# 프롬프트 생성 함수
# ---------------------
def make_prompt(style: str, word: str, phase: str, context_text: str = ""):
    base_prompt = f"""
당신은 라이어 게임의 참가자이며, **제시어({word})를 알고 있는 일반 시민 역할**입니다.
당신의 목표는 라이어가 아님을 증명하고, 라이어를 찾아내는 것입니다.

💡 반드시 지켜야 할 핵심 규칙:
1. **제시어 직접 언급 금지:** 어떤 경우에도 "{word}"라는 단어를 직접 말하지 마세요.
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

4. **특징 개수 및 중복 절대 금지 (최우선 규칙):** 설명할 때는 이런 식의 힌트를 **최대 2개까지만** 말하세요.
    **⚠️ 당신은 당신이 이전에 했던 발언(1차 진술)을 반드시 기억해야 합니다. 2차 진술 내용은 1차 진술 내용과 의미적, 형태적으로 완전히 달라야 하며, 다른 참가자가 사용했던 힌트와도 절대 중복되어서는 안 됩니다. (창의적이고 새로운 힌트 2개만 제시하세요.)**

5. **설명 시 표현 방식:** "{word}"라는 단어 자체를 쓰지 말고, 대신 "이것" 또는 "제시어"라고 표현하세요.

6. **모호성 유지:** 라이어가 바로 정답을 떠올리지 못하도록 **직접적이지 않고 살짝 빗대는 말**로 설명하세요. 직접적인 관련이 있는 단어는 사용하지 마세요.

7. **⚠️ 답변 형식 강제:** 당신의 답변은 반드시 "**이것은"으로 시작해 "입니다."로 끝나야 합니다.**" 형식으로 **완벽하게 끝나야 합니다.** (다른 문장 형식, 혹은 중간에 끊기는 문장은 허용하지 않습니다.)

8. 이모티콘 또한 사용하지 마세요.

🗣️ 성격 연기 규칙:
- 당신의 성격은 **{style} 스타일**입니다. 말투도 이에 맞추어야 합니다.
- 규칙 위반 없이, 자신의 스타일에 맞게 제시어를 설명하세요.
"""
    if context_text:
        base_prompt += f"\n지금까지의 대화를 참고하는데 이는 중복 진술을 없애기 위함입니다: {context_text}\n"

    return {"role": "system", "content": base_prompt.strip()}




# ---------------------
# 제시어 랜덤 선택
# ---------------------
def setting():
    category = random.choice(list(categories.keys()))
    word = random.choice(categories[category])
    return category, word

def generate_room_code(length=6):
    """6자리 영문 대문자, 숫자로 구성된 방 코드 생성"""
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for i in range(length))


# ---------------------
# 라운드별 실행
# ---------------------
def run_phase(room_code, word, phase, context_text=None):
    """
    GPT-4o (혹은 설정된 클라이언트)를 사용하여 AI 4명의 발언을 동시에 생성
    context_text: 사용자의 이전 발언 (토론용) 또는 1차 진술 (초기 진술 트리거용)
    """
    if room_code not in rooms:
        raise ValueError(f"Room code {room_code} not found.")

    room = rooms[room_code]
    
    # AI별 성격 설정
    personalities = [
        "당신은 제시어를 알고 있으며, 거칠고 끈질기게 라이어를 추궁합니다.",
        "당신은 제시어를 알고 있으며, 예리하고 논리적으로 추론합니다.",
        "당신은 제시어를 알고 있으며, 교활하고 애매모호한 발언을 하여 라이어를 혼란시킵니다.",
        "당신은 제시어를 알고 있으며, 재미있고 엉뚱한 비유를 사용하여 라이어를 방심하게 합니다."
    ]

    # 시스템 프롬프트
    system_base = f"당신은 라이어 게임 참가자입니다. 제시어는 '{word}'입니다. "
    
    # 1. 이전 대화 기록 추가 (phase=진술인 경우 초기화)
    if phase == "진술":
        # 1차 진술은 새로운 턴이므로 기록 초기화
        for i in range(4):
            room["user_messages"][i] = []
        
        # 1차 진술 시스템 프롬프트
        # context_text는 사용자(참가자)의 1차 진술임.
        system_phase = f"지금은 1차 진술 단계이며, 다른 참가자의 진술({context_text})을 들었습니다. 당신의 제시어('{word}')와 관련하여 추상적이거나 모호하게 발언하세요. 제시어를 직접 언급하지 마세요. 30자 내외로 짧게 답변하세요."
        
    else: # phase == "토론"
        # 이전 대화 내용이 있는 경우 대화 기록 유지
        system_phase = f"지금은 {phase} 단계입니다. 다른 참가자들(AI, 라이어, 사용자)과의 자유 토론입니다. 가장 최근 발언({context_text})에 대해 반박, 동의, 또는 질문을 하세요. 30자 내외로 짧게 답변하세요."
        # 모든 AI의 대화 기록에 사용자 메시지 추가
        for i in range(4):
            room["user_messages"][i].append({"role": "user", "content": context_text})


    def get_ai_response(client_index):
        client = clients[client_index]
        personality = personalities[client_index]
        history = room["user_messages"][client_index]
        
        system_prompt = system_base + personality + system_phase
        
        try:
            # history와 system_prompt를 합쳐서 GPT 호출
            messages = [{"role": "system", "content": system_prompt}] + history
            
            response = client.chat.completions.create(
                model="gpt-4o-mini", # 비용 효율적인 모델 선택
                messages=messages,
                max_tokens=100
            )
            # AI 응답을 대화 기록에 추가
            ai_response = response.choices[0].message.content
            room["user_messages"][client_index].append({"role": "assistant", "content": ai_response})
            return ai_response
            
        except Exception as e:
            print(f"GPT Client {client_index+1} Error: {e}")
            return f"오류: {client_index+1}번 AI 응답 실패"


    # 4명의 AI 응답을 병렬 처리
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(get_ai_response, i) for i in range(4)]
        ai_responses = [f.result() for f in futures]
    
    return ai_responses

# ---------------------
# Flask 서버
# ---------------------
app = Flask(__name__, template_folder="templates")
CORS(app)

rounds = ["statement1", "discussion1", "statement2", "discussion2", "vote"]
current_round_index = 0





@app.route("/api/set_game_word", methods=["PATCH"])
def api_set_game_word():
    """방을 생성하고 제시어를 설정합니다."""
    data = request.get_json(force=True)
    room_code = data.get("room_code")
    
    # room_code가 없으면 새로 생성
    if not room_code or room_code in rooms:
        room_code = generate_room_code()

    # 방 초기화 및 제시어/카테고리 설정
    rooms[room_code] = init_room_state()
    
    selected_category = random.choice(list(categories.keys()))
    selected_word = random.choice(categories[selected_category])
    
    rooms[room_code]["current_category"] = selected_category
    rooms[room_code]["current_word"] = selected_word
    
    return jsonify({
        "room_code": room_code,
        "category": selected_category,
        "word": selected_word
    })


# 🟡 1차 진술 시작 (제시어 *사용*)
# 🔽 *** 1-2. [수정] /api/start_dec 수정 *** 🔽
@app.route("/api/start_dec_with_input", methods=["PATCH"])
def start_dec_with_input():
    """
    게임 시작 (1차 진술)을 사용자의 입력으로 트리거합니다.
    사용자(일반 참가자)의 1차 진술을 컨텍스트로 AI들의 1차 진술을 생성합니다.
    """
    try:
        data = request.get_json(force=True)
        room_code = data.get("room_code")
        user_declaration = data.get("user_declaration") # 사용자의 1차 진술

        if not room_code or room_code not in rooms:
            return jsonify({"error": "Invalid room code"}), 400
        if not user_declaration:
            return jsonify({"error": "User declaration is missing"}), 400

        room = rooms[room_code]
        word = room["current_word"]

        # 1차 진술 단계로 설정하고, 사용자 진술을 컨텍스트로 AI 응답 생성
        room["current_phase"] = "진술"
        ai_resp = run_phase(room_code, word, "진술", context_text=user_declaration)

        return jsonify({
            "ai_response": ai_resp,
            "phase": "1차 진술",
            "word": word
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 🔵 토론 (AI 응답)
# 🔽 *** 1-3. [수정 불필요 확인] /api/ai_response *** 🔽
@app.route("/api/ai_response", methods=["PATCH"])
def api_ai_response():
    """
    일반적인 대화 라운드에서 사용자의 발언을 기반으로 AI 응답을 생성합니다.
    """
    try:
        data = request.get_json(force=True)
        room_code = data.get("room_code")
        prompt = data.get("prompt")
        phase_type = data.get("phase") # '진술' 또는 '토론'

        if not room_code or room_code not in rooms:
            return jsonify({"error": "Invalid room code"}), 400
        if not prompt:
            return jsonify({"error": "Prompt is missing"}), 400

        room = rooms[room_code]
        word = room["current_word"]

        # 다음 단계가 '토론'임을 명시 (run_phase에서 기록 업데이트에 사용)
        room["current_phase"] = phase_type 
        
        # AI 응답 생성
        ai_resp = run_phase(room_code, word, phase_type, context_text=prompt) 

        return jsonify({
            "ai_response": ai_resp,
            "phase": phase_type,
            "word": word
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/next_round", methods=["POST"])
def next_round():
    global current_round_index
    if current_round_index < len(rounds) - 1:
        current_round_index += 1
    return jsonify({"round": rounds[current_round_index]})


@app.route("/get_round", methods=["GET"])
def get_round():
    return jsonify({"round": rounds[current_round_index]})

@app.patch("/api/operator_ai")
def operator_ai():
    try:
        data = request.get_json(force=True)
        operator_message = data.get("operator_message")
        if not operator_message:
            return jsonify({"error": "operator_message key is missing"}), 400

        if not current_word:
            return jsonify({"error": "No word set yet"}), 400

        # 운영자 메시지를 context_text로 전달하여 AI 응답 생성
        responses = run_phase(current_word, "대화", context_text=operator_message)
        
        return jsonify({
            "operator_message": operator_message,
            "ai_responses": responses,
            "phase": "대화",
            "word": current_word
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
