"use client";

interface NetworkErrorProps {
  onRetry?: () => void;
}

/**
 * Shown when a fetch/network error occurs (no response from server).
 */
export function NetworkError({ onRetry }: NetworkErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <p className="text-sm text-muted-foreground">Mất mạng rồi 😅. Thử lại.</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}
