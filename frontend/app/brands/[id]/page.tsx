"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Star, ThumbsUp, ThumbsDown, Download, FileText, Filter, X, BarChart3, PieChart, Settings, Globe, SlidersHorizontal, ChevronDown, Loader2, RotateCw, Meh } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"
import { format, subDays, subMonths, subWeeks, isAfter, isBefore, parseISO } from "date-fns"
import { apiService, canonicalBrandId } from "@/lib/api-service"
import { BrandLogo } from "@/components/brand-logo";
// @ts-ignore - wink-lemmatizer doesn't have type definitions
import winkLemmatizer from 'wink-lemmatizer';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BrandDashboardSkeleton } from "@/components/skeleton-ui";

// Helper: lemmatize all words in a string using wink-lemmatizer
function lemmatizeWords(text: string) {
  // Split text into words, remove punctuation, and lemmatize each word
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '')
    .split(/\s+/)
    .map(word => winkLemmatizer.noun(word) || winkLemmatizer.verb(word) || winkLemmatizer.adjective(word) || word)
    .filter(Boolean);
}
// NLP-based keyword match: does any lemmatized keyword appear as a word in the lemmatized review?
function matchesAnyKeywordNLP(text: string, keywords: string[]) {
  const lemmas = lemmatizeWords(text);
  const keywordLemmas = keywords.map(k => winkLemmatizer.noun(k.toLowerCase()) || winkLemmatizer.verb(k.toLowerCase()) || winkLemmatizer.adjective(k.toLowerCase()) || k.toLowerCase());
  return keywordLemmas.some(kw => lemmas.includes(kw));
}
// Replace the highlightKeywords function with a robust version that handles both keywords and search terms:
function robustHighlightKeywords(text: string, keywords: string[], searchTerm?: string) {
  if (!keywords || keywords.length === 0) return text;
  
  let result = text;
  
  // First, highlight keywords in subtle gray
  const escapedKeywords = keywords
    .filter(Boolean)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
    
  if (escapedKeywords.length > 0) {
    const keywordRegex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
    result = result.replace(keywordRegex, match =>
    `<mark class="!bg-gray-300 !text-gray-800 px-1 rounded font-medium border border-gray-200">${match}</mark>`
      );
  }
  
  // Then, highlight search terms in blue (if search term exists)
  if (searchTerm && searchTerm.trim()) {
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(`\\b(${escapedSearchTerm})\\b`, 'gi');
    result = result.replace(searchRegex, match =>
      `<mark class="bg-blue-200 text-blue-900 px-1 rounded font-medium border border-blue-300">${match}</mark>`
    );
  }
  
  return result;
}

