"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Star, ThumbsUp, ThumbsDown, Download, FileText, Filter, X, BarChart3, PieChart, Settings, Globe, SlidersHorizontal, ChevronDown, Meh, Loader2, RotateCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KeywordsManager } from "@/components/keywords-manager"
import { SentimentTrendChart } from "@/components/charts/sentiment-trend-chart"
import { SentimentDistributionChart } from "@/components/charts/sentiment-distribution-chart"
import { getBrandReviews } from "@/lib/get-brand-reviews"
import { calculateBrandSentimentMetrics, calculateSentimentScore } from "@/lib/sentiment-analysis"
import React from "react"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useParams } from "next/navigation"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu"
import { realBrandData } from "@/lib/real-brand-data"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"
import { format, subDays, subMonths, isAfter, isBefore, parseISO } from "date-fns"

interface ReviewFilters {
  rating: string;
  keyword: string;
  ratings: number[];
}

function highlightKeywords(text: string, keywords: string[], searchKeyword?: string) {
  let highlightedText = text

  // First highlight the predefined sizing/fit keywords in yellow
  keywords.forEach((keyword) => {
    const regex = new RegExp(`\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi")
    highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 text-yellow-900 dark:bg-yellow-700 dark:text-yellow-100 px-1 rounded font-medium">$1</mark>')
  })

  // Then highlight the search keyword in blue (if it's different from the predefined keywords)
  if (searchKeyword && searchKeyword.trim()) {
    const searchTerm = searchKeyword.trim()
    // Only highlight if it's not already highlighted as a sizing keyword
    const isAlreadyHighlighted = keywords.some((keyword) => keyword.toLowerCase() === searchTerm.toLowerCase())

    if (!isAlreadyHighlighted) {
      const searchRegex = new RegExp(`\\b(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi")
      highlightedText = highlightedText.replace(
        searchRegex,
        '<mark class="bg-blue-200 px-1 rounded font-medium border border-blue-300">$1</mark>',
      )
    }
  }

  return highlightedText
}

function SentimentSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  return (
    <div className="flex items-end space-x-1 h-8">
      {data.map((value, index) => (
        <div
          key={index}
          className="bg-blue-500 w-2 rounded-t transition-colors"
          style={{
            height: `${((value - min) / range) * 100}%`,
            minHeight: "2px",
          }}
        />
      ))}
    </div>
  )
}

// Get specific logo size for detail page
function getDetailLogoSize(brandId: string) {
  switch (brandId) {
    case "wander-doll":
      return "w-14 h-8" // Larger logo image for detail page
    case "murci":
      return "w-12 h-7" // Larger logo image for detail page
    default:
      return "w-full h-full" // Full size for others
  }
}

export default function BrandDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  // Use realBrandData for brand info
  const meta = (realBrandData[id as keyof typeof realBrandData] as any) || {
    name: id ? id : id.split(/[-_]/g).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
    logo: `/logos/${id}-logo.png`,
    trustpilotUrl: `https://www.trustpilot.com/review/${id}.com`,
  };

  console.log('DEBUG Trustpilot URL:', meta.trustpilotUrl)

  const [reviews, setReviews] = useState<any[]>([])
  const [metrics, setMetrics] = useState({
    totalSizingFitReviews: 0,
    avgRating: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    sentimentScore: 0,
    monthlyTrend: [] as number[],
  })
  const [monthlySentimentData, setMonthlySentimentData] = useState<any[]>([])

  useEffect(() => {
    getBrandReviews(id || "").then((data) => {
      // Map customer name to customerName for each review
      const mappedData = (data || []).map((r: any) => ({
        ...r,
        customerName: r.customerName || r["customer name"] || "Anonymous"
      }));
      setReviews(mappedData);
      // Calculate metrics
      if (mappedData && mappedData.length > 0) {
        const sentimentMetrics = calculateBrandSentimentMetrics(mappedData)
        const avgRating = mappedData.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / mappedData.length
        // Monthly trend: percentage of positive reviews per month (last 6 months)
        const months: Record<string, any[]> = {}
        mappedData.forEach((r: any) => {
          const d = new Date(r.date)
          const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`
          months[key] ||= []
          months[key].push(r)
        })
        const sortedMonths = Object.keys(months).sort()
        const last6 = sortedMonths.slice(-6)
        const monthlyTrend = last6.map((m) => {
          const list = months[m]
          const pos = list.filter((r) => r.rating >= 4).length
          return Number(((pos / list.length) || 0).toFixed(2))
        })
        setMetrics({
          totalSizingFitReviews: mappedData.length,
          avgRating: Number(avgRating.toFixed(1)),
          positiveCount: sentimentMetrics.positiveCount,
          negativeCount: sentimentMetrics.negativeCount,
          neutralCount: sentimentMetrics.neutralCount,
          sentimentScore: calculateSentimentScore(mappedData.map((r: any) => r.review)),
          monthlyTrend,
        })
        // Monthly sentiment breakdown for chart
        const monthlySentiment = sortedMonths.map((m) => {
          const list = months[m]
          const positive = list.filter((r) => r.rating >= 4).length
          const negative = list.filter((r) => r.rating <= 2).length
          const neutral = list.filter((r) => r.rating === 3).length
          return {
            month: m,
            positive,
            negative,
            neutral,
            total: list.length,
          }
        })
        setMonthlySentimentData(monthlySentiment)
      } else {
        setMetrics({
          totalSizingFitReviews: 0,
          avgRating: 0,
          positiveCount: 0,
          negativeCount: 0,
          neutralCount: 0,
          sentimentScore: 0,
          monthlyTrend: [],
        })
        setMonthlySentimentData([])
      }
    })
  }, [id])

  const [showTrendChart, setShowTrendChart] = useState(false)
  const [showDistributionChart, setShowDistributionChart] = useState(false)
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    rating: "all",
    keyword: "",
    ratings: [],
  })

  /* no more notFound() — we always have a brand object */

  // State to track current keywords from the Keywords Manager
  const [currentKeywords, setCurrentKeywords] = useState<string[]>([
    "sizing",
    "size",
    "fit",
    "fits",
    "fitted",
    "fitting",
    "large",
    "small",
    "tight",
    "loose",
    "narrow",
    "wide",
    "length",
    "width",
    "comfort",
    "comfortable",
    "true to size",
    "runs small",
    "runs large",
    "size up",
    "size down",
    "too big",
    "too small",
    "return",
    "refund",
    "exchange",
  ])

  // Calculate neutral count for pie chart
  const neutralCount = reviews.filter((r) => r.rating === 3).length

  // State for category filter
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["Sizing & Fit Mentions"]);

  // Update keywordCategories to merge Sizing and Fit Mentions
  const keywordCategories = [
    { name: "Sizing & Fit Mentions", keywords: [
      // Sizing Issues
      "sizing", "size", "wrong size", "ordered wrong size", "poor sizing", "poor sizing information", "lack of sizing information", "wrong sizing information", "true to size", "runs small", "runs large", "size up", "size down", "don't know my size", "didn't know which size", "idk which size", "what size", "which size", "what's the size",
      // Fit Issues
      "fit", "fits", "fitted", "fitting", "poor fit", "didn't fit", "too small", "too tight", "too big", "too loose", "would this fit", "large", "small", "tight", "loose", "narrow", "wide", "comfort", "comfortable"
    ] },
    { name: "Model Reference", keywords: [
      "what size is the model wearing?", "what size is the model wearing", "how tall is the model?", "how tall is the model"
    ] },
    { name: "Length & Body Suitability", keywords: [
      "length", "width", "what's the length", "how tall", "is this suitable for", "height", "weight"
    ] },
    { name: "Returns & Exchanges", keywords: [
      "return", "refund", "exchange", "send back", "money back"
    ] },
    { name: "Custom Category", keywords: [] },
  ];
  // Create a mapping for category name to keywords
  const keywordCategoriesMap = Object.fromEntries(keywordCategories.map(cat => [cat.name, cat.keywords]));

  // Move date filter state and date range calculation above filteredReviews
  const [dateFilter, setDateFilter] = useState<'7d' | '30d' | '3m' | '6m' | 'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (dateFilter === '7d') startDate = subDays(now, 7);
  else if (dateFilter === '30d') startDate = subDays(now, 30);
  else if (dateFilter === '3m') startDate = subMonths(now, 3);
  else if (dateFilter === '6m') startDate = subMonths(now, 6);
  else if (dateFilter === 'custom' && customStartDate && customEndDate) {
    startDate = parseISO(customStartDate);
    endDate = parseISO(customEndDate);
  }

  // Update filteredReviews logic
  const dateFilteredReviews = useMemo(() => {
    if (dateFilter === 'all') return reviews;
    if (!startDate) return reviews;
    return reviews.filter(r => {
      const d = new Date(r.date);
      if (dateFilter === 'custom' && endDate) {
        return d >= startDate! && d <= endDate;
      }
      return d >= startDate!;
    });
  }, [reviews, dateFilter, startDate, endDate]);

  const filteredReviews = useMemo(() => {
    // Determine which keywords to use
    let keywordsToUse: string[] = [];
    if (selectedCategories.length > 0) {
      keywordsToUse = selectedCategories.flatMap(cat => keywordCategoriesMap[cat] || []);
    } else {
      // If no category selected, show all reviews
      return dateFilteredReviews.filter((review) => {
        // Multi-rating filter
        if (reviewFilters.ratings.length > 0 && !reviewFilters.ratings.includes(Number(review.rating))) {
          return false;
        }
        // Keyword filter (search box)
        if (reviewFilters.keyword && !review.review.toLowerCase().includes(reviewFilters.keyword.toLowerCase())) {
          return false;
        }
        return true;
      });
    }
    return dateFilteredReviews.filter((review) => {
      // Multi-rating filter
      if (reviewFilters.ratings.length > 0 && !reviewFilters.ratings.includes(Number(review.rating))) {
        return false;
      }
      // Keyword filter (search box)
      if (reviewFilters.keyword && !review.review.toLowerCase().includes(reviewFilters.keyword.toLowerCase())) {
        return false;
      }
      // Category keywords filter
      const reviewText = review.review.toLowerCase();
      const matchesKeyword = keywordsToUse.some((keyword) => reviewText.includes(keyword.toLowerCase()));
      return matchesKeyword;
    });
  }, [dateFilteredReviews, reviewFilters, selectedCategories, keywordCategoriesMap]);

  const handleFilterChange = (key: keyof ReviewFilters, value: any) => {
    setReviewFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setReviewFilters({ rating: "all", keyword: "", ratings: [] })
  }

  const hasActiveFilters = reviewFilters.ratings.length > 0 || reviewFilters.keyword !== ""

  // Handle keywords change from Keywords Manager
  // stable reference prevents unnecessary re-renders
  const handleKeywordsChange = React.useCallback((keywords: string[]) => {
    setCurrentKeywords(keywords)
  }, [])

  const [currentPage, setCurrentPage] = useState(1)
  const [showKeywordsModal, setShowKeywordsModal] = useState(false)
  const [showSourcePopover, setShowSourcePopover] = useState(false)
  const [pageSize, setPageSize] = useState(20)
  const [visibleColumns, setVisibleColumns] = useState({
    customer: true,
    date: true,
    rating: true,
    review: true,
  })

  // Add sorting state
  const [sortBy, setSortBy] = useState<'customer' | 'date' | 'rating'>("date");
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>("desc");

  const handleSort = (column: 'customer' | 'date' | 'rating') => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDirection("asc");
    }
  };

  // Sort filteredReviews before pagination
  const sortedReviews = useMemo(() => {
    const sorted = [...filteredReviews];
    sorted.sort((a, b) => {
      if (sortBy === "customer") {
        const nameA = (a.customerName || "").toLowerCase();
        const nameB = (b.customerName || "").toLowerCase();
        if (nameA < nameB) return sortDirection === "asc" ? -1 : 1;
        if (nameA > nameB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      } else if (sortBy === "date") {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
      } else if (sortBy === "rating") {
        return sortDirection === "asc"
          ? Number(a.rating) - Number(b.rating)
          : Number(b.rating) - Number(a.rating);
      }
      return 0;
    });
    return sorted;
  }, [filteredReviews, sortBy, sortDirection]);

  const paginatedReviews = sortedReviews.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const [sourceUrl, setSourceUrl] = useState(meta.trustpilotUrl);

  // On mount, load from localStorage if available
  useEffect(() => {
    const savedUrl = localStorage.getItem(`sourceUrl-${id}`);
    if (savedUrl) setSourceUrl(savedUrl);
  }, [id]);

  const handleSaveUrl = () => {
    localStorage.setItem(`sourceUrl-${id}`, sourceUrl);
    setShowSourcePopover(false);
  };
  const handleCancelUrlEdit = () => {
    const savedUrl = localStorage.getItem(`sourceUrl-${id}`) || meta.trustpilotUrl;
    setSourceUrl(savedUrl);
    setShowSourcePopover(false);
  };
  const handleUpdateReviews = () => {
    // TODO: Trigger re-scrape or refresh reviews (API call or placeholder)
    alert('Updating reviews from: ' + sourceUrl);
  };

  // State to track which reviews are expanded
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const toggleReview = (key: string) => {
    setExpandedReviews(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalPages = Math.max(1, Math.ceil(sortedReviews.length / pageSize));

  // Calculate metrics for filtered reviews (only for total and pos/neg, using only rating)
  const filteredPosNegMetrics = useMemo(() => {
    if (filteredReviews.length === 0) {
      return {
        totalSizingFitReviews: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
      };
    }
    return {
      totalSizingFitReviews: filteredReviews.length,
      positiveCount: filteredReviews.filter((r) => r.rating >= 4).length,
      negativeCount: filteredReviews.filter((r) => r.rating <= 2).length,
      neutralCount: filteredReviews.filter((r) => r.rating === 3).length,
    };
  }, [filteredReviews]);

  // State for visible columns
  const [showLinkColumn, setShowLinkColumn] = useState(false);

  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground px-4 md:px-12">
      <div className="container mx-auto px-4 pt-6">
        <Link href="/" className="flex items-center text-gray-600 hover:text-blue-600 active:text-blue-800 text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Home
        </Link>
      </div>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-black rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src={meta.logo || "/placeholder.svg"}
                alt={`${meta.name} logo`}
                className={`${getDetailLogoSize(id)} object-contain`}
                onError={(e) => {
                  e.currentTarget.src = "/placeholder.svg?height=64&width=64"
                }}
              />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{meta.name}</h1>
              <p className="text-gray-600">Sizing & Fit Analysis</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 mb-6 justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={isUpdating}
              onClick={async () => {
                setIsUpdating(true);
                setUpdateStatus(null);
                try {
                  // Simulate fetch/update (replace with real API call later)
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  setUpdateStatus({ message: `Brand data updated! Latest reviews and analytics fetched for ${meta.name}.`, type: 'success' });
                  toast({ title: "Brand data updated!", description: `Latest reviews and analytics fetched for ${meta.name}.` });
                } catch (err) {
                  setUpdateStatus({ message: "Update failed. Could not update brand data.", type: 'error' });
                  toast({ title: "Update failed", description: "Could not update brand data.", variant: "destructive" });
                } finally {
                  setIsUpdating(false);
                  setTimeout(() => setUpdateStatus(null), 4000);
                }
              }}
              className="flex items-center"
            >
              {isUpdating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCw className="w-4 h-4 mr-1" />}
              {isUpdating ? "Updating..." : "Update"}
            </Button>
            <Popover open={showSourcePopover} onOpenChange={setShowSourcePopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Globe className="w-4 h-4 mr-1" />
                  Source
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96">
                <div className="flex flex-col space-y-3">
                  <Label htmlFor="source-url" className="text-xs font-medium">Source URL</Label>
                  <Input
                    id="source-url"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex space-x-2 mt-1">
                    <Button type="button" size="sm" variant="default" onClick={handleSaveUrl}>Save</Button>
                    <Button type="button" size="sm" variant="outline" onClick={handleCancelUrlEdit}>Cancel</Button>
                  </div>
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-xs mt-2">View on Trustpilot</a>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => setShowKeywordsModal(true)}>
              <Settings className="w-4 h-4 mr-1" />
              Keyword Settings
            </Button>
          </div>
        </div>
        {updateStatus && (
          <div className={`mb-4 text-sm font-medium ${updateStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{updateStatus.message}</div>
        )}

        {/* Metrics Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          <Card className="bg-card text-card-foreground h-full p-1">
            <CardHeader className="pt-2 pb-1 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-2">Total Reviews</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-1">
              <div className="text-xl font-bold">{filteredPosNegMetrics.totalSizingFitReviews}</div>
              <p className="text-[11px] text-gray-500">
                {selectedCategories.length === 1 && selectedCategories[0] === "Sizing & Fit Mentions"
                  ? "Sizing & Fit mentions"
                  : "Filtered Reviews"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-1">
            <CardHeader className="pt-2 pb-1 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-2">Average Rating</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-1">
              <div className="flex items-center space-x-2">
                <div className="text-2xl font-bold">{metrics.avgRating}</div>
                <Star className="w-5 h-5 text-yellow-500" />
              </div>
              <p className="text-xs text-gray-500">From all reviews</p>
            </CardContent>
          </Card>

          {/* Clickable Positive vs Negative vs Neutral Card */}
          <Card className="relative overflow-hidden bg-card text-card-foreground h-full p-1">
            <CardHeader className="pt-2 pb-1 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-2">Positive vs Negative</CardTitle>
            </CardHeader>
            <CardContent className="pb-1">
              <div className="flex items-center mb-2 w-full space-x-4">
                <div className="flex items-center space-x-2 -ml-5">
                  <ThumbsUp className="w-4 h-4 text-green-500" />
                  <span className="font-bold">{filteredPosNegMetrics.positiveCount}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <ThumbsDown className="w-4 h-4 text-red-500" />
                  <span className="font-bold">{filteredPosNegMetrics.negativeCount}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Meh className="w-4 h-4 text-yellow-500" />
                  <span className="font-bold">{filteredPosNegMetrics.neutralCount}</span>
                </div>
              </div>
              <Button
                onClick={() => setShowDistributionChart(true)}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                size="sm"
              >
                <PieChart className="w-4 h-4 mr-2" />
                See Chart
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-1">
            <CardHeader className="pt-2 pb-1 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-2">Sentiment Score</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-1">
              <div className="text-2xl font-bold">{metrics.sentimentScore}</div>
              <Badge
                className={
                  metrics.sentimentScore > 0.6 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                }
              >
                {metrics.sentimentScore > 0.6 ? "Positive" : "Neutral"}
              </Badge>
            </CardContent>
          </Card>

          {/* Clickable Monthly Trend Card */}
          <Card className="relative overflow-hidden bg-card text-card-foreground h-full p-1">
            <CardHeader className="pt-0 pb-1 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-2">Monthly Trend</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="mb-2">
                <SentimentSparkline data={metrics.monthlyTrend} />
              </div>
              <Button
                onClick={() => setShowTrendChart(true)}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                size="sm"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Details
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-1">
            <CardHeader className="pt-0 pb-1 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-2">Top Issues</CardTitle>
            </CardHeader>
            <CardContent className="pt-2 px-2 pb-1">
              <div className="flex flex-wrap gap-1 mt-0">
                {(() => {
                  const keywordCounts: Record<string, { count: number; sentiment: string[] }> = {};
                  filteredReviews.forEach(r => {
                    currentKeywords.forEach(keyword => {
                      if (r.review && r.review.toLowerCase().includes(keyword.toLowerCase())) {
                        if (!keywordCounts[keyword]) keywordCounts[keyword] = { count: 0, sentiment: [] };
                        keywordCounts[keyword].count++;
                        if (r.sentiment_label) keywordCounts[keyword].sentiment.push(r.sentiment_label);
                      }
                    });
                  });
                  const topKeywords = Object.entries(keywordCounts)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 5);
                  if (topKeywords.length === 0) return <span className="text-xs text-gray-400">No issues found</span>;
                  return topKeywords.map(([keyword, data]) => {
                    const pos = data.sentiment.filter(s => s === 'positive').length;
                    const neg = data.sentiment.filter(s => s === 'negative').length;
                    const neu = data.sentiment.filter(s => s === 'neutral').length;
                    let color = 'bg-green-100 text-green-800';
                    if (neg > pos && neg > neu) color = 'bg-red-100 text-red-800';
                    else if (neu > pos && neu > neg) color = 'bg-yellow-100 text-yellow-800';
                    return (
                      <button
                        key={keyword}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer border border-gray-200 transition hover:scale-105 focus:outline-none ${color}`}
                        onClick={() => handleFilterChange('keyword', keyword)}
                        title={`Show reviews mentioning '${keyword}'`}
                      >
                        {keyword} <span className="font-bold">({data.count})</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Table with Integrated Filters */}
        <Card className="mb-8 bg-card text-card-foreground">
          <CardHeader>
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Review Details</CardTitle>
                  <p className="text-sm text-gray-600">
                    Matched keywords are highlighted in <span className="bg-yellow-200 text-yellow-900 dark:bg-yellow-700 dark:text-yellow-100 px-1 rounded">yellow</span>
                    {reviewFilters.keyword && (
                      <span>
                        , search terms in <span className="bg-blue-200 px-1 rounded border border-blue-300">blue</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      import("@/lib/export-utils").then(({ exportReviewsAsCSV }) => {
                        exportReviewsAsCSV(filteredReviews, meta.name)
                      })
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      import("@/lib/export-utils").then(({ exportReviewsAsExcel }) => {
                        exportReviewsAsExcel(filteredReviews, meta.name)
                      })
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      import("@/lib/export-utils").then(({ exportReviewsAsPDF }) => {
                        exportReviewsAsPDF(filteredReviews, meta.name)
                      })
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    PDF
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Filters Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-gray-600" />
                    <h3 className="font-medium text-foreground">Filter Reviews</h3>
                  </div>
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      <X className="w-4 h-4 mr-1" />
                      Clear Filters
                    </Button>
                  )}
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:space-x-4 w-full mb-2">
                  <div className="flex-1 min-w-[180px]">
                    <Label htmlFor="rating-filter" className="text-xs font-medium">Filter by Rating</Label>
                    <Select value={reviewFilters.rating} onValueChange={value => handleFilterChange('rating', value)}>
                      <SelectTrigger id="rating-filter" className="h-8 text-xs px-2">
                        <SelectValue placeholder="All Ratings" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Ratings</SelectItem>
                        <SelectItem value="5">5 Stars</SelectItem>
                        <SelectItem value="4">4 Stars</SelectItem>
                        <SelectItem value="3">3 Stars</SelectItem>
                        <SelectItem value="2">2 Stars</SelectItem>
                        <SelectItem value="1">1 Star</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[180px] mt-2 md:mt-0">
                    <Label htmlFor="date-filter" className="text-xs font-medium">Filter by Date</Label>
                    <Select value={dateFilter} onValueChange={value => setDateFilter(value as any)}>
                      <SelectTrigger id="date-filter" className="h-8 text-xs px-2">
                        <SelectValue placeholder="All Time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7d">Last 7 Days</SelectItem>
                        <SelectItem value="30d">Last 30 Days</SelectItem>
                        <SelectItem value="3m">Last 3 Months</SelectItem>
                        <SelectItem value="6m">Last 6 Months</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                    {dateFilter === 'custom' && (
                      <div className="flex items-center space-x-2 mt-1">
                        <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="border rounded px-2 py-1 text-xs h-8" />
                        <span className="text-xs">to</span>
                        <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="border rounded px-2 py-1 text-xs h-8" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-[180px] mt-2 md:mt-0">
                    <Label htmlFor="keyword-filter" className="text-xs font-medium">Search by Keyword</Label>
                    <Input
                      id="keyword-filter"
                      placeholder="Search in reviews..."
                      value={reviewFilters.keyword}
                      onChange={e => handleFilterChange('keyword', e.target.value)}
                      className="h-8 text-xs px-2"
                    />
                  </div>
                </div>

                {/* Active Filters Display */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {reviewFilters.ratings.length > 0 && reviewFilters.ratings.map((star) => (
                      <Badge key={star} variant="secondary" className="flex items-center space-x-1">
                        <Star className="w-3 h-3" />
                        <span>{star} stars</span>
                        <button onClick={() => handleFilterChange("ratings", reviewFilters.ratings.filter((r) => r !== star))} className="ml-1 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                    {reviewFilters.keyword && (
                      <Badge variant="secondary" className="flex items-center space-x-1">
                        <span>"{reviewFilters.keyword}"</span>
                        <button onClick={() => handleFilterChange("keyword", "")} className="ml-1 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                  </div>

                  <div className="text-sm text-gray-600">
                    Showing {filteredReviews.length} of {dateFilteredReviews.length} reviews
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Checkbox id="show-link-col" checked={showLinkColumn} onCheckedChange={checked => setShowLinkColumn(!!checked)} />
              <label htmlFor="show-link-col" className="text-sm select-none cursor-pointer">Show Link column</label>
            </div>
            <label className="flex items-center gap-2 mb-2">
              Category:
              <div className="flex flex-wrap gap-2">
                {/* All Reviews card */}
                <Button
                  key="All Reviews"
                  variant={selectedCategories.length === 0 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategories([])}
                  className={selectedCategories.length === 0 ? "bg-blue-600 text-white" : ""}
                >
                  All Reviews
                </Button>
                {keywordCategories.map(cat => (
                  <Button
                    key={cat.name}
                    variant={selectedCategories.includes(cat.name) ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategories([cat.name])}
                    className={selectedCategories.includes(cat.name) ? "bg-blue-600 text-white" : ""}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
            </label>
            <TooltipProvider>
              <Table className="bg-background text-foreground">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32 cursor-pointer select-none" onClick={() => handleSort("customer")}>Customer{sortBy === "customer" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>
                    <TableHead className="w-24 cursor-pointer select-none text-nowrap" onClick={() => handleSort("date")}>Date{sortBy === "date" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>
                    <TableHead className="w-20 cursor-pointer select-none text-nowrap" onClick={() => handleSort("rating")}>Rating{sortBy === "rating" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>
                    <TableHead className="w-auto max-w-3xl">Review</TableHead>
                    {showLinkColumn && <TableHead className="w-32">Link</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReviews.length > 0 ? (
                    paginatedReviews.map((review, idx) => {
                      const reviewKey = review.id || review.link || `${review.customerName}-${review.date}-${idx}`;
                      const isExpanded = expandedReviews[reviewKey];
                      return (
                        <TableRow key={reviewKey}>
                          <TableCell className="font-medium text-nowrap">{review.customerName}</TableCell>
                          <TableCell className="text-nowrap">{review.date}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <span>{review.rating}</span>
                              <Star className="w-4 h-4 text-yellow-500" />
                            </div>
                          </TableCell>
                          <TableCell className="max-w-3xl whitespace-pre-line">
                            <div>
                              <span
                                dangerouslySetInnerHTML={{
                                  __html: highlightKeywords(
                                    isExpanded || review.review.length <= 200
                                      ? review.review
                                      : review.review.slice(0, 200) + '...',
                                    selectedCategories.flatMap(cat => keywordCategoriesMap[cat] || []),
                                    reviewFilters.keyword
                                  ),
                                }}
                              />
                            </div>
                            {review.review.length > 200 && (
                              <button
                                className="text-xs text-blue-600 hover:underline mt-1 focus:outline-none"
                                onClick={() => toggleReview(reviewKey)}
                              >
                                {isExpanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </TableCell>
                          {showLinkColumn && (
                            <TableCell className="truncate max-w-xs">
                              {review.link ? (
                                <a href={review.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
                                  {review.link}
                                </a>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow key="no-reviews">
                      <TableCell colSpan={showLinkColumn ? 5 : 4} className="text-center py-8 text-gray-500">
                        No reviews match the current filters
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    aria-disabled={currentPage === 1}
                  />
                </PaginationItem>
                {(() => {
                  const pages = [];
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) {
                      pages.push(
                        <PaginationItem key={i}>
                          <PaginationLink isActive={currentPage === i} onClick={() => setCurrentPage(i)}>
                            {i}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }
                  } else {
                    // Always show first page
                    pages.push(
                      <PaginationItem key={1}>
                        <PaginationLink isActive={currentPage === 1} onClick={() => setCurrentPage(1)}>
                          1
                        </PaginationLink>
                      </PaginationItem>
                    );
                    // Show ellipsis if needed
                    if (currentPage > 4) {
                      pages.push(<PaginationItem key="start-ellipsis"><PaginationEllipsis /></PaginationItem>);
                    }
                    // Show up to 2 pages before and after current page
                    for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++) {
                      pages.push(
                        <PaginationItem key={i}>
                          <PaginationLink isActive={currentPage === i} onClick={() => setCurrentPage(i)}>
                            {i}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }
                    // Show ellipsis if needed
                    if (currentPage < totalPages - 3) {
                      pages.push(<PaginationItem key="end-ellipsis"><PaginationEllipsis /></PaginationItem>);
                    }
                    // Always show last page
                    pages.push(
                      <PaginationItem key={totalPages}>
                        <PaginationLink isActive={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  }
                  return pages;
                })()}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    aria-disabled={currentPage === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>

            <div className="flex justify-end mt-2">
              <div className="flex items-center space-x-2">
                <Label htmlFor="page-size-select" className="text-xs">Rows per page:</Label>
                <Select value={pageSize.toString()} onValueChange={v => setPageSize(Number(v))}>
                  <SelectTrigger id="page-size-select" className="w-20 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map(size => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Complete Brand Report - Bottom of Page */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="text-center">
            <Button
              size="lg"
              onClick={() => {
                import("@/lib/export-utils").then(({ exportBrandReportAsPDF }) => {
                  exportBrandReportAsPDF({
                    name: meta.name,
                    trustpilotUrl: meta.trustpilotUrl,
                    metrics: metrics,
                    reviews: reviews,
                    keywords: currentKeywords,
                  })
                })
              }}
              className="flex items-center space-x-2"
            >
              <FileText className="w-5 h-5" />
              <span>Download Complete Brand Report (PDF)</span>
            </Button>
            <p className="text-sm text-gray-500 mt-2">Includes all metrics, trends, keywords, and review details</p>
          </div>
        </div>

        {/* Chart Modals */}
        <SentimentTrendChart
          isOpen={showTrendChart}
          onClose={() => setShowTrendChart(false)}
          data={monthlySentimentData}
          brandName={meta.name}
        />

        <SentimentDistributionChart
          isOpen={showDistributionChart}
          onClose={() => setShowDistributionChart(false)}
          positiveCount={filteredPosNegMetrics.positiveCount}
          negativeCount={filteredPosNegMetrics.negativeCount}
          neutralCount={filteredPosNegMetrics.neutralCount}
          brandName={meta.name}
        />

        {/* Modal for managing keywords (reuse KeywordsManager or a modal version) */}
        {showKeywordsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Manage Sizing & Fit Keywords</h2>
                <Button variant="ghost" onClick={() => setShowKeywordsModal(false)}><X className="w-5 h-5" /></Button>
              </div>
              <KeywordsManager onKeywordsChange={setCurrentKeywords} hideTitle hideDescription />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
