# Aegis 배포 가이드

Aegis AI 보안 플랫폼의 배포 방법을 안내합니다.

## 목차

1. [시스템 요구사항](#시스템-요구사항)
2. [로컬 개발 환경](#로컬-개발-환경)
3. [Docker 배포](#docker-배포)
4. [프로덕션 배포](#프로덕션-배포)
5. [환경 변수](#환경-변수)
6. [보안 설정](#보안-설정)
7. [모니터링](#모니터링)
8. [백업 및 복구](#백업-및-복구)

---

## 시스템 요구사항

### 최소 사양

| 구성 요소 | 최소 | 권장 |
|----------|------|------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| 디스크 | 20 GB | 50+ GB |
| Node.js | 20.x | 20.x LTS |

### 필수 소프트웨어

- Node.js 20.x
- pnpm 8.x
- Docker 24.x (컨테이너 배포 시)
- PostgreSQL 15+ (정책 저장)
- Redis 7+ (캐시, 세션)

### 선택 소프트웨어

- ClickHouse (로그 저장, 대규모 환경)
- Grafana (대시보드)
- Prometheus (메트릭)

---

## 로컬 개발 환경

### 1. 저장소 클론

```bash
git clone https://github.com/your-org/aegis-ai.git
cd aegis-ai
```

### 2. 의존성 설치

```bash
pnpm install
```

### 3. 환경 변수 설정

```bash
# packages/aegis-core/.env
cp packages/aegis-core/.env.example packages/aegis-core/.env
```

```env
# .env
PORT=8081
LOG_LEVEL=debug
NODE_ENV=development

# Database (optional for dev)
POSTGRES_URL=postgresql://aegis:aegis@localhost:5432/aegis
REDIS_URL=redis://localhost:6379

# LLM Providers (optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. 개발 서버 실행

```bash
# 전체 실행
pnpm dev

# 개별 패키지
cd packages/aegis-core && pnpm dev
cd packages/aegis-console && pnpm dev
```

### 5. 테스트

```bash
# 단위 테스트
pnpm test

# 통합 테스트
cd packages/aegis-core && node test-integration.mjs
```

---

## Docker 배포

### 1. 이미지 빌드

```bash
# 전체 빌드
docker-compose build

# 개별 빌드
docker build -t aegis-core:latest -f packages/aegis-core/Dockerfile .
docker build -t aegis-console:latest -f packages/aegis-console/Dockerfile .
```

### 2. Docker Compose 실행

```yaml
# docker-compose.yml
version: '3.8'

services:
  aegis-core:
    build:
      context: .
      dockerfile: packages/aegis-core/Dockerfile
    ports:
      - "8081:8081"
    environment:
      - NODE_ENV=production
      - PORT=8081
      - LOG_LEVEL=info
      - POSTGRES_URL=postgresql://aegis:aegis@postgres:5432/aegis
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  aegis-console:
    build:
      context: .
      dockerfile: packages/aegis-console/Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - aegis-core

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: aegis
      POSTGRES_PASSWORD: aegis
      POSTGRES_DB: aegis
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aegis"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

```bash
# 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f aegis-core
```

### 3. 헬스 체크

```bash
curl http://localhost:8081/api/v1/health
curl http://localhost:3000
```

---

## 프로덕션 배포

### 아키텍처 권장 사항

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │   (Nginx/HAProxy)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
        │ Aegis Core│  │ Aegis Core│  │ Aegis Core│
        │  Node 1   │  │  Node 2   │  │  Node 3   │
        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
        │ PostgreSQL│  │   Redis   │  │ ClickHouse│
        │  Primary  │  │  Cluster  │  │  Cluster  │
        └───────────┘  └───────────┘  └───────────┘
```

### Nginx 설정

```nginx
# /etc/nginx/conf.d/aegis.conf
upstream aegis_core {
    least_conn;
    server aegis-core-1:8081 weight=1;
    server aegis-core-2:8081 weight=1;
    server aegis-core-3:8081 weight=1;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name aegis.yourdomain.com;

    ssl_certificate /etc/ssl/certs/aegis.crt;
    ssl_certificate_key /etc/ssl/private/aegis.key;

    # API 프록시
    location /api/ {
        proxy_pass http://aegis_core;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 콘솔 정적 파일
    location / {
        root /var/www/aegis-console;
        try_files $uri $uri/ /index.html;
    }

    # 헬스 체크 (로드밸런서용)
    location /health {
        proxy_pass http://aegis_core/api/v1/health;
    }
}
```

### 프로세스 관리 (PM2)

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'aegis-core',
    script: 'dist/main.js',
    cwd: '/app/packages/aegis-core',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8081,
    },
    max_memory_restart: '1G',
    error_file: '/var/log/aegis/error.log',
    out_file: '/var/log/aegis/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
```

```bash
# PM2 실행
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 환경 변수

### 필수 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | API 서버 포트 | 8081 |
| `NODE_ENV` | 환경 (development/production) | development |
| `LOG_LEVEL` | 로그 레벨 (debug/info/warn/error) | info |

### 데이터베이스

| 변수 | 설명 | 예시 |
|------|------|------|
| `POSTGRES_URL` | PostgreSQL 연결 문자열 | postgresql://user:pass@host:5432/db |
| `REDIS_URL` | Redis 연결 문자열 | redis://host:6379 |
| `CLICKHOUSE_URL` | ClickHouse 연결 문자열 | http://host:8123 |

### LLM 프로바이더

| 변수 | 설명 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 키 |
| `AZURE_OPENAI_KEY` | Azure OpenAI API 키 |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI 엔드포인트 |
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `GOOGLE_AI_API_KEY` | Google AI API 키 |

### 보안

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `CORS_ORIGINS` | 허용 CORS 오리진 | * |
| `RATE_LIMIT_MAX` | 분당 최대 요청 수 | 100 |
| `DRY_RUN` | 테스트 모드 (차단 안함) | false |

### ML 모델

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ML_MODEL_DIR` | ML 모델 디렉토리 | ./ml-models |
| `ML_ENABLED` | ML 기능 활성화 | true |

---

## 보안 설정

### 1. TLS/SSL 설정

```bash
# Let's Encrypt 인증서 발급
certbot certonly --nginx -d aegis.yourdomain.com
```

### 2. 방화벽 설정

```bash
# UFW (Ubuntu)
ufw allow 443/tcp
ufw allow 22/tcp
ufw enable

# 내부 통신만 허용 (PostgreSQL, Redis)
ufw deny 5432/tcp
ufw deny 6379/tcp
```

### 3. 네트워크 분리

- **DMZ**: Aegis-Edge (외부 접근 가능)
- **내부망**: Aegis-Core, 데이터베이스 (내부 전용)

### 4. API 인증 (선택)

```typescript
// JWT 인증 미들웨어 예시
import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};
```

---

## 모니터링

### Prometheus 메트릭

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'aegis-core'
    static_configs:
      - targets: ['aegis-core:8081']
    metrics_path: '/api/v1/metrics'
    scrape_interval: 15s
```

### 주요 메트릭

| 메트릭 | 설명 |
|--------|------|
| `aegis_requests_total` | 총 요청 수 |
| `aegis_blocked_total` | 차단된 요청 수 |
| `aegis_threats_detected_total` | 탐지된 위협 수 |
| `aegis_request_duration_seconds` | 요청 처리 시간 |
| `aegis_pii_detections_total` | PII 탐지 수 |

### Grafana 대시보드

대시보드 JSON: `grafana/aegis-dashboard.json`

```bash
# Grafana 데이터소스 설정
# Prometheus: http://prometheus:9090
```

### 로그 수집 (선택)

```yaml
# Fluent Bit 설정
[INPUT]
    Name              tail
    Path              /var/log/aegis/*.log
    Parser            json

[OUTPUT]
    Name              es
    Match             *
    Host              elasticsearch
    Port              9200
    Index             aegis-logs
```

---

## 백업 및 복구

### PostgreSQL 백업

```bash
# 백업
pg_dump -h localhost -U aegis -d aegis > backup_$(date +%Y%m%d).sql

# 복구
psql -h localhost -U aegis -d aegis < backup_20240115.sql
```

### 자동 백업 스크립트

```bash
#!/bin/bash
# /opt/aegis/backup.sh

BACKUP_DIR=/backup/aegis
DATE=$(date +%Y%m%d_%H%M%S)

# PostgreSQL
pg_dump -h localhost -U aegis -d aegis | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# 정책 파일
tar -czf $BACKUP_DIR/policies_$DATE.tar.gz /app/packages/aegis-core/src/policy/rules/

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -type f -mtime +7 -delete
```

```bash
# Cron 설정
0 2 * * * /opt/aegis/backup.sh
```

### 복구 절차

1. 서비스 중지
2. 데이터베이스 복구
3. 정책 파일 복구
4. 서비스 시작
5. 헬스 체크 확인

```bash
# 1. 서비스 중지
docker-compose down

# 2. DB 복구
gunzip < backup_20240115.sql.gz | psql -U aegis -d aegis

# 3. 정책 복구
tar -xzf policies_20240115.tar.gz -C /

# 4. 서비스 시작
docker-compose up -d

# 5. 확인
curl http://localhost:8081/api/v1/health
```

---

## 문제 해결

### 서비스 시작 실패

```bash
# 로그 확인
docker-compose logs aegis-core

# 포트 충돌 확인
lsof -i :8081
```

### 데이터베이스 연결 오류

```bash
# PostgreSQL 연결 테스트
psql -h localhost -U aegis -d aegis -c "SELECT 1"

# Redis 연결 테스트
redis-cli ping
```

### 메모리 부족

```bash
# 메모리 사용량 확인
docker stats

# Node.js 힙 크기 조정
NODE_OPTIONS="--max-old-space-size=4096"
```

---

## 지원

- **문서**: [docs/](./docs/)
- **API 스펙**: [docs/api/openapi.yaml](./api/openapi.yaml)
- **통합 가이드**: [docs/INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
