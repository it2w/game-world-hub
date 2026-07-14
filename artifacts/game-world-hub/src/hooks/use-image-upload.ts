import { useState } from "react";
import { useRequestUploadUrl } from "@workspace/api-client-react";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Uploads an image straight to object storage:
 * asks the API for a presigned URL, PUTs the file to it, and returns the
 * stored object path to save on the profile/photo record.
 */
export function useImageUpload() {
  const requestUrl = useRequestUploadUrl();
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
      const resp = await requestUrl.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      const put = await fetch(resp.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) {
        throw new Error("Upload failed — try again");
      }
      return resp.objectPath;
    } finally {
      setIsUploading(false);
    }
  };

  return { upload, isUploading };
}
