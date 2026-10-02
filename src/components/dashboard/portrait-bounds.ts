export interface PortraitBounds {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** Measure visible pixels for layout only; the original PNG remains the image source. */
export function portraitBounds(image: HTMLImageElement): PortraitBounds | undefined {
  try {
    const ratio = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width,
      right = -1,
      top = canvas.height,
      bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3]! > 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    if (right < left) return;
    // Retain a small guard around antialiased edges and thin accessories.
    left = Math.max(0, left - 2);
    right = Math.min(canvas.width - 1, right + 2);
    top = Math.max(0, top - 2);
    bottom = Math.min(canvas.height - 1, bottom + 2);
    return {
      width: (right - left + 1) / canvas.width,
      height: (bottom - top + 1) / canvas.height,
      centerX: (left + right + 1) / (2 * canvas.width),
      centerY: (top + bottom + 1) / (2 * canvas.height),
    };
  } catch {
    // Cross-origin compatibility images can deny pixel access; retain contain sizing.
    return;
  }
}
