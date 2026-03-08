# AI Quota Tracker

다계정 AI 모델 사용 가능량을 실시간으로 모니터링하는 대시보드입니다.

## 실행

1. 의존성 설치
```bash
npm install
```

2. 환경변수 설정
```bash
cp .env.example .env.local
```

3. 개발 서버 실행 (Web + API 동시 실행)
```bash
npm run dev
```

- Web: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:8787`

## 데이터 입력 방식

### 1) Pull 방식 (계정별 URL 폴링)
`.env.local`에 `ACCOUNT_<id>_QUOTA_SOURCE_URL` 값을 넣으면 API가 60초마다 해당 URL을 폴링합니다.

요청 URL의 응답 JSON 포맷:

```json
{
  "quotas": [
    {
      "id": "q1",
      "modelName": "Gemini 3.1 Pro (High)",
      "remainingPercentage": 41.3,
      "refreshTime": "5 hours, 10 min"
    }
  ]
}
```

또는

```json
[
  {
    "modelName": "Claude Sonnet 4.6",
    "remainingPercentage": 27.8,
    "resetAt": "2026-03-10T00:00:00Z"
  }
]
```

### 2) Push 방식 (외부 스크립트/크론)
외부 수집 스크립트에서 `/api/ingest`로 전송합니다.

```bash
curl -X POST http://127.0.0.1:8787/api/ingest \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <INGEST_TOKEN>' \
  -d '{
    "accountId": "2",
    "source": "collector:claude",
    "quotas": [
      {"modelName":"Claude Sonnet 4.6","remainingPercentage":33.2,"refreshTime":"11 hours, 0 min"}
    ]
  }'
```

## API

- `GET /api/health`
- `GET /api/accounts`
- `POST /api/refresh` (전체 또는 `{ "accountId": "2" }`)
- `POST /api/ingest`

## 계정 2~8 자동 수집 연결 (권장)

`collector-runner`가 계정별 소스를 읽어 `/api/ingest`로 자동 push 합니다.

1. `.env.local`에 계정별 수집 방식 설정
```env
ACCOUNT_2_COLLECTOR_CMD=node scripts/sample-account-collector.js 2
ACCOUNT_3_COLLECTOR_CMD=node scripts/sample-account-collector.js 3
ACCOUNT_2_SOURCE_LABEL=collector:account2
ACCOUNT_3_SOURCE_LABEL=collector:account3
```

2. 1회 수집
```bash
npm run collect:once
```

3. 주기 수집 (기본 60초)
```bash
npm run collect:watch
```

`ACCOUNT_<id>_COLLECTOR_CMD`와 `ACCOUNT_<id>_QUOTA_SOURCE_URL`이 모두 있으면 `COLLECTOR_CMD`를 우선합니다.

## Provider 수집기 (OpenAI/Gemini/Claude)

`scripts/providers` 아래 수집기를 계정별 명령으로 연결할 수 있습니다.

### OpenAI 예시 (단일 provider)

```env
ACCOUNT_2_COLLECTOR_CMD=node scripts/providers/collect-openai.js
OPENAI_API_KEY=sk-...
OPENAI_USAGE_SOURCE_URL=https://api.openai.com/v1/organization/usage/completions?start_time=1739577600&end_time=1739663999
OPENAI_DAILY_TOKEN_LIMIT=3000000
```

### 계정별 다중 provider 합산 예시

```env
ACCOUNT_3_COLLECTOR_CMD=ENABLE_GEMINI_COLLECTOR=true ENABLE_CLAUDE_COLLECTOR=true ENABLE_OPENAI_COLLECTOR=true node scripts/providers/collect-account-all.js
ACCOUNT_3_SOURCE_LABEL=collector:multi-provider
```

`collect-gemini.js`, `collect-claude.js`는 공급자 콘솔/사내 API에서 usage 토큰을 가져오는 URL(`*_USAGE_SOURCE_URL`) 또는 직접 토큰 값(`*_USAGE_TOKENS`)을 입력받아 남은 비율을 계산합니다.

보안: `ACCOUNT_<id>_COLLECTOR_CMD`에는 API 키를 직접 인라인하지 말고 `.env.local`에 변수로 분리하세요.

## Streamlit 배포 준비

이 저장소 루트에 `streamlit_app.py`, `requirements.txt`를 추가했습니다.

로컬 실행:

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

Streamlit Community Cloud:

1. GitHub 저장소 연결
2. Main file path: `streamlit_app.py`
3. (권장) Secrets 또는 환경변수에 `QUOTA_API_BASE_URL` 설정
4. 배포

`QUOTA_API_BASE_URL`를 설정하면 Streamlit 앱이 `/api/accounts`를 직접 읽습니다. API가 없으면 `data/quota.db`를 fallback으로 읽을 수 있습니다.
