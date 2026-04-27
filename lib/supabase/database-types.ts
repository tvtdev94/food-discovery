/**
 * Minimal Supabase Database type covering our tables.
 * Not auto-generated (no `supabase gen types`). Regenerate once CI wires it up.
 */

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          owner_key: string;
          title: string | null;
          active_location: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_key: string;
          title?: string | null;
          active_location?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          owner_key: string;
          role: string;
          content: string | null;
          tool_calls: Json | null;
          usage: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          owner_key: string;
          role: string;
          content?: string | null;
          tool_calls?: Json | null;
          usage?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      recommendations: {
        Row: {
          id: string;
          message_id: string;
          owner_key: string;
          rank: number;
          place_id: string;
          snapshot: Json;
          why_fits: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          owner_key: string;
          rank: number;
          place_id: string;
          snapshot: Json;
          why_fits?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recommendations"]["Insert"]>;
        Relationships: [];
      };
      favorites: {
        Row: {
          id: string;
          owner_key: string;
          place_id: string;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_key: string;
          place_id: string;
          snapshot: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["favorites"]["Insert"]>;
        Relationships: [];
      };
      preferences: {
        Row: {
          owner_key: string;
          context: Json;
          updated_at: string;
        };
        Insert: {
          owner_key: string;
          context?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["preferences"]["Insert"]>;
        Relationships: [];
      };
      places_cache: {
        Row: {
          cache_key: string;
          payload: Json;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          cache_key: string;
          payload: Json;
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["places_cache"]["Insert"]>;
        Relationships: [];
      };
      usage_log: {
        Row: {
          id: string;
          ts: string;
          owner_key: string | null;
          conversation_id: string | null;
          model: string | null;
          input_tokens: number;
          output_tokens: number;
          tool_calls_count: number;
          places_calls: number;
          cache_hits: number;
          duration_ms: number;
          error_code: string | null;
        };
        Insert: {
          id?: string;
          ts?: string;
          owner_key?: string | null;
          conversation_id?: string | null;
          model?: string | null;
          input_tokens?: number;
          output_tokens?: number;
          tool_calls_count?: number;
          places_calls?: number;
          cache_hits?: number;
          duration_ms?: number;
          error_code?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["usage_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
