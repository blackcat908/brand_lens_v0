interface KeywordHighlighterProps {
  text: string
  keywords: string[]
  className?: string
}

export function KeywordHighlighter({ text, keywords, className = "" }: KeywordHighlighterProps) {
  const highlightKeywords = (text: string, keywords: string[]) => {
    if (!keywords.length) return text

    // Create a regex pattern that matches any of the keywords (case insensitive, whole words)
    const pattern = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi")

    return text.replace(pattern, '<mark class="bg-yellow-200 px-1 rounded font-medium">$1</mark>')
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{
        __html: highlightKeywords(text, keywords),
      }}
    />
  )
}
