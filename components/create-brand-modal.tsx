"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Building2, Globe, Tags, Plus, X, CheckCircle, AlertCircle, RotateCcw } from "lucide-react"

interface CreateBrandModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateBrand: (brand: any) => void
}

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
]

export function CreateBrandModal({ isOpen, onClose, onCreateBrand }: CreateBrandModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    trustpilotUrl: "",
  })
  const [keywords, setKeywords] = useState<string[]>(defaultKeywords)
  const [newKeyword, setNewKeyword] = useState("")
  const [bulkKeywords, setBulkKeywords] = useState("")
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [isValidUrl, setIsValidUrl] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateUrl = (url: string) => {
    if (!url.trim()) return true
    try {
      const urlObj = new URL(url)
      const isValid = urlObj.hostname.includes("trustpilot.com") && urlObj.pathname.includes("/review/")
      setIsValidUrl(isValid)
      return isValid
    } catch {
      setIsValidUrl(false)
      return false
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Brand name is required"
    }

    if (!formData.trustpilotUrl.trim()) {
      newErrors.trustpilotUrl = "Trustpilot URL is required"
    } else if (!validateUrl(formData.trustpilotUrl)) {
      newErrors.trustpilotUrl = "Please enter a valid Trustpilot review URL"
    }

    if (keywords.length === 0) {
      newErrors.keywords = "At least one keyword is required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }

    if (field === "trustpilotUrl") {
      validateUrl(value)
    }
  }

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim().toLowerCase())) {
      setKeywords([...keywords, newKeyword.trim().toLowerCase()])
      setNewKeyword("")
      if (errors.keywords) {
        setErrors((prev) => ({ ...prev, keywords: "" }))
      }
    }
  }

  const removeKeyword = (keywordToRemove: string) => {
    setKeywords(keywords.filter((keyword) => keyword !== keywordToRemove))
  }

  const handleBulkKeywords = () => {
    if (isBulkMode) {
      // Save bulk changes
      const newKeywords = bulkKeywords
        .split("\n")
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 0)
        .filter((k, index, arr) => arr.indexOf(k) === index) // Remove duplicates

      setKeywords(newKeywords)
      setIsBulkMode(false)
      if (errors.keywords) {
        setErrors((prev) => ({ ...prev, keywords: "" }))
      }
    } else {
      setBulkKeywords(keywords.join("\n"))
      setIsBulkMode(true)
    }
  }

  const resetKeywords = () => {
    setKeywords(defaultKeywords)
    setBulkKeywords("")
    setIsBulkMode(false)
    if (errors.keywords) {
      setErrors((prev) => ({ ...prev, keywords: "" }))
    }
  }

  const handleSubmit = () => {
    if (!validateForm()) return

    // Generate a simple ID from the brand name
    const id = formData.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")

    const newBrand = {
      id,
      name: formData.name,
      logo: "/placeholder.svg?height=60&width=60",
      trustpilotUrl: formData.trustpilotUrl,
      keywords,
      totalReviews: 0,
      sizingFitReviews: 0,
      avgRating: 0,
      sentiment: "neutral",
      lastUpdated: new Date().toISOString().split("T")[0],
    }

    onCreateBrand(newBrand)
    handleClose()
  }

  const handleClose = () => {
    setFormData({ name: "", trustpilotUrl: "" })
    setKeywords(defaultKeywords)
    setNewKeyword("")
    setBulkKeywords("")
    setIsBulkMode(false)
    setErrors({})
    setIsValidUrl(true)
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addKeyword()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <Building2 className="w-6 h-6" />
            <span>Create New Brand Profile</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Building2 className="w-5 h-5" />
                <span>Brand Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="brand-name">Brand Name *</Label>
                  <Input
                    id="brand-name"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    placeholder="e.g., Nike, Adidas, Zara"
                    className={errors.name ? "border-red-300" : ""}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-600 mt-1 flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.name}</span>
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trustpilot URL */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Globe className="w-5 h-5" />
                <span>Review Source</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="trustpilot-url">Trustpilot URL *</Label>
                <div className="relative mt-2">
                  <Input
                    id="trustpilot-url"
                    value={formData.trustpilotUrl}
                    onChange={(e) => handleInputChange("trustpilotUrl", e.target.value)}
                    placeholder="https://www.trustpilot.com/review/brand.com"
                    className={`pr-10 ${
                      formData.trustpilotUrl && isValidUrl
                        ? "border-green-300"
                        : formData.trustpilotUrl && !isValidUrl
                          ? "border-red-300"
                          : errors.trustpilotUrl
                            ? "border-red-300"
                            : ""
                    }`}
                  />
                  {formData.trustpilotUrl && isValidUrl && (
                    <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-green-500" />
                  )}
                  {formData.trustpilotUrl && !isValidUrl && (
                    <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-red-500" />
                  )}
                </div>
                {(errors.trustpilotUrl || (formData.trustpilotUrl && !isValidUrl)) && (
                  <p className="text-sm text-red-600 mt-1 flex items-center space-x-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.trustpilotUrl || "Please enter a valid Trustpilot review URL"}</span>
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">Example: https://www.trustpilot.com/review/nike.com</p>
              </div>
            </CardContent>
          </Card>

          {/* Keywords Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Tags className="w-5 h-5" />
                  <span>Sizing & Fit Keywords</span>
                  <Badge variant="outline">{keywords.length} keywords</Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={resetKeywords}>
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleBulkKeywords}>
                    {isBulkMode ? "Save" : "Bulk Edit"}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isBulkMode ? (
                <>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-3 border rounded-md bg-gray-50">
                    {keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary" className="flex items-center space-x-1">
                        <span>{keyword}</span>
                        <button onClick={() => removeKeyword(keyword)} className="ml-1 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <div className="flex space-x-2">
                    <Input
                      placeholder="Add new keyword..."
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1"
                    />
                    <Button
                      onClick={addKeyword}
                      disabled={!newKeyword.trim() || keywords.includes(newKeyword.trim().toLowerCase())}
                      size="sm"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div>
                  <Label htmlFor="bulk-keywords">Edit Keywords (one per line)</Label>
                  <Textarea
                    id="bulk-keywords"
                    value={bulkKeywords}
                    onChange={(e) => setBulkKeywords(e.target.value)}
                    placeholder="Enter keywords, one per line..."
                    className="mt-2 min-h-[120px] font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    {bulkKeywords.split("\n").filter((k) => k.trim()).length} keywords
                  </p>
                </div>
              )}

              {errors.keywords && (
                <p className="text-sm text-red-600 flex items-center space-x-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errors.keywords}</span>
                </p>
              )}

              <p className="text-xs text-gray-500">
                Reviews containing these keywords will be analyzed for sizing and fit sentiment
              </p>
            </CardContent>
          </Card>
        </div>

        <Separator />

        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="min-w-[120px]">
            <Building2 className="w-4 h-4 mr-2" />
            Create Brand
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
