export type LocationSource = "gps" | "ip" | "manual";

export interface ActiveLocation {
  lat: number;
  lng: number;
  label: string;
  source: LocationSource;
  updatedAt: number;
  city?: string;
  country?: string;
}

export interface NominatimResult {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  placeId?: string;
}
