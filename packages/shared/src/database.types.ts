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
          wish_id: string | null;
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
          wish_id?: string | null;
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
          wish_id?: string | null;
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
          {
            foreignKeyName: 'bag_items_wish_id_fkey';
            columns: ['wish_id'];
            isOneToOne: false;
            referencedRelation: 'wishes';
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
          follow_path_id: string | null;
          id: string;
          is_pinned: boolean;
          mirrored: boolean;
          name: string;
          speed: number;
          start_seconds: number;
          video_id: string;
          zoom_scale: number;
          zoom_x: number;
          zoom_y: number;
        };
        Insert: {
          color?: string;
          created_at?: string;
          archived_at?: string | null;
          created_by?: string | null;
          crew_id: string;
          end_seconds: number;
          follow_path_id?: string | null;
          id?: string;
          is_pinned?: boolean;
          mirrored?: boolean;
          name: string;
          speed?: number;
          start_seconds: number;
          video_id: string;
          zoom_scale?: number;
          zoom_x?: number;
          zoom_y?: number;
        };
        Update: {
          color?: string;
          created_at?: string;
          archived_at?: string | null;
          created_by?: string | null;
          crew_id?: string;
          end_seconds?: number;
          follow_path_id?: string | null;
          id?: string;
          is_pinned?: boolean;
          mirrored?: boolean;
          name?: string;
          speed?: number;
          start_seconds?: number;
          video_id?: string;
          zoom_scale?: number;
          zoom_x?: number;
          zoom_y?: number;
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
            foreignKeyName: 'clips_follow_path_id_fkey';
            columns: ['follow_path_id'];
            isOneToOne: false;
            referencedRelation: 'follow_paths';
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
      event_songs: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          event_id: string;
          id: string;
          position: number;
          video_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          event_id: string;
          id?: string;
          position?: number;
          video_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          event_id?: string;
          id?: string;
          position?: number;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_songs_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_songs_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_songs_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          id: string;
          name: string;
          place: string | null;
          starts_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          name: string;
          place?: string | null;
          starts_at: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          name?: string;
          place?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
        ];
      };
      follow_paths: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          id: string;
          keyframes: Json;
          label: string;
          member_id: string | null;
          model: string | null;
          source: string;
          updated_at: string;
          video_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          keyframes?: Json;
          label: string;
          member_id?: string | null;
          model?: string | null;
          source?: string;
          updated_at?: string;
          video_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          keyframes?: Json;
          label?: string;
          member_id?: string | null;
          model?: string | null;
          source?: string;
          updated_at?: string;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'follow_paths_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follow_paths_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follow_paths_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
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
      poll_options: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          id: string;
          poll_id: string;
          wish_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          poll_id: string;
          wish_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          poll_id?: string;
          wish_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'poll_options_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'poll_options_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'poll_options_wish_id_fkey';
            columns: ['wish_id'];
            isOneToOne: false;
            referencedRelation: 'wishes';
            referencedColumns: ['id'];
          },
        ];
      };
      poll_votes: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          id: string;
          member_id: string;
          option_id: string;
          poll_id: string;
          rank: number | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          member_id: string;
          option_id: string;
          poll_id: string;
          rank?: number | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          member_id?: string;
          option_id?: string;
          poll_id?: string;
          rank?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'poll_votes_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'poll_votes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'poll_votes_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: false;
            referencedRelation: 'poll_options';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'poll_votes_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          },
        ];
      };
      polls: {
        Row: {
          anonymous: boolean;
          archived_at: string | null;
          closed_at: string | null;
          closes_at: string | null;
          created_at: string;
          created_by_member_id: string | null;
          crew_id: string;
          id: string;
          parent_poll_id: string | null;
          results_live: boolean;
          title: string;
          vote_type: string;
          winner_wish_id: string | null;
        };
        Insert: {
          anonymous?: boolean;
          archived_at?: string | null;
          closed_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
          created_by_member_id?: string | null;
          crew_id?: string;
          id?: string;
          parent_poll_id?: string | null;
          results_live?: boolean;
          title: string;
          vote_type: string;
          winner_wish_id?: string | null;
        };
        Update: {
          anonymous?: boolean;
          archived_at?: string | null;
          closed_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
          created_by_member_id?: string | null;
          crew_id?: string;
          id?: string;
          parent_poll_id?: string | null;
          results_live?: boolean;
          title?: string;
          vote_type?: string;
          winner_wish_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'polls_created_by_member_id_fkey';
            columns: ['created_by_member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polls_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polls_parent_poll_id_fkey';
            columns: ['parent_poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polls_winner_wish_id_fkey';
            columns: ['winner_wish_id'];
            isOneToOne: false;
            referencedRelation: 'wishes';
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
      take_reactions: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          emoji: string;
          id: string;
          member_id: string | null;
          take_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          emoji: string;
          id?: string;
          member_id?: string | null;
          take_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          emoji?: string;
          id?: string;
          member_id?: string | null;
          take_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'take_reactions_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'take_reactions_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'take_reactions_take_id_fkey';
            columns: ['take_id'];
            isOneToOne: false;
            referencedRelation: 'takes';
            referencedColumns: ['id'];
          },
        ];
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
      wish_interest: {
        Row: {
          archived_at: string | null;
          created_at: string;
          crew_id: string;
          id: string;
          member_id: string;
          wish_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          member_id: string;
          wish_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          crew_id?: string;
          id?: string;
          member_id?: string;
          wish_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wish_interest_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wish_interest_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wish_interest_wish_id_fkey';
            columns: ['wish_id'];
            isOneToOne: false;
            referencedRelation: 'wishes';
            referencedColumns: ['id'];
          },
        ];
      };
      wishes: {
        Row: {
          added_video_id: string | null;
          archived_at: string | null;
          artist: string | null;
          comment: string | null;
          created_at: string;
          crew_id: string;
          difficulty: string | null;
          id: string;
          members_count: number | null;
          proposed_by_member_id: string | null;
          thumbnail_url: string | null;
          title: string;
          youtube_id: string;
        };
        Insert: {
          added_video_id?: string | null;
          archived_at?: string | null;
          artist?: string | null;
          comment?: string | null;
          created_at?: string;
          crew_id?: string;
          difficulty?: string | null;
          id?: string;
          members_count?: number | null;
          proposed_by_member_id?: string | null;
          thumbnail_url?: string | null;
          title: string;
          youtube_id: string;
        };
        Update: {
          added_video_id?: string | null;
          archived_at?: string | null;
          artist?: string | null;
          comment?: string | null;
          created_at?: string;
          crew_id?: string;
          difficulty?: string | null;
          id?: string;
          members_count?: number | null;
          proposed_by_member_id?: string | null;
          thumbnail_url?: string | null;
          title?: string;
          youtube_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wishes_added_video_id_fkey';
            columns: ['added_video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wishes_crew_id_fkey';
            columns: ['crew_id'];
            isOneToOne: false;
            referencedRelation: 'crews';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wishes_proposed_by_member_id_fkey';
            columns: ['proposed_by_member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cast_vote: {
        Args: { p_member: string; p_options: string[]; p_poll: string };
        Returns: number;
      };
      close_poll: {
        Args: { p_poll: string; p_resolve?: string; p_winner?: string | null };
        Returns: Json;
      };
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
