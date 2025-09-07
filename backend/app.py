from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from database import get_db_session, Review, get_brand_source_url, set_brand_source_url, get_reviews_by_brand, get_all_reviews, get_brands, add_review, delete_brand_and_reviews, get_brand_keywords, set_brand_keywords, add_brand_keywords, get_global_keywords, set_global_keywords, add_global_keywords, get_reviews_by_brand_optimized, get_brand_analytics_optimized, get_brands_with_counts_optimized, update_brand_logo, get_brand_logo, delete_brand_logo
from sentiment_analyzer import SentimentAnalyzer
from ai_service import get_ai_service
from datetime import datetime, timedelta
import json
from collections import defaultdict, Counter
from trustpilot_scraper import TrustpilotScraper, fetch_trustpilot_logo
import re, requests
import threading
import os
import time
from sqlalchemy import text
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Simple keyword stemming for better matching
def simple_stem(word):
    """Simple stemming function for common English word patterns"""
    word = word.lower().strip()
    
    # Handle common endings
    if word.endswith('ies') and len(word) > 4:
        return word[:-3] + 'y'
    elif word.endswith('ied') and len(word) > 4:
        return word[:-3] + 'y'
    elif word.endswith('ying') and len(word) > 5:
        return word[:-4] + 'ie'
    elif word.endswith('ing') and len(word) > 4:
        return word[:-3]
    elif word.endswith('ed') and len(word) > 3:
        return word[:-2]
    elif word.endswith('er') and len(word) > 3:
        return word[:-2]
    elif word.endswith('est') and len(word) > 4:
        return word[:-3]
    elif word.endswith('s') and len(word) > 2 and not word.endswith('ss'):
        return word[:-1]
    
    return word

def keyword_matches_text(keyword, text):
    """Enhanced keyword matching with stemming support"""
    keyword = keyword.lower().strip()
    text = text.lower()
    
    # Direct substring match (fastest)
    if keyword in text:
        return True
    
    # Stemmed matching for better coverage
    keyword_stem = simple_stem(keyword)
    words_in_text = re.findall(r'\b\w+\b', text)
    
    for word in words_in_text:
        if simple_stem(word) == keyword_stem:
            return True
    
    return False

app = Flask(__name__)
app.url_map.strict_slashes = False
# Update CORS to allow only Vercel frontend
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "OPTIONS"]}})

# Configure Flask to ignore Playwright file changes to prevent auto-restart during scraping
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000

# Initialize database when app starts
def initialize_database():
    from database import init_db
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        # Don't raise here, let the app start and handle DB errors gracefully

# Register the initialization function to run when the app starts
with app.app_context():
    initialize_database()
# Serve favicon.ico for browser compatibility
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, ''), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

# Initialize sentiment analyzer
sentiment_analyzer = SentimentAnalyzer()

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "message": "Welcome to the Trustpilot Scraper API. See /api/brands or /api/health for available endpoints.",
        "status": "running",
        "timestamp": datetime.now().isoformat()
    })

