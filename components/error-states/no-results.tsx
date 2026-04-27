"use client";

interface NoResultsProps {
  onRetry?: () => void;
}

/**
 * Shown when the API returns zero restaurant candidates for the current area.
 */
export function NoResults({ onRetry }: NoResultsProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <p className="text-sm text-muted-foreground">
        Khu này chưa có quán hợp ý 🥲 Đổi chút nha?
      </p>
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
