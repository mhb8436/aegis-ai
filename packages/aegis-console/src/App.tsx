import { useState } from 'react';
import { ConfigProvider, Layout, Menu, Typography, theme } from 'antd';
import {
  DashboardOutlined,
  AlertOutlined,
  AuditOutlined,
  SafetyOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Threats from './pages/Threats';
import AuditLogs from './pages/AuditLogs';
import Policies from './pages/Policies';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/threats', icon: <AlertOutlined />, label: 'Threats' },
  { key: '/audit', icon: <AuditOutlined />, label: 'Audit Logs' },
  { key: '/policies', icon: <SafetyOutlined />, label: 'Policies' },
  { key: '/reports', icon: <BarChartOutlined />, label: 'Reports' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Title level={collapsed ? 5 : 4} style={{ color: '#fff', margin: 0 }}>
            {collapsed ? 'A' : 'Aegis'}
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', display: 'flex', alignItems: 'center' }}>
          <Title level={5} style={{ color: '#fff', margin: 0 }}>
            Security Console
          </Title>
        </Header>
        <Content style={{ padding: '24px', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/threats" element={<Threats />} />
            <Route path="/audit" element={<AuditLogs />} />
            <Route path="/policies" element={<Policies />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

const App: React.FC = () => (
  <ConfigProvider
    theme={{
      algorithm: theme.darkAlgorithm,
      token: {
        colorPrimary: '#1668dc',
      },
    }}
  >
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  </ConfigProvider>
);

export default App;