@app.route('/api/test-scraper', methods=['GET'])
def test_scraper():
    """Test endpoint to check if scraper dependencies are working"""
    try:
        logger.info("[TEST] Testing scraper dependencies...")
        
        # Test Playwright import
        from playwright.sync_api import sync_playwright
        logger.info("[TEST] Playwright imported successfully")
        
        # Test browser launch
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            logger.info("[TEST] Browser launched successfully")
            browser.close()
            logger.info("[TEST] Browser closed successfully")
        
        # Test scraper initialization
        from trustpilot_scraper import TrustpilotScraper
        scraper = TrustpilotScraper(headless=True)
        logger.info("[TEST] Scraper initialized successfully")
        
        # Test database connection
        from database import get_db_session, init_db
        init_db()
        with get_db_session() as db:
            logger.info("[TEST] Database connection successful")
        
        return jsonify({
            'success': True,
            'message': 'All scraper dependencies are working correctly',
            'tests_passed': [
                'Playwright import',
                'Browser launch',
                'Scraper initialization', 
                'Database connection'
            ]
        })
        
    except ImportError as ie:
        logger.error(f"[TEST] Import error: {ie}")
        return jsonify({
            'success': False,
            'error': f'Missing dependency: {str(ie)}',
            'solution': 'Install Playwright: pip install playwright && playwright install chromium'
        }), 500
    except Exception as e:
        logger.error(f"[TEST] Error: {e}")
        import traceback
        logger.error(f"[TEST] Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/brands', methods=['GET'])
def get_brands_api():
    logger.info("[BRANDS] GET request for brands summary")
    with get_db_session() as db:
        brand_stats = get_brands_with_counts_optimized(db)
        summary = []
        for brand_info in brand_stats:
            brand = brand_info['brand']
            review_count = brand_info.get('review_count', 0)
            avg_rating = brand_info.get('avg_rating')
            # Use placeholder logo URL - frontend will fetch from database
            logo_url = "/placeholder-logo.png"
            summary.append({
                'brand': brand,
                'logo': logo_url,
                'reviewCount': review_count,
                'avgRating': avg_rating
            })
        logger.info(f"[BRANDS] Returning {len(summary)} brands with ratings")
    return jsonify({'brands': summary})

@app.route('/api/brands', methods=['POST'])
def create_brand():
    data = request.get_json()
    trustpilot_url = data.get('trustpilot_url')
    if not trustpilot_url:
        return jsonify({'error': 'trustpilot_url is required'}), 400
    url_pattern = r"^https?://([a-zA-Z0-9-]+\.)?trustpilot\.com/review/[\w\-\.]+"
    if not re.match(url_pattern, trustpilot_url):
        return jsonify({'error': 'Invalid Trustpilot URL format'}), 400
    try:
        resp = requests.get(trustpilot_url, timeout=10)
        if resp.status_code != 200 or 'Trustpilot' not in resp.text:
            return jsonify({'error': 'Trustpilot page not found or not accessible'}), 400
    except Exception as e:
        return jsonify({'error': f'Error reaching Trustpilot: {str(e)}'}), 400
    
    # Use ultra-fast scraper with single browser instance
    scraper = TrustpilotScraper(headless=True)
    
    def run_ultra_fast_scraper():
        try:
            logger.info(f"[SCRAPER] Starting scraper for URL: {trustpilot_url}")
            
            # Extract brand name first
            extracted_brand_name = scraper.extract_brand_name(trustpilot_url)
            if not extracted_brand_name:
                logger.error("[SCRAPER] Failed to extract brand name")
                return
            
            logger.info(f"[SCRAPER] Extracted brand name: {extracted_brand_name}")
            
            # Save brand URL to database (save the raw URL provided by user)
            with get_db_session() as db:
                logger.info(f"[SCRAPER] Saving URL to database: {trustpilot_url}")
                set_brand_source_url(db, extracted_brand_name, trustpilot_url)
            
            # Use the improved main scraper method with ultra-fast features
            logger.info(f"[SCRAPER] Starting review scraping for: {extracted_brand_name}")
            new_reviews_count = scraper.scrape_brand_reviews(extracted_brand_name, max_pages=None, start_page=1, is_new_brand=True)
            logger.info(f"[SCRAPER] Brand '{extracted_brand_name}' completed successfully")
            logger.info(f"[SCRAPER] Total reviews: {new_reviews_count}")
        except ImportError as ie:
            logger.error(f"[SCRAPER] Import error - missing dependency: {ie}")
            logger.error("[SCRAPER] Make sure Playwright is installed: pip install playwright && playwright install chromium")
        except Exception as e:
            logger.error(f"[SCRAPER] Error in scraper: {e}")
            import traceback
            logger.error(f"[SCRAPER] Traceback: {traceback.format_exc()}")
        finally:
            logger.info("[SCRAPER] Background scraper thread completed")
    
    # For development, run synchronously to avoid Flask restart interruption
    # In production, you can change this back to threading for better performance
    if os.environ.get('FLASK_ENV') == 'production':
        # Run in background thread for production
        threading.Thread(target=run_ultra_fast_scraper, daemon=True).start()
        return jsonify({
            'success': True, 
            'message': 'Ultra-fast scraping started in background',
            'trustpilot_url': trustpilot_url
        })
    else:
        # Run asynchronously but return immediate response - let frontend poll for status
        threading.Thread(target=run_ultra_fast_scraper, daemon=True).start()
        
        # Return immediate response without extracting brand name to avoid browser conflicts
        return jsonify({
            'success': True,
            'message': 'Brand scraping started successfully',
            'status': 'processing',
            'trustpilot_url': trustpilot_url
        })

# --- COMMENTED OUT OLD REVIEWS ENDPOINT ---
# @app.route('/api/brands/<brand>/reviews', methods=['GET'])
# def get_brand_reviews(brand):
#     page = int(request.args.get('page', 1))
#     per_page = int(request.args.get('per_page', 20))
#     rating_filter = request.args.get('rating')
#     sentiment_filter = request.args.get('sentiment')
#     date_from = request.args.get('date_from')
#     date_to = request.args.get('date_to')
#     category_filter = request.args.get('category')
#     rating_filter_int = int(rating_filter) if rating_filter else None
#     with get_db_session() as db:
#         result = get_reviews_by_brand_optimized(
#             db, brand, page, per_page, 
#             rating_filter_int, sentiment_filter or None, date_from or None, date_to or None, category_filter or None
#         )
#         review_list = [
#             {
#                 'customer_name': r['customer_name'],
#                 'review': r['review'],
#                 'date': r['date'],
#                 'rating': r['rating'],
#                 'review_link': r['review_link'],
#                 'sentiment_score': r['sentiment_score'],
#                 'sentiment_category': r['sentiment_category'],
#                 'categories': r['categories']
#             }
#             for r in result['reviews']
#         ]
#     return jsonify({
#         'brand': brand,
#         'total_reviews': result['total'],
#         'page': result['page'],
#         'per_page': result['per_page'],
#         'reviews': review_list
#     })

# --- NEW ROBUST REVIEWS ENDPOINT (NOW MAIN ENDPOINT) ---
@app.route('/api/brands/<brand>/reviews', methods=['GET'])
def get_brand_reviews_robust(brand):
    import time
    start_time = time.time()
    
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    rating_filter = request.args.get('rating')
    sentiment_filter = request.args.get('sentiment')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category_filter = request.args.get('category')
    
    # Parse multiple ratings and categories
    rating_filters = []
    if rating_filter:
        try:
            if rating_filter.startswith('[') and rating_filter.endswith(']'):
                # Handle array format from frontend
                rating_filters = json.loads(rating_filter)
            else:
                # Handle single value
                rating_filters = [int(rating_filter)]
        except (json.JSONDecodeError, ValueError):
            rating_filters = []
    
    category_filters = []
    if category_filter:
        try:
            if category_filter.startswith('[') and category_filter.endswith(']'):
                # Handle array format from frontend
                category_filters = json.loads(category_filter)
            else:
                # Handle single value
                category_filters = [category_filter]
        except (json.JSONDecodeError, ValueError):
            category_filters = []
    
    with get_db_session() as db:
        reviews = get_reviews_by_brand(db, brand)
        print(f"[DEBUG] Total reviews fetched for brand '{brand}': {len(reviews)}")

        # Apply filters
        filtered_reviews = []
        for review in reviews:
            # Rating filter - check if any rating matches
            if rating_filters and review['rating'] not in rating_filters:
                continue
            # Sentiment filter
            if sentiment_filter and review['sentiment_category'] != sentiment_filter:
                continue
            # Date filters
            review_date = review.get('date')
            if date_from:
                try:
                    if not review_date or review_date < date_from:
                        continue
                except Exception:
                    continue
            if date_to:
                try:
                    if not review_date or review_date > date_to:
                        continue
                except Exception:
                    continue
            # Robust Category filter - check if any category matches
            if category_filters and 'all' not in category_filters:
                review_categories = []
                cats = review.get('categories')
                if cats:
                    try:
                        if isinstance(cats, str):
                            review_categories = json.loads(cats)
                        elif isinstance(cats, list):
                            review_categories = cats
                    except Exception:
                        review_categories = []
                
                # Check if any of the review categories match any of the filter categories
                category_matches = False
                for filter_cat in category_filters:
                    if any(filter_cat.strip().lower() == str(c).strip().lower() for c in review_categories):
                        category_matches = True
                        break
                
                if not category_matches:
                    continue
            filtered_reviews.append(review)

        print(f"[DEBUG] Filtered reviews count: {len(filtered_reviews)} (after all filters)")

        # Sort by date descending
        filtered_reviews.sort(key=lambda x: x['date'] or '', reverse=True)

        total = len(filtered_reviews)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        page_reviews = filtered_reviews[start_idx:end_idx]

        review_list = []
        for r in page_reviews:
            # Parse matched keywords for highlighting
            matched_keywords = r.get('matched_keywords')
            if isinstance(matched_keywords, str) and matched_keywords.strip().startswith('['):
                try:
                    keywords_list = json.loads(matched_keywords)
                except:
                    keywords_list = []
            elif isinstance(matched_keywords, list):
                keywords_list = matched_keywords
            else:
                keywords_list = []
            
            # Apply highlighting to review text
            highlighted_review = highlight_keywords(r['review'], keywords_list)
            
            review_list.append({
                'customer_name': r['customer_name'],
                'review': highlighted_review,
                'date': r['date'],
                'rating': r['rating'],
                'review_link': r['review_link'],
                'sentiment_score': r['sentiment_score'],
                'sentiment_category': r['sentiment_category'],
                'categories': (lambda x: json.loads(x) if isinstance(x, str) and x.strip().startswith('[') else (x if isinstance(x, list) else []))(r.get('categories')),
                'matched_keywords': keywords_list
            })
    
    # Log timing
    end_time = time.time()
    duration = end_time - start_time
    logger.info(f"[TIMING] GET /api/brands/{brand}/reviews completed - Time: {duration:.2f}s")
    
    return jsonify({
        'brand': brand,
        'total_reviews': total,
        'page': page,
        'per_page': per_page,
        'reviews': review_list
    })

# --- HIGHLIGHT FUNCTION (AS BEFORE) ---
def highlight_keywords(text, keywords):
    if not text or not keywords:
        return text
    import re
    
    # Remove duplicates and sort by length (longest first to avoid partial matches)
    unique_keywords = list(set(keywords))
    sorted_keywords = sorted(unique_keywords, key=len, reverse=True)
    
    def replacer(match):
        return f'<mark class="bg-gray-200 text-gray-900 px-1 rounded font-medium">{match.group(0)}</mark>'
    
    # Create a pattern that avoids highlighting inside existing <mark> tags
    for kw in sorted_keywords:
        # Pattern that matches keyword but not if it's already inside a <mark> tag
        # Uses negative lookbehind and lookahead to avoid highlighting inside existing marks
        escaped_kw = re.escape(kw)
        pattern = re.compile(
            f'(?<!<mark[^>]*>)(?<!<mark[^>]*>[^<]*){escaped_kw}(?![^<]*</mark>)',
            re.IGNORECASE
        )
        text = pattern.sub(replacer, text)
    
    return text

@app.route('/api/brands/<brand>/analytics', methods=['GET'])
def get_brand_analytics(brand):
    import time
    start_time = time.time()
    
    # Parse multiple ratings and categories from query parameters
    rating_filter = request.args.get('rating')
    category_filter = request.args.get('category')
    
    # Parse multiple ratings and categories
    rating_filters = []
    if rating_filter:
        try:
            if rating_filter.startswith('[') and rating_filter.endswith(']'):
                # Handle array format from frontend
                rating_filters = json.loads(rating_filter)
            else:
                # Handle single value
                rating_filters = [int(rating_filter)]
        except (json.JSONDecodeError, ValueError):
            rating_filters = []
    
    category_filters = []
    if category_filter:
        try:
            if category_filter.startswith('[') and category_filter.endswith(']'):
                # Handle array format from frontend
                category_filters = json.loads(category_filter)
            else:
                # Handle single value
                category_filters = [category_filter]
        except (json.JSONDecodeError, ValueError):
            category_filters = []
    
    with get_db_session() as db:
        # Use optimized analytics function
        analytics_data = get_brand_analytics_optimized(db, brand)
        
        # For now, we'll still need to process some data in Python for complex analytics
        # But the basic stats are now database-optimized
        reviews = get_reviews_by_brand(db, brand)
        
        # Apply filters to reviews for analytics
        if rating_filters or category_filters:
            filtered_reviews = []
            for review in reviews:
                # Rating filter - check if any rating matches
                if rating_filters and review['rating'] not in rating_filters:
                    continue
                # Category filter - check if any category matches
                if category_filters and 'all' not in category_filters:
                    review_categories = []
                    cats = review.get('categories')
                    if cats:
                        try:
                            if isinstance(cats, str):
                                review_categories = json.loads(cats)
                            elif isinstance(cats, list):
                                review_categories = cats
                        except Exception:
                            review_categories = []
                    
                    # Check if any of the review categories match any of the filter categories
                    category_matches = False
                    for filter_cat in category_filters:
                        if any(filter_cat.strip().lower() == str(c).strip().lower() for c in review_categories):
                            category_matches = True
                            break
                    
                    if not category_matches:
                        continue
                filtered_reviews.append(review)
            reviews = filtered_reviews
        
        # Monthly sentiment breakdown (still needs Python processing for now)
        period = request.args.get('period', 'all')
        if period == 'all':
            date_filter = False
        else:
            date_filter = True
        
        # Filter by date if needed
        if date_filter:
            twelve_months_ago = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
            reviews = [r for r in reviews if r['date'] and r['date'] >= twelve_months_ago]
        
        # Group by month and sentiment
        monthly_data = defaultdict(lambda: {'positive': 0, 'negative': 0, 'neutral': 0, 'total': 0})
        for review in reviews:
            if review['date'] and review['sentiment_category']:
                try:
                    # Parse date and get month
                    date_obj = datetime.strptime(review['date'], '%Y-%m-%d')
                    month_key = date_obj.strftime('%Y-%m')
                    monthly_data[month_key][review['sentiment_category']] += 1
                    monthly_data[month_key]['total'] += 1
                except:
                    continue

        # Convert to list format for frontend
        monthly_trends = []
        for month in sorted(monthly_data.keys()):
            data = monthly_data[month]
            if data['total'] > 0:
                monthly_trends.append({
                    'month': month,
                    'positive': data['positive'],
                    'negative': data['negative'],
                    'neutral': data['neutral'],
                    'total': data['total']
                })

        # Top keywords (still needs Python processing)
        all_text = ' '.join([r['review'] for r in reviews if r['review']])
        words = re.findall(r'\b\w+\b', all_text.lower())
        word_counts = Counter(words)
        # Filter out common words
        common_words = {'the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'up', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'into', 'him', 'time', 'two', 'more', 'go', 'no', 'way', 'could', 'my', 'than', 'first', 'been', 'call', 'who', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part'}
        filtered_words = {word: count for word, count in word_counts.items() if word not in common_words and len(word) > 3}
        top_keywords = sorted(filtered_words.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Sizing/fit mentions
        sizing_fit_keywords = ['size', 'sizing', 'fit', 'fits', 'small', 'large', 'medium', 'tight', 'loose', 'perfect', 'runs', 'true', 'measurements']
        sizing_fit_reviews = 0
        for review in reviews:
            review_text = review['review'].lower() if review['review'] else ''
            if any(keyword in review_text for keyword in sizing_fit_keywords):
                sizing_fit_reviews += 1

        # Log timing
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"[TIMING] GET /api/brands/{brand}/analytics completed - Time: {duration:.2f}s")
        
        return jsonify({
            'brand': brand,
            'total_reviews': analytics_data['total_reviews'],
            'average_rating': analytics_data['average_rating'],
            'sentiment_breakdown': analytics_data['sentiment_breakdown'],
            'average_sentiment_score': analytics_data['average_sentiment_score'],
            'monthly_trends': monthly_trends,
            'top_keywords': top_keywords,
            'last_updated': analytics_data['last_updated'],
            'sizing_fit_mentions': sizing_fit_reviews
        })

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "database": "connected"
    })

