import { Card, CardContent, CardHeader } from "@/components/ui/card"

// Pulse animation effect - like YouTube/Instagram skeletons
const pulseClass = "bg-gray-200 rounded-md animate-pulse dark:bg-gray-700"

export function BrandDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            {/* Brand Logo Skeleton */}
            <div className={`w-20 h-20 ${pulseClass}`} />
            <div>
              {/* Brand Name Skeleton */}
              <div className={`h-8 w-48 mb-2 ${pulseClass}`} />
              {/* Last Updated Skeleton */}
              <div className={`h-4 w-32 ${pulseClass}`} />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Update Button Skeleton */}
            <div className={`h-10 w-20 ${pulseClass}`} />
            {/* Source Button Skeleton */}
            <div className={`h-10 w-20 ${pulseClass}`} />
            {/* Keyword Settings Button Skeleton */}
            <div className={`h-10 w-36 ${pulseClass}`} />
          </div>
        </div>

        {/* Metrics Tiles Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          {/* Total Reviews Card */}
          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg">
            <CardHeader className="pt-2 pb-0 px-2">
              <div className={`h-5 w-24 mx-auto mb-3 ${pulseClass}`} />
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-center space-y-3">
              <div className={`h-8 w-16 ${pulseClass}`} />
              <div className={`h-3 w-20 ${pulseClass}`} />
            </CardContent>
          </Card>

          {/* Average Rating Card */}
          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg">
            <CardHeader className="pt-2 pb-0 px-2">
              <div className={`h-5 w-28 mx-auto mb-3 ${pulseClass}`} />
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-center space-y-3">
              {/* Star Rating Skeleton */}
              <div className="flex items-center justify-center space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <div key={star} className={`w-7 h-7 ${pulseClass}`} />
                ))}
              </div>
              <div className={`h-8 w-12 ${pulseClass}`} />
              <div className={`h-3 w-24 ${pulseClass}`} />
            </CardContent>
          </Card>

          {/* Sentiment Breakdown Card */}
          <Card className="bg-card text-card-foreground h-full p-0 min-w-[180px] shadow-lg">
            <CardHeader className="pt-2 pb-0 px-2">
              <div className={`h-5 w-32 mx-auto mb-2 ${pulseClass}`} />
            </CardHeader>
            <CardContent className="pb-2 px-2 flex flex-col justify-center">
              <div className="space-y-3">
                {/* Positive Bar Skeleton */}
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-sm ${pulseClass}`} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className={`h-3 w-12 ${pulseClass}`} />
                      <div className={`h-3 w-8 ${pulseClass}`} />
                    </div>
                    <div className={`w-full h-2 rounded-full ${pulseClass}`} />
                  </div>
                </div>

                {/* Negative Bar Skeleton */}
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-sm ${pulseClass}`} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className={`h-3 w-12 ${pulseClass}`} />
                      <div className={`h-3 w-8 ${pulseClass}`} />
                    </div>
                    <div className={`w-full h-2 rounded-full ${pulseClass}`} />
                  </div>
                </div>

                {/* Neutral Bar Skeleton */}
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-sm ${pulseClass}`} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className={`h-3 w-12 ${pulseClass}`} />
                      <div className={`h-3 w-8 ${pulseClass}`} />
                    </div>
                    <div className={`w-full h-2 rounded-full ${pulseClass}`} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sentiment Score Card */}
          <Card className="bg-card text-card-foreground h-full p-0 min-w-[160px] shadow-lg">
            <CardHeader className="pt-2 pb-0 px-2">
              <div className={`h-5 w-28 mx-auto mb-2 ${pulseClass}`} />
            </CardHeader>
            <CardContent className="px-2 pb-2 flex flex-col items-center justify-center space-y-4">
              {/* Gauge Chart Skeleton - Circular with inner hole like real gauge */}
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className={`w-24 h-24 rounded-full border-8 border-gray-200 dark:border-gray-700 ${pulseClass}`} style={{borderTopColor: 'transparent', borderRightColor: 'transparent'}} />
                {/* Center score placeholder */}
                <div className="absolute">
                  <div className={`h-6 w-12 ${pulseClass}`} />
                </div>
              </div>
              {/* Badge skeleton */}
              <div className={`h-6 w-16 rounded-full ${pulseClass}`} />
            </CardContent>
          </Card>

          {/* Monthly Trend Card */}
          <Card className="bg-card text-card-foreground h-full p-0 min-w-[180px] shadow-lg">
            <CardHeader className="pt-2 pb-0 px-2">
              <div className={`h-5 w-24 mx-auto ${pulseClass}`} />
            </CardHeader>
            <CardContent className="pt-1 pb-2 flex flex-col items-center justify-center">
              {/* Sparkline Chart Skeleton */}
              <div className="flex justify-center items-center h-20 mb-0">
                <div className={`w-32 h-16 ${pulseClass}`} />
              </div>
            </CardContent>
          </Card>

          {/* Top Mentions Card */}
          <Card className="bg-card text-card-foreground h-full p-1 shadow-lg">
            <CardHeader className="pt-0 pb-1 px-2">
              <div className={`h-5 w-24 ${pulseClass}`} />
            </CardHeader>
            <CardContent className="p-1">
              <div className="flex flex-wrap gap-1">
                {/* Keyword Badge Skeletons with varying widths */}
                <div className={`h-6 w-20 ${pulseClass}`} />
                <div className={`h-6 w-16 ${pulseClass}`} />
                <div className={`h-6 w-24 ${pulseClass}`} />
                <div className={`h-6 w-18 ${pulseClass}`} />
                <div className={`h-6 w-14 ${pulseClass}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Review Details Table Skeleton */}
        <Card className="mb-8 bg-card text-card-foreground shadow-lg">
          <CardHeader>
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className={`h-6 w-32 mb-2 ${pulseClass}`} />
                  <div className={`h-4 w-64 ${pulseClass}`} />
                </div>
                <div className="flex items-center gap-2 justify-end mb-4">
                  {/* Search Input Skeleton */}
                  <div className={`h-10 w-64 ${pulseClass}`} />
                  {/* Filter Button Skeleton */}
                  <div className={`h-10 w-16 ${pulseClass}`} />
                  {/* CSV Button Skeleton */}
                  <div className={`h-10 w-16 ${pulseClass}`} />
                  {/* AI Report Button Skeleton */}
                  <div className={`h-10 w-24 ${pulseClass}`} />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Table Header Skeleton */}
            <div className="border rounded-lg">
              <div className="border-b p-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className={`h-4 w-12 ${pulseClass}`} />
                  <div className={`h-4 w-16 ${pulseClass}`} />
                  <div className={`h-4 w-16 ${pulseClass}`} />
                </div>
              </div>
              {/* Table Body Skeleton - Multiple Rows */}
              {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
                <div key={row} className="border-b p-4">
                  <div className="grid grid-cols-3 gap-4 items-start">
                    {/* Date Column */}
                    <div className={`h-4 w-20 ${pulseClass}`} />
                    {/* Rating Column */}
                    <div className={`h-4 w-8 ${pulseClass}`} />
                    {/* Review Content Column */}
                    <div className="space-y-2">
                      <div className={`h-4 w-full ${pulseClass}`} />
                      <div className={`h-4 w-4/5 ${pulseClass}`} />
                      <div className={`h-4 w-3/5 ${pulseClass}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Pagination Skeleton */}
            <div className="flex justify-center mt-4">
              <div className="flex items-center space-x-2">
                <div className={`h-8 w-8 ${pulseClass}`} />
                <div className={`h-8 w-8 ${pulseClass}`} />
                <div className={`h-8 w-8 ${pulseClass}`} />
                <div className={`h-8 w-8 ${pulseClass}`} />
                <div className={`h-8 w-8 ${pulseClass}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
