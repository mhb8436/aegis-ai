import { useState } from 'react';
import { Typography, Card, Button, DatePicker, Space, Row, Col } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import StatsCards from '../components/StatsCards';
import ThreatChart from '../components/ThreatChart';
import { useGenerateReport, type DashboardStats } from '../api/client';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const emptyStats: DashboardStats = {
  totalRequests: 0,
  blockedRequests: 0,
  warnedRequests: 0,
  riskLevel: 'low',
  threatsByType: {},
  recentEvents: [],
};

const Reports: React.FC = () => {
  const [reportData, setReportData] = useState<DashboardStats | null>(null);
  const generateReport = useGenerateReport();

  const handleGenerate = async () => {
    const data = await generateReport.mutateAsync('daily');
    setReportData(data);
  };

  const display = reportData ?? emptyStats;
  const hasData = reportData !== null;

  return (
    <div>
      <Title level={3}>Reports</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <RangePicker />
          <Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={handleGenerate}
            loading={generateReport.isPending}
          >
            Generate Report
          </Button>
        </Space>
      </Card>

      {hasData && (
        <>
          <StatsCards
            totalRequests={display.totalRequests}
            blockedRequests={display.blockedRequests}
            warnedRequests={display.warnedRequests}
            riskLevel={display.riskLevel}
          />

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <Card title="Threat Distribution">
                <ThreatChart threatsByType={display.threatsByType} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Summary">
                <p>Total Requests: {display.totalRequests}</p>
                <p>Blocked: {display.blockedRequests}</p>
                <p>Warned: {display.warnedRequests}</p>
                <p>
                  Block Rate:{' '}
                  {display.totalRequests > 0
                    ? ((display.blockedRequests / display.totalRequests) * 100).toFixed(1)
                    : 0}
                  %
                </p>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {!hasData && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.45)' }}>
            Click "Generate Report" to view security statistics.
          </div>
        </Card>
      )}
    </div>
  );
};

export default Reports;
