"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Badge } from "./ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Separator } from "./ui/separator"
import { Building2, Globe, Tags, Plus, X, CheckCircle, AlertCircle, RotateCcw, Upload, Image } from "lucide-react"
import { apiService } from "@/lib/api-service"

interface CreateBrandModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateBrand: (brand: any) => void
  onRefreshLogos?: () => void
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

export function CreateBrandModal({ isOpen, onClose, onCreateBrand, onRefreshLogos }: CreateBrandModalProps) {
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
  
  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      
      // Upload logo if selected
      let logoUrl = res.logo_url || "/placeholder-logo.png"
      if (logoFile && res.brand) {
        try {
          await uploadLogo(res.brand)
          // Use the uploaded logo data
          logoUrl = logoPreview || "/placeholder-logo.png"
        } catch (logoError) {
          console.error('Logo upload failed:', logoError)
          // Continue without logo upload error
        }
      }
      
      // Use backend's display_name, canon_id, logo_url
      const newBrand = {
        brand: res.brand || '', // Use backend's 'brand' field
        logo: logoUrl,
        reviewCount: 0,
        sizingFitReviews: 0,
        avgRating: 0,
        sentiment: "neutral",
        lastUpdated: new Date().toISOString().split("T")[0],
      };
      onCreateBrand(newBrand)
      
      // Refresh logos cache to include the new brand's logo
      if (onRefreshLogos) {
        console.log('[CreateBrandModal] Refreshing logos cache after brand creation')
        // Add a small delay to give the scraper time to save the logo
        setTimeout(() => {
          onRefreshLogos()
        }, 2000) // 2 second delay
      }
      
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
    // Reset logo state
    setLogoFile(null)
    setLogoPreview(null)
    setLogoUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addKeyword()
    }
  }

  // Logo upload functions
  const handleLogoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, logo: 'Please select an image file' }))
        return
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, logo: 'File size must be less than 5MB' }))
        return
      }
      
      setLogoFile(file)
      setErrors(prev => ({ ...prev, logo: '' }))
      
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeLogo = () => {
    setLogoFile(null)
    setLogoPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadLogo = async (brandName: string): Promise<string | null> => {
    if (!logoFile) return null
    
    try {
      setLogoUploading(true)
      
      // Convert file to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result)
        }
        reader.readAsDataURL(logoFile)
      })
      
      // Upload to backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload_logo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brand_name: brandName,
          logo_data: base64,
          logo_filename: logoFile.name,
          logo_mime_type: logoFile.type
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to upload logo')
      }
      
      return base64
    } catch (error) {
      console.error('Logo upload error:', error)
      throw new Error('Failed to upload logo')
    } finally {
      setLogoUploading(false)
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

          {/* Logo Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Image className="w-5 h-5" />
                <span>Brand Logo (Optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="logo-upload">Upload Logo</Label>
                <div className="mt-2 space-y-4">
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
                      ref={fileInputRef}
                      type="file"
                      id="logo-upload"
                      accept="image/*"
                      onChange={handleLogoSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={logoUploading}
                      className="flex items-center space-x-2"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{logoFile ? 'Change Logo' : 'Choose Logo'}</span>
                    </Button>
                    {logoUploading && (
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <RotateCcw className="w-4 h-4 animate-spin" />
                        <span>Uploading...</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Error Message */}
                  {errors.logo && (
                    <p className="text-sm text-red-600 flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.logo}</span>
                    </p>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Supported formats: JPG, PNG, GIF. Max size: 5MB.
                  </p>
                </div>
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
