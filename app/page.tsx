"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Building2, TrendingUp, Star, Plus, Moon, Sun } from "lucide-react"
import { CreateBrandModal } from "@/components/create-brand-modal"
import { realBrandsList, getRatingColor, getLastScrapedDate } from "@/lib/real-brand-data"
import { getBrandReviews } from "@/lib/get-brand-reviews"
import { calculateBrandSentimentMetrics } from "@/lib/sentiment-analysis"
import { Star as StarIcon } from "lucide-react"

// Import the Sizing & Fit keywords from the detail page or redefine them here
const sizingFitKeywords = [
  // Sizing Issues
  "sizing", "size", "wrong size", "ordered wrong size", "poor sizing", "poor sizing information", "lack of sizing information", "wrong sizing information", "true to size", "runs small", "runs large", "size up", "size down", "don't know my size", "didn't know which size", "idk which size", "what size", "which size", "what's the size",
  // Fit Issues
  "fit", "fits", "fitted", "fitting", "poor fit", "didn't fit", "too small", "too tight", "too big", "too loose", "would this fit", "large", "small", "tight", "loose", "narrow", "wide", "comfort", "comfortable"
];

function getSentimentColor(sentiment: string) {
  switch (sentiment) {
    case "positive":
      return "bg-green-100 text-green-800"
    case "negative":
      return "bg-red-100 text-red-800"
    default:
      return "bg-yellow-100 text-yellow-800"
  }
}

// Get specific logo size for brands that need adjustment
function getLogoSize(brandId: string) {
  switch (brandId) {
    case "wander-doll":
      return "w-9 h-6" // Larger for 3-column layout
    case "murci":
      return "w-8 h-5" // Larger for 3-column layout
    default:
      return "w-full h-full" // Full size for others
  }
}

