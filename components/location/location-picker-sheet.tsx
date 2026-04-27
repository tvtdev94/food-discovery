"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, AlertCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useActiveLocation, getOrCreateDeviceId } from "@/hooks/use-active-location";
import type { NominatimResult } from "@/lib/location/types";

interface LocationPickerSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function LocationPickerSheet({ open, onOpenChange }: LocationPickerSheetProps) {
  const { setLocation, tryGeolocate, status } = useActiveLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSearchError(null);
    }
  }, [open]);

  // Debounced search — 400ms, min 3 chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setSearchError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(
          `/api/location/search?q=${encodeURIComponent(trimmed)}`,
          { headers: { "x-device-id": deviceId } },
        );
        if (res.status === 429) {
          setSearchError("Tìm kiếm quá nhanh, vui lòng thử lại sau 1 giây.");
          return;
        }
        if (!res.ok) {
          setSearchError("Không thể tìm kiếm, thử lại sau.");
          return;
        }
        const data = await res.json() as { results?: NominatimResult[] };
        setResults(data.results ?? []);
        if ((data.results ?? []).length === 0) {
          setSearchError("Không tìm thấy địa điểm phù hợp.");
        }
      } catch {
        setSearchError("Lỗi kết nối. Vui lòng thử lại.");
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(item: NominatimResult) {
    setLocation({ ...item, source: "manual", updatedAt: Date.now() });
    onOpenChange(false);
  }

  async function handleUseCurrentLocation() {
    await tryGeolocate();
    // Close if GPS succeeded (status becomes "ready" inside the hook)
    if (useActiveLocation.getState().status === "ready") {
      onOpenChange(false);
    }
  }

  const isGpsRequesting = status === "requesting";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-safe">
        <SheetHeader className="mb-4">
          <SheetTitle>Chọn địa điểm</SheetTitle>
        </SheetHeader>

        {/* Use current location button */}
        <Button
          variant="outline"
          className="mb-4 w-full"
          onClick={handleUseCurrentLocation}
          disabled={isGpsRequesting}
        >
          {isGpsRequesting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="mr-2 h-4 w-4 text-orange-500" />
          )}
          {isGpsRequesting ? "Đang lấy vị trí…" : "Dùng vị trí hiện tại"}
        </Button>

        {/* Search input */}
        <div className="relative mb-2">
          <Input
            placeholder="Nhập tên quận, thành phố…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Error state */}
        {searchError && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {searchError}
          </div>
        )}

        {/* Results list */}
        {results.length > 0 && (
          <ul className="divide-y divide-border rounded-md border" role="listbox">
            {results.map((item, idx) => (
              <li key={item.placeId ?? idx}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleSelect(item)}
                  className="flex min-h-[44px] w-full flex-col items-start px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-sm font-medium leading-snug">{item.label}</span>
                  {item.city && (
                    <span className="text-xs text-muted-foreground">{item.city}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
