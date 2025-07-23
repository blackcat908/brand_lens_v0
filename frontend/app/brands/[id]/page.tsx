"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Star, ThumbsUp, ThumbsDown, Download, FileText, Filter, X, BarChart3, PieChart, Settings, Globe, SlidersHorizontal, ChevronDown, Loader2, RotateCw, Meh, Image, Upload, Trash2 } from "lucide-react"
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
import { format, subDays, subMonths, isAfter, isBefore, parseISO } from "date-fns"
import { apiService, canonicalBrandId } from "@/lib/api-service"
import { BrandLogo } from "@/components/brand-logo";
import winkLemmatizer from 'wink-lemmatizer';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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
  
  // First, highlight keywords in yellow
  const escapedKeywords = keywords
    .filter(Boolean)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
    
  if (escapedKeywords.length > 0) {
    const keywordRegex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
    result = result.replace(keywordRegex, match =>
    `<mark class="bg-yellow-200 text-yellow-900 px-1 rounded font-medium">${match}</mark>`
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
    category: "Sizing & Fit Mentions",
    rating: "all",
    dateFilter: "all",
    customStartDate: "",
    customEndDate: ""
  });
  const [pendingFilters, setPendingFilters] = useState(filters);
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
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalReviews, setTotalReviews] = useState(0);

  // Logo management state
  const [showLogoDialog, setShowLogoDialog] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

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

  // Fetch reviews from backend with pagination and filters
  useEffect(() => {
    console.log('Current filters state:', filters);
    let isMounted = true;
    setLoading(true);
    setError(null);
    async function fetchData() {
      try {
        const apiFilters: any = {};
        if (filters.category && filters.category !== "all") {
          apiFilters.category = filters.category;
        }
        if (filters.rating && filters.rating !== "all") {
          apiFilters.rating = Number(filters.rating);
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
        console.log('Sending apiFilters to reviews API:', apiFilters);
        const reviewsResp = await apiService.getBrandReviewsByFrontendId(id, currentPage, pageSize, apiFilters);
        if (!isMounted) return;
        setReviews(reviewsResp.reviews);
        setTotalReviews(reviewsResp.total_reviews || 0);
        // 2. Fix analytics fetch to use correct brand id mapping
        const analyticsResp = await apiService.getBrandAnalyticsByFrontendId(id, apiFilters);
        if (!isMounted) return;
        setAnalytics(analyticsResp);
      } catch (err: any) {
        setError(err.message || "Failed to load data");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchData();
    return () => { isMounted = false; };
  }, [id, currentPage, pageSize, filters]);

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
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    rating: "all",
    keyword: "",
    ratings: [],
  })

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

  // Only use backend-filtered reviews; if you want to keep client-side search, filter here
  const filteredReviews = reviewFilters.keyword
    ? reviews.filter(r => (r.review || '').toLowerCase().includes(reviewFilters.keyword.toLowerCase()))
    : reviews;

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

  const [showKeywordsModal, setShowKeywordsModal] = useState(false)
  const [showSourcePopover, setShowSourcePopover] = useState(false)
  const totalPages = Math.ceil(totalReviews / pageSize);
  // 1. Add state for dynamic columns
  const [showCustomerColumn, setShowCustomerColumn] = useState(false);
  const [showLinkColumn, setShowLinkColumn] = useState(false);
  // Add state for showing matched keywords column
  const [showMatchedKeywords, setShowMatchedKeywords] = useState(false);

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
        const nameA = (a.customer || "").toLowerCase();
        const nameB = (b.customer || "").toLowerCase();
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

  // Fix Sizing & Fit Mentions total count (with fallback)
  const totalSizingFitReviews = reviewsWithSizingFitMentions.length;

  // Helper: Get all reviews (for avg rating, sentiment score)
  const allReviews = reviews;

  // Average Rating: from all reviews
  const averageRating = allReviews.length > 0 ? (allReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / allReviews.length) : 0;

  // Sentiment Score: from all reviews
  const sentimentScore = allReviews.length > 0 ? (allReviews.reduce((sum, r) => sum + (Number(r.sentiment_score) || 0), 0) / allReviews.length) : 0;

  // Positive/Negative/Neutral chart: from filteredReviews
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
    console.log('[UPDATE] Starting update for brand:', id);
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
      const apiUrl = `${getApiBaseUrl()}/scrape_brand`;
      const requestBody = { brand: id };
      console.log('[UPDATE] Calling API:', apiUrl);
      console.log('[UPDATE] Request body:', requestBody);
      
      // Instead of calling the Next.js /api/scrape endpoint, call the Flask backend /api/scrape_brand endpoint
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log('[UPDATE] Response status:', res.status);
      console.log('[UPDATE] Response ok:', res.ok);
      setUpdateStep('done');
      await new Promise(res => setTimeout(res, 400));
      setUpdateStep('updating');
      if (!res.ok) {
        console.error('[UPDATE] Response not ok:', res.status, res.statusText);
        throw new Error("Failed to fetch");
      }
      const data = await res.json();
      console.log('[UPDATE] Response data:', data);
      const newReviews = data.newReviews ?? data.new_reviews ?? data.newReviewsCount ?? data.added_count ?? 0;
      console.log('[UPDATE] New reviews count:', newReviews);
      
      // Fetch reviews with current pagination settings instead of all reviews
      const apiFilters: any = {};
      if (filters.category && filters.category !== "all") {
        apiFilters.category = filters.category;
      }
      if (filters.rating && filters.rating !== "all") {
        apiFilters.rating = Number(filters.rating);
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

  // Logo management functions
  const handleLogoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setLogoError('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setLogoError('File size must be less than 5MB');
        return;
      }
      
      setLogoFile(file);
      setLogoError(null);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
  };

  const uploadLogo = async () => {
    if (!logoFile || !id) return;
    
    try {
      setLogoUploading(true);
      setLogoError(null);
      
      // Convert file to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        }
        reader.readAsDataURL(logoFile);
      });
      
      // Upload to backend
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') + '/api';
      const response = await fetch(`${apiUrl}/upload_logo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brand_name: id,
          logo_data: base64,
          logo_filename: logoFile.name,
          logo_mime_type: logoFile.type
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload logo');
      }
      
      const result = await response.json();
      toast({
        title: "Logo uploaded successfully!",
        description: `Logo for ${id} has been updated.`,
      });
      
      setShowLogoDialog(false);
      removeLogo();
      
      // Refresh the page to show the new logo
      window.location.reload();
      
    } catch (error) {
      console.error('Logo upload error:', error);
      setLogoError('Failed to upload logo. Please try again.');
    } finally {
      setLogoUploading(false);
    }
  };

  const deleteLogo = async () => {
    if (!id) return;
    
    try {
      setLogoUploading(true);
      setLogoError(null);
      
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') + '/api';
      const response = await fetch(`${apiUrl}/logos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete logo');
      }
      
      toast({
        title: "Logo deleted successfully!",
        description: `Logo for ${id} has been removed.`,
      });
      
      setShowLogoDialog(false);
      
      // Refresh the page to show the placeholder
      window.location.reload();
      
    } catch (error) {
      console.error('Logo deletion error:', error);
      setLogoError('Failed to delete logo. Please try again.');
    } finally {
      setLogoUploading(false);
    }
  };

  // Show loading spinner or error if needed
  if (loading || reviews.length === 0) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin mr-2" /> Loading reviews and analytics...</div>;
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
      <div className="flex items-center justify-center h-64 text-lg text-gray-500">
        No reviews match the selected category.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
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
            <BrandLogo src={meta.logo} alt={`${meta.name} logo`} maxWidth={80} maxHeight={80} brandName={meta.name} />
            <div>
              <h1 className="text-3xl font-bold text-foreground">{meta.name}</h1>
              <p className="text-gray-600">Last updated: {analytics?.last_updated || 'Never'}</p>
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
            <Dialog open={showLogoDialog} onOpenChange={setShowLogoDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Image className="w-4 h-4 mr-1" />
                  Logo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogTitle>Manage Brand Logo</DialogTitle>
                <div className="space-y-4">
                  {/* Current Logo Preview */}
                  <div>
                    <Label className="text-sm font-medium">Current Logo</Label>
                    <div className="mt-2 flex items-center space-x-4">
                      <div className="w-16 h-16 border border-gray-300 rounded-md flex items-center justify-center overflow-hidden">
                        <BrandLogo 
                          src={meta.logo} 
                          alt={`${meta.name} logo`} 
                          maxWidth={64} 
                          maxHeight={64} 
                          brandName={meta.name}
                        />
                      </div>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={deleteLogo}
                        disabled={logoUploading}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Upload New Logo */}
                  <div>
                    <Label className="text-sm font-medium">Upload New Logo</Label>
                    <div className="mt-2 space-y-3">
                      {/* Logo Preview */}
                      {logoPreview && (
                        <div className="relative inline-block">
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="w-20 h-20 object-contain border border-gray-300 rounded-lg"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute -top-2 -right-2 w-6 h-6 p-0"
                            onClick={removeLogo}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      
                      {/* Upload Button */}
                      <div className="flex items-center space-x-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoSelect}
                          className="hidden"
                          id="logo-upload-input"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById('logo-upload-input')?.click()}
                          disabled={logoUploading}
                          className="flex items-center space-x-2"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{logoFile ? 'Change Logo' : 'Choose Logo'}</span>
                        </Button>
                      </div>
                      
                      {/* Error Message */}
                      {logoError && (
                        <p className="text-sm text-red-600">{logoError}</p>
                      )}
                      
                      <p className="text-xs text-gray-500">
                        Supported formats: JPG, PNG, GIF. Max size: 5MB.
                      </p>
                    </div>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowLogoDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={uploadLogo} 
                    disabled={!logoFile || logoUploading}
                  >
                    {logoUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Upload Logo'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
              <p className="text-[11px] text-gray-500 text-center">Sizing & Fit mentions</p>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center">Average Rating</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-center">
              <div className="flex items-center justify-center space-x-2 text-center">
                <div className="text-2xl font-bold">{averageRating.toFixed(1)}</div>
                <Star className="w-5 h-5 text-yellow-500" />
              </div>
              <p className="text-xs text-gray-500 text-center">From all reviews</p>
            </CardContent>
          </Card>

          {/* Clickable Positive vs Negative Card */}
          <Card className="relative overflow-hidden bg-card text-card-foreground h-full p-0 min-w-[180px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center">Positive vs Negative</CardTitle>
            </CardHeader>
            <CardContent className="pb-2 flex flex-col items-center justify-center">
              <div className="flex items-center mb-1 w-full justify-center space-x-4">
                <div className="flex items-center space-x-2">
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
              {/* Spacer to align button with Monthly Trend card */}
              <div className="h-4 mb-1" />
              <Button
                onClick={() => setShowDistributionChart(true)}
                className="w-full bg-black text-white border border-black hover:bg-zinc-800 hover:text-white mt-1"
                size="sm"
              >
                <PieChart className="w-4 h-4 mr-2" />
                See Chart
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center">Sentiment Score</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold text-center">{(analytics?.average_sentiment_score ?? 0).toFixed(2)}</div>
              <Badge
                className={
                  ((analytics?.average_sentiment_score ?? 0) > 0.3
                    ? "bg-green-100 text-green-800"
                    : (analytics?.average_sentiment_score ?? 0) <= -0.1
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800") +
                  " text-base font-bold px-4 py-1.5 min-w-[70px]"
                }
              >
                {(analytics?.average_sentiment_score ?? 0) > 0.3
                  ? "Positive"
                  : (analytics?.average_sentiment_score ?? 0) <= -0.1
                  ? "Negative"
                  : "Neutral"}
              </Badge>
            </CardContent>
          </Card>

          {/* Clickable Monthly Trend Card */}
          <Card className="relative overflow-hidden bg-card text-card-foreground h-full p-0 min-w-[180px] shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader className="pt-2 pb-0 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-1 text-center">Monthly Trend</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 pb-2 flex flex-col items-center justify-center">
              <div className="flex justify-center items-center h-10 mb-1">
                <svg width="72" height="40" viewBox="0 0 72 40">
                  <rect x="3" y="33" width="6" height="12" rx="3" fill="#3b82f6" />
                  <rect x="12" y="24" width="6" height="21" rx="3" fill="#3b82f6" />
                  <rect x="21" y="15" width="6" height="30" rx="3" fill="#3b82f6" />
                  <rect x="30" y="9" width="6" height="36" rx="3" fill="#3b82f6" />
                  <rect x="39" y="15" width="6" height="30" rx="3" fill="#3b82f6" />
                  <rect x="48" y="21" width="6" height="24" rx="3" fill="#3b82f6" />
                  <rect x="57" y="27" width="6" height="18" rx="3" fill="#3b82f6" />
                </svg>
              </div>
              <Button
                onClick={() => setShowTrendChart(true)}
                className="w-full bg-black text-white border border-black hover:bg-zinc-800 hover:text-white mt-1"
                size="sm"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Details
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card text-card-foreground h-full p-1 shadow-lg transition-transform transition-shadow duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader className="pt-0 pb-1 px-2">
              <CardTitle className="text-base font-bold text-foreground mb-2">Top Issues</CardTitle>
            </CardHeader>
            <CardContent className="pt-2 px-2 pb-1">
              <div className="flex flex-wrap gap-1 mt-0">
                {(() => {
                  const keywordCounts: Record<string, { count: number; sentiment: string[] }> = {};
                  filteredReviews.forEach(r => {
                    currentKeywords.forEach((keyword: string) => {
                      if (r.review && r.review.toLowerCase().includes(keyword.toLowerCase())) {
                        if (!keywordCounts[keyword]) keywordCounts[keyword] = { count: 0, sentiment: [] };
                        keywordCounts[keyword].count++;
                        if (r.sentiment) keywordCounts[keyword].sentiment.push(r.sentiment);
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
        <Card className="mb-8 bg-card text-card-foreground shadow-lg">
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
                <div className="flex items-center gap-2 justify-end mb-4">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search in reviews..."
                      value={reviewFilters.keyword}
                      onChange={e => handleFilterChange('keyword', e.target.value)}
                      className="h-10 w-64 text-sm"
                    />
                  </div>
                  <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="h-10 px-6 text-base hover:scale-105 transition-transform duration-200">Filter</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle>Filter Reviews</DialogTitle>
                      {/* Category dropdown */}
                      <div className="mb-4">
                        <Label htmlFor="filter-category">Category</Label>
                        <Select value={pendingFilters.category} onValueChange={value => setPendingFilters(f => ({ ...f, category: value }))}>
                          <SelectTrigger className="h-8 text-xs px-2 bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-300 dark:border-zinc-700">
                            <SelectValue placeholder="All Reviews" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Reviews</SelectItem>
                            {Object.keys(customKeywords).map((cat: string) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Rating dropdown */}
                      <div className="mb-4">
                        <Label htmlFor="filter-rating">Rating</Label>
                        <Select value={pendingFilters.rating} onValueChange={value => setPendingFilters(f => ({ ...f, rating: value }))}>
                          <SelectTrigger className="h-8 text-xs px-2 bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-300 dark:border-zinc-700">
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
                      {/* Date filter dropdown */}
                      <div className="mb-4">
                        <Label htmlFor="filter-date">Date</Label>
                        <Select value={pendingFilters.dateFilter} onValueChange={value => setPendingFilters(f => ({ ...f, dateFilter: value }))}>
                          <SelectTrigger className="h-8 text-xs px-2 bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-300 dark:border-zinc-700">
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
                          <div className="flex gap-2 mt-2">
                            <input type="date" value={pendingFilters.customStartDate} onChange={e => setPendingFilters(f => ({ ...f, customStartDate: e.target.value }))} className="border rounded px-2 py-1 text-xs h-8" />
                            <span className="text-xs">to</span>
                            <input type="date" value={pendingFilters.customEndDate} onChange={e => setPendingFilters(f => ({ ...f, customEndDate: e.target.value }))} className="border rounded px-2 py-1 text-xs h-8" />
                          </div>
                        )}
                      </div>

                      <DialogFooter>
                        <Button onClick={() => setFilterDialogOpen(false)} variant="outline">Cancel</Button>
                        <Button
                          onClick={() => {
                            setFilters(pendingFilters);
                            setCurrentPage(1);
                            setFilterDialogOpen(false);
                          }}
                          variant="default"
                        >
                          Apply Filters
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  {/* CSV and Excel download buttons */}
                  <Button
                    variant="outline"
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
                    onClick={() => {
                      import("@/lib/export-utils").then(({ exportReviewsAsExcel }) => {
                        exportReviewsAsExcel(filteredReviews, meta.name)
                      })
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Excel
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Filters Section */}
              {/* The category filter tabs are removed from here */}
            </div>
          </CardHeader>
          <CardContent>
            {/* 2. Add checkboxes above the table */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={showCustomerColumn}
                    onChange={e => setShowCustomerColumn(e.target.checked)}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Show Customer Name</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={showLinkColumn}
                    onChange={e => setShowLinkColumn(e.target.checked)}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Show Link column</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={showMatchedKeywords}
                    onChange={e => setShowMatchedKeywords(e.target.checked)}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Show Matched Keywords</span>
                </label>
              </div>
              <div className="text-sm text-gray-600">
                Showing {reviews.length} of {totalReviews} reviews
              </div>
            </div>
            {/* The category filter tabs are removed from here */}
            <TooltipProvider>
              <Table className="bg-white text-black table-fixed w-full">
                {/* 3. Table header: render columns conditionally */}
                <TableHeader>
                  <TableRow>
                    {showCustomerColumn && <TableHead className="w-32 min-w-[8rem] max-w-[8rem] cursor-pointer select-none font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700" onClick={() => handleSort("customer")}>Customer{sortBy === "customer" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>}
                    <TableHead className="w-28 min-w-[7rem] max-w-[7rem] cursor-pointer select-none text-nowrap font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700" onClick={() => handleSort("date")}>Date{sortBy === "date" && (sortDirection === "asc" ? " ▲" : " ▼")}</TableHead>
                    <TableHead className="w-20 min-w-[5rem] max-w-[5rem] cursor-pointer select-none text-nowrap font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700" onClick={() => handleSort("rating")}>Rating{sortBy === "rating" && (sortDirection === "asc" ? " ▲" : " ▼")} <Star className="inline w-4 h-4 text-yellow-500 ml-1" /></TableHead>
                    <TableHead className="w-auto font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">Review</TableHead>
                    {showLinkColumn && <TableHead className="w-32 min-w-[8rem] max-w-[8rem] font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">Link</TableHead>}
                    {showMatchedKeywords && <TableHead className="w-48 min-w-[12rem] max-w-[16rem] font-bold bg-white dark:bg-zinc-900 text-black dark:text-white border-gray-200 dark:border-zinc-700">Matched Keywords</TableHead>}
                  </TableRow>
                </TableHeader>
                {/* 3. Table body: render columns conditionally */}
                <TableBody>
                  {reviews.length > 0 ? (
                    reviews.map((review, idx) => {
                      const reviewKey = getReviewKey(review, idx);
                      const isExpanded = expandedReviews[reviewKey];
                      const isNew = newlyAddedReviewIds.has(reviewKey);
                      // Determine which keywords to highlight for this review
                      const highlightKeywordsForReview = selectedCategories.length === 0
                        ? allCategoryKeywords
                        : selectedCategories.flatMap(getCategoryKeywords);
                      const highlightKeywordsArray =
                        filters.category === "all" || filters.category === "All Reviews"
                          ? review.matched_keywords || []
                          : getCategoryKeywords(filters.category);
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
                          <TableCell className="whitespace-pre-line text-sm">
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
                      <TableCell colSpan={showLinkColumn ? 5 : 4} className="text-center py-8 text-black" style={{ color: '#000' }}>
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

        {/* Unified Filter Dialog/Modal */}
        {/* This dialog is now handled by the button above the table */}
      </div>
    </div>
  )
}
