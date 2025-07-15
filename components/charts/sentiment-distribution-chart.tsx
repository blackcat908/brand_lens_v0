"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { Button } from "@/components/ui/button"
import { FileImage, FileSpreadsheet } from "lucide-react"
import { downloadChartAsImage, downloadSentimentDistributionCSV } from "@/lib/chart-export-utils"

interface SentimentDistributionChartProps {
  isOpen: boolean
  onClose: () => void
  positiveCount: number
  negativeCount: number
  neutralCount?: number
  brandName: string
}

export function SentimentDistributionChart({
  isOpen,
  onClose,
  positiveCount,
  negativeCount,
  neutralCount = 0,
  brandName,
}: SentimentDistributionChartProps) {
  const total = positiveCount + negativeCount + neutralCount

  const data = [
    {
      name: "Positive",
      value: positiveCount,
      percentage: ((positiveCount / total) * 100).toFixed(1),
      color: "#22c55e",
    },
    {
      name: "Negative",
      value: negativeCount,
      percentage: ((negativeCount / total) * 100).toFixed(1),
      color: "#ef4444",
    },
    {
      name: "Neutral",
      value: neutralCount,
      percentage: ((neutralCount / total) * 100).toFixed(1),
      color: "#f59e0b",
    },
  ].filter((item) => item.value > 0)

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-gray-600">
            {data.value} reviews ({data.percentage}%)
          </p>
        </div>
      )
    }
    return null
  }

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percentage }: any) => {
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${percentage}%`}
      </text>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="truncate">{brandName} - Review Sentiment Distribution</DialogTitle>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="icon"
                className="w-7 h-7 p-0"
                onClick={() => downloadChartAsImage("sentiment-distribution", `${brandName}_sentiment_distribution`)}
                title="Download PNG"
              >
                <FileImage className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="w-7 h-7 p-0"
                onClick={() => downloadSentimentDistributionCSV(data, brandName)}
                title="Download CSV"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </Button>
              <span className="w-2" />
            </div>
          </div>
        </DialogHeader>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Positive vs Negative vs Neutral Reviews</CardTitle>
            <p className="text-xs text-gray-600">
              Distribution based on review ratings (≥4 stars = Positive, ≤2 stars = Negative, 3 stars = Neutral)
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]" data-chart-id="sentiment-distribution">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={CustomLabel}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4">
              {data.map((item) => (
                <div key={item.name} className="text-center">
                  <div className="w-4 h-4 rounded mx-auto mb-2" style={{ backgroundColor: item.color }} />
                  <p className="font-medium">{item.name}</p>
                  <p className="text-2xl font-bold">{item.value} <span className="text-base font-normal">reviews</span></p>
                  <p className="text-sm text-gray-600">{item.percentage}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
