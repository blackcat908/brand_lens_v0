"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Building2, TrendingUp, Star, Plus, Moon, Sun, Trash2, MoreHorizontal, Settings, Loader2, X, Search, Search as SearchIcon } from "lucide-react"
import { CreateBrandModal } from "@/components/create-brand-modal"
import { Star as StarIcon, Pin } from "lucide-react"
import { apiService } from "@/lib/api-service"
import mockBrands from '@/lib/mock-brands.json';
import { BrandLogo } from "@/components/brand-logo";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useLogos } from "@/hooks/use-logos";
import React from "react";

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

// Add a function to get the rating color
function getRatingColor(rating: number) {
  if (rating > 4) return "text-green-600";
  if (rating >= 3) return "text-orange-500";
  return "text-red-600";
}

// When mapping brands, use brand_name only
function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<any[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [manageMode, setManageMode] = React.useState(false);
  const [pinMode, setPinMode] = React.useState(false);
  const [pinnedBrands, setPinnedBrands] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        return JSON.parse(localStorage.getItem('pinnedBrands') || '[]');
      } catch {
        return [];
      }
    }
    return [];
  });
  const [polling, setPolling] = useState(false);
  const pollingBrandRef = useRef("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dark mode functionality
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  
  // Initialize logos hook
  const { logos, loading: logosLoading, error: logosError, refetch: refetchLogos } = useLogos();
  
  // Debug logos loading - REMOVED to reduce console spam
  
  // Poll for logo updates every 5 minutes (much reduced frequency)
  React.useEffect(() => {
    const logoPollingInterval = setInterval(() => {
      refetchLogos();
    }, 300000); // 5 minutes (much reduced frequency)
    
    return () => clearInterval(logoPollingInterval);
  }, [refetchLogos]);

  // Fetch only summary brand data from backend API
  const fetchBrandsSummary = async () => {
    try {
      const resp = await apiService.getBrands();
      setBrands(resp || []);
    } catch (e) {
      setBrands([]);
    }
  };

  // Load both logos and brands together to prevent race condition
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      try {
        // Wait for logos to load first
        await refetchLogos();
        // Then load brands
        await fetchBrandsSummary();
      } catch (e) {
        console.error('Error loading data:', e);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, [refetchLogos]);

  // Polling for syncing brands with 0 reviews (much reduced frequency)
  React.useEffect(() => {
    const hasSyncing = brands.some(b => b.reviewCount === 0);
    if (!hasSyncing) return;
    const interval = setInterval(() => {
      fetchBrandsSummary();
    }, 60000); // <-- Reduced to 60 seconds
    return () => clearInterval(interval);
  }, [brands]);

  // Poll for review count after creating a brand (optional, can keep or remove)
  const pollForReviews = (brandId: string) => {
    if (!brandId || typeof brandId !== 'string' || brandId.trim() === '') return;
    const interval = setInterval(async () => {
      try {
        // Just refetch all brands to update UI
        await fetchBrandsSummary();
        clearInterval(interval);
      } catch {}
    }, 3000);
  };

  const handleCreateBrand = (newBrand: any) => {
    setIsCreateModalOpen(false);
    // Add a temporary card with isTemp: true
    setBrands((prev) => [
      { ...newBrand, isTemp: true },
      ...prev,
    ]);
    pollingBrandRef.current = newBrand.brand;
    setPolling(true);
  };

  useEffect(() => {
    if (!polling) return;
    
    // Add timeout to stop polling after 5 minutes
    const timeout = setTimeout(() => {
      setPolling(false);
      pollingBrandRef.current = "";
    }, 5 * 60 * 1000); // 5 minutes
    
    const interval = setInterval(async () => {
      const resp = await apiService.getBrands();
      setBrands((prev) => {
        // Remove any temp cards that match a real backend card
        const realBrands = resp || [];
        const realBrandNames = new Set(realBrands.map(b => b.brand));
        // Keep only temp cards that don't match a real backend card
        const filtered = prev.filter(b => !(b.isTemp && realBrandNames.has(b.brand)));
        return [...realBrands, ...filtered.filter(b => b.isTemp)];
      });
      const newBrand = resp.find(b => b.brand === pollingBrandRef.current);
      if (newBrand) {
        // Stop polling if we have reviews (ultra-fast scraper is done)
        const hasReviews = newBrand.reviewCount && newBrand.reviewCount > 0;
        if (hasReviews) {
          setPolling(false);
          pollingBrandRef.current = "";
          clearInterval(interval);
          clearTimeout(timeout);
        }
      }
    }, 600000); // <-- Increased to 10 minutes to reduce GET requests
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [polling]);

  useEffect(() => {
    localStorage.setItem('pinnedBrands', JSON.stringify(pinnedBrands));
  }, [pinnedBrands]);

  // Filter and sort brands: search first, then pinned first
  const filteredBrands = brands.filter(brand => 
    brand.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const sortedBrands = [
    ...filteredBrands.filter(b => pinnedBrands.includes(b.brand)),
    ...filteredBrands.filter(b => !pinnedBrands.includes(b.brand)),
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
      {/* Brand Lens Header - Black Background with White Elements */}
      <header className="sticky top-0 z-50 bg-black shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo and Name */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center relative">
                {/* Simple version of the magnifying glass + shirt concept */}
                <div className="relative">
                  <SearchIcon className="w-5 h-5 text-black" />
                  <div className="absolute -top-1 -left-1 w-2 h-1.5 bg-black/40 rounded-sm transform rotate-12"></div>
                </div>
              </div>
              <span className="text-xl font-bold text-white">Brand Lens</span>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-2xl mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search brands or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-lg bg-white text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent"
                />
              </div>
            </div>

            {/* Navigation Items */}
            <nav className="flex items-center space-x-6">
              <a href="#" className="text-white hover:text-gray-300 font-medium transition-colors">
                Dashboard
              </a>
              <Link href="/analytics" className="text-white hover:text-gray-300 font-medium transition-colors">
                Analytics
              </Link>
              <Link href="/ai-reports" className="text-white hover:text-gray-300 font-medium transition-colors">
                AI Reports
              </Link>
              
              {/* Settings Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <button
                    className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                    aria-label="Settings"
                >
                    <Settings className="w-4 h-4 text-white" />
                </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setManageMode(true); setPinMode(false); }}>
                    <Trash2 className="w-4 h-4 mr-2 text-red-500" /> Delete Brands
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setPinMode(true); setManageMode(false); }}>
                    <Pin className="w-4 h-4 mr-2 text-yellow-500" /> Pin Brands
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Create Brand Button */}
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-white hover:bg-gray-100 text-black px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 hover:shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Brand
              </Button>
              
              {/* Theme Toggle */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                aria-label="Toggle theme"
              >
                {isDarkMode ? (
                  <Sun className="w-4 h-4 text-white" />
                ) : (
                  <Moon className="w-4 h-4 text-white" />
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4">
          <div className="flex justify-end items-center animate-fade-in-delay">
            <div className="flex items-center gap-2">
            {(manageMode || pinMode) && (
                <Button
                onClick={() => { setManageMode(false); setPinMode(false); }}
                  className="flex items-center space-x-1.5 h-9 px-3 text-sm font-medium rounded-md shadow-none border border-gray-300 bg-blue-50 hover:bg-[#2563eb] hover:text-white text-blue-700"
                >
                  <span>Done</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Show loading state while data is being fetched */}
        {(loading || logosLoading) ? (
          <div className="text-center py-12">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
              <span className="text-gray-500 dark:text-gray-400 text-lg">
                Loading brands and logos...
              </span>
            </div>
            <div className="text-gray-400 dark:text-gray-500 text-sm">
              This may take a moment on first load
            </div>
          </div>
        ) : sortedBrands.length === 0 && searchQuery.trim() !== "" ? (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400 text-lg mb-2">
              No brands found for "{searchQuery}"
            </div>
            <div className="text-gray-400 dark:text-gray-500 text-sm">
              Try adjusting your search terms
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-full">
          {sortedBrands.map((brand, index) => {
            const sentimentLabel =
              brand.sentimentScore > 0.3
                ? "Positive"
                : brand.sentimentScore <= -0.1
                ? "Negative"
                : "Neutral";
            const sentimentLabelColor =
              brand.sentimentScore > 0.3
                ? "bg-green-100 text-green-800"
                : brand.sentimentScore <= -0.1
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800";
            const isSyncing = brand.reviewCount === 0 && (brand.isTemp || pollingBrandRef.current === brand.brand);
            const isPinned = pinnedBrands.includes(brand.brand);
            return (
              <Link key={brand.brand} href={`/brands/${encodeURIComponent(brand.brand)}`}>
                <Card
                  className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:-translate-y-2 hover:bg-gray-50 bg-white dark:bg-zinc-900 text-card-foreground border border-gray-200 rounded-xl p-4 shadow-md h-[190px] w-[270px]"
                  style={{
                    animationDelay: `${index * 80}ms`,
                    animationFillMode: "both",
                  }}
                >
                  {/* Trustpilot-style left-aligned layout */}
                  <div className="flex flex-col items-start text-left space-y-3 relative">
                    {/* Logo at the top - bigger like Trustpilot */}
                    <div className="relative w-20 h-20 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 bg-white">
                          <BrandLogo
                            src={brand.logo || "/placeholder-logo.png"}
                            alt={`${brand.brand} logo`}
                            maxWidth={80}
                            maxHeight={80}
                            brandName={brand.brand}
                          />
                          {isSyncing && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-md">
                              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                            </span>
                          )}
                        </div>

                    {/* Brand name below logo */}
                    <CardTitle className="text-lg font-semibold text-foreground group-hover:text-blue-600 transition-colors duration-200 truncate flex items-center justify-start">
                            {brand.brand}
                            {/* Always show yellow pin for pinned brands */}
                            {isPinned && !pinMode && (
                              <Pin className="w-4 h-4 ml-2 text-yellow-500 fill-yellow-400" />
                            )}
                            {/* Show interactive pin button only in pinMode */}
                            {pinMode && (
                              <button
                                className={`ml-2 p-1 rounded z-10 ${isPinned ? 'text-yellow-500' : 'text-gray-400'} hover:bg-yellow-100`}
                                title={isPinned ? 'Unpin brand' : 'Pin brand'}
                                onClick={e => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setPinnedBrands(prev =>
                                    isPinned
                                      ? prev.filter(b => b !== brand.brand)
                                      : [...prev, brand.brand]
                                  );
                                }}
                                style={{ cursor: 'pointer', background: 'transparent', border: 'none' }}
                                tabIndex={0}
                                aria-disabled={false}
                              >
                                <Pin className={`w-4 h-4 ${isPinned ? 'fill-yellow-400' : 'fill-none'}`} />
                              </button>
                            )}
                            {manageMode && (
                              <button
                                className="ml-2 p-1 rounded hover:bg-red-100 text-red-600 z-10"
                                title="Delete brand"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (window.confirm(`Delete brand '${brand.brand}' and all its data? This cannot be undone.`)) {
                                    try {
                                      const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') + '/api'}/brands/${encodeURIComponent(brand.brand)}`, { method: 'DELETE' });
                                      if (res.ok) {
                                        setBrands(brands.filter(b => b.brand !== brand.brand));
                                      } else {
                                        alert("Failed to delete brand.");
                                      }
                                    } catch {
                                      alert("Failed to delete brand.");
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </CardTitle>

                    {/* Rating and review count on same line like Trustpilot */}
                    <div className="flex items-center justify-start space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const avgRating = brand.avgRating || 0;
                        const isFilledStar = star <= Math.round(avgRating);
                        let starColor = 'text-gray-300'; // Default empty star
                        
                        if (isFilledStar) {
                          if (avgRating >= 4) {
                            starColor = 'text-green-500 fill-green-500'; // Green for 4+ rating
                          } else if (avgRating >= 3) {
                            starColor = 'text-yellow-500 fill-yellow-500'; // Yellow for 3-3.9 rating  
                          } else {
                            starColor = 'text-red-500 fill-red-500'; // Red for below 3 rating
                          }
                        }
                        
                        return (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${starColor}`}
                          />
                        );
                      })}
                      <span className="ml-2 text-sm font-bold text-foreground">
                        {brand.avgRating ? brand.avgRating.toFixed(1) : 'N/A'}
                      </span>
                      <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">
                        ({brand.reviewCount?.toLocaleString() || 0})
                      </span>
                    </div>

                    {/* Syncing indicator */}
                    {isSyncing && (
                      <div className="absolute top-0 right-0">
                        <span className="inline-flex items-center px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full animate-pulse">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing…
                        </span>
                      </div>
                    )}
                    </div>
                </Card>
              </Link>
            );
          })}
        </div>
        )}

        <CreateBrandModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateBrand={handleCreateBrand}
          onRefreshLogos={refetchLogos}
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
      <style jsx global>{`
@keyframes wiggle {
  0% { transform: rotate(0deg); }
  10% { transform: rotate(-22deg); }
  25% { transform: rotate(18deg); }
  40% { transform: rotate(-16deg); }
  55% { transform: rotate(12deg); }
  70% { transform: rotate(-8deg); }
  85% { transform: rotate(4deg); }
  100% { transform: rotate(0deg); }
}
.animate-wiggle {
  animation: wiggle 0.7s;
        }
      `}</style>
    </div>
  )
}
