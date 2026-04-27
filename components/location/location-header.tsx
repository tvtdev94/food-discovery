"use client";

import { useEffect, useState } from "react";
import { LocationChip } from "@/components/location/location-chip";
import { LocationPickerSheet } from "@/components/location/location-picker-sheet";
import { useActiveLocation } from "@/hooks/use-active-location";

/**
 * Location chip + picker sheet. Hydrates from localStorage and kicks off
 * browser permission flow if no saved location. Parent places this inline
 * in the header row; layout concerns (safe-area, padding) live on the shell.
 */
export function LocationHeader() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { init, requestPermissionFlow, status } = useActiveLocation();

  useEffect(() => {
    init();
    if (useActiveLocation.getState().status !== "ready") {
      requestPermissionFlow();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-status={status} className="shrink-0">
      <LocationChip onClick={() => setSheetOpen(true)} />
      <LocationPickerSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
