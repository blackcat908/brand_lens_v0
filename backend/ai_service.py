import os
import logging
from typing import List, Dict, Any
from openai import OpenAI
from config import AI_CONFIG
import numpy as np

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        # Initialize OpenAI client
        api_key = AI_CONFIG.get('openai_api_key')
        if not api_key:
            logger.warning("[AI-SERVICE] No OpenAI API key found. Set OPENAI_API_KEY environment variable.")
            self.client = None
            self.api_key_status = "missing"
        elif api_key.startswith('sk-proj-') and len(api_key) < 100:
            logger.warning("[AI-SERVICE] OpenAI API key appears to be truncated or invalid.")
            self.client = None
            self.api_key_status = "invalid"
        else:
            try:
                self.client = OpenAI(api_key=api_key)
                logger.info("[AI-SERVICE] OpenAI client initialized successfully")
                self.api_key_status = "valid"
            except Exception as e:
                logger.error(f"[AI-SERVICE] Failed to initialize OpenAI client: {e}")
                self.client = None
                self.api_key_status = "error"

    def generate_report(self, brand_name: str, prompt: str, reviews: List[Dict[str, Any]]) -> str:
        """
        Generate an AI report based on the provided reviews and prompt.
        
        Args:
            brand_name: Name of the brand
            prompt: User's custom prompt for the analysis
            reviews: List of review dictionaries
            
        Returns:
            Generated report content as string
        """
        if not self.client:
            return self._get_fallback_report(brand_name, prompt, reviews)
        
        try:
            # Prepare the system prompt
            system_prompt = """You are an expert business analyst specializing in customer review analysis. 
            You analyze customer feedback to provide actionable insights and recommendations for businesses.
            
            Your reports should be:
            - Professional and well-structured
            - Data-driven with specific examples
            - Actionable with clear recommendations
            - Focused on the user's specific prompt/question
            - Comprehensive analysis of ALL provided data (no matter how large the dataset)
            
            For large datasets (1000+ reviews), focus on:
            - Statistical trends and patterns
            - Representative examples from the data
            - Comprehensive insights based on the full dataset
            - Actionable recommendations based on the complete picture
            
            Format your response as a markdown document with clear headings and sections."""
            
            # Prepare the user prompt with context
            user_prompt = f"""
            Brand: {brand_name}
            Analysis Request: {prompt}
            
            Please analyze the following customer reviews and provide insights based on the user's request.
            
            Review Data:
            """
            
            # Add review summaries - NO LIMITS! Process ALL reviews
            # For very large datasets, we'll provide a summary approach
            if len(reviews) > 1000:
                # For 1000+ reviews, provide statistical summary + sample reviews
                user_prompt += f"""
            LARGE DATASET: {len(reviews)} reviews found
            
            Statistical Summary:
            - Average Rating: {sum(r.get('rating', 0) for r in reviews) / len(reviews):.2f}/5
            - Rating Distribution: {dict(zip(*np.unique([r.get('rating', 0) for r in reviews], return_counts=True)))}
            - Sentiment Distribution: {dict(zip(*np.unique([r.get('sentiment_category', 'unknown') for r in reviews], return_counts=True)))}
            
            Sample Reviews (first 50):
            """
                # Add first 50 reviews as samples
                for i, review in enumerate(reviews[:50]):
                    user_prompt += f"""
            Review {i+1}:
            - Customer: {review.get('customer_name', 'Anonymous')}
            - Rating: {review.get('rating', 'N/A')}/5
            - Date: {review.get('date', 'N/A')}
            - Sentiment: {review.get('sentiment_category', 'N/A')}
            - Review: {review.get('review', 'No review text')[:300]}...
            """
            else:
                # For smaller datasets, include all reviews
                for i, review in enumerate(reviews):
                    user_prompt += f"""
            Review {i+1}:
            - Customer: {review.get('customer_name', 'Anonymous')}
            - Rating: {review.get('rating', 'N/A')}/5
            - Date: {review.get('date', 'N/A')}
            - Sentiment: {review.get('sentiment_category', 'N/A')}
            - Review: {review.get('review', 'No review text')[:400]}...
            """
            
            user_prompt += f"""
            
            Total Reviews Analyzed: {len(reviews)}
            
            Please provide a comprehensive analysis addressing the user's request: "{prompt}"
            """
            
            # Make the API call
            logger.info(f"[AI-SERVICE] Generating report for {brand_name} with {len(reviews)} reviews")
            
            response = self.client.chat.completions.create(
                model=AI_CONFIG.get('model', 'gpt-3.5-turbo'),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=AI_CONFIG.get('max_tokens', 2000),
                temperature=AI_CONFIG.get('temperature', 0.7)
            )
            
            report_content = response.choices[0].message.content
            logger.info(f"[AI-SERVICE] Report generated successfully for {brand_name}")
            
            return report_content
            
        except Exception as e:
            logger.error(f"[AI-SERVICE] Error generating report: {e}")
            return self._get_fallback_report(brand_name, prompt, reviews)
    
    def _get_fallback_report(self, brand_name: str, prompt: str, reviews: List[Dict[str, Any]]) -> str:
        """
        Generate a fallback report when AI service is not available.
        """
        logger.info(f"[AI-SERVICE] Using fallback report for {brand_name}")
        
        # Calculate basic statistics
        total_reviews = len(reviews)
        if total_reviews == 0:
            return f"# AI Report for {brand_name}\n\nNo reviews found matching the current filters."
        
        avg_rating = sum(r.get('rating', 0) for r in reviews) / total_reviews
        positive_count = len([r for r in reviews if r.get('sentiment_category') == 'positive'])
        negative_count = len([r for r in reviews if r.get('sentiment_category') == 'negative'])
        neutral_count = len([r for r in reviews if r.get('sentiment_category') == 'neutral'])
        
        # Get sample reviews for each sentiment
        positive_reviews = [r for r in reviews if r.get('sentiment_category') == 'positive'][:3]
        negative_reviews = [r for r in reviews if r.get('sentiment_category') == 'negative'][:3]
        
        report = f"""# AI Report for {brand_name}

## Analysis Summary
**User Request:** {prompt}

Based on {total_reviews} customer reviews, here's the analysis:

## Key Metrics
- **Total Reviews Analyzed:** {total_reviews}
- **Average Rating:** {avg_rating:.1f}/5
- **Sentiment Distribution:**
  - Positive: {positive_count} ({positive_count/total_reviews*100:.1f}%)
  - Negative: {negative_count} ({negative_count/total_reviews*100:.1f}%)
  - Neutral: {neutral_count} ({neutral_count/total_reviews*100:.1f}%)

## Sample Positive Feedback
"""
        
        for i, review in enumerate(positive_reviews, 1):
            report += f"""
**Review {i}** (Rating: {review.get('rating', 'N/A')}/5)
> "{review.get('review', 'No review text')[:200]}..."
"""
        
        report += "\n## Sample Negative Feedback\n"
        
        for i, review in enumerate(negative_reviews, 1):
            report += f"""
**Review {i}** (Rating: {review.get('rating', 'N/A')}/5)
> "{review.get('review', 'No review text')[:200]}..."
"""
        
        # Add API key status information
        api_key_status = getattr(self, 'api_key_status', 'unknown')
        
        report += f"""
## Recommendations
Based on the analysis of {total_reviews} reviews:

1. **Focus on Positive Aspects:** Leverage the positive feedback to understand what customers value most
2. **Address Negative Concerns:** Pay attention to common negative themes and work on improvements
3. **Monitor Trends:** Track sentiment changes over time to measure improvement efforts

## Note
*This is a fallback report generated without AI analysis. For enhanced insights with detailed analysis and specific recommendations, please fix the OpenAI API key configuration.*

**API Key Status:** {api_key_status}

**To enable AI-powered reports:**
1. **Get a valid API key:** Visit [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. **Set environment variable:** `OPENAI_API_KEY=your-actual-api-key`
3. **Restart the application**

**Common Issues:**
- API key is missing or empty
- API key is truncated or corrupted  
- API key has expired or been revoked
- Insufficient OpenAI credits

---
*Fallback report generated automatically*
"""
        
        return report

    def generate_report_from_data(self, brand_name: str, prompt: str, reviews_data: List[Dict[str, Any]]) -> str:
        """Generate report from pre-filtered review data (new clean approach)."""
        if not self.client:
            logger.warning("[AI-SERVICE] OpenAI client not initialized. Returning fallback report.")
            return self._get_fallback_report(brand_name, prompt, reviews_data)

        try:
            # Format reviews as CSV string
            csv_data = self._format_reviews_as_csv(reviews_data)
            
            # Prepare the system prompt
            system_prompt = """You are an expert business analyst specializing in customer review analysis. 
            You analyze customer feedback to provide actionable insights and recommendations for businesses.
            
            You will receive customer review data in CSV format and a specific analysis request.
            Your reports should be:
            - Professional and well-structured
            - Data-driven with specific examples
            - Actionable with clear recommendations
            - Focused on the user's specific request
            - Based on the exact data provided
            
            Format your response as a markdown document with clear headings and sections."""
            
            # Prepare the user prompt with CSV data
            user_prompt = f"""
            Brand: {brand_name}
            Analysis Request: {prompt}
            
            Customer Review Data (CSV format):
            {csv_data}
            
            Please analyze the above customer review data and generate a comprehensive report based on the user's specific request.
            Focus on the exact data provided and provide actionable insights.
            """
            
            logger.info(f"[AI-SERVICE] Generating report for {brand_name} with {len(reviews_data)} reviews")
            response = self.client.chat.completions.create(
                model=AI_CONFIG.get('model', 'gpt-3.5-turbo'),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=AI_CONFIG.get('max_tokens', 4000),
                temperature=AI_CONFIG.get('temperature', 0.7)
            )
            
            report_content = response.choices[0].message.content
            logger.info(f"[AI-SERVICE] Report generated successfully for {brand_name}")
            return report_content
            
        except Exception as e:
            logger.error(f"[AI-SERVICE] Error calling OpenAI API: {e}")
            return self._get_fallback_report(brand_name, prompt, reviews_data)

    def _format_reviews_as_csv(self, reviews_data: List[Dict[str, Any]]) -> str:
        """Format review data as CSV string for AI consumption."""
        if not reviews_data:
            return "No review data available"
        
        # Define CSV headers
        headers = ["customer_name", "rating", "date", "review_text", "categories", "sentiment_category"]
        
        # Create CSV content
        csv_lines = [",".join(headers)]
        
        for review in reviews_data:
            # Extract and clean data
            customer_name = str(review.get('customer_name', 'Anonymous')).replace('"', '""')
            rating = str(review.get('rating', ''))
            date = str(review.get('date', ''))
            
            # Truncate review text to keep costs low (first 300 characters)
            review_text = str(review.get('review', '')).replace('"', '""')
            if len(review_text) > 300:
                review_text = review_text[:300] + "..."
            
            # Format categories
            categories = review.get('categories', [])
            if isinstance(categories, list):
                categories_str = "; ".join(str(c) for c in categories)
            else:
                categories_str = str(categories)
            categories_str = categories_str.replace('"', '""')
            
            sentiment = str(review.get('sentiment_category', ''))
            
            # Create CSV row
            row = [
                f'"{customer_name}"',
                rating,
                date,
                f'"{review_text}"',
                f'"{categories_str}"',
                sentiment
            ]
            csv_lines.append(",".join(row))
        
        return "\n".join(csv_lines)

# Global instance - lazy loaded to avoid startup crashes
ai_service = None

def get_ai_service():
    """Get or create the AI service instance"""
    global ai_service
    if ai_service is None:
        ai_service = AIService()
    return ai_service
