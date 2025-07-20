"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Separator } from "./ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Plus, X, Edit2, Save, RotateCcw, ChevronDown, ChevronUp } from "lucide-react"
import { apiService } from "@/lib/api-service";

interface KeywordCategory {
  name: string
  keywords: string[]
  isOpen: boolean
}

// Unified keyword categories for the manager
const defaultKeywordCategories: KeywordCategory[] = [
  {
    name: "Sizing & Fit Mentions",
    keywords: [
      "size", "fit", "true to size", "run small", "run large", "upsize", "downsize", "tight", "loose", "narrow", "wide", "comfortable", "uncomfortable", "snug", "baggy", "oversized", "undersized", "body shape", "wrong size", "perfect fit", "poor fit"
    ],
    isOpen: false,
  },
  {
    name: "Model Reference",
    keywords: [
      "model", "model size", "model wear", "model height", "model measurement", "model reference", "as seen on model"
    ],
    isOpen: false,
  },
  {
    name: "Length & Body Suitability",
    keywords: [
      "length", "width", "height", "long", "short", "wide", "narrow", "tall", "petite", "plus size", "curvy", "slim", "athletic", "body", "frame", "build", "proportion", "suitability"
    ],
    isOpen: false,
  },
  {
    name: "Returns & Exchanges",
    keywords: [
      "return", "exchange", "refund", "money back", "credit", "send back", "replacement", "process return", "easy return", "hassle-free return", "difficult return"
    ],
    isOpen: false,
  },
  {
    name: "Customer Service & Shipping",
    keywords: [
      "customer service", "support", "help", "assistant", "representative", "agent", "staff", "team", "service", "assistance", "helpful", "unhelpful", "rude", "polite", "friendly", "professional", "knowledgeable", "ignored", "responsive", "slow", "quick", "efficient", "inefficient", "resolved", "unresolved", "satisfied", "unsatisfied", "complaint", "inquiry", "question", "response", "reply", "contact", "call", "email", "chat", "live chat", "phone", "hotline", "helpline", "shipping", "delivery", "delivered", "arrived", "arrival", "shipped", "dispatch", "dispatched", "tracking", "track", "package", "parcel", "postage", "post", "courier", "carrier", "fast", "slow", "quick", "delayed", "late", "on time", "express", "standard", "free shipping", "shipping cost", "postage cost", "delivery fee", "tracking number", "order status", "in transit", "out for delivery", "received", "signature", "left at door", "neighbor", "mailbox", "post office", "collection", "pickup"
    ],
    isOpen: false,
  },
  {
    name: "Custom Category",
    keywords: [],
    isOpen: false,
  },
];

interface KeywordsManagerProps {
  onKeywordsChange?: (keywords: string[]) => void
  hideTitle?: boolean
  hideDescription?: boolean
  initialKeywords?: any
}