function SentimentSpark({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 60;
  const height = 32;
  const n = data.length;
  // Calculate points for polyline
  const points = data.map((value, i) => {
    const x = (i / (n - 1 || 1)) * (width - 4) + 2; // padding 2px
    const y = height - 2 - ((value - min) / range) * (height - 4); // padding 2px
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="3"
        points={points}
      />
      {/* Optionally, add dots for each point */}
      {data.map((value, i) => {
        const x = (i / (n - 1 || 1)) * (width - 4) + 2;
        const y = height - 2 - ((value - min) / range) * (height - 4);
        return <circle key={i} cx={x} cy={y} r="2" fill="#3b82f6" />;
      })}
    </svg>
  );
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

// Helper to get fallback Trustpilot URL for a brand
function getFallbackTrustpilotUrl(brandId: string) {
  const map: Record<string, string> = {
    'wander-doll': 'https://uk.trustpilot.com/review/www.wander-doll.com',
    'oddmuse': 'https://uk.trustpilot.com/review/oddmuse.co.uk',
    'because-of-alice': 'https://uk.trustpilot.com/review/www.becauseofalice.com',
    'bbxbrand': 'https://uk.trustpilot.com/review/bbxbrand.com',
    'murci': 'https://uk.trustpilot.com/review/murci.co.uk',
  };
  return map[brandId] || '';
}

const UPDATE_STEPS = [
  { key: 'initiated', label: 'Scraper Initiated' },
  { key: 'started', label: 'Scraping Started' },
  { key: 'done', label: 'Scraping Done' },
  { key: 'updating', label: 'Updating Data' },
  { key: 'complete', label: 'Complete' },
  { key: 'error', label: 'Error' },
];

// Replace ModernProgressBar with a thin, long, minimal bar and progress text
function ThinProgressBar({ percent, label }: { percent: number, label?: string }) {
  return (
    <div className="w-full flex flex-col items-center my-4">
      {label && <div className="mb-1 text-sm font-medium text-blue-400">{label}</div>}
      <div className="w-full max-w-2xl">
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-1.5 bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper function to get API base URL
function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') + '/api';
}

// 1. Add type for ReviewFilters if missing
type ReviewFilters = {
  rating: string;
  keyword: string;
  ratings: string[];
};

// 1. Add toTitleCase helper
function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export default function BrandDetailPage() {
  // All hooks at the top level, before any conditionals or returns
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  // Declare filter-related state first
  const [selectedCategory, setSelectedCategory] = useState("Sizing & Fit Mentions");
  const [selectedRating, setSelectedRating] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // 1. Replace individual filter states with a single filters state object:
  const [filters, setFilters] = useState({
    category: ["Sizing & Fit Mentions"], // Changed to array for multi-select
    rating: ["all"], // Changed to array for multi-select
    dateFilter: "all",
    customStartDate: "",
    customEndDate: ""
  });
  const [pendingFilters, setPendingFilters] = useState(filters);
  
  // State for additional information columns
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const [showCustomerColumn, setShowCustomerColumn] = useState(false);
  const [showLinkColumn, setShowLinkColumn] = useState(false);
  const [showMatchedKeywords, setShowMatchedKeywords] = useState(false);
  const params = useParams();
  let id = "";
  if (params) {
    id = typeof params.id === "string"
      ? decodeURIComponent(params.id)
      : Array.isArray(params.id)
        ? decodeURIComponent(params.id[0])
        : "";
  }

  // State for real data
  const [brand, setBrand] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]); // Paginated reviews for table display
  const [allReviews, setAllReviews] = useState<any[]>([]); // All reviews for analytics
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalReviews, setTotalReviews] = useState(0);

  // Review filters state (moved here to fix initialization order)
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    rating: "all",
    keyword: "",
    ratings: [],
  });

  // Search input state for improved UX (only apply on Enter)
  const [searchInput, setSearchInput] = useState("");

  // Sync search input with keyword filter when it changes from other sources
  useEffect(() => {
    setSearchInput(reviewFilters.keyword);
  }, [reviewFilters.keyword]);

  

  // 1. Declare all state first
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

  // NEW: Optimized single API call that gets everything
  useEffect(() => {
    console.log('Current filters state:', filters);
    let isMounted = true;
    setLoading(true);
    setError(null);
    
    async function fetchOptimizedData() {
      try {
        const apiFilters: any = {};
        
        // Handle categories
        if (filters.category && filters.category.length > 0 && !filters.category.includes("all")) {
          apiFilters.category = filters.category;
        }
        
        // Handle ratings
        if (filters.rating && filters.rating.length > 0 && !filters.rating.includes("all")) {
          apiFilters.rating = filters.rating.map(r => Number(r));
        }
        
        // Handle date filters
        if (filters.dateFilter && filters.dateFilter !== 'all') {
          if (filters.dateFilter === 'custom' && filters.customStartDate && filters.customEndDate) {
            apiFilters.dateFrom = filters.customStartDate;
            apiFilters.dateTo = filters.customEndDate;
          } else {
            const now = new Date();
            let startDate = new Date();
            
            switch (filters.dateFilter) {
              case '7d':
                startDate = subDays(now, 7);
                break;
              case '30d':
                startDate = subDays(now, 30);
                break;
              case '3m':
                startDate = subMonths(now, 3);
                break;
              case '6m':
                startDate = subMonths(now, 6);
                break;
              default:
                startDate = now;
            }
            
            apiFilters.dateFrom = startDate.toISOString().slice(0, 10);
            apiFilters.dateTo = now.toISOString().slice(0, 10);
          }
        }
        
        // Add keyword filter
        if (reviewFilters.keyword && reviewFilters.keyword.trim()) {
          apiFilters.keyword = reviewFilters.keyword.trim();
        }

        console.log('Sending apiFilters to OPTIMIZED dashboard API:', apiFilters);

        // SINGLE OPTIMIZED API CALL - gets reviews + analytics in one request!
        const dashboardData = await apiService.getBrandDashboardOptimized(
          id, 
          currentPage, 
          pageSize, 
          apiFilters
        );
        
        if (!isMounted) return;
        
        // Set all data from single response
        setReviews(dashboardData.reviews);
        setTotalReviews(dashboardData.filtered_total); // Total after filters applied
        // For analytics calculations, we now use backend pre-calculated analytics
        // so we don't need setAllReviews anymore, but keeping it for compatibility
        setAllReviews(dashboardData.reviews);
        
        // Convert backend analytics format to frontend format
        const convertedAnalytics = {
          brand: dashboardData.brand,
          total_reviews: dashboardData.analytics.total_reviews,
          average_rating: dashboardData.analytics.average_rating,
          avgRating: dashboardData.analytics.average_rating, // Alias
          sentiment_breakdown: dashboardData.analytics.sentiment_breakdown,
          average_sentiment: dashboardData.analytics.average_sentiment_score,
          sentimentScore: dashboardData.analytics.average_sentiment_score, // Alias
          rating_distribution: (dashboardData.analytics as any).rating_distribution || {}, // Rating distribution data
          monthly_trends: dashboardData.analytics.monthly_trends,
          monthlyTrend: dashboardData.analytics.monthly_trends.map(t => t.count), // Alias
          top_keywords: (dashboardData.analytics as any)?.top_keywords || [], // Backend calculated top keywords
          last_updated: new Date().toISOString()
        };
        
        setAnalytics(convertedAnalytics);
        
      } catch (err: any) {
        console.error('Dashboard fetch error:', err);
        setError(err.message || "Failed to load dashboard data");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    
    fetchOptimizedData();
    return () => { isMounted = false; };
  }, [id, currentPage, pageSize, filters, reviewFilters.keyword]);

  // Handler for category change
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1); // Reset to first page on filter change
  };

  // Handler for rating change
  const handleRatingChange = (rating: string) => {
    setSelectedRating(rating);
    setCurrentPage(1); // Reset to first page on filter change
  };

  // Handler for page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Fetch all brands and set the current brand by raw brand_name
  useEffect(() => {
    apiService.getBrands().then(brands => {
      const found = brands.find(b => b.brand === id);
      setBrand(found || null);
    });
  }, [id]);

  // Meta state for brand info
  const meta = {
    name: id, // Use the decoded brand name for display
    logo: brand?.logo || `/logos/${id || 'placeholder'}-logo.jpg`,
    trustpilotUrl: brand?.trustpilotUrl || brand?.source_url || '',
  };

  const [showTrendChart, setShowTrendChart] = useState(false)
  const [showDistributionChart, setShowDistributionChart] = useState(false)

  /* no more notFound() — we always have a brand object */

  // State to track current keywords from the Keywords Manager
  const defaultKeywords = [
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
  ];
  // Remove all brandId usage for keywords
  // Use global keywords for all brands
  // Update useEffect to fetch global keywords
  const [customKeywords, setCustomKeywords] = useState<any>({});
  const [currentKeywords, setCurrentKeywords] = useState<string[]>(defaultKeywords);

  // Fetch custom keywords from backend on mount
  useEffect(() => {
    apiService.getGlobalKeywords()
      .then(res => {
        if (res && res.keywords && Object.keys(res.keywords).length > 0) {
          setCustomKeywords(res.keywords);
          setCurrentKeywords(Object.values(res.keywords).flat() as string[]);
        } else {
          setCustomKeywords({});
          setCurrentKeywords(defaultKeywords);
        }
      })
      .catch(() => {
        setCustomKeywords({});
        setCurrentKeywords(defaultKeywords);
      });
  }, []);

  // Calculate neutral count for pie chart
  const neutralCount = reviews.filter((r) => r.rating === 3).length

  // State for category filter
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["Sizing & Fit Mentions"]);

  // Combine sizing and fit keywords into one category in keywordCategories
  const keywordCategories = [
    { name: "Sizing & Fit Mentions", keywords: [
      // Sizing Issues
      "sizing", "size", "sizes", "wrong size", "ordered wrong size", "poor sizing", "poor sizing information", "lack of sizing information", "wrong sizing information", "true to size", "runs small", "runs large", "size up", "size down", "don't know my size", "didn't know which size", "idk which size", "what size", "which size", "what's the size",
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

  // Build dynamic category-to-keywords mapping from customKeywords
  const dynamicKeywordCategoriesMap = React.useMemo(() => {
    if (customKeywords && Object.keys(customKeywords).length > 0) {
      return customKeywords;
    }
    // fallback to static
    return Object.fromEntries(keywordCategories.map(cat => [cat.name, cat.keywords]));
  }, [customKeywords]);

  // Helper: fallback to static keywords if dynamic is empty
  const getCategoryKeywords = (cat: string) => {
    if (dynamicKeywordCategoriesMap[cat] && dynamicKeywordCategoriesMap[cat].length > 0) {
      return dynamicKeywordCategoriesMap[cat];
    }
    return keywordCategoriesMap[cat] || [];
  };

  // Apply client-side keyword search to paginated reviews for table display
  const filteredReviews = reviewFilters.keyword
    ? reviews.filter(r => (r.review || '').toLowerCase().includes(reviewFilters.keyword.toLowerCase()))
    : reviews;

  const handleFilterChange = (key: keyof ReviewFilters, value: any) => {
    setReviewFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setReviewFilters({ rating: "all", keyword: "", ratings: [] })
    setSearchInput("") // Clear search input when clearing filters
  }

  const hasActiveFilters = reviewFilters.ratings.length > 0 || reviewFilters.keyword !== ""

  // Handle keywords change from Keywords Manager
  // stable reference prevents unnecessary re-renders
  const handleKeywordsChange = React.useCallback((keywords: string[]) => {
    setCurrentKeywords(keywords)
  }, [])

  const [showKeywordsModal, setShowKeywordsModal] = useState(false)
  const [showSourcePopover, setShowSourcePopover] = useState(false)
  const [showAIReportModal, setShowAIReportModal] = useState(false)
  const [aiReportPrompt, setAIReportPrompt] = useState("")
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [generatedReport, setGeneratedReport] = useState("")
  const [aiReportHistory, setAiReportHistory] = useState<any[]>([])
  const [showHistoryTab, setShowHistoryTab] = useState(false)

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

  // Sort reviews before pagination
  const sortedReviews = useMemo(() => {
    const sorted = [...reviews];
    sorted.sort((a, b) => {
      if (sortBy === "customer") {
        const nameA = (a.customer_name || a.customer || "").toLowerCase();
        const nameB = (b.customer_name || b.customer || "").toLowerCase();
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
  }, [reviews, sortBy, sortDirection]);



  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceUrlLoading, setSourceUrlLoading] = useState(true);
  const [sourceUrlError, setSourceUrlError] = useState("");

  // Always fetch the correct Trustpilot source URL for the brand from the backend
  useEffect(() => {
    let isMounted = true;
    async function fetchSourceUrl() {
      setSourceUrlLoading(true);
      setSourceUrlError("");
      try {
        const res = await fetch(`${getApiBaseUrl()}/brand-source-url?brand_id=${id}`);
        const data = await res.json();
        if (isMounted) setSourceUrl(data.sourceUrl);
      } catch (err) {
        if (isMounted) setSourceUrlError("Failed to load source URL");
      } finally {
        if (isMounted) setSourceUrlLoading(false);
      }
    }
    fetchSourceUrl();
    return () => { isMounted = false; };
  }, [id]);

  // Fetch source URL every time the popover is opened
  useEffect(() => {
    if (showSourcePopover) {
      setSourceUrlLoading(true);
      setSourceUrlError("");
      fetch(`${getApiBaseUrl()}/brand-source-url?brand_id=${id}`)
        .then(res => res.json())
        .then(data => {
          console.log('Fetched source URL response:', data);
          let url = data.sourceUrl || data.url || data.source_url || "";
          if (!url) url = getFallbackTrustpilotUrl(id);
          console.log('Setting sourceUrl to:', url);
          setSourceUrl(url);
        })
        .catch(() => {
          setSourceUrl(getFallbackTrustpilotUrl(id));
          setSourceUrlError("Failed to load source URL");
        })
        .finally(() => setSourceUrlLoading(false));
    }
  }, [showSourcePopover, id]);

  const handleSaveUrl = async () => {
    setSourceUrlLoading(true);
    setSourceUrlError("");
    try {
      const res = await fetch(`${getApiBaseUrl()}/brand-source-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: id, sourceUrl }),
      });
      if (!res.ok) throw new Error("Failed to save");
    setShowSourcePopover(false);
    } catch (err) {
      setSourceUrlError("Failed to save source URL");
    } finally {
      setSourceUrlLoading(false);
    }
  };

  const handleCancelUrlEdit = () => {
    setSourceUrlLoading(true);
    setSourceUrlError("");
    fetch(`${getApiBaseUrl()}/brand-source-url?brand_id=${id}`)
      .then(res => res.json())
      .then(data => setSourceUrl(data.sourceUrl))
      .catch(() => setSourceUrlError("Failed to load source URL"))
      .finally(() => setSourceUrlLoading(false));
    setShowSourcePopover(false);
  };

  // State to track which reviews are expanded
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const toggleReview = (key: string) => {
    setExpandedReviews(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper: Get reviews with size & fit mentions (for Total Reviews card)
  const sizingFitKeywords = getCategoryKeywords("Sizing & Fit Mentions");
  const reviewsWithSizingFitMentions = useMemo(() =>
    reviews.filter((review) =>
      sizingFitKeywords.some((keyword: string) => (review.review || "").toLowerCase().includes(keyword.toLowerCase()))
    ),
    [reviews, sizingFitKeywords]
  );

  // Create unified filtered dataset that respects ALL filters (category, rating, date, keyword)
  const unifiedFilteredReviews = useMemo(() => {
    let filtered = [...allReviews];

    // Apply category filter (keyword-based filtering)
    if (filters.category && filters.category.length > 0 && !filters.category.includes("all")) {
      // Handle multiple categories - check if review matches any of the selected categories
      const allCategoryKeywords = filters.category.flatMap(cat => getCategoryKeywords(cat));
      filtered = filtered.filter((review) =>
        allCategoryKeywords.some((keyword: string) => 
          (review.review || "").toLowerCase().includes(keyword.toLowerCase())
        )
      );
    }

    // Apply rating filter
    if (filters.rating && filters.rating.length > 0 && !filters.rating.includes("all")) {
      // Handle multiple ratings - check if review rating matches any of the selected ratings
      const ratingNums = filters.rating.map(r => Number(r));
      filtered = filtered.filter((r) => ratingNums.includes(Number(r.rating)));
    }

    // Apply date filter
    if (filters.dateFilter && filters.dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;
      
      switch (filters.dateFilter) {
        case '7d':
          startDate = subDays(now, 7);
          break;
        case '30d':
          startDate = subDays(now, 30);
          break;
        case '3m':
          startDate = subMonths(now, 3);
          break;
        case '6m':
          startDate = subMonths(now, 6);
          break;
        case 'custom':
          if (filters.customStartDate && filters.customEndDate) {
            startDate = parseISO(filters.customStartDate);
            endDate = parseISO(filters.customEndDate);
          } else {
            return filtered; // No custom dates, return unfiltered
          }
          break;
        default:
          return filtered; // No date filter, return unfiltered
      }
      
      filtered = filtered.filter((r) => {
        if (!r.date) return false;
        const reviewDate = new Date(r.date);
        return reviewDate >= startDate && reviewDate <= endDate;
      });
    }

    // Apply keyword search filter
    if (reviewFilters.keyword) {
      filtered = filtered.filter(r => 
        (r.review || '').toLowerCase().includes(reviewFilters.keyword.toLowerCase())
      );
    }

    return filtered;
  }, [allReviews, filters, reviewFilters.keyword]);

  // NEW: Use backend pre-calculated analytics instead of client-side calculations
  // This ensures analytics are based on ALL filtered reviews, not just the 20 paginated ones
  const totalSizingFitReviews = analytics?.total_reviews || 0;
  const averageRating = analytics?.average_rating || 0;
  const sentimentScore = analytics?.average_sentiment || 0;

  // Use backend sentiment breakdown data
  const filteredPosNegMetrics = useMemo(() => {
    if (!analytics?.sentiment_breakdown) {
      return {
        totalSizingFitReviews: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
      };
    }
    return {
      totalSizingFitReviews: analytics.sentiment_breakdown.total_analyzed,
      positiveCount: analytics.sentiment_breakdown.positive,
      negativeCount: analytics.sentiment_breakdown.negative,
      neutralCount: analytics.sentiment_breakdown.neutral,
    };
  }, [analytics]);

  // Use paginated reviews from backend for table display
  const paginatedReviews = reviews;
  
  // Calculate total pages based on total reviews from backend
  const totalPages = Math.ceil(totalReviews / pageSize);

  // State for visible columns
  // const [showLinkColumn, setShowLinkColumn] = useState(false); // This state is now managed by the checkbox

  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStep, setUpdateStep] = useState('idle');
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState("idle");
  const [newlyAddedReviewIds, setNewlyAddedReviewIds] = useState<Set<string>>(new Set());

  // Helper to get a unique key for a review
  function getReviewKey(review: any, idx: number) {
    // Use review_link or id as primary key, avoid using index
    return review.review_link
      ?? review.id
      ?? `${review.customer_name || review.customer}-${review.date}-${review.review?.slice(0, 20) ?? ''}`;
  }

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateStep('initiated');
    setUpdateStatus("idle");
    setUpdateMessage("");
    const updateStartTime = Date.now();
    const prevKeys = new Set(reviews.map((r, idx) => getReviewKey(r, idx)));
    await new Promise(res => setTimeout(res, 400));
    setUpdateStep('started');
    await new Promise(res => setTimeout(res, 600));
    try {
      // Instead of calling the Next.js /api/scrape endpoint, call the Flask backend /api/scrape_brand endpoint
      const res = await fetch(`${getApiBaseUrl()}/scrape_brand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: id })
      });
      setUpdateStep('done');
      await new Promise(res => setTimeout(res, 400));
      setUpdateStep('updating');
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const newReviews = data.newReviews ?? data.new_reviews ?? data.newReviewsCount ?? data.added_count ?? 0;
      
      // Fetch reviews with current pagination settings instead of all reviews
      const apiFilters: any = {};
      if (filters.category && filters.category.length > 0 && !filters.category.includes("all")) {
        // Handle multiple categories - send as array
        apiFilters.category = filters.category;
      }
      if (filters.rating && filters.rating.length > 0 && !filters.rating.includes("all")) {
        // Handle multiple ratings - convert to numbers
        apiFilters.rating = filters.rating.map(r => Number(r));
      }
      if (filters.dateFilter && filters.dateFilter !== 'all') {
        if (filters.dateFilter === 'custom' && filters.customStartDate && filters.customEndDate) {
          apiFilters.dateFrom = filters.customStartDate;
          apiFilters.dateTo = filters.customEndDate;
        } else {
          // Calculate date range based on filter selection
          const now = new Date();
          let startDate = new Date();
          
          switch (filters.dateFilter) {
            case '7d':
              startDate = subDays(now, 7);
              break;
            case '30d':
              startDate = subDays(now, 30);
              break;
            case '3m':
              startDate = subMonths(now, 3);
              break;
            case '6m':
              startDate = subMonths(now, 6);
              break;
            default:
              startDate = now;
          }
          
          apiFilters.dateFrom = startDate.toISOString().slice(0, 10);
          apiFilters.dateTo = now.toISOString().slice(0, 10);
        }
      }
      const reviewsResp = await apiService.getBrandReviewsByFrontendId(id, currentPage, pageSize, apiFilters);
      const mappedReviews = reviewsResp.reviews.map(r => ({
        ...r,
        customer: (r as any).customer_name || (r as any).customer || '',
      }));
      setReviews(mappedReviews);
      setTotalReviews(reviewsResp.total_reviews || 0);
      
      // Also fetch all reviews for analytics
      const allReviewsResp = await apiService.getAllBrandReviewsByFrontendId(id, apiFilters);
      setAllReviews(allReviewsResp);
      
      // Only mark reviews as new if they were actually added in this update
      if (newReviews > 0) {
        // Get the current page reviews to compare
        const currentPageKeys = new Set(mappedReviews.map((r, idx) => getReviewKey(r, idx)));
        const newKeys = new Set([...currentPageKeys].filter(k => !prevKeys.has(k)));
      setNewlyAddedReviewIds(newKeys);
        
      if (newKeys.size > 0) {
        toast({
          title: `Added ${newKeys.size} new review${newKeys.size > 1 ? 's' : ''}`,
          description: `Recently added reviews are highlighted.`,
          duration: 60000,
        });
        setTimeout(() => setNewlyAddedReviewIds(new Set()), 60000);
        }
      } else {
        // Clear any existing new badges if no new reviews
        setNewlyAddedReviewIds(new Set());
      }
      setUpdateStep('complete');
      if (newReviews > 0) {
        setUpdateStatus("success");
        setUpdateMessage(`Brand data updated! Latest reviews and analytics fetched for ${meta.name}.`);
      } else if (newReviews === 0) {
        setUpdateStatus("nonew");
        setUpdateMessage("No new reviews found for this brand.");
      } else {
        setUpdateStatus("error");
        setUpdateMessage("Failed to fetch latest data.");
      }
    } catch (e) {
      setUpdateStep('error');
      setUpdateStatus("error");
      setUpdateMessage("Failed to fetch latest data.");
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (updateMessage) {
      const timer = setTimeout(() => {
        setUpdateMessage("");
        setUpdateStatus("idle");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [updateMessage]);

  

  // Show skeleton UI or error if needed
  if (loading) {
    return <BrandDashboardSkeleton />;
  }
  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  const allCategoryKeywords = keywordCategories.flatMap(cat => getCategoryKeywords(cat.name));

  // Define category names as a constant to ensure consistency
  const CATEGORY_NAMES = [
    "Sizing & Fit Mentions",
    "Model Reference",
    "Length & Body Suitability",
    "Returns & Exchanges",
    "Custom Category"
  ];

  // Before rendering the table, check for empty reviews and not loading:
  if (!loading && reviews.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
        <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-center h-64 text-lg text-gray-500">
        No reviews match the selected category.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <BrandLogo src={meta.logo} alt={`${meta.name} logo`} maxWidth={80} maxHeight={80} brandName={meta.name} />
            <div>
              <h1 className="text-3xl font-bold text-foreground">{meta.name}</h1>
              <p className="text-gray-600">
                Last updated: {analytics?.last_updated ? format(new Date(analytics.last_updated), 'MMM dd, yyyy - HH:mm') : 'Never'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 mb-6 justify-end">
            {/* Progress bar and label to the left of Update button */}
            {isUpdating && (
              <div className="flex flex-col items-end mr-4 min-w-[180px]">
                <div className="text-xs font-medium text-blue-400 mb-1">{UPDATE_STEPS.find(s => s.key === updateStep)?.label}</div>
                <div className="w-36">
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-1.5 bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((UPDATE_STEPS.findIndex(s => s.key === updateStep) / (UPDATE_STEPS.length - 2)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            <Button onClick={handleUpdate} className="flex items-center space-x-2" variant="outline" disabled={isUpdating}>
              <RotateCw className={`w-4 h-4 mr-1 ${isUpdating ? 'text-gray-400' : ''}`} />
              {isUpdating ? 'Updating...' : 'Update'}
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
        {updateMessage && (
          <div className={`mb-2 text-sm font-medium ${updateStatus === "success" ? "text-green-600" : updateStatus === "nonew" ? "text-blue-600" : "text-red-600"}`}>
            {updateMessage}
          </div>
        )}

        {/* Metrics Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center">Total Reviews</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-center">
                                          <div className="text-2xl font-bold text-center">{totalSizingFitReviews}</div>
                            <p className="text-[11px] text-gray-500 text-center">
                              {filters.category.includes("all") ? "All reviews" : filters.category.join(", ")}
                              {!filters.rating.includes("all") && ` • ${filters.rating.join(", ")}★`}
                              {filters.dateFilter !== "all" && ` • ${filters.dateFilter}`}
                              {reviewFilters.keyword && ` • "${reviewFilters.keyword}"`}
                            </p>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 relative group">
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center group-hover:hidden">Average Rating</CardTitle>
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center hidden group-hover:block">Rating Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-center">
              {/* Default Content - Star Rating Visualization */}
              <div className="group-hover:hidden">
                <div className="flex items-center justify-center space-x-1 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-8 h-7 ${
                        star <= Math.floor(averageRating)
                          ? averageRating >= 4
                            ? "text-green-500 fill-current"
                            : averageRating >= 3
                            ? "text-yellow-500 fill-current"
                            : "text-red-500 fill-current"
                          : star === Math.ceil(averageRating) && averageRating % 1 > 0
                          ? averageRating >= 4
                            ? "text-green-500 fill-current opacity-50"
                            : averageRating >= 3
                            ? "text-yellow-500 fill-current opacity-50"
                            : "text-red-500 fill-current opacity-50"
                          : "text-gray-400"
                      }`}
                    />
                  ))}
                </div>
                
                {/* Rating Score */}
                <div className="flex items-center justify-center text-center mb-1">
                  <div className="text-2xl font-bold">{averageRating.toFixed(1)}</div>
                </div>
                
                <p className="text-xs text-gray-500 text-center">
                  From {filters.category.includes("all") ? "all reviews" : filters.category.join(", ")}
                  {!filters.rating.includes("all") && ` (${filters.rating.join(", ")}★ only)`}
                </p>
              </div>
              
              {/* Hover Content - Rating Distribution */}
              <div className="hidden group-hover:block">
                <div className="space-y-2">
                  {(() => {
                    // Use backend rating distribution data instead of client-side calculation
                    const ratingCounts = analytics?.rating_distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                    const totalReviews = analytics?.total_reviews || 0;
                    
                    const colors = {
                      5: '#10b981', // Green
                      4: '#34d399', // Light green
                      3: '#fbbf24', // Yellow
                      2: '#fb923c', // Orange
                      1: '#ef4444'  // Red
                    };
                    
                    return [5, 4, 3, 2, 1].map(rating => {
                      const count = ratingCounts[rating.toString()] || 0;
                      const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                      const color = colors[rating as keyof typeof colors];
                      
                      return (
                        <div key={rating} className="flex items-center space-x-1">
                          <span className="text-xs font-medium w-4">{rating}★</span>
                          <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[80px]">
                            <div 
                              className="h-2 rounded-full transition-all duration-300" 
                              style={{ 
                                width: `${percentage}%`,
                                backgroundColor: color
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 w-5 text-right">{count}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Positive vs Negative Card */}
          <Card 
            className="relative overflow-hidden bg-card text-card-foreground h-full p-0 min-w-[180px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1"
          >
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center">Sentiment Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pb-2 px-2 flex flex-col justify-center">
              {/* Stacked Bar Visualization */}
              <div className="space-y-2 mb-3">
                {/* Positive Bar */}
                <div className="flex items-center space-x-2">
                  <ThumbsUp className="w-3 h-3 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-green-700 font-medium">Positive</span>
                      <span className="font-bold">{filteredPosNegMetrics.positiveCount}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all duration-500" 
                        style={{ 
                          width: `${filteredPosNegMetrics.totalSizingFitReviews > 0 ? 
                            (filteredPosNegMetrics.positiveCount / filteredPosNegMetrics.totalSizingFitReviews) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Negative Bar */}
                <div className="flex items-center space-x-2">
                  <ThumbsDown className="w-3 h-3 text-red-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-red-700 font-medium">Negative</span>
                      <span className="font-bold">{filteredPosNegMetrics.negativeCount}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-red-500 h-2 rounded-full transition-all duration-500" 
                        style={{ 
                          width: `${filteredPosNegMetrics.totalSizingFitReviews > 0 ? 
                            (filteredPosNegMetrics.negativeCount / filteredPosNegMetrics.totalSizingFitReviews) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Neutral Bar */}
                <div className="flex items-center space-x-2">
                  <Meh className="w-3 h-3 text-yellow-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-yellow-700 font-medium">Neutral</span>
                      <span className="font-bold">{filteredPosNegMetrics.neutralCount}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-yellow-500 h-2 rounded-full transition-all duration-500" 
                        style={{ 
                          width: `${filteredPosNegMetrics.totalSizingFitReviews > 0 ? 
                            (filteredPosNegMetrics.neutralCount / filteredPosNegMetrics.totalSizingFitReviews) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>


            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 relative group">
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-0 text-center -mb-1 group-hover:hidden">Sentiment Score</CardTitle>
              <CardTitle className="text-base font-bold text-foreground mb-0 text-center -mb-1 hidden group-hover:block">Sentiment Scale</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-start">
              {/* Default Content - Gauge Visualization */}
              <div className="group-hover:hidden flex flex-col items-center justify-start">
                <div className="relative w-32 h-32 mb-0">
                  <svg className="w-32 h-32" viewBox="0 0 100 100">
                    {/* Background arc */}
                    <path
                      d="M 20 50 A 30 30 0 0 1 80 50"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* Progress arc */}
                    <path
                      d={`M 20 50 A 30 30 0 0 1 ${50 + Math.cos(Math.PI * (sentimentScore + 1) / 2) * 30} ${50 - Math.sin(Math.PI * (sentimentScore + 1) / 2) * 30}`}
                      stroke={
                        sentimentScore > 0.3
                          ? "#10b981"
                          : sentimentScore <= -0.1
                          ? "#ef4444"
                          : "#f59e0b"
                      }
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                  {/* Center text - Larger font */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">
                      {sentimentScore.toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {/* Sentiment label - At bottom */}
                <Badge
                  className={
                    (sentimentScore > 0.3
                      ? "bg-green-100 text-green-800"
                      : sentimentScore <= -0.1
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800") +
                    " text-sm font-bold px-3 py-1 -mt-8"
                  }
                >
                  {sentimentScore > 0.3
                    ? "Positive"
                    : sentimentScore <= -0.1
                    ? "Negative"
                    : "Neutral"}
                </Badge>
              </div>
              
              {/* Hover Content - Sentiment Scale Bar */}
              <div className="hidden group-hover:block w-full">
                <div className="space-y-3">
                  {/* Scale Bar */}
                  <div className="relative">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>-1</span>
                      <span>0</span>
                      <span>+1</span>
                    </div>
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      {/* Color zones */}
                      <div className="absolute left-0 w-1/3 h-full bg-red-500"></div>
                      <div className="absolute left-1/3 w-1/3 h-full bg-yellow-500"></div>
                      <div className="absolute right-0 w-1/3 h-full bg-green-500"></div>
                      
                      {/* Current score indicator */}
                      <div 
                        className="absolute top-0 w-1 h-full bg-black transform -translate-x-1/2"
                        style={{ 
                          left: `${((sentimentScore + 1) / 2) * 100}%`
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                      <span>Negative</span>
                      <span>Neutral</span>
                      <span>Positive</span>
                    </div>
                  </div>
                  
                  {/* Current score display */}
                  <div className="text-center">
                    <div className="text-lg font-bold">{sentimentScore.toFixed(2)}</div>
                    <div className="text-xs text-gray-600">Current Score</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clickable Monthly Trend Card */}
          <Card 
            className="relative overflow-hidden bg-card text-card-foreground h-full p-0 min-w-[180px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1 cursor-pointer"
            onClick={() => setShowTrendChart(true)}
          >
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center">Monthly Trend</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 pb-2 flex flex-col items-center justify-center">
              {/* Sparkline Chart */}
              <div className="flex justify-center items-center h-20 mb-0">
                <svg width="120" height="60" viewBox="0 0 80 40" className="overflow-visible">
                  {/* Trend line */}
                  <path
                    d="M 5 38 L 10 32 L 18 35 L 25 28 L 32 31 L 40 22 L 48 26 L 55 19 L 62 24 L 70 16 L 75 12"
                    stroke="#3b82f6"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-1 shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader className="pt-0 pb-1 px-2">
                                      <CardTitle className="text-base font-bold text-foreground mb-2">Top Mentions</CardTitle>
            </CardHeader>
            <CardContent className="pt-2 px-2 pb-1">
              <div className="flex flex-wrap gap-1 mt-0">
                {(() => {
                  // Use backend top keywords instead of client-side calculation
                  const topKeywords = analytics?.top_keywords || [];
                  
                  if (topKeywords.length === 0) return <span className="text-xs text-gray-400">No keywords found</span>;
                  
                  return topKeywords.slice(0, 5).map((keywordData: any) => {
                    const { keyword, count } = keywordData;
                    // Default to positive color since we don't have sentiment breakdown for individual keywords from backend
                    const color = 'bg-green-100 text-green-800';
                    
                    return (
                      <button
                        key={keyword}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer border border-gray-200 transition hover:scale-105 focus:outline-none ${color}`}
                        onClick={() => handleFilterChange('keyword', keyword)}
                        title={`Show reviews mentioning '${keyword}'`}
                      >
                        {keyword} <span className="font-bold">({count})</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Phase 1: NEW Sizing Intelligence Section */}
        {analytics?.sizing_intelligence && (
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-4 text-foreground">🎯 Sizing Intelligence (Phase 1)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              
              {/* Sizing Accuracy Score */}
              <Card className="bg-card text-card-foreground shadow-lg hover:shadow-xl transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Sizing Accuracy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-2">
                    {analytics.business_insights?.sizing_accuracy_score || 0}/100
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-full inline-block ${
                    (analytics.business_insights?.sizing_accuracy_score || 0) >= 80 
                      ? 'bg-green-100 text-green-800' 
                      : (analytics.business_insights?.sizing_accuracy_score || 0) >= 60
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {(analytics.business_insights?.sizing_accuracy_score || 0) >= 80 ? 'Excellent' : 
                     (analytics.business_insights?.sizing_accuracy_score || 0) >= 60 ? 'Good' : 'Needs Improvement'}
                  </div>
                </CardContent>
              </Card>

              {/* Size Direction Analysis */}
              <Card className="bg-card text-card-foreground shadow-lg hover:shadow-xl transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Size Direction</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analytics.sizing_intelligence.size_direction_analysis?.size_direction_percentage && (
                      <>
                        {analytics.sizing_intelligence.size_direction_analysis.size_direction_percentage.runs_small > 30 && (
                          <div className="text-orange-600 font-medium text-sm">
                            🔺 Runs Small ({analytics.sizing_intelligence.size_direction_analysis.size_direction_percentage.runs_small}%)
                          </div>
                        )}
                        {analytics.sizing_intelligence.size_direction_analysis.size_direction_percentage.runs_large > 30 && (
                          <div className="text-blue-600 font-medium text-sm">
                            🔻 Runs Large ({analytics.sizing_intelligence.size_direction_analysis.size_direction_percentage.runs_large}%)
                          </div>
                        )}
                        {analytics.sizing_intelligence.size_direction_analysis.size_direction_percentage.true_to_size > 50 && (
                          <div className="text-green-600 font-medium text-sm">
                            ✅ True to Size ({analytics.sizing_intelligence.size_direction_analysis.size_direction_percentage.true_to_size}%)
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Return Risk Level */}
              <Card className="bg-card text-card-foreground shadow-lg hover:shadow-xl transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Return Risk</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-lg font-bold mb-2 ${
                    analytics.business_insights?.return_risk_level === 'high' ? 'text-red-600' :
                    analytics.business_insights?.return_risk_level === 'medium' ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {analytics.business_insights?.return_risk_level?.toUpperCase() || 'LOW'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {analytics.sizing_intelligence.customer_behavior?.returned_count || 0} return mentions
                  </div>
                </CardContent>
              </Card>

              {/* Body Part Issues */}
              <Card className="bg-card text-card-foreground shadow-lg hover:shadow-xl transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Top Fit Issue</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const bodyIssues = analytics.sizing_intelligence.body_part_issues || {};
                    const maxIssue = Object.entries(bodyIssues).reduce((max, [key, value]) => {
                      const numValue = typeof value === 'number' ? value : 0;
                      return numValue > max.value ? { key: key.replace('_', ' '), value: numValue } : max;
                    }, { key: 'None', value: 0 });
                    return (
                      <div>
                        <div className="text-lg font-bold capitalize">{maxIssue.key}</div>
                        <div className="text-xs text-gray-500">{maxIssue.value} mentions</div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Actionable Insights */}
            {analytics.sizing_intelligence.actionable_insights?.length > 0 && (
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-800">🚀 Business Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analytics.sizing_intelligence.actionable_insights.map((insight: any, index: number) => (
                      <div key={index} className={`p-3 rounded-lg border-l-4 ${
                        insight.priority === 'high' ? 'bg-red-50 border-red-400' :
                        insight.priority === 'medium' ? 'bg-yellow-50 border-yellow-400' :
                        'bg-blue-50 border-blue-400'
                      }`}>
                        <div className="font-medium text-sm">{insight.message}</div>
                        <div className="text-xs text-gray-600 mt-1">💡 {insight.recommendation}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Data Table with Integrated Filters */}
        <Card className="mb-8 bg-card text-card-foreground shadow-lg">
          <CardHeader>
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Review Details</CardTitle>
                  <p className="text-sm text-gray-600">
                    Matched keywords are highlighted in <span className="!bg-gray-300 !text-gray-800 px-1 rounded font-medium border border-gray-200">gray</span>
                    {reviewFilters.keyword && (
                      <span>
                        , search terms in <span className="bg-blue-200 px-1 rounded border border-blue-300">blue</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 justify-end mb-4">
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center">
                    <Input
                      placeholder="Search in reviews..."
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            handleFilterChange('keyword', searchInput.trim());
                          }
                        }}
                        className="h-10 w-64 text-sm pr-16"
                      />
                      <Button
                        onClick={() => handleFilterChange('keyword', searchInput.trim())}
                        size="sm"
                        variant="ghost"
                        className="absolute right-1 h-8 px-2 hover:bg-gray-100"
                      >
                        {reviewFilters.keyword ? (
                          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        )}
                      </Button>
                  </div>
                  </div>
                  {/* Clear Filters Button - only show when filters are active */}
                  {((filters.category.length > 0 && !filters.category.includes("all")) || 
                    (filters.rating.length > 0 && !filters.rating.includes("all")) || 
                    filters.dateFilter !== "all" || 
                    reviewFilters.keyword.trim() !== "") && (
                                          <Button 
                        variant="outline" 
                        className="h-10 px-4 text-sm text-red-600 bg-red-50 border-red-300 transition-transform duration-200 hover:scale-105"
                      onClick={() => {
                        // Clear all filters
                        setFilters({
                          category: ["all"],
                          rating: ["all"],
                          dateFilter: "all",
                          customStartDate: "",
                          customEndDate: ""
                        });
                        setPendingFilters({
                          category: ["all"],
                          rating: ["all"],
                          dateFilter: "all",
                          customStartDate: "",
                          customEndDate: ""
                        });
                        setReviewFilters({ rating: "all", keyword: "", ratings: [] });
                        setCurrentPage(1);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear Filters
                    </Button>
                  )}
                  
                  <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="h-10 px-6 text-base hover:scale-105 transition-transform duration-200 relative">
                        Filter
                        {/* Active filter indicator */}
                        {(filters.category.length > 0 && !filters.category.includes("all")) || 
                         (filters.rating.length > 0 && !filters.rating.includes("all")) || 
                         filters.dateFilter !== "all" || 
                         reviewFilters.keyword.trim() !== "" ? (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full"></span>
                        ) : null}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle>Filter Reviews</DialogTitle>
                      {/* Category selection with flexible buttons */}
                      <div className="mb-4">
                        <Label className="text-sm font-medium mb-2 block">Category</Label>
                        <div className="flex flex-wrap gap-2">
                          {/* All Reviews button */}
                          <button
                            type="button"
                            onClick={() => {
                                setPendingFilters(f => ({
                                  ...f,
                                category: ["all"]
                                }));
                              }}
                            className={`px-3 py-1.5 rounded-md border-2 transition-all duration-200 text-sm transform hover:scale-105 ${
                              pendingFilters.category.includes("all")
                                ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                                : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                            }`}
                            >
                              All Reviews
                          </button>
                          
                          {/* Individual category buttons */}
                            {Object.keys(customKeywords).map((cat: string) => (
                            <button
                                key={cat}
                              type="button"
                              onClick={() => {
                                  setPendingFilters(f => {
                                  const isSelected = f.category.includes(cat);
                                  const newCategory = isSelected 
                                    ? f.category.filter(c => c !== cat)
                                    : [...f.category.filter(c => c !== "all"), cat];
                                    return {
                                      ...f,
                                      category: newCategory.length === 0 ? ["all"] : newCategory
                                    };
                                  });
                                }}
                              className={`px-3 py-1.5 rounded-md border-2 transition-all duration-200 text-sm transform hover:scale-105 ${
                                pendingFilters.category.includes(cat)
                                  ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                                  : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                              }`}
                              >
                                {cat}
                            </button>
                            ))}
                      </div>
                      </div>
                      {/* Rating selection with horizontal checkboxes */}
                      <div className="mb-4">
                        <Label className="text-sm font-medium mb-2 block">Rating</Label>
                        <div className="space-y-2">
                          {/* All Ratings option */}
                          <div className="flex items-center space-x-2 group">
                            <Checkbox
                              id="rating-all"
                              checked={pendingFilters.rating.includes("all")}
                              onCheckedChange={(checked) => {
                                setPendingFilters(f => ({
                                  ...f,
                                  rating: checked ? ["all"] : []
                                }));
                              }}
                              className="h-3.5 w-3.5 transition-transform duration-200 hover:scale-105"
                            />
                            <Label htmlFor="rating-all" className="text-sm cursor-pointer transition-colors duration-200 group-hover:text-blue-600">
                              All Ratings
                            </Label>
                          </div>
                          
                          {/* Individual rating checkboxes in a row */}
                          <div className="flex flex-wrap gap-3">
                            {["5", "4", "3", "2", "1"].map((rating: string) => (
                              <div key={rating} className="flex items-center space-x-1.5 group">
                                <Checkbox
                                  id={`rating-${rating}`}
                                checked={pendingFilters.rating.includes(rating)}
                                onCheckedChange={(checked) => {
                                  setPendingFilters(f => {
                                    const newRating = checked 
                                      ? [...f.rating.filter(r => r !== "all"), rating]
                                      : f.rating.filter(r => r !== rating);
                                    return {
                                      ...f,
                                      rating: newRating.length === 0 ? ["all"] : newRating
                                    };
                                  });
                                }}
                                  className="h-3.5 w-3.5 transition-transform duration-200 hover:scale-105"
                                />
                                <Label htmlFor={`rating-${rating}`} className="text-sm cursor-pointer flex items-center space-x-1 transition-colors duration-200 group-hover:text-blue-600">
                                  <span>{rating}</span>
                                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* Date filter dropdown */}
                      <div className="mb-4">
                        <Label className="text-sm font-medium mb-2 block">Date</Label>
                        <Select value={pendingFilters.dateFilter} onValueChange={value => setPendingFilters(f => ({ ...f, dateFilter: value }))}>
                          <SelectTrigger className="h-8 px-3 bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-300 dark:border-zinc-700 text-sm">
                            <SelectValue placeholder="All Time" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Time</SelectItem>
                            <SelectItem value="7d">Last 7 Days</SelectItem>
                            <SelectItem value="30d">Last 30 Days</SelectItem>
                            <SelectItem value="3m">Last 3 Months</SelectItem>
                            <SelectItem value="6m">Last 6 Months</SelectItem>
                            <SelectItem value="custom">Custom Range</SelectItem>
                          </SelectContent>
                        </Select>
                        {pendingFilters.dateFilter === 'custom' && (
                          <div className="flex gap-2 mt-2 items-center">
                            <input 
                              type="date" 
                              value={pendingFilters.customStartDate} 
                              onChange={e => setPendingFilters(f => ({ ...f, customStartDate: e.target.value }))} 
                              className="border border-gray-300 rounded-md px-2 py-1 text-sm h-8 flex-1" 
                            />
                            <span className="text-xs text-gray-500">to</span>
                            <input 
                              type="date" 
                              value={pendingFilters.customEndDate} 
                              onChange={e => setPendingFilters(f => ({ ...f, customEndDate: e.target.value }))} 
                              className="border border-gray-300 rounded-md px-2 py-1 text-sm h-8 flex-1" 
                            />
                          </div>
                        )}
                      </div>

                      {/* Additional Information Section */}
                      <div className="mb-4">
                        <div className="flex items-center space-x-2 group">
                            <Checkbox
                              id="additional-info"
                              checked={showAdditionalInfo}
                              onCheckedChange={(checked) => {
                                const isChecked = checked as boolean;
                                setShowAdditionalInfo(isChecked);
                                setShowCustomerColumn(isChecked);
                                setShowLinkColumn(isChecked);
                                setShowMatchedKeywords(isChecked);
                              }}
                            className="h-3.5 w-3.5 transition-transform duration-200 hover:scale-105"
                            />
                          <Label htmlFor="additional-info" className="text-sm cursor-pointer transition-colors duration-200 group-hover:text-blue-600">
                            Show Additional Info
                            </Label>
                          </div>
                          {showAdditionalInfo && (
                          <div className="mt-2 ml-5 text-xs text-gray-600 bg-gray-50 p-2 rounded-md">
                            <div>• Customer • Link • Keywords</div>
                            </div>
                          )}
                      </div>

                      <DialogFooter>
                        <Button 
                          onClick={() => setFilterDialogOpen(false)} 
                          variant="outline"
                          className="transition-transform duration-200 hover:scale-105"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            setFilters(pendingFilters);
                            setCurrentPage(1);
                            setFilterDialogOpen(false);
                          }}
                          variant="default"
                          className="transition-transform duration-200 hover:scale-105"
                        >
                          Apply Filters
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  {/* CSV and Excel download buttons */}
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        // Build the exact same apiFilters as the main dashboard call
                        const apiFilters: any = {};
                        
                        // Handle categories
                        if (filters.category && filters.category.length > 0 && !filters.category.includes("all")) {
                          apiFilters.category = filters.category;
                        }
                        
                        // Handle ratings
                        if (filters.rating && filters.rating.length > 0 && !filters.rating.includes("all")) {
                          apiFilters.rating = filters.rating.map(r => Number(r));
                        }
                        
                        // Handle date filters
                        if (filters.dateFilter && filters.dateFilter !== 'all') {
                          if (filters.dateFilter === 'custom' && filters.customStartDate && filters.customEndDate) {
                            apiFilters.dateFrom = filters.customStartDate;
                            apiFilters.dateTo = filters.customEndDate;
                          } else {
                            const now = new Date();
                            let startDate = new Date();
                            
                            switch (filters.dateFilter) {
                              case '1w':
                                startDate = subWeeks(now, 1);
                                break;
                              case '1m':
                                startDate = subMonths(now, 1);
                                break;
                              case '3m':
                                startDate = subMonths(now, 3);
                                break;
                              case '6m':
                                startDate = subMonths(now, 6);
                                break;
                              default:
                                startDate = now;
                            }
                            
                            apiFilters.dateFrom = startDate.toISOString().slice(0, 10);
                            apiFilters.dateTo = now.toISOString().slice(0, 10);
                          }
                        }
                        
                        // Add keyword filter
                        if (reviewFilters.keyword && reviewFilters.keyword.trim()) {
                          apiFilters.keyword = reviewFilters.keyword.trim();
                        }
                        
                        console.log('CSV Export - Using same apiFilters as dashboard:', apiFilters);
                        
                        // Get ALL filtered reviews for export using the SAME filters as dashboard
                        const exportData = await apiService.getBrandDashboardOptimized(id, 1, 50000, apiFilters);
                        
                        // Import and execute export with all filtered reviews
                        import("@/lib/export-utils").then(({ exportReviewsAsCSV }) => {
                          exportReviewsAsCSV(exportData.reviews as any, meta.name)
                        })
                      } catch (error) {
                        console.error('Error exporting CSV:', error);
                        // Fallback to paginated reviews if export fails
                      import("@/lib/export-utils").then(({ exportReviewsAsCSV }) => {
                        exportReviewsAsCSV(unifiedFilteredReviews, meta.name)
                      })
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAIReportModal(true);
                      setShowHistoryTab(false);
                      setAIReportPrompt("");
                      setGeneratedReport("");
                    }}
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    AI Report
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Always show review count */}
              <div className="mb-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {/* Active Filters Display */}
                    {((filters.category.length > 0 && !filters.category.includes("all")) || 
                      (filters.rating.length > 0 && !filters.rating.includes("all")) || 
                      filters.dateFilter !== "all" || 
                      reviewFilters.keyword.trim() !== "") && (
                      <div className="flex flex-wrap gap-2 items-center mb-2">
                        <span className="text-sm font-medium text-gray-600">Active Filters:</span>
                      
                      {/* Category badges */}
                      {filters.category.length > 0 && !filters.category.includes("all") && 
                        filters.category.map(cat => (
                          <Badge key={cat} variant="secondary" className="flex items-center space-x-1 bg-blue-100 text-blue-800 border-blue-200">
                            <span>{cat}</span>
                            <button 
                              onClick={() => {
                                const newCategories = filters.category.filter(c => c !== cat);
                                setFilters(f => ({ ...f, category: newCategories.length === 0 ? ["all"] : newCategories }));
                                setPendingFilters(f => ({ ...f, category: newCategories.length === 0 ? ["all"] : newCategories }));
                                setCurrentPage(1);
                              }}
                              className="ml-1 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))
                      }
                      
                      {/* Rating badges */}
                      {filters.rating.length > 0 && !filters.rating.includes("all") && 
                        filters.rating.map(rating => (
                          <Badge key={rating} variant="secondary" className="flex items-center space-x-1 bg-yellow-100 text-yellow-800 border-yellow-200">
                            <Star className="w-3 h-3" />
                            <span>{rating} stars</span>
                            <button 
                              onClick={() => {
                                const newRatings = filters.rating.filter(r => r !== rating);
                                setFilters(f => ({ ...f, rating: newRatings.length === 0 ? ["all"] : newRatings }));
                                setPendingFilters(f => ({ ...f, rating: newRatings.length === 0 ? ["all"] : newRatings }));
                                setCurrentPage(1);
                              }}
                              className="ml-1 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))
                      }
                      
                      {/* Date filter badge */}
                      {filters.dateFilter !== "all" && (
                        <Badge variant="secondary" className="flex items-center space-x-1 bg-green-100 text-green-800 border-green-200">
                          <span>
                            {filters.dateFilter === "custom" 
                              ? `${filters.customStartDate} to ${filters.customEndDate}`
                              : filters.dateFilter === "7d" ? "Last 7 days"
                              : filters.dateFilter === "30d" ? "Last 30 days"
                              : filters.dateFilter === "3m" ? "Last 3 months"
                              : filters.dateFilter === "6m" ? "Last 6 months"
                              : filters.dateFilter
                            }
                          </span>
                          <button 
                            onClick={() => {
                              setFilters(f => ({ ...f, dateFilter: "all", customStartDate: "", customEndDate: "" }));
                              setPendingFilters(f => ({ ...f, dateFilter: "all", customStartDate: "", customEndDate: "" }));
                              setCurrentPage(1);
                            }}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      )}
                      
                      {/* Keyword search badge */}
                      {reviewFilters.keyword.trim() !== "" && (
                        <Badge variant="secondary" className="flex items-center space-x-1 bg-purple-100 text-purple-800 border-purple-200">
                          <span>"{reviewFilters.keyword}"</span>
                          <button 
                            onClick={() => {
                              setReviewFilters(f => ({ ...f, keyword: "" }));
                              setCurrentPage(1);
                            }}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      )}
                      </div>
                    )}
                  </div>
                  
                  {/* Review count - always visible */}
                  <div className="text-sm text-gray-600 ml-4 whitespace-nowrap">
                    Showing {reviews.length} of {totalReviews} reviews
                  </div>
                </div>
              </div>

              {/* Filters Section */}
              {/* The category filter tabs are removed from here */}
            </div>
          </CardHeader>
          <CardContent>
            {/* The category filter tabs are removed from here */}
            <TooltipProvider>
              <Table className="bg-white text-black table-fixed w-full">
                {/* 3. Table header: render columns conditionally */}
                <TableHeader>
                  <TableRow>
                    {showCustomerColumn && <TableHead className="w-32 min-w-[8rem] max-w-[8rem] cursor-pointer select-none font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700 text-center" onClick={() => handleSort("customer")}>Customer{sortBy === "customer" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>}
                    <TableHead className="w-28 min-w-[7rem] max-w-[7rem] cursor-pointer select-none text-nowrap font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700 text-center" onClick={() => handleSort("date")}>Date{sortBy === "date" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>
                    <TableHead className="w-20 min-w-[5rem] max-w-[5rem] cursor-pointer select-none text-nowrap font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700 text-center" onClick={() => handleSort("rating")}>Rating{sortBy === "rating" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>
                    <TableHead className="flex-1 font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700 text-center">Review</TableHead>
                    {showLinkColumn && <TableHead className="w-32 min-w-[8rem] max-w-[8rem] font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700 text-center">Link</TableHead>}
                    {showMatchedKeywords && <TableHead className="w-48 min-w-[12rem] max-w-[16rem] font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700 text-center">Matched Keywords</TableHead>}
                  </TableRow>
                </TableHeader>
                {/* 3. Table body: render columns conditionally */}
                <TableBody>
                  {sortedReviews.length > 0 ? (
                    sortedReviews.map((review, idx) => {
                      const reviewKey = getReviewKey(review, idx);
                      const isExpanded = expandedReviews[reviewKey];
                      const isNew = newlyAddedReviewIds.has(reviewKey);
                      // Determine which keywords to highlight for this review
                      const highlightKeywordsForReview = selectedCategories.length === 0
                        ? allCategoryKeywords
                        : selectedCategories.flatMap(getCategoryKeywords);
                      const highlightKeywordsArray =
                        filters.category.includes("all") || filters.category.includes("All Reviews")
                          ? review.matched_keywords || []
                          : filters.category.flatMap(cat => getCategoryKeywords(cat));
                      console.log('Selected category:', filters.category);
                      console.log('Highlighting with keywords:', highlightKeywordsArray);
                      const highlightedHTML = robustHighlightKeywords(review.review, highlightKeywordsArray, reviewFilters.keyword);
                      console.log('Highlighted HTML:', highlightedHTML);
                      return (
                        <TableRow key={reviewKey} className={`${isNew ? "bg-green-100 animate-fade-highlight" : ""} bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 min-h-[56px]`}>
                          {showCustomerColumn && <TableCell className="font-medium break-words bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">
                            <span className="break-words line-clamp-2 block">
                              {review.customer_name || review.customer || ""}
                            </span>
                          </TableCell>}
                          <TableCell className="text-nowrap bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">
                            {review.date}
                          </TableCell>
                          <TableCell className="text-black bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">
                            <span>{review.rating}</span>
                          </TableCell>
                          <TableCell className="whitespace-pre-line text-sm bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">
                            <div
                                dangerouslySetInnerHTML={{
                                __html: highlightedHTML
                                }}
                              />
                            {isNew && (
                              <span className="ml-2 inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 border border-green-300 align-middle">New</span>
                            )}
                          </TableCell>
                          {showLinkColumn && (
                            <TableCell className="truncate max-w-xs bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">
                              {review.review_link ? (
                                <a href={review.review_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
                                  {review.review_link}
                                </a>
                              ) : (
                                <span className="text-black" style={{ color: '#000' }}>—</span>
                              )}
                            </TableCell>
                          )}
                          {showMatchedKeywords && (
                            <TableCell className="whitespace-pre-line text-xs text-gray-700 dark:text-gray-300">
                              {(review.matched_keywords || []).join(", ")}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow key="no-reviews">
                      <TableCell colSpan={showCustomerColumn && showLinkColumn && showMatchedKeywords ? 6 : showCustomerColumn && (showLinkColumn || showMatchedKeywords) ? 5 : showLinkColumn && showMatchedKeywords ? 5 : showCustomerColumn || showLinkColumn || showMatchedKeywords ? 4 : 3} className="text-center py-8 text-black" style={{ color: '#000' }}>
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
              onClick={() => {}}
              className="flex items-center space-x-2"
            >
              <FileText className="w-4 h-4 mr-2" />
              Download Complete Brand Report (PDF)
            </Button>
            <p className="text-sm text-gray-500 mt-2">Includes all metrics, trends, keywords, and review details</p>
          </div>
        </div>

        {/* Chart Modals */}
        <SentimentTrendChart
          isOpen={showTrendChart}
          onClose={() => setShowTrendChart(false)}
          data={analytics?.monthly_trends || []}
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
          <>
            <div className="fixed inset-0 bg-black bg-opacity-40 z-40 transition-opacity" />
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="bg-white dark:bg-[#18181b] dark:border dark:border-gray-700 dark:shadow-2xl rounded-lg shadow-lg p-6 w-full max-w-lg transition-colors">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-black dark:text-white">Manage Sizing & Fit Keywords</h2>
                  <Button variant="ghost" className="bg-black hover:bg-black focus:bg-black active:bg-black transition-transform duration-150 transform hover:scale-110 focus:scale-110" onClick={() => setShowKeywordsModal(false)}>
                    <X className="w-5 h-5 text-white" />
                  </Button>
                </div>
                <KeywordsManager
                  onKeywordsChange={setCurrentKeywords}
                  hideTitle
                  hideDescription
                  initialKeywords={customKeywords}
                />
              </div>
            </div>
          </>
        )}

        {/* AI Report Modal */}
        {showAIReportModal && (
          <>
            <div className="fixed inset-0 bg-black bg-opacity-40 z-40 transition-opacity" />
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="bg-white dark:bg-[#18181b] dark:border dark:border-gray-700 dark:shadow-2xl rounded-lg shadow-lg p-6 w-full max-w-5xl transition-colors">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-black dark:text-white">AI Report Center</h2>
                  <Button variant="ghost" className="bg-black hover:bg-black focus:bg-black active:bg-black transition-transform duration-150 transform hover:scale-110 focus:scale-110" onClick={() => setShowAIReportModal(false)}>
                    <X className="w-5 h-5 text-white" />
                  </Button>
                </div>
                
                {/* Tab Navigation */}
                <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setShowHistoryTab(false)}
                    className={`pb-2 px-1 transition-colors duration-200 ${
                      !showHistoryTab
                        ? "border-b-2 border-blue-500 text-blue-600 font-medium"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    New Report
                  </button>
                  <button
                    onClick={() => setShowHistoryTab(true)}
                    className={`pb-2 px-1 transition-colors duration-200 ${
                      showHistoryTab
                        ? "border-b-2 border-blue-500 text-blue-600 font-medium"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    History ({aiReportHistory.length})
                  </button>
                </div>
                
                {/* Tab Content */}
                {!showHistoryTab ? (
                  /* New Report Tab */
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="ai-prompt" className="text-sm font-medium">Enter your prompt for the AI report:</Label>
                    <Input
                      id="ai-prompt"
                      placeholder="e.g., Analyze sizing complaints and provide recommendations..."
                      value={aiReportPrompt}
                      onChange={(e) => setAIReportPrompt(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      Based on {unifiedFilteredReviews.length} filtered reviews
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowAIReportModal(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!aiReportPrompt.trim()) return;
                          setIsGeneratingReport(true);
                          try {
                            // Calculate date range for AI report
                            let reportStartDate: Date | null = null;
                            let reportEndDate: Date | null = null;
                            
                            if (filters.dateFilter && filters.dateFilter !== 'all') {
                              const now = new Date();
                              switch (filters.dateFilter) {
                                case '7d':
                                  reportStartDate = subDays(now, 7);
                                  break;
                                case '30d':
                                  reportStartDate = subDays(now, 30);
                                  break;
                                case '3m':
                                  reportStartDate = subMonths(now, 3);
                                  break;
                                case '6m':
                                  reportStartDate = subMonths(now, 6);
                                  break;
                                case 'custom':
                                  if (filters.customStartDate && filters.customEndDate) {
                                    reportStartDate = parseISO(filters.customStartDate);
                                    reportEndDate = parseISO(filters.customEndDate);
                                  }
                                  break;
                              }
                            }
                            
                            // Call backend API to generate report with the actual filtered data
                            const response = await fetch(`${getApiBaseUrl()}/generate-report`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                brand_name: id,
                                prompt: aiReportPrompt,
                                reviews_data: unifiedFilteredReviews // Send the actual filtered reviews
                              })
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to generate report');
                            }
                            
                            const data = await response.json();
                            setGeneratedReport(data.report);
                            
                            // Save to history
                            const historyItem = {
                              id: Date.now(),
                              prompt: aiReportPrompt,
                              report: data.report,
                              timestamp: new Date().toISOString(),
                              filters: {
                                category: filters.category,
                                rating: filters.rating,
                                dateFilter: filters.dateFilter,
                                customStartDate: filters.customStartDate,
                                customEndDate: filters.customEndDate,
                                keyword: reviewFilters.keyword
                              },
                              reviewCount: unifiedFilteredReviews.length,
                              brandName: meta.name
                            };
                            setAiReportHistory(prev => [historyItem, ...prev]);
                          } catch (error) {
                            console.error("Error generating report:", error);
                            setGeneratedReport("Error generating report. Please try again.");
                          } finally {
                            setIsGeneratingReport(false);
                          }
                        }}
                        disabled={!aiReportPrompt.trim() || isGeneratingReport}
                      >
                        {isGeneratingReport ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          "Generate Report"
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {generatedReport && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center mb-3">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-3">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-green-800 dark:text-green-200">Report Generated Successfully!</h3>
                      </div>
                      <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                        Your AI report has been generated based on {unifiedFilteredReviews.length} filtered reviews. 
                        Download it in your preferred format below.
                      </p>
                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            import("@/lib/export-utils").then(({ exportAIReportAsPDF }) => {
                              exportAIReportAsPDF(generatedReport, meta.name, aiReportPrompt)
                            })
                          }}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download PDF
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="border-green-600 text-green-600 hover:bg-green-50"
                          onClick={() => {
                            import("@/lib/export-utils").then(({ exportAIReportAsWord }) => {
                              exportAIReportAsWord(generatedReport, meta.name, aiReportPrompt)
                            })
                          }}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download Word
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                ) : (
                  /* History Tab */
                  <div className="space-y-4">
                    {aiReportHistory.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>No AI reports generated yet.</p>
                        <p className="text-sm">Generate your first report to see it here.</p>
                      </div>
                    ) : (
                      <>
                        {/* History Header with Clear All Button */}
                        <div className="flex justify-between items-center mb-4">
                          <div className="text-sm text-gray-600">
                            {aiReportHistory.length} report{aiReportHistory.length !== 1 ? 's' : ''} in history
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete all ${aiReportHistory.length} reports from history? This action cannot be undone.`)) {
                                setAiReportHistory([]);
                              }
                            }}
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300 hover:border-red-400 transition-all duration-200 hover:scale-105"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Clear All History
                          </Button>
                        </div>
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {aiReportHistory.map((item) => (
                          <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors duration-200">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <h4 className="font-medium text-sm truncate pr-4">{item.prompt}</h4>
                                <div className="text-xs text-gray-500 mt-1">
                                  {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString()} • {item.reviewCount} reviews
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    import("@/lib/export-utils").then(({ exportAIReportAsPDF }) => {
                                      exportAIReportAsPDF(item.report, item.brandName, item.prompt)
                                    })
                                  }}
                                  className="text-xs transition-transform duration-200 hover:scale-105"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  PDF
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    import("@/lib/export-utils").then(({ exportAIReportAsWord }) => {
                                      exportAIReportAsWord(item.report, item.brandName, item.prompt)
                                    })
                                  }}
                                  className="text-xs transition-transform duration-200 hover:scale-105"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Word
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    // Confirm before deleting
                                    if (window.confirm('Are you sure you want to delete this report from history?')) {
                                      setAiReportHistory(prev => prev.filter(historyItem => historyItem.id !== item.id));
                                    }
                                  }}
                                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300 hover:border-red-400 transition-all duration-200 hover:scale-105"
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                            
                            {/* Filter Context */}
                            <div className="text-xs text-gray-600 mb-2">
                              <strong>Filters used:</strong>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {!item.filters.category.includes("all") && (
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                    Categories: {item.filters.category.join(", ")}
                                  </span>
                                )}
                                {!item.filters.rating.includes("all") && (
                                  <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                                    Ratings: {item.filters.rating.join(", ")}★
                                  </span>
                                )}
                                {item.filters.dateFilter !== "all" && (
                                  <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                    Date: {item.filters.dateFilter === "custom" 
                                      ? `${item.filters.customStartDate} to ${item.filters.customEndDate}`
                                      : item.filters.dateFilter}
                                  </span>
                                )}
                                {item.filters.keyword && (
                                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                                    Keyword: "{item.filters.keyword}"
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Report Preview */}
                            <div className="text-xs text-gray-700 bg-gray-100 p-2 rounded max-h-20 overflow-hidden">
                              {item.report.substring(0, 200)}...
                            </div>
                          </div>
                        ))}
                      </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Unified Filter Dialog/Modal */}
        {/* This dialog is now handled by the button above the table */}
      </div>
    </div>
  )
}

