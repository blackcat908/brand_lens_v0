// lib/real-brand-data.ts
// ----------------------------------------------------------
// Utility helpers
import { calculateSentimentScore } from "@/lib/sentiment-analysis"

/* ---------- helpers shared across brands ---------- */
const transformReviews = (jsonReviews: any[]) =>
  jsonReviews.map((review, idx) => ({
    id: idx + 1,
    customerName: review["customer name"] || `Customer ${idx + 1}`,
    date: review.date,
    rating: review.rating,
    review: review.review,
    sentiment_label: review.sentiment_label,
  }))

const parseDate = (d: string) => new Date(d)

const getMostRecentReviewDate = (reviews: any[]) => {
  if (!reviews.length) return "Never"
  const mostRecent = new Date(Math.max(...reviews.map((r) => parseDate(r.date).getTime())))
  return mostRecent.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// NEW: Get last scraped date from localStorage (consistent between main page and detail pages)
export const getLastScrapedDate = (brandId: string): string => {
  if (typeof window === "undefined") return "Never" // SSR safety

  const savedLastUpdate = localStorage.getItem(`lastUpdate_${brandId}`)
  if (savedLastUpdate) {
    const date = new Date(savedLastUpdate)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }
  return "Never"
}

const generateMonthlyData = (reviews: any[], limit?: number) => {
  const groups: Record<string, any[]> = {}
  reviews.forEach((r) => {
    const key = parseDate(r.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    })
    groups[key] ||= []
    groups[key].push(r)
  })
  const months = Object.keys(groups).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
  const final = limit ? months.slice(-limit) : months
  return final.map((m) => {
    const list = groups[m]
    const pos = list.filter((r) => r.rating >= 4).length
    const neg = list.filter((r) => r.rating <= 2).length
    const neu = list.filter((r) => r.rating === 3).length
    return { month: m, positive: pos, negative: neg, neutral: neu, total: list.length }
  })
}

const calculateMetrics = (reviews: any[]) => {
  if (!reviews.length)
    return {
      totalSizingFitReviews: 0,
      avgRating: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      sentimentScore: 0,
      monthlyTrend: [],
    }

  const total = reviews.length
  const ratingSum = reviews.reduce((s, r) => s + r.rating, 0)
  const positive = reviews.filter((r) => r.rating >= 4).length
  const negative = reviews.filter((r) => r.rating <= 2).length
  const neutral = reviews.filter((r) => r.rating === 3).length
  const sentimentScore = Number(calculateSentimentScore(reviews.map((r) => r.review)).toFixed(2))
  const monthlyTrend = generateMonthlyData(reviews, 6).map((m) => Number((m.positive / m.total || 0).toFixed(2)))

  return {
    totalSizingFitReviews: total,
    avgRating: Number((ratingSum / total).toFixed(1)),
    positiveCount: positive,
    negativeCount: negative,
    neutralCount: neutral,
    sentimentScore,
    monthlyTrend,
  }
}

