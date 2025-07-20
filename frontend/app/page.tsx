"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Building2, TrendingUp, Star, Plus, Moon, Sun, Trash2, MoreHorizontal, Settings, Loader2, X } from "lucide-react"
import { CreateBrandModal } from "@/components/create-brand-modal"
import { Star as StarIcon, Pin } from "lucide-react"
import { apiService } from "@/lib/api-service"
import mockBrands from '@/lib/mock-brands.json';
import { BrandLogo } from "@/components/brand-logo";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
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

  // Fetch only summary brand data from backend API
  const fetchBrandsSummary = async () => {
    setLoading(true);
    try {
      const resp = await apiService.getBrands();
      setBrands(resp || []);
    } catch (e) {
      setBrands([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    fetchBrandsSummary();
  }, []);

  // Polling for syncing brands with 0 reviews (optional, can keep or remove)
  React.useEffect(() => {
    const hasSyncing = brands.some(b => b.reviewCount === 0);
    if (!hasSyncing) return;
    const interval = setInterval(() => {
      fetchBrandsSummary();
    }, 5000);
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
        // Stop polling if we have a logo AND reviews, or if we have reviews (even without logo)
        const hasLogo = newBrand.logo && !newBrand.logo.includes('placeholder');
        const hasReviews = newBrand.reviewCount && newBrand.reviewCount > 0;
        // Only stop polling if scraping is truly complete (e.g., backend status or review count no longer increasing)
        // For now, keep polling until backend confirms scraping is done or cancelled
        // (You may want to add a backend status flag in the future)
        if ((hasLogo && hasReviews) || hasReviews) {
          // Comment out the stop logic to keep polling until backend confirms done
          // setPolling(false);
          // pollingBrandRef.current = "";
          // clearInterval(interval);
          // clearTimeout(timeout);
        }
      }
    }, 3000); // <-- Set polling interval to 3 seconds
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [polling]);

  useEffect(() => {
    localStorage.setItem('pinnedBrands', JSON.stringify(pinnedBrands));
  }, [pinnedBrands]);

  // Sort brands: pinned first
  const sortedBrands = [
    ...brands.filter(b => pinnedBrands.includes(b.brand)),
    ...brands.filter(b => !pinnedBrands.includes(b.brand)),
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
      <div className="max-w-6xl mx-auto px-2 py-6">
        {/* Remove darkMode state, toggleDarkMode, and the toggle button from the JSX */}
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-foreground mb-1 animate-fade-in">Brand Review Dashboard</h1>
          <div className="flex justify-between items-center animate-fade-in-delay">
            <p className="text-gray-600 text-sm">Monitor sizing and fit sentiment across tracked brands</p>
            <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
                className="group flex items-center space-x-1.5 h-9 px-3 text-sm font-medium rounded-md shadow-none border border-gray-300 bg-white text-black hover:bg-black hover:text-white hover:shadow-2xl hover:scale-110 transition-all duration-200"
            >
                <Plus className="w-4 h-4 transition-colors duration-150 group-hover:animate-wiggle" />
              <span>Create New Brand</span>
            </Button>
            {(manageMode || pinMode) ? (
                <Button
                onClick={() => { setManageMode(false); setPinMode(false); }}
                  className="flex items-center space-x-1.5 h-9 px-3 text-sm font-medium rounded-md shadow-none border border-gray-300 bg-blue-50 hover:bg-[#2563eb] hover:text-white text-blue-700"
                >
                  <span>Done</span>
                </Button>
              ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <button
                  className="group flex items-center justify-center h-9 w-9 rounded-md border border-gray-300 bg-white text-black hover:bg-black hover:text-white hover:shadow-2xl hover:scale-110 hover:border-black transition-all duration-200"
                    title="Settings"
                  style={{ outline: 'none' }}
                >
                  <Settings className="w-5 h-5 transition-colors duration-150 group-hover:animate-wiggle" />
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
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-0 gap-y-8 max-w-full">
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
                  className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:-translate-y-2 hover:bg-gray-50 bg-white dark:bg-zinc-900 text-card-foreground border border-gray-200 rounded-md p-0 shadow-md min-h-[90px] min-w-[220px] max-w-[320px]"
                  style={{
                    animationDelay: `${index * 80}ms`,
                    animationFillMode: "both",
                    // Remove fixed height to allow content to dictate height
                  }}
                >
                  {/* Header Section */}
                  <CardHeader className="pb-2 p-2">
                    <div className="flex items-center justify-between space-x-2 relative">
                      <div className="flex items-center space-x-2">
                        <div className="relative w-16 h-16 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 bg-white">
                          <BrandLogo
                            src={brand.logo || "/placeholder-logo.png"}
                            alt={`${brand.brand} logo`}
                            maxWidth={80}
                            maxHeight={80}
                          />
                          {isSyncing && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-md">
                              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg font-bold text-foreground group-hover:text-blue-600 transition-colors duration-200 truncate flex items-center">
                            {brand.brand}
                            {/* Always show yellow pin for pinned brands */}
                            {isPinned && !pinMode && (
                              <Pin className="w-4 h-4 ml-2 text-yellow-500 fill-yellow-400" title="Pinned" />
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
                          {/* Update the Badge for reviews count to ensure it is always a compact pill: */}
                          <Badge variant="outline" className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-normal border border-gray-300 bg-white text-gray-800 mt-1 w-auto">
                            <Building2 className="w-3 h-3" />
                            <span>{brand.reviewCount?.toLocaleString() || 0} reviews</span>
                          </Badge>
                          {isSyncing && (
                            <span className="inline-flex items-center px-2 py-0.5 mt-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded animate-pulse">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing…
                            </span>
                          )}
                        </div>
                      </div>
                      {/* In the CardHeader, update the avg rating badge: */}
                      <div
                        className={
                          'absolute top-0 right-0 mt-1 mr-2 inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border w-auto border-gray-300 bg-transparent'
                        }
                        style={{ justifyContent: 'flex-end' }}
                      >
                        <span className={
                          (brand.avgRating > 4
                            ? 'text-green-700'
                            : brand.avgRating >= 3
                            ? 'text-yellow-700'
                            : 'text-red-700') + ' font-bold'
                        }>{brand.avgRating ? brand.avgRating.toFixed(1) : 'N/A'}</span>
                        <Star className="w-3.5 h-3.5 ml-1 text-gray-800" />
                      </div>
                    </div>
                  </CardHeader>

                  {/* Content Section */}
                  <CardContent className="pt-1 p-2 overflow-hidden">
                    {/* Badges Row */}
                    {/* The reviews count badge is now moved to the CardHeader */}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
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
