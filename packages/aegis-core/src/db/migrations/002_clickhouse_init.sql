-- Aegis Core - ClickHouse Schema
-- Idempotent: uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS audit_requests (
  id              String,
  timestamp       DateTime64(3),
  request_id      String,
  session_id      String DEFAULT '',
  source_ip       String DEFAULT '',
  message         String,
  edge_passed     UInt8 DEFAULT 1,
  edge_risk_score Float32 DEFAULT 0,
  core_passed     UInt8 DEFAULT 1,
  core_risk_score Float32 DEFAULT 0,
  final_action    String DEFAULT 'allow',
  block_reason    String DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, request_id);

CREATE TABLE IF NOT EXISTS threat_events (
  id              String,
  timestamp       DateTime64(3),
  request_id      String,
  threat_type     String,
  severity        String,
  details         String DEFAULT '',
  matched_rules   Array(String) DEFAULT []
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, threat_type);
