import { useState } from 'react';
import {
  Typography,
  Card,
  Table,
  Tag,
  Switch,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  usePolicies,
  useCreatePolicy,
  useUpdatePolicy,
  useDeletePolicy,
  useTogglePolicy,
  type PolicyRule,
} from '../api/client';

const { Title } = Typography;

const severityColor: Record<string, string> = {
  low: 'green',
  medium: 'orange',
  high: 'red',
  critical: '#ff0000',
};

const categoryOptions = [
  { value: 'direct_injection', label: 'Direct Injection' },
  { value: 'indirect_injection', label: 'Indirect Injection' },
  { value: 'jailbreak', label: 'Jailbreak' },
  { value: 'data_exfiltration', label: 'Data Exfiltration' },
  { value: 'pii_leak', label: 'PII Leak' },
  { value: 'tool_abuse', label: 'Tool Abuse' },
];

const severityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const actionOptions = [
  { value: 'block', label: 'Block' },
  { value: 'warn', label: 'Warn' },
  { value: 'allow', label: 'Allow' },
];

const Policies: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PolicyRule | null>(null);
  const [form] = Form.useForm();

  const { data: policies, isLoading } = usePolicies();
  const createPolicy = useCreatePolicy();
  const updatePolicy = useUpdatePolicy();
  const deletePolicy = useDeletePolicy();
  const togglePolicy = useTogglePolicy();

  const rules = policies?.rules ?? [];

  const openCreate = () => {
    setEditingRule(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (rule: PolicyRule) => {
    setEditingRule(rule);
    form.setFieldsValue({
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      action: rule.action,
      priority: rule.priority,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingRule) {
      await updatePolicy.mutateAsync({ id: editingRule.id, updates: values });
    } else {
      await createPolicy.mutateAsync({
        ...values,
        isActive: true,
        patterns: [],
      });
    }
    setModalOpen(false);
  };

  const columns: ColumnsType<PolicyRule> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 150,
      render: (cat: string) => <Tag color="blue">{cat}</Tag>,
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (sev: string) => (
        <Tag color={severityColor[sev] ?? 'default'}>{sev.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 80,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (active: boolean, record: PolicyRule) => (
        <Switch
          checked={active}
          size="small"
          onChange={(checked) =>
            togglePolicy.mutate({ id: record.id, isActive: checked })
          }
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: PolicyRule) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Delete this rule?"
            onConfirm={() => deletePolicy.mutate(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>Policy Rules</Title>

      <Card
        title={`Rules (${rules.length})`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Rule
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={rules}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          size="small"
        />
      </Card>

      <Modal
        title={editingRule ? 'Edit Rule' : 'Create Rule'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createPolicy.isPending || updatePolicy.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item name="severity" label="Severity" rules={[{ required: true }]}>
            <Select options={severityOptions} />
          </Form.Item>
          <Form.Item name="action" label="Action" rules={[{ required: true }]}>
            <Select options={actionOptions} />
          </Form.Item>
          <Form.Item name="priority" label="Priority" initialValue={100}>
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Policies;
