'use client'
import { useTheme } from 'next-themes'
import { useEffect } from 'react'

export function ThemeHydrationFix() {
  const { theme } = useTheme()
  useEffect(() => {
    if (theme) {
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(theme)
    }
  }, [theme])
  return null
} 