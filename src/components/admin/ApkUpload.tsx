import { CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_APK_BYTES, validateApkSelection } from "@/lib/cms/apk";
import { formatBytes } from "@/lib/cms/store";
import type { Release } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

type UploadStatus = "idle" | "uploading" | "verifying" | "complete" | "failed";

export function ApkUpload({
  release,
  disabled = false,
  onUpload,
}: {
  release: Release;
  disabled?: boolean;
  onUpload: (file: File, onProgress: (percentage: number) => void) => Promise<void>;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const uploading = status === "uploading" || status === "verifying";
  const locked = disabled || uploading;

  const selectFiles = (files: FileList | null) => {
    if (locked) return;
    setStatus("idle");
    setProgress(0);
    setError(null);
    setFile(null);
    setFileName("");
    try {
      if (!files || files.length !== 1) throw new Error("Choose one APK file at a time.");
      const selected = files[0];
      if (!selected) throw new Error("Choose an APK file.");
      const normalizedName = validateApkSelection(selected);
      setFile(selected);
      setFileName(normalizedName);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error ? selectionError.message : "Choose a valid APK file.",
      );
    }
  };

  const upload = async () => {
    if (!file || locked) return;
    setError(null);
    setProgress(0);
    setStatus("uploading");
    try {
      await onUpload(file, (percentage) => {
        if (!Number.isFinite(percentage)) return;
        const value = Math.min(100, Math.max(0, Math.round(percentage)));
        setProgress(value);
        setStatus(value === 100 ? "verifying" : "uploading");
      });
      setProgress(100);
      setStatus("complete");
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (uploadError) {
      setStatus("failed");
      setError(
        uploadError instanceof Error ? uploadError.message : "APK upload failed. Try again.",
      );
    }
  };

  return (
    <section className="space-y-3 rounded-xl border-2 border-border bg-secondary/20 p-3">
      <div className="space-y-1">
        <h3 className="text-sm font-bold">{release.apkHosted ? "Replace APK" : "Upload APK"}</h3>
        <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
          Select one .apk file, up to {formatBytes(MAX_APK_BYTES)}. The saved download changes after
          the upload is verified.
        </p>
      </div>

      {release.fileUrl ? (
        <div className="space-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs">
          <p className="font-bold">
            {release.apkHosted ? "Uploaded APK" : "Existing download"}: {release.fileName ?? "APK"}
            {release.fileSizeBytes !== null ? ` · ${formatBytes(release.fileSizeBytes)}` : ""}
          </p>
          <p className="break-all text-muted-foreground">{release.fileUrl}</p>
          {release.apkHosted ? (
            <a
              href={`/api/admin/releases/${encodeURIComponent(release.id)}/download`}
              download
              className="inline-block font-semibold text-gold underline underline-offset-2"
            >
              Preview APK download
            </a>
          ) : null}
        </div>
      ) : null}

      <input
        ref={input}
        id={inputId}
        type="file"
        accept=".apk"
        hidden
        disabled={locked}
        onChange={(event) => {
          selectFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={locked}
        aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ""}`}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          dragging && !locked ? "border-gold bg-gold/10" : "border-border hover:bg-secondary/50",
        )}
        onClick={() => input.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (locked) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = locked ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          selectFiles(event.dataTransfer.files);
        }}
      >
        <FileUp className="mb-1 h-5 w-5 text-gold" aria-hidden="true" />
        <span className="font-bold">Drop an APK here or choose a file</span>
        <span className="text-xs text-muted-foreground">
          Click, or press Enter or Space to browse
        </span>
      </button>

      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="min-w-0 break-all">
            <span className="font-bold">Selected:</span> {fileName} · {formatBytes(file.size)}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="gold" disabled={locked} onClick={upload}>
              {uploading ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              {status === "verifying"
                ? "Verifying…"
                : status === "uploading"
                  ? "Uploading…"
                  : status === "failed"
                    ? "Retry upload"
                    : "Upload APK"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={locked}
              onClick={() => {
                setFile(null);
                setFileName("");
                setError(null);
                setStatus("idle");
                setProgress(0);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {uploading ? (
        <div className="space-y-1.5" aria-live="polite" aria-atomic="true">
          <p className="text-xs font-bold">
            {status === "verifying"
              ? "Upload sent. Verifying the APK and saving its download…"
              : progress === 0
                ? "Preparing and uploading the APK…"
                : `Uploading APK: ${progress}%`}
          </p>
          <div
            role="progressbar"
            aria-label="APK upload"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={
              status === "verifying" ? "100 percent uploaded; verifying" : `${progress}%`
            }
            className="h-2 overflow-hidden rounded-full bg-secondary"
          >
            <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
      {status === "complete" ? (
        <p role="status" className="flex items-center gap-2 text-xs font-bold text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          APK verified and attached to this build.
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
