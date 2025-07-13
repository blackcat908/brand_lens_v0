# Backend Setup Guide

## Overview
This guide will help you set up the complete backend with sentiment analysis and the new sentiment_category column.

## Step 1: Install Dependencies

```bash
# Install all required packages
pip install Flask-CORS textblob nltk pandas numpy requests

# Install Playwright browsers (if not already done)
python -m playwright install
```

## Step 2: Setup Database Schema

```bash
# Run the database setup script to create the new schema
python setup_database.py
```

This will:
- Create the database with the new `sentiment_category` column
- Add `sentiment_score` and `categories` columns
- Set up the proper table structure

## Step 3: Process Existing Reviews (if any)

If you have existing reviews in the database:

```bash
# Process existing reviews with sentiment analysis
python process_existing_reviews.py
```

## Step 4: Test the Backend

```bash
# Start the Flask API
python app.py
```

In another terminal:
```bash
# Test the API endpoints
python test_backend.py
```

## Step 5: Verify Database

```bash
# Check database structure and data
python check_database.py
```

## New Database Schema

The database now includes:

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `brand_name` | String(100) | Brand name |
| `customer_name` | String(255) | Customer name |
| `review` | Text | Review content |
| `date` | String(100) | Review date |
| `rating` | Integer | Star rating (1-5) |
| `review_link` | String(500) | Link to review |
| `sentiment_score` | Float | Sentiment score (-1 to 1) |
| `sentiment_category` | String(20) | **NEW**: 'positive', 'negative', 'neutral' |
| `categories` | String(255) | JSON array of keywords |

## API Endpoints

### Health Check
- `GET /api/health` - Check if API is running

### Brands
- `GET /api/brands` - List all brands with review counts

### Reviews
- `GET /api/brands/{brand}/reviews` - Get reviews with filtering
  - Query params: `page`, `per_page`, `rating`, `sentiment`, `date_from`, `date_to`

### Analytics
- `GET /api/brands/{brand}/analytics` - Get analytics data
  - Returns: total reviews, average rating, sentiment breakdown, monthly trends, top keywords

## Sentiment Analysis

The backend now includes:
- **Sentiment Score**: Numeric value from -1 (very negative) to 1 (very positive)
- **Sentiment Category**: Categorical classification ('positive', 'negative', 'neutral')
- **Keywords**: Extracted from review text for topic analysis

## Frontend Integration

The API now supports CORS and can be easily integrated with your Next.js frontend. The sentiment_category column makes it much easier to filter and display sentiment data in your dashboard.

## Troubleshooting

1. **Database errors**: Run `python setup_database.py` to reset the schema
2. **Missing dependencies**: Install with `pip install -r requirements.txt`
3. **API not responding**: Check if Flask is running on port 5000
4. **Sentiment analysis errors**: Ensure NLTK data is downloaded

## Next Steps

1. Run the scraper to collect new reviews: `python trustpilot_scraper.py <brand_name>`
2. Connect your frontend to use the real API endpoints
3. Set up scheduled scraping for continuous data updates 