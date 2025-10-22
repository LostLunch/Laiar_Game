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
# ---------------------
user_messages = [[""] for _ in range(4)]
current_word = None  # 제시어 저장용
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
현재 단계는 "{phase}" 입니다.

💡 규칙:
1. 제시어 직접 언급 금지 ("{word}"는 말하지 마세요)
2. 힌트는 2개 이내, 발음/형태/비유로만
3. 모호성을 유지
4. {phase}에 맞게 행동하기
5. "{word}" 대신 "이것" 또는 "제시어"라고 표현

성격 설정: {style}
"""
    if context_text:
        base_prompt += f"\n지금까지의 대화 참고: {context_text}\n"

    return {"role": "system", "content": base_prompt.strip()}


# ---------------------
# 제시어 랜덤 선택
# ---------------------
def setting():
    category = random.choice(list(categories.keys()))
    word = random.choice(categories[category])
    return word


# ---------------------
# 라운드별 실행
# ---------------------
def run_phase(word: str, phase: str, context_text: str = ""):
    def get_response(i):
        conversation = [make_prompt(styles[i], word, phase, context_text)]
        response = clients[i].chat.completions.create(
            model="gpt-3.5-turbo",
            messages=conversation,
            max_tokens=300,
            temperature=0.7,
        )
        content = response.choices[0].message.content.strip()
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


# 🟢 진술 시작
@app.patch("/api/start_dec")
def start_dec():
    global current_word, current_phase
    current_phase = "진술"
    current_word = setting()
    messages = run_phase(current_word, current_phase)
    return jsonify({"word": current_word, "declaration_messages": messages})


# 🟡 토론 시작
@app.patch("/api/start_disc")
def start_disc():
    global current_word, current_phase
    current_phase = "토론"

    data = request.get_json(force=True)
    word = data.get("word") or current_word
    if not word:
        return jsonify({"error": "word key is missing"}), 400

    current_word = word
    messages = run_phase(current_word, current_phase)
    return jsonify({"discussion_messages": messages})


# 🔵 AI 응답 (단계별)
@app.patch("/api/ai_response")
def ai_response():
    global current_phase, current_word
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        phase = data.get("phase", current_phase)

        if not current_word:
            return jsonify({"error": "No word set yet"}), 400

        # 기존 대화(prompt)를 참고하도록 전달
        ai_resp = run_phase(current_word, phase, context_text=prompt)

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
