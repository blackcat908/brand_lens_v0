#!/usr/bin/env python3
"""
Test script for AI integration
"""

import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_service import ai_service

def test_ai_service():
    """Test the AI service with sample data"""
    
    # Sample review data
    sample_reviews = [
        {
            'customer_name': 'John Doe',
            'rating': 5,
            'date': '2024-01-15',
            'sentiment_category': 'positive',
            'review': 'Amazing product! Perfect fit and great quality. Highly recommend!'
        },
        {
            'customer_name': 'Jane Smith',
            'rating': 2,
            'date': '2024-01-10',
            'sentiment_category': 'negative',
            'review': 'Product was too small and the quality was poor. Not worth the money.'
        },
        {
            'customer_name': 'Mike Johnson',
            'rating': 4,
            'date': '2024-01-08',
            'sentiment_category': 'positive',
            'review': 'Good product overall, but sizing could be better. Quality is decent.'
        }
    ]
    
    print("Testing AI Service...")
    print("=" * 50)
    
    # Test with sample data
    brand_name = "Test Brand"
    prompt = "Analyze the sizing and quality feedback from customers"
    
    print(f"Brand: {brand_name}")
    print(f"Prompt: {prompt}")
    print(f"Reviews: {len(sample_reviews)}")
    print()
    
    try:
        report = ai_service.generate_report(brand_name, prompt, sample_reviews)
        print("✅ AI Service Test Successful!")
        print()
        print("Generated Report:")
        print("-" * 30)
        print(report)
        
    except Exception as e:
        print(f"❌ AI Service Test Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_ai_service()
