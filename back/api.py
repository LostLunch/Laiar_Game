from flask import Flask, request, jsonify, render_template
from openai import OpenAI
from flask_cors import CORS
import os
from dotenv import load_dotenv
import random
import json
import concurrent.futures

load_dotenv()

# ---------------------
# OpenAI 클라이언트 4명
# ---------------------
client_tough   = OpenAI(api_key=os.getenv("GPT_API_KEY_1"))
client_sense   = OpenAI(api_key=os.getenv("GPT_API_KEY_2"))
client_shrewd  = OpenAI(api_key=os.getenv("GPT_API_KEY_3"))
client_funny   = OpenAI(api_key=os.getenv("GPT_API_KEY_4"))

clients = [client_tough, client_sense, client_shrewd, client_funny]

# ---------------------
# 상태 관리
# 각 클라이언트별로 대화 히스토리(역사)를 유지합니다. role: "user"/"assistant" 형태의 dict 리스트
user_messages = [ [] for _ in range(4) ]
current_word = None  # 제시어 저장용
current_category = None
current_phase = "진술"

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


# ---------------------
# 라운드별 실행
# ---------------------
def run_phase(word: str, phase: str, context_text: str = "", reset_history: bool = False):
    """
    word: 제시어
    phase: 현재 단계(예: "진술","토론","대화")
    context_text: (선택) 현재 사용자/운영자 입력 등, 각 모델에 user 메시지로 전달됨
    reset_history: True면 각 클라이언트 히스토리를 초기화 (새 라운드 시작시 사용)
    """
    def get_response(i):
        # 라운드 초기화 필요하면 히스토리 비우기
        if reset_history:
            user_messages[i] = []

        # 시스템 메시지(규칙, 스타일)
        conversation = [make_prompt(styles[i], word, phase)]

        # 이전 히스토리(유저/어시스턴트 대화)를 붙임
        if user_messages[i]:
            conversation.extend(user_messages[i])

        # 현재 들어온 prompt/context는 user 역할로 추가하고,
        # *** 이 부분이 가장 중요합니다: 히스토리에 현재 user 발언을 저장해야 다음 호출에 문맥으로 전달됩니다. ***
        if context_text:
            # 1. API 호출에 포함
            conversation.append({"role": "user", "content": context_text}) 
            # 2. 다음 호출을 위해 히스토리에 저장 
            user_messages[i].append({"role": "user", "content": context_text}) # ⬅️ 추가된 라인

        response = clients[i].chat.completions.create(
            model="gpt-4o",
            messages=conversation,
            max_tokens=300,
            temperature=0.5,
        )
        content = response.choices[0].message.content.strip()
        print("[백엔드 로그] 현재 진행 중인 라운드: ", phase)
        # 응답을 히스토리에 저장(다음 호출에서 문맥으로 활용)
        user_messages[i].append({"role": "assistant", "content": content})
        return content

    with concurrent.futures.ThreadPoolExecutor() as executor:
        results = list(executor.map(get_response, range(4)))
    return results


# ---------------------
# Flask 서버
# ---------------------
app = Flask(__name__, template_folder="templates")
CORS(app)

rounds = ["statement1", "discussion1", "statement2", "discussion2", "vote"]
current_round_index = 0


@app.route("/")
def index():
    return render_template("texttt.html")




@app.patch("/api/set_game_word")
def set_game_word():
    """
    게임을 새로 설정합니다.
    카테고리와 제시어를 랜덤으로 선택하고 전역 변수에 저장합니다.
    프론트엔드에는 '카테고리'만 반환합니다. (보여주기 용)
    """
    global current_word, current_category, categories, user_messages, current_phase
    
    # 1. 카테고리와 단어 랜덤 선택

    
    # 2. [핵심] 전역 변수에 설정
    current_category,current_word = setting()
    
    
    # 3. 게임 상태 초기화
    current_phase = "진술"
    user_messages = [ [] for _ in range(4) ] # 새 게임이므로 대화 기록 초기화
    
    print(f"[백엔드 로그] 게임 설정 완료 - 카테고리: {current_category}, 제시어: {current_word}")

    return jsonify({
        "category": current_category,
        "word": current_word
    })
# 🔼 *** 1-1. 신규 API 추가 완료 *** 🔼


# 🟡 1차 진술 시작 (제시어 *사용*)
# 🔽 *** 1-2. [수정] /api/start_dec 수정 *** 🔽
@app.patch("/api/start_dec")
def start_dec():
    """
    /api/set_game_word에서 설정된 'current_word' (전역 변수)를 *사용*하여
    AI의 1차 진술을 생성합니다.
    """
    global current_word, current_phase, user_messages, current_category
    
    # [수정] 프론트에서 카테고리를 받을 필요 없이, 이미 설정된 전역 변수(current_word)를 확인
    if not current_word:
        return jsonify({"error": "Word not set. Call /api/set_game_word first."}), 400
        
    current_phase = "진술"

    # [핵심] AI에게 전역 변수 current_word를 전달하여 1차 진술 생성
    messages = run_phase(current_word, current_phase)
    
    # 프론트엔드에 1차 진술 및 확인용 정보 반환
    return jsonify({
        "word": current_word,                 # (운영자 확인용)
        "category": current_category,         # (운영자 확인용)
        "declaration_messages": messages
    })
# 🔼 *** 1-2. 수정 완료 *** 🔼


# 🔵 토론 (AI 응답)
# 🔽 *** 1-3. [수정 불필요 확인] /api/ai_response *** 🔽
@app.patch("/api/ai_response")
def ai_response():
    """
    이 함수는 이미 전역 변수 current_word를 사용하고 있으므로
    수정할 필요가 없습니다.
    """
    global current_word, current_phase
    try:
        data = request.get_json(force=True)
        prompt = data.get("prompt")
        phase = data.get("phase") or "토론"

        if not current_word: # ⬅️ [확인] 전역 변수 사용
            return jsonify({"error": "No word set yet"}), 400

        # AI에게 전역 변수 current_word를 전달
        ai_resp = run_phase(current_word, phase, context_text=prompt) # ⬅️ [확인] 전역 변수 사용

        return jsonify({
            "ai_response": ai_resp,
            "phase": phase,
            "word": current_word
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
