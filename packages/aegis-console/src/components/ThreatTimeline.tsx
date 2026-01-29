import { useState, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, Select, Space } from 'antd';

interface TimelineDataPoint {
  time: string;
  threats: number;
  blocked: number;
  allowed: number;
}

interface ThreatTimelineProps {
  data?: TimelineDataPoint[];
  refreshInterval?: number;
  onRefresh?: () => void;
}

const generateMockData = (points: number): TimelineDataPoint[] => {
  const data: TimelineDataPoint[] = [];
  const now = Date.now();

  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now - i * 60000);
    data.push({
      time: time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      threats: Math.floor(Math.random() * 20),
      blocked: Math.floor(Math.random() * 15),
      allowed: Math.floor(Math.random() * 50) + 10,
    });
  }

  return data;
};

const ThreatTimeline: React.FC<ThreatTimelineProps> = ({
  data: externalData,
  refreshInterval = 30000,
  onRefresh,
}) => {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('1h');
  const [data, setData] = useState<TimelineDataPoint[]>(() =>
    externalData ?? generateMockData(60),
  );

  const updateData = useCallback(() => {
    if (externalData) {
      setData(externalData);
    } else {
      // Add new point and remove oldest
      setData((prev) => {
        const newPoint: TimelineDataPoint = {
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          threats: Math.floor(Math.random() * 20),
          blocked: Math.floor(Math.random() * 15),
          allowed: Math.floor(Math.random() * 50) + 10,
        };
        return [...prev.slice(1), newPoint];
      });
    }
    onRefresh?.();
  }, [externalData, onRefresh]);

  useEffect(() => {
    const interval = setInterval(updateData, refreshInterval);
    return () => clearInterval(interval);
  }, [updateData, refreshInterval]);

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      data: ['Threats', 'Blocked', 'Allowed'],
      textStyle: { color: '#ccc' },
      top: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((d) => d.time),
      axisLabel: {
        color: '#888',
        rotate: 45,
        interval: Math.floor(data.length / 10),
      },
      axisLine: { lineStyle: { color: '#333' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#888' },
      axisLine: { lineStyle: { color: '#333' } },
      splitLine: { lineStyle: { color: '#222' } },
    },
    series: [
      {
        name: 'Threats',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        itemStyle: { color: '#ff4d4f' },
        data: data.map((d) => d.threats),
      },
      {
        name: 'Blocked',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        itemStyle: { color: '#faad14' },
        data: data.map((d) => d.blocked),
      },
      {
        name: 'Allowed',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.1 },
        itemStyle: { color: '#52c41a' },
        data: data.map((d) => d.allowed),
      },
    ],
  };

  return (
    <Card
      title="Threat Timeline"
      extra={
        <Space>
          <Select
            value={timeRange}
            onChange={setTimeRange}
            size="small"
            options={[
              { label: '1 Hour', value: '1h' },
              { label: '6 Hours', value: '6h' },
              { label: '24 Hours', value: '24h' },
            ]}
            style={{ width: 100 }}
          />
        </Space>
      }
    >
      <ReactECharts option={option} style={{ height: 300 }} />
    </Card>
  );
};

export default ThreatTimeline;
