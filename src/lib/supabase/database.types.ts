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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletion_attempts: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claim_token: string | null
          first_seen_at: string
          last_attempt_at: string | null
          last_stop_reason: string | null
          next_attempt_at: string | null
          recovery_state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          first_seen_at?: string
          last_attempt_at?: string | null
          last_stop_reason?: string | null
          next_attempt_at?: string | null
          recovery_state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          first_seen_at?: string
          last_attempt_at?: string | null
          last_stop_reason?: string | null
          next_attempt_at?: string | null
          recovery_state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_deletion_log: {
        Row: {
          account_deleted_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          outcome: string
          requested_at: string
          requester_session_hash: string | null
          stop_reason: string | null
          storage_bytes_removed: number
          storage_completed_at: string | null
          storage_objects_removed: number
          storage_started_at: string | null
          table_row_counts: Json
        }
        Insert: {
          account_deleted_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          outcome: string
          requested_at: string
          requester_session_hash?: string | null
          stop_reason?: string | null
          storage_bytes_removed?: number
          storage_completed_at?: string | null
          storage_objects_removed?: number
          storage_started_at?: string | null
          table_row_counts?: Json
        }
        Update: {
          account_deleted_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          outcome?: string
          requested_at?: string
          requester_session_hash?: string | null
          stop_reason?: string | null
          storage_bytes_removed?: number
          storage_completed_at?: string | null
          storage_objects_removed?: number
          storage_started_at?: string | null
          table_row_counts?: Json
        }
        Relationships: []
      }
      account_lifecycle: {
        Row: {
          changed_at: string
          changed_by: string
          created_at: string
          reason_code: string
          status: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          created_at?: string
          reason_code: string
          status?: string
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          created_at?: string
          reason_code?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_preferences: {
        Row: {
          agent_name: string
          ai_model: string
          ai_profile: string
          ai_provider: string
          autonomy_level: string
          background_model: string
          chat_model: string
          created_at: string
          daily_review_time: string
          embedding_model: string
          extraction_model: string
          file_model: string
          follow_up_intensity: string
          important_reminder_override: boolean
          max_followups_per_day: number
          personality: string
          planning_day: number
          planning_time: string
          privacy_default: string
          privacy_preferences: Json
          quiet_end: string
          quiet_periods: Json
          quiet_start: string
          reasoning_model: string
          response_detail: string
          review_model: string
          tone: string
          updated_at: string
          user_id: string
          weekly_review_day: number
          weekly_review_time: string
        }
        Insert: {
          agent_name?: string
          ai_model?: string
          ai_profile?: string
          ai_provider?: string
          autonomy_level?: string
          background_model?: string
          chat_model?: string
          created_at?: string
          daily_review_time?: string
          embedding_model?: string
          extraction_model?: string
          file_model?: string
          follow_up_intensity?: string
          important_reminder_override?: boolean
          max_followups_per_day?: number
          personality?: string
          planning_day?: number
          planning_time?: string
          privacy_default?: string
          privacy_preferences?: Json
          quiet_end?: string
          quiet_periods?: Json
          quiet_start?: string
          reasoning_model?: string
          response_detail?: string
          review_model?: string
          tone?: string
          updated_at?: string
          user_id: string
          weekly_review_day?: number
          weekly_review_time?: string
        }
        Update: {
          agent_name?: string
          ai_model?: string
          ai_profile?: string
          ai_provider?: string
          autonomy_level?: string
          background_model?: string
          chat_model?: string
          created_at?: string
          daily_review_time?: string
          embedding_model?: string
          extraction_model?: string
          file_model?: string
          follow_up_intensity?: string
          important_reminder_override?: boolean
          max_followups_per_day?: number
          personality?: string
          planning_day?: number
          planning_time?: string
          privacy_default?: string
          privacy_preferences?: Json
          quiet_end?: string
          quiet_periods?: Json
          quiet_start?: string
          reasoning_model?: string
          response_detail?: string
          review_model?: string
          tone?: string
          updated_at?: string
          user_id?: string
          weekly_review_day?: number
          weekly_review_time?: string
        }
        Relationships: []
      }
      ai_model_pricing: {
        Row: {
          cached_input_usd_per_million: number
          created_at: string
          currency: string
          effective_from: string
          effective_until: string | null
          id: string
          input_usd_per_million: number
          long_context_input_multiplier: number
          long_context_output_multiplier: number
          long_context_threshold: number | null
          model: string
          output_usd_per_million: number
          pricing_version: string
          provider: string
          service_tier: string
          source_url: string
        }
        Insert: {
          cached_input_usd_per_million: number
          created_at?: string
          currency?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          input_usd_per_million: number
          long_context_input_multiplier?: number
          long_context_output_multiplier?: number
          long_context_threshold?: number | null
          model: string
          output_usd_per_million: number
          pricing_version: string
          provider: string
          service_tier?: string
          source_url: string
        }
        Update: {
          cached_input_usd_per_million?: number
          created_at?: string
          currency?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          input_usd_per_million?: number
          long_context_input_multiplier?: number
          long_context_output_multiplier?: number
          long_context_threshold?: number | null
          model?: string
          output_usd_per_million?: number
          pricing_version?: string
          provider?: string
          service_tier?: string
          source_url?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          cached_input_price_usd_per_million: number | null
          cached_input_tokens: number
          cost_status: string
          cost_usd: number | null
          created_at: string
          id: string
          input_price_usd_per_million: number | null
          input_tokens: number
          long_context_applied: boolean
          model: string
          operation: string
          output_price_usd_per_million: number | null
          output_tokens: number
          pricing_id: string | null
          pricing_version: string | null
          provider: string
          provider_request_id: string | null
          reasoning_tokens: number
          service_tier: string
          source_id: string | null
          source_type: string | null
          user_id: string
        }
        Insert: {
          cached_input_price_usd_per_million?: number | null
          cached_input_tokens?: number
          cost_status: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_price_usd_per_million?: number | null
          input_tokens?: number
          long_context_applied?: boolean
          model: string
          operation: string
          output_price_usd_per_million?: number | null
          output_tokens?: number
          pricing_id?: string | null
          pricing_version?: string | null
          provider?: string
          provider_request_id?: string | null
          reasoning_tokens?: number
          service_tier?: string
          source_id?: string | null
          source_type?: string | null
          user_id: string
        }
        Update: {
          cached_input_price_usd_per_million?: number | null
          cached_input_tokens?: number
          cost_status?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_price_usd_per_million?: number | null
          input_tokens?: number
          long_context_applied?: boolean
          model?: string
          operation?: string
          output_price_usd_per_million?: number | null
          output_tokens?: number
          pricing_id?: string | null
          pricing_version?: string | null
          provider?: string
          provider_request_id?: string | null
          reasoning_tokens?: number
          service_tier?: string
          source_id?: string | null
          source_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_pricing_id_fkey"
            columns: ["pricing_id"]
            isOneToOne: false
            referencedRelation: "ai_model_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      attachment_interpretations: {
        Row: {
          attachment_id: string
          created_at: string
          description: string
          extracted_dates: Json
          extracted_people: Json
          extracted_projects: Json
          extracted_text: string | null
          id: string
          model: string
          raw_output: Json
          task_candidates: Json
          user_id: string
          version: number
        }
        Insert: {
          attachment_id: string
          created_at?: string
          description: string
          extracted_dates?: Json
          extracted_people?: Json
          extracted_projects?: Json
          extracted_text?: string | null
          id?: string
          model: string
          raw_output: Json
          task_candidates?: Json
          user_id: string
          version?: number
        }
        Update: {
          attachment_id?: string
          created_at?: string
          description?: string
          extracted_dates?: Json
          extracted_people?: Json
          extracted_projects?: Json
          extracted_text?: string | null
          id?: string
          model?: string
          raw_output?: Json
          task_candidates?: Json
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attachment_interpretations_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_interpretations_attachment_owner_fk"
            columns: ["user_id", "attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          description: string | null
          extracted_text: string | null
          id: string
          mime_type: string
          original_name: string
          processing_error: string | null
          sensitivity: string
          size_bytes: number
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          extracted_text?: string | null
          id?: string
          mime_type: string
          original_name: string
          processing_error?: string | null
          sensitivity?: string
          size_bytes: number
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          extracted_text?: string | null
          id?: string
          mime_type?: string
          original_name?: string
          processing_error?: string | null
          sensitivity?: string
          size_bytes?: number
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          actor: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          reason: string
          source_entry_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          actor: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          reason: string
          source_entry_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          actor?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string
          source_entry_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_source_entry_owner_fk"
            columns: ["user_id", "source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      auth_event_attempts: {
        Row: {
          attempted_at: string
          id: string
          identifier_hash: string | null
          ip_hash: string | null
          kind: string
          outcome: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          identifier_hash?: string | null
          ip_hash?: string | null
          kind: string
          outcome?: string
        }
        Update: {
          attempted_at?: string
          id?: string
          identifier_hash?: string | null
          ip_hash?: string | null
          kind?: string
          outcome?: string
        }
        Relationships: []
      }
      contexts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          input_tokens: number
          model: string | null
          output_tokens: number
          role: string
          user_id: string
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          role: string
          user_id: string
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_owner_fk"
            columns: ["user_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          locale: string
          sensitivity: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          locale?: string
          sensitivity?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string
          sensitivity?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credential_validation_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip_hash: string | null
          outcome: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip_hash?: string | null
          outcome: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          ip_hash?: string | null
          outcome?: string
          user_id?: string
        }
        Relationships: []
      }
      entity_aliases: {
        Row: {
          alias: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          normalized_alias: string
          updated_at: string
          user_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          alias: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          normalized_alias: string
          updated_at?: string
          user_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          alias?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          normalized_alias?: string
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      entity_attachments: {
        Row: {
          attachment_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          attachment_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          attachment_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_attachments_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_attachments_attachment_owner_fk"
            columns: ["user_id", "attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      entity_deletion_confirmations: {
        Row: {
          consumed_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          operation_key: string
          request_fingerprint: string
          status: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          operation_key: string
          request_fingerprint: string
          status?: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          operation_key?: string
          request_fingerprint?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      entity_tags: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_tags_tag_owner_fk"
            columns: ["user_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      entries: {
        Row: {
          capture_idempotency_key: string | null
          created_at: string
          current_interpretation_id: string | null
          id: string
          is_retroactive: boolean
          locale: string
          occurred_at: string
          original_content: string
          processing_error: string | null
          reprocessing_key: string | null
          reprocessing_lease_expires_at: string | null
          reprocessing_started_at: string | null
          sensitivity: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capture_idempotency_key?: string | null
          created_at?: string
          current_interpretation_id?: string | null
          id?: string
          is_retroactive?: boolean
          locale?: string
          occurred_at?: string
          original_content: string
          processing_error?: string | null
          reprocessing_key?: string | null
          reprocessing_lease_expires_at?: string | null
          reprocessing_started_at?: string | null
          sensitivity?: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capture_idempotency_key?: string | null
          created_at?: string
          current_interpretation_id?: string | null
          id?: string
          is_retroactive?: boolean
          locale?: string
          occurred_at?: string
          original_content?: string
          processing_error?: string | null
          reprocessing_key?: string | null
          reprocessing_lease_expires_at?: string | null
          reprocessing_started_at?: string | null
          sensitivity?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_current_interpretation_owner_fk"
            columns: ["user_id", "id", "current_interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "entry_id", "id"]
          },
        ]
      }
      entry_embeddings: {
        Row: {
          content: string
          created_at: string
          embedding: string
          entry_id: string
          id: string
          input_tokens: number
          model: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding: string
          entry_id: string
          id?: string
          input_tokens?: number
          model: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string
          entry_id?: string
          id?: string
          input_tokens?: number
          model?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_embeddings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_embeddings_entry_owner_fk"
            columns: ["user_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      entry_entities: {
        Row: {
          confidence: number
          created_at: string
          entity_id: string
          entity_type: string
          entry_id: string
          id: string
          interpretation_id: string
          mention: string
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          entity_id: string
          entity_type: string
          entry_id: string
          id?: string
          interpretation_id: string
          mention: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          entry_id?: string
          id?: string
          interpretation_id?: string
          mention?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_entities_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_entities_entry_owner_fk"
            columns: ["user_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "entry_entities_interpretation_id_fkey"
            columns: ["interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_entities_interpretation_owner_fk"
            columns: ["user_id", "interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      entry_person_candidate_resolutions: {
        Row: {
          candidate_index: number
          created_at: string
          disposition: string
          entry_id: string
          interpretation_id: string
          operation_key: string
          original_name: string
          person_created: boolean
          person_id: string | null
          resolved_name: string | null
          user_id: string
        }
        Insert: {
          candidate_index: number
          created_at?: string
          disposition: string
          entry_id: string
          interpretation_id: string
          operation_key: string
          original_name: string
          person_created?: boolean
          person_id?: string | null
          resolved_name?: string | null
          user_id: string
        }
        Update: {
          candidate_index?: number
          created_at?: string
          disposition?: string
          entry_id?: string
          interpretation_id?: string
          operation_key?: string
          original_name?: string
          person_created?: boolean
          person_id?: string | null
          resolved_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_person_candidate_resolutions_user_id_entry_id_fkey"
            columns: ["user_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "entry_person_candidate_resolutions_user_id_interpretation_id_fkey"
            columns: ["user_id", "interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "entry_person_candidate_resolutions_user_id_person_id_fkey"
            columns: ["user_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      entry_interpretations: {
        Row: {
          concepts: string[]
          confidence: number
          corrected_by: string | null
          correction_reason: string | null
          created_at: string
          element_classifications: Json
          element_confidence: Json
          element_policy: Json
          entry_id: string
          extracted_contexts: Json
          extracted_dates: Json
          extracted_organizations: Json
          extracted_people: Json
          extracted_projects: Json
          id: string
          input_tokens: number
          is_record_only: boolean
          model: string
          operation_key: string | null
          origin: string
          output_tokens: number
          parent_interpretation_id: string | null
          pending_questions: Json
          prompt_version: string
          raw_output: Json
          resolution_evidence: Json
          strategy_version: string
          summary: string
          task_candidates: Json
          user_id: string
          version: number
        }
        Insert: {
          concepts?: string[]
          confidence: number
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          element_classifications?: Json
          element_confidence?: Json
          element_policy?: Json
          entry_id: string
          extracted_contexts?: Json
          extracted_dates?: Json
          extracted_organizations?: Json
          extracted_people?: Json
          extracted_projects?: Json
          id?: string
          input_tokens?: number
          is_record_only?: boolean
          model: string
          operation_key?: string | null
          origin?: string
          output_tokens?: number
          parent_interpretation_id?: string | null
          pending_questions?: Json
          prompt_version: string
          raw_output: Json
          resolution_evidence?: Json
          strategy_version: string
          summary: string
          task_candidates?: Json
          user_id: string
          version?: number
        }
        Update: {
          concepts?: string[]
          confidence?: number
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          element_classifications?: Json
          element_confidence?: Json
          element_policy?: Json
          entry_id?: string
          extracted_contexts?: Json
          extracted_dates?: Json
          extracted_organizations?: Json
          extracted_people?: Json
          extracted_projects?: Json
          id?: string
          input_tokens?: number
          is_record_only?: boolean
          model?: string
          operation_key?: string | null
          origin?: string
          output_tokens?: number
          parent_interpretation_id?: string | null
          pending_questions?: Json
          prompt_version?: string
          raw_output?: Json
          resolution_evidence?: Json
          strategy_version?: string
          summary?: string
          task_candidates?: Json
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "entry_interpretations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_interpretations_entry_owner_fk"
            columns: ["user_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "entry_interpretations_parent_owner_fk"
            columns: ["user_id", "entry_id", "parent_interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "entry_id", "id"]
          },
        ]
      }
      entry_task_candidate_resolutions: {
        Row: {
          candidate_index: number
          created_at: string
          disposition: string
          entry_id: string
          id: string
          interpretation_id: string
          task_id: string | null
          undo_operation_id: string | null
          user_id: string
        }
        Insert: {
          candidate_index: number
          created_at?: string
          disposition: string
          entry_id: string
          id?: string
          interpretation_id: string
          task_id?: string | null
          undo_operation_id?: string | null
          user_id: string
        }
        Update: {
          candidate_index?: number
          created_at?: string
          disposition?: string
          entry_id?: string
          id?: string
          interpretation_id?: string
          task_id?: string | null
          undo_operation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_task_candidate_resolutions_interpretation_owner_fk"
            columns: ["user_id", "entry_id", "interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "entry_id", "id"]
          },
          {
            foreignKeyName: "entry_task_candidate_resolutions_task_owner_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "entry_task_candidate_resolutions_undo_owner_fk"
            columns: ["user_id", "undo_operation_id"]
            isOneToOne: false
            referencedRelation: "undo_operations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      error_events: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          occurred_at: string
          operation: string
          reason: string
          surface: string
          user_id: string | null
        }
        Insert: {
          correlation_id: string
          created_at?: string
          id?: string
          occurred_at?: string
          operation: string
          reason: string
          surface: string
          user_id?: string | null
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          occurred_at?: string
          operation?: string
          reason?: string
          surface?: string
          user_id?: string | null
        }
        Relationships: []
      }
      heartbeat_runs: {
        Row: {
          analyzed_items: number
          completed_at: string | null
          error: string | null
          id: string
          metadata: Json
          notifications_created: number
          silent: boolean
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          analyzed_items?: number
          completed_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json
          notifications_created?: number
          silent?: boolean
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          analyzed_items?: number
          completed_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json
          notifications_created?: number
          silent?: boolean
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          priority: number
          result: Json | null
          started_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key: string
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          confidence: number
          content: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          id: string
          important: boolean
          kind: string
          person_id: string | null
          project_id: string | null
          sensitivity: string
          source_entry_id: string | null
          updated_at: string
          user_id: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          confidence?: number
          content: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          important?: boolean
          kind?: string
          person_id?: string | null
          project_id?: string | null
          sensitivity?: string
          source_entry_id?: string | null
          updated_at?: string
          user_id: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          confidence?: number
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          important?: boolean
          kind?: string
          person_id?: string | null
          project_id?: string | null
          sensitivity?: string
          source_entry_id?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_person_owner_fk"
            columns: ["user_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_project_owner_fk"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "memories_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_source_entry_owner_fk"
            columns: ["user_id", "source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      notification_consents: {
        Row: {
          channel: string
          created_at: string
          enabled_types: string[]
          frequency: string
          recorded_at: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          enabled_types?: string[]
          frequency?: string
          recorded_at?: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled_types?: string[]
          frequency?: string
          recorded_at?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          consent_recorded_at: string | null
          created_at: string
          dedupe_hash: string
          id: string
          notification_type: string
          occurred_at: string
          outcome: string
          suppression_reason: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          consent_recorded_at?: string | null
          created_at?: string
          dedupe_hash: string
          id?: string
          notification_type: string
          occurred_at?: string
          outcome: string
          suppression_reason?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          consent_recorded_at?: string | null
          created_at?: string
          dedupe_hash?: string
          id?: string
          notification_type?: string
          occurred_at?: string
          outcome?: string
          suppression_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          dedupe_key: string | null
          id: string
          priority: string
          read_at: string | null
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          priority?: string
          read_at?: string | null
          status?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          priority?: string
          read_at?: string | null
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          candidate_index: number
          confidence: number
          created_at: string
          entry_id: string
          id: string
          interpretation_id: string
          question: string
          reason: string
          snoozed_until: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          candidate_index: number
          confidence: number
          created_at?: string
          entry_id: string
          id?: string
          interpretation_id: string
          question: string
          reason: string
          snoozed_until?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          candidate_index?: number
          confidence?: number
          created_at?: string
          entry_id?: string
          id?: string
          interpretation_id?: string
          question?: string
          reason?: string
          snoozed_until?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_questions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_questions_entry_owner_fk"
            columns: ["user_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "pending_questions_interpretation_id_fkey"
            columns: ["interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_questions_interpretation_owner_fk"
            columns: ["user_id", "interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_organization_owner_fk"
            columns: ["user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      person_contexts: {
        Row: {
          confidence: number
          context_id: string
          created_at: string
          id: string
          person_id: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          confidence?: number
          context_id: string
          created_at?: string
          id?: string
          person_id: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          confidence?: number
          context_id?: string
          created_at?: string
          id?: string
          person_id?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_contexts_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_contexts_context_owner_fk"
            columns: ["user_id", "context_id"]
            isOneToOne: false
            referencedRelation: "contexts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "person_contexts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_contexts_person_owner_fk"
            columns: ["user_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      person_projects: {
        Row: {
          confidence: number
          created_at: string
          id: string
          person_id: string
          project_id: string
          role: string | null
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          person_id: string
          project_id: string
          role?: string | null
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          person_id?: string
          project_id?: string
          role?: string | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_projects_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_projects_person_owner_fk"
            columns: ["user_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "person_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_projects_project_owner_fk"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      person_relationships: {
        Row: {
          confidence: number
          created_at: string
          description: string | null
          id: string
          person_id: string
          related_person_id: string | null
          relationship_type: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          person_id: string
          related_person_id?: string | null
          relationship_type: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          person_id?: string
          related_person_id?: string | null
          relationship_type?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_relationships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_relationships_person_owner_fk"
            columns: ["user_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "person_relationships_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_relationships_related_person_owner_fk"
            columns: ["user_id", "related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      policy_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          document: string
          id: string
          surface: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          document: string
          id?: string
          surface: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          document?: string
          id?: string
          surface?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      product_events: {
        Row: {
          app_version: string
          created_at: string
          event_name: string
          id: string
          idempotency_key: string
          is_synthetic: boolean
          locale: string
          properties: Json
          session_id: string | null
          subject_id: string | null
          subject_type: string | null
          surface: string
          user_id: string
          viewport_class: string
        }
        Insert: {
          app_version: string
          created_at?: string
          event_name: string
          id?: string
          idempotency_key: string
          is_synthetic?: boolean
          locale: string
          properties?: Json
          session_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          surface: string
          user_id: string
          viewport_class: string
        }
        Update: {
          app_version?: string
          created_at?: string
          event_name?: string
          id?: string
          idempotency_key?: string
          is_synthetic?: boolean
          locale?: string
          properties?: Json
          session_id?: string | null
          subject_id?: string | null
          subject_type?: string | null
          surface?: string
          user_id?: string
          viewport_class?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          locale: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          locale?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          locale?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_owner_fk"
            columns: ["user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          bucket: string
          consumed_at: string
          id: string
          outcome: string
          user_id: string
        }
        Insert: {
          bucket: string
          consumed_at?: string
          id?: string
          outcome: string
          user_id: string
        }
        Update: {
          bucket?: string
          consumed_at?: string
          id?: string
          outcome?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_delivered_at: string | null
          p256dh: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_delivered_at?: string | null
          p256dh: string
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_delivered_at?: string | null
          p256dh?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          entry_id: string | null
          id: string
          important: boolean
          remind_at: string
          sent_at: string | null
          snoozed_until: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_id?: string | null
          id?: string
          important?: boolean
          remind_at: string
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string | null
          id?: string
          important?: boolean
          remind_at?: string
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_entry_owner_fk"
            columns: ["user_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_task_owner_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      scheduled_job_health: {
        Row: {
          consecutive_empty: number
          failure_count: number
          job_name: string
          last_failure_at: string | null
          last_outcome: string | null
          last_success_at: string | null
          last_useful_at: string | null
          success_count: number
          updated_at: string
          useful_count: number
        }
        Insert: {
          consecutive_empty?: number
          failure_count?: number
          job_name: string
          last_failure_at?: string | null
          last_outcome?: string | null
          last_success_at?: string | null
          last_useful_at?: string | null
          success_count?: number
          updated_at?: string
          useful_count?: number
        }
        Update: {
          consecutive_empty?: number
          failure_count?: number
          job_name?: string
          last_failure_at?: string | null
          last_outcome?: string | null
          last_success_at?: string | null
          last_useful_at?: string | null
          success_count?: number
          updated_at?: string
          useful_count?: number
        }
        Relationships: []
      }
      summaries: {
        Row: {
          content: string
          generated_at: string
          id: string
          input_tokens: number
          model: string | null
          original_content: string
          output_tokens: number
          period_end: string
          period_start: string
          period_type: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          generated_at?: string
          id?: string
          input_tokens?: number
          model?: string | null
          original_content: string
          output_tokens?: number
          period_end: string
          period_start: string
          period_type: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          generated_at?: string
          id?: string
          input_tokens?: number
          model?: string | null
          original_content?: string
          output_tokens?: number
          period_end?: string
          period_start?: string
          period_type?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      task_command_confirmations: {
        Row: {
          action: string
          consumed_at: string | null
          created_at: string
          id: string
          operation_key: string
          request_fingerprint: string
          status: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          consumed_at?: string | null
          created_at?: string
          id?: string
          operation_key: string
          request_fingerprint: string
          status?: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          consumed_at?: string | null
          created_at?: string
          id?: string
          operation_key?: string
          request_fingerprint?: string
          status?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_command_confirmations_task_owner_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_contexts: {
        Row: {
          context_id: string
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          context_id: string
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          context_id?: string
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_contexts_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_contexts_context_owner_fk"
            columns: ["user_id", "context_id"]
            isOneToOne: false
            referencedRelation: "contexts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_contexts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_contexts_task_owner_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_dependency_owner_fk"
            columns: ["user_id", "depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_owner_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_people: {
        Row: {
          created_at: string
          person_id: string
          role: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          person_id: string
          role?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          person_id?: string
          role?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_people_person_owner_fk"
            columns: ["user_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_people_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_people_task_owner_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_projects: {
        Row: {
          created_at: string
          project_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_projects_project_owner_fk"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_projects_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_projects_task_owner_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      tasks: {
        Row: {
          cancelled_at: string | null
          candidate_index: number | null
          completed_at: string | null
          confidence: number
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          dynamic_priority: number
          id: string
          intentional_no_due: boolean
          manual_priority: string | null
          no_due_reason: string | null
          operation_key: string | null
          parent_task_id: string | null
          planned_at: string | null
          source_entry_id: string | null
          source_interpretation_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          waiting_on_person_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          candidate_index?: number | null
          completed_at?: string | null
          confidence?: number
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          dynamic_priority?: number
          id?: string
          intentional_no_due?: boolean
          manual_priority?: string | null
          no_due_reason?: string | null
          operation_key?: string | null
          parent_task_id?: string | null
          planned_at?: string | null
          source_entry_id?: string | null
          source_interpretation_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          waiting_on_person_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          candidate_index?: number | null
          completed_at?: string | null
          confidence?: number
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          dynamic_priority?: number
          id?: string
          intentional_no_due?: boolean
          manual_priority?: string | null
          no_due_reason?: string | null
          operation_key?: string | null
          parent_task_id?: string | null
          planned_at?: string | null
          source_entry_id?: string | null
          source_interpretation_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          waiting_on_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_owner_fk"
            columns: ["user_id", "parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_entry_owner_fk"
            columns: ["user_id", "source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "tasks_source_interpretation_owner_fk"
            columns: ["user_id", "source_interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "tasks_waiting_on_person_id_fkey"
            columns: ["waiting_on_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_waiting_person_owner_fk"
            columns: ["user_id", "waiting_on_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      undo_operations: {
        Row: {
          action_type: string
          after_state: Json
          before_state: Json | null
          created_at: string
          entity_ids: string[]
          entity_type: string
          expires_at: string
          id: string
          operation_key: string | null
          request_fingerprint: string | null
          result_interpretation_id: string | null
          source_entry_id: string | null
          source_interpretation_id: string | null
          status: string
          undone_at: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          after_state: Json
          before_state?: Json | null
          created_at?: string
          entity_ids?: string[]
          entity_type: string
          expires_at?: string
          id?: string
          operation_key?: string | null
          request_fingerprint?: string | null
          result_interpretation_id?: string | null
          source_entry_id?: string | null
          source_interpretation_id?: string | null
          status?: string
          undone_at?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          after_state?: Json
          before_state?: Json | null
          created_at?: string
          entity_ids?: string[]
          entity_type?: string
          expires_at?: string
          id?: string
          operation_key?: string | null
          request_fingerprint?: string | null
          result_interpretation_id?: string | null
          source_entry_id?: string | null
          source_interpretation_id?: string | null
          status?: string
          undone_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "undo_operations_result_interpretation_owner_fk"
            columns: ["user_id", "result_interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "undo_operations_source_entry_owner_fk"
            columns: ["user_id", "source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "undo_operations_source_interpretation_owner_fk"
            columns: ["user_id", "source_interpretation_id"]
            isOneToOne: false
            referencedRelation: "entry_interpretations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      user_ai_credentials: {
        Row: {
          ciphertext: string | null
          created_at: string
          fingerprint: string | null
          iv: string | null
          key_version: number | null
          last_failure_code: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          ciphertext?: string | null
          created_at?: string
          fingerprint?: string | null
          iv?: string | null
          key_version?: number | null
          last_failure_code?: string | null
          provider?: string
          status: string
          updated_at?: string
          user_id: string
          validated_at?: string | null
        }
        Update: {
          ciphertext?: string | null
          created_at?: string
          fingerprint?: string | null
          iv?: string | null
          key_version?: number | null
          last_failure_code?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_owned_row_counts: { Args: { p_user_id: string }; Returns: Json }
      admin_account_lifecycle_status: {
        Args: { p_email: string; p_user_id: string }
        Returns: Json
      }
      admin_credential_status: { Args: { p_user_id: string }; Returns: string }
      admin_list_credential_envelopes: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          ciphertext: string
          iv: string
          key_version: number
          provider: string
          user_id: string
        }[]
      }
      admin_rewrap_credential_envelope: {
        Args: {
          p_ciphertext: string
          p_expected_key_version: number
          p_iv: string
          p_key_version: number
          p_user_id: string
        }
        Returns: boolean
      }
      apply_reminder_command_v1: {
        Args: {
          p_command: Json
          p_expected_state: Json
          p_operation_key: string
          p_reminder_id: string
        }
        Returns: Json
      }
      apply_entity_deletion: {
        Args: { p_entity_id: string; p_entity_type: string; p_operation_key: string }
        Returns: Json
      }
      apply_task_command: {
        Args: {
          p_action: string
          p_observed_before: string
          p_operation_key: string
          p_patch: Json
          p_policy_version: string
          p_pre_state: Json
          p_task_id: string
        }
        Returns: Json
      }
      begin_account_deletion_admin: {
        Args: { p_reason_code: string; p_user_id: string }
        Returns: Json
      }
      begin_entry_interpretation: {
        Args: { p_entry_id: string; p_service_user_id?: string }
        Returns: Json
      }
      begin_entry_reprocessing: {
        Args: {
          p_entry_id: string
          p_lease_seconds?: number
          p_operation_key: string
          p_service_user_id?: string
        }
        Returns: Json
      }
      capture_entry_async: {
        Args: {
          p_idempotency_key: string
          p_locale: string
          p_original_content: string
          p_source: string
        }
        Returns: Json
      }
      claim_attachment_job: {
        Args: {
          p_job_id: string
          p_lease_seconds: number
          p_user_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      claim_auth_event_slot: {
        Args: {
          p_identifier_ceiling: number
          p_identifier_hash: string
          p_ip_ceiling: number
          p_ip_hash: string
          p_kind: string
          p_window: string
        }
        Returns: string
      }
      claim_credential_validation_slot: {
        Args: {
          p_ip_ceiling?: number
          p_ip_hash: string
          p_user_ceiling?: number
        }
        Returns: string
      }
      claim_entry_interpretation_job: {
        Args: {
          p_job_id: string
          p_lease_seconds: number
          p_user_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      claim_next_entry_interpretation_job: {
        Args: { p_lease_seconds: number; p_worker_id: string }
        Returns: Json
      }
      claim_rate_limit_slot: {
        Args: { p_bucket: string; p_ceiling: number; p_window: string }
        Returns: {
          admitted: boolean
          refusal: string
          slot_id: string
        }[]
      }
      claim_rate_limit_slot_for_user: {
        Args: {
          p_bucket: string
          p_ceiling: number
          p_user_id: string
          p_window: string
        }
        Returns: {
          admitted: boolean
          refusal: string
          slot_id: string
        }[]
      }
      claim_stalled_account_deletions: {
        Args: {
          p_backoff_cap: string
          p_lease: string
          p_limit: number
          p_max_attempts: number
          p_retry_interval: string
        }
        Returns: {
          attempt_count: number
          claim_token: string
          user_id: string
        }[]
      }
      complete_job: {
        Args: { p_job_id: string; p_result: Json; p_worker_id: string }
        Returns: Json
      }
      confirm_account_deletion_claim: {
        Args: { p_claim_token: string; p_user_id: string }
        Returns: Json
      }
      confirm_entry_task_candidates: {
        Args: {
          p_candidate_indexes: number[]
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      confirm_entry_task_candidates_v2: {
        Args: {
          p_candidate_edits: Json
          p_candidate_indexes: number[]
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      confirm_entry_task_candidates_v3: {
        Args: {
          p_candidate_edits: Json
          p_candidate_indexes: number[]
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      confirm_entry_task_candidates_v4: {
        Args: {
          p_candidate_edits: Json
          p_candidate_indexes: number[]
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      confirm_entry_task_candidates_v5: {
        Args: {
          p_candidate_edits: Json
          p_candidate_resolutions: Json
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      confirm_entry_task_candidates_v6: {
        Args: {
          p_candidate_edits: Json
          p_candidate_resolutions: Json
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      confirm_entry_tasks: {
        Args: { p_candidate_indexes: number[]; p_entry_id: string }
        Returns: Json
      }
      confirm_entry_interpretation: {
        Args: {
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      correct_entry_interpretation: {
        Args: {
          p_entry_id: string
          p_expected_version: number
          p_operation_key: string
          p_patch: Json
          p_reason?: string
        }
        Returns: Json
      }
      count_prunable_auth_event_attempts: { Args: never; Returns: number }
      count_prunable_credential_validation_attempts: {
        Args: never
        Returns: number
      }
      count_prunable_error_events: {
        Args: { p_window: string }
        Returns: number
      }
      count_prunable_heartbeat_runs: { Args: never; Returns: number }
      count_prunable_notifications: { Args: never; Returns: number }
      count_prunable_product_events: { Args: never; Returns: number }
      count_prunable_scheduled_job_health: {
        Args: { p_window: string }
        Returns: number
      }
      count_prunable_terminal_jobs: { Args: never; Returns: number }
      count_prunable_undo_operations: { Args: never; Returns: number }
      create_task_command: {
        Args: {
          p_action: string
          p_created_by?: string
          p_observed_before: string
          p_operation_key: string
          p_patch: Json
          p_policy_version: string
          p_title_words: string[]
        }
        Returns: Json
      }
      defer_job_for_inactive_owner: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: Json
      }
      element_trust_evidence: { Args: { p_element_trust: Json }; Returns: Json }
      element_trust_policies: { Args: { p_element_trust: Json }; Returns: Json }
      element_trust_scores: { Args: { p_element_trust: Json }; Returns: Json }
      enqueue_entry_reprocessing: {
        Args: { p_entry_id: string; p_operation_key: string }
        Returns: Json
      }
      entity_is_owned: {
        Args: { p_entity_id: string; p_entity_type: string; p_user_id: string }
        Returns: boolean
      }
      fail_entry_interpretation: {
        Args: {
          p_entry_id: string
          p_error: string
          p_service_user_id?: string
          p_terminal?: boolean
        }
        Returns: Json
      }
      fail_entry_reprocessing: {
        Args: {
          p_entry_id: string
          p_error: string
          p_operation_key: string
          p_service_user_id?: string
        }
        Returns: Json
      }
      fail_job: {
        Args: {
          p_base_delay_seconds: number
          p_error: string
          p_job_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      fail_job_terminal: {
        Args: { p_error: string; p_job_id: string; p_worker_id: string }
        Returns: Json
      }
      finalize_auth_event_attempt: {
        Args: { p_attempt_id: string; p_outcome: string }
        Returns: undefined
      }
      finalize_credential_validation_attempt: {
        Args: { p_attempt_id: string; p_outcome: string }
        Returns: undefined
      }
      get_ai_cost_summary: { Args: { p_timezone?: string }; Returns: Json }
      get_job_queue_metrics: { Args: never; Returns: Json }
      interpretation_lifecycle_status: {
        Args: {
          p_element_trust: Json
          p_pending_questions: Json
          p_record_only?: boolean
        }
        Returns: string
      }
      issue_entity_deletion_confirmation: {
        Args: { p_entity_id: string; p_entity_type: string; p_operation_key: string }
        Returns: Json
      }
      issue_task_command_confirmation: {
        Args: {
          p_action: string
          p_observed_before: string
          p_operation_key: string
          p_patch: Json
          p_policy_version: string
          p_pre_state: Json
          p_task_id: string
        }
        Returns: Json
      }
      issue_task_command_creation_confirmation: {
        Args: {
          p_action: string
          p_observed_before: string
          p_operation_key: string
          p_patch: Json
          p_policy_version: string
          p_title_words: string[]
        }
        Returns: Json
      }
      list_needs_attention: {
        Args: {
          p_cursor_entry_id?: string
          p_cursor_occurred_at?: string
          p_limit?: number
        }
        Returns: {
          current_interpretation_id: string
          entry_id: string
          job_id: string
          occurred_at: string
          open_question_id: string
          reason: string
        }[]
      }
      list_task_command_candidates: {
        Args: {
          p_context_hint?: string
          p_context_ref?: string
          p_eligible_statuses: string[]
          p_limit?: number
          p_observed_before?: string
          p_person_hint?: string
          p_person_ref?: string
          p_project_hint?: string
          p_project_ref?: string
          p_title_query?: string
        }
        Returns: {
          cancelled_at: string
          completed_at: string
          context_hint_matched: boolean
          context_ids: string[]
          context_names: string[]
          context_ref_id: string
          context_ref_name: string
          created_at: string
          description: string
          due_at: string
          effective_limit: number
          intentional_no_due: boolean
          last_audited_at: string
          manual_priority: string
          next_reminder_at: string
          no_due_reason: string
          observed_before: string
          owner_id: string
          person_hint_matched: boolean
          person_ids: string[]
          person_names: string[]
          person_ref_id: string
          person_ref_name: string
          person_roles: string[]
          planned_at: string
          prefilter_tier: number
          project_hint_matched: boolean
          project_ids: string[]
          project_names: string[]
          project_ref_id: string
          project_ref_name: string
          query_token_count: number
          scheduled_reminder_count: number
          status: string
          task_id: string
          title: string
          token_overlap: number
          updated_at: string
        }[]
      }
      mark_entry_awaiting_ai_configuration: {
        Args: { p_entry_id: string; p_service_user_id: string }
        Returns: boolean
      }
      match_internal_knowledge: {
        Args: { p_match_count?: number; p_query_embedding: string }
        Returns: {
          content: string
          occurred_at: string
          similarity: number
          source_id: string
          source_type: string
        }[]
      }
      model_only_element_trust: {
        Args: { p_model_confidence: number }
        Returns: Json
      }
      normalize_entity_alias: { Args: { p_value: string }; Returns: string }
      operator_account_lifecycle_summary: {
        Args: never
        Returns: {
          account_count: number
          lifecycle_status: string
          newest_changed_at: string
          oldest_changed_at: string
        }[]
      }
      operator_deletion_recovery_summary: {
        Args: never
        Returns: {
          account_count: number
          max_attempt_count: number
          next_attempt_due_at: string
          oldest_first_seen_at: string
          recovery_state: string
        }[]
      }
      operator_error_event_volume: {
        Args: { p_window: string }
        Returns: {
          event_count: number
          first_seen_at: string
          has_owner_count: number
          last_seen_at: string
          operation: string
          reason: string
          surface: string
        }[]
      }
      operator_job_queue_health: {
        Args: never
        Returns: {
          due_now_count: number
          expired_lease_count: number
          job_count: number
          job_type: string
          newest_created_at: string
          oldest_created_at: string
          status: string
        }[]
      }
      operator_scheduled_job_findings: {
        Args: { p_window: string }
        Returns: {
          finding: string
          job_name: string
          last_seen_at: string
          occurrence_count: number
        }[]
      }
      operator_stalled_deletions: {
        Args: { p_limit: number }
        Returns: {
          attempt_count: number
          claim_active: boolean
          first_seen_at: string
          last_attempt_at: string
          last_stop_reason: string
          lifecycle_status: string
          next_attempt_at: string
          recovery_state: string
          user_id: string
        }[]
      }
      persist_entry_interpretation: {
        Args: {
          p_entry_id: string
          p_extraction: Json
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
          p_prompt_version: string
          p_service_user_id?: string
          p_strategy_version: string
        }
        Returns: string
      }
      persist_interpretation_questions: {
        Args: {
          p_entry_id: string
          p_interpretation_id: string
          p_questions: Json
          p_user_id: string
        }
        Returns: undefined
      }
      persist_reprocessed_entry_interpretation: {
        Args: {
          p_element_trust: Json
          p_entry_id: string
          p_extraction: Json
          p_input_tokens: number
          p_model: string
          p_operation_key: string
          p_output_tokens: number
          p_prompt_version: string
          p_service_user_id?: string
          p_strategy_version: string
        }
        Returns: Json
      }
      persist_resolved_entry_entities: {
        Args: {
          p_entry_id: string
          p_extraction: Json
          p_interpretation_id: string
          p_occurred_at: string
          p_user_id: string
        }
        Returns: undefined
      }
      preview_entity_deletion: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      preview_task_command_creation: {
        Args: {
          p_action: string
          p_observed_before: string
          p_operation_key: string
          p_patch: Json
          p_policy_version: string
          p_title_words: string[]
        }
        Returns: Json
      }
      prune_auth_event_attempts: { Args: never; Returns: number }
      prune_credential_validation_attempts: { Args: never; Returns: number }
      prune_error_events: {
        Args: { p_limit: number; p_window: string }
        Returns: number
      }
      prune_heartbeat_runs: { Args: never; Returns: number }
      prune_notifications: { Args: never; Returns: number }
      prune_product_events: { Args: never; Returns: number }
      prune_scheduled_job_health: {
        Args: { p_limit: number; p_window: string }
        Returns: number
      }
      prune_terminal_jobs: { Args: never; Returns: number }
      prune_undo_operations: { Args: never; Returns: number }
      reactivate_account: {
        Args: { p_reason_code: string; p_user_id: string }
        Returns: Json
      }
      reap_expired_jobs: { Args: { p_limit: number }; Returns: Json }
      reap_stalled_account_deletions: {
        Args: {
          p_backoff_cap: string
          p_lease: string
          p_limit: number
          p_max_attempts: number
          p_retry_interval: string
        }
        Returns: Json
      }
      record_account_deletion: {
        Args: {
          p_account_deleted_at: string
          p_outcome: string
          p_requested_at: string
          p_requester_session_hash: string
          p_stop_reason: string
          p_storage_bytes_removed: number
          p_storage_completed_at: string
          p_storage_objects_removed: number
          p_storage_started_at: string
          p_table_row_counts: Json
        }
        Returns: string
      }
      record_account_deletion_attempt: {
        Args: {
          p_claim_token: string
          p_outcome: string
          p_stop_reason: string
          p_user_id: string
        }
        Returns: Json
      }
      record_ai_usage: {
        Args: {
          p_cached_input_tokens?: number
          p_input_tokens?: number
          p_model: string
          p_operation: string
          p_output_tokens?: number
          p_provider_request_id?: string
          p_reasoning_tokens?: number
          p_source_id?: string
          p_source_type?: string
          p_user_id?: string
        }
        Returns: string
      }
      record_error_event: {
        Args: {
          p_correlation_id: string
          p_operation: string
          p_reason: string
          p_surface: string
        }
        Returns: string
      }
      record_policy_acceptance: {
        Args: { p_document: string; p_surface: string }
        Returns: Json
      }
      record_product_event: {
        Args: {
          p_app_version: string
          p_event_name: string
          p_idempotency_key?: string
          p_is_synthetic?: boolean
          p_locale: string
          p_properties: Json
          p_session_id?: string
          p_subject_id?: string
          p_subject_type?: string
          p_surface: string
          p_viewport_class: string
        }
        Returns: {
          event_id: string
          recorded: boolean
        }[]
      }
      begin_push_delivery: {
        Args: { p_dedupe_hash: string; p_type: string; p_user_id: string }
        Returns: Json
      }
      finish_push_delivery: {
        Args: {
          p_delivery_id: string
          p_gone_subscription_ids?: string[]
          p_outcome: string
        }
        Returns: Json
      }
      record_push_consent_state: {
        Args: { p_state: string }
        Returns: Json
      }
      register_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: Json
      }
      revoke_push_consent: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      update_notification_preferences: {
        Args: {
          p_daily_cap: number
          p_enabled_types: string[]
          p_frequency: string
          p_quiet_end: string
          p_quiet_start: string
        }
        Returns: Json
      }
      record_product_event_for_user: {
        Args: {
          p_app_version: string
          p_event_name: string
          p_idempotency_key?: string
          p_is_synthetic?: boolean
          p_locale: string
          p_properties: Json
          p_session_id?: string
          p_subject_id?: string
          p_subject_type?: string
          p_surface: string
          p_user_id: string
          p_viewport_class: string
        }
        Returns: {
          event_id: string
          recorded: boolean
        }[]
      }
      record_scheduled_job_failure: {
        Args: { p_job_name: string }
        Returns: undefined
      }
      record_scheduled_job_run: {
        Args: { p_did_work: boolean; p_job_name: string }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: Json }
      request_heartbeat: { Args: never; Returns: Json }
      resolve_job_ai_credential: {
        Args: { p_job_id: string }
        Returns: {
          ciphertext: string
          iv: string
          key_version: number
          provider: string
          status: string
        }[]
      }
      resolve_own_ai_credential: {
        Args: never
        Returns: {
          ciphertext: string
          iv: string
          key_version: number
          provider: string
          status: string
        }[]
      }
      resolve_owned_entity_exact: {
        Args: {
          p_entity_type: string
          p_name: string
          p_occurred_at: string
          p_user_id: string
        }
        Returns: string
      }
      resolve_pending_question_v1: {
        Args: {
          p_operation_key: string
          p_question_id: string
          p_resolution: Json
        }
        Returns: Json
      }
      resolve_pending_question_v2: {
        Args: {
          p_operation_key: string
          p_question_id: string
          p_resolution: Json
        }
        Returns: Json
      }
      resolve_pending_question_v3: {
        Args: {
          p_operation_key: string
          p_question_id: string
          p_resolution: Json
        }
        Returns: Json
      }
      resolve_entry_person_candidates: {
        Args: {
          p_entry_id: string
          p_expected_interpretation_id: string
          p_operation_key: string
          p_resolutions: Json
        }
        Returns: Json
      }
      run_all_heartbeats: { Args: never; Returns: number }
      run_user_heartbeat: { Args: { p_user_id: string }; Returns: Json }
      save_profile_settings: {
        Args: { p_preferences: Json; p_profile: Json }
        Returns: undefined
      }
      scheduled_job_liveness: {
        Args: { p_staleness_multiple: number }
        Returns: {
          active: boolean
          consecutive_empty: number
          expected_interval: string
          job_name: string
          last_success_at: string
          last_useful_at: string
          liveness: string
          schedule: string
          seconds_since_success: number
          staleness_threshold: string
        }[]
      }
      suspend_account: {
        Args: { p_reason_code: string; p_user_id: string }
        Returns: Json
      }
      task_command_fingerprint: {
        Args: {
          p_observed_before: string
          p_operation_key: string
          p_owner_id: string
          p_patch: Json
          p_policy_version: string
          p_pre_state: Json
          p_task_id: string
        }
        Returns: string
      }
      undo_operation: { Args: { p_undo_id: string }; Returns: Json }
      validate_element_trust: {
        Args: { p_element_trust: Json }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
