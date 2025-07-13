// Test script to verify sentiment scores are being returned correctly

async function testSentimentScores() {
    const brands = ['bbxbrand', 'becauseofalice', 'murci', 'oddmuse', 'wanderdoll'];
    
    console.log('Testing sentiment scores for all brands...\n');
    
    for (const brand of brands) {
        try {
            const response = await fetch(`http://localhost:5000/api/brands/${brand}/analytics`);
            const data = await response.json();
            
            console.log(`=== ${brand.toUpperCase()} ===`);
            console.log(`Total Reviews: ${data.total_reviews}`);
            console.log(`Average Rating: ${data.average_rating?.toFixed(2) || 'N/A'}`);
            console.log(`Sentiment Score: ${data.sentiment_score?.toFixed(3) || 'N/A'}`);
            console.log(`Sentiment Category: ${data.sentiment_category || 'N/A'}`);
            console.log(`Positive: ${data.sentiment_distribution?.positive || 0}`);
            console.log(`Neutral: ${data.sentiment_distribution?.neutral || 0}`);
            console.log(`Negative: ${data.sentiment_distribution?.negative || 0}`);
            console.log('');
            
        } catch (error) {
            console.error(`Error testing ${brand}:`, error.message);
        }
    }
}

testSentimentScores(); 