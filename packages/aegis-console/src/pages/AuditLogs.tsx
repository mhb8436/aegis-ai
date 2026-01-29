import { useState } from 'react';
import {
  Typography,
  Card,
  Table,
  Tag,
  Input,
  DatePicker,
  Space,
  Button,
  Row,
  Col,
  Dropdown,
  Modal,
  Descriptions,
  message,
  Select,
} from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
  CopyOutlined,
  FileExcelOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { RangePickerProps } from 'antd/es/date-picker';
import { useAuditLogs, type AuditLog } from '../api/client';

type RangeValue = RangePickerProps['value'];

const { Title, Text } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

const actionColor: Record<string, string> = {
  allow: 'green',
  block: 'red',
  warn: 'orange',
};

const exportCsv = (logs: AuditLog[], filename: string) => {
  const header = 'timestamp,requestId,sessionId,sourceIp,message,finalAction,coreRiskScore,coreFindings,latencyMs\n';
  const rows = logs
    .map(
      (l) =>
        `"${l.timestamp}","${l.requestId}","${l.sessionId ?? ''}","${l.sourceIp ?? ''}","${l.message.replace(/"/g, '""')}","${l.finalAction}","${l.coreRiskScore ?? ''}","${(l.coreFindings ?? []).join(';')}","${l.coreLatencyMs ?? ''}"`,
    )
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  message.success(`Exported ${logs.length} logs to CSV`);
};

const exportJson = (logs: AuditLog[], filename: string) => {
  const exportData = {
    exportedAt: new Date().toISOString(),
    totalLogs: logs.length,
    logs: logs,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  message.success(`Exported ${logs.length} logs to JSON`);
};

const AuditLogs: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<RangeValue>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const { data, isLoading } = useAuditLogs({ limit: 500 });

  const logs = data?.logs ?? [];

  const filtered = logs.filter((l) => {
    // Text search
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const matches =
        l.message.toLowerCase().includes(searchLower) ||
        l.requestId.includes(searchText) ||
        (l.sessionId ?? '').includes(searchText);
      if (!matches) return false;
    }

    // Action filter
    if (actionFilter && l.finalAction !== actionFilter) {
      return false;
    }

    // Date range filter
    if (dateRange && dateRange[0] && dateRange[1]) {
      const logTime = new Date(l.timestamp).getTime();
      const start = dateRange[0].startOf('day').valueOf();
      const end = dateRange[1].endOf('day').valueOf();
      if (logTime < start || logTime > end) {
        return false;
      }
    }

    return true;
  });

  const handleView = (log: AuditLog) => {
    setSelectedLog(log);
    setModalVisible(true);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  const getFilename = (ext: string) => {
    const date = new Date().toISOString().slice(0, 10);
    return `audit-logs-${date}.${ext}`;
  };

  const exportMenuItems = [
    {
      key: 'csv',
      icon: <FileExcelOutlined />,
      label: 'Export as CSV',
      onClick: () => exportCsv(filtered, getFilename('csv')),
    },
    {
      key: 'json',
      icon: <FileTextOutlined />,
      label: 'Export as JSON',
      onClick: () => exportJson(filtered, getFilename('json')),
    },
  ];

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      sorter: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      defaultSortOrder: 'descend',
      render: (ts: string) => new Date(ts).toLocaleString('ko-KR'),
    },
    {
      title: 'Request ID',
      dataIndex: 'requestId',
      key: 'requestId',
      width: 120,
      ellipsis: true,
      render: (id: string) => <Text code>{id.slice(0, 8)}</Text>,
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: 'Action',
      dataIndex: 'finalAction',
      key: 'finalAction',
      width: 100,
      render: (action: string) => (
        <Tag color={actionColor[action] ?? 'default'}>{action.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Risk Score',
      dataIndex: 'coreRiskScore',
      key: 'coreRiskScore',
      width: 100,
      sorter: (a, b) => (a.coreRiskScore ?? 0) - (b.coreRiskScore ?? 0),
      render: (score?: number) =>
        score != null ? (
          <Text type={score > 0.7 ? 'danger' : score > 0.4 ? 'warning' : undefined}>
            {score.toFixed(2)}
          </Text>
        ) : (
          '-'
        ),
    },
    {
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
    },
  ];

  return (
    <div>
      <Title level={3}>Audit Logs</Title>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space wrap>
              <Search
                placeholder="Search by message, request ID..."
                style={{ width: 300 }}
                onSearch={setSearchText}
                onChange={(e) => !e.target.value && setSearchText('')}
                allowClear
              />
              <Select
                style={{ width: 120 }}
                placeholder="Action"
                allowClear
                value={actionFilter || undefined}
                onChange={(v) => setActionFilter(v ?? '')}
                options={[
                  { label: 'Allow', value: 'allow' },
                  { label: 'Block', value: 'block' },
                  { label: 'Warn', value: 'warn' },
                ]}
              />
              <RangePicker
                onChange={(dates) => setDateRange(dates)}
              />
            </Space>
          </Col>
          <Col>
            <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
              <Button icon={<DownloadOutlined />} disabled={filtered.length === 0}>
                Export ({filtered.length})
              </Button>
            </Dropdown>
          </Col>
        </Row>
      </Card>

      <Card title={`Logs (${filtered.length} of ${logs.length})`}>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
          }}
          size="small"
        />
      </Card>

      <Modal
        title="Audit Log Details"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {selectedLog && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Log ID">
              <Space>
                <Text code>{selectedLog.id}</Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(selectedLog.id)}
                />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Timestamp">
              {new Date(selectedLog.timestamp).toLocaleString('ko-KR')}
            </Descriptions.Item>
            <Descriptions.Item label="Request ID">
              <Space>
                <Text code>{selectedLog.requestId}</Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(selectedLog.requestId)}
                />
              </Space>
            </Descriptions.Item>
            {selectedLog.sessionId && (
              <Descriptions.Item label="Session ID">
                <Text code>{selectedLog.sessionId}</Text>
              </Descriptions.Item>
            )}
            {selectedLog.sourceIp && (
              <Descriptions.Item label="Source IP">
                {selectedLog.sourceIp}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Message">
              <Text>{selectedLog.message}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Final Action">
              <Tag color={actionColor[selectedLog.finalAction] ?? 'default'}>
                {selectedLog.finalAction.toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Risk Score">
              <Text
                type={
                  (selectedLog.coreRiskScore ?? 0) > 0.7
                    ? 'danger'
                    : (selectedLog.coreRiskScore ?? 0) > 0.4
                    ? 'warning'
                    : undefined
                }
              >
                {selectedLog.coreRiskScore?.toFixed(4) ?? '-'}
              </Text>
            </Descriptions.Item>
            {selectedLog.coreFindings && selectedLog.coreFindings.length > 0 && (
              <Descriptions.Item label="Findings">
                <Space wrap>
                  {selectedLog.coreFindings.map((f, idx) => (
                    <Tag key={idx} color="blue">{f}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            {selectedLog.coreLatencyMs != null && (
              <Descriptions.Item label="Latency">
                {selectedLog.coreLatencyMs}ms
              </Descriptions.Item>
            )}
            {selectedLog.blockReason && (
              <Descriptions.Item label="Block Reason">
                <Text type="danger">{selectedLog.blockReason}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default AuditLogs;
