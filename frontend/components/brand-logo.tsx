import React, { useState, useEffect, useCallback } from "react";
import { useLogos } from "../hooks/use-logos";

interface BrandLogoProps {
  src: string;
  alt: string;
  maxWidth?: number;
  maxHeight?: number;
  brandName?: string; // Optional brand name for API fetching
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  src, 
  alt, 
  maxWidth = 96, 
  maxHeight = 96,
  brandName 
}) => {
  const [logoSrc, setLogoSrc] = useState<string>(src);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  const { getLogo, loading: logosLoading } = useLogos();

  // Function to get logo from cached data
  const getLogoFromCache = useCallback((brand: string) => {
    if (!brand) return null;
    
    const logoData = getLogo(brand);
    console.log(`[BrandLogo] Looking for logo for "${brand}":`, logoData ? 'Found' : 'Not found');
    if (logoData) {
      setLogoSrc(logoData);
      return true;
    }
    return false;
  }, [getLogo]);
  
  // Function to fetch individual logo if not in cache
  const fetchIndividualLogo = useCallback(async (brand: string) => {
    if (!brand) return false;
    
    try {
      console.log(`[BrandLogo] Fetching individual logo for "${brand}"`);
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') + '/api';
      const response = await fetch(`${apiUrl}/logos/${encodeURIComponent(brand)}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[BrandLogo] Individual logo fetched for "${brand}"`);
        
        // Check if logo_data is already a data URL
        let dataUrl;
        if (data.logo_data && data.logo_data.startsWith('data:')) {
          // Already a data URL, use as is
          dataUrl = data.logo_data;
        } else if (data.logo_data && data.logo_mime_type) {
          // Convert base64 to proper data URL with MIME type
          dataUrl = `data:${data.logo_mime_type};base64,${data.logo_data}`;
        } else {
          console.log(`[BrandLogo] Invalid logo data for "${brand}"`);
          return false;
        }
        
        setLogoSrc(dataUrl);
        return true;
      } else {
        console.log(`[BrandLogo] No individual logo found for "${brand}"`);
        return false;
      }
    } catch (error) {
      console.error(`[BrandLogo] Error fetching individual logo for "${brand}":`, error);
      return false;
    }
  }, []);

  // Determine if we should fetch from API
  useEffect(() => {
    // Don't try to fetch logos while the main logos are still loading
    if (logosLoading) {
      return;
    }

    // If src is a placeholder or static file, and we have a brand name, try to get from cache
    if (brandName && (src.includes('placeholder-logo.png') || src.startsWith('/'))) {
      setIsLoading(true);
      const found = getLogoFromCache(brandName);
      if (!found) {
        // Only try individual fetch as a last resort, and only if main logos have loaded
        fetchIndividualLogo(brandName).then((success) => {
          if (!success) {
            setHasError(true);
            setLogoSrc(src); // Fall back to original src
          }
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    } else {
      setLogoSrc(src);
    }
  }, [src, brandName, getLogoFromCache, fetchIndividualLogo, logosLoading]);

  // Debug logoSrc changes
  useEffect(() => {
    console.log(`[BrandLogo] logoSrc changed for brand: "${brandName}" to: "${logoSrc?.substring(0, 50)}..."`);
  }, [logoSrc, brandName]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.log(`[BrandLogo] Image error for brand: "${brandName}", src: "${e.currentTarget.src}"`);
    setHasError(true);
    e.currentTarget.src = "/placeholder-logo.png";
  };

  const handleImageLoad = () => {
    console.log(`[BrandLogo] Image loaded successfully for brand: "${brandName}"`);
    setIsLoading(false);
  };

  return (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: maxWidth,
      height: maxHeight,
      overflow: "hidden",
      background: "transparent",
        position: "relative",
    }}
  >
      {(isLoading || logosLoading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-md">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      )}
      
    <img
        src={logoSrc}
      alt={alt}
      className="border border-gray-200 dark:border-gray-600 rounded-md"
      style={{
        maxWidth: "100%",
        maxHeight: "100%",
        display: "block",
        background: "transparent",
        margin: "auto",
            opacity: isLoading ? 0.5 : 1,
      }}
        onError={handleImageError}
        onLoad={handleImageLoad}
    />
  </div>
); 
}; 