from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from database import get_db_session, Review, get_brand_source_url, set_brand_source_url, get_reviews_by_brand, get_all_reviews, get_brands, add_review, delete_brand_and_reviews, get_brand_keywords, set_brand_keywords, get_global_keywords, set_global_keywords
from sentiment_analyzer import SentimentAnalyzer
from datetime import datetime, timedelta
import json
from collections import defaultdict, Counter
from trustpilot_scraper import TrustpilotScraper, fetch_trustpilot_logo
import re, requests
import threading
from utils import canonical_brand_id
import os
from sqlalchemy import text
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Ensure DB tables exist at startup
from database import init_db
init_db()

app = Flask(__name__)
app.url_map.strict_slashes = False
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "OPTIONS"]}})

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
        brands = get_brands(db)
        # Get review count and display name for each brand
        brand_counts = []
        for brand in brands:
            reviews = get_reviews_by_brand(db, brand)
            # Fetch display name from brand_source_urls
            brand_source = get_brand_source_url(db, brand)
            display_name = brand_source['brand_display_name'] if brand_source and 'brand_display_name' in brand_source else brand
            brand_counts.append({"brand": brand, "display_name": display_name, "review_count": len(reviews)})
    return jsonify({'brands': brand_counts})

@app.route('/api/brands', methods=['POST'])
def create_brand():
    data = request.get_json()
    trustpilot_url = data.get('trustpilot_url')
    if not trustpilot_url:
        return jsonify({'error': 'trustpilot_url is required'}), 400

    # Validate Trustpilot URL format
    url_pattern = r"^https?://([a-zA-Z0-9-]+\.)?trustpilot\.com/review/[\w\-\.]+"
    if not re.match(url_pattern, trustpilot_url):
        return jsonify({'error': 'Invalid Trustpilot URL format'}), 400
    try:
        resp = requests.get(trustpilot_url, timeout=10)
        if resp.status_code != 200 or 'Trustpilot' not in resp.text:
            return jsonify({'error': 'Trustpilot page not found or not accessible'}), 400
    except Exception as e:
        return jsonify({'error': f'Error reaching Trustpilot: {str(e)}'}), 400

    # Extract the official brand name from the Trustpilot page
    scraper = TrustpilotScraper(headless=True)
    extracted_brand_name = scraper.extract_brand_name(trustpilot_url)
    if not extracted_brand_name:
        return jsonify({'error': 'Could not extract brand name from Trustpilot page.'}), 400
    canon_id = canonical_brand_id(extracted_brand_name)
    with get_db_session() as db:
        set_brand_source_url(db, canon_id, trustpilot_url, extracted_brand_name)

    # Fetch logo synchronously and get logo URL
    logo_success = fetch_trustpilot_logo(trustpilot_url, canon_id, extracted_brand_name, output_dir="../frontend/public/logos")
    dash_display_name = extracted_brand_name.lower().replace(' ', '-')
    logo_url = f"/logos/{canon_id}-logo.jpg" if logo_success else "/placeholder-logo.png"

    # Start review scraping for pages 1-50 in the background (single browser session)
    def run_scraper():
        try:
            scraper.scrape_brand_reviews(extracted_brand_name, max_pages=50, start_page=1)
        except Exception as e:
            logger.error(f"Error scraping new brand {canon_id} (pages 1-50): {e}", exc_info=True)
    threading.Thread(target=run_scraper, daemon=True).start()

    return jsonify({'success': True, 'brand': extracted_brand_name, 'trustpilot_url': trustpilot_url, 'logo_url': logo_url})

@app.route('/api/brands/<brand>/reviews', methods=['GET'])
def get_brand_reviews(brand):
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    rating_filter = request.args.get('rating')
    sentiment_filter = request.args.get('sentiment')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    with get_db_session() as db:
        reviews = get_reviews_by_brand(db, brand)
        
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
            if date_from and review['date'] < date_from:
                continue
            if date_to and review['date'] > date_to:
                continue
            
            filtered_reviews.append(review)
        
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
                'categories': r['categories']
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

