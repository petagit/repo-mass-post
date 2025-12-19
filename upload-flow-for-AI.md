# Upload Flow Documentation for AI

This document outlines the logic for media uploads and post processing in the Post-Bridge system, specifically focusing on the 5MB image limit and video handling.

## Frontend Logic (`app/post/page.tsx`)

### 1. File Upload Filtering
- **Image Limit**: Any file identified as an image (`image/*`) is restricted to a maximum size of **5 megabytes (5,242,880 bytes)**.
- **Video Bypass**: Video files (`video/*`) are **not** subject to this size limitation on the frontend.
- **Rejection**: If an image exceeds the 5MB limit, the system rejects the file and provides a toast notification to the user: `Image "[filename]" is too large (>5MB) and will be skipped.`

### 2. Multi-Media Handling
- The UI explicitly informs users: "If a video is uploaded, it will be posted as a video post."
- This is because the system prioritizes video content for platforms like Instagram (Reels) and TikTok.

## Backend Bridge Logic (`app/api/post-bridge/`)

### 1. Media Upload (`/upload-media`)
- Receives files via `multipart/form-data`.
- Validates MIME types (Post-Bridge accepts PNG, JPEG, WEBP, GIF, MP4, MOV).
- Generates signed S3/GCS upload URLs from the Post-Bridge API.
- After upload, it retrieves the media IDs and (if possible) the final public URLs.

### 2. Publishing (`/publish` and `/bulk-schedule`)
- These endpoints receive media identifiers (Either URLs or UUIDs/IDs).
- **Core Logic**:
    - If **any** video is present in the `mediaUrls` or `mediaIds` list, the system treat the post as a **video post**.
    - For Instagram, this automatically selects the `reel` placement (`platform_configurations: { instagram: { placement: "reel" } }`).
    - The backend logic prioritizes the first video found in the list for single-video platforms.
    - If only images are present, it proceeds as a standard image post ("carousel" or "photo").

## Summary of Constraints
- **Images**: Max 5MB (Frontend enforced).
- **Videos**: No specific size limit enforced on the frontend; subject to Post-Bridge and social platform limits (typically up to ~1GB or specific duration limits).
- **Format**: Prefers MP4 for videos and JPG/PNG for images.
