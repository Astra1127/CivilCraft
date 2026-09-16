import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { imageTypes, maxImageBytes } from "@/lib/cms/content-types";

export function UpdateHeroInput({
  url,
  description,
  file,
  onFile,
  onUrl,
  onRemove,
}: {
  url: string;
  description: string;
  file: File | null;
  onFile: (file: File) => void;
  onUrl: (url: string) => void;
  onRemove: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file && picker.current) picker.current.value = "";
  }, [file]);
  const choose = (next?: File) => {
    if (!next) return;
    if (
      !imageTypes.includes(next.type as (typeof imageTypes)[number]) ||
      !next.size ||
      next.size > maxImageBytes
    ) {
      toast.error("Choose a PNG, JPEG or WebP image up to 4 MB.");
      return;
    }
    onFile(next);
  };
  return (
    <div className="space-y-3">
      <Label htmlFor="update-image-file">Hero image</Label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
        className={`rounded-xl border-2 border-dashed p-5 ${dragging ? "border-gold bg-gold/10" : "border-border bg-secondary/30"}`}
      >
        {url ? (
          <img
            src={url}
            alt={description || "Hero image preview"}
            className="mx-auto max-h-64 max-w-full rounded-lg object-contain"
          />
        ) : (
          <div className="space-y-2 text-center">
            <Upload className="mx-auto h-6 w-6 text-gold" aria-hidden="true" />
            <p className="font-bold">Drop a hero image here</p>
          </div>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground">
          PNG, JPG/JPEG or WebP. Up to 4 MB and 25 megapixels.
        </p>
        <Input
          ref={picker}
          id="update-image-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="mt-3"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        {url ? (
          <div className="mt-3 flex justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => picker.current?.click()}
            >
              Replace image
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onRemove();
                if (picker.current) picker.current.value = "";
              }}
            >
              Remove image
            </Button>
          </div>
        ) : null}
        {file ? (
          <p className="mt-2 break-words text-center text-xs text-muted-foreground">
            {file.name} — uploads when you save the update.
          </p>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Use an image URL instead</summary>
        <Label htmlFor="update-cover" className="mt-3 block">
          HTTPS image URL
        </Label>
        <Input
          id="update-cover"
          type="url"
          maxLength={500}
          value={!file && !url.startsWith("/api/") ? url : ""}
          placeholder="https://"
          onChange={(e) => onUrl(e.target.value)}
        />
      </details>
    </div>
  );
}
