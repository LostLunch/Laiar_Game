from flask import Flask, request, jsonify
from openai import OpenAI
from flask_cors import CORS
import os
from dotenv import load_dotenv
import random

load_dotenv()

client_tough = OpenAI(api_key=os.getenv("GPT_API_KEY_1"))
clinet_sense = OpenAI(api_key=os.getenv("GPT_API_KEY_2"))
client_shrewd = OpenAI(api_key=os.getenv("GPT_API_KEY_3"))
clinet_funny = OpenAI(api_key=os.getenv("GPT_API_KEY_4"))

clinet = [client_tough, clinet_sense, client_shrewd, clinet_funny]

user_mesaage = []

categories = {
    "동물": ['사자', '호랑이', '코끼리', '치타', '독수리'],
    "과일": ['김치', '비빔밥', '떡볶이', '김밥', '사과'],
    "교통수단": ['버스', '택시', '기차', '배', '비행기'],
    "직업": ['경찰', '소방관', '판사', '선생님', '의사'],
    "날씨": ['눈', '비', '바람', '안개', '맑음']
}


style = ['까칠한', '치밀한, 옹졸한, 웃긴, 센스 있는, 힌트를 잘 활용하는', '얍삽한, 꼴보기 싫은, 옹졸한, 졸렬한', '사람들을 웃기는 광대 같은']
def make_prompt(style: str,word: str):   #프롬프트 세팅
    return [{
        "role": "system",
        "content": f"""
당신은 라이어 게임의 참가자이며, **제시어({word})를 알고 있는 일반 시민 역할**입니다.
당신의 목표는 라이어가 아님을 증명하고, 라이어를 찾아내는 것입니다.

💡 반드시 지켜야 할 핵심 규칙:
1. **제시어 직접 언급 금지:** 어떤 경우에도 "{word}"라는 단어를 직접 말하지 마세요.
   → 위반 시, 당신은 즉시 라이어로 의심받으며 이후 발언은 단 하나의 특징만 말할 수 있습니다.

2. **정답 확인 금지:** "정답이다", "맞다", "틀리다" 등 제시어가 무엇인지 확정하는 발언은 절대 하지 마세요.
   → 누군가 정답을 외치면, 애매하게만 반응하세요.
     - 예시(시민): "그런 생각도 가능하네요.", "저는 조금 다르게 생각했어요."

3. **힌트 방식:** 제시어를 아는 사람만 이해할 수 있도록,
   - 제시어와 **발음이 겹치거나 비슷한 단어**
   - **형태소가 겹치는 단어**
   - **의미적으로 은근히 연관된 비유나 말장난**
   - **동음이의어**
   등을 활용해 간접적인 힌트를 주십시오.

4. **특징 개수 제한:** 설명할 때는 이런 식의 힌트를 **최대 2개까지만** 말하세요.

5. **설명 시 표현 방식:** "{word}"라는 단어 자체를 쓰지 말고, 대신 "이것" 또는 "제시어"라고 표현하세요.

6. **모호성 유지:** 라이어가 바로 정답을 떠올리지 못하도록 **직접적이지 않고 살짝 빗대는 말**로 설명하세요. 직접적인 관련이 있는 단어는 사용하지 마세요.

🗣️ 성격 연기 규칙:
- 당신의 성격은 **{style} 스타일**입니다. 말투도 이에 맞추어야 합니다.
- 규칙 위반 없이, 자신의 스타일에 맞게 제시어를 설명하세요.

 사회자가 투표시간 입니다 라고 말함:
 투표시간에는 무조건 자신을 제외한 단 한명만을 지목해야하며, 가장 제시어와 관련되어있지 않은 힌트를 제시한 참가자를 지목해야합니다.
 이유는 굳이 언급할 필요가 없습니다.
"""
    }]


def start_game():
    category = random.choice(list(categories.keys()))
    word = random.choice(categories[category])
    
    for i in range(4):
        user_mesaage[i] = make_prompt(style[i], word)
    




















app = Flask(__name__)
CORS(app)

@app.get("/api/health")
def health():
    return {"ok": True}

#@app.route('/api/start', methods=['POST'])
#def start():
    #지금까지 했던 모든 내용을 한번에 실행


