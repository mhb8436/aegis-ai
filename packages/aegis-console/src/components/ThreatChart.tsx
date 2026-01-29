import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface ThreatChartProps {
  threatsByType: Record<string, number>;
}

const ThreatChart: React.FC<ThreatChartProps> = ({ threatsByType }) => {
  const data = Object.entries(threatsByType).map(([name, value]) => ({
    name,
    value,
  }));

  const option: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: {
      orient: 'vertical',
      left: 'left',
      textStyle: { color: '#ccc' },
    },
    series: [
      {
        name: 'Threat Type',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#141414',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' },
        },
        data:
          data.length > 0
            ? data
            : [{ name: 'No threats', value: 1, itemStyle: { color: '#333' } }],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 300 }} />;
};

export default ThreatChart;
