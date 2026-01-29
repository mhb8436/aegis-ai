import { useState } from 'react';
import {
  Typography,
  Card,
  Descriptions,
  Tag,
  Form,
  Input,
  Switch,
  InputNumber,
  Button,
  Tabs,
  Space,
  Divider,
  Alert,
  Row,
  Col,
  Statistic,
  message,
} from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  ApiOutlined,
  SafetyOutlined,
  BellOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface SystemConfig {
  edgeUrl: string;
  coreUrl: string;
  riskThreshold: number;
  maxAuditLogs: number;
  rateLimitRpm: number;
}

interface SecurityConfig {
  promptInjection: boolean;
  piiDetection: boolean;
  outputGuard: boolean;
  ragGuard: boolean;
  agentGuard: boolean;
  semanticAnalysis: boolean;
  mlClassification: boolean;
}

interface AlertConfig {
  emailEnabled: boolean;
  emailRecipients: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  slackEnabled: boolean;
  slackWebhook: string;
  blockRateThreshold: number;
  latencyThreshold: number;
}

const defaultSystemConfig: SystemConfig = {
  edgeUrl: 'http://localhost:8080',
  coreUrl: 'http://localhost:8081',
  riskThreshold: 0.7,
  maxAuditLogs: 10000,
  rateLimitRpm: 100,
};

const defaultSecurityConfig: SecurityConfig = {
  promptInjection: true,
  piiDetection: true,
  outputGuard: true,
  ragGuard: true,
  agentGuard: true,
  semanticAnalysis: true,
  mlClassification: false,
};

const defaultAlertConfig: AlertConfig = {
  emailEnabled: false,
  emailRecipients: '',
  webhookEnabled: false,
  webhookUrl: '',
  slackEnabled: false,
  slackWebhook: '',
  blockRateThreshold: 10,
  latencyThreshold: 1000,
};