// Utility to sort keywords alphabetically, case-insensitive
function sortKeywords(keywords: string[]) {
  return [...keywords].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function KeywordsManager({ onKeywordsChange, hideTitle = false, hideDescription = false, initialKeywords = {} }: KeywordsManagerProps) {
  const [categories, setCategories] = useState<KeywordCategory[]>(defaultKeywordCategories)
  const [newKeyword, setNewKeyword] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("Size Accuracy")
  const [isEditing, setIsEditing] = useState(false)
  const [bulkKeywords, setBulkKeywords] = useState("")
  const [isExpanded, setIsExpanded] = useState(hideTitle || hideDescription ? true : false)

  const getAllKeywords = () => {
    return categories.flatMap((category) => category.keywords)
  }

  // On mount, fetch global keywords
  useEffect(() => {
    const fetchGlobal = async () => {
      try {
        const res = await apiService.getGlobalKeywords();
        if (res && res.keywords && Object.keys(res.keywords).length > 0) {
      setCategories((prev) => prev.map(cat =>
            res.keywords[cat.name]
              ? { ...cat, keywords: sortKeywords(res.keywords[cat.name]) }
          : cat
      ));
    }
      } catch {}
    };
    fetchGlobal();
  }, []);

  useEffect(() => {
    onKeywordsChange?.(getAllKeywords())
  }, [categories])

  const saveKeywords = (categoryName: string, keywords: string[]) => {
    apiService.setGlobalKeywords(categoryName, keywords).catch(() => {});
  };

  const fetchAndUpdateKeywords = async () => {
    try {
      const res = await apiService.getGlobalKeywords();
      if (res && res.keywords && Object.keys(res.keywords).length > 0) {
        setCategories((prev) => prev.map(cat =>
          res.keywords[cat.name]
            ? { ...cat, keywords: sortKeywords(res.keywords[cat.name]) }
            : cat
        ));
    }
    } catch {}
  };

  const addKeyword = async () => {
    if (newKeyword.trim() && !getAllKeywords().includes(newKeyword.trim().toLowerCase())) {
      setCategories((prev) => prev.map((category) => {
        if (category.name === selectedCategory) {
          const updated = { ...category, keywords: sortKeywords([...category.keywords, newKeyword.trim().toLowerCase()]) };
          saveKeywords(category.name, updated.keywords);
          return updated;
        }
        return category;
      }));
      setNewKeyword("");
      await fetchAndUpdateKeywords();
    }
  }

  const removeKeyword = async (keywordToRemove: string, categoryName: string) => {
    setCategories((prev) => prev.map((category) => {
      if (category.name === categoryName) {
        const updated = { ...category, keywords: sortKeywords(category.keywords.filter((keyword) => keyword !== keywordToRemove)) };
        saveKeywords(category.name, updated.keywords);
        return updated;
      }
      return category;
    }));
    await fetchAndUpdateKeywords();
  };

  const handleBulkEdit = () => {
    if (isEditing) {
      // Parse bulk keywords and organize them back into categories
      const lines = bulkKeywords.split("\n").filter((line) => line.trim())
      const newCategories: KeywordCategory[] = []
      let currentCategory: KeywordCategory | null = null

      lines.forEach((line) => {
        const trimmedLine = line.trim()

        // Check if this line is a category header (starts with uppercase and ends with colon)
        if (trimmedLine.match(/^[A-Z][^:]*:$/)) {
          const categoryName = trimmedLine.slice(0, -1)
          currentCategory = {
            name: categoryName,
            keywords: [],
            isOpen: false,
          }
          newCategories.push(currentCategory)
        } else if (currentCategory && trimmedLine) {
          // This is a keyword, add it to the current category
          const keyword = trimmedLine.replace(/^[-*]\s*/, "").toLowerCase()
          if (keyword && !currentCategory.keywords.includes(keyword)) {
            currentCategory.keywords.push(keyword)
          }
        }
      })

      if (newCategories.length > 0) {
        // Sort keywords in each category
        newCategories.forEach(cat => { cat.keywords = sortKeywords(cat.keywords) })
        setCategories(newCategories)
        
        // Save all categories to backend
        newCategories.forEach(category => {
          saveKeywords(category.name, category.keywords);
        });
        
        // Refresh from backend to ensure consistency
        fetchAndUpdateKeywords();
      }
      setIsEditing(false)
    } else {
      // Start editing - convert categories to bulk text format
      const bulkText = categories
        .map((category) => `${category.name}:\n${sortKeywords(category.keywords).map((keyword) => `- ${keyword}`).join("\n")}`)
        .join("\n\n")
      setBulkKeywords(bulkText)
      setIsEditing(true)
    }
  }

  const resetToDefaults = async () => {
    setCategories(defaultKeywordCategories)
    setBulkKeywords("")
    setIsEditing(false)
    
    // Save default keywords to backend
    defaultKeywordCategories.forEach(category => {
      saveKeywords(category.name, category.keywords);
    });
    
    // Refresh from backend to ensure consistency
    await fetchAndUpdateKeywords();
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addKeyword()
    }
  }

  const totalKeywords = getAllKeywords().length

  return (
    <>
      <Card>
        <CardContent className="space-y-4 px-8 pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Keywords ({totalKeywords})</Label>
                {!hideDescription && (
                  <p className="text-xs text-gray-500 mb-4">
                    Reviews containing these keywords will be analyzed for sizing and fit sentiment
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2 mr-2 ml-4">
                <Button variant="outline" size="sm" className="text-xs px-2 py-1 h-7 min-w-0 transition-transform duration-150 transform hover:scale-110 focus:scale-110" onClick={resetToDefaults}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
                <Button variant="outline" size="sm" className="text-xs px-2 py-1 h-7 min-w-0 transition-transform duration-150 transform hover:scale-110 focus:scale-110" onClick={handleBulkEdit}>
                  {isEditing ? (
                    <>
                      <Save className="w-3 h-3 mr-1" />
                      Save
                    </>
                  ) : (
                    <>
                      <Edit2 className="w-3 h-3 mr-1" />
                      Bulk Edit
                    </>
                  )}
                </Button>
              </div>
            </div>

            {!isEditing ? (
              <>
                {/* Compact horizontal category dropdowns */}
                <div className="flex flex-wrap gap-3 mb-6">
                  {categories.map((category) => (
                    <DropdownMenu key={category.name}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 px-3 text-sm border-gray-300 bg-black text-white dark:bg-black dark:text-white hover:bg-black hover:text-white focus:bg-black focus:text-white active:bg-black active:text-white transition-transform duration-150 transform hover:scale-105 focus:scale-105"
                        >
                          <span>{category.name}</span>
                          <ChevronDown className="w-4 h-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-64 max-h-64 overflow-y-auto">
                        <div className="px-2 py-1.5 text-xs font-medium text-gray-500 border-b">
                          {category.name} Keywords ({category.keywords.length})
                        </div>
                        {category.keywords.length > 0 ? (
                          sortKeywords(category.keywords).map((keyword) => (
                            <DropdownMenuItem
                              key={keyword}
                              className="flex items-center justify-between px-2 py-1.5 text-sm"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <span className="flex-1 text-gray-700">{keyword}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeKeyword(keyword, category.name)
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="px-2 py-3 text-xs text-gray-500 text-center">
                            {category.name === "Custom Category"
                              ? "Add your custom keywords using the form below"
                              : "No keywords in this category"}
                          </div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ))}
                </div>

                <Separator />

                {/* Add new keyword */}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="category-select" className="text-sm font-medium">
                      Add to Category
                    </Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger id="category-select" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.name} value={category.name}>
                            {category.name} ({category.keywords.length})
                            {category.name === "Custom Category" && category.keywords.length === 0 && (
                              <span className="text-gray-500 ml-1">- Add your keywords here</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex space-x-2">
                    <Input
                      placeholder={
                        selectedCategory === "Custom Category" ? "Add your custom keyword..." : "Add new keyword..."
                      }
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1 text-sm"
                    />
                    <Button
                      onClick={addKeyword}
                      disabled={!newKeyword.trim() || getAllKeywords().includes(newKeyword.trim().toLowerCase())}
                      size="sm"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {selectedCategory === "Custom Category" && (
                    <p className="text-xs text-gray-600">
                      💡 Use this category for brand-specific or unique keywords not covered by other categories
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Bulk edit mode */}
                <div>
                  <Label htmlFor="bulk-keywords" className="text-sm font-medium">
                    Edit Keywords by Category
                  </Label>
                  <p className="text-xs text-gray-500 mb-2">
                    Format: Category Name: followed by keywords (one per line with - prefix)
                  </p>
                  <Textarea
                    id="bulk-keywords"
                    value={bulkKeywords}
                    onChange={(e) => setBulkKeywords(e.target.value)}
                    placeholder={`Size Accuracy:
- sizing
- size
- wrong size

Custom Category:
- your custom keyword
- another custom term`}
                    className="mt-2 min-h-[200px] text-sm font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    {bulkKeywords.split("\n").filter((line) => line.trim() && !line.trim().endsWith(":")).length} keywords
                    across categories
                  </p>
                </div>
              </>
            )}

            <Separator />

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Last updated: Just now</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                  console.log("Re-analyzing reviews with updated keywords...")
                    await apiService.reprocessReviews()
                    alert("Reviews have been re-analyzed with updated keywords!")
                  } catch (error) {
                    console.error("Failed to reprocess reviews:", error)
                    alert("Failed to re-analyze reviews. Please try again.")
                  }
                }}
                className="text-xs h-7 transition-transform duration-150 transform hover:scale-110 focus:scale-110"
              >
                Re-analyze Reviews
              </Button>
            </div>
          </CardContent>
        </Card>
    </>
  )
}
