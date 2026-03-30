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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string | null
          document_id: string
          id: string
          metadata: Json | null
          page_number: number | null
          user_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string | null
          document_id: string
          id?: string
          metadata?: Json | null
          page_number?: number | null
          user_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string | null
          document_id?: string
          id?: string
          metadata?: Json | null
          page_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          chunk_count: number | null
          content: string | null
          created_at: string | null
          file_path: string | null
          file_type: string
          id: string
          source_url: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chunk_count?: number | null
          content?: string | null
          created_at?: string | null
          file_path?: string | null
          file_type?: string
          id?: string
          source_url?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chunk_count?: number | null
          content?: string | null
          created_at?: string | null
          file_path?: string | null
          file_type?: string
          id?: string
          source_url?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      flashcard_stats: {
        Row: {
          completed_count: number
          document_id: string | null
          id: string
          revisit_count: number
          updated_at: string
          user_id: string
          viewed_count: number
        }
        Insert: {
          completed_count?: number
          document_id?: string | null
          id?: string
          revisit_count?: number
          updated_at?: string
          user_id: string
          viewed_count?: number
        }
        Update: {
          completed_count?: number
          document_id?: string | null
          id?: string
          revisit_count?: number
          updated_at?: string
          user_id?: string
          viewed_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_stats_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back: string
          created_at: string
          difficulty: string | null
          document_id: string | null
          front: string
          id: string
          user_id: string
        }
        Insert: {
          back: string
          created_at?: string
          difficulty?: string | null
          document_id?: string | null
          front: string
          id?: string
          user_id: string
        }
        Update: {
          back?: string
          created_at?: string
          difficulty?: string | null
          document_id?: string | null
          front?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      mcq_stats: {
        Row: {
          correct_answers: number
          document_id: string | null
          id: string
          incorrect_answers: number
          total_attempts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          correct_answers?: number
          document_id?: string | null
          id?: string
          incorrect_answers?: number
          total_attempts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          correct_answers?: number
          document_id?: string | null
          id?: string
          incorrect_answers?: number
          total_attempts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_stats_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          last_login: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_login?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_login?: string | null
          user_id?: string
        }
        Relationships: []
      }
      qa_sessions: {
        Row: {
          answer: string
          citations: Json | null
          created_at: string | null
          document_id: string | null
          id: string
          question: string
          user_id: string
        }
        Insert: {
          answer: string
          citations?: Json | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          question: string
          user_id: string
        }
        Update: {
          answer?: string
          citations?: Json | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          answers: Json
          completed_at: string
          id: string
          quiz_id: string
          score: number
          total_questions: number
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string
          id?: string
          quiz_id: string
          score?: number
          total_questions?: number
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          id?: string
          quiz_id?: string
          score?: number
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: number
          created_at: string
          explanation: string | null
          id: string
          options: Json
          question: string
          quiz_id: string
        }
        Insert: {
          correct_answer: number
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question: string
          quiz_id: string
        }
        Update: {
          correct_answer?: number
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          action_type: string
          created_at: string
          document_id: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          document_id?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          document_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          current_level: string
          id: string
          topics_completed: number
          total_flashcards_completed: number
          total_flashcards_viewed: number
          total_mcq_attempted: number
          total_mcq_correct: number
          total_time_spent_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_level?: string
          id?: string
          topics_completed?: number
          total_flashcards_completed?: number
          total_flashcards_viewed?: number
          total_mcq_attempted?: number
          total_mcq_correct?: number
          total_time_spent_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_level?: string
          id?: string
          topics_completed?: number
          total_flashcards_completed?: number
          total_flashcards_viewed?: number
          total_mcq_attempted?: number
          total_mcq_correct?: number
          total_time_spent_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_streak: {
        Row: {
          current_streak: number
          id: string
          last_active_date: string | null
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          id?: string
          last_active_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          id?: string
          last_active_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_user_level: { Args: { p_user_id: string }; Returns: string }
      update_user_streak: { Args: { p_user_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
