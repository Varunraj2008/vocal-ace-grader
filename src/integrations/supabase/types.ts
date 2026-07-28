export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          metadata: Json | null
          target: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target?: string | null
        }
        Relationships: []
      }
      analysis_results: {
        Row: {
          accuracy: number | null
          avg_volume: number | null
          cer: number | null
          clarity: number | null
          confidence: number | null
          created_at: string
          details: Json | null
          fluency: number | null
          id: string
          pace: number | null
          peak_volume: number | null
          pronunciation: number | null
          recording_id: string
          silence_ratio: number | null
          voice_quality: number | null
          weighted_score: number | null
          wer: number | null
          wpm: number | null
        }
        Insert: {
          accuracy?: number | null
          avg_volume?: number | null
          cer?: number | null
          clarity?: number | null
          confidence?: number | null
          created_at?: string
          details?: Json | null
          fluency?: number | null
          id?: string
          pace?: number | null
          peak_volume?: number | null
          pronunciation?: number | null
          recording_id: string
          silence_ratio?: number | null
          voice_quality?: number | null
          weighted_score?: number | null
          wer?: number | null
          wpm?: number | null
        }
        Update: {
          accuracy?: number | null
          avg_volume?: number | null
          cer?: number | null
          clarity?: number | null
          confidence?: number | null
          created_at?: string
          details?: Json | null
          fluency?: number | null
          id?: string
          pace?: number | null
          peak_volume?: number | null
          pronunciation?: number | null
          recording_id?: string
          silence_ratio?: number | null
          voice_quality?: number | null
          weighted_score?: number | null
          wer?: number | null
          wpm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_results_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: true
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_sessions: {
        Row: {
          breakdown: Json | null
          completed_at: string | null
          created_at: string
          id: string
          overall_grade: string | null
          overall_score: number | null
          paragraph_easy_id: string | null
          paragraph_hard_id: string | null
          paragraph_medium_id: string | null
          status: string
          strengths: Json | null
          suggestions: Json | null
          user_id: string
          weaknesses: Json | null
        }
        Insert: {
          breakdown?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: string
          overall_grade?: string | null
          overall_score?: number | null
          paragraph_easy_id?: string | null
          paragraph_hard_id?: string | null
          paragraph_medium_id?: string | null
          status?: string
          strengths?: Json | null
          suggestions?: Json | null
          user_id: string
          weaknesses?: Json | null
        }
        Update: {
          breakdown?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: string
          overall_grade?: string | null
          overall_score?: number | null
          paragraph_easy_id?: string | null
          paragraph_hard_id?: string | null
          paragraph_medium_id?: string | null
          status?: string
          strengths?: Json | null
          suggestions?: Json | null
          user_id?: string
          weaknesses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_sessions_paragraph_easy_id_fkey"
            columns: ["paragraph_easy_id"]
            isOneToOne: false
            referencedRelation: "paragraphs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_sessions_paragraph_hard_id_fkey"
            columns: ["paragraph_hard_id"]
            isOneToOne: false
            referencedRelation: "paragraphs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_sessions_paragraph_medium_id_fkey"
            columns: ["paragraph_medium_id"]
            isOneToOne: false
            referencedRelation: "paragraphs"
            referencedColumns: ["id"]
          },
        ]
      }
      paragraphs: {
        Row: {
          category: string
          content: string
          created_at: string
          difficulty: string
          id: string
          word_count: number | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          difficulty: string
          id?: string
          word_count?: number | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          difficulty?: string
          id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          client_metrics: Json | null
          created_at: string
          duration_seconds: number | null
          id: string
          paragraph_id: string
          session_id: string
          slot: number
          storage_path: string
          user_id: string
        }
        Insert: {
          client_metrics?: Json | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          paragraph_id: string
          session_id: string
          slot: number
          storage_path: string
          user_id: string
        }
        Update: {
          client_metrics?: Json | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          paragraph_id?: string
          session_id?: string
          slot?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_paragraph_id_fkey"
            columns: ["paragraph_id"]
            isOneToOne: false
            referencedRelation: "paragraphs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "assessment_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          created_at: string
          id: string
          raw: Json | null
          recording_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          raw?: Json | null
          recording_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          raw?: Json | null
          recording_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: true
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          completed_at: string
          full_name: string
          overall_grade: string
          overall_score: number
          session_id: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "user" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin"],
    },
  },
} as const
