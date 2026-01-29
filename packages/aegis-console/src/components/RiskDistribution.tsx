import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, Segmented } from 'antd';
import { useState } from 'react';

interface RiskData {
  category: string;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

interface RiskDistributionProps {
  data?: RiskData[];
}

const defaultData: RiskData[] = [
  { category: 'Direct Injection', low: 5, medium: 12, high: 8, critical: 3 },
  { category: 'Indirect Injection', low: 8, medium: 15, high: 5, critical: 1 },
  { category: 'Jailbreak', low: 2, medium: 6, high: 10, critical: 5 },
  { category: 'Data Exfiltration', low: 10, medium: 8, high: 3, critical: 1 },
  { category: 'PII Leak', low: 15, medium: 20, high: 8, critical: 2 },
  { category: 'Tool Abuse', low: 3, medium: 5, high: 2, critical: 0 },
];

const RiskDistribution: React.FC<RiskDistributionProps> = ({ data = defaultData }) => {
  const [chartType, setChartType] = useState<'bar' | 'heatmap'>('bar');

  const barOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      data: ['Low', 'Medium', 'High', 'Critical'],
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
      data: data.map((d) => d.category),
      axisLabel: {
        color: '#888',
        rotate: 30,
        interval: 0,
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
        name: 'Low',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#52c41a' },
        data: data.map((d) => d.low),
      },
      {
        name: 'Medium',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#faad14' },
        data: data.map((d) => d.medium),
      },
      {
        name: 'High',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#ff7a45' },
        data: data.map((d) => d.high),
      },
      {
        name: 'Critical',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#ff4d4f' },
        data: data.map((d) => d.critical),
      },
    ],
  };

  const heatmapData: [number, number, number][] = [];
  const levels = ['Low', 'Medium', 'High', 'Critical'];

  data.forEach((row, rowIndex) => {
    heatmapData.push([rowIndex, 0, row.low]);
    heatmapData.push([rowIndex, 1, row.medium]);
    heatmapData.push([rowIndex, 2, row.high]);
    heatmapData.push([rowIndex, 3, row.critical]);
  });

  const heatmapOption: EChartsOption = {
    tooltip: {
      position: 'top',
      formatter: (params: unknown) => {
        const p = params as { data: [number, number, number] };
        const category = data[p.data[0]].category;
        const level = levels[p.data[1]];
        return `${category}<br/>${level}: ${p.data[2]}`;
      },
    },
    grid: {
      left: '15%',
      right: '10%',
      bottom: '15%',
      top: '5%',
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.category),
      splitArea: { show: true },
      axisLabel: {
        color: '#888',
        rotate: 30,
        interval: 0,
      },
    },
    yAxis: {
      type: 'category',
      data: levels,
      splitArea: { show: true },
      axisLabel: { color: '#888' },
    },
    visualMap: {
      min: 0,
      max: Math.max(...data.flatMap((d) => [d.low, d.medium, d.high, d.critical])),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      inRange: {
        color: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'],
      },
      textStyle: { color: '#888' },
    },
    series: [
      {
        name: 'Risk',
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          color: '#fff',
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };

  return (
    <Card
      title="Risk Distribution by Category"
      extra={
        <Segmented
          size="small"
          value={chartType}
          onChange={(v) => setChartType(v as 'bar' | 'heatmap')}
          options={[
            { label: 'Bar', value: 'bar' },
            { label: 'Heatmap', value: 'heatmap' },
          ]}
        />
      }
    >
      <ReactECharts
        option={chartType === 'bar' ? barOption : heatmapOption}
        style={{ height: 300 }}
      />
    </Card>
  );
};

export default RiskDistribution;
