import { NextResponse } from "next/server";

export async function POST(req: Request): Promise<NextResponse> {
  const baseUrl = process.env.POSTBRIDGE_BASE_URL ?? "https://api.post-bridge.com";
  const apiKey = process.env.POSTBRIDGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POSTBRIDGE_API_KEY missing" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadedMediaUrls: string[] = [];
    const errors: string[] = [];

    // Process each file
    const uploadedMediaIds: string[] = [];
    for (const file of files) {
      try {
        // Validate file type - Post Bridge only accepts specific MIME types
        const allowedMimeTypes = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "video/mp4",
          "video/quicktime",
        ];
        let normalizedMimeType = file.type.toLowerCase();
        
        // If MIME type is not detected, try to infer from file extension
        if (!normalizedMimeType || normalizedMimeType === "application/octet-stream") {
          const fileName = file.name.toLowerCase();
          if (fileName.endsWith(".png")) {
            normalizedMimeType = "image/png";
          } else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
            normalizedMimeType = "image/jpeg";
          } else if (fileName.endsWith(".webp")) {
            normalizedMimeType = "image/webp";
          } else if (fileName.endsWith(".gif")) {
            normalizedMimeType = "image/gif";
          } else if (fileName.endsWith(".mp4")) {
            normalizedMimeType = "video/mp4";
          } else if (fileName.endsWith(".mov") || fileName.endsWith(".qt")) {
            normalizedMimeType = "video/quicktime";
          } else {
            throw new Error(`Could not determine file type for ${file.name}. Supported types: ${allowedMimeTypes.join(", ")}`);
          }
        }
        
        // Map common MIME types to Post Bridge accepted types
        let mimeType: string = normalizedMimeType;
        if (normalizedMimeType === "image/jpg") {
          mimeType = "image/jpeg";
        } else if (normalizedMimeType === "video/quicktime" || normalizedMimeType === "video/x-quicktime") {
          mimeType = "video/quicktime";
        } else if (normalizedMimeType.startsWith("video/") && normalizedMimeType !== "video/mp4" && normalizedMimeType !== "video/quicktime") {
          // Try to convert other video types to mp4 if possible
          if (file.name.toLowerCase().endsWith(".mp4")) {
            mimeType = "video/mp4";
          } else {
            throw new Error(`Unsupported file type: ${file.type}. Supported types: ${allowedMimeTypes.join(", ")}`);
          }
        }
        
        if (!allowedMimeTypes.includes(mimeType)) {
          throw new Error(`Unsupported file type: ${file.type || "unknown"}. Supported types: ${allowedMimeTypes.join(", ")}`);
        }
        
        // Validate file size
        if (!file.size || file.size < 1) {
          throw new Error(`Invalid file size: ${file.size}`);
        }
        
        // Step 1: Create upload URL from Post Bridge
        // API Reference: https://api.post-bridge.com/reference#tag/media/post/v1/media/create-upload-url
        // Post Bridge API expects: name (string), mime_type (string), size_bytes (integer)
        const requestPayload = {
          name: file.name,
          mime_type: mimeType,
          size_bytes: Math.floor(file.size), // Ensure it's an integer
        };

        const createUploadUrlRes = await fetch(`${baseUrl}/v1/media/create-upload-url`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestPayload),
        });

        if (!createUploadUrlRes.ok) {
          const errorText = await createUploadUrlRes.text();
          let errorMessage = errorText;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorJson.detail || errorText;
          } catch {
            // Keep original error text
          }
          
          console.error("Failed to create upload URL:", {
            file: file.name,
            size: file.size,
            mimeType: mimeType,
            payload: requestPayload,
            status: createUploadUrlRes.status,
            error: errorMessage,
          });
          
          throw new Error(`Failed to generate signed URL for file "${file.name}": ${errorMessage}`);
        }

        const uploadData = (await createUploadUrlRes.json()) as {
          upload_url?: string;
          uploadUrl?: string;
          signed_url?: string;
          signedUrl?: string;
          media_id?: string;
          mediaId?: string;
          id?: string;
        };

        // Extract upload URL and media ID from response
        const uploadUrl =
          uploadData.upload_url ||
          uploadData.uploadUrl ||
          uploadData.signed_url ||
          uploadData.signedUrl;

        const mediaId =
          uploadData.media_id ||
          uploadData.mediaId ||
          uploadData.id;

        if (!uploadUrl) {
          console.error("Upload data response:", JSON.stringify(uploadData, null, 2));
          throw new Error("No upload URL returned from Post Bridge. Response: " + JSON.stringify(uploadData));
        }

        if (!mediaId) {
          console.error("Upload data response:", JSON.stringify(uploadData, null, 2));
          throw new Error("No media ID returned from Post Bridge. Response: " + JSON.stringify(uploadData));
        }

        // Step 2: Upload file to the signed URL
        const fileBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType, // Use the normalized MIME type
          },
          body: fileBuffer,
        });

        if (!uploadRes.ok) {
          const uploadErrorText = await uploadRes.text();
          throw new Error(`Failed to upload file to signed URL: ${uploadErrorText}`);
        }

        // Step 3: Get media by ID to retrieve the final media URL
        // API Reference: https://api.post-bridge.com/reference#tag/media/get/v1/media/{id}
        // Retry a few times as media processing may take a moment
        let mediaUrl: string | undefined;
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              // Wait before retrying
              await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
            }
            
            const mediaRes = await fetch(`${baseUrl}/v1/media/${mediaId}`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
              cache: "no-store",
            });

            if (!mediaRes.ok) {
              if (attempt === maxRetries - 1) {
                const mediaErrorText = await mediaRes.text();
                console.warn(`Failed to fetch media details for ${mediaId} after ${maxRetries} attempts:`, {
                  status: mediaRes.status,
                  error: mediaErrorText,
                });
              }
              continue; // Retry
            }
            
            const mediaDetails = (await mediaRes.json()) as {
              url?: string;
              media_url?: string;
              mediaUrl?: string;
              public_url?: string;
              publicUrl?: string;
              status?: string;
              state?: string;
            };
            
            mediaUrl =
              mediaDetails.url ||
              mediaDetails.media_url ||
              mediaDetails.mediaUrl ||
              mediaDetails.public_url ||
              mediaDetails.publicUrl ||
              undefined;
            
            // If we got a URL, we're done
            if (mediaUrl) break;
            
            // If media is still processing, retry
            const status = (mediaDetails.status || mediaDetails.state || "").toLowerCase();
            if (status === "processing" || status === "pending" || status === "uploading") {
              continue; // Retry
            }
            
            // If status indicates it's ready but no URL, break (may be an API issue)
            break;
          } catch (fetchError: any) {
            if (attempt === maxRetries - 1) {
              console.warn(`Error fetching media details for ${mediaId} after ${maxRetries} attempts:`, fetchError);
            }
            // Retry on error
          }
        }

        // Always collect the media ID; URL is optional and may be resolvable later
        if (mediaId) uploadedMediaIds.push(String(mediaId));
        if (mediaUrl) uploadedMediaUrls.push(mediaUrl);
      } catch (fileError: any) {
        console.error(`Error uploading file ${file.name}:`, fileError);
        errors.push(`${file.name}: ${fileError.message}`);
      }
    }

    if (uploadedMediaUrls.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `All uploads failed: ${errors.join("; ")}`,
          mediaUrls: [],
          count: 0,
        },
        { status: 500 }
      );
    }

    if (errors.length > 0) {
      // Some files succeeded, some failed
      console.warn("Some files failed to upload:", errors);
    }

    return NextResponse.json({
      success: true,
      mediaUrls: uploadedMediaUrls,
      mediaIds: uploadedMediaIds,
      count: uploadedMediaUrls.length || uploadedMediaIds.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error", success: false },
      { status: 500 }
    );
  }
}
