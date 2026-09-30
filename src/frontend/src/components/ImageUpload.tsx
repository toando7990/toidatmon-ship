// ImageUpload — client-side dish image processing with canvas.
// Resizes to max 800x800 keeping aspect ratio, converts to JPEG quality 85,
// and steps quality down until the result is under 2 MB. Emits a ProcessedImage
// (raw JPEG bytes + dataUrl preview) via onChange. No VPS /upload call.
// Used by MenuItemForm.

import { cn } from "@/lib/utils";
import type { ProcessedImage } from "@/types";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

interface ImageUploadProps {
  /** Current processed image (controlled). null = no image. */
  value: ProcessedImage | null;
  /** Callback with the newly processed image, or null when cleared. */
  onChange: (image: ProcessedImage | null) => void;
  /** Optional disabled state (e.g. while parent form is submitting). */
  disabled?: boolean;
  /** Optional aria label override. */
  label?: string;
}

const MAX_DIMENSION = 800; // max width/height, keeping aspect ratio
const JPEG_QUALITY = 0.85; // initial JPEG quality
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB hard cap
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

// Load a File into an HTMLImageElement via object URL.
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh."));
    };
    img.src = url;
  });
}

// Draw the image onto a canvas resized to at most MAX_DIMENSION on the longest
// side, keeping aspect ratio. Returns the canvas.
function drawScaled(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

// Encode the canvas to JPEG bytes, stepping quality down until under MAX_BYTES.
async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  let quality = JPEG_QUALITY;
  // Try progressively lower quality; bail out at a floor to avoid an infinite loop.
  while (quality >= 0.4) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= MAX_BYTES) {
      return new Uint8Array(await blob.arrayBuffer());
    }
    quality -= 0.1;
  }
  throw new Error("Không thể nén ảnh xuống dưới 2 MB.");
}

// Process a selected File into a ProcessedImage (bytes + dataUrl preview).
async function processFile(file: File): Promise<ProcessedImage> {
  const img = await loadImage(file);
  const canvas = drawScaled(img);
  const bytes = await encodeJpeg(canvas);
  const blob = new Blob([bytes as BlobPart], { type: "image/jpeg" });
  const dataUrl = URL.createObjectURL(blob);
  return { bytes, dataUrl, sizeBytes: bytes.length };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImageUpload({
  value,
  onChange,
  disabled = false,
  label = "Ảnh món",
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const previewSrc = value?.dataUrl ?? null;
  const hasImage = !!previewSrc;

  async function handleFile(file: File) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Định dạng ảnh không hỗ trợ", {
        description: "Chấp nhận JPG, PNG, WebP.",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const processed = await processFile(file);
      onChange(processed);
      toast.success("Ảnh đã xử lý", {
        description: `${formatBytes(processed.sizeBytes)} · JPEG 800×800 tối đa.`,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Xử lý ảnh thất bại. Vui lòng thử lại.";
      toast.error("Xử lý ảnh thất bại", { description: message });
    } finally {
      setIsProcessing(false);
      // Reset input so the same file can be re-selected.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || isProcessing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function handleClear() {
    if (value?.dataUrl) URL.revokeObjectURL(value.dataUrl);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2" data-ocid="image_upload">
      <span className="text-sm font-medium leading-none select-none">
        {label}
      </span>

      <div className="flex items-start gap-4">
        {/* Preview / dropzone */}
        <div
          data-ocid="image_upload.dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !isProcessing) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 transition-smooth",
            dragOver ? "border-primary ring-2 ring-ring/40" : "border-input",
            disabled && "opacity-60",
          )}
        >
          {hasImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Xem trước ảnh món"
                className="h-full w-full object-cover"
                data-ocid="image_upload.preview"
              />
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 px-2 text-center text-muted-foreground">
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-6 w-6" />
              )}
              <span className="text-[11px] leading-tight">
                {isProcessing ? "Đang xử lý…" : "Chưa có ảnh"}
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED.join(",")}
            disabled={disabled || isProcessing}
            onChange={handleInputChange}
            className="sr-only"
            data-ocid="image_upload.input"
          />
          <label
            htmlFor={inputId}
            className={cn(
              "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-smooth hover:bg-accent hover:text-accent-foreground",
              (disabled || isProcessing) && "pointer-events-none opacity-50",
            )}
            data-ocid="image_upload.upload_button"
          >
            <UploadCloud className="h-4 w-4" />
            {hasImage ? "Đổi ảnh" : "Chọn ảnh"}
          </label>

          {hasImage && !isProcessing && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive transition-smooth hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
              data-ocid="image_upload.clear_button"
            >
              <Trash2 className="h-4 w-4" />
              Xóa ảnh
            </button>
          )}

          {value && (
            <p
              className="font-mono text-[11px] text-muted-foreground"
              data-ocid="image_upload.size"
            >
              {formatBytes(value.sizeBytes)}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Kéo thả hoặc chọn ảnh. Tự động nén về JPEG tối đa 800×800, dưới 2
            MB.
          </p>
        </div>
      </div>
    </div>
  );
}
