import { useState } from "react";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Uploads an image directly to the API server (stored in PostgreSQL).
 * Returns the stored objectPath (e.g. "/images/<uuid>") to save on the
 * profile / photo record.
 */
export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files can be uploaded");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("Image is too large (max 8 MB)");
    }
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);

      const resp = await fetch("/api/images", {
        method: "POST",
        body: form,
        credentials: "include",
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Upload failed (${resp.status})`
        );
      }

      const { objectPath } = (await resp.json()) as { objectPath: string };
      return objectPath;
    } finally {
      setIsUploading(false);
    }
  };

  return { upload, isUploading };
}
