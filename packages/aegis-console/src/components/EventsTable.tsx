import { useState } from 'react';
import { Table, Tag, Modal, Descriptions, Button, Space, Typography } from 'antd';
import { EyeOutlined, CopyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

export interface ThreatEvent {
  id: string;
  timestamp: string;
  requestId?: string;
  threatType: string;
  severity: string;
  details: string;
  matchedRules?: string[];
  sourceIp?: string;
  sessionId?: string;
}

interface EventsTableProps {
  events: ThreatEvent[];
  loading?: boolean;
  pageSize?: number;
  showActions?: boolean;
}

const severityColor: Record<string, string> = {
  low: 'green',
  medium: 'orange',
  high: 'red',
  critical: '#ff0000',
};

const threatTypeLabel: Record<string, string> = {
  direct_injection: 'Direct Injection',
  indirect_injection: 'Indirect Injection',
  jailbreak: 'Jailbreak',
  data_exfiltration: 'Data Exfiltration',
  pii_leak: 'PII Leak',
  tool_abuse: 'Tool Abuse',
  hidden_directive: 'Hidden Directive',
  invisible_characters: 'Invisible Chars',
  encoding_attack: 'Encoding Attack',
  prompt_injection: 'Prompt Injection',
};

const EventsTable: React.FC<EventsTableProps> = ({
  events,
  loading,
  pageSize = 10,
  showActions = true,
}) => {
  const [selectedEvent, setSelectedEvent] = useState<ThreatEvent | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleView = (event: ThreatEvent) => {
    setSelectedEvent(event);
    setModalVisible(true);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const columns: ColumnsType<ThreatEvent> = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      sorter: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      defaultSortOrder: 'descend',
      render: (ts: string) => new Date(ts).toLocaleString('ko-KR'),
    },
    {
      title: 'Type',
      dataIndex: 'threatType',
      key: 'threatType',
      width: 140,
      filters: Object.entries(threatTypeLabel).map(([value, text]) => ({ text, value })),
      onFilter: (value, record) => record.threatType === value,
      render: (type: string) => (
        <Tag color="blue">{threatTypeLabel[type] ?? type}</Tag>
      ),
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      filters: [
        { text: 'Low', value: 'low' },
        { text: 'Medium', value: 'medium' },
        { text: 'High', value: 'high' },
        { text: 'Critical', value: 'critical' },
      ],
      onFilter: (value, record) => record.severity === value,
      render: (sev: string) => (
        <Tag color={severityColor[sev] ?? 'default'}>{sev.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
    },
  ];

  if (showActions) {
    columns.push({
      title: 'Action',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleView(record)}
        >
          View
        </Button>
      ),
    });
  }

  return (
    <>
      <Table
        columns={columns}
        dataSource={events}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} events`,
        }}
        size="small"
      />

      <Modal
        title="Threat Event Details"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {selectedEvent && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Event ID">
              <Space>
                <Text code>{selectedEvent.id}</Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(selectedEvent.id)}
                />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Timestamp">
              {new Date(selectedEvent.timestamp).toLocaleString('ko-KR')}
            </Descriptions.Item>
            {selectedEvent.requestId && (
              <Descriptions.Item label="Request ID">
                <Text code>{selectedEvent.requestId}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Threat Type">
              <Tag color="blue">
                {threatTypeLabel[selectedEvent.threatType] ?? selectedEvent.threatType}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Severity">
              <Tag color={severityColor[selectedEvent.severity] ?? 'default'}>
                {selectedEvent.severity.toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Details">
              <Text>{selectedEvent.details}</Text>
            </Descriptions.Item>
            {selectedEvent.matchedRules && selectedEvent.matchedRules.length > 0 && (
              <Descriptions.Item label="Matched Rules">
                <Space wrap>
                  {selectedEvent.matchedRules.map((rule, idx) => (
                    <Tag key={idx} color="purple">{rule}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            {selectedEvent.sourceIp && (
              <Descriptions.Item label="Source IP">
                {selectedEvent.sourceIp}
              </Descriptions.Item>
            )}
            {selectedEvent.sessionId && (
              <Descriptions.Item label="Session ID">
                <Text code>{selectedEvent.sessionId}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </>
  );
};

export default EventsTable;