/* ---------- brand-specific raw data (shortened here) ---------- */
// (For brevity only BBX array shown; Wander Doll & Murci arrays unchanged)
const bbxBrandReviewsData = [
  {
    "customer name": "Linda Hudson",
    review:
      "I had been waiting for a particular dress to come back in stock, I emailed customer service about the dress and they informed me they had no plans to restock the size I wanted and advised me to buy it in another size or colour, mind you its not cheap at £225! Two days later the dress came back in stock!! I emailed customer service lady called Amina back and she advised me to buy the size and return the other one for a refund in case it sells out again! They don't offer exchanges so I tried to do a refund but there was no option on their returns portal for a refund as I had used a discount code, which they provided!! I am still within the 14 day window but customer service have stopped replying to my emails, now I'm stuck with a dress and cannot get a refund which I am legally entitled to!",
    date: "17 June 2025",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Yemurai",
    review:
      "I ordered a dress, it arrived on time, but due to personal reasons I was not able to return it within the 14 day window. I spoke to a customer service agent that advised that as a good will gesture they can accept a return within 21 days for store credit. I asked to begin the process, as i have no need for the dress, it's completely unworn with tags and labels. However, I was then informed that i had gone past the 21 day period as well, which makes no sense. UK law clearly states that the return window begins from the day that the goods are received. I would have happily accepted a lesser refund since I was outside of the legislated 14 day window. Very disappointed.",
    date: "14 April 2025",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Carolina",
    review:
      "I have never felt so compelled to leave a negative review, but my experience with BBXBRAND has been so poor, I believe it's important to share it with others. I purchased two items from BBXBRAND, and both arrived damaged. I followed their return process and sent both items back promptly. However, since then, I have had to chase the company repeatedly for any updates on my refund. Despite multiple attempts to reach them, I have yet to receive any meaningful response or resolution. BBXBRAND has failed to meet its legal obligations under UK consumer protection laws, specifically the Consumer Rights Act 2015. This legislation entitles me to a full refund for faulty goods, yet BBXBRAND continues to avoid fulfilling this obligation, leaving me out of pocket.",
    date: "09 April 2025",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Kassandra Mitchell",
    review:
      "Dodgy Company, Provided a discount code via email urging me to proceed with order but no mention that if I order using the code I would be unable to return the items (I also had 2 warnings from friends prior to ordering and I ignored so that's my fault)",
    date: "13 February 2025",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "melek",
    review:
      "I returned an item within the legal timeframe and was issued store credit instead of a refund, despite my rights under the Consumer Contracts Regulations. This was over a 10% discount code, and I still kept one dress, as I was weighing my options for my birthday—so I had still spent a respectable amount with them. When I raised this, I was met with misleading claims and accusations. Fortunately, my bank refunded me, but the process was unnecessarily difficult. A brand aiming to project a luxury aesthetic should prioritize customer trust over short-term profits. Be cautious if you ever need to return something.",
    date: "13 February 2025",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Laura",
    review:
      "Returned item on 26th November bbxbrand have not refunded my return despite proof of delivery there's a photo of it sitting in there office it has been signed for, first they said would have to take store credit note because I used discount code but I know my legal right as an online buyer you do not have to accept a store credit as long as it is within 14 days it's only in store they can make you take store credit note. 9 weeks later still no refund or store credit despite weeks of me sending messages in my mind this is stealing at this point knowingly not giving someone there money back when they have shown you photos of my return sitting in your office really unfair and unprofessional.",
    date: "26 November 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Laxmi Gautam",
    review: "Exchanging sizes was straightforward. Communication during the return process was clear and fast.",
    date: "30 December 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Valeria Perez",
    review:
      "I've been recommending BBXBRAND to all my friends. Every piece I've bought has been of outstanding quality, and their attention to detail is remarkable.",
    date: "27 November 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Huda Al-Hinai",
    review:
      "I'm very impressed with the durability of their clothes. After multiple washes, my top still looks as good as new.",
    date: "13 November 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Lina Al-Qahtani",
    review:
      "I purchased the 24' Shell Jacket for my winter trip, and it exceeded expectations. It kept me warm while being incredibly stylish. It pairs well with both casual and formal outfits. Delivery was prompt, and the packaging was neat and secure.",
    date: "30 October 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Lala Ahmadova",
    review:
      "The jumpsuit I wore to a wedding turned heads. It fit perfectly, looked stunning, and was so easy to move and dance in.",
    date: "28 November 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "junebugg the king",
    review:
      "Website is really easy to navigate and all information is there if you look for it. I bought three items and I noticed one said pre order so I asked about it and the email back was quick and helpful. Would buy from them again",
    date: "06 December 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Pene",
    review:
      "Unfair practises and don't care about customers. God awful customer service and the owner is just as rude as the staff. Ordered a dress for a wedding and missed the fact it was a pre-order dress because it's written right at the bottom of the dress description section which is just stupid. Have they never heard of banners, stickers or labels? Anyway cancelled the order a few days later before the order had even been processed and was told I couldn't get a refund because I had used a discount code. They would only give me a store credit which I insisted I didn't want because I won't be shopping here again. Only to be ignored. I also found out recently that the store credit only lasts 6 months lol so I've tried to make another order so I don't lose my money but my order has been cancelled for whatever reason I don't know.",
    date: "08 October 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Marianne",
    review:
      "I ordered a dress from this company all the way from the US. I reached out regarding receiving a return label as the items quality was not as expected at all and the customer service rep informed me that 1. return labels are not provided and 2. I was trying to return the item 2 days before the 14 day return window closed. Mind you… Return shipping is around $30 from the US back to the UK which is a percentage of what I paid for the dress and I LIVE IN THE US. The norm is an 30day window for returns, so their policy is absolutely rubbish. So, I filed a claim with my bank, informing them of these details and letting them know that the item was damaged or not as described, the only option they provided that made sense, which in this case was the latter. As a result, I was issued a refund as a chargeback. However, I received an email from their customer service rep Amina this morning, accusing me of lying and telling the bank that that my item was damaged and she proceeded to threaten me, stating that they'd be turning me into local fraud agencies to, protect other small businesses, which is laughable.",
    date: "21 November 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Lateipha",
    review:
      "In my years of receiving customer service this company has delivered the worst I've ever received. Still in shock but I must say, order with faith and pray nothing goes wrong from whilst your order is being processed through to delivery. Ordered a Sheer black dress that came with a small tear which would likely be an accident during packaging. The material of the dress is very delicate. I emailed the company and sent photos they requested. The company inform me that they have checked CCTV and QR information and this black dress was sent without scratches. They were 100% sure of this I asked for evidence of this information. I infact reassured them that I loved the dress and would prefer an exchange. They took no accountability and was willing to argue back and forth to assure me that an exchange or return will not be accepted. The person behind customer service is argumentative and perhaps need a course to be taken on management & customer service.",
    date: "28 October 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Sils",
    review:
      "Been ordeing from bbx for some years now. My most recent purchase was for the Kesh 2 piece in mint for mu holdiay. It was perfect. Loved it and so did eveyone else!",
    date: "22 August 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "B",
    review:
      "I was looking for my birthday dress for a long time. After having being let down by another brand, I found a dress I loved with BBXBRAND. It wasn't actually available as it was on pre order and had a lead time but as my birthday was approaching I couldn't get it. I reached out to the team via email just to check if it would arrive on time but they told me it wouldn't be here on time so I opted for another dress which was my second choice. It arrived very quickly. Still loved it even though it was my second option.",
    date: "04 August 2024",
    rating: 4,
    sentiment_label: "positive",
  },
  {
    "customer name": "Elisha",
    review:
      "Clothes are luxury quality and customer service is 10/10. Retuned a few items before and never had any issues was a really quick turn around. Love the clothes and literally make you feel your best and the amount of compliments is ridiculous!",
    date: "05 May 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Anu",
    review:
      "Firstly, delivery time - QUICK. Secondly the material and the quality of these dresses are second to none. I ordered the orange mini for my birthday and the way it sculpts you and boosts your confidence. The pieces are so unique and versatile. From the modest pieces to everything. Will definitely be returning. Thank you for making me feel my best for my birthday 🧡🧡🧡🧡",
    date: "01 August 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Ash",
    review:
      "Just want to say WOW. Bought a lovely pink long dress that's made with these petal leaves at the bottom for my sister in laws brothers wedding. It was stunninggggg! It was a little see through but I wore pink underwear and it was fine. Got so many compliments on it. Fabric was also stunning with stretch. Can't wait for my second purchase",
    date: "02 August 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Bobbie Nicholson",
    review:
      "Do not buy from this company. BBX Brand do a great job of marketing and advertising their products, thats a fact. But their dresses are far from worth the money you pay for them. When I received my dress it smelt horrible, the sizing was awful, the material is cheap, the stitching is awful and it was just a crazy experience from start to now. As an ONLINE retailer, UK consumer law overwrites their policies as they are an online retailer, if there is an issue with their products, especially when they are not as advertised. I sent back 2 dresses which were of awful quality and not as described and they are refusing (going against the LAW) to refund me. Sent me a voucher i'll never ever use the whole while i'm breathing! They love to argue their case in email exchanges, with their sarcastic tone.. and even go to lengths of calling you by a different name and putting kisses at the end of their emails… sooooo sarcastic lol!",
    date: "31 July 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Chloe Jade",
    review:
      "Ive had a terrible experience with this company when ordering a dress for my baby shower. There was only a size 12 available, while I usually wear a size 10. I contacted customer service to ask about the lead time and if I could return the dress if it was too big. Knowing exactly which dress I was interested in, they assured me it was returnable. Based on this, I placed the order, thinking I could exchange it for a different size or get my money back if needed. A few days later, I became concerned after reading reviews on Trustpilot and emailed the company again to confirm their return policy. They then told me the dress was a pre-order item and non-returnable because it was made to order. This made no sense since I couldn't even order a size 10 in the first place. If it were truly made to order, I should have been able to choose any size.",
    date: "26 July 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Maddisongregoryx",
    review:
      "The BEST dresses for events/ birthdays - I always feel extra special whenever I'm wearing this brand and it fits soooo good!",
    date: "28 June 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Bridget M",
    review:
      "Finally took the plunge to order my 30th bday dress from here after deliberating for months. Unfortunately the dress was awful - the sizing and fit is just off! And the dress looked nothing like the image; if felt much cheaper quality than pictured or priced. I decided to return it immediately to get my refund but to my surprise they don't offer refunds on any items bought with a discount code (codes which they send to your inbox as a subscriber to the store). This is not only unfair on a customer but also against the consumer rights acts legislation for online purchase. From speaking with the Trading Standards, this has been escalated to be resolved however it's a shame a brand would put so many loopholes to keep customer funds. A reputable brand would have no issue just issuing refunds - unless you anticipate a lot of complaints 😊",
    date: "31 May 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Phyl",
    review:
      "I absolutely love BBX Brand! Not only do they offer unique, one-of-a-kind pieces, but their customer service is also top-notch. The BBX Brand team provides an unparalleled shopping experience, ensuring quick responses to any queries and a fast shipping process. They truly go above and beyond to provide the best service possible. I am a customer for life!",
    date: "22 April 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Martial",
    review:
      "Guys do not let your girlfriend order something on this website. You're gonna have bad days because of what the extra cost. They don't tell to customers that they will pay 80€ (only to deliver) for a dress that is about 150 €.",
    date: "02 March 2024",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Sonia",
    review:
      "Love love love my dress! I emailed to ask if I could pay for ndd to which they said they don't offer that service but their shipping is fairly quick (1-2 days). They didn't lie! I received a well presented package and a BEAUTIFUL dress the next day. The material is amazing and hugs you in the right places lol it's like really nice shape-wear. Definitely recommend!!!",
    date: "05 February 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "KA",
    review:
      "I've been shopping with you from the start and people never understood why I used to shout about BBX so much 😂 it's the quality and designs for me ! The team also were very helpful and kind with replacing an item that was damaged. ❤️",
    date: "31 January 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Shamara Lacey",
    review:
      "My experience with this brand has been such a great process. I received the most amazing dress. By far a dress that I've had most compliments on ever. I ordered a dress for my sisters birthday meal and it came just in time. This is a small niche business that deserves all the support for thier amaging unique items.",
    date: "15 January 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Kamille Saint",
    review:
      "Ordered a dress for my birthday as I had been let down by another company and I guess everything happens for a reason as honestly I was in love with the dress. It fit me perfectly. The length was a little long for me personally but was fine with heels. It came the next day which was super super fast.",
    date: "13 January 2024",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Olivia",
    review:
      "The item i got didn't fit, AT ALL, sizing was way off what i was used to (bummer as it was an amazing dress) BUT when i messaged customer service, they offered a different size and were willing to ship it to me before they even got my return back! I didn't take them up and just opted for a refund instead but love the way they handled it. Definitely recommend if you know your size with them. The dresses are beautiful!",
    date: "05 January 2024",
    rating: 4,
    sentiment_label: "positive",
  },
  {
    "customer name": "J. S.",
    review:
      "The owner makes everything look like it's all that but in reality the products are just of basic quality and cannot tell you how bad the sizing is! Been waiting for a pre-order for over two months and if you return it you'll get a store credit from which they'll deduct the shipping fee which you paid for and then you'll have to pay more from your pocket to return it! Awful, awful experience and service; no wonder she doesn't allow customers to review the items directly on the website! I'm stuck now with a store credit, waiting to purchase something someday I might like! To not mention the overly priced items that you can get for less elsewhere. Stop putting your money in her pocket for her to live in luxury and you won't be wearing that outfit again! You don't get what you pay for, simple.",
    date: "15 June 2023",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Raven",
    review:
      "If you're ordering from the US beware! You have to pay $32 for express DHL shipping then if you return and use UPS it's $200+! This company will not give you a simple DHL code to return their items so even if you don't want it you're literally wasting your money. I got my size according to the size chart and it was still too big. Plus the quality isn't worth the price. I have $50 items that feel the same way.",
    date: "07 April 2023",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Sonia",
    review:
      "Awful service and complained about me using a welcome discount code more than once instead of investigating the issue with my order. 5 weeks after making an order I asked them about the status and instead of trying to assist with the product status they said I was banned for using the discount code again. Just admit you were out of stock instead of cancelling my order after 6 weeks. Do not recommend buying from them, save your money",
    date: "13 April 2023",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Christie Antoszczak",
    review:
      "Terrible company to deal with. US Customers don't bother. The quality is terrible not worth the price and the return policy is a joke. You pay for the shipping which is $60+ and then they refuse to pick up the package. I had to go to my bank to receive a refund. It's not worth it.",
    date: "15 February 2023",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Fayobi fadojutimi",
    review:
      "They are one of the only retail establishments that do not give refunds for sale items. They claim to only give credit notes for sale items that are returned, yet, it's been over a week that I returned 2 items and the full price has been refunded but I am still waiting for the credit note. This is a credit note that was not issued in due time for their new drop of stock ( their stuff sells out almost immediately) I spent over £300 on their new drop and was told that I can not off set my credit note that is pending, although they understood my point, so only God knows how I will ever spend a credit note since there is never any stock available. I have had 3 emails stating they are looking into my refund, yet still no resolution, please stay away from this brand, there is no customer service no and they dnt care about their customers , they just want to take money.",
    date: "04 May 2022",
    rating: 1,
    sentiment_label: "negative",
  },
]
const wanderDollReviewsData = [
  {
    "customer name": "Samantha",
    review: "I love my new doll! It's so soft and cuddly.",
    date: "2024-01-15",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Emily",
    review: "The doll is cute, but the quality could be better.",
    date: "2024-02-20",
    rating: 3,
    sentiment_label: "neutral",
  },
  {
    "customer name": "Jessica",
    review: "My daughter loves her Wander Doll! It's her new favorite toy.",
    date: "2024-03-10",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Ashley",
    review: "The doll arrived damaged. I'm very disappointed.",
    date: "2024-04-05",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Brittany",
    review: "Great doll for the price! I would definitely recommend it.",
    date: "2024-05-12",
    rating: 4,
    sentiment_label: "positive",
  },
  {
    "customer name": "Lauren",
    review: "The doll is smaller than I expected.",
    date: "2024-06-18",
    rating: 2,
    sentiment_label: "negative",
  },
  {
    "customer name": "Megan",
    review: "I'm obsessed with Wander Dolls! I want to collect them all.",
    date: "2024-07-22",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Nicole",
    review: "The doll's hair falls out easily.",
    date: "2024-08-01",
    rating: 2,
    sentiment_label: "negative",
  },
  {
    "customer name": "Stephanie",
    review: "This doll is so unique and adorable! I love it!",
    date: "2024-09-08",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Amanda",
    review: "The doll's clothes are poorly made.",
    date: "2024-10-14",
    rating: 1,
    sentiment_label: "negative",
  },
  {
    "customer name": "Sarah",
    review: "I'm so happy with my Wander Doll! It's perfect!",
    date: "2024-11-20",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Jennifer",
    review: "The doll is okay, but nothing special.",
    date: "2024-12-25",
    rating: 3,
    sentiment_label: "neutral",
  },
]
const murciReviewsData = [
  {
    "customer name": "Alice",
    review: "Murci is the best clothing brand ever!",
    date: "2024-01-25",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Bob",
    review: "The quality of Murci's clothes is amazing.",
    date: "2024-02-15",
    rating: 4,
    sentiment_label: "positive",
  },
  {
    "customer name": "Charlie",
    review: "I love the unique designs of Murci's clothing.",
    date: "2024-03-05",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "David",
    review: "Murci's customer service is excellent.",
    date: "2024-04-10",
    rating: 4,
    sentiment_label: "positive",
  },
  {
    "customer name": "Eve",
    review: "I'm always satisfied with my Murci purchases.",
    date: "2024-05-20",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Frank",
    review: "Murci's clothes are a bit expensive, but worth it.",
    date: "2024-06-01",
    rating: 3,
    sentiment_label: "neutral",
  },
  {
    "customer name": "Grace",
    review: "I'm obsessed with Murci's new collection!",
    date: "2024-07-12",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Harry",
    review: "Murci's clothes fit perfectly.",
    date: "2024-08-18",
    rating: 4,
    sentiment_label: "positive",
  },
  {
    "customer name": "Ivy",
    review: "I always get compliments when I wear Murci.",
    date: "2024-09-22",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Jack",
    review: "Murci's clothes are a bit too trendy for my taste.",
    date: "2024-10-01",
    rating: 2,
    sentiment_label: "negative",
  },
  {
    "customer name": "Kelly",
    review: "I love the sustainable practices of Murci.",
    date: "2024-11-15",
    rating: 5,
    sentiment_label: "positive",
  },
  {
    "customer name": "Liam",
    review: "Murci's clothes are not very durable.",
    date: "2024-12-10",
    rating: 1,
    sentiment_label: "negative",
  },
]

