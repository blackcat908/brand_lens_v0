"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Badge } from "./ui/badge"
import { ExternalLink, Globe, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"

interface UrlInputSectionProps {
  currentUrl: string
  brandId: string // Add brandId to track updates per brand
  onScrapeReviews: (url: string) => void
}

export function UrlInputSection({ currentUrl, brandId, onScrapeReviews }: UrlInputSectionProps) {
  const [url, setUrl] = useState(currentUrl)
  const [isValidUrl, setIsValidUrl] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null)

  const [scrapingProgress, setScrapingProgress] = useState(0)
  const [scrapingStatus, setScrapingStatus] = useState("")
  const [scrapingStage, setScrapingStage] = useState("")

  // Load last update time from localStorage on component mount
  useEffect(() => {
    const savedLastUpdate = localStorage.getItem(`lastUpdate_${brandId}`)
    if (savedLastUpdate) {
      setLastUpdateTime(new Date(savedLastUpdate))
    }
  }, [brandId])

  const validateUrl = (inputUrl: string) => {
    try {
      const urlObj = new URL(inputUrl)
      const isValidTrustpilot = urlObj.hostname.includes("trustpilot.com") && urlObj.pathname.includes("/review/")
      setIsValidUrl(isValidTrustpilot)
      return isValidTrustpilot
    } catch {
      setIsValidUrl(false)
      return false
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    if (newUrl.trim()) {
      validateUrl(newUrl)
    } else {
      setIsValidUrl(true)
    }
  }

  const formatLastUpdate = (date: Date) => {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const handleScrape = async () => {
    if (!validateUrl(url)) return

    setIsLoading(true)
    setScrapingProgress(0)
    setScrapingStatus("Initializing...")
    setScrapingStage("setup")

    try {
      // Stage 1: Connection
      setScrapingStatus("Connecting to Trustpilot...")
      setScrapingStage("connecting")
      await simulateProgress(0, 15, 800)

      // Stage 2: Authentication
      setScrapingStatus("Authenticating request...")
      setScrapingStage("auth")
      await simulateProgress(15, 25, 600)

      // Stage 3: Fetching page
      setScrapingStatus("Loading review pages...")
      setScrapingStage("fetching")
      await simulateProgress(25, 45, 1200)

      // Stage 4: Parsing reviews
      setScrapingStatus("Parsing review data...")
      setScrapingStage("parsing")
      await simulateProgress(45, 70, 1500)

      // Stage 5: Processing sentiment
      setScrapingStatus("Analyzing sentiment & keywords...")
      setScrapingStage("analyzing")
      await simulateProgress(70, 85, 1000)

      // Stage 6: Saving data
      setScrapingStatus("Saving processed data...")
      setScrapingStage("saving")
      await simulateProgress(85, 95, 500)

      // Stage 7: Complete
      setScrapingStatus("Scraping completed successfully!")
      setScrapingStage("complete")
      await simulateProgress(95, 100, 300)

      // Update the last update time when scraping completes and save to localStorage
      const completionTime = new Date()
      setLastUpdateTime(completionTime)
      localStorage.setItem(`lastUpdate_${brandId}`, completionTime.toISOString())

      // Dispatch custom event to notify main page of localStorage update
      window.dispatchEvent(new CustomEvent("localStorageUpdate"))

      // Final success message
      setTimeout(() => {
        setScrapingStatus("✅ Found 247 new reviews with sizing/fit mentions")
        setTimeout(() => {
          onScrapeReviews(url)
        }, 1000)
      }, 500)
    } catch (error) {
      setScrapingStatus("❌ Scraping failed. Please try again.")
      setScrapingStage("error")
    } finally {
      setTimeout(() => {
        setIsLoading(false)
        setScrapingProgress(0)
        setScrapingStatus("")
        setScrapingStage("")
      }, 3000)
    }
  }

  // Helper function for smooth progress animation
  const simulateProgress = (start: number, end: number, duration: number) => {
    return new Promise<void>((resolve) => {
      const steps = 20
      const stepSize = (end - start) / steps
      const stepDuration = duration / steps
      let currentStep = 0

      const interval = setInterval(() => {
        currentStep++
        const newProgress = start + stepSize * currentStep
        setScrapingProgress(Math.min(newProgress, end))

        if (currentStep >= steps) {
          clearInterval(interval)
          resolve()
        }
      }, stepDuration)
    })
  }

  const getUrlStatus = () => {
    if (!url.trim()) return null
    return isValidUrl ? "valid" : "invalid"
  }

  const urlStatus = getUrlStatus()

  return (
    <Card className="border border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-gray-900">
            <Globe className="w-5 h-5" />
            <span>Review Source Configuration</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-1"
          >
            <span className="text-sm text-gray-600">{isExpanded ? "Hide" : "Show"}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
        {!isExpanded && (
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Active</span>
            </div>
            <div className="flex items-center space-x-1">
              <ExternalLink className="w-3 h-3" />
              <span>1,247 reviews</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Last: {lastUpdateTime ? formatLastUpdate(lastUpdateTime) : "Never"}</span>
            </div>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-700">
            Paste a Trustpilot URL to analyze reviews for sizing and fit sentiment
          </p>

          <div>
            <Label htmlFor="trustpilot-url" className="text-sm font-medium">
              Trustpilot URL
            </Label>
            <div className="flex space-x-2 mt-2">
              <div className="flex-1 relative">
                <Input
                  id="trustpilot-url"
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="https://www.trustpilot.com/review/example-brand.com"
                  className={`pr-10 ${
                    urlStatus === "valid"
                      ? "border-green-300 focus:border-green-500"
                      : urlStatus === "invalid"
                        ? "border-red-300 focus:border-red-500"
                        : ""
                  }`}
                />
                {urlStatus === "valid" && (
                  <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-green-500" />
                )}
                {urlStatus === "invalid" && (
                  <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-red-500" />
                )}
              </div>
              <Button
                onClick={handleScrape}
                disabled={!isValidUrl || !url.trim() || isLoading}
                className="shrink-0 min-w-[120px]"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Scraping...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Scrape Reviews
                  </>
                )}
              </Button>
            </div>

            {/* Progress Bar and Status */}
            {isLoading && (
              <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">Scraping Progress</span>
                  <span className="text-sm text-blue-700">{Math.round(scrapingProgress)}%</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${scrapingProgress}%` }}
                  />
                </div>

                {/* Status Message */}
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div
                      className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                  <span className="text-sm text-blue-800">{scrapingStatus}</span>
                </div>

                {/* Stage Indicators */}
                <div className="flex items-center space-x-4 text-xs">
                  <div
                    className={`flex items-center space-x-1 ${scrapingStage === "connecting" || scrapingProgress > 15 ? "text-green-600" : "text-gray-400"}`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${scrapingStage === "connecting" || scrapingProgress > 15 ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <span>Connect</span>
                  </div>
                  <div
                    className={`flex items-center space-x-1 ${scrapingStage === "fetching" || scrapingProgress > 45 ? "text-green-600" : "text-gray-400"}`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${scrapingStage === "fetching" || scrapingProgress > 45 ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <span>Fetch</span>
                  </div>
                  <div
                    className={`flex items-center space-x-1 ${scrapingStage === "analyzing" || scrapingProgress > 70 ? "text-green-600" : "text-gray-400"}`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${scrapingStage === "analyzing" || scrapingProgress > 70 ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <span>Analyze</span>
                  </div>
                  <div
                    className={`flex items-center space-x-1 ${scrapingStage === "complete" || scrapingProgress === 100 ? "text-green-600" : "text-gray-400"}`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${scrapingStage === "complete" || scrapingProgress === 100 ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <span>Complete</span>
                  </div>
                </div>
              </div>
            )}

            {/* Keep existing validation messages but only show when not loading */}
            {!isLoading && urlStatus === "invalid" && (
              <p className="text-sm text-red-600 mt-2 flex items-center space-x-1">
                <AlertCircle className="w-4 h-4" />
                <span>
                  Please enter a valid Trustpilot review URL (e.g., https://www.trustpilot.com/review/brand.com)
                </span>
              </p>
            )}

            {!isLoading && urlStatus === "valid" && url !== currentUrl && (
              <p className="text-sm text-green-600 mt-2 flex items-center space-x-1">
                <CheckCircle className="w-4 h-4" />
                <span>Ready to scrape reviews from new URL</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-xs font-medium text-gray-700">Last Update</p>
                <p className="text-xs text-gray-500">
                  {lastUpdateTime ? formatLastUpdate(lastUpdateTime) : "Never updated"}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div>
                <p className="text-xs font-medium text-gray-700">Status</p>
                <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                  Active
                </Badge>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <ExternalLink className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-xs font-medium text-gray-700">Reviews Found</p>
                <p className="text-xs text-gray-500">1,247 total</p>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
