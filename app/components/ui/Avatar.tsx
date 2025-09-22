import React, { useState, useCallback } from 'react';
import { classNames as cn } from '~/utils/classNames';

interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: number;
  className?: string;
  onError?: () => void;
}

export function Avatar({
  src,
  alt,
  name = '',
  size = 32,
  className,
  onError
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(!!src);

  // Convert Google avatar URLs to use our proxy
  const getAvatarUrl = useCallback((url: string) => {
    if (!url) return url;

    // Check if it's a Google avatar URL
    const googleHosts = [
      'lh3.googleusercontent.com',
      'lh4.googleusercontent.com',
      'lh5.googleusercontent.com',
      'lh6.googleusercontent.com',
      'ssl.gstatic.com'
    ];

    try {
      const urlObj = new URL(url);
      if (googleHosts.includes(urlObj.hostname)) {
        // Use our proxy for Google avatars
        return `/api/avatar?url=${encodeURIComponent(url)}`;
      }
    } catch (error) {
      // Invalid URL, return as-is
      console.warn('Invalid avatar URL:', url);
    }

    return url;
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoading(false);
    onError?.();
  }, [onError]);

  // Generate initials from name
  const getInitials = useCallback((fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }, []);

  // Only show image if we have a valid src and no error
  const shouldShowImage = src && !imageError;
  const avatarUrl = shouldShowImage ? getAvatarUrl(src) : '';

  return (
    <div
      className={cn(
        "relative rounded-full overflow-hidden flex-shrink-0",
        "bg-conformity-elements-background-depth-3",
        "border border-conformity-elements-borderColor",
        className
      )}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size
      }}
      role="img"
      aria-label={alt || `${name}'s avatar`}
    >
      {shouldShowImage && (
        <img
          src={avatarUrl}
          alt={alt || `${name}'s avatar`}
          className={cn(
            "w-full h-full object-cover",
            imageLoading ? "opacity-0" : ""
          )}
          style={{
            width: size,
            height: size
          }}
          onLoad={handleImageLoad}
          onError={handleImageError}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
        />
      )}

      {/* Loading skeleton */}
      {imageLoading && shouldShowImage && (
        <div
          className="absolute inset-0 bg-conformity-elements-background-depth-2 animate-pulse"
          style={{
            width: size,
            height: size
          }}
        />
      )}

      {/* Fallback initials */}
      {(!shouldShowImage || imageError) && (
        <div
          className={cn(
            "flex items-center justify-center w-full h-full",
            "text-conformity-elements-textPrimary font-medium",
            "bg-conformity-elements-background-depth-2"
          )}
          style={{
            fontSize: Math.max(10, size * 0.4),
            width: size,
            height: size
          }}
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}

// Utility function to create avatar URLs for external use
export function createAvatarUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const googleHosts = [
    'lh3.googleusercontent.com',
    'lh4.googleusercontent.com',
    'lh5.googleusercontent.com',
    'lh6.googleusercontent.com',
    'ssl.gstatic.com'
  ];

  try {
    const urlObj = new URL(originalUrl);
    if (googleHosts.includes(urlObj.hostname)) {
      return `/api/avatar?url=${encodeURIComponent(originalUrl)}`;
    }
  } catch (error) {
    console.warn('Invalid avatar URL:', originalUrl);
  }

  return originalUrl;
}