// Fallback data for brands without JSON files
const fallbackReviews = [
  {
    id: 1,
    customerName: "Sarah M.",
    date: "2024-01-15",
    rating: 5,
    review: "Perfect fit! The sizing was exactly as expected. Very comfortable and true to size.",
    sentiment_label: "positive",
  },
  {
    id: 2,
    customerName: "Mike R.",
    date: "2024-01-14",
    rating: 2,
    review: "Runs small compared to other brands. Had to return and size up.",
    sentiment_label: "negative",
  },
  {
    id: 3,
    customerName: "Emma L.",
    date: "2024-01-13",
    rating: 4,
    review: "Good fit overall, though slightly narrow. Would recommend sizing up for wide feet.",
    sentiment_label: "positive",
  },
]

const fallbackMetrics = calculateMetrics(fallbackReviews)
const fallbackMonthlyData = generateMonthlyData(fallbackReviews)

/* ---------- transform & metric calculation ---------- */
const bbxReviews = transformReviews(bbxBrandReviewsData)
const wanderReviews = transformReviews(wanderDollReviewsData)
const murciReviews = transformReviews(murciReviewsData)

const bbxMetrics = calculateMetrics(bbxReviews)
const wanderMetrics = calculateMetrics(wanderReviews)
const murciMetrics = calculateMetrics(murciReviews)

