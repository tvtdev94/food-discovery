export type Weather = {
  tempC: number;
  condition: string;
  rainProbPct: number;
  isDay: boolean;
  ts: number;
};

export type Place = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  reviews: number | null;
  priceLevel: 1 | 2 | 3 | 4 | null;
  types: string[];
  openNow: boolean | null;
  mapsUri: string;
  phone?: string;
  thumbnail?: string;
};

export type FilterOpts = {
  minRating?: number;
  minReviews?: number;
  openNow?: boolean;
};
