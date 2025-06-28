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
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-end items-center p-4">
          <button
            onClick={toggleDarkMode}
            className="fixed bottom-6 right-6 z-50 rounded-full p-3 border border-gray-300 bg-background shadow-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun className="w-6 h-6 text-yellow-400" /> : <Moon className="w-6 h-6 text-gray-700" />}
          </button>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 animate-fade-in">Brand Review Dashboard</h1>
          <div className="flex justify-between items-center animate-fade-in-delay">
            <p className="text-gray-600">Monitor sizing and fit sentiment across tracked brands</p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center space-x-2 transform transition-all duration-200 hover:scale-105 hover:shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Brand</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands.map((brand, index) => (
            <Link key={brand.id} href={`/brands/${brand.id}`}>
              <Card
                className="group cursor-pointer h-full transform transition-all duration-300 ease-out hover:scale-105 hover:shadow-xl hover:-translate-y-2 animate-slide-up shadow-md hover:shadow-2xl bg-card text-card-foreground"
                style={{
                  animationDelay: `${index * 100}ms`,
                  animationFillMode: "both",
                }}
              >
                {/* Header Section */}
                <CardHeader className="pb-3 p-4">
                  <div className="flex items-center space-x-3">
                    <div className="relative w-12 h-12 bg-black rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                      <img
                        src={brand.logo || "/placeholder.svg"}
                        alt={`${brand.name} logo`}
                        className={`${getLogoSize(brand.id)} object-contain transition-transform duration-300 group-hover:scale-110`}
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder.svg?height=48&width=48"
                        }}
                      />
                      <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-transparent to-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg font-semibold text-foreground group-hover:text-blue-600 transition-colors duration-300 truncate">
                        {brand.name}
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">Last updated: {brand.lastUpdated}</p>
                    </div>
                  </div>
                </CardHeader>

                {/* Content Section */}
                <CardContent className="pt-0 p-4 space-y-4">
                  {/* Badges Row */}
                  <div className="flex justify-between items-center gap-3">
                    <Badge variant="outline" className="flex items-center space-x-1.5 px-2.5 py-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      <span>{brand.totalReviews.toLocaleString()} reviews</span>
                    </Badge>
                    <Badge className={`px-2.5 py-1 text-xs capitalize ${getSentimentColor(brand.sentiment)}`}>
                      {brand.sentiment}
                    </Badge>
                  </div>

                  {/* Metrics Row */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      <div>
                        <p className="text-xl font-bold text-blue-600">{brand.sizingFitReviews}</p>
                        <p className="text-xs text-gray-600">Sizing & Fit</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <div>
                        <p className={`text-xl font-bold ${getRatingColor(brand.avgRating)}`}>{brand.avgRating}</p>
                        <p className="text-xs text-gray-600">Avg Rating</p>
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
