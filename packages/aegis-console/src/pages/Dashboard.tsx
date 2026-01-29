import { Row, Col, Card, Typography, Spin, Space, Button, Statistic } from 'antd';
import { ReloadOutlined, FullscreenOutlined } from '@ant-design/icons';
import StatsCards from '../components/StatsCards';
import ThreatChart from '../components/ThreatChart';
import ThreatTimeline from '../components/ThreatTimeline';
import RiskDistribution from '../components/RiskDistribution';
import EventsTable from '../components/EventsTable';
import { useStats } from '../api/client';

const { Title, Text } = Typography;

const mockStats = {
  totalRequests: 0,
  blockedRequests: 0,
  warnedRequests: 0,
  riskLevel: 'low' as const,
  threatsByType: {},
  recentEvents: [],
};

const Dashboard: React.FC = () => {
  const { data: stats, isLoading, isError, refetch } = useStats();

  const displayStats = stats ?? mockStats;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  const blockRate = displayStats.totalRequests > 0
    ? ((displayStats.blockedRequests / displayStats.totalRequests) * 100).toFixed(1)
    : '0';

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Security Dashboard</Title>
        </Col>
        <Col>
          <Space>
            <Text type="secondary">Last updated: {new Date().toLocaleTimeString('ko-KR')}</Text>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      {isError && (
        <Card style={{ marginBottom: 16, borderColor: '#faad14' }}>
          <Typography.Text type="warning">
            API unavailable. Showing default data.
          </Typography.Text>
        </Card>
      )}

      <StatsCards
        totalRequests={displayStats.totalRequests}
        blockedRequests={displayStats.blockedRequests}
        warnedRequests={displayStats.warnedRequests}
        riskLevel={displayStats.riskLevel}
      />

      {/* Timeline Chart - Full Width */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <ThreatTimeline refreshInterval={30000} />
        </Col>
      </Row>

      {/* Distribution Charts */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title="Threat Distribution by Type"
            extra={
              <Space>
                <Statistic
                  title="Block Rate"
                  value={blockRate}
                  suffix="%"
                  valueStyle={{
                    fontSize: 16,
                    color: parseFloat(blockRate) > 10 ? '#ff4d4f' : '#52c41a',
                  }}
                />
              </Space>
            }
          >
            <ThreatChart threatsByType={displayStats.threatsByType} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <RiskDistribution />
        </Col>
      </Row>

      {/* Recent Events */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title="Recent Threat Events"
            extra={
              <Button type="link" href="#/threats">
                View All <FullscreenOutlined />
              </Button>
            }
          >
            <EventsTable
              events={displayStats.recentEvents}
              pageSize={5}
              showActions={true}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
