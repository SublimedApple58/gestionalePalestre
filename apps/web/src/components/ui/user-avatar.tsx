"use client";

import { useState } from "react";

type UserAvatarSize = "sm" | "md" | "lg";

type UserAvatarProps = {
  firstName: string;
  profilePhotoUrl?: string | null;
  size?: UserAvatarSize;
  className?: string;
  style?: React.CSSProperties;
};

const SIZE_CLASSES: Record<UserAvatarSize, string> = {
  sm: "user-avatar user-avatar-sm",
  md: "user-avatar",
  lg: "user-avatar user-avatar-lg"
};

export function UserAvatar({
  firstName,
  profilePhotoUrl,
  size = "md",
  className,
  style
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showPhoto = profilePhotoUrl && !imgError;

  const sizeClass = SIZE_CLASSES[size];
  const combinedClass = className ? `${sizeClass} ${className}` : sizeClass;

  if (showPhoto) {
    return (
      <span className={combinedClass} style={style}>
        <img
          src={profilePhotoUrl}
          alt={`Foto di ${firstName}`}
          className="user-avatar-img"
          onError={() => setImgError(true)}
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span className={combinedClass} style={style}>
      {firstName.charAt(0).toUpperCase()}
    </span>
  );
}