@app.route('/api/scrape', methods=['POST'])
def scrape_api():
    logger.info('--- /api/scrape called ---')
    try:
        data = request.get_json()
        logger.info('Request data:', data)
        source_url = data.get('source_url')
        if not source_url:
            logger.error('Missing source_url in request')
            return jsonify({'error': 'Missing source_url'}), 400
        # Extract brand from URL
        brand_match = re.search(r'www\.trustpilot\.com/review/([^.]+)', source_url)
        if not brand_match:
            logger.error('Invalid Trustpilot URL')
            return jsonify({'error': 'Invalid Trustpilot URL'}), 400
        brand = brand_match.group(1)
        logger.info(f'Extracted brand: {brand}')
        
        # Check if this is a new brand (no existing reviews)
        is_new_brand = data.get('is_new_brand', False)
        if is_new_brand:
            logger.info(f"New brand detected: {brand}")
        
        from database import init_db, get_db_session, Review
        logger.info('Initializing DB...')
        init_db()
        logger.info('Starting improved scraper...')
        scraper = TrustpilotScraper(headless=True)
        new_reviews_count = scraper.scrape_brand_reviews_improved(brand, max_pages=None, is_new_brand=is_new_brand)
        logger.info(f'Improved scraper finished. new_reviews_count: {new_reviews_count}')
        if new_reviews_count is None:
            new_reviews_count = 0
        logger.info('Browser closed.')
        with get_db_session() as db:
            logger.info('Getting total_reviews...')
            row = db.execute(
                text('SELECT COUNT(*) FROM reviews WHERE brand_name = :brand_name'),
                {'brand_name': brand}
            ).fetchone()
            total_reviews = row[0] if row is not None else 0
        logger.info(f"Returning: success=True, brand={brand}, new_reviews={new_reviews_count}, total_reviews={total_reviews}")
        return jsonify({
            'success': True,
            'brand': brand,
            'newReviews': new_reviews_count,
            'totalReviews': total_reviews
        })
    except Exception as e:
        import traceback
        logger.error('Exception in /api/scrape:')
        traceback.print_exc()
        logger.error(f"Error in /api/scrape: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/brand-source-url', methods=['GET'])
def get_brand_source_url_api():
    brand_id = request.args.get('brand_id')
    if not brand_id:
        return jsonify({'error': 'Missing brand_id parameter'}), 400
    
    with get_db_session() as db:
        brand_source = get_brand_source_url(db, brand_id)
        if brand_source is not None:
            return jsonify(brand_source)
        else:
            return jsonify({'error': 'Brand not found'}), 404

@app.route('/api/brand-source-url', methods=['POST'])
def set_brand_source_url_api():
    data = request.get_json()
    brand_id = data.get('brand_id')
    source_url = data.get('source_url')
    brand_display_name = data.get('brand_display_name')
    
    if not brand_id or not source_url:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    with get_db_session() as db:
        result = set_brand_source_url(db, brand_id, source_url)
        return jsonify(result)

@app.route('/api/scrape_brand', methods=['POST'])
def scrape_brand_api():
    logger.info('--- /api/scrape_brand called ---')
    try:
        data = request.get_json()
        # Log request data without logo_data to avoid massive log output
        log_data = {k: v for k, v in data.items() if k != 'logo_data'}
        if 'logo_data' in data:
            log_data['logo_data'] = f"[BASE64_DATA_{len(data['logo_data'])}_chars]"
        logger.info('Request data: %s', log_data)
        brand = data.get('brand')
        if not brand:
            logger.error('Missing brand in request')
            return jsonify({'error': 'Missing brand'}), 400
        
        # Check if this is a new brand (no existing reviews)
        is_new_brand = data.get('is_new_brand', False)
        if is_new_brand:
            logger.info(f"New brand detected: {brand}")
        
        from database import init_db, get_db_session, Review
        logger.info('Initializing DB...')
        init_db()
        logger.info('Starting ultra-fast scraper...')
        scraper = TrustpilotScraper(headless=True)
        
        # Get the Trustpilot URL for the brand
        with get_db_session() as db:
            brand_source = get_brand_source_url(db, brand)
            if not brand_source or 'source_url' not in brand_source:
                logger.error(f'No Trustpilot URL found for brand: {brand}')
                return jsonify({'error': f'No Trustpilot URL found for brand: {brand}'}), 400
            trustpilot_url = brand_source['source_url']
        
        # Use ultra-fast scraper
        new_reviews_count = scraper.scrape_brand_reviews(brand, max_pages=None, start_page=1, is_new_brand=is_new_brand)
        
        logger.info(f'Ultra-fast scraper finished. New reviews: {new_reviews_count}')
        if new_reviews_count is None:
            new_reviews_count = 0
        
        logger.info('Browser closed.')
        with get_db_session() as db:
            logger.info('Getting total_reviews...')
            row = db.execute(
                text('SELECT COUNT(*) FROM reviews WHERE brand_name = :brand_name'),
                {'brand_name': brand}
            ).fetchone()
            total_reviews = row[0] if row is not None else 0
        logger.info(f"Returning: success=True, brand={brand}, new_reviews={new_reviews_count}, total_reviews={total_reviews}")
        return jsonify({
            'success': True,
            'brand': brand,
            'newReviews': new_reviews_count,
            'totalReviews': total_reviews
        })
    except Exception as e:
        import traceback
        logger.error('Exception in /api/scrape_brand:')
        traceback.print_exc()
        logger.error(f"Error in /api/scrape_brand: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/brands/<brand_id>', methods=['DELETE'])
def delete_brand(brand_id):
    from database import delete_brand_and_reviews, get_db_session, get_brands, delete_brand_logo
    try:
        logger.info(f"[DELETE] Received delete request for brand_id: {brand_id}")
        
        # Delete logo from database first
        try:
            with get_db_session() as db:
                delete_brand_logo(db, brand_id)
                logger.info(f"[DELETE] Logo deleted from database for {brand_id}")
        except Exception as logo_error:
            logger.warning(f"[DELETE] Could not delete logo for {brand_id}: {logo_error}")
        
        # Delete brand and all reviews from database
        delete_brand_and_reviews(brand_id)
        logger.info(f"[DELETE] Brand {brand_id} and all associated data deleted from database")
        
        return {'success': True, 'message': f'Brand {brand_id} and all associated data deleted from database'}
    except Exception as e:
        logger.error(f"[DELETE] Error deleting brand {brand_id}: {e}")
        return {'success': False, 'error': str(e)}, 500

@app.route('/api/brands/<brand_id>/keywords', methods=['GET'])
def get_brand_keywords_api(brand_id):
    with get_db_session() as db:
        keywords = get_brand_keywords(db, brand_id)
    return jsonify({'brand_id': brand_id, 'keywords': keywords})

@app.route('/api/brands/<brand_id>/keywords', methods=['POST'])
def set_brand_keywords_api(brand_id):
    data = request.get_json()
    category = data.get('category')
    keywords = data.get('keywords')
    append_mode = data.get('append', False)  # New parameter for incremental addition
    
    if not category or not isinstance(keywords, list):
        return jsonify({'error': 'category and keywords (list) required'}), 400
    
    with get_db_session() as db:
        if append_mode:
            # Use new incremental function
            updated_keywords = add_brand_keywords(db, brand_id, category, keywords)
            # Trigger incremental update of existing reviews for this brand
            try:
                response = update_reviews_keywords_internal(
                    brand_id=brand_id,
                    new_keywords=keywords,
                    category=category,
                    is_global=False
                )
                return jsonify({
                    'success': True, 
                    'updated_keywords': updated_keywords,
                    'reviews_updated': response.get('updates_made', 0)
                })
            except Exception as e:
                logger.warning(f"Failed to update existing reviews for brand {brand_id}: {e}")
                return jsonify({
                    'success': True, 
                    'updated_keywords': updated_keywords,
                    'reviews_updated': 0,
                    'warning': 'Keywords saved but failed to update existing reviews'
                })
        else:
            # Original behavior - replace all keywords
            set_brand_keywords(db, brand_id, category, keywords)
            return jsonify({'success': True})

@app.route('/api/keywords', methods=['GET'])
def get_keywords_global():
    with get_db_session() as db:
        keywords = get_global_keywords(db)
    return jsonify({'keywords': keywords})

@app.route('/api/keywords', methods=['POST'])
def set_keywords_global():
    data = request.get_json()
    category = data.get('category')
    keywords = data.get('keywords')
    append_mode = data.get('append', False)  # New parameter for incremental addition
    
    if not category or not isinstance(keywords, list):
        return jsonify({'error': 'category and keywords (list) required'}), 400
    
    with get_db_session() as db:
        if append_mode:
            # Use new incremental function
            updated_keywords = add_global_keywords(db, category, keywords)
            # Trigger incremental update of existing reviews
            try:
                from flask import current_app
                with current_app.test_request_context():
                    response = update_reviews_keywords_internal(
                        new_keywords=keywords,
                        category=category,
                        is_global=True
                    )
                return jsonify({
                    'success': True, 
                    'updated_keywords': updated_keywords,
                    'reviews_updated': response.get('updates_made', 0)
                })
            except Exception as e:
                logger.warning(f"Failed to update existing reviews: {e}")
                return jsonify({
                    'success': True, 
                    'updated_keywords': updated_keywords,
                    'reviews_updated': 0,
                    'warning': 'Keywords saved but failed to update existing reviews'
                })
        else:
            # Original behavior - replace all keywords
            set_global_keywords(db, category, keywords)
            return jsonify({'success': True})

# Globals and helpers (only if not already present)
running_scrapers = {}  # brand_name -> (thread, cancel_event)

# Cancel scraping endpoint (if not present)
from flask import make_response
@app.route('/api/brands/<brand_name>/cancel', methods=['POST', 'OPTIONS'])
def cancel_brand_scraping(brand_name):
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS'
        return response, 200
    try:
        # Signal cancellation if scraper is running
        if brand_name in running_scrapers:
            thread, cancel_event = running_scrapers[brand_name]
            cancel_event.set()
            print(f"[CANCEL] Cancellation requested for {brand_name}.")
            thread.join(timeout=10)  # Optionally wait for thread to finish
            running_scrapers.pop(brand_name, None)
        # Delete the brand and all its data from database
        with get_db_session() as db:
            # Delete logo first
            try:
                delete_brand_logo(db, brand_name)
                logger.info(f"[CANCEL] Logo deleted from database for {brand_name}")
            except Exception as logo_error:
                logger.warning(f"[CANCEL] Could not delete logo for {brand_name}: {logo_error}")
            
            # Delete brand and reviews
            delete_brand_and_reviews(brand_name)
        return jsonify({'success': True, 'message': f'Brand {brand_name} scraping cancelled and removed from database'})
    except Exception as e:
        return jsonify({'error': f'Failed to cancel brand scraping: {str(e)}'}), 500

# Internal helper for keyword updates (used by both API endpoint and automatic updates)
def update_reviews_keywords_internal(brand_id=None, new_keywords=[], category='', is_global=True):
    """Internal function to update existing reviews with new keywords"""
    if not new_keywords:
        return {'error': 'No keywords provided', 'updates_made': 0}
        
    with get_db_session() as db:
        # Get reviews to update (all reviews if global, brand-specific if not)
        if is_global:
            reviews_query = "SELECT id, review, matched_keywords, categories FROM reviews WHERE review IS NOT NULL"
            reviews = db.execute(text(reviews_query)).fetchall()
        else:
            if not brand_id:
                return {'error': 'Brand ID required for brand-specific keywords', 'updates_made': 0}
            reviews_query = "SELECT id, review, matched_keywords, categories FROM reviews WHERE brand_name = :brand_id AND review IS NOT NULL"
            reviews = db.execute(text(reviews_query), {'brand_id': brand_id}).fetchall()
        
        updates_made = 0
        
        # Process each review incrementally
        for review in reviews:
            review_id, review_text, current_keywords_json, current_categories_json = review
            review_text_lower = review_text.lower()
            
            # Parse existing keywords and categories
            try:
                current_keywords = json.loads(current_keywords_json) if current_keywords_json else []
                current_categories = json.loads(current_categories_json) if current_categories_json else []
            except:
                current_keywords = []
                current_categories = []
            
            # Check if any new keywords match this review (with stemming)
            matched_new_keywords = []
            for keyword in new_keywords:
                if keyword_matches_text(keyword, review_text) and keyword not in current_keywords:
                    matched_new_keywords.append(keyword)
            
            # Update if new matches found
            if matched_new_keywords:
                updated_keywords = list(set(current_keywords + matched_new_keywords))
                updated_categories = list(set(current_categories + [category])) if category and category not in current_categories else current_categories
                
                # Update the review record
                update_query = """
                    UPDATE reviews 
                    SET matched_keywords = :keywords, categories = :categories 
                    WHERE id = :review_id
                """
                db.execute(text(update_query), {
                    'keywords': json.dumps(sorted(updated_keywords)),
                    'categories': json.dumps(sorted(updated_categories)),
                    'review_id': review_id
                })
                updates_made += 1
        
        db.commit()
        
        return {
            'success': True,
            'message': f'Updated {updates_made} reviews with new keywords',
            'updates_made': updates_made,
            'total_reviews_checked': len(reviews)
        }

# Incremental keyword processing for existing reviews
@app.route('/api/update-reviews-keywords', methods=['POST'])
def update_reviews_keywords():
    """Incrementally update existing reviews with new keywords without full reprocessing"""
    try:
        data = request.get_json()
        brand_id = data.get('brand_id')
        new_keywords = data.get('keywords', [])
        category = data.get('category', '')
        is_global = data.get('is_global', True)
        
        # Use the internal helper function
        result = update_reviews_keywords_internal(brand_id, new_keywords, category, is_global)
        
        if result.get('error'):
            return jsonify(result), 400
        
        return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error updating reviews with keywords: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error updating reviews: {str(e)}'
        }), 500