const Settings: React.FC = () => {
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(defaultSystemConfig);
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(defaultSecurityConfig);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(defaultAlertConfig);
  const [saving, setSaving] = useState(false);

  const handleSaveSystem = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 500));
    message.success('System settings saved');
    setSaving(false);
  };

  const handleSaveSecurity = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    message.success('Security settings saved');
    setSaving(false);
  };

  const handleSaveAlerts = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    message.success('Alert settings saved');
    setSaving(false);
  };

  const tabItems = [
    {
      key: 'system',
      label: (
        <span>
          <SettingOutlined /> System
        </span>
      ),
      children: (
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <Card title="API Configuration" style={{ marginBottom: 16 }}>
              <Form layout="vertical">
                <Form.Item label="Edge Server URL">
                  <Input
                    value={systemConfig.edgeUrl}
                    onChange={(e) => setSystemConfig({ ...systemConfig, edgeUrl: e.target.value })}
                    prefix={<ApiOutlined />}
                  />
                </Form.Item>
                <Form.Item label="Core Server URL">
                  <Input
                    value={systemConfig.coreUrl}
                    onChange={(e) => setSystemConfig({ ...systemConfig, coreUrl: e.target.value })}
                    prefix={<ApiOutlined />}
                  />
                </Form.Item>
                <Divider />
                <Form.Item label="Risk Threshold (for blocking)">
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.1}
                    value={systemConfig.riskThreshold}
                    onChange={(v) => setSystemConfig({ ...systemConfig, riskThreshold: v ?? 0.7 })}
                    style={{ width: 120 }}
                  />
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Requests above this score will be blocked
                  </Text>
                </Form.Item>
                <Form.Item label="Max Audit Logs (in memory)">
                  <InputNumber
                    min={1000}
                    max={100000}
                    step={1000}
                    value={systemConfig.maxAuditLogs}
                    onChange={(v) => setSystemConfig({ ...systemConfig, maxAuditLogs: v ?? 10000 })}
                    style={{ width: 120 }}
                  />
                </Form.Item>
                <Form.Item label="Rate Limit (requests per minute)">
                  <InputNumber
                    min={10}
                    max={10000}
                    value={systemConfig.rateLimitRpm}
                    onChange={(v) => setSystemConfig({ ...systemConfig, rateLimitRpm: v ?? 100 })}
                    style={{ width: 120 }}
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveSystem} loading={saving}>
                    Save Settings
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="System Status">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Statistic title="Platform Version" value="0.1.0" />
                <Divider />
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Architecture">
                    <Tag color="blue">2-Tier</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Policy Engine">
                    <Tag color="green">Active</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="ML Models">
                    <Tag color={securityConfig.mlClassification ? 'green' : 'default'}>
                      {securityConfig.mlClassification ? 'Loaded' : 'Disabled'}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'security',
      label: (
        <span>
          <SafetyOutlined /> Security
        </span>
      ),
      children: (
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <Card title="Detection Modules" style={{ marginBottom: 16 }}>
              <Form layout="vertical">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Prompt Injection Detection">
                      <Switch
                        checked={securityConfig.promptInjection}
                        onChange={(v) => setSecurityConfig({ ...securityConfig, promptInjection: v })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="PII Detection (Korean)">
                      <Switch
                        checked={securityConfig.piiDetection}
                        onChange={(v) => setSecurityConfig({ ...securityConfig, piiDetection: v })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Output Guard">
                      <Switch
                        checked={securityConfig.outputGuard}
                        onChange={(v) => setSecurityConfig({ ...securityConfig, outputGuard: v })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="RAG Guard">
                      <Switch
                        checked={securityConfig.ragGuard}
                        onChange={(v) => setSecurityConfig({ ...securityConfig, ragGuard: v })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Agent Guard">
                      <Switch
                        checked={securityConfig.agentGuard}
                        onChange={(v) => setSecurityConfig({ ...securityConfig, agentGuard: v })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Semantic Analysis">
                      <Switch
                        checked={securityConfig.semanticAnalysis}
                        onChange={(v) => setSecurityConfig({ ...securityConfig, semanticAnalysis: v })}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Divider />
                <Form.Item
                  label="ML Classification"
                  extra="Requires ONNX models to be loaded"
                >
                  <Switch
                    checked={securityConfig.mlClassification}
                    onChange={(v) => setSecurityConfig({ ...securityConfig, mlClassification: v })}
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveSecurity} loading={saving}>
                    Save Settings
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="OWASP LLM Top 10 Coverage">
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="LLM01: Prompt Injection">
                  <Tag color="green">Covered</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="LLM02: Insecure Output">
                  <Tag color="green">Covered</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="LLM06: Sensitive Info">
                  <Tag color="green">Covered</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="LLM07: Insecure Plugin">
                  <Tag color="green">Covered</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="LLM09: Overreliance">
                  <Tag color="orange">Partial</Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'alerts',
      label: (
        <span>
          <BellOutlined /> Alerts
        </span>
      ),
      children: (
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <Card title="Alert Channels" style={{ marginBottom: 16 }}>
              <Form layout="vertical">
                <Form.Item label="Email Notifications">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Switch
                      checked={alertConfig.emailEnabled}
                      onChange={(v) => setAlertConfig({ ...alertConfig, emailEnabled: v })}
                    />
                    {alertConfig.emailEnabled && (
                      <Input
                        placeholder="recipient@example.com, another@example.com"
                        value={alertConfig.emailRecipients}
                        onChange={(e) => setAlertConfig({ ...alertConfig, emailRecipients: e.target.value })}
                      />
                    )}
                  </Space>
                </Form.Item>
                <Form.Item label="Webhook">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Switch
                      checked={alertConfig.webhookEnabled}
                      onChange={(v) => setAlertConfig({ ...alertConfig, webhookEnabled: v })}
                    />
                    {alertConfig.webhookEnabled && (
                      <Input
                        placeholder="https://your-webhook-url.com/alerts"
                        value={alertConfig.webhookUrl}
                        onChange={(e) => setAlertConfig({ ...alertConfig, webhookUrl: e.target.value })}
                      />
                    )}
                  </Space>
                </Form.Item>
                <Form.Item label="Slack">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Switch
                      checked={alertConfig.slackEnabled}
                      onChange={(v) => setAlertConfig({ ...alertConfig, slackEnabled: v })}
                    />
                    {alertConfig.slackEnabled && (
                      <Input
                        placeholder="https://hooks.slack.com/services/..."
                        value={alertConfig.slackWebhook}
                        onChange={(e) => setAlertConfig({ ...alertConfig, slackWebhook: e.target.value })}
                      />
                    )}
                  </Space>
                </Form.Item>
              </Form>
            </Card>
            <Card title="Alert Thresholds">
              <Form layout="vertical">
                <Form.Item label="Block Rate Threshold (%)">
                  <InputNumber
                    min={1}
                    max={100}
                    value={alertConfig.blockRateThreshold}
                    onChange={(v) => setAlertConfig({ ...alertConfig, blockRateThreshold: v ?? 10 })}
                    addonAfter="%"
                    style={{ width: 150 }}
                  />
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Alert when block rate exceeds this
                  </Text>
                </Form.Item>
                <Form.Item label="Latency Threshold (ms)">
                  <InputNumber
                    min={100}
                    max={10000}
                    step={100}
                    value={alertConfig.latencyThreshold}
                    onChange={(v) => setAlertConfig({ ...alertConfig, latencyThreshold: v ?? 1000 })}
                    addonAfter="ms"
                    style={{ width: 150 }}
                  />
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Alert when avg latency exceeds this
                  </Text>
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveAlerts} loading={saving}>
                    Save Settings
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Alert
              message="Alert Configuration"
              description="Configure notification channels to receive alerts when security thresholds are exceeded or critical events occur."
              type="info"
              showIcon
            />
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Settings</Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />}>Reset to Defaults</Button>
        </Col>
      </Row>

      <Tabs items={tabItems} />
    </div>
  );
};

export default Settings;
