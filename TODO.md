# Aegis - 남은 구현 항목

코드베이스 분석 기반 잔여 작업 목록. 완료 시 항목 제거.

---

## 1. ML 모델 통합 ✅ 완료
- [x] Python 환경 설정 (PyTorch, HuggingFace Transformers)
- [x] InjectionClassifier 학습 파이프라인 (RoBERTa 기반, 5-label)
- [x] PII Detector (NER 기반 한국어 개인정보 탐지)
- [x] ONNX 변환 및 TypeScript 연동
- [x] 모델 서빙 인프라 (onnxruntime-node 통합)

## 2. Semantic/Context 분석 강화 ✅ 완료
- [x] SemanticAnalyzer 구현 (의도 탐지) - 패턴 기반 7가지 IntentType 분류
- [x] 다중 턴 대화 분석 - ContextAnalyzer, 점진적 에스컬레이션 탐지
- [x] 간접 주입 탐지 (시맨틱 유사도) - 분할 인젝션, 컨텍스트 혼란 탐지
- [x] Deep Inspector에 ML + Semantic 결과 통합 - 4단계 탐지 파이프라인

## 3. Sensitive Data Detection 강화 ✅ 완료
- [x] SensitiveDataDetector 구현 (내부 시스템 정보, API 키, 자격 증명 패턴)
- [x] 조직별 커스텀 민감 패턴 - addCustomPattern(), loadPatterns()
- [x] OutputGuard에 통합 - analyzeOutput()에서 PII + Sensitive 복합 탐지

## 4. 모니터링 & 알림 ✅ 완료
- [x] Prometheus metrics exporter (`/metrics` 엔드포인트) - prom-client 통합
- [x] 핵심 메트릭 (요청 수, 차단율, 위험도 분포, 레이턴시) - 27개 메트릭 정의
- [x] 알림 규칙 엔진 (차단율 > 10%, 응답시간 > 1s 등) - 9개 기본 규칙
- [x] Grafana 대시보드 정의 - grafana/aegis-dashboard.json

## 5. 고급 정책 엔진 ✅ 완료
- [x] Semantic 규칙 평가 (`type: semantic`) - evaluatePolicyAsync 함수
- [x] ML 기반 규칙 평가 - MLPatternConfig, evaluatePolicyAdvanced
- [x] 규칙 조합 연산자 (AND/OR/NOT) - CompositePatternConfig
- [x] 동적 정책 업데이트 (재시작 없이) - reload(), onUpdate() 콜백
- [x] 정책 버전 관리 및 롤백 - PolicyVersion, createVersion(), rollback()

## 6. Console UI 완성 ✅ 완료
- [x] 대시보드 실시간 차트 (위협 타임라인, 분포) - ThreatTimeline, RiskDistribution
- [x] 위협 목록 상세 조회/필터링/페이지네이션 - EventsTable 개선
- [x] 정책 규칙 미리보기/충돌 경고 - Policies 페이지 (기존)
- [x] 감사 로그 CSV/JSON 내보내기 - AuditLogs 개선
- [x] 리포트 날짜 선택기, OWASP 준수 리포트 - Reports 페이지 (기존)
- [x] 설정 페이지 구현 - Settings 탭 (System/Security/Alerts)

## 7. RAG Guard 강화 ✅ 완료
- [x] 임베딩 무결성 검증 - verifyEmbeddingIntegrity(), verifyEmbeddingBatch()
- [x] 시맨틱 드리프트 탐지 - detectSemanticDrift(), compareChunkConsistency()
- [x] 문서 출처 추적 - createProvenance(), validateProvenance(), shouldAllowAccess()

## 8. API 문서화 ✅ 완료
- [x] OpenAPI/Swagger 스펙 - docs/api/openapi.yaml
- [x] 통합 가이드 - docs/INTEGRATION_GUIDE.md
- [x] 배포 가이드 - docs/DEPLOYMENT_GUIDE.md

---

**모든 TODO 항목이 완료되었습니다!**
