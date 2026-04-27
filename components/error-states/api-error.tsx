"use client";

interface ApiErrorProps {
  onRetry?: () => void;
}

/**
 * Generic API / internal server error state (5xx, internal code, timeout).
 */
export function ApiError({ onRetry }: ApiErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <p className="text-sm text-muted-foreground">Não mình hơi đờ. Thử gõ lại nha.</p>
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
