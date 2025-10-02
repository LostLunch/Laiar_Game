from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS
import os
from dotenv import load_dotenv
import random

load_dotenv()

# 각 참가자별 클라이언트
client_tough = OpenAI(api_key=os.getenv("GPT_API_KEY_1"))
client_sense = OpenAI(api_key=os.getenv("GPT_API_KEY_2"))
client_shrewd = OpenAI(api_key=os.getenv("GPT_API_KEY_3"))
client_funny = OpenAI(api_key=os.getenv("GPT_API_KEY_4"))

clients = [client_tough, client_sense, client_shrewd, client_funny]

# 대화 상태 저장
user_messages = [[""] for _ in range(4)]

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

def make_prompt(style: str, word: str, phase: str):
    return {
        "role": "system",
        "content": f"""
당신은 라이어 게임의 참가자이며, **제시어({word})를 알고 있는 일반 시민 역할**입니다.
당신의 목표는 라이어가 아님을 증명하고, 라이어를 찾아내는 것입니다.

💡 반드시 지켜야 할 핵심 규칙:
1. 제시어 직접 언급 금지 ("{word}"라는 단어는 절대 말하지 마세요).
2. 정답 확정 발언 금지.
3. 힌트는 발음/형태/비유 등으로만 간접적으로 2개 이내.
4. "{word}" 대신 "이것" 또는 "제시어"라고 표현.
5. 모호성을 유지하여 라이어가 쉽게 눈치 못 채게 하기.
6. 거짓말 금지.
7. 현재 {phase} 시간입니다. 이 시간에 맞는 행동을 하세요.

🗣️ 성격 연기 규칙:
- 당신의 성격은 **{style} 스타일**입니다.
- 규칙 위반 없이, 성격에 맞게 설명하세요.
"""
    }

def setting():
    category = random.choice(list(categories.keys()))
    word = random.choice(categories[category])
    return word

def run_phase(word: str, phase: str):
    outputs = []
    for i in range(4):
        user_messages[i] = make_prompt(styles[i], word, phase)
        response = clients[i].chat.completions.create(
            model="gpt-3.5-turbo",
            messages=user_messages[i],
            max_tokens=300,
            temperature=0.7,
        )
        content = response.choices[0].message.content
        user_messages[i].append({"role": "assistant", "content": content})
        outputs.append(content)
    return outputs

app = Flask(__name__)
CORS(app)

rounds = ["statement1", "discussion1", "statement2", "discussion2", "vote"]
current_round_index = 0

@app.patch("/api/start_dec")
def start_dec():
    word = setting()
    messages = run_phase(word, "진술")
    return jsonify({"word": word, "declaration_messages": messages})

@app.patch("/api/start_disc")
def start_disc():
    data = request.get_json()
    word = data.get("word")
    messages = run_phase(word, "토론")
    return jsonify({"discussion_messages": messages})

@app.route("/next_round", methods=["POST"])
def next_round():
    global current_round_index
    if current_round_index < len(rounds) - 1:
        current_round_index += 1
    return jsonify({"round": rounds[current_round_index]})

@app.route("/get_round", methods=["GET"])
def get_round():
    return jsonify({"round": rounds[current_round_index]})

if __name__ == "__main__":
    app.run(debug=True)