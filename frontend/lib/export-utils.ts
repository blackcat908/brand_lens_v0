import jsPDF from "jspdf"
import "jspdf-autotable"
import * as XLSX from "xlsx"

// Extend jsPDF type to include autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF
  }
}

export interface ReviewData {
  id: number
  customerName: string
  date: string
  rating: number
  review: string
  sentiment_label?: string // Add optional sentiment_label field
}

export interface BrandMetrics {
  totalSizingFitReviews: number
  avgRating: number
  positiveCount: number
  negativeCount: number
  sentimentScore: number
  monthlyTrend: number[]
}

export interface BrandData {
  name: string
  trustpilotUrl: string
  metrics: BrandMetrics
  reviews: ReviewData[]
  keywords: string[]
}

// Clean text for export (remove HTML tags)
function cleanText(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim()
}

// Export reviews table as CSV
export function exportReviewsAsCSV(reviews: ReviewData[], brandName: string) {
  const headers = ["Customer Name", "Date", "Rating", "Review"]
  const csvContent = [
    headers.join(","),
    ...reviews.map((review) =>
      [
        `"${review.customerName}"`,
        review.date,
        review.rating.toString(),
        `"${cleanText(review.review).replace(/"/g, '""')}"`,
      ].join(","),
    ),
  ].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${brandName}_reviews.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Export reviews table as Excel
export function exportReviewsAsExcel(reviews: ReviewData[], brandName: string) {
  const worksheet = XLSX.utils.json_to_sheet(
    reviews.map((review) => ({
      "Customer Name": review.customerName,
      Date: review.date,
      Rating: review.rating,
      Review: cleanText(review.review),
    })),
  )

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reviews")

  XLSX.writeFile(workbook, `${brandName}_reviews.xlsx`)
}

// Export reviews table as PDF
export function exportReviewsAsPDF(reviews: ReviewData[], brandName: string) {
  const doc = new jsPDF()

  // Title
  doc.setFontSize(16)
  doc.text(`${brandName} - Review Details`, 14, 22)

  // Subtitle
  doc.setFontSize(10)
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30)

  // Table
  const tableData = reviews.map((review) => [
    review.customerName,
    review.date,
    review.rating.toString(),
    cleanText(review.review),
  ])

  doc.autoTable({
    head: [["Customer Name", "Date", "Rating", "Review"]],
    body: tableData,
    startY: 35,
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 20 },
      2: { cellWidth: 15 },
      3: { cellWidth: "auto" },
    },
    margin: { top: 35 },
  })

  doc.save(`${brandName}_reviews.pdf`)
}

// Create a simple chart as base64 image for PDF
function createChartImage(data: number[], width = 200, height = 100): string {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!

  // Clear canvas
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)

  // Draw chart
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const barWidth = width / data.length

  ctx.fillStyle = "#3b82f6"
  data.forEach((value, index) => {
    const barHeight = ((value - min) / range) * (height - 20)
    const x = index * barWidth
    const y = height - barHeight - 10

    ctx.fillRect(x + 2, y, barWidth - 4, barHeight)
  })

  // Add labels
  ctx.fillStyle = "#374151"
  ctx.font = "10px Arial"
  ctx.textAlign = "center"

  data.forEach((value, index) => {
    const x = index * barWidth + barWidth / 2
    ctx.fillText(value.toFixed(2), x, height - 2)
  })

  return canvas.toDataURL("image/png")
}

