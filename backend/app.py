from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from database import get_db_session, Review, get_brand_source_url, set_brand_source_url, get_reviews_by_brand, get_all_reviews, get_brands, add_review, delete_brand_and_reviews, get_brand_keywords, set_brand_keywords, get_global_keywords, set_global_keywords, get_reviews_by_brand_optimized, get_brand_analytics_optimized, get_brands_with_counts_optimized
from sentiment_analyzer import SentimentAnalyzer
from datetime import datetime, timedelta
import json
from collections import defaultdict, Counter
from trustpilot_scraper import TrustpilotScraper, fetch_trustpilot_logo
import re, requests
import threading
import os
from sqlalchemy import text
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.url_map.strict_slashes = False
# Update CORS to allow only Vercel frontend
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "OPTIONS"]}})

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
        "message": "Welcome to the Trustpilot Scraper API. See /api/brands or /api/health for available endpoints."
    })

@app.route('/api/brands', methods=['GET'])
def get_brands_api():
    with get_db_session() as db:
        brand_counts = get_brands_with_counts_optimized(db)
        summary = []
        for brand_info in brand_counts:
            brand = brand_info['brand']
            review_count = brand_info.get('review_count', 0)
            # Get analytics summary for each brand
            analytics = get_brand_analytics_optimized(db, brand)
            avg_rating = analytics.get('average_rating', 0)
            sentiment_score = analytics.get('average_sentiment_score', 0)
            sentiment = (
                'positive' if sentiment_score > 0.15 else
                'negative' if sentiment_score < -0.15 else
                'neutral'
            )
            last_updated = analytics.get('last_updated', None)
            logo_url = f"/logos/{brand}-logo.jpg"
            brand_source = get_brand_source_url(db, brand)
            if brand_source is not None and 'logo_url' in brand_source and brand_source['logo_url']:
                logo_url = brand_source['logo_url']
            summary.append({
                'brand': brand,
                'logo': logo_url,
                'reviewCount': review_count,
                'avgRating': avg_rating,
                'sentiment': sentiment,
                'lastUpdated': last_updated
            })
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
    scraper = TrustpilotScraper(headless=True)
    extracted_brand_name = scraper.extract_brand_name(trustpilot_url)
    if not extracted_brand_name:
        return jsonify({'error': 'Could not extract brand name from Trustpilot page.'}), 400
    with get_db_session() as db:
        set_brand_source_url(db, extracted_brand_name, trustpilot_url)
    logo_success = fetch_trustpilot_logo(trustpilot_url, extracted_brand_name, extracted_brand_name, output_dir="../frontend/public/logos")
    logo_url = f"/logos/{extracted_brand_name}-logo.jpg" if logo_success else "/placeholder-logo.png"
    def run_scraper():
        try:
            scraper.scrape_brand_reviews(extracted_brand_name, max_pages=50, start_page=1)
        except Exception as e:
            print(f"Error scraping new brand {extracted_brand_name} (pages 1-50): {e}")
    threading.Thread(target=run_scraper, daemon=True).start()
    return jsonify({'success': True, 'brand': extracted_brand_name, 'trustpilot_url': trustpilot_url, 'logo_url': logo_url})

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
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    rating_filter = request.args.get('rating')
    sentiment_filter = request.args.get('sentiment')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category_filter = request.args.get('category')
    
    with get_db_session() as db:
        reviews = get_reviews_by_brand(db, brand)
        print(f"[DEBUG] Total reviews fetched for brand '{brand}': {len(reviews)}")

        # Apply filters
        filtered_reviews = []
        for review in reviews:
            # Rating filter
            if rating_filter and review['rating'] != int(rating_filter):
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
            # Robust Category filter
            if category_filter and category_filter != 'all':
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
                if not review_categories or not any(category_filter.strip().lower() == str(c).strip().lower() for c in review_categories):
                    continue
            filtered_reviews.append(review)

        print(f"[DEBUG] Filtered reviews count: {len(filtered_reviews)} (after all filters)")
        if filtered_reviews:
            print(f"[DEBUG] First 3 filtered review categories: {[r.get('categories') for r in filtered_reviews[:3]]}")

        # Sort by date descending
        filtered_reviews.sort(key=lambda x: x['date'] or '', reverse=True)

        total = len(filtered_reviews)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        page_reviews = filtered_reviews[start_idx:end_idx]

        review_list = [
            {
                'customer_name': r['customer_name'],
                'review': r['review'],
                'date': r['date'],
                'rating': r['rating'],
                'review_link': r['review_link'],
                'sentiment_score': r['sentiment_score'],
                'sentiment_category': r['sentiment_category'],
                'categories': (lambda x: json.loads(x) if isinstance(x, str) and x.strip().startswith('[') else (x if isinstance(x, list) else []))(r.get('categories')),
                'matched_keywords': (lambda x: json.loads(x) if isinstance(x, str) and x.strip().startswith('[') else (x if isinstance(x, list) else []))(r.get('matched_keywords'))
            }
            for r in page_reviews
        ]
    
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
    def replacer(match):
        return f'<mark class="bg-yellow-200 text-yellow-900 px-1 rounded font-medium">{match.group(0)}</mark>'
    for kw in sorted(keywords, key=len, reverse=True):
        pattern = re.compile(re.escape(kw), re.IGNORECASE)
        text = pattern.sub(replacer, text)
    return text

