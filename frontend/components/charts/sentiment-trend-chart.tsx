"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts"
import { Button } from "../ui/button"
import { FileImage, FileSpreadsheet } from "lucide-react"
import { downloadChartAsImage, downloadSentimentTrendCSV, downloadElementAsImageFromRef } from "@/lib/chart-export-utils"

interface SentimentTrendChartProps {
  isOpen: boolean
  onClose: () => void
  data: Array<{
    month: string
    positive: number
    negative: number
    neutral: number
    total: number
  }>
  brandName: string
}

// Helper to aggregate data by year
function aggregateByYear(data: Array<{ month: string; positive: number; negative: number; neutral: number; total: number }>) {
  const yearMap: Record<string, { year: string; positive: number; negative: number; neutral: number; total: number }> = {};
  data.forEach(item => {
    // Assume month is in format '01 March' or '2023-03' or similar; extract year
    let year = '';
    if (/\d{4}/.test(item.month)) {
      // If month contains a 4-digit year, extract it
      const match = item.month.match(/\d{4}/);
      year = match ? match[0] : item.month;
    } else {
      // Fallback: use last word if it's a year
      const parts = item.month.split(' ');
      year = parts[parts.length - 1];
    }
    if (!yearMap[year]) {
      yearMap[year] = { year, positive: 0, negative: 0, neutral: 0, total: 0 };
    }
    yearMap[year].positive += item.positive;
    yearMap[year].negative += item.negative;
    yearMap[year].neutral += item.neutral;
    yearMap[year].total += item.total;
  });
  // Sort by year ascending
  return Object.values(yearMap).sort((a, b) => a.year.localeCompare(b.year));
}

