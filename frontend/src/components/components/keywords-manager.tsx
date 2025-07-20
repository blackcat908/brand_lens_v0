"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, X, Edit2, Save, RotateCcw, ChevronDown, ChevronUp } from "lucide-react"

interface KeywordCategory {
  name: string
  keywords: string[]
  isOpen: boolean
}

const defaultKeywordCategories: KeywordCategory[] = [
  {
    name: "Sizing Issues",
    keywords: [
      "sizing",
      "size",
      "wrong size",
      "ordered wrong size",
      "poor sizing",
      "poor sizing information",
      "lack of sizing information",
      "wrong sizing information",
      "true to size",
      "runs small",
      "runs large",
      "size up",
      "size down",
      "don't know my size",
      "didn't know which size",
      "idk which size",
      "what size",
      "which size",
      "what's the size",
    ],
    isOpen: false,
  },
  {
    name: "Fit Issues",
    keywords: [
      "fit",
      "fits",
      "fitted",
      "fitting",
      "poor fit",
      "didn't fit",
      "too small",
      "too tight",
      "too big",
      "too loose",
      "would this fit",
      "large",
      "small",
      "tight",
      "loose",
      "narrow",
      "wide",
      "comfort",
      "comfortable",
    ],
    isOpen: false,
  },
  {
    name: "Model Reference",
    keywords: [
      "what size is the model wearing?",
      "what size is the model wearing",
      "how tall is the model?",
      "how tall is the model",
    ],
    isOpen: false,
  },
  {
    name: "Length & Body Suitability",
    keywords: ["length", "width", "what's the length", "how tall", "is this suitable for", "height", "weight"],
    isOpen: false,
  },
  {
    name: "Returns & Exchanges",
    keywords: ["return", "refund", "exchange", "send back", "money back"],
    isOpen: false,
  },
  {
    name: "Custom Category",
    keywords: [],
    isOpen: false,
  },
]

interface KeywordsManagerProps {
  onKeywordsChange?: (keywords: string[]) => void
  hideTitle?: boolean
  hideDescription?: boolean
}

export function KeywordsManager({ onKeywordsChange, hideTitle = false, hideDescription = false }: KeywordsManagerProps) {
  const [categories, setCategories] = useState<KeywordCategory[]>(defaultKeywordCategories)
  const [newKeyword, setNewKeyword] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("Size Accuracy")
  const [isEditing, setIsEditing] = useState(false)
  const [bulkKeywords, setBulkKeywords] = useState("")
  const [isExpanded, setIsExpanded] = useState(hideTitle || hideDescription ? true : false)

  const getAllKeywords = () => {
    return categories.flatMap((category) => category.keywords)
  }

  // Notify parent only when the keyword list actually changes
  useEffect(() => {
    onKeywordsChange?.(getAllKeywords())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]) // ← `onKeywordsChange` removed from deps

  const addKeyword = () => {
    if (newKeyword.trim() && !getAllKeywords().includes(newKeyword.trim().toLowerCase())) {
      setCategories((prev) =>
        prev.map((category) =>
          category.name === selectedCategory
            ? { ...category, keywords: [...category.keywords, newKeyword.trim().toLowerCase()] }
            : category,
        ),
      )
      setNewKeyword("")
    }
  }

  const removeKeyword = (keywordToRemove: string, categoryName: string) => {
    setCategories((prev) =>
      prev.map((category) =>
        category.name === categoryName
          ? { ...category, keywords: category.keywords.filter((keyword) => keyword !== keywordToRemove) }
          : category,
      ),
    )
  }

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
        setCategories(newCategories)
      }
      setIsEditing(false)
    } else {
      // Start editing - convert categories to bulk text format
      const bulkText = categories
        .map((category) => `${category.name}:\n${category.keywords.map((keyword) => `- ${keyword}`).join("\n")}`)
        .join("\n\n")
      setBulkKeywords(bulkText)
      setIsEditing(true)
    }
  }

  const resetToDefaults = () => {
    setCategories(defaultKeywordCategories)
    setBulkKeywords("")
    setIsEditing(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addKeyword()
    }
  }

  const totalKeywords = getAllKeywords().length

  return (
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
            <Button variant="outline" size="sm" className="text-xs px-2 py-1 h-7 min-w-0" onClick={resetToDefaults}>
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
            <Button variant="outline" size="sm" className="text-xs px-2 py-1 h-7 min-w-0" onClick={handleBulkEdit}>
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
                    <Button variant="outline" className="h-9 px-3 text-sm border-gray-300 hover:bg-gray-50">
                      <span>{category.name}</span>
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64 max-h-64 overflow-y-auto">
                    <div className="px-2 py-1.5 text-xs font-medium text-gray-500 border-b">
                      {category.name} Keywords ({category.keywords.length})
                    </div>
                    {category.keywords.length > 0 ? (
                      category.keywords.map((keyword) => (
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
            onClick={() => {
              console.log("Re-analyzing reviews with updated keywords...")
              alert("Reviews would be re-analyzed with updated keywords")
            }}
            className="text-xs h-7"
          >
            Re-analyze Reviews
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
