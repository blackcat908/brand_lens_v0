import React from "react";

export const BrandLogo: React.FC<{
  src: string;
  alt: string;
  maxWidth?: number;
  maxHeight?: number;
}> = ({ src, alt, maxWidth = 96, maxHeight = 96 }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: maxWidth,
      height: maxHeight,
      overflow: "hidden",
      background: "transparent",
    }}
  >
    <img
      src={src}
      alt={alt}
      style={{
        maxWidth: "100%",
        maxHeight: "100%",
        display: "block",
        background: "transparent",
        margin: "auto",
      }}
      onError={e => {
        (e.currentTarget as HTMLImageElement).src = "/placeholder-logo.png";
      }}
    />
  </div>
); 