# Reprocess reviews endpoint (if not present)
@app.route('/api/reprocess-reviews', methods=['POST'])
def reprocess_reviews():
    """Reprocess all existing reviews with updated keywords"""
    try:
        import subprocess
        import sys
        import os
        # Get the path to the process_existing_reviews.py script
        script_path = os.path.join(os.path.dirname(__file__), 'services/process_existing_reviews.py')
        # Run the reprocessing script
        result = subprocess.run([sys.executable, script_path], 
                              capture_output=True, text=True, cwd=os.path.dirname(script_path))
        if result.returncode == 0:
            return jsonify({
                'success': True, 
                'message': 'Reviews reprocessed successfully',
                'output': result.stdout
            })
        else:
            return jsonify({
                'success': False, 
                'error': 'Failed to reprocess reviews',
                'output': result.stderr
            }), 500
    except Exception as e:
        return jsonify({
            'success': False, 
            'error': f'Error reprocessing reviews: {str(e)}'
        }), 500

# --- COMMENTED OUT /reviews-robust ENDPOINT (now redundant) ---
# @app.route('/api/brands/<brand>/reviews-robust', methods=['GET'])
# def get_brand_reviews_robust(brand):
#     page = int(request.args.get('page', 1))
#     per_page = int(request.args.get('per_page', 20))
#     rating_filter = request.args.get('rating')
#     sentiment_filter = request.args.get('sentiment')
#     date_from = request.args.get('date_from')
#     date_to = request.args.get('date_to')
#     category_filter = request.args.get('category')
#     with get_db_session() as db:
#         reviews = get_reviews_by_brand(db, brand)
#         print(f"[DEBUG] Total reviews fetched for brand '{brand}': {len(reviews)}")
#         filtered_reviews = []
#         for review in reviews:
#             if rating_filter and review['rating'] != int(rating_filter):
#                 continue
#             if sentiment_filter and review['sentiment_category'] != sentiment_filter:
#                 continue
#             review_date = review.get('date')
#             if date_from:
#                 try:
#                     if not review_date or review_date < date_from:
#                         continue
#                 except Exception:
#                     continue
#             if date_to:
#                 try:
#                     if not review_date or review_date > date_to:
#                         continue
#                 except Exception:
#                     continue
#             if category_filter and category_filter != 'all':
#                 review_categories = []
#                 cats = review.get('categories')
#                 if cats:
#                     try:
#                         if isinstance(cats, str):
#                             review_categories = json.loads(cats)
#                         elif isinstance(cats, list):
#                             review_categories = cats
#                     except Exception:
#                         review_categories = []
#                 if not review_categories or not any(category_filter.strip().lower() == str(c).strip().lower() for c in review_categories):
#                     continue
#             filtered_reviews.append(review)
#         print(f"[DEBUG] Filtered reviews count: {len(filtered_reviews)} (after all filters)")
#         if filtered_reviews:
#             print(f"[DEBUG] First 3 filtered review categories: {[r.get('categories') for r in filtered_reviews[:3]]}")
#         filtered_reviews.sort(key=lambda x: x['date'] or '', reverse=True)
#         total = len(filtered_reviews)
#         start_idx = (page - 1) * per_page
#         end_idx = start_idx + per_page
#         page_reviews = filtered_reviews[start_idx:end_idx]
#         review_list = [
#             {
#                 'customer_name': r['customer_name'],
#                 'review': r['review'],
#                 'date': r['date'],
#                 'rating': r['rating'],
#                 'review_link': r['review_link'],
#                 'sentiment_score': r['sentiment_score'],
#                 'sentiment_category': r['sentiment_category'],
#                 'categories': (lambda x: json.loads(x) if isinstance(x, str) and x.strip().startswith('[') else (x if isinstance(x, list) else []))(r.get('categories')),
#                 'matched_keywords': (lambda x: json.loads(x) if isinstance(x, str) and x.strip().startswith('[') else (x if isinstance(x, list) else []))(r.get('matched_keywords'))
#             }
#             for r in page_reviews
#         ]
#     return jsonify({
#         'brand': brand,
#         'total_reviews': total,
#         'page': page,
#         'per_page': per_page,
#         'reviews': review_list
#     })

