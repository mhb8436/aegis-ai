> **Claude Co-Worker 금지사항**: `git commit`, `git push` 등 git 기록 관련 명령을 자동으로 실행하지 마세요. 반드시 사용자의 명시적 요청이 있을 때만 수행하세요.

# Aegis - AI/LLM Security Platform

## Project Context

이 프로젝트는 공공기관 AI Agent/RAG 시스템을 위한 런타임 보안 플랫폼입니다.

## 핵심 아키텍처

### 2-Tier 보안 구조
1. **Aegis-Edge** (오픈망, DMZ)
   - 경량 Reverse Proxy
   - 1차 Injection 패턴 탐지
   - Rate Limiting
   - 로그 수집

2. **Aegis-Core** (폐쇄망, 업무망)
   - 정밀 ML 기반 분석
   - RAG 문서 스캔
   - Agent Tool Call 검증
   - Output Guard (PII 탐지)
   - 감사 로깅

3. **Aegis-Console** (폐쇄망)
   - React 대시보드
   - 정책 관리
   - 리포트 생성

## 기술 스택

- **Runtime**: Node.js 20+ (TypeScript)
- **Frontend**: React 18 + Ant Design 5 + ECharts
- **ML**: Python + PyTorch + HuggingFace Transformers
- **Database**: PostgreSQL (정책), ClickHouse (로그)
- **Cache**: Redis
- **Build**: pnpm + Turborepo
- **Container**: Docker + Kubernetes

## 보안 위협 대응 (OWASP LLM Top 10 2025)

| 위협 | 대응 컴포넌트 |
|-----|-------------|
| Prompt Injection | Input Guard, Deep Inspector |
| Insecure Output | Output Guard |
| System Prompt Leakage | Pattern Detection |
| Vector Weakness | RAG Guard |

## 개발 가이드

### 모노레포 구조
```
packages/
├── aegis-edge/     # Express.js 기반 프록시
├── aegis-core/     # 메인 보안 엔진
├── aegis-console/  # React 관리 콘솔
└── aegis-common/   # 공통 타입, 유틸
```

### 주요 파일
- `ARCHITECTURE.md` - 상세 기술 설계서
- `packages/*/src/guards/` - 보안 가드 구현
- `packages/aegis-core/ml-models/` - ML 모델

### 코드 스타일
- TypeScript strict mode
- ESLint + Prettier
- 함수형 프로그래밍 선호
- 에러 처리는 Result 패턴 사용

### 테스트
- Unit: Vitest
- Integration: Supertest
- E2E: Playwright

## 깃 커밋
- Claude Code 를 컨트리뷰터에 넣는거 금지 
- 이모지 사용금지 
- 커밋 메시지 길이 제한 50자 이하

## 현재 상태

- [x] Phase 1: MVP (완료)
  - [x] Aegis-Edge 기본 구조 (Injection Detector, Rate Limiter)
  - [x] Input Guard (패턴 기반 Deep Inspector)
  - [x] Aegis-Core 기본 구조 (Policy Engine, Audit Logger)
  - [x] Output Guard (PII 탐지)
  - [x] Console 대시보드 (스캐폴드)
- [x] Phase 2: RAG 보안 (완료)
  - [x] RAG Guard (비가시 문자, 숨겨진 지시, 인코딩 공격 탐지)
  - [x] RAG Scanner Integration (배치 문서 스캔, 청크 검증)
- [x] Phase 3: Agent 보안 (완료)
  - [x] Agent Guard (4단계 검증 파이프라인)
  - [x] MCP Gateway (도구 설명 포이즈닝, 자격 증명 노출 탐지)
- [x] 인프라 (완료)
  - [x] Docker (Edge, Core, Console, PostgreSQL, ClickHouse, Redis)
  - [x] DB Integration (migrations, audit-repo, policy-repo)
  - [x] LLM Proxy (multi-provider, dry-run, SSE 스트리밍)
- [ ] Phase 4: 엔터프라이즈 (진행 중) → `TODO.md` 참조

## 참고 문서

- [OWASP Top 10 for LLM 2025](https://genai.owasp.org/)
- [Lakera Guard](https://www.lakera.ai/) - 경쟁사 참고
- [arXiv:2511.15759](https://arxiv.org/abs/2511.15759) - AI Agent 보안 연구
