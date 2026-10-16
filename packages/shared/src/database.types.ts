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
          archived_at: string | null;
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
          archived_at?: string | null;
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
          archived_at?: string | null;
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
          created_by: string | null;
          id: string;
          invite_code: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invite_code?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invite_code?: string;
          name?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          archived_at: string | null;
          color: string;
          created_at: string;
          crew_id: string;
          id: string;
          name: string;
        };
        Insert: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          crew_id?: string;
          id?: string;
          name: string;
        };
        Update: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          crew_id?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'members_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
        ];
      };
      notes: {
        Row: {
          at_seconds: number;
          author_member_id: string | null;
          body: string;
          created_at: string;
          archived_at: string | null;
          created_by: string | null;
          crew_id: string;
          id: string;
          updated_at: string;
          video_id: string;
        };
        Insert: {
          at_seconds: number;
          author_member_id?: string | null;
          body: string;
          created_at?: string;
          archived_at?: string | null;
          created_by?: string | null;
          crew_id: string;
          id?: string;
          updated_at?: string;
          video_id: string;
        };
        Update: {
          at_seconds?: number;
          author_member_id?: string | null;
          body?: string;
          created_at?: string;
          archived_at?: string | null;
          created_by?: string | null;
          crew_id?: string;
          id?: string;
          updated_at?: string;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notes_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notes_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
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
      takes: {
        Row: {
          archived_at: string | null;
          clip_id: string | null;
          created_at: string;
          crew_id: string;
          device_id: string | null;
          duration_seconds: number;
          file_name: string | null;
          height: number | null;
          id: string;
          is_best: boolean;
          member_id: string | null;
          mime_type: string | null;
          mirrored: boolean;
          recorded_at: string;
          shared_path: string | null;
          shared_size: number | null;
          song_end_seconds: number | null;
          song_start_seconds: number;
          speed: number;
          video_id: string;
          width: number | null;
        };
        Insert: {
          archived_at?: string | null;
          clip_id?: string | null;
          created_at?: string;
          crew_id?: string;
          device_id?: string | null;
          duration_seconds?: number;
          file_name?: string | null;
          height?: number | null;
          id: string;
          is_best?: boolean;
          member_id?: string | null;
          mime_type?: string | null;
          mirrored?: boolean;
          recorded_at?: string;
          shared_path?: string | null;
          shared_size?: number | null;
          song_end_seconds?: number | null;
          song_start_seconds: number;
          speed?: number;
          video_id: string;
          width?: number | null;
        };
        Update: {
          archived_at?: string | null;
          clip_id?: string | null;
          created_at?: string;
          crew_id?: string;
          device_id?: string | null;
          duration_seconds?: number;
          file_name?: string | null;
          height?: number | null;
          id?: string;
          is_best?: boolean;
          member_id?: string | null;
          mime_type?: string | null;
          mirrored?: boolean;
          recorded_at?: string;
          shared_path?: string | null;
          shared_size?: number | null;
          song_end_seconds?: number | null;
          song_start_seconds?: number;
          speed?: number;
          video_id?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'takes_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'takes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'takes_clip_id_fkey';
            columns: ['clip_id'];
            isOneToOne: false;
            referencedRelation: 'clips';
            referencedColumns: ['id'];
          },
        ];
      };
      videos: {
        Row: {
          artist: string | null;
          created_at: string;
          archived_at: string | null;
          created_by: string | null;
          crew_id: string;
          duration_seconds: number | null;
          file_duration_seconds: number | null;
          file_name: string | null;
          file_offset_seconds: number | null;
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
          archived_at?: string | null;
          created_by?: string | null;
          crew_id: string;
          duration_seconds?: number | null;
          file_duration_seconds?: number | null;
          file_name?: string | null;
          file_offset_seconds?: number | null;
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
          archived_at?: string | null;
          created_by?: string | null;
          crew_id?: string;
          duration_seconds?: number | null;
          file_duration_seconds?: number | null;
          file_name?: string | null;
          file_offset_seconds?: number | null;
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
      storage_usage: {
        Args: never;
        Returns: Json;
      };
      join_group: {
        Args: never;
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
