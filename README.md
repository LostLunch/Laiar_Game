# 라이어 게임 (Liar Game)

실시간 채팅과 AI 기반 라이어 게임이 통합된 웹 애플리케이션입니다.

## 기능

### 1. 실시간 채팅
- Firebase 기반 실시간 채팅
- 방 생성 및 참여
- 턴 기반 메시지 시스템

### 2. 라이어 게임
- GPT API를 활용한 4명의 AI 참가자
- 각 AI는 서로 다른 성격 (까칠한, 치밀한, 얍삽한, 광대 같은)
- 진술 단계와 토론 단계로 구성
- 랜덤 제시어 생성 (동물, 음식, 교통수단, 직업, 날씨)

## 설치 및 실행

### 백엔드 설정

1. 백엔드 디렉토리로 이동:
```bash
cd back
```

2. 가상환경 생성 및 활성화:
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

3. 패키지 설치:
```bash
pip install -r requirements.txt
```

4. 환경 변수 설정:
- `env_example.txt` 파일을 참고하여 `.env` 파일 생성
- OpenAI API 키를 설정

5. 서버 실행:
```bash
python api.py
```

### 프론트엔드 설정

1. 프론트엔드 디렉토리로 이동:
```bash
cd front
```

2. 웹 브라우저에서 `texttt_geminai_p_shar.html` 파일 열기

## 사용법

1. 웹 페이지에서 방을 생성하거나 기존 방에 참여
2. 게임 모드 선택:
   - **일반 채팅**: 실시간 채팅 기능
   - **라이어 게임**: AI와 함께하는 라이어 게임
3. 라이어 게임에서는:
   - "진술 시작" 버튼으로 AI들의 첫 번째 진술 확인
   - "토론 시작" 버튼으로 AI들의 토론 확인
   - 제시어를 보고 누가 라이어인지 추리

## 기술 스택

- **백엔드**: Python, Flask, OpenAI API
- **프론트엔드**: HTML, JavaScript, Tailwind CSS
- **데이터베이스**: Firebase Firestore
- **인증**: Firebase Auth (익명 로그인)

## API 엔드포인트

- `PATCH /api/start_dec`: 진술 단계 시작
- `PATCH /api/start_disc`: 토론 단계 시작
- `POST /next_round`: 다음 라운드로 진행
- `GET /get_round`: 현재 라운드 정보 조회