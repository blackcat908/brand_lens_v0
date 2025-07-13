"use client"

import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Separator } from "./ui/separator"
import { Download, FileText, Table } from "lucide-react"
import {
  exportReviewsAsCSV,
  exportReviewsAsExcel,
  exportReviewsAsPDF,
  exportBrandReportAsPDF,
  type ReviewData,
  type BrandData,
} from "@/lib/export-utils"

interface ExportControlsProps {
  reviews: ReviewData[]
  brandData: BrandData
}

export function ExportControls({ reviews, brandData }: ExportControlsProps) {
  const handleTableExport = (format: "csv" | "excel" | "pdf") => {
    switch (format) {
      case "csv":
        exportReviewsAsCSV(reviews, brandData.name)
        break
      case "excel":
        exportReviewsAsExcel(reviews, brandData.name)
        break
      case "pdf":
        exportReviewsAsPDF(reviews, brandData.name)
        break
    }
  }

  const handleBrandReportExport = () => {
    exportBrandReportAsPDF(brandData)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Download className="w-5 h-5" />
          <span>Export Data</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Review Table Exports */}
        <div>
          <div className="flex items-center space-x-2 mb-3">
            <Table className="w-4 h-4 text-gray-600" />
            <h3 className="font-medium text-gray-900">Review Details Table</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">Export the review details table in your preferred format</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTableExport("csv")}
              className="flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTableExport("excel")}
              className="flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Excel</span>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Complete Brand Report */}
        <div>
          <div className="flex items-center space-x-2 mb-3">
            <FileText className="w-4 h-4 text-gray-600" />
            <h3 className="font-medium text-gray-900">Complete Brand Report</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Export a comprehensive PDF report including all metrics, trends, and review details
          </p>
          <Button onClick={handleBrandReportExport} className="flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>Download Complete Report (PDF)</span>
          </Button>
        </div>

        <div className="bg-blue-50 p-3 rounded-md">
          <p className="text-xs text-blue-700">
            <strong>Complete Report includes:</strong> Key metrics, sentiment trends, keyword analysis, and detailed
            review table
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
