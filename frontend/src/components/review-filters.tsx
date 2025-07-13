"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Filter, X, Star } from "lucide-react"

interface ReviewFiltersProps {
  onFilterChange: (filters: ReviewFilters) => void
  totalReviews: number
  filteredCount: number
}

export interface ReviewFilters {
  rating: string
  keyword: string
}

export function ReviewFilters({ onFilterChange, totalReviews, filteredCount }: ReviewFiltersProps) {
  const [filters, setFilters] = useState<ReviewFilters>({
    rating: "all",
    keyword: "",
  })

  const handleFilterChange = (key: keyof ReviewFilters, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const clearFilters = () => {
    const clearedFilters = { rating: "all", keyword: "" }
    setFilters(clearedFilters)
    onFilterChange(clearedFilters)
  }

  const hasActiveFilters = filters.rating !== "all" || filters.keyword !== ""

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>Filter Reviews</span>
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              Clear Filters
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Rating Filter */}
          <div>
            <Label htmlFor="rating-filter">Filter by Rating</Label>
            <Select value={filters.rating} onValueChange={(value) => handleFilterChange("rating", value)}>
              <SelectTrigger id="rating-filter">
                <SelectValue placeholder="All ratings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">
                  <div className="flex items-center space-x-1">
                    <span>5</span>
                    <Star className="w-4 h-4 text-yellow-500" />
                  </div>
                </SelectItem>
                <SelectItem value="4">
                  <div className="flex items-center space-x-1">
                    <span>4</span>
                    <Star className="w-4 h-4 text-yellow-500" />
                  </div>
                </SelectItem>
                <SelectItem value="3">
                  <div className="flex items-center space-x-1">
                    <span>3</span>
                    <Star className="w-4 h-4 text-yellow-500" />
                  </div>
                </SelectItem>
                <SelectItem value="2">
                  <div className="flex items-center space-x-1">
                    <span>2</span>
                    <Star className="w-4 h-4 text-yellow-500" />
                  </div>
                </SelectItem>
                <SelectItem value="1">
                  <div className="flex items-center space-x-1">
                    <span>1</span>
                    <Star className="w-4 h-4 text-yellow-500" />
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Keyword Filter */}
          <div>
            <Label htmlFor="keyword-filter">Search by Keyword</Label>
            <Input
              id="keyword-filter"
              placeholder="Search in reviews..."
              value={filters.keyword}
              onChange={(e) => handleFilterChange("keyword", e.target.value)}
            />
          </div>
        </div>

        {/* Active Filters Display */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.rating !== "all" && (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <Star className="w-3 h-3" />
                <span>{filters.rating} stars</span>
                <button onClick={() => handleFilterChange("rating", "all")} className="ml-1 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {filters.keyword && (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <span>"{filters.keyword}"</span>
                <button onClick={() => handleFilterChange("keyword", "")} className="ml-1 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>

          <div className="text-sm text-gray-600">
            Showing {filteredCount} of {totalReviews} reviews
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
