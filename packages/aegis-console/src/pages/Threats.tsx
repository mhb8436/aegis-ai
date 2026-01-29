import { useState } from 'react';
import { Typography, Card, Select, DatePicker, Space, Row, Col } from 'antd';
import EventsTable from '../components/EventsTable';
import { useStats } from '../api/client';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const threatTypeOptions = [
  { value: '', label: 'All Types' },
  { value: 'direct_injection', label: 'Direct Injection' },
  { value: 'indirect_injection', label: 'Indirect Injection' },
  { value: 'jailbreak', label: 'Jailbreak' },
  { value: 'data_exfiltration', label: 'Data Exfiltration' },
  { value: 'pii_leak', label: 'PII Leak' },
  { value: 'tool_abuse', label: 'Tool Abuse' },
];

const severityOptions = [
  { value: '', label: 'All Severity' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const Threats: React.FC = () => {
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const { data: stats, isLoading } = useStats();

  const events = stats?.recentEvents ?? [];

  const filteredEvents = events.filter((e) => {
    if (typeFilter && e.threatType !== typeFilter) return false;
    if (severityFilter && e.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div>
      <Title level={3}>Threat Events</Title>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col>
            <Space>
              <Select
                style={{ width: 180 }}
                placeholder="Threat Type"
                options={threatTypeOptions}
                value={typeFilter}
                onChange={setTypeFilter}
              />
              <Select
                style={{ width: 140 }}
                placeholder="Severity"
                options={severityOptions}
                value={severityFilter}
                onChange={setSeverityFilter}
              />
              <RangePicker />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card title={`Threat Events (${filteredEvents.length})`}>
        <EventsTable events={filteredEvents} loading={isLoading} />
      </Card>
    </div>
  );
};

export default Threats;
