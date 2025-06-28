// Chart export utilities for downloading charts as images and data as files

export const downloadChartAsImage = async (chartId: string, filename: string, format: "png" | "jpeg" = "png") => {
  try {
    const chartElement = document.querySelector(`[data-chart-id="${chartId}"]`)
    if (!chartElement) {
      console.error("Chart element not found")
      return
    }

    const svg = chartElement.querySelector("svg")
    if (!svg) {
      console.error("SVG element not found in chart")
      return
    }

    // Clone the SVG to avoid modifying the original
    const svgClone = svg.cloneNode(true) as SVGElement

    // Set explicit dimensions if not present
    const rect = svg.getBoundingClientRect()
    svgClone.setAttribute("width", rect.width.toString())
    svgClone.setAttribute("height", rect.height.toString())

    // Create a canvas
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size with higher resolution for better quality
    const scale = 2
    canvas.width = rect.width * scale
    canvas.height = rect.height * scale
    ctx.scale(scale, scale)

    // Set white background
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svgClone)
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(svgBlob)

    // Create image and draw to canvas
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, rect.width, rect.height)

      // Download the image
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const link = document.createElement("a")
            link.download = `${filename}.${format}`
            link.href = URL.createObjectURL(blob)
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(link.href)
          }
        },
        `image/${format}`,
        0.95,
      )

      URL.revokeObjectURL(url)
    }

    img.onerror = () => {
      console.error("Failed to load SVG as image")
      URL.revokeObjectURL(url)
    }

    img.src = url
  } catch (error) {
    console.error("Error downloading chart as image:", error)
  }
}

export const downloadSentimentDistributionCSV = (
  data: Array<{ name: string; value: number; percentage: string }>,
  brandName: string,
) => {
  const csvContent = [
    ["Sentiment Type", "Review Count", "Percentage"].join(","),
    ...data.map((item) => [`"${item.name}"`, item.value.toString(), `"${item.percentage}%"`].join(",")),
  ].join("\n")

  downloadCSV(csvContent, `${brandName}_sentiment_distribution.csv`)
}

export const downloadSentimentTrendCSV = (
  data: Array<{
    month: string
    positive: number
    negative: number
    neutral: number
    total: number
    positivePercent: string
    negativePercent: string
    neutralPercent: string
  }>,
  brandName: string,
  viewType: "count" | "percentage",
) => {
  const headers = ["Month", "Positive", "Negative", "Neutral", "Total"]
  if (viewType === "percentage") {
    headers.push("Positive %", "Negative %", "Neutral %")
  }

  const csvContent = [
    headers.join(","),
    ...data.map((item) => {
      const row = [
        `"${item.month}"`,
        item.positive.toString(),
        item.negative.toString(),
        item.neutral.toString(),
        item.total.toString(),
      ]

      if (viewType === "percentage") {
        row.push(`"${item.positivePercent}%"`, `"${item.negativePercent}%"`, `"${item.neutralPercent}%"`)
      }

      return row.join(",")
    }),
  ].join("\n")

  downloadCSV(csvContent, `${brandName}_sentiment_trend_${viewType}.csv`)
}

const downloadCSV = (csvContent: string, filename: string) => {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}
