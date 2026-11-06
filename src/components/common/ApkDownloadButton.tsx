import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";
import { apkDownloadEndpoint, prepareApkDownload } from "@/lib/cms/apk-download";

type Props = Pick<ButtonProps, "variant" | "size" | "className"> & {
  url: string;
  fileName?: string | null;
  children: ReactNode;
};

/** Failed preparation stays on the page instead of saving an API error as JSON. */
export function ApkDownloadButton({ url, fileName, children, variant, size, className }: Props) {
  const endpoint = apkDownloadEndpoint(url);
  const key = JSON.stringify([url, fileName]);
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<{ key: string; message: string }>();
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [key],
  );
  const prepare = async () => {
    if (!endpoint || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(key);
    setError(undefined);
    try {
      const download = await prepareApkDownload(endpoint, fileName, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      window.location.assign(download);
    } catch (failure) {
      if (active.current !== controller || controller.signal.aborted) return;
      setError({
        key,
        message:
          failure instanceof Error
            ? failure.message
            : "The APK download is temporarily unavailable. Please try again.",
      });
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(undefined);
      }
    }
  };
  if (!endpoint)
    return (
      <Button asChild variant={variant} size={size} className={className}>
        <a href={url}>{children}</a>
      </Button>
    );
  const preparing = pending === key;
  return (
    <div className="min-w-0 space-y-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={preparing}
        aria-busy={preparing}
        onClick={prepare}
      >
        {preparing ? (
          <>
            <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Preparing download…
          </>
        ) : (
          children
        )}
      </Button>
      {error?.key === key ? (
        <div role="alert" className="max-w-lg space-y-1 text-sm text-destructive">
          <p>{error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={prepare} disabled={preparing}>
            Retry download
          </Button>
        </div>
      ) : null}
    </div>
  );
}
