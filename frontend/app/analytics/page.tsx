"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Trophy, Star, TrendingUp, Loader2, Search } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { apiService } from "@/lib/api-service"

interface BrandMetric {
  brand: string
  logo?: string
  sizing_accuracy_score: number
  fit_satisfaction_rate: number
  total_reviews: number
  sizing_reviews: number
}

export default function AnalyticsPage() {
  const [brandMetrics, setBrandMetrics] = useState<BrandMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debugInfo, setDebugInfo] = useState<string[]>([])

  // Fetch brand metrics from backend
  useEffect(() => {
    const fetchBrandMetrics = async () => {
      try {
        setLoading(true)
        setDebugInfo(['Starting to fetch brand metrics...'])
        console.log('Fetching brand metrics...')
        
        // First get all brands using apiService
        const brands = await apiService.getBrands()
        console.log('Fetched brands:', brands.length)
        console.log('Brands data:', brands)
        setDebugInfo(prev => [...prev, `Fetched ${brands.length} brands from API`])
        
        // Then fetch sizing metrics for each brand
        const metricsPromises = brands.map(async (brand: any) => {
          try {
            console.log(`Fetching metrics for ${brand.brand}...`)
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/brands/${encodeURIComponent(brand.brand)}/sizing-intelligence-complete`)
            if (response.ok) {
              const data = await response.json()
              console.log(`Metrics for ${brand.brand}:`, {
                accuracy: data.phase1?.sizing_accuracy_score,
                satisfaction: data.phase1?.satisfaction_indicators?.fit_satisfaction_rate,
                sizing_reviews: data.phase1?.sizing_intelligence?.total_sizing_mentions
              })
              return {
                brand: brand.brand,
                logo: brand.logo,
                sizing_accuracy_score: data.phase1?.sizing_accuracy_score || 0,
                fit_satisfaction_rate: data.phase1?.satisfaction_indicators?.fit_satisfaction_rate || 0,
                total_reviews: data.total_reviews_analyzed || 0,
                sizing_reviews: data.phase1?.sizing_intelligence?.total_sizing_mentions || 0
              }
            } else {
              console.log(`Failed to fetch metrics for ${brand.brand}:`, response.status)
            }
          } catch (error) {
            console.error(`Error fetching metrics for ${brand.brand}:`, error)
          }
          return null
        })
        
        const results = await Promise.all(metricsPromises)
        const validMetrics = results.filter(metric => metric !== null && metric.sizing_reviews > 0)
        
        console.log('Valid metrics found:', validMetrics.length)
        setDebugInfo(prev => [...prev, `Found ${validMetrics.length} brands with sizing data`])
        setBrandMetrics(validMetrics)
      } catch (error) {
        console.error('Error fetching brand metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBrandMetrics()
  }, [])

  // Filter brands based on search
  const filteredMetrics = brandMetrics.filter(metric =>
    metric.brand.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Sort by sizing accuracy (descending)
  const accuracyRankings = [...filteredMetrics].sort((a, b) => b.sizing_accuracy_score - a.sizing_accuracy_score)

  // Sort by satisfaction rate (descending)
  const satisfactionRankings = [...filteredMetrics].sort((a, b) => b.fit_satisfaction_rate - a.fit_satisfaction_rate)

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />
    if (index === 1) return <Trophy className="w-5 h-5 text-gray-400" />
    if (index === 2) return <Trophy className="w-5 h-5 text-amber-600" />
    return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-gray-500">{index + 1}</span>
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Loading analytics data...</p>
            <p className="text-sm text-gray-400 mt-2">This may take a moment to fetch sizing metrics for all brands</p>
          </div>
        </div>
      </div>
    )
  }

  if (brandMetrics.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400 text-lg mb-4">
              No sizing data available
            </div>
            <div className="text-gray-400 dark:text-gray-500 text-sm mb-6">
              Make sure brands have been analyzed and contain sizing reviews
            </div>
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
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
          <div className="flex items-center space-x-4 mb-4">
            <Link href="/">
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Brand Analytics</h1>
              <p className="text-gray-600 dark:text-gray-400">Compare brand performance across sizing metrics</p>
            </div>
          </div>

          {/* Search */}
          <div className="max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search brands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-foreground placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Sizing Accuracy Leaderboard */}
          <Card className="border border-gray-200 dark:border-zinc-800 shadow-lg">
            <CardHeader className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <span>Sizing Accuracy Leaderboard</span>
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ranked by sizing accuracy score (0-100)
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-200 dark:divide-zinc-800">
                {accuracyRankings.map((brand, index) => (
                  <div key={brand.brand} className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {getRankIcon(index)}
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-gray-200">
                          <BrandLogo
                            src={brand.logo || "/placeholder-logo.png"}
                            alt={`${brand.brand} logo`}
                            maxWidth={48}
                            maxHeight={48}
                            brandName={brand.brand}
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-foreground truncate">
                          {brand.brand}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {brand.sizing_reviews.toLocaleString()} sizing reviews
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className={`text-2xl font-bold ${getScoreColor(brand.sizing_accuracy_score)}`}>
                          {brand.sizing_accuracy_score}%
                        </div>
                        <div className="text-xs text-gray-500">
                          accuracy
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Customer Satisfaction Rankings */}
          <Card className="border border-gray-200 dark:border-zinc-800 shadow-lg">
            <CardHeader className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
              <CardTitle className="flex items-center space-x-2">
                <Star className="w-5 h-5 text-green-600" />
                <span>Customer Satisfaction Rankings</span>
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ranked by fit satisfaction rate (0-100%)
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-200 dark:divide-zinc-800">
                {satisfactionRankings.map((brand, index) => (
                  <div key={brand.brand} className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {getRankIcon(index)}
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-gray-200">
                          <BrandLogo
                            src={brand.logo || "/placeholder-logo.png"}
                            alt={`${brand.brand} logo`}
                            maxWidth={48}
                            maxHeight={48}
                            brandName={brand.brand}
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-foreground truncate">
                          {brand.brand}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {brand.sizing_reviews.toLocaleString()} sizing reviews
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className={`text-2xl font-bold ${getScoreColor(brand.fit_satisfaction_rate)}`}>
                          {brand.fit_satisfaction_rate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          satisfaction
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Debug Info */}
        {debugInfo.length > 0 && (
          <div className="mt-8">
            <Card className="border border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="text-yellow-800">Debug Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {debugInfo.map((info, index) => (
                    <div key={index} className="text-sm text-yellow-700">{info}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border border-gray-200 dark:border-zinc-800">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {brandMetrics.length}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Brands Analyzed</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 dark:border-zinc-800">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {brandMetrics.length > 0 ? Math.round(brandMetrics.reduce((sum, brand) => sum + brand.sizing_accuracy_score, 0) / brandMetrics.length) : 0}%
              </div>
              <div className="text-gray-600 dark:text-gray-400">Average Accuracy</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 dark:border-zinc-800">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {brandMetrics.length > 0 ? Math.round(brandMetrics.reduce((sum, brand) => sum + brand.fit_satisfaction_rate, 0) / brandMetrics.length) : 0}%
              </div>
              <div className="text-gray-600 dark:text-gray-400">Average Satisfaction</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