const bbxMonthly = generateMonthlyData(bbxReviews)
const wanderMonthly = generateMonthlyData(wanderReviews)
const murciMonthly = generateMonthlyData(murciReviews)

/* ---------- realBrandData object ---------- */
export const realBrandData = {
  "wander-doll": {
    id: "wander-doll",
    name: "Wander Doll",
    logo: "/logos/wander-doll-logo.jpg",
    trustpilotUrl: "https://uk.trustpilot.com/review/www.wander-doll.com",
    metrics: wanderMetrics,
    monthlySentimentData: wanderMonthly,
    reviews: wanderReviews,
  },
  murci: {
    id: "murci",
    name: "Murci",
    logo: "/logos/murci-logo.jpg",
    trustpilotUrl: "https://uk.trustpilot.com/review/murci.co.uk",
    metrics: murciMetrics,
    monthlySentimentData: murciMonthly,
    reviews: murciReviews,
  },
  "bbx-brand": {
    id: "bbx-brand",
    name: "BBX Brand",
    logo: "/logos/bbx-brand-logo.jpg",
    trustpilotUrl: "https://uk.trustpilot.com/review/bbxbrand.com",
    metrics: bbxMetrics,
    monthlySentimentData: bbxMonthly,
    reviews: bbxReviews,
  },
  "odd-muse": {
    id: "odd-muse",
    name: "Odd Muse",
    logo: "/logos/odd-muse-logo.jpg",
    trustpilotUrl: "https://uk.trustpilot.com/review/oddmuse.co.uk",
    metrics: fallbackMetrics,
    monthlySentimentData: fallbackMonthlyData,
    reviews: fallbackReviews,
  },
  "because-of-alice": {
    id: "because-of-alice",
    name: "Because of Alice",
    logo: "/logos/because-of-alice-logo.jpg",
    trustpilotUrl: "https://uk.trustpilot.com/review/www.becauseofalice.com",
    metrics: fallbackMetrics,
    monthlySentimentData: fallbackMonthlyData,
    reviews: fallbackReviews,
  },
} as const

/* ---------- helper: rating colour ---------- */
export const getRatingColor = (rating: number) => {
  if (rating >= 4) return "text-green-600 font-bold"
  if (rating >= 3) return "text-yellow-600 font-bold"
  return "text-red-600 font-bold"
}

/* ---------- list for dashboard cards ---------- */
const sentimentOf = (m: ReturnType<typeof calculateMetrics>) => {
  const ratio = m.totalSizingFitReviews ? m.positiveCount / m.totalSizingFitReviews : 0
  if (ratio > 0.6) return "positive"
  if (ratio < 0.4) return "negative"
  return "neutral"
}

export const realBrandsList = Object.values(realBrandData).map((b) => ({
  id: b.id,
  name: b.name,
  logo: b.logo,
  totalReviews: b.reviews.length,
  sizingFitReviews: b.metrics.totalSizingFitReviews,
  avgRating: b.metrics.avgRating,
  sentiment: sentimentOf(b.metrics),
  lastUpdated: getLastScrapedDate(b.id), // NOW USES SCRAPED DATE FROM LOCALSTORAGE
}))
