from flask import Flask, jsonify, request, send_from_directory, make_response
from flask_cors import CORS
from database import get_db_session, Review, get_brand_source_url, set_brand_source_url, get_reviews_by_brand, get_all_reviews, get_brands, add_review, delete_brand_and_reviews, get_brand_keywords, set_brand_keywords, get_global_keywords, set_global_keywords
from sentiment_analyzer import SentimentAnalyzer
from datetime import datetime, timedelta
import json
from collections import defaultdict, Counter
from trustpilot_scraper import TrustpilotScraper, fetch_trustpilot_logo
import re, requests
import threading
import os
import logging
from database import DATABASE_CONFIG

# Ensure DB tables exist at startup
from database import init_db
init_db()

app = Flask(__name__)
app.url_map.strict_slashes = False
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "OPTIONS"]}})

# Initialize sentiment analyzer
sentiment_analyzer = SentimentAnalyzer()

# Global dictionary to track running scrapers and their cancel events
running_scrapers = {}  # brand_name -> (thread, cancel_event)

@app.after_request
def after_request(response):
    # Allow CORS for all domains on all routes (for dev)
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "message": "Welcome to the Trustpilot Scraper API. See /api/brands or /api/health for available endpoints."
    })

@app.route('/api/brands', methods=['GET'])
def get_brands_api():
    with get_db_session() as db:
        brands = get_brands(db)
        brand_cards = []
        for brand in brands:
            reviews = get_reviews_by_brand(db, brand)
            logo_url = f"/logos/{brand}-logo.jpg"
            last_updated = max([r['date'] for r in reviews if r['date']], default=None)
            brand_cards.append({
                "brand_name": brand,
                "review_count": len(reviews),
                "logo": logo_url,
                "lastUpdated": last_updated
            })
    return jsonify({'brands': brand_cards})

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
    with get_db_session() as db:
        set_brand_source_url(db, extracted_brand_name, trustpilot_url)
    # Fetch logo synchronously and get logo URL
    logo_success = fetch_trustpilot_logo(trustpilot_url, extracted_brand_name)
    # Logo is now stored in database, so we don't need a file path
    logo_url = "/placeholder-logo.png"  # Frontend will fetch from database
    # Start review scraping for pages 1-5 in the background (single browser session)
    cancel_event = threading.Event()
    def run_scraper():
        try:
            scraper.scrape_brand_reviews(extracted_brand_name, max_pages=50, start_page=1, cancel_event=cancel_event)
        except Exception as e:
            print(f"Error scraping new brand {extracted_brand_name} (pages 1-5): {e}")
        finally:
            running_scrapers.pop(extracted_brand_name, None)  # Clean up when done
    thread = threading.Thread(target=run_scraper, daemon=True)
    running_scrapers[extracted_brand_name] = (thread, cancel_event)
    thread.start()
    return jsonify({'success': True, 'brand_name': extracted_brand_name, 'trustpilot_url': trustpilot_url, 'logo_url': logo_url})

@app.route('/api/brands/<brand_name>/reviews', methods=['GET'])
def get_brand_reviews(brand_name):
    raise Exception("TESTING IF THIS CODE IS RUN - REMOVE THIS LINE AFTER TESTING")
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    rating_filter = request.args.get('rating')
    sentiment_filter = request.args.get('sentiment')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category_filter = request.args.get('category')

    # Use print for guaranteed output
    def log_info(msg):
        print(f"[INFO] {msg}")
    def log_warning(msg):
        print(f"[WARN] {msg}")

    log_info(f"Incoming filters: page={page}, per_page={per_page}, rating={rating_filter}, sentiment={sentiment_filter}, date_from={date_from}, date_to={date_to}, category={category_filter}")

    with get_db_session() as db:
        reviews = get_reviews_by_brand(db, brand_name)
        print(f"[DEBUG] Total reviews fetched for brand '{brand_name}': {len(reviews)}")

        # Log the SQL query for global keywords
        if category_filter and category_filter != 'all':
            sql = f"SELECT keywords FROM global_keywords WHERE category = ?"
            log_info(f"SQL: {sql} | params: ({category_filter},)")
            row = db.execute(sql, (category_filter,)).fetchone()
            if row:
                log_info(f"Keywords found for category '{category_filter}': {row[0]}")
            else:
                log_warning(f"No keywords found for category '{category_filter}' in DB.")

        # Load global keywords for category filtering
        global_keywords = get_global_keywords(db)
        category_keywords = []
        skip_category_filter = False
        if category_filter and category_filter != 'all':
            category_keywords = global_keywords.get(category_filter, [])
            if not category_keywords:
                log_warning(f"No keywords found for category '{category_filter}'. Skipping category filter.")
                skip_category_filter = True
            else:
                log_info(f"Category '{category_filter}' keywords: {category_keywords}")

        # Apply filters
        filtered_reviews = []
        log_info(f"First 5 reviews to check for keyword matches:")
        for idx, review in enumerate(reviews[:5]):
            review_text = (review['review'] or '').lower()
            if category_filter and category_filter != 'all' and not skip_category_filter:
                matches = [kw for kw in category_keywords if kw.lower() in review_text]
                log_info(f"Review {idx+1}: {review_text[:100]}... | Matches: {matches}")
            else:
                log_info(f"Review {idx+1}: {review_text[:100]}... | No category filter applied.")

        for review in reviews:
            # Rating filter
            if rating_filter and review['rating'] != int(rating_filter):
                continue
            # Sentiment filter
            if sentiment_filter and review['sentiment_category'] != sentiment_filter:
                continue
            # Date filters (robust to missing/malformed dates)
            review_date = review.get('date')
            if date_from:
                try:
                    if not review_date or review_date < date_from:
                        continue
                except Exception as e:
                    log_warning(f"Skipping review with malformed date: {review_date} (error: {e})")
                    continue
            if date_to:
                try:
                    if not review_date or review_date > date_to:
                        continue
                except Exception as e:
                    log_warning(f"Skipping review with malformed date: {review_date} (error: {e})")
                    continue
            # Robust Category filter (by categories field)
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
                # Normalize for whitespace/case
                if not review_categories or not any(category_filter.strip().lower() == str(c).strip().lower() for c in review_categories):
                    continue
            filtered_reviews.append(review)

        print(f"[DEBUG] Filtered reviews count: {len(filtered_reviews)} (after all filters)")
        if filtered_reviews:
            print(f"[DEBUG] First 3 filtered review categories: {[r.get('categories') for r in filtered_reviews[:3]]}")
        else:
            log_info("No reviews matched the filters.")

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
        'brand_name': brand_name,
        'total_reviews': total,
        'page': page,
        'per_page': per_page,
        'reviews': review_list
    })

