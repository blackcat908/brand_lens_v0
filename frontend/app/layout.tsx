import type { Metadata } from 'next'
import '../styles/globals.css'
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeHydrationFix } from "@/components/theme-hydration-fix"

export const metadata: Metadata = {
  title: 'Brand Lens',
  description: 'Monitor sizing and fit sentiment across top brands',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.add('light');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ThemeHydrationFix />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