// Export comprehensive brand report as PDF
export function exportBrandReportAsPDF(brandData: BrandData) {
  const doc = new jsPDF()
  let yPosition = 20

  // Title
  doc.setFontSize(20)
  doc.text(`${brandData.name} - Sizing & Fit Analysis Report`, 14, yPosition)
  yPosition += 15

  // Subtitle
  doc.setFontSize(12)
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, yPosition)
  yPosition += 10

  doc.setFontSize(10)
  doc.text(`Source: ${brandData.trustpilotUrl}`, 14, yPosition)
  yPosition += 20

  // Metrics Section
  doc.setFontSize(14)
  doc.text("Key Metrics", 14, yPosition)
  yPosition += 10

  const metrics = [
    ["Total Sizing & Fit Reviews", brandData.metrics.totalSizingFitReviews.toString()],
    ["Average Rating", brandData.metrics.avgRating.toString()],
    ["Positive Reviews", brandData.metrics.positiveCount.toString()],
    ["Negative Reviews", brandData.metrics.negativeCount.toString()],
    ["Sentiment Score", brandData.metrics.sentimentScore.toString()],
  ]

  doc.autoTable({
    body: metrics,
    startY: yPosition,
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { cellWidth: 40 },
    },
    theme: "grid",
  })

  yPosition = (doc as any).lastAutoTable.finalY + 20

  // Monthly Trend Chart
  doc.setFontSize(14)
  doc.text("Monthly Sentiment Trend", 14, yPosition)
  yPosition += 10

  try {
    const chartImage = createChartImage(brandData.metrics.monthlyTrend, 160, 80)
    doc.addImage(chartImage, "PNG", 14, yPosition, 160, 80)
    yPosition += 90
  } catch (error) {
    doc.setFontSize(10)
    doc.text("Chart could not be generated", 14, yPosition)
    yPosition += 20
  }

  // Keywords Section
  doc.setFontSize(14)
  doc.text("Keywords Analyzed", 14, yPosition)
  yPosition += 10

  doc.setFontSize(10)
  const keywordsText = brandData.keywords.join(", ")
  const splitKeywords = doc.splitTextToSize(keywordsText, 180)
  doc.text(splitKeywords, 14, yPosition)
  yPosition += splitKeywords.length * 5 + 15

  // Add new page for reviews if needed
  if (yPosition > 250) {
    doc.addPage()
    yPosition = 20
  }

  // Reviews Section
  doc.setFontSize(14)
  doc.text("Review Details", 14, yPosition)
  yPosition += 10

  const reviewTableData = brandData.reviews.map((review) => [
    review.customerName,
    review.date,
    review.rating.toString(),
    cleanText(review.review),
  ])

  doc.autoTable({
    head: [["Customer", "Date", "Rating", "Review"]],
    body: reviewTableData,
    startY: yPosition,
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 20 },
      2: { cellWidth: 15 },
      3: { cellWidth: "auto" },
    },
  })

  doc.save(`${brandData.name}_complete_report.pdf`)
}

// Export AI report as PDF
export function exportAIReportAsPDF(reportContent: string, brandName: string, prompt: string) {
  const doc = new jsPDF()
  let yPosition = 20

  // Title
  doc.setFontSize(18)
  doc.text(`AI Report - ${brandName}`, 14, yPosition)
  yPosition += 15

  // Subtitle
  doc.setFontSize(10)
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, yPosition)
  yPosition += 10

  // Prompt section
  doc.setFontSize(12)
  doc.text("Analysis Prompt:", 14, yPosition)
  yPosition += 8
  
  doc.setFontSize(10)
  const promptLines = doc.splitTextToSize(prompt, 180)
  doc.text(promptLines, 14, yPosition)
  yPosition += promptLines.length * 5 + 15

  // Report content
  doc.setFontSize(12)
  doc.text("Report Content:", 14, yPosition)
  yPosition += 8

  // Split report content into lines and add to PDF
  const reportLines = reportContent.split('\n')
  doc.setFontSize(10)
  
  for (const line of reportLines) {
    if (yPosition > 270) {
      doc.addPage()
      yPosition = 20
    }
    
    if (line.startsWith('# ')) {
      // Main heading
      doc.setFontSize(14)
      doc.text(line.substring(2), 14, yPosition)
      yPosition += 10
    } else if (line.startsWith('## ')) {
      // Subheading
      doc.setFontSize(12)
      doc.text(line.substring(3), 14, yPosition)
      yPosition += 8
    } else if (line.startsWith('**') && line.endsWith('**')) {
      // Bold text
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text(line.substring(2, line.length - 2), 14, yPosition)
      yPosition += 5
    } else if (line.trim() === '') {
      // Empty line
      yPosition += 5
    } else {
      // Regular text
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      const textLines = doc.splitTextToSize(line, 180)
      doc.text(textLines, 14, yPosition)
      yPosition += textLines.length * 5
    }
  }

  doc.save(`${brandName}_ai_report.pdf`)
}

// Export AI report as Word document (using HTML format)
export function exportAIReportAsWord(reportContent: string, brandName: string, prompt: string) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>AI Report - ${brandName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        h3 { color: #666; }
        .prompt { background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007acc; margin: 20px 0; }
        .timestamp { color: #888; font-size: 12px; }
        ul, ol { margin-left: 20px; }
        li { margin-bottom: 5px; }
        strong { font-weight: bold; }
        hr { border: none; border-top: 1px solid #ddd; margin: 30px 0; }
      </style>
    </head>
    <body>
      <h1>AI Report - ${brandName}</h1>
      <p class="timestamp">Generated on ${new Date().toLocaleDateString()}</p>
      
      <h2>Analysis Prompt</h2>
      <div class="prompt">
        <strong>${prompt}</strong>
      </div>
      
      <h2>Report Content</h2>
      <div>${reportContent.replace(/\n/g, '<br>').replace(/# /g, '<h1>').replace(/## /g, '<h2>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
    </body>
    </html>
  `

  const blob = new Blob([htmlContent], { type: 'application/msword' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${brandName}_ai_report.doc`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}