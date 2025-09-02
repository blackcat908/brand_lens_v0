// lib/api-service.ts
// API service to connect to Flask backend

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') + '/api';

export interface Review {
  customer_name: string;
  review: string;
  date: string;
  rating: number;
  review_link: string;
  sentiment_score: number | null;
  sentiment_category: string | null;
  categories: string[] | null;
}

export interface Brand {
  brand_name: string;
  review_count: number;
}

export interface Analytics {
  brand: string;
  total_reviews: number;
  average_rating: number;
  avgRating: number; // Alias for frontend compatibility
  sentiment_breakdown: {
    positive: number;
    negative: number;
    neutral: number;
    total_analyzed: number;
  };
  average_sentiment: number;
  sentimentScore: number; // Alias for frontend compatibility
  monthly_trends: Array<{
    month: string;
    count: number;
  }>;
  monthlyTrend: number[]; // Alias for frontend compatibility
  top_keywords: Array<{
    keyword: string;
    count: number;
  }>;
}

export interface ReviewsResponse {
  brand: string;
  total_reviews: number;
  page: number;
  per_page: number;
  reviews: Review[];
}

// Add this utility at the top or near the API call functions
function normalizeBrandSlug(slug: string) {
  return slug.replace(/-/g, '');
}

export function canonicalBrandId(brandName: string) {
  return (brandName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// API service class
class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Get all brands
  async getBrands(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/brands`);
    if (!response.ok) {
      throw new Error(`Failed to fetch brands: ${response.statusText}`);
    }
    const data = await response.json();
    return data.brands.map((brand: any) => ({
      ...brand,
      name: brand.brand_name,
      id: brand.brand_name,
      logo: brand.logo, // Use the logo field from backend
    }));
  }

  // Get reviews for a specific brand
  async getBrandReviews(
    brand: string,
    page: number = 1,
    perPage: number = 20,
    filters?: {
      rating?: number | number[]; // Updated to support arrays
      sentiment?: string;
      dateFrom?: string;
      dateTo?: string;
      category?: string | string[]; // Updated to support arrays
    }
  ): Promise<ReviewsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });

    if (filters?.rating) {
      // Handle both single values and arrays
      if (Array.isArray(filters.rating)) {
        params.append('rating', JSON.stringify(filters.rating));
      } else {
        params.append('rating', filters.rating.toString());
      }
    }
    if (filters?.sentiment) {
      params.append('sentiment', filters.sentiment);
    }
    if (filters?.dateFrom) {
      params.append('date_from', filters.dateFrom);
    }
    if (filters?.dateTo) {
      params.append('date_to', filters.dateTo);
    }
    if (filters?.category) {
      // Handle both single values and arrays
      if (Array.isArray(filters.category)) {
        params.append('category', JSON.stringify(filters.category));
      } else {
        params.append('category', filters.category);
      }
    }

    const response = await fetch(`${this.baseUrl}/brands/${normalizeBrandSlug(brand)}/reviews?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch reviews for ${brand}: ${response.statusText}`);
    }
    return response.json();
  }

  // Get analytics for a specific brand
  async getBrandAnalytics(
    brand: string,
    filters?: {
      rating?: number | number[]; // Updated to support arrays
      sentiment?: string;
      dateFrom?: string;
      dateTo?: string;
      category?: string | string[]; // Updated to support arrays
    }
  ): Promise<Analytics> {
    if (!brand || typeof brand !== 'string' || brand.trim() === '') {
      throw new Error('Invalid brand id for analytics fetch');
    }
    const params = new URLSearchParams();
    if (filters?.rating) {
      // Handle both single values and arrays
      if (Array.isArray(filters.rating)) {
        params.append('rating', JSON.stringify(filters.rating));
      } else {
        params.append('rating', filters.rating.toString());
      }
    }
    if (filters?.sentiment) params.append('sentiment', filters.sentiment);
    if (filters?.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters?.dateTo) params.append('date_to', filters.dateTo);
    if (filters?.category) {
      // Handle both single values and arrays
      if (Array.isArray(filters.category)) {
        params.append('category', JSON.stringify(filters.category));
      } else {
        params.append('category', filters.category);
      }
    }
    const url = `${this.baseUrl}/brands/${normalizeBrandSlug(brand)}/analytics${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch analytics for ${brand}: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      ...data,
      avgRating: data.average_rating,
      sentimentScore: data.average_sentiment_score,
      monthlyTrend: data.monthly_trends.map((item: any) => item.count),
    };
  }

  // Create a new brand
  async createBrand({ trustpilot_url }: { trustpilot_url: string }) {
    const response = await fetch(`${this.baseUrl}/brands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trustpilot_url }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to create brand');
    }
    return response.json();
  }

  // Map frontend brand IDs to backend brand names
  private mapBrandId(brandId: string): string {
    const brandMap: Record<string, string> = {
      "bbx-brand": "bbxbrand",
      "murci": "murci",
      "odd-muse": "oddmuse",
      "wander-doll": "wanderdoll",
      "because-of-alice": "becauseofalice",
    };
    return brandMap[brandId] || brandId;
  }

  // Convenience method for frontend brand IDs
  async getBrandReviewsByFrontendId(
    brandId: string,
    page: number = 1,
    perPage: number = 20,
    filters?: {
      rating?: number;
      sentiment?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<ReviewsResponse> {
    const backendBrand = this.mapBrandId(brandId);
    return this.getBrandReviews(backendBrand, page, perPage, filters);
  }

  // Get all reviews for a brand (no pagination) - for analytics purposes
  async getAllBrandReviewsByFrontendId(
    brandId: string,
    filters?: {
      rating?: number | number[]; // Updated to support arrays
      sentiment?: string;
      dateFrom?: string;
      dateTo?: string;
      category?: string | string[]; // Updated to support arrays
    }
  ): Promise<Review[]> {
    const backendBrand = this.mapBrandId(brandId);
    // Fetch with a very large page size to get all reviews
    const response = await this.getBrandReviews(backendBrand, 1, 10000, filters);
    return response.reviews;
  }

  async getBrandAnalyticsByFrontendId(
    brandId: string,
    filters?: {
      rating?: number | number[]; // Updated to support arrays
      sentiment?: string;
      dateFrom?: string;
      dateTo?: string;
      category?: string | string[]; // Updated to support arrays
    }
  ): Promise<Analytics> {
    const backendBrand = this.mapBrandId(brandId);
    return this.getBrandAnalytics(backendBrand, filters);
  }

  async getGlobalKeywords() {
    const response = await fetch(`${this.baseUrl}/keywords`);
    if (!response.ok) throw new Error('Failed to fetch keywords');
    return response.json();
  }

  async setGlobalKeywords(category: string, keywords: string[]) {
    const response = await fetch(`${this.baseUrl}/keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, keywords }),
    });
    if (!response.ok) throw new Error('Failed to save keywords');
    return response.json();
  }

  async reprocessReviews() {
    const response = await fetch(`${this.baseUrl}/reprocess-reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to reprocess reviews');
    return response.json();
  }

  // Cancel brand scraping
  async cancelBrandScraping(brandName: string) {
    const response = await fetch(`${this.baseUrl}/brands/${encodeURIComponent(brandName)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to cancel brand scraping');
    return response.json();
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Export default for backward compatibility
export default apiService; 