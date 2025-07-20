# Frontend Integration Guide

## ✅ Backend is Ready!

Your Flask backend is now running at `http://localhost:5000` with:
- ✅ Sentiment analysis with `sentiment_category` column
- ✅ CORS enabled for frontend access
- ✅ Analytics endpoints
- ✅ Review filtering and pagination
- ✅ Keyword extraction

## 🔗 Connect Your Frontend

### 1. **API Service Created**
I've created `lib/api-service.ts` that connects to your Flask backend.

### 2. **Test the Connection**
Add this to any page to test the API:

```tsx
import { testApiConnection } from './test-api-connection';

// In a component or useEffect
useEffect(() => {
  testApiConnection();
}, []);
```

### 3. **Use Real Data Instead of Mock Data**

Replace mock data calls with API calls:

```tsx
// OLD (mock data)
import { getBrandReviews } from "@/lib/get-brand-reviews"

// NEW (real API)
import { apiService } from "@/lib/api-service"

// Get analytics
const analytics = await apiService.getBrandAnalyticsByFrontendId(brandId)

// Get reviews with filtering
const reviews = await apiService.getBrandReviewsByFrontendId(brandId, page, 20, {
  rating: 5,
  sentiment: 'positive',
  dateFrom: '2024-01-01',
  dateTo: '2024-12-31'
})
```

## 📊 Available Endpoints

### Analytics Data
```tsx
const analytics = await apiService.getBrandAnalyticsByFrontendId('wander-doll')
// Returns: total_reviews, average_rating, sentiment_breakdown, monthly_trends, top_keywords
```

### Reviews with Filtering
```tsx
const reviews = await apiService.getBrandReviewsByFrontendId('wander-doll', 1, 20, {
  rating: 5,           // Filter by star rating
  sentiment: 'positive', // Filter by sentiment
  dateFrom: '2024-01-01', // Date range
  dateTo: '2024-12-31'
})
```

### Brand List
```tsx
const brands = await apiService.getBrands()
// Returns: [{ brand_name: 'wanderdoll', review_count: 150 }, ...]
```

## 🎯 Next Steps

1. **Test the connection** using the test component
2. **Update your dashboard** to use `apiService.getBrandAnalyticsByFrontendId()`
3. **Update review tables** to use `apiService.getBrandReviewsByFrontendId()`
4. **Add loading states** for better UX
5. **Handle errors** gracefully

## 🔧 Troubleshooting

- **CORS errors**: Make sure Flask is running with CORS enabled
- **Connection refused**: Check if Flask is running on port 5000
- **No data**: Run the scraper first: `python trustpilot_scraper.py wanderdoll`

## 🚀 Your Backend Features

- **Real-time data** from Trustpilot
- **Sentiment analysis** (positive/negative/neutral)
- **Keyword extraction** for topic analysis
- **Advanced filtering** by rating, sentiment, date
- **Pagination** for large datasets
- **Analytics endpoints** for dashboard metrics

Your backend is production-ready! 🎉 