export default function BrandsPage() {
  const [brands, setBrands] = useState(realBrandsList)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  // Update brands with current scraped dates and real review counts
  useEffect(() => {
    const updateBrandsWithRealAnalytics = async () => {
      const updatedBrands = await Promise.all(
        realBrandsList.map(async (brand) => {
          const reviews = await getBrandReviews(brand.id)
          const metrics = reviews.length > 0 ? calculateBrandSentimentMetrics(reviews) : null
          const avgRating =
            reviews.length > 0 ? (reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length) : 0
          const sentiment = metrics
            ? metrics.avgSentimentScore > 0.1
              ? "positive"
              : metrics.avgSentimentScore < -0.1
              ? "negative"
              : "neutral"
            : "neutral"
          const sizingFitCount = reviews.filter((r: any) => sizingFitKeywords.some(keyword => r.review && r.review.toLowerCase().includes(keyword.toLowerCase()))).length;
          return {
            ...brand,
            totalReviews: reviews.length,
            sizingFitReviews: sizingFitCount,
            avgRating: Number(avgRating.toFixed(1)),
            sentiment,
          }
        })
      )
      setBrands(updatedBrands)
    }

    updateBrandsWithRealAnalytics()

    // Listen for localStorage changes (when user scrapes reviews)
    const handleStorageChange = () => {
      updateBrandsWithRealAnalytics()
    }

    window.addEventListener("storage", handleStorageChange)
    window.addEventListener("localStorageUpdate", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener("localStorageUpdate", handleStorageChange)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("theme")
    if (saved === "dark") {
      setDarkMode(true)
      document.documentElement.classList.add("dark")
    } else {
      setDarkMode(false)
      document.documentElement.classList.remove("dark")
    }
  }, [])

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add("dark")
        localStorage.setItem("theme", "dark")
      } else {
        document.documentElement.classList.remove("dark")
        localStorage.setItem("theme", "light")
      }
      return next
    })
  }

  const handleCreateBrand = (newBrand: any) => {
    setBrands([...brands, newBrand])
    setIsCreateModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-2 py-6">
        <div className="flex justify-end items-center mb-4">
          <button
            onClick={toggleDarkMode}
            className="fixed bottom-6 right-6 z-50 rounded-full p-2 border border-gray-300 bg-background shadow-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-700" />}
          </button>
        </div>
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-foreground mb-1 animate-fade-in">Brand Review Dashboard</h1>
          <div className="flex justify-between items-center animate-fade-in-delay">
            <p className="text-gray-600 text-sm">Monitor sizing and fit sentiment across tracked brands</p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center space-x-1.5 h-9 px-3 text-sm font-medium rounded-md shadow-none border border-gray-300 bg-white hover:bg-gray-100 text-black"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Brand</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-full">
          {brands.map((brand, index) => (
            <Link key={brand.id} href={`/brands/${brand.id}`}>
              <Card
                className="group cursor-pointer h-[190px] transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:-translate-y-2 hover:bg-gray-50 bg-card text-card-foreground border border-gray-200 rounded-md p-0 shadow-md"
                style={{
                  animationDelay: `${index * 80}ms`,
                  animationFillMode: "both",
                }}
              >
                {/* Header Section */}
                <CardHeader className="pb-2 p-3">
                  <div className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-2">
                      <div className="relative w-10 h-10 bg-black rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                          src={brand.logo || "/placeholder.svg"}
                          alt={`${brand.name} logo`}
                          className={`${getLogoSize(brand.id)} object-contain transition-transform duration-200 group-hover:scale-105`}
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg?height=40&width=40"
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base font-bold text-foreground group-hover:text-blue-600 transition-colors duration-200 truncate">
                          {brand.name}
                        </CardTitle>
                        <p className="text-xs text-gray-500 mt-0.5">Last updated: {brand.lastUpdated}</p>
                      </div>
                    </div>
                    {/* Avg Rating beside logo with single yellow star */}
                    <div className="flex flex-col items-end min-w-[80px]">
                      <div className="flex items-center space-x-1">
                        <StarIcon className="w-4 h-4 text-yellow-400" fill="none" />
                        <span className={`text-base font-semibold ${getRatingColor(brand.avgRating)}`}>{brand.avgRating}</span>
                      </div>
                      <span className="text-[10px] text-gray-500">Avg Rating</span>
                    </div>
                  </div>
                </CardHeader>

                {/* Content Section */}
                <CardContent className="pt-0 p-3 space-y-2 overflow-hidden">
                  {/* Badges Row */}
                  <div className="flex justify-between items-center gap-2 mb-1">
                    <Badge variant="outline" className="flex items-center space-x-1 px-2 py-0.5 text-xs font-normal border border-gray-300 bg-white text-gray-800">
                      <Building2 className="w-3 h-3" />
                      <span>{brand.totalReviews.toLocaleString()} reviews</span>
                    </Badge>
                    <Badge className={`px-2 py-0.5 text-xs font-normal capitalize ${getSentimentColor(brand.sentiment)}`}>{brand.sentiment}</Badge>
                  </div>

                  {/* Bars Section */}
                  <div className="space-y-1">
                    {/* Sizing & Fit Issue Bar */}
                    <div className="px-2 py-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-600 font-medium">Sizing & Fit Mentions</span>
                        <span className="text-xs text-gray-500">{brand.sizingFitReviews} <span className="text-[10px]">({((brand.sizingFitReviews/brand.totalReviews)*100).toFixed(1)}% of total)</span></span>
                      </div>
                      <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-blue-500 rounded-full transition-all"
                          style={{ width: `${(brand.sizingFitReviews/brand.totalReviews)*100}%` }}
                        />
                      </div>
                    </div>
                    {/* Sentiment Score Bar */}
                    <div className="px-2 py-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-600 font-medium">Sentiment Score</span>
                        <span className={`text-xs font-semibold ${brand.sentiment === "positive" ? "text-green-600" : brand.sentiment === "negative" ? "text-red-600" : "text-yellow-600"}`}>{brand.sentiment === "positive" ? "+" : ""}{brand.avgRating >= 0 ? (brand.avgRating/5-0.5).toFixed(2) : "0.00"}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-1.5 ${brand.sentiment === "positive" ? "bg-green-500" : brand.sentiment === "negative" ? "bg-red-500" : "bg-yellow-500"} rounded-full transition-all`}
                          style={{ width: `${Math.max(10, Math.min(100, ((brand.avgRating/5)*100)))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <CreateBrandModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateBrand={handleCreateBrand}
        />
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-fade-in-delay {
          animation: fade-in 0.6s ease-out 0.2s both;
        }

        .animate-slide-up {
          animation: slide-up 0.6s ease-out;
        }
      `}</style>
    </div>
  )
}
