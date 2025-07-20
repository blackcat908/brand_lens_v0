"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Badge } from "./ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Separator } from "./ui/separator"
import { Building2, Globe, Tags, Plus, X, CheckCircle, AlertCircle, RotateCcw } from "lucide-react"
import { apiService } from "@/lib/api-service"

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
    trustpilotUrl: "",
  })
  const [keywords, setKeywords] = useState<string[]>(defaultKeywords)
  const [newKeyword, setNewKeyword] = useState("")
  const [bulkKeywords, setBulkKeywords] = useState("")
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [isValidUrl, setIsValidUrl] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

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

  const handleSubmit = async () => {
    if (!validateForm()) return
    setLoading(true)
    setApiError(null)
    try {
      // Call backend and get the full response (including logo_url and display_name)
      const res = await apiService.createBrand({ trustpilot_url: formData.trustpilotUrl })
      // Use backend's display_name, canon_id, logo_url
      const newBrand = {
        brand: res.brand || '', // Use backend's 'brand' field
        logo: res.logo_url || "/placeholder-logo.png",
        reviewCount: 0,
        sizingFitReviews: 0,
        avgRating: 0,
        sentiment: "neutral",
        lastUpdated: new Date().toISOString().split("T")[0],
      };
      onCreateBrand(newBrand)
      handleClose()
    } catch (e: any) {
      setApiError(e.message || 'Failed to create brand')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({ trustpilotUrl: "" })
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

  // Validation helpers
  const isFormValid = formData.trustpilotUrl.trim() && isValidUrl;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <Building2 className="w-6 h-6" />
            <span>Create New Brand Profile</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Trustpilot URL Only */}
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
                    className={`bg-white text-black dark:bg-[#18181b] dark:text-white border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 pr-10${formData.trustpilotUrl && isValidUrl ? ' border-green-300' : formData.trustpilotUrl && !isValidUrl ? ' border-red-300' : errors.trustpilotUrl ? ' border-red-300' : ''}`}
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

          {/* Sizing & Fit Keywords section is hidden */}
          {/* <Card> ... </Card> */}
        </div>

        <Separator />

        {/* Error or Success Feedback */}
        {apiError && (
          <div className="flex items-center text-red-600 text-sm mt-2 mb-2">
            <AlertCircle className="w-4 h-4 mr-1" />
            {apiError}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={handleClose} type="button" disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || loading}
            type="button"
            className="flex items-center gap-2"
          >
            {loading ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin clockwise-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Brand
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