# Logo endpoints
@app.route('/api/upload_logo', methods=['POST'])
def upload_logo():
    """Upload logo for a brand."""
    try:
        data = request.get_json()
        brand_name = data.get('brand_name')
        logo_data = data.get('logo_data')  # base64 encoded image
        logo_filename = data.get('logo_filename')
        logo_mime_type = data.get('logo_mime_type')
        
        logger.info(f"Upload logo request for brand: {brand_name}")
        logger.info(f"Data received: {list(data.keys())}")
        
        if not all([brand_name, logo_data, logo_filename, logo_mime_type]):
            missing = []
            if not brand_name: missing.append('brand_name')
            if not logo_data: missing.append('logo_data')
            if not logo_filename: missing.append('logo_filename')
            if not logo_mime_type: missing.append('logo_mime_type')
            return jsonify({'error': f'Missing required fields: {", ".join(missing)}'}), 400
        
        with get_db_session() as db:
            # Check if brand exists first
            brand_check = get_brand_source_url(db, brand_name)
            if not brand_check:
                logger.error(f"Brand not found: {brand_name}")
                return jsonify({'error': f'Brand not found: {brand_name}'}), 404
            
            logger.info(f"Brand found: {brand_name}, updating logo...")
            success = update_brand_logo(db, brand_name, logo_data, logo_filename, logo_mime_type)
            if success:
                logger.info(f"Logo uploaded successfully for {brand_name}")
                return jsonify({'message': 'Logo uploaded successfully', 'brand_name': brand_name}), 200
            else:
                logger.error(f"Failed to update logo for {brand_name}")
                return jsonify({'error': 'Failed to update logo'}), 500
                
    except Exception as e:
        logger.error(f"Error uploading logo: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/logos/<brand_name>', methods=['GET'])
def get_logo(brand_name):
    """Get logo for a brand."""
    logger.info(f"[LOGO] GET request for brand: {brand_name}")
    try:
        with get_db_session() as db:
            logo_data = get_brand_logo(db, brand_name)
            if logo_data:
                logger.info(f"[LOGO] Found logo for {brand_name}: {logo_data.get('logo_filename', 'N/A')}")
                return jsonify({
                    'logo_data': logo_data['logo_data'],
                    'logo_filename': logo_data['logo_filename'],
                    'logo_mime_type': logo_data['logo_mime_type']
                }), 200
            else:
                logger.warning(f"[LOGO] No logo found for brand: {brand_name}")
                return jsonify({'error': 'Logo not found'}), 404

    except Exception as e:
        logger.error(f"[LOGO] Error getting logo for {brand_name}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logos', methods=['GET'])
def get_all_logos():
    """Get all logos for all brands in a single request."""
    logger.info("[LOGO] GET request for all logos")
    try:
        with get_db_session() as db:
            # Get all brands with their logos
            result = db.execute(text("""
                SELECT brand_name, logo_data, logo_filename, logo_mime_type 
                FROM brand_source_urls 
                WHERE logo_data IS NOT NULL
            """))
            
            logos = {}
            for row in result.fetchall():
                brand_name, logo_data, logo_filename, logo_mime_type = row
                if logo_data:  # Only include brands that have logos
                    logos[brand_name] = {
                        'logo_data': logo_data,
                        'logo_filename': logo_filename,
                        'logo_mime_type': logo_mime_type
                    }
            
            # Reduced logging - only log count, not all brand names
            logger.info(f"[LOGO] Returning {len(logos)} logos")
            return jsonify({
                'logos': logos,
                'total_brands': len(logos)
            }), 200

    except Exception as e:
        logger.error(f"[LOGO] Error getting all logos: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logos/<brand_name>', methods=['DELETE'])
def delete_logo(brand_name):
    """Delete logo for a brand."""
    try:
        with get_db_session() as db:
            success = delete_brand_logo(db, brand_name)
            if success:
                return jsonify({'message': 'Logo deleted successfully', 'brand_name': brand_name}), 200
            else:
                return jsonify({'error': 'Brand not found'}), 404
                
    except Exception as e:
        logger.error(f"Error deleting logo: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/generate-report', methods=['POST'])
def generate_ai_report():
    """Generate AI report based on filtered reviews from frontend."""
    try:
        data = request.get_json()
        brand_name = data.get('brand_name')
        prompt = data.get('prompt')
        reviews_data = data.get('reviews_data', [])
        
        if not brand_name or not prompt:
            return jsonify({'error': 'brand_name and prompt are required'}), 400
        
        if not reviews_data:
            return jsonify({'error': 'No reviews data provided'}), 400
        
        logger.info(f"[AI-REPORT] Generating report for brand: {brand_name}")
        logger.info(f"[AI-REPORT] Prompt: {prompt[:100]}...")
        logger.info(f"[AI-REPORT] Received {len(reviews_data)} filtered reviews from frontend")
        
        # Use AI service to generate the report with the filtered data
        ai_service = get_ai_service()
        report_content = ai_service.generate_report_from_data(brand_name, prompt, reviews_data)
        
        return jsonify({
            'success': True,
            'report': report_content,
            'total_reviews': len(reviews_data),
            'brand_name': brand_name
        })
        
    except Exception as e:
        logger.error(f"[AI-REPORT] Error generating report: {e}")
        import traceback
        logger.error(f"[AI-REPORT] Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Failed to generate report: {str(e)}'}), 500

# --- EXPORT ENDPOINT FOR ALL FILTERED REVIEWS ---
@app.route('/api/brands/<brand>/reviews/export', methods=['GET'])
def get_all_filtered_reviews_for_export(brand):
    """Get ALL filtered reviews for CSV/Excel export (no pagination)"""
    start_time = time.time()
    
    # Get filter parameters (same as dashboard endpoint but no pagination)
    rating_filter = request.args.get('rating')
    sentiment = request.args.get('sentiment', 'all')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category_filter = request.args.get('category')
    keyword = request.args.get('keyword', '').strip()
    
    try:
        session = get_db_session()
        
        # Parse filters to match the function signature
        rating_filters = None
        if rating_filter:
            rating_filters = [int(r) for r in rating_filter.split(',')]
        
        category_filters = None
        if category_filter:
            category_filters = category_filter.split(',')
        
        # Use the same filtering logic but without pagination
        filtered_data = get_filtered_reviews_and_analytics(
            brand=brand,
            rating_filters=rating_filters,
            category_filters=category_filters,
            date_from=date_from,
            date_to=date_to,
            sentiment_filter=sentiment if sentiment != 'all' else None,
            keyword_filter=keyword if keyword else None,
            page=1,  # Get all from first page
            per_page=999999  # Very large number to get all reviews
        )
        
        all_reviews = filtered_data['reviews']
        
        duration = time.time() - start_time
        logger.info(f"[EXPORT] Fetched {len(all_reviews)} filtered reviews for {brand}. Time: {duration:.2f}s")
        
        return jsonify({
            'reviews': all_reviews,
            'total': len(all_reviews),
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"[EXPORT] Error fetching all filtered reviews for {brand}: {str(e)}")
        return jsonify({'error': str(e)}), 500

# --- UNIFIED HIGH-PERFORMANCE ENDPOINT ---
@app.route('/api/brands/<brand>/dashboard', methods=['GET'])
def get_brand_dashboard_optimized(brand):
    """
    Unified endpoint that returns filtered reviews + pre-calculated analytics in one call.
    This eliminates frontend performance bottlenecks by doing all processing on the backend.
    """
    import time
    start_time = time.time()
    
    # Parse query parameters (same as existing endpoints)
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    rating_filter = request.args.get('rating')
    sentiment_filter = request.args.get('sentiment')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category_filter = request.args.get('category')
    keyword_filter = request.args.get('keyword', '').strip()
    
    # Parse multiple ratings and categories
    rating_filters = []
    if rating_filter:
        try:
            if rating_filter.startswith('[') and rating_filter.endswith(']'):
                rating_filters = json.loads(rating_filter)
            else:
                rating_filters = [int(rating_filter)]
        except (json.JSONDecodeError, ValueError):
            rating_filters = []
    
    category_filters = []
    if category_filter:
        try:
            if category_filter.startswith('[') and category_filter.endswith(']'):
                category_filters = json.loads(category_filter)
            else:
                category_filters = [category_filter]
        except (json.JSONDecodeError, ValueError):
            category_filters = []
    
    try:
        logger.info(f"[DASHBOARD] Starting optimized query for brand: {brand}")
        logger.info(f"[DASHBOARD] Filters - ratings: {rating_filters}, categories: {category_filters}")
        
        # Get filtered reviews using optimized database query
        filtered_data = get_filtered_reviews_and_analytics(
            brand=brand,
            rating_filters=rating_filters,
            category_filters=category_filters,
            date_from=date_from,
            date_to=date_to,
            sentiment_filter=sentiment_filter,
            keyword_filter=keyword_filter,
            page=page,
            per_page=per_page
        )
        
        logger.info(f"[DASHBOARD] Query completed successfully. Total filtered: {filtered_data.get('total_reviews', 0)}")
        
        # Quick fix: Add top_keywords if missing from analytics
        if 'top_keywords' not in filtered_data.get('analytics', {}):
            print("[DEBUG] Adding top_keywords directly in dashboard endpoint")
            from database import get_db_session
            from sqlalchemy import text
            
            # Build the same where clause for keywords
            where_conditions = ['brand_name = :brand']
            params = {'brand': brand}
            
            if category_filters:
                category_conditions = []
                for i, cat in enumerate(category_filters):
                    category_conditions.append(f'categories LIKE :cat{i}')
                    params[f'cat{i}'] = f'%{cat}%'
                if category_conditions:
                    where_conditions.append(f"({' OR '.join(category_conditions)})")
            
            where_clause = ' AND '.join(where_conditions)
            
            # Get keywords from database
            with get_db_session() as db:
                keywords_query = f"""
                    SELECT matched_keywords
                    FROM reviews 
                    WHERE {where_clause} AND matched_keywords IS NOT NULL AND matched_keywords != ''
                """
                keywords_result = db.execute(text(keywords_query), params).fetchall()
                
                # Process keywords
                keyword_counts = {}
                for row in keywords_result:
                    if row[0]:
                        try:
                            if row[0].strip().startswith('['):
                                keywords_list = json.loads(row[0])
                            else:
                                keywords_list = [kw.strip() for kw in row[0].split(',') if kw.strip()]
                            
                            for keyword in keywords_list:
                                if keyword:
                                    keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
                        except:
                            continue
                
                # Get top 5 keywords
                top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:5]
                print(f"[DEBUG] Calculated {len(top_keywords)} top keywords: {top_keywords}")
                
                # Add to analytics
                filtered_data['analytics']['top_keywords'] = [{'keyword': kw, 'count': count} for kw, count in top_keywords]
        
        # Log timing
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"[TIMING] GET /api/brands/{brand}/dashboard completed - Time: {duration:.2f}s")
        
        return jsonify(filtered_data)
        
    except Exception as e:
        logger.error(f"[DASHBOARD] Error in unified endpoint: {e}")
        import traceback
        logger.error(f"[DASHBOARD] Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Failed to load dashboard data: {str(e)}'}), 500

def get_filtered_reviews_and_analytics(brand, rating_filters=None, category_filters=None, 
                                     date_from=None, date_to=None, sentiment_filter=None,
                                     keyword_filter=None, page=1, per_page=20):
    print(f"[DEBUG] get_filtered_reviews_and_analytics called for brand: {brand}")
    """
    Optimized function that performs filtering and analytics calculation in the database.
    Returns both paginated reviews and pre-calculated analytics for filtered data.
    """
    from database import get_db_session
    from sqlalchemy import text, desc, func
    import json
    from datetime import datetime
    
    with get_db_session() as db:
        # Build the base query with all filters applied at database level
        base_conditions = ["brand_name = :brand"]
        params = {"brand": brand}
        
        # Rating filter
        if rating_filters and not (len(rating_filters) == 1 and rating_filters[0] == "all"):
            # Convert string ratings to integers
            numeric_ratings = []
            for r in rating_filters:
                try:
                    if isinstance(r, str) and r != "all":
                        numeric_ratings.append(int(r))
                    elif isinstance(r, (int, float)):
                        numeric_ratings.append(int(r))
                except (ValueError, TypeError):
                    continue
            
            if numeric_ratings:
                placeholders = ','.join([f':rating_{i}' for i in range(len(numeric_ratings))])
                base_conditions.append(f"rating IN ({placeholders})")
                for i, rating in enumerate(numeric_ratings):
                    params[f'rating_{i}'] = rating
        
        # Date filters
        if date_from:
            base_conditions.append("date >= :date_from")
            params['date_from'] = date_from
        if date_to:
            base_conditions.append("date <= :date_to")
            params['date_to'] = date_to
        
        # Sentiment filter
        if sentiment_filter and sentiment_filter.lower() not in ['all', '']:
            base_conditions.append("sentiment_category = :sentiment")
            params['sentiment'] = sentiment_filter.lower()
        
        # Category filter (JSON contains check)
        if category_filters and not (len(category_filters) == 1 and category_filters[0] == "all"):
            category_conditions = []
            for i, category in enumerate(category_filters):
                if category != "all":
                    category_conditions.append(f"(categories LIKE :cat_{i} OR categories LIKE :cat_bracket_{i})")
                    params[f'cat_{i}'] = f'%{category}%'
                    params[f'cat_bracket_{i}'] = f'%"{category}"%'
            
            if category_conditions:
                base_conditions.append(f"({' OR '.join(category_conditions)})")
        
        # Keyword filter (search in review text)
        if keyword_filter:
            base_conditions.append("review LIKE :keyword")
            params['keyword'] = f'%{keyword_filter}%'
        
        # Combine all conditions
        where_clause = " AND ".join(base_conditions)
        
        # 1. Get total count of filtered reviews
        count_query = f"SELECT COUNT(*) FROM reviews WHERE {where_clause}"
        total_filtered = db.execute(text(count_query), params).scalar()
        
        # 2. Get paginated reviews
        reviews_query = f"""
            SELECT id, brand_name, customer_name, review, date, rating, review_link,
                   sentiment_score, sentiment_category, categories, matched_keywords
            FROM reviews 
            WHERE {where_clause}
            ORDER BY date DESC, id DESC
            LIMIT :limit OFFSET :offset
        """
        params['limit'] = per_page
        params['offset'] = (page - 1) * per_page
        
        reviews_result = db.execute(text(reviews_query), params).fetchall()
        
        # 3. Calculate analytics on ALL filtered data (not just the paginated subset)
        analytics_params = params.copy()
        # Remove pagination params for analytics calculation
        analytics_params.pop('limit', None)
        analytics_params.pop('offset', None)
        
        analytics_query = f"""
            SELECT 
                AVG(CAST(rating AS FLOAT)) as avg_rating,
                COUNT(*) as total_count,
                SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_count,
                SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative_count,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as neutral_count,
                AVG(CASE WHEN sentiment_score IS NOT NULL THEN sentiment_score ELSE 0 END) as avg_sentiment,
                SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as rating_5_count,
                SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as rating_4_count,
                SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as rating_3_count,
                SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as rating_2_count,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as rating_1_count
            FROM reviews 
            WHERE {where_clause}
        """
        analytics_result = db.execute(text(analytics_query), analytics_params).fetchone()
        
        # 4. Get monthly trends for ALL filtered data (not just paginated)
        trends_query = f"""
            SELECT 
                strftime('%Y-%m', date) as month,
                COUNT(*) as count
            FROM reviews 
            WHERE {where_clause}
            GROUP BY strftime('%Y-%m', date)
            ORDER BY month DESC
            LIMIT 12
        """
        trends_result = db.execute(text(trends_query), analytics_params).fetchall()
        
        # 5. Calculate top keywords from ALL filtered data (similar to frontend logic)
        top_keywords = []  # Initialize to ensure it's always defined
        print(f"[DEBUG] Starting keywords calculation...")
        keywords_query = f"""
            SELECT matched_keywords
            FROM reviews 
            WHERE {where_clause} AND matched_keywords IS NOT NULL AND matched_keywords != ''
        """
        keywords_result = db.execute(text(keywords_query), analytics_params).fetchall()
        print(f"[DEBUG] Keywords query returned {len(keywords_result)} rows")
        logger.info(f"[DEBUG] Keywords query returned {len(keywords_result)} rows")
        
        # Process keywords similar to frontend logic
        keyword_counts = {}
        for row in keywords_result:
            if row[0]:
                try:
                    # Handle both JSON array and comma-separated strings
                    if row[0].strip().startswith('['):
                        keywords_list = json.loads(row[0])
                    else:
                        keywords_list = [kw.strip() for kw in row[0].split(',') if kw.strip()]
                    
                    for keyword in keywords_list:
                        if keyword:
                            keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
                except (json.JSONDecodeError, AttributeError) as e:
                    logger.warning(f"[DEBUG] Failed to parse keywords: {row[0][:100]}... Error: {e}")
                    continue
        
        # Get top 5 keywords
        try:
            top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            print(f"[DEBUG] Top keywords calculated: {top_keywords}")
            logger.info(f"[DEBUG] Top keywords calculated: {top_keywords}")
        except Exception as e:
            print(f"[ERROR] Failed to calculate top keywords: {e}")
            top_keywords = []
        
        # Format the response
        reviews_list = []
        for r in reviews_result:
            review_dict = {
                'id': r[0],
                'brand_name': r[1],
                'customer_name': r[2] or '',
                'customer': r[2] or '',  # Alias for frontend compatibility
                'review': r[3] or '',
                'date': r[4],
                'rating': r[5],
                'review_link': r[6],
                'sentiment_score': r[7],
                'sentiment_category': r[8],
                'categories': json.loads(r[9]) if r[9] and r[9].strip().startswith('[') else (r[9] if r[9] else []),
                'matched_keywords': json.loads(r[10]) if r[10] and r[10].strip().startswith('[') else (r[10] if r[10] else [])
            }
            reviews_list.append(review_dict)
        
        # Format analytics
        analytics = {
            'total_reviews': total_filtered,
            'average_rating': round(analytics_result[0] if analytics_result[0] else 0, 2),
            'sentiment_breakdown': {
                'positive': analytics_result[2] or 0,
                'negative': analytics_result[3] or 0,
                'neutral': analytics_result[4] or 0,
                'total_analyzed': total_filtered
            },
            'average_sentiment_score': round(analytics_result[5] if analytics_result[5] else 0, 3),
            'rating_distribution': {
                '5': analytics_result[6] or 0,
                '4': analytics_result[7] or 0,
                '3': analytics_result[8] or 0,
                '2': analytics_result[9] or 0,
                '1': analytics_result[10] or 0
            },
            'monthly_trends': [{'month': t[0], 'count': t[1]} for t in trends_result],
            'top_keywords': [{'keyword': kw, 'count': count} for kw, count in top_keywords]
        }
        
        # Return unified response
        return {
            'brand': brand,
            'total_reviews': total_filtered,  # Total count after filters applied
            'filtered_total': total_filtered,  # Same as total_reviews for clarity
            'paginated_count': len(reviews_list),  # Number of reviews on this page (e.g., 20)
            'page': page,
            'per_page': per_page,
            'reviews': reviews_list,
            'analytics': analytics,  # Analytics calculated on ALL filtered reviews
            'filters_applied': {
                'rating': rating_filters,
                'category': category_filters,
                'date_from': date_from,
                'date_to': date_to,
                'sentiment': sentiment_filter,
                'keyword': keyword_filter
            }
        }

if __name__ == '__main__':
    # Railway deployment fix - force rebuild
    app.run(debug=True, host='0.0.0.0', port=5000) 