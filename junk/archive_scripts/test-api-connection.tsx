// test-api-connection.tsx
// Simple test to verify API connection

import { apiService } from '@/lib/api-service';

export async function testApiConnection() {
  try {
    console.log('Testing API connection...');
    
    // Test health check
    const health = await apiService.healthCheck();
    console.log('✅ Health check:', health);
    
    // Test brands endpoint
    const brands = await apiService.getBrands();
    console.log('✅ Brands:', brands);
    
    // Test analytics for a brand
    if (brands.length > 0) {
      const analytics = await apiService.getBrandAnalytics(brands[0].brand_name);
      console.log('✅ Analytics:', analytics);
    }
    
    // Test reviews for a brand
    if (brands.length > 0) {
      const reviews = await apiService.getBrandReviews(brands[0].brand_name, 1, 5);
      console.log('✅ Reviews:', reviews);
    }
    
    console.log('🎉 All API tests passed!');
    return true;
  } catch (error) {
    console.error('❌ API test failed:', error);
    return false;
  }
}

// Run test if this file is executed directly
if (typeof window !== 'undefined') {
  testApiConnection();
} 