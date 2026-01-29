import { Row, Col, Card, Statistic, Tag } from 'antd';
import {
  SafetyOutlined,
  StopOutlined,
  WarningOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

interface StatsCardsProps {
  totalRequests: number;
  blockedRequests: number;
  warnedRequests: number;
  riskLevel: string;
}

const riskLevelColor: Record<string, string> = {
  low: 'green',
  medium: 'orange',
  high: 'red',
  critical: '#ff0000',
};

const StatsCards: React.FC<StatsCardsProps> = ({
  totalRequests,
  blockedRequests,
  warnedRequests,
  riskLevel,
}) => (
  <Row gutter={[16, 16]}>
    <Col xs={24} sm={12} lg={6}>
      <Card>
        <Statistic
          title="Total Requests"
          value={totalRequests}
          prefix={<SafetyOutlined />}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card>
        <Statistic
          title="Blocked"
          value={blockedRequests}
          prefix={<StopOutlined />}
          valueStyle={{ color: '#cf1322' }}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card>
        <Statistic
          title="Warned"
          value={warnedRequests}
          prefix={<WarningOutlined />}
          valueStyle={{ color: '#faad14' }}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card>
        <div style={{ textAlign: 'center' }}>
          <DashboardOutlined style={{ fontSize: 24, marginBottom: 8 }} />
          <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>Risk Level</div>
          <Tag color={riskLevelColor[riskLevel] ?? 'default'} style={{ fontSize: 16 }}>
            {riskLevel.toUpperCase()}
          </Tag>
        </div>
      </Card>
    </Col>
  </Row>
);

export default StatsCards;
