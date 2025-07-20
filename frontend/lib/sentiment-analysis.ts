// Enhanced sentiment analysis function
export interface SentimentResult {
  score: number // -1 to 1, where -1 is very negative, 1 is very positive
  magnitude: number // 0 to 1, intensity of sentiment
  classification: "positive" | "negative" | "neutral"
}

export function analyzeSentiment(text: string): SentimentResult {
  // Enhanced word lists for better accuracy
  const positiveWords = [
    "great",
    "excellent",
    "perfect",
    "amazing",
    "love",
    "good",
    "comfortable",
    "happy",
    "satisfied",
    "recommend",
    "quality",
    "fantastic",
    "wonderful",
    "beautiful",
    "stunning",
    "gorgeous",
    "brilliant",
    "outstanding",
    "superb",
    "incredible",
    "awesome",
    "lovely",
    "nice",
    "pleased",
    "delighted",
    "impressed",
    "helpful",
    "quick",
    "fast",
    "smooth",
    "easy",
    "professional",
    "friendly",
    "polite",
    "efficient",
    "responsive",
    "reliable",
  ]

  const negativeWords = [
    "bad",
    "terrible",
    "awful",
    "hate",
    "disappointed",
    "poor",
    "uncomfortable",
    "wrong",
    "small",
    "large",
    "tight",
    "loose",
    "return",
    "refund",
    "problem",
    "issue",
    "horrible",
    "disgusting",
    "appalling",
    "shocking",
    "ridiculous",
    "useless",
    "waste",
    "money",
    "time",
    "rude",
    "unprofessional",
    "slow",
    "delayed",
    "damaged",
    "broken",
    "faulty",
    "defective",
    "cheap",
    "overpriced",
    "expensive",
    "scam",
    "fraud",
    "illegal",
    "avoid",
  ]

  const words = text.toLowerCase().split(/\W+/)
  let positiveCount = 0
  let negativeCount = 0

  words.forEach((word) => {
    if (positiveWords.includes(word)) positiveCount++
    if (negativeWords.includes(word)) negativeCount++
  })

  const totalSentimentWords = positiveCount + negativeCount
  const score = totalSentimentWords > 0 ? (positiveCount - negativeCount) / totalSentimentWords : 0

  const magnitude = totalSentimentWords / words.length

  let classification: "positive" | "negative" | "neutral"
  if (score > 0.3) classification = "positive"
  else if (score <= -0.1) classification = "negative"
  else classification = "neutral"

  return {
    score: Math.max(-1, Math.min(1, score)),
    magnitude: Math.max(0, Math.min(1, magnitude)),
    classification,
  }
}

// Batch sentiment analysis for multiple reviews
export function batchAnalyzeSentiment(reviews: string[]): SentimentResult[] {
  return reviews.map((review) => analyzeSentiment(review))
}

// Calculate overall sentiment metrics for a brand
export function calculateBrandSentimentMetrics(reviews: Array<{ rating: number; review: string }>) {
  const sentiments = reviews.map((r) => analyzeSentiment(r.review))

  const avgSentimentScore = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length
  const positiveCount = sentiments.filter((s) => s.classification === "positive").length
  const negativeCount = sentiments.filter((s) => s.classification === "negative").length
  const neutralCount = sentiments.filter((s) => s.classification === "neutral").length

  return {
    avgSentimentScore: Number(avgSentimentScore.toFixed(2)),
    positiveCount,
    negativeCount,
    neutralCount,
    totalReviews: reviews.length,
    sentimentDistribution: {
      positive: Number(((positiveCount / reviews.length) * 100).toFixed(1)),
      negative: Number(((negativeCount / reviews.length) * 100).toFixed(1)),
      neutral: Number(((neutralCount / reviews.length) * 100).toFixed(1)),
    },
  }
}

// Enhanced sentiment score calculation
export function calculateSentimentScore(reviews: string[]): number {
  if (reviews.length === 0) return 0

  const sentiments = reviews.map((review) => analyzeSentiment(review))

  // Weight the sentiment by magnitude (confidence)
  let totalWeightedScore = 0
  let totalWeight = 0

  sentiments.forEach((sentiment) => {
    const weight = Math.max(0.1, sentiment.magnitude) // Minimum weight of 0.1
    totalWeightedScore += sentiment.score * weight
    totalWeight += weight
  })

  const avgScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0

  // Normalize to 0-1 scale for display
  return Number(((avgScore + 1) / 2).toFixed(2))
}