@app.route('/api/brands/<brand>/analytics', methods=['GET'])
def get_brand_analytics(brand):
    with get_db_session() as db:
        # Use optimized analytics function
        analytics_data = get_brand_analytics_optimized(db, brand)
        
        # For now, we'll still need to process some data in Python for complex analytics
        # But the basic stats are now database-optimized
        reviews = get_reviews_by_brand(db, brand)
        
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
        from database import init_db, get_db_session, Review
        logger.info('Initializing DB...')
        init_db()
        logger.info('Starting scraper...')
        scraper = TrustpilotScraper(headless=True)
        new_reviews_count = scraper.scrape_brand_reviews(brand, max_pages=3)
        logger.info('Scraper finished. new_reviews_count:', new_reviews_count)
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
        logger.info('Request data:', data)
        brand = data.get('brand')
        if not brand:
            logger.error('Missing brand in request')
            return jsonify({'error': 'Missing brand'}), 400
        from database import init_db, get_db_session, Review
        logger.info('Initializing DB...')
        init_db()
        logger.info('Starting scraper...')
        scraper = TrustpilotScraper(headless=True)
        new_reviews_count = scraper.scrape_brand_reviews(brand, max_pages=3)
        logger.info(f'Scraper finished. new_reviews_count: {new_reviews_count}')
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
    from database import delete_brand_and_reviews, get_db_session, get_brands
    try:
        logger.info(f"[DELETE] Received delete request for brand_id: {brand_id}")
        with get_db_session() as db:
            all_brands = get_brands(db)
            logger.info(f"[DELETE] All brand IDs in DB: {all_brands}")
        # Delete from DB using canonical ID
        delete_brand_and_reviews(brand_id)
        # Remove logo files from public/logos
        logo_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../frontend/public/logos')
        removed_files = []
        all_files = os.listdir(logo_dir)
        logger.info(f"[DELETE] Logo files in directory: {all_files}")
        for fname in all_files:
            fname_noext = fname.split('.')[0]
            if brand_id in fname_noext:
                try:
                    os.remove(os.path.join(logo_dir, fname))
                    removed_files.append(fname)
                except Exception as e:
                    logger.error(f"[DELETE] Failed to remove logo file {fname}: {e}")
        logger.info(f"[DELETE] Removed files: {removed_files}")
        return {'success': True, 'removed_files': removed_files}
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
    if not category or not isinstance(keywords, list):
        return jsonify({'error': 'category and keywords (list) required'}), 400
    with get_db_session() as db:
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
    if not category or not isinstance(keywords, list):
        return jsonify({'error': 'category and keywords (list) required'}), 400
    with get_db_session() as db:
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
        # Delete the brand and all its data
        with get_db_session() as db:
            delete_brand_and_reviews(brand_name)
        return jsonify({'success': True, 'message': f'Brand {brand_name} scraping cancelled and removed from database'})
    except Exception as e:
        return jsonify({'error': f'Failed to cancel brand scraping: {str(e)}'}), 500

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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 