@app.route('/api/brands/<brand>/analytics', methods=['GET'])
def get_brand_analytics(brand):
    with get_db_session() as db:
        reviews = get_reviews_by_brand(db, brand)
        
        # Total reviews
        total_reviews = len(reviews)
        
        # Average rating
        ratings = [r['rating'] for r in reviews if r['rating'] is not None]
        avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0
        
        # Sentiment breakdown
        positive_count = len([r for r in reviews if r['sentiment_category'] == 'positive'])
        negative_count = len([r for r in reviews if r['sentiment_category'] == 'negative'])
        neutral_count = len([r for r in reviews if r['sentiment_category'] == 'neutral'])
        
        total_analyzed = positive_count + negative_count + neutral_count
        
        # Average sentiment score
        sentiment_scores = [r['sentiment_score'] for r in reviews if r['sentiment_score'] is not None]
        avg_sentiment = round(sum(sentiment_scores) / len(sentiment_scores), 3) if sentiment_scores else 0
        
        # Monthly sentiment breakdown
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
            if review['date']:
                try:
                    # Extract month from date (assuming format YYYY-MM-DD)
                    month = review['date'][:7]  # Get YYYY-MM part
                    sentiment = review['sentiment_category']
                    if sentiment in ['positive', 'negative', 'neutral']:
                        monthly_data[month][sentiment] += 1
                        monthly_data[month]['total'] += 1
                except:
                    continue

        # Convert to list format expected by frontend
        monthly_trends = []
        for month in sorted(monthly_data.keys()):
            data = monthly_data[month]
            monthly_trends.append({
                'month': month,
                'positive': data['positive'],
                'negative': data['negative'],
                'neutral': data['neutral'],
                'total': data['total']
            })

        # Top keywords
        all_keywords = []
        for review in reviews:
            if review['categories']:
                try:
                    keywords = json.loads(review['categories'])
                    all_keywords.extend(keywords)
                except:
                    continue
        
        keyword_counts = Counter(all_keywords)
        top_keywords = [{'keyword': word, 'count': count} for word, count in keyword_counts.most_common(10)]
        
        # Add last_updated: date of most recent review for this brand
        dates = [r['date'] for r in reviews if r['date']]
        last_updated = max(dates) if dates else None

        # Sizing & Fit Mentions
        sizing_fit_keywords = [
            "sizing", "size", "fit", "fits", "fitted", "fitting", "large", "small", "tight", "loose", "narrow", "wide", "length", "width", "comfort", "comfortable", "true to size", "runs small", "runs large", "size up", "size down", "too big", "too small", "return", "refund", "exchange"
        ]
        sizing_fit_reviews = 0
        for review in reviews:
            review_text = review['review'].lower() if review['review'] else ''
            if any(keyword in review_text for keyword in sizing_fit_keywords):
                sizing_fit_reviews += 1

        return jsonify({
            'brand': brand,
            'total_reviews': total_reviews,
            'average_rating': avg_rating,
            'sentiment_breakdown': {
                'positive': positive_count,
                'negative': negative_count,
                'neutral': neutral_count,
                'total_analyzed': total_analyzed
            },
            'average_sentiment_score': avg_sentiment,
            'monthly_trends': monthly_trends,
            'top_keywords': top_keywords,
            'last_updated': last_updated,
            'sizing_fit_mentions': sizing_fit_reviews
        })

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "message": "API is running"})

@app.route('/api/scrape', methods=['POST'])
def scrape_brand():
    data = request.get_json()
    brand_name = data.get('brand_name')
    source_url = data.get('source_url')
    
    if not brand_name or not source_url:
        return jsonify({"error": "brand_name and source_url are required"}), 400
    
    try:
        scraper = TrustpilotScraper()
        scraper.scrape_brand_reviews(brand_name)
        return jsonify({
            "message": f"Scraping complete for {brand_name}."
        })
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/brand-source-url', methods=['GET'])
def get_brand_source_url_api():
    brand_id = request.args.get('brand_id')
    if not brand_id:
        return jsonify({'error': 'brand_id is required'}), 400
    with get_db_session() as db:
        brand_source = get_brand_source_url(db, brand_id)
        if not brand_source:
            return jsonify({'error': 'Brand not found'}), 404
        return jsonify({
            'brand_id': brand_source['brand_id'],
            'sourceUrl': brand_source['source_url'],
            'display_name': brand_source.get('brand_display_name', brand_source['brand_id'])
        })

@app.route('/api/brand-source-url', methods=['POST'])
def set_brand_source_url_api():
    data = request.get_json()
    brand_id = data.get('brand_id')
    source_url = data.get('source_url')
    
    if not brand_id or not source_url:
        return jsonify({"error": "brand_id and source_url are required"}), 400
    
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
        logger.info('Scraper finished. new_reviews_count:', new_reviews_count)
        if new_reviews_count is None:
            new_reviews_count = 0
        logger.info('Browser closed.')
        with get_db_session() as db:
            logger.info('Getting total_reviews...')
            total_reviews = db.execute(
                text('SELECT COUNT(*) FROM reviews WHERE brand_name = :brand_name'),
                {'brand_name': brand}
            ).fetchone()[0]
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
        canon_id = canonical_brand_id(brand_id)
        logger.info(f"[DELETE] Received delete request for brand_id: {brand_id} (canonical: {canon_id})")
        with get_db_session() as db:
            all_brands = get_brands(db)
            canon_brands = [canonical_brand_id(b) for b in all_brands]
            logger.info(f"[DELETE] All brand IDs in DB: {all_brands}")
            logger.info(f"[DELETE] Canonical brand IDs in DB: {canon_brands}")
        # Delete from DB using canonical ID
        delete_brand_and_reviews(canon_id)
        # Remove logo files from public/logos
        logo_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../frontend/public/logos')
        removed_files = []
        all_files = os.listdir(logo_dir)
        logger.info(f"[DELETE] Logo files in directory: {all_files}")
        for fname in all_files:
            fname_noext = fname.split('.')[0]
            fname_canon = canonical_brand_id(fname_noext)
            if canon_id in fname_canon:
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False) 