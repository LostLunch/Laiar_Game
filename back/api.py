from flask import Flask, request, jsonify


app = Flask(__name__)

@app.get("/api/health")
def health():
    return {"ok": True}

#@app.route('/api/dec', methods=['POST'])
#def declaration():
    #주제 설정 함수
    #인공지능 대답 4번

#@app.route('/api/dis', methods=['POST'])
#def discussion():
    #인공지능이 앞서 말했던 내용을 기반으로 대화
    #사용자도 대화


