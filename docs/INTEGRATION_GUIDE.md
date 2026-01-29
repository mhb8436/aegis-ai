# Aegis 통합 가이드

외부 LLM 시스템과 Aegis 보안 플랫폼 통합 방법을 안내합니다.

## 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [빠른 시작](#빠른-시작)
4. [통합 패턴](#통합-패턴)
5. [API 사용법](#api-사용법)
6. [코드 예제](#코드-예제)
7. [고급 설정](#고급-설정)
8. [문제 해결](#문제-해결)

---

## 개요

Aegis는 AI/LLM 시스템을 위한 런타임 보안 플랫폼입니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| **Input Guard** | 프롬프트 인젝션, 탈옥 시도 탐지 |
| **Output Guard** | PII, 민감 데이터 탐지 및 마스킹 |
| **RAG Guard** | 문서 보안, 임베딩 무결성 검증 |
| **Agent Guard** | 도구 호출 검증, 권한 관리 |
| **Policy Engine** | 동적 보안 정책 관리 |

### 지원 LLM 프로바이더

- OpenAI (GPT-4, GPT-3.5)
- Azure OpenAI
- Anthropic Claude
- Google Gemini
- 커스텀 엔드포인트

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Aegis-Edge (DMZ)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Rate Limit  │  │ 1st Filter  │  │  Request Logging    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Aegis-Core (내부망)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Deep Inspect│  │ ML Models   │  │  Policy Engine      │  │
│  ├─────────────┤  ├─────────────┤  ├─────────────────────┤  │
│  │ RAG Guard   │  │ Agent Guard │  │  Audit Logger       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       LLM Provider                           │
│         (OpenAI / Azure / Claude / Gemini)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 빠른 시작

### 1. 서버 실행

```bash
# 개발 환경
cd packages/aegis-core
pnpm dev

# 프로덕션 (Docker)
docker-compose up -d
```

### 2. 헬스 체크

```bash
curl http://localhost:8081/api/v1/health
```

### 3. 첫 번째 요청

```bash
# 입력 검사
curl -X POST http://localhost:8081/api/v1/inspect \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how are you?"}'

# 출력 분석
curl -X POST http://localhost:8081/api/v1/output/analyze \
  -H "Content-Type: application/json" \
  -d '{"output": "Your order has been processed."}'
```

---

## 통합 패턴

### 패턴 1: 프록시 모드 (권장)

모든 LLM 요청을 Aegis를 통해 프록시합니다.

```
App → Aegis → LLM Provider
        ↓
    검사 + 필터링
```

**장점**: 완전한 보안 커버리지, 중앙 집중식 관리

```typescript
// 기존 코드
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: userInput }]
});

// Aegis 통합
const response = await fetch("http://aegis:8081/api/v1/llm/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    provider: "openai",
    model: "gpt-4",
    messages: [{ role: "user", content: userInput }]
  })
});
```

### 패턴 2: 사이드카 모드

입출력만 검사하고 LLM 호출은 직접 수행합니다.

```
App → Aegis (검사) → App → LLM Provider
                        ↓
                    Aegis (출력 검사)
```

**장점**: 기존 코드 최소 변경, 점진적 도입 가능

```typescript
// 1. 입력 검사
const inspectResult = await fetch("http://aegis:8081/api/v1/inspect", {
  method: "POST",
  body: JSON.stringify({ message: userInput, sessionId })
});

if (!inspectResult.result.passed) {
  throw new Error("Request blocked by security policy");
}

// 2. LLM 호출 (기존 코드 유지)
const llmResponse = await openai.chat.completions.create({...});

// 3. 출력 분석
const outputResult = await fetch("http://aegis:8081/api/v1/output/analyze", {
  method: "POST",
  body: JSON.stringify({ output: llmResponse.choices[0].message.content })
});

// 마스킹된 출력 사용
const safeOutput = outputResult.analysis.sanitizedOutput;
```

### 패턴 3: RAG 시스템 통합

문서 수집 파이프라인에 Aegis를 통합합니다.

```
문서 수집 → Aegis RAG Guard → 벡터 DB
                ↓
            위협 탐지 + 차단
```

```typescript
// 문서 인제스트 전 검사
const scanResult = await fetch("http://aegis:8081/api/v1/rag/ingest", {
  method: "POST",
  body: JSON.stringify({
    documents: documents.map(doc => ({
      content: doc.text,
      source: doc.url,
      metadata: doc.metadata
    }))
  })
});

// 안전한 문서만 벡터 DB에 저장
const safeDocuments = scanResult.results
  .filter(r => r.isSafe)
  .map(r => documents[r.index]);

await vectorDB.insert(safeDocuments);
```

### 패턴 4: 에이전트 시스템 통합

에이전트의 도구 호출을 검증합니다.

```typescript
// 에이전트 도구 실행 전 검증
async function executeToolWithGuard(toolCall: ToolCall) {
  const validation = await fetch("http://aegis:8081/api/v1/agent/validate-tool", {
    method: "POST",
    body: JSON.stringify({
      toolName: toolCall.name,
      agentId: agent.id,
      parameters: toolCall.parameters
    })
  });

  if (!validation.decision.allowed) {
    return { error: validation.decision.reason };
  }

  // 검증 통과 시 도구 실행
  return await executeTool(toolCall);
}
```

---

## API 사용법

### 입력 검사 (Input Guard)

```http
POST /api/v1/inspect
Content-Type: application/json

{
  "message": "사용자 입력 메시지",
  "sessionId": "session-123",
  "context": {
    "userId": "user-456",
    "conversationHistory": []
  }
}
```

**응답 (200 OK)**:
```json
{
  "requestId": "req-xxx",
  "result": {
    "passed": true,
    "riskScore": 0.12,
    "findings": [],
    "latencyMs": 45
  }
}
```

**응답 (403 Forbidden)**:
```json
{
  "requestId": "req-xxx",
  "result": {
    "passed": false,
    "riskScore": 0.95,
    "findings": [
      {
        "type": "direct_injection",
        "detected": true,
        "confidence": 0.95,
        "riskLevel": "critical",
        "matchedPatterns": ["ignore previous instructions"]
      }
    ],
    "latencyMs": 52
  }
}
```

### 출력 분석 (Output Guard)

```http
POST /api/v1/output/analyze
Content-Type: application/json

{
  "output": "LLM이 생성한 응답 텍스트"
}
```

**응답**:
```json
{
  "requestId": "req-xxx",
  "analysis": {
    "containsPii": true,
    "piiFindings": [
      {
        "type": "PHONE",
        "value": "010-1234-5678",
        "start": 15,
        "end": 28,
        "confidence": 1.0
      }
    ],
    "containsSensitive": false,
    "sensitiveFindings": [],
    "sanitizedOutput": "연락처: ***-****-****로 문의하세요."
  }
}
```

### RAG 문서 스캔

```http
POST /api/v1/rag/scan
Content-Type: application/json

{
  "content": "문서 내용...",
  "source": "https://example.com/doc.pdf",
  "metadata": {
    "author": "홍길동",
    "date": "2024-01-15"
  }
}
```

### 임베딩 무결성 검증

```http
POST /api/v1/rag/verify-embedding
Content-Type: application/json

{
  "embedding": {
    "id": "emb-123",
    "values": [0.1, 0.2, -0.3, ...],
    "dimension": 1536,
    "checksum": "abc123..."
  },
  "expectedDimension": 1536
}
```

### 시맨틱 드리프트 탐지

```http
POST /api/v1/rag/detect-drift
Content-Type: application/json

{
  "originalContent": "원본 문서 내용...",
  "currentContent": "수정된 문서 내용..."
}
```

### 문서 출처 추적

```http
POST /api/v1/rag/provenance/create
Content-Type: application/json

{
  "documentId": "doc-123",
  "sourceType": "external",
  "origin": "https://trusted-source.gov.kr/doc.pdf",
  "content": "문서 내용...",
  "verified": true
}
```

---

## 코드 예제

### Python (requests)

```python
import requests

AEGIS_URL = "http://localhost:8081/api/v1"

def check_input(message: str, session_id: str = None) -> dict:
    response = requests.post(
        f"{AEGIS_URL}/inspect",
        json={"message": message, "sessionId": session_id}
    )
    return response.json()

def analyze_output(output: str) -> dict:
    response = requests.post(
        f"{AEGIS_URL}/output/analyze",
        json={"output": output}
    )
    return response.json()

# 사용 예시
result = check_input("Hello, how can I help you?")
if result["result"]["passed"]:
    # LLM 호출 진행
    pass
else:
    print(f"Blocked: {result['result']['findings']}")
```

### Node.js (axios)

```typescript
import axios from 'axios';

const aegis = axios.create({
  baseURL: 'http://localhost:8081/api/v1',
  timeout: 5000,
});

async function secureChat(userMessage: string): Promise<string> {
  // 1. 입력 검사
  const { data: inspectResult } = await aegis.post('/inspect', {
    message: userMessage,
    sessionId: 'session-123',
  });

  if (!inspectResult.result.passed) {
    throw new Error(`Security violation: ${inspectResult.result.findings[0].type}`);
  }

  // 2. LLM 호출 (프록시 모드)
  const { data: llmResult } = await aegis.post('/llm/chat', {
    provider: 'openai',
    model: 'gpt-4',
    messages: [{ role: 'user', content: userMessage }],
  });

  if (llmResult.blocked) {
    throw new Error(`Request blocked: ${llmResult.blockReason}`);
  }

  return llmResult.response.content;
}
```

### Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

const AegisURL = "http://localhost:8081/api/v1"

type InspectRequest struct {
    Message   string `json:"message"`
    SessionID string `json:"sessionId,omitempty"`
}

type InspectResponse struct {
    RequestID string `json:"requestId"`
    Result    struct {
        Passed    bool    `json:"passed"`
        RiskScore float64 `json:"riskScore"`
    } `json:"result"`
}

func CheckInput(message string) (*InspectResponse, error) {
    body, _ := json.Marshal(InspectRequest{Message: message})

    resp, err := http.Post(
        AegisURL+"/inspect",
        "application/json",
        bytes.NewBuffer(body),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result InspectResponse
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}
```

---

## 고급 설정

### 커스텀 정책 추가

```bash
curl -X POST http://localhost:8081/api/v1/policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block SQL Keywords",
    "category": "sql_injection",
    "severity": "high",
    "action": "block",
    "patterns": [
      {"type": "regex", "value": "(?i)(drop|delete|truncate)\\s+table"}
    ]
  }'
```

### LLM 프로바이더 설정

`config.yaml`:
```yaml
llmProviders:
  - name: openai
    baseUrl: https://api.openai.com/v1
    apiKeyEnv: OPENAI_API_KEY

  - name: azure
    baseUrl: https://your-resource.openai.azure.com
    apiKeyEnv: AZURE_OPENAI_KEY

  - name: claude
    baseUrl: https://api.anthropic.com
    apiKeyEnv: ANTHROPIC_API_KEY
```

### 에이전트 권한 설정

`agent-permissions.yaml`:
```yaml
version: "1.0"
tools:
  - name: search
    allowed: true

  - name: database_query
    allowed: true
    restrictions:
      - tables: ["public_*"]
        operations: ["select"]
      - tables: ["user_*", "admin_*"]
        operations: []

  - name: file_write
    allowed: false
```

---

## 문제 해결

### 연결 오류

```bash
# 서버 상태 확인
curl http://localhost:8081/api/v1/health

# 포트 확인
lsof -i :8081
```

### 높은 지연 시간

1. ML 모델 로딩 확인
2. 네트워크 지연 확인
3. 배치 처리 고려

```bash
# 메트릭 확인
curl http://localhost:8081/api/v1/metrics | grep aegis_request_duration
```

### False Positive 처리

1. 정책 우선순위 조정
2. 화이트리스트 패턴 추가
3. 임계값 조정

```bash
# 정책 비활성화
curl -X PUT http://localhost:8081/api/v1/policies/{id} \
  -d '{"isActive": false}'
```

---

## 지원

- **GitHub Issues**: [aegis-ai/issues](https://github.com/aegis-ai/issues)
- **문서**: [docs/](./docs/)
- **API 스펙**: [docs/api/openapi.yaml](./api/openapi.yaml)
