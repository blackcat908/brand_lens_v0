"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Building2, TrendingUp, Star, Plus, Moon, Sun, Trash2, MoreHorizontal, Settings, Loader2 } from "lucide-react"
import { CreateBrandModal } from "../components/create-brand-modal"
import { Star as StarIcon } from "lucide-react"
import { apiService } from "../lib/api-service"
import mockBrands from '../lib/mock-brands.json';
import { BrandLogo } from "../components/brand-logo";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu"
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

export default function BrandsPage() {
  const [brands, setBrands] = useState<any[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [manageMode, setManageMode] = React.useState(false);

  // Fetch brands and their analytics from backend API
  const fetchBrandsWithAnalytics = async () => {
    setLoading(true);
    try {
      const backendBrands = await apiService.getBrands();
      if (backendBrands && backendBrands.length > 0) {
        const brandsWithAnalytics = await Promise.all(
          backendBrands.map(async (brand: any) => {
            if (!brand.id || typeof brand.id !== 'string' || brand.id.trim() === '') return null;
            let analytics: any = {};
            let allReviews: any[] = [];
            try {
              analytics = await apiService.getBrandAnalytics(brand.id);
              const reviewsResp = await apiService.getBrandReviews(brand.id, 1, 10000);
              allReviews = reviewsResp.reviews || [];
            } catch (e) {}
            // Calculate sizing & fit mentions count
            const sizingFitCount = allReviews.filter((review: any) =>
              sizingFitKeywords.some((keyword) => (review.review || "").toLowerCase().includes(keyword.toLowerCase()))
            ).length;
            return {
              ...brand,
              ...analytics,
              reviewCount: analytics["total_reviews"] ?? brand.review_count ?? 0,
              sizingFitReviews: sizingFitCount,
              sizingFitPercentage: analytics["total_reviews"] ? (sizingFitCount / analytics["total_reviews"]) * 100 : 0,
              lastUpdated: analytics["last_updated"] || 'Never',
              sentiment: analytics["average_sentiment"] > 0.15 ? "positive" : analytics["average_sentiment"] < -0.15 ? "negative" : "neutral",
            };
          })
        );
        setBrands(brandsWithAnalytics.filter(Boolean));
      } else {
        setBrands([]);
      }
    } catch (e) {
      setBrands([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    fetchBrandsWithAnalytics();
  }, []);

  // Polling for syncing brands with 0 reviews
  React.useEffect(() => {
    const hasSyncing = brands.some(b => b.reviewCount === 0);
    if (!hasSyncing) return;
    const interval = setInterval(() => {
      fetchBrandsWithAnalytics();
    }, 5000);
    return () => clearInterval(interval);
  }, [brands]);

  // Poll for review count after creating a brand
  const pollForReviews = (brandId: string) => {
    if (!brandId || typeof brandId !== 'string' || brandId.trim() === '') return;
    const interval = setInterval(async () => {
      try {
        const analytics = await apiService.getBrandAnalytics(brandId);
        if (analytics.total_reviews > 0) {
          // Fetch all brands to update the UI with new analytics/reviews
          await fetchBrandsWithAnalytics();
          clearInterval(interval);
        }
      } catch {}
    }, 3000); // Poll every 3 seconds for faster feedback
  };

  const handleCreateBrand = (newBrand: any) => {
    setIsCreateModalOpen(false);
    setBrands((prev) => [
      {
        ...newBrand,
        reviewCount: 0,
        avgRating: 0,
        sentimentScore: 0,
        sizingFitReviews: 0,
        sizingFitPercentage: 0,
        lastUpdated: new Date().toISOString().split("T")[0],
        sentiment: "neutral",
      },
      ...prev,
    ]);
    fetchBrandsWithAnalytics();
    pollForReviews(newBrand.id);
  }

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
              {manageMode ? (
                <Button
                  onClick={() => setManageMode(false)}
                  className="flex items-center space-x-1.5 h-9 px-3 text-sm font-medium rounded-md shadow-none border border-gray-300 bg-blue-50 hover:bg-[#2563eb] hover:text-white text-blue-700"
                >
                  <span>Done</span>
                </Button>
              ) : (
                <button
                  onClick={() => setManageMode(true)}
                  className="group flex items-center justify-center h-9 w-9 rounded-md border border-gray-300 bg-white text-black hover:bg-black hover:text-white hover:shadow-2xl hover:scale-110 hover:border-black transition-all duration-200"
                  title="Manage brands"
                  style={{ outline: 'none' }}
                >
                  <Settings className="w-5 h-5 transition-colors duration-150 group-hover:animate-wiggle" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-0 gap-y-8 max-w-full">
          {brands.map((brand, index) => {
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
            const isSyncing = brand.reviewCount === 0;
            return (
              <Link key={brand.id} href={`/brands/${brand.id}`}>
                <Card
                  className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:-translate-y-2 hover:bg-gray-50 bg-white dark:bg-zinc-900 text-card-foreground border border-gray-200 rounded-md p-0 shadow-md min-h-[110px] min-w-[220px] max-w-[320px]"
                  style={{
                    animationDelay: `${index * 80}ms`,
                    animationFillMode: "both",
                    // Remove fixed height to allow content to dictate height
                  }}
                >
                  {/* Header Section */}
                  <CardHeader className="pb-2 p-3">
                    <div className="flex items-center justify-between space-x-2">
                      <div className="flex items-center space-x-2">
                        <div className="relative w-10 h-10 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                          <BrandLogo
                            src={brand.logo || "/placeholder-logo.png"}
                          alt={`${brand.name} logo`}
                            maxWidth={40}
                            maxHeight={40}
                          />
                          {isSyncing && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-md">
                              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                            </span>
                          )}
                      </div>
                      <div className="flex-1 min-w-0">
                          <CardTitle className="text-base font-bold text-foreground group-hover:text-blue-600 transition-colors duration-200 truncate">
                          {brand.name}
                        </CardTitle>
                          <p className="text-xs text-gray-500 mt-0.5">Last updated: {brand.lastUpdated || "Never"}</p>
                          {isSyncing && (
                            <span className="inline-flex items-center px-2 py-0.5 mt-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded animate-pulse">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing…
                            </span>
                          )}
                        </div>
                        {manageMode && (
                          <button
                            className="ml-2 p-1 rounded hover:bg-red-100 text-red-600 z-10"
                            title="Delete brand"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (window.confirm(`Delete brand '${brand.name}' and all its data? This cannot be undone.`)) {
                                try {
                                  const res = await fetch(`http://localhost:5000/api/brands/${brand.id}`, { method: 'DELETE' });
                                  if (res.ok) {
                                    setBrands(brands.filter(b => b.id !== brand.id));
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
                  <CardContent className="pt-0 p-3 overflow-hidden">
                    {/* Badges Row */}
                    <div className="flex justify-between items-center gap-2 mb-1">
                      <Badge variant="outline" className="flex items-center space-x-1 px-2 py-0.5 text-xs font-normal border border-gray-300 bg-white text-gray-800">
                        <Building2 className="w-3 h-3" />
                        <span>{brand.reviewCount?.toLocaleString() || 0} reviews</span>
                      </Badge>
                      <Badge className={sentimentLabelColor + " pointer-events-none"}>{sentimentLabel}</Badge>
                    </div>
                    {/* No extra vertical space below badges */}
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
