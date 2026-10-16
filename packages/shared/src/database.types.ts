// Generated from Supabase project `kpop-covers` (pevbjaowyctqqldvzovz).
// Regenerate with the Supabase MCP `generate_typescript_types` or `supabase gen types typescript`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      bag_draws: {
        Row: {
          bag_id: string;
          crew_id: string;
          drawn_at: string;
          id: string;
          item_id: string | null;
          label: string;
          member_id: string | null;
          removed: boolean;
          seq: number;
        };
        Insert: {
          bag_id: string;
          crew_id?: string;
          drawn_at?: string;
          id?: string;
          item_id?: string | null;
          label: string;
          member_id?: string | null;
          removed?: boolean;
          seq?: never;
        };
        Update: {
          bag_id?: string;
          crew_id?: string;
          drawn_at?: string;
          id?: string;
          item_id?: string | null;
          label?: string;
          member_id?: string | null;
          removed?: boolean;
          seq?: never;
        };
        Relationships: [
          {
            foreignKeyName: 'bag_draws_bag_id_fkey';
            columns: ['bag_id'];
            isOneToOne: false;
            referencedRelation: 'bags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bag_draws_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bag_draws_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'bag_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bag_draws_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      bag_items: {
        Row: {
          archived_at: string | null;
          bag_id: string;
          clip_id: string | null;
          created_at: string;
          crew_id: string;
          id: string;
          member_id: string | null;
          removed_at: string | null;
          video_id: string | null;
        };
        Insert: {
          archived_at?: string | null;
          bag_id: string;
          clip_id?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          member_id?: string | null;
          removed_at?: string | null;
          video_id?: string | null;
        };
        Update: {
          archived_at?: string | null;
          bag_id?: string;
          clip_id?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          member_id?: string | null;
          removed_at?: string | null;
          video_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bag_items_bag_id_fkey';
            columns: ['bag_id'];
            isOneToOne: false;
            referencedRelation: 'bags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bag_items_clip_id_fkey';
            columns: ['clip_id'];
            isOneToOne: false;
            referencedRelation: 'clips';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bag_items_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bag_items_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bag_items_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      bags: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          draw_mode: string;
          id: string;
          kind: string;
          name: string;
          no_repeat: boolean;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          draw_mode?: string;
          id?: string;
          kind: string;
          name: string;
          no_repeat?: boolean;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          draw_mode?: string;
          id?: string;
          kind?: string;
          name?: string;
          no_repeat?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'bags_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
        ];
      };
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
          take_id: string | null;
          take_seconds: number | null;
          category: string | null;
          for_member_id: string | null;
          status: string;
          sketch: string | null;
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
          take_id?: string | null;
          take_seconds?: number | null;
          category?: string | null;
          for_member_id?: string | null;
          status?: string;
          sketch?: string | null;
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
          take_id?: string | null;
          take_seconds?: number | null;
          category?: string | null;
          for_member_id?: string | null;
          status?: string;
          sketch?: string | null;
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
          sync_adjust_seconds: number;
          fit_scale: number;
          fit_x: number;
          fit_y: number;
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
          sync_adjust_seconds?: number;
          fit_scale?: number;
          fit_x?: number;
          fit_y?: number;
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
          sync_adjust_seconds?: number;
          fit_scale?: number;
          fit_x?: number;
          fit_y?: number;
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
      track_items: {
        Row: {
          archived_at: string | null;
          clip_id: string;
          created_at: string;
          crew_id: string;
          id: string;
          position: number;
          track_id: string;
        };
        Insert: {
          archived_at?: string | null;
          clip_id: string;
          created_at?: string;
          crew_id?: string;
          id?: string;
          position: number;
          track_id: string;
        };
        Update: {
          archived_at?: string | null;
          clip_id?: string;
          created_at?: string;
          crew_id?: string;
          id?: string;
          position?: number;
          track_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'track_items_clip_id_fkey';
            columns: ['clip_id'];
            isOneToOne: false;
            referencedRelation: 'clips';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'track_items_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'track_items_track_id_fkey';
            columns: ['track_id'];
            isOneToOne: false;
            referencedRelation: 'tracks';
            referencedColumns: ['id'];
          },
        ];
      };
      tracks: {
        Row: {
          archived_at: string | null;
          countdown: boolean;
          created_at: string;
          crew_id: string;
          id: string;
          name: string;
          pause_seconds: number;
          title_mode: string;
          updated_at: string;
          use_clip_settings: boolean;
        };
        Insert: {
          archived_at?: string | null;
          countdown?: boolean;
          created_at?: string;
          crew_id?: string;
          id?: string;
          name: string;
          pause_seconds?: number;
          title_mode?: string;
          updated_at?: string;
          use_clip_settings?: boolean;
        };
        Update: {
          archived_at?: string | null;
          countdown?: boolean;
          created_at?: string;
          crew_id?: string;
          id?: string;
          name?: string;
          pause_seconds?: number;
          title_mode?: string;
          updated_at?: string;
          use_clip_settings?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'tracks_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
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
      draw_from_bag: {
        Args: { p_bag: string; p_count?: number; p_member?: string | null; p_remove?: boolean | null };
        Returns: {
          bag_id: string;
          crew_id: string;
          drawn_at: string;
          id: string;
          item_id: string | null;
          label: string;
          member_id: string | null;
          removed: boolean;
          seq: number;
        }[];
        SetofOptions: {
          from: '*';
          to: 'bag_draws';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
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
