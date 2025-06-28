"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from "recharts"
import { Button } from "@/components/ui/button"
import { FileImage, FileSpreadsheet } from "lucide-react"
import { downloadChartAsImage, downloadSentimentTrendCSV } from "@/lib/chart-export-utils"

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

export function SentimentTrendChart({ isOpen, onClose, data, brandName }: SentimentTrendChartProps) {
  const [timePeriod, setTimePeriod] = useState("6months")
  const [viewType, setViewType] = useState("count") // count or percentage

  // Filter data based on selected time period
  const getFilteredData = () => {
    const periodMap = {
      "3months": 3,
      "6months": 6,
      "12months": 12,
      all: data.length,
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

  const isPercentageView = viewType === "percentage"

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle>{brandName} - Review Sentiment Trends</DialogTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadChartAsImage("sentiment-trend", `${brandName}_sentiment_trend`)}
              >
                <FileImage className="w-4 h-4 mr-1" />
                PNG
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadSentimentTrendCSV(chartData, brandName, viewType)}
              >
                <FileSpreadsheet className="w-4 h-4 mr-1" />
                CSV
              </Button>
            </div>
          </div>
        </DialogHeader>
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Positive vs Negative Reviews Over Time</CardTitle>
                <p className="text-sm text-gray-600">Track how sentiment changes across different time periods</p>
              </div>
              <div className="flex space-x-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">View</label>
                  <Select value={viewType} onValueChange={setViewType}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">Count</SelectItem>
                      <SelectItem value="percentage">Percentage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Period</label>
                  <Select value={timePeriod} onValueChange={setTimePeriod}>
                    <SelectTrigger className="w-32">
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
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]" data-chart-id="sentiment-trend">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    label={{
                      value: isPercentageView ? "Percentage (%)" : "Number of Reviews",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip formatter={(value: any, name: string) => [isPercentageView ? `${value}%` : value, name]} />
                  <Legend />
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
            </div>

            {/* Summary Statistics */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {chartData.reduce((sum, item) => sum + item.positive, 0)}
                </div>
                <p className="text-sm text-green-700">Total Positive</p>
                <p className="text-xs text-green-600">
                  {chartData.length > 0
                    ? (
                        (chartData.reduce((sum, item) => sum + item.positive, 0) /
                          chartData.reduce((sum, item) => sum + item.total, 0)) *
                        100
                      ).toFixed(1)
                    : 0}
                  % of all reviews
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {chartData.reduce((sum, item) => sum + item.negative, 0)}
                </div>
                <p className="text-sm text-red-700">Total Negative</p>
                <p className="text-xs text-red-600">
                  {chartData.length > 0
                    ? (
                        (chartData.reduce((sum, item) => sum + item.negative, 0) /
                          chartData.reduce((sum, item) => sum + item.total, 0)) *
                        100
                      ).toFixed(1)
                    : 0}
                  % of all reviews
                </p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {chartData.reduce((sum, item) => sum + item.neutral, 0)}
                </div>
                <p className="text-sm text-yellow-700">Total Neutral</p>
                <p className="text-xs text-yellow-600">
                  {chartData.length > 0
                    ? (
                        (chartData.reduce((sum, item) => sum + item.neutral, 0) /
                          chartData.reduce((sum, item) => sum + item.total, 0)) *
                        100
                      ).toFixed(1)
                    : 0}
                  % of all reviews
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
