"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Download, FileText, Search, Calendar, User, Trash2, Eye, Filter, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { apiService } from "@/lib/api-service"

interface AIReport {
  id: number
  title: string
  brand_name?: string
  report_type: string
  content: string
  metadata: any
  created_at: string
  updated_at: string
  file_size: number
  word_count: number
  preview: string
}

export default function AIReportsPage() {
  const [reports, setReports] = useState<AIReport[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedType, setSelectedType] = useState("all")
  const [selectedReport, setSelectedReport] = useState<AIReport | null>(null)
  const [brands, setBrands] = useState<string[]>([])

  // Fetch reports from backend
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true)
        
        // Build query parameters
        const params = new URLSearchParams()
        if (selectedBrand) params.append('brand', selectedBrand)
        if (selectedType) params.append('type', selectedType)
        
        const response = await fetch(`http://localhost:5000/api/ai-reports?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          setReports(data.reports || [])
          
          // Extract unique brands for filter
          const uniqueBrands = [...new Set(data.reports?.map((r: AIReport) => r.brand_name).filter(Boolean))]
          setBrands(uniqueBrands)
        }
      } catch (error) {
        console.error('Error fetching reports:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchReports()
  }, [selectedBrand, selectedType])

  // Filter reports based on search query, brand, and type
  const filteredReports = reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.brand_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.content.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesBrand = selectedBrand === 'all' || report.brand_name === selectedBrand
    const matchesType = selectedType === 'all' || report.report_type === selectedType
    
    return matchesSearch && matchesBrand && matchesType
  })

  // Download PDF
  const downloadPDF = async (reportId: number, title: string) => {
    try {
      const response = await fetch(`http://localhost:5000/api/ai-reports/${reportId}/pdf`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Failed to download PDF')
      }
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Error downloading PDF')
    }
  }

  // Delete report
  const deleteReport = async (reportId: number) => {
    if (!confirm('Are you sure you want to delete this report?')) return
    
    try {
      const response = await fetch(`http://localhost:5000/api/ai-reports/${reportId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        setReports(reports.filter(r => r.id !== reportId))
      } else {
        alert('Failed to delete report')
      }
    } catch (error) {
      console.error('Error deleting report:', error)
      alert('Error deleting report')
    }
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Loading AI reports...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-6">
            <Link href="/">
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">AI Reports</h1>
              <p className="text-gray-600 dark:text-gray-400">Generated reports and analysis documents</p>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(brand => (
                  <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="brand_analysis">Brand Analysis</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="sizing_report">Sizing Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Reports Grid */}
        {filteredReports.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-2">
              No reports found
            </h3>
            <p className="text-gray-500 dark:text-gray-500">
              {searchQuery || selectedBrand || selectedType 
                ? 'Try adjusting your search filters'
                : 'No AI reports have been generated yet'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredReports.map((report) => (
              <Card key={report.id} className="border border-gray-200 dark:border-zinc-800 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg font-semibold text-foreground truncate mb-2">
                        {report.title}
                      </CardTitle>
                      <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        {report.brand_name && (
                          <Badge variant="secondary" className="text-xs">
                            {report.brand_name}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {report.report_type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
                    {report.preview}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500 mb-4">
                    <div className="flex items-center space-x-4">
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {formatDate(report.created_at)}
                      </span>
                      <span>{report.word_count} words</span>
                      <span>{formatFileSize(report.file_size)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedReport(report)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{report.title}</DialogTitle>
                        </DialogHeader>
                        <div className="mt-4">
                          <div className="prose max-w-none">
                            <pre className="whitespace-pre-wrap text-sm">{report.content}</pre>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => downloadPDF(report.id, report.title)}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      PDF
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => deleteReport(report.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border border-gray-200 dark:border-zinc-800">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {reports.length}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Total Reports</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 dark:border-zinc-800">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {brands.length}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Brands Covered</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 dark:border-zinc-800">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {reports.reduce((sum, r) => sum + r.word_count, 0).toLocaleString()}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Total Words</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