export function SentimentTrendChart({ isOpen, onClose, data, brandName }: SentimentTrendChartProps) {
  const [timePeriod, setTimePeriod] = useState("6months")
  const [viewType, setViewType] = useState<'count' | 'percentage'>("count") // count or percentage
  const exportRef = useRef<HTMLDivElement>(null)

  // Filter data based on selected time period
  const getFilteredData = () => {
    const periodMap = {
      "3months": 3,
      "6months": 6,
      "12months": 12,
      all: data.length,
    }
    if (timePeriod === "all") {
      // Aggregate by year for all time
      return aggregateByYear(data).map(item => ({
        month: item.year, // x-axis will show year
        ...item,
      }))
    }
    const months = periodMap[timePeriod as keyof typeof periodMap]
    return data.slice(-months)
  }

  const chartData = getFilteredData().map((item) => ({
    ...item,
    positivePercent: item.total > 0 ? ((item.positive / item.total) * 100).toFixed(1) : "0",
    negativePercent: item.total > 0 ? ((item.negative / item.total) * 100).toFixed(1) : "0",
    neutralPercent: item.total > 0 ? ((item.neutral / item.total) * 100).toFixed(1) : "0",
  }))

  console.log('SentimentTrendChart chartData:', chartData)

  const isPercentageView = viewType === "percentage"

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <div ref={exportRef}>
          <Card>
            <DialogHeader>
              <DialogTitle className="sr-only">Review Sentiment Trends</DialogTitle>
              <div className="flex items-start justify-between w-full pt-3 pl-4">
                {/* Top left: Title and subtitle */}
                <div>
                  <CardTitle className="text-lg font-semibold">Positive vs Negative Reviews Over Time</CardTitle>
                  <p className="text-xs text-gray-600 mb-2">Track how sentiment changes across different time periods</p>
                </div>
                {/* Top right: PNG/CSV export buttons */}
                <div className="flex items-center space-x-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-7 h-7 p-0"
                    onClick={() => {
                      if (exportRef.current) {
                        downloadElementAsImageFromRef(exportRef.current, `${brandName}_sentiment_trend`);
                      }
                    }}
                    title="Download PNG"
                  >
                    <FileImage className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-7 h-7 p-0"
                    onClick={() => downloadSentimentTrendCSV(chartData, brandName, viewType)}
                    title="Download CSV"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </Button>
                  <span className="w-2" />
                </div>
              </div>
              {/* Filters row: right aligned, with right padding */}
              <div className="flex justify-end w-full mt-2 space-x-2 pr-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">View</label>
                  <Select value={viewType} onValueChange={v => setViewType(v as 'count' | 'percentage')}>
                    <SelectTrigger className="w-24 h-7 text-xs px-2 py-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">Count</SelectItem>
                      <SelectItem value="percentage">Percentage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Period</label>
                  <Select value={timePeriod} onValueChange={v => setTimePeriod(v as string)}>
                    <SelectTrigger className="w-24 h-7 text-xs px-2 py-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3months">Last 3 Months</SelectItem>
                      <SelectItem value="6months">Last 6 Months</SelectItem>
                      <SelectItem value="12months">Last 12 Months</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DialogHeader>
            <CardHeader>
              <div className="h-[300px]" data-chart-id="sentiment-trend">
                {chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-lg">No data available for this period.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        label={{
                          value: 'No. of Reviews',
                          angle: -90,
                          position: "insideLeft",
                          offset: 0,
                          style: { textAnchor: "middle", dominantBaseline: "middle" },
                        }}
                      />
                      <Tooltip formatter={(value: any, name: string) => [isPercentageView ? `${value}%` : value, name]} />
                      <Line
                        type="monotone"
                        dataKey={isPercentageView ? "positivePercent" : "positive"}
                        stroke="#22c55e"
                        strokeWidth={3}
                        dot={{ fill: "#22c55e", strokeWidth: 2, r: 4 }}
                        name="Positive Reviews"
                      />
                      <Line
                        type="monotone"
                        dataKey={isPercentageView ? "negativePercent" : "negative"}
                        stroke="#ef4444"
                        strokeWidth={3}
                        dot={{ fill: "#ef4444", strokeWidth: 2, r: 4 }}
                        name="Negative Reviews"
                      />
                      <Line
                        type="monotone"
                        dataKey={isPercentageView ? "neutralPercent" : "neutral"}
                        stroke="#f59e0b"
                        strokeWidth={3}
                        dot={{ fill: "#f59e0b", strokeWidth: 2, r: 4 }}
                        name="Neutral Reviews"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="text-center p-2 bg-green-50 rounded-lg">
                  <div className="text-xl font-bold text-green-600">
                    {chartData.reduce((sum, item) => sum + item.positive, 0)}
                  </div>
                  <p className="text-xs text-green-700">Total Positive</p>
                  <p className="text-xs text-green-600">
                    {chartData.length > 0
                      ? (
                          (chartData.reduce((sum, item) => sum + item.positive, 0) /
                            chartData.reduce((sum, item) => sum + item.total, 0)) *
                          100
                        ).toFixed(1)
                      : 0}
                    % of reviews in period
                  </p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-lg">
                  <div className="text-xl font-bold text-red-600">
                    {chartData.reduce((sum, item) => sum + item.negative, 0)}
                  </div>
                  <p className="text-xs text-red-700">Total Negative</p>
                  <p className="text-xs text-red-600">
                    {chartData.length > 0
                      ? (
                          (chartData.reduce((sum, item) => sum + item.negative, 0) /
                            chartData.reduce((sum, item) => sum + item.total, 0)) *
                          100
                        ).toFixed(1)
                      : 0}
                    % of reviews in period
                  </p>
                </div>
                <div className="text-center p-2 bg-yellow-50 rounded-lg">
                  <div className="text-xl font-bold text-yellow-600">
                    {chartData.reduce((sum, item) => sum + item.neutral, 0)}
                  </div>
                  <p className="text-xs text-yellow-700">Total Neutral</p>
                  <p className="text-xs text-yellow-600">
                    {chartData.length > 0
                      ? (
                          (chartData.reduce((sum, item) => sum + item.neutral, 0) /
                            chartData.reduce((sum, item) => sum + item.total, 0)) *
                          100
                        ).toFixed(1)
                      : 0}
                    % of reviews in period
                  </p>
                </div>
              </div>
              <div className="mt-2 mb-2 text-center text-xs text-gray-500">
                Showing {chartData.reduce((sum, item) => sum + item.total, 0)} reviews in this period.
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}