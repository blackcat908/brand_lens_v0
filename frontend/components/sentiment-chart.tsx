import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface SentimentChartProps {
  data: number[]
  className?: string
}

export function SentimentChart({ data, className = "" }: SentimentChartProps) {
  if (!data.length) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const latest = data[data.length - 1]
  const previous = data[data.length - 2]
  const trend = latest > previous ? "up" : latest < previous ? "down" : "flat"

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus
  const trendColor = trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-gray-500"

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className="flex items-end space-x-1 h-8">
        {data.map((value, index) => (
          <div
            key={index}
            className="bg-blue-500 w-2 rounded-t transition-all hover:bg-blue-600"
            style={{
              height: `${Math.max(((value - min) / range) * 100, 10)}%`,
            }}
            title={`Month ${index + 1}: ${value.toFixed(2)}`}
          />
        ))}
      </div>
      <div className="flex items-center space-x-1">
        <TrendIcon className={`w-4 h-4 ${trendColor}`} />
        <span className={`text-sm font-medium ${trendColor}`}>
          {trend === "up" ? "+" : trend === "down" ? "-" : ""}
          {Math.abs(((latest - previous) / previous) * 100 || 0).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
