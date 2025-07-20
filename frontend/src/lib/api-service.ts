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
    // In getBrands and all other methods, use only 'brand_name' from the backend.
    // Example:
    // return data.brands.map((brand: any) => ({
    //   ...brand,
    //   brand_name: brand.brand_name,
    //   logo: brand.logo_url || `/logos/${brand.brand_name}-logo.jpg`,
    // }));
    // Remove all mapping, normalization, and fallback logic for display_name, id, slug, canonical, etc.
    return data.brands.map((brand: any) => ({
      ...brand,
      brand_name: brand.brand_name,
      logo: brand.logo_url || `/logos/${brand.brand_name}-logo.jpg`,
    }));
  }

  // Get reviews for a specific brand
  async getBrandReviews(
    brand: string,
    page: number = 1,
    perPage: number = 20,
    filters?: {
      rating?: number;
      sentiment?: string;
      dateFrom?: string;
      dateTo?: string;
      category?: string;
    }
  ): Promise<ReviewsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });

    if (filters?.rating) {
      params.append('rating', filters.rating.toString());
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
      params.append('category', filters.category);
    }

    const response = await fetch(`${this.baseUrl}/brands/${normalizeBrandSlug(brand)}/reviews?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch reviews for ${brand}: ${response.statusText}`);
    }
    return response.json();
  }

  // Get analytics for a specific brand
  async getBrandAnalytics(brand: string): Promise<Analytics> {
    if (!brand || typeof brand !== 'string' || brand.trim() === '') {
      throw new Error('Invalid brand id for analytics fetch');
    }
    const response = await fetch(`${this.baseUrl}/brands/${normalizeBrandSlug(brand)}/analytics`);
    if (!response.ok) {
      throw new Error(`Failed to fetch analytics for ${brand}: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Add aliases for frontend compatibility
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
      category?: string;
    }
  ): Promise<ReviewsResponse> {
    const backendBrand = this.mapBrandId(brandId);
    return this.getBrandReviews(backendBrand, page, perPage, filters);
  }

  async getBrandAnalyticsByFrontendId(brandId: string): Promise<Analytics> {
    if (!brandId || typeof brandId !== 'string' || brandId.trim() === '') {
      throw new Error('Invalid brand id for analytics fetch');
    }
    const backendBrand = this.mapBrandId(brandId);
    return this.getBrandAnalytics(backendBrand);
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
}

// Export singleton instance
export const apiService = new ApiService();

// Export default for backward compatibility
export default apiService; 