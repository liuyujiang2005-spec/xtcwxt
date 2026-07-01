'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from 'recharts';

interface ChartData {
  month: string;
  revenueCNY: number;
  revenueTHB: number;
  profitCNY: number;
  profitTHB: number;
}

export default function DashboardCharts({ data }: { data: ChartData[] }) {
  const hasTHB = data.some((d) => d.revenueTHB > 0);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip
          formatter={(value: any) => `¥${(value as number).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
        />
        <Legend />
        <Bar dataKey="revenueCNY" fill="#3b82f6" name="营收 CNY" />
        <Line type="monotone" dataKey="profitCNY" stroke="#22c55e" name="利润 CNY" strokeWidth={2} />
        {hasTHB && (
          <>
            <Bar dataKey="revenueTHB" fill="#93c5fd" name="营收 THB" />
            <Line type="monotone" dataKey="profitTHB" stroke="#86efac" name="利润 THB" strokeWidth={2} strokeDasharray="5 5" />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