@app.route('/api/brands/<brand_name>/analytics', methods=['GET'])
def get_brand_analytics(brand_name):
    # Accept filters from query params
    rating_filter = request.args.get('rating')
    sentiment_filter = request.args.get('sentiment')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category_filter = request.args.get('category')

    with get_db_session() as db:
        reviews = get_reviews_by_brand(db, brand_name)

        # Load global keywords for category filtering
        global_keywords = get_global_keywords(db)
        category_keywords = []
        skip_category_filter = False
        if category_filter and category_filter != 'all':
            category_keywords = global_keywords.get(category_filter, [])
            if not category_keywords:
                skip_category_filter = True

        # Apply filters (same as in reviews endpoint)
        filtered_reviews = []
        for review in reviews:
            if rating_filter and review['rating'] != int(rating_filter):
                continue
            if sentiment_filter and review['sentiment_category'] != sentiment_filter:
                continue
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
            if category_filter and category_filter != 'all' and not skip_category_filter:
                review_text = (review['review'] or '').lower()
                matches = [kw for kw in category_keywords if kw.lower() in review_text]
                if not matches:
                    continue
            filtered_reviews.append(review)

        # Now compute analytics on filtered_reviews
        total_reviews = len(filtered_reviews)
        ratings = [r['rating'] for r in filtered_reviews if r['rating'] is not None]
        avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0
        positive_count = len([r for r in filtered_reviews if r['sentiment_category'] == 'positive'])
        negative_count = len([r for r in filtered_reviews if r['sentiment_category'] == 'negative'])
        neutral_count = len([r for r in filtered_reviews if r['sentiment_category'] == 'neutral'])
        total_analyzed = positive_count + negative_count + neutral_count
        sentiment_scores = [r['sentiment_score'] for r in filtered_reviews if r['sentiment_score'] is not None]
        avg_sentiment = round(sum(sentiment_scores) / len(sentiment_scores), 3) if sentiment_scores else 0

        # Monthly sentiment breakdown (filtered)
        period = request.args.get('period', 'all')
        if period == 'all':
            date_filter = False
        else:
            date_filter = True
        if date_filter:
            twelve_months_ago = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
            filtered_reviews = [r for r in filtered_reviews if r['date'] and r['date'] >= twelve_months_ago]
        monthly_data = defaultdict(lambda: {'positive': 0, 'negative': 0, 'neutral': 0, 'total': 0})
        for review in filtered_reviews:
            if review['date']:
                try:
                    month = review['date'][:7]
                    sentiment = review['sentiment_category']
                    if sentiment in ['positive', 'negative', 'neutral']:
                        monthly_data[month][sentiment] += 1
                        monthly_data[month]['total'] += 1
                except:
                    continue
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
        for review in filtered_reviews:
            if review['categories']:
                try:
                    keywords = json.loads(review['categories'])
                    all_keywords.extend(keywords)
                except:
                    continue
        keyword_counts = Counter(all_keywords)
        top_keywords = [{'keyword': word, 'count': count} for word, count in keyword_counts.most_common(10)]
        # Add last_updated: date of most recent review for this brand
        dates = [r['date'] for r in filtered_reviews if r['date']]
        last_updated = max(dates) if dates else None
        # Sizing & Fit Mentions
        sizing_fit_keywords = [
            "sizing", "size", "fit", "fits", "fitted", "fitting", "large", "small", "tight", "loose", "narrow", "wide", "length", "width", "comfort", "comfortable", "true to size", "runs small", "runs large", "size up", "size down", "too big", "too small", "return", "refund", "exchange"
        ]
        sizing_fit_reviews = 0
        for review in filtered_reviews:
            review_text = review['review'].lower() if review['review'] else ''
            if any(keyword in review_text for keyword in sizing_fit_keywords):
                sizing_fit_reviews += 1
        return jsonify({
            'brand_name': brand_name,
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
    brand_name = request.args.get('brand_name')
    if not brand_name:
        return jsonify({'error': 'brand_name is required'}), 400
    with get_db_session() as db:
        brand_source = get_brand_source_url(db, brand_name)
        if not brand_source:
            return jsonify({'error': 'Brand not found'}), 404
        return jsonify({
            'brand_name': brand_source['brand_name'],
            'sourceUrl': brand_source['source_url'],
            'display_name': brand_source.get('brand_display_name', brand_source['brand_name'])
        })

@app.route('/api/brand-source-url', methods=['POST'])
def set_brand_source_url_api():
    data = request.get_json()
    brand_name = data.get('brand_name')
    source_url = data.get('source_url')
    
    if not brand_name or not source_url:
        return jsonify({"error": "brand_name and source_url are required"}), 400
    
    with get_db_session() as db:
        result = set_brand_source_url(db, brand_name, source_url)
        return jsonify(result)

@app.route('/api/scrape_brand', methods=['POST'])
def scrape_brand_api():
    print('--- /api/scrape_brand called ---')
    try:
        data = request.get_json()
        print('Request data:', data)
        brand_name = data.get('brand_name')
        if not brand_name:
            print('Missing brand_name in request')
            return jsonify({'error': 'Missing brand_name'}), 400
        from database import init_db, get_db_session, Review, DATABASE_CONFIG
        db_path = DATABASE_CONFIG['url']
        print(f"[DEBUG] Database file path: {db_path}")
        with get_db_session() as db:
            review_count_before = db.query(Review).filter(Review.brand_name == brand_name).count()
            print(f"[DEBUG] Before scraping: {review_count_before} reviews for brand '{brand_name}'")
        print('Initializing DB...')
        init_db()
        print('Starting scraper...')
        scraper = TrustpilotScraper(headless=True)
        new_reviews_count = scraper.scrape_brand_reviews(brand_name, max_pages=3)
        print('Scraper finished. new_reviews_count:', new_reviews_count)
        if new_reviews_count is None:
            new_reviews_count = 0
        print('Browser closed.')
        with get_db_session() as db:
            review_count_after = db.query(Review).filter(Review.brand_name == brand_name).count()
            print(f"[DEBUG] After scraping: {review_count_after} reviews for brand '{brand_name}'")
        return jsonify({
            'success': True,
            'brand_name': brand_name,
            'newReviews': new_reviews_count,
            'totalReviews': review_count_after
        })
    except Exception as e:
        import traceback
        print('Exception in /api/scrape_brand:')
        traceback.print_exc()
        print(f"Error in /api/scrape_brand: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/brands/<brand_name>', methods=['DELETE'])
def delete_brand(brand_name):
    """Delete a brand and all its reviews"""
    try:
        from database import get_db_session, get_brands, delete_brand_and_reviews, Review
        db_path = DATABASE_CONFIG['url']
        print(f"[DEBUG] Database file path: {db_path}")
        with get_db_session() as db:
            review_count_before = db.query(Review).filter(Review.brand_name == brand_name).count()
            print(f"[DEBUG] Before delete: {review_count_before} reviews for brand '{brand_name}'")
        delete_brand_and_reviews(brand_name)
        # Commit is handled in delete_brand_and_reviews, but ensure it's done before scraping
        with get_db_session() as db:
            review_count_after = db.query(Review).filter(Review.brand_name == brand_name).count()
            print(f"[DEBUG] After delete: {review_count_after} reviews for brand '{brand_name}'")
        return jsonify({'success': True, 'message': f'Brand {brand_name} and all its reviews deleted successfully'})
    except Exception as e:
        return jsonify({'error': f'Failed to delete brand: {str(e)}'}), 500

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

@app.route('/api/brands/<brand_name>/keywords', methods=['GET'])
def get_brand_keywords_api(brand_name):
    with get_db_session() as db:
        keywords = get_brand_keywords(db, brand_name)
    return jsonify({'brand_name': brand_name, 'keywords': keywords})

@app.route('/api/brands/<brand_name>/keywords', methods=['POST'])
def set_brand_keywords_api(brand_name):
    data = request.get_json()
    category = data.get('category')
    keywords = data.get('keywords')
    if not category or not isinstance(keywords, list):
        return jsonify({'error': 'category and keywords (list) required'}), 400
    with get_db_session() as db:
        set_brand_keywords(db, brand_name, category, keywords)
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

@app.route('/api/reprocess-reviews', methods=['POST'])
def reprocess_reviews():
    """Reprocess all existing reviews with updated keywords"""
    try:
        import subprocess
        import sys
        import os
        
        # Get the path to the process_existing_reviews.py script
        script_path = os.path.join(os.path.dirname(__file__), '../services/process_existing_reviews.py')
        
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False) #   T r i g g e r   r e d e p l o y 