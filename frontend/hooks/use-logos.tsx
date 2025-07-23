import { useState, useEffect } from 'react';

interface LogoData {
  logo_data: string;
  logo_filename: string;
  logo_mime_type: string;
}

interface LogosResponse {
  logos: Record<string, LogoData>;
  total_brands: number;
}

// Global cache for logos
let logosCache: Record<string, LogoData> | null = null;
let isLoading = false;
let hasError = false;

export const useLogos = () => {
  const [logos, setLogos] = useState<Record<string, LogoData> | null>(logosCache);
  const [loading, setLoading] = useState(isLoading);
  const [error, setError] = useState(hasError);

  const fetchLogos = async () => {
    // If already cached, return immediately
    if (logosCache) {
      setLogos(logosCache);
      return;
    }

    // If already loading, wait
    if (isLoading) {
      return;
    }

    isLoading = true;
    setLoading(true);
    hasError = false;
    setError(false);

    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000') + '/api';
      const response = await fetch(`${apiUrl}/logos`);
      
      if (response.ok) {
        const data: LogosResponse = await response.json();
        logosCache = data.logos;
        setLogos(data.logos);
        console.log(`✅ Loaded ${data.total_brands} logos from API`);
      } else {
        throw new Error(`Failed to fetch logos: ${response.status}`);
      }
    } catch (err) {
      console.error('Error fetching logos:', err);
      hasError = true;
      setError(true);
    } finally {
      isLoading = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogos();
  }, []);

  const getLogo = (brandName: string): string | null => {
    console.log(`[useLogos] getLogo called for: "${brandName}"`);
    console.log(`[useLogos] logos available:`, logos ? Object.keys(logos) : 'null');
    if (!logos || !brandName) {
      console.log(`[useLogos] No logos or brandName, returning null`);
      return null;
    }
    const logoData = logos[brandName]?.logo_data || null;
    console.log(`[useLogos] Logo data for "${brandName}":`, logoData ? 'Found' : 'Not found');
    return logoData;
  };

  const clearCache = () => {
    logosCache = null;
    isLoading = false;
    hasError = false;
    setLogos(null);
    setLoading(false);
    setError(false);
  };

  return {
    logos,
    loading,
    error,
    getLogo,
    refetch: fetchLogos,
    clearCache
  };
}; 