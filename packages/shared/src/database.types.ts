// Generated from Supabase project `kpop-covers` (pevbjaowyctqqldvzovz).
// Regenerate with the Supabase MCP `generate_typescript_types` or `supabase gen types typescript`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      clips: {
        Row: {
          color: string;
          created_at: string;
          created_by: string | null;
          crew_id: string;
          end_seconds: number;
          id: string;
          is_pinned: boolean;
          mirrored: boolean;
          name: string;
          speed: number;
          start_seconds: number;
          video_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          crew_id: string;
          end_seconds: number;
          id?: string;
          is_pinned?: boolean;
          mirrored?: boolean;
          name: string;
          speed?: number;
          start_seconds: number;
          video_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          crew_id?: string;
          end_seconds?: number;
          id?: string;
          is_pinned?: boolean;
          mirrored?: boolean;
          name?: string;
          speed?: number;
          start_seconds?: number;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clips_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clips_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      crew_members: {
        Row: {
          crew_id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          crew_id: string;
          joined_at?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          crew_id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'crew_members_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
        ];
      };
      crews: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          invite_code: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          invite_code?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          invite_code?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_hue: number;
          created_at: string;
          display_name: string;
          id: string;
        };
        Insert: {
          avatar_hue?: number;
          created_at?: string;
          display_name: string;
          id: string;
        };
        Update: {
          avatar_hue?: number;
          created_at?: string;
          display_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          artist: string | null;
          created_at: string;
          created_by: string | null;
          crew_id: string;
          duration_seconds: number | null;
          file_name: string | null;
          file_size: number | null;
          id: string;
          source: string;
          storage_path: string | null;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
          youtube_id: string | null;
        };
        Insert: {
          artist?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id: string;
          duration_seconds?: number | null;
          file_name?: string | null;
          file_size?: number | null;
          id?: string;
          source: string;
          storage_path?: string | null;
          thumbnail_url?: string | null;
          title: string;
          updated_at?: string;
          youtube_id?: string | null;
        };
        Update: {
          artist?: string | null;
          created_at?: string;
          created_by?: string | null;
          crew_id?: string;
          duration_seconds?: number | null;
          file_name?: string | null;
          file_size?: number | null;
          id?: string;
          source?: string;
          storage_path?: string | null;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
          youtube_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'videos_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_crew: {
        Args: { p_name: string };
        Returns: {
          created_at: string;
          created_by: string;
          id: string;
          invite_code: string;
          name: string;
        };
        SetofOptions: {
          from: '*';
          to: 'crews';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      join_crew: {
        Args: { p_code: string };
        Returns: {
          created_at: string;
          created_by: string;
          id: string;
          invite_code: string;
          name: string;
        };
        SetofOptions: {
          from: '*';
          to: 'crews';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
