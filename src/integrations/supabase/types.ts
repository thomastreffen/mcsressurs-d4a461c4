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
      absence_requests: {
        Row: {
          absence_type: string
          approved_at: string | null
          approved_by: string | null
          comment: string | null
          company_id: string
          created_at: string
          end_date: string
          end_time: string | null
          id: string
          is_full_day: boolean
          outlook_event_id: string | null
          person_id: string
          rejection_reason: string | null
          requested_by: string | null
          start_date: string
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          absence_type: string
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          company_id: string
          created_at?: string
          end_date: string
          end_time?: string | null
          id?: string
          is_full_day?: boolean
          outlook_event_id?: string | null
          person_id: string
          rejection_reason?: string | null
          requested_by?: string | null
          start_date: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          absence_type?: string
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          end_time?: string | null
          id?: string
          is_full_day?: boolean
          outlook_event_id?: string | null
          person_id?: string
          rejection_reason?: string | null
          requested_by?: string | null
          start_date?: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          commercial_case_id: string | null
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          microsoft_event_id: string | null
          microsoft_message_id: string | null
          performed_by: string | null
          title: string | null
          type: string
          visibility: string
        }
        Insert: {
          action: string
          commercial_case_id?: string | null
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          microsoft_event_id?: string | null
          microsoft_message_id?: string | null
          performed_by?: string | null
          title?: string | null
          type?: string
          visibility?: string
        }
        Update: {
          action?: string
          commercial_case_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          microsoft_event_id?: string | null
          microsoft_message_id?: string | null
          performed_by?: string | null
          title?: string | null
          type?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_commercial_case_id_fkey"
            columns: ["commercial_case_id"]
            isOneToOne: false
            referencedRelation: "commercial_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_match_runs: {
        Row: {
          chosen_project_id: string | null
          confidence: number
          created_at: string
          event_subject: string | null
          extracted_signals: string[] | null
          final_decision: string | null
          guardrail_reason: string | null
          guardrail_signals: Json | null
          id: string
          latency_ms: number | null
          outcome: string
          reason: string | null
          schedule_block_id: string
        }
        Insert: {
          chosen_project_id?: string | null
          confidence?: number
          created_at?: string
          event_subject?: string | null
          extracted_signals?: string[] | null
          final_decision?: string | null
          guardrail_reason?: string | null
          guardrail_signals?: Json | null
          id?: string
          latency_ms?: number | null
          outcome?: string
          reason?: string | null
          schedule_block_id: string
        }
        Update: {
          chosen_project_id?: string | null
          confidence?: number
          created_at?: string
          event_subject?: string | null
          extracted_signals?: string[] | null
          final_decision?: string | null
          guardrail_reason?: string | null
          guardrail_signals?: Json | null
          id?: string
          latency_ms?: number | null
          outcome?: string
          reason?: string | null
          schedule_block_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_match_runs_schedule_block_id_fkey"
            columns: ["schedule_block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_account_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_account_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_account_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_account_id_fkey"
            columns: ["actor_user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_ai_draft_messages: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          draft_id: string
          id: string
          metadata: Json
          proposal_diff: Json | null
          role: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          draft_id: string
          id?: string
          metadata?: Json
          proposal_diff?: Json | null
          role: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          draft_id?: string
          id?: string
          metadata?: Json
          proposal_diff?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "calc_ai_draft_messages_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "calc_ai_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_ai_drafts: {
        Row: {
          ai_assumptions: string[]
          ai_open_questions: string[]
          ai_proposed_input: Json
          ai_proposed_lines: Json
          ai_summary: string | null
          applied_at: string | null
          applied_calculation_id: string | null
          attachments: Json
          case_id: string | null
          company_id: string | null
          created_at: string
          id: string
          initial_description: string | null
          model_used: string | null
          overall_confidence: number | null
          package_id: string
          status: string
          system_calculation_map: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_assumptions?: string[]
          ai_open_questions?: string[]
          ai_proposed_input?: Json
          ai_proposed_lines?: Json
          ai_summary?: string | null
          applied_at?: string | null
          applied_calculation_id?: string | null
          attachments?: Json
          case_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          initial_description?: string | null
          model_used?: string | null
          overall_confidence?: number | null
          package_id: string
          status?: string
          system_calculation_map?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_assumptions?: string[]
          ai_open_questions?: string[]
          ai_proposed_input?: Json
          ai_proposed_lines?: Json
          ai_summary?: string | null
          applied_at?: string | null
          applied_calculation_id?: string | null
          attachments?: Json
          case_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          initial_description?: string | null
          model_used?: string | null
          overall_confidence?: number | null
          package_id?: string
          status?: string
          system_calculation_map?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calc_ai_drafts_applied_calculation_id_fkey"
            columns: ["applied_calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_ai_drafts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "calc_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_ai_drafts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "calc_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_baseline_amp_rows: {
        Row: {
          amp_key: string
          amp_label: string
          amp_max: number | null
          amp_min: number | null
          hours_per_meter: number
          hours_per_vinkel: number
          id: string
          metadata: Json
          profile_id: string
          sort_order: number
          support_cost_per_meter: number
          trafo_connect_cost: number
        }
        Insert: {
          amp_key: string
          amp_label: string
          amp_max?: number | null
          amp_min?: number | null
          hours_per_meter?: number
          hours_per_vinkel?: number
          id?: string
          metadata?: Json
          profile_id: string
          sort_order?: number
          support_cost_per_meter?: number
          trafo_connect_cost?: number
        }
        Update: {
          amp_key?: string
          amp_label?: string
          amp_max?: number | null
          amp_min?: number | null
          hours_per_meter?: number
          hours_per_vinkel?: number
          id?: string
          metadata?: Json
          profile_id?: string
          sort_order?: number
          support_cost_per_meter?: number
          trafo_connect_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "calc_baseline_amp_rows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "calc_baseline_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_baseline_profiles: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          hourly_rate_cost: number
          id: string
          is_active: boolean
          lift_cost_per_day: number
          metadata: Json
          name: string
          package_id: string
          profit_factor: number
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          hourly_rate_cost?: number
          id?: string
          is_active?: boolean
          lift_cost_per_day?: number
          metadata?: Json
          name: string
          package_id: string
          profit_factor?: number
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          hourly_rate_cost?: number
          id?: string
          is_active?: boolean
          lift_cost_per_day?: number
          metadata?: Json
          name?: string
          package_id?: string
          profit_factor?: number
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "calc_baseline_profiles_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "calc_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_cases: {
        Row: {
          commercial_case_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          source_draft_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          commercial_case_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          source_draft_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          commercial_case_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          source_draft_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calc_cases_commercial_case_id_fkey"
            columns: ["commercial_case_id"]
            isOneToOne: false
            referencedRelation: "commercial_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_cases_source_draft_id_fkey"
            columns: ["source_draft_id"]
            isOneToOne: false
            referencedRelation: "calc_ai_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_cost_prices: {
        Row: {
          company_id: string | null
          component_id: string | null
          cost_amount: number
          created_at: string
          created_by: string | null
          currency: string
          current_class: number | null
          element_key: string | null
          id: string
          notes: string | null
          recommended_sales_amount: number | null
          series_id: string | null
          source: string
          unit: string
          updated_at: string
          valid_from: string
          valid_to: string | null
          vendor_id: string | null
        }
        Insert: {
          company_id?: string | null
          component_id?: string | null
          cost_amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          current_class?: number | null
          element_key?: string | null
          id?: string
          notes?: string | null
          recommended_sales_amount?: number | null
          series_id?: string | null
          source?: string
          unit?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          vendor_id?: string | null
        }
        Update: {
          company_id?: string | null
          component_id?: string | null
          cost_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          current_class?: number | null
          element_key?: string | null
          id?: string
          notes?: string | null
          recommended_sales_amount?: number | null
          series_id?: string | null
          source?: string
          unit?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calc_cost_prices_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "calc_vendor_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_cost_prices_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "calc_vendor_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_cost_prices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "calc_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_norm_table_rows: {
        Row: {
          context: Json
          element_key: string
          hours: number
          id: string
          label: string | null
          norm_table_id: string
          sort_order: number
          unit: string
        }
        Insert: {
          context?: Json
          element_key: string
          hours?: number
          id?: string
          label?: string | null
          norm_table_id: string
          sort_order?: number
          unit?: string
        }
        Update: {
          context?: Json
          element_key?: string
          hours?: number
          id?: string
          label?: string | null
          norm_table_id?: string
          sort_order?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "calc_norm_table_rows_norm_table_id_fkey"
            columns: ["norm_table_id"]
            isOneToOne: false
            referencedRelation: "calc_norm_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_norm_tables: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          package_id: string | null
          source: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          package_id?: string | null
          source?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          package_id?: string | null
          source?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "calc_norm_tables_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "calc_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_package_fields: {
        Row: {
          created_at: string
          default_value: Json | null
          field_key: string
          field_type: string
          help_text: string | null
          id: string
          is_required: boolean
          label: string
          options: Json
          package_id: string
          section_key: string
          sort_order: number
          unit: string | null
          validation_rule: Json | null
          visibility_rule: Json | null
        }
        Insert: {
          created_at?: string
          default_value?: Json | null
          field_key: string
          field_type: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label: string
          options?: Json
          package_id: string
          section_key?: string
          sort_order?: number
          unit?: string | null
          validation_rule?: Json | null
          visibility_rule?: Json | null
        }
        Update: {
          created_at?: string
          default_value?: Json | null
          field_key?: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label?: string
          options?: Json
          package_id?: string
          section_key?: string
          sort_order?: number
          unit?: string | null
          validation_rule?: Json | null
          visibility_rule?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "calc_package_fields_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "calc_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_packages: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          created_by: string | null
          default_sections: Json
          description: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_sections?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_sections?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      calc_rate_table_rows: {
        Row: {
          context: Json
          id: string
          label: string | null
          rate_key: string
          rate_table_id: string
          sort_order: number
          unit: string | null
          value: number
        }
        Insert: {
          context?: Json
          id?: string
          label?: string | null
          rate_key: string
          rate_table_id: string
          sort_order?: number
          unit?: string | null
          value?: number
        }
        Update: {
          context?: Json
          id?: string
          label?: string | null
          rate_key?: string
          rate_table_id?: string
          sort_order?: number
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "calc_rate_table_rows_rate_table_id_fkey"
            columns: ["rate_table_id"]
            isOneToOne: false
            referencedRelation: "calc_rate_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_rate_tables: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          package_id: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          package_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          package_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "calc_rate_tables_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "calc_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_vendor_components: {
        Row: {
          created_at: string
          current_class: number | null
          element_key: string
          id: string
          is_active: boolean
          label: string
          metadata: Json
          series_id: string
          unit: string
          updated_at: string
          vendor_part_number: string | null
        }
        Insert: {
          created_at?: string
          current_class?: number | null
          element_key: string
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          series_id: string
          unit?: string
          updated_at?: string
          vendor_part_number?: string | null
        }
        Update: {
          created_at?: string
          current_class?: number | null
          element_key?: string
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          series_id?: string
          unit?: string
          updated_at?: string
          vendor_part_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calc_vendor_components_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "calc_vendor_series"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_vendor_series: {
        Row: {
          conductor_type: string | null
          created_at: string
          current_classes: number[]
          finish: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          slug: string
          sort_order: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          conductor_type?: string | null
          created_at?: string
          current_classes?: number[]
          finish?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          conductor_type?: string | null
          created_at?: string
          current_classes?: number[]
          finish?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calc_vendor_series_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "calc_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_vendors: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      calculation_items: {
        Row: {
          calculation_id: string
          created_at: string
          description: string | null
          id: string
          quantity: number
          suggested_by_ai: boolean | null
          title: string
          total_price: number
          type: Database["public"]["Enums"]["calculation_item_type"]
          unit: string | null
          unit_price: number
        }
        Insert: {
          calculation_id: string
          created_at?: string
          description?: string | null
          id?: string
          quantity?: number
          suggested_by_ai?: boolean | null
          title: string
          total_price?: number
          type: Database["public"]["Enums"]["calculation_item_type"]
          unit?: string | null
          unit_price?: number
        }
        Update: {
          calculation_id?: string
          created_at?: string
          description?: string | null
          id?: string
          quantity?: number
          suggested_by_ai?: boolean | null
          title?: string
          total_price?: number
          type?: Database["public"]["Enums"]["calculation_item_type"]
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "calculation_items_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_lines: {
        Row: {
          adjusted_hours: number
          calculation_id: string
          cost_amount: number
          created_at: string
          description: string
          id: string
          is_internal_only: boolean
          is_locked: boolean
          is_overridden: boolean
          line_key: string | null
          metadata: Json
          norm_hours: number
          qty: number
          sales_amount: number
          sort_order: number
          source_ref: string | null
          source_type: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          adjusted_hours?: number
          calculation_id: string
          cost_amount?: number
          created_at?: string
          description: string
          id?: string
          is_internal_only?: boolean
          is_locked?: boolean
          is_overridden?: boolean
          line_key?: string | null
          metadata?: Json
          norm_hours?: number
          qty?: number
          sales_amount?: number
          sort_order?: number
          source_ref?: string | null
          source_type?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          adjusted_hours?: number
          calculation_id?: string
          cost_amount?: number
          created_at?: string
          description?: string
          id?: string
          is_internal_only?: boolean
          is_locked?: boolean
          is_overridden?: boolean
          line_key?: string | null
          metadata?: Json
          norm_hours?: number
          qty?: number
          sales_amount?: number
          sort_order?: number
          source_ref?: string | null
          source_type?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_lines_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      calculations: {
        Row: {
          ai_analysis: Json | null
          attachments: Json | null
          case_id: string | null
          case_sort_order: number | null
          case_system_key: string | null
          commercial_case_id: string | null
          company_id: string | null
          contact_person_id: string | null
          created_at: string
          created_by: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          external_tripletex_number: string | null
          id: string
          input_snapshot: Json
          last_activity_at: string | null
          lead_id: string | null
          next_step: string | null
          next_step_at: string | null
          norm_table_id: string | null
          package_id: string | null
          parent_offer_id: string | null
          project_title: string
          rate_table_id: string | null
          responsible_user_id: string | null
          show_discount_in_offer: boolean
          source_case_id: string | null
          source_case_item_id: string | null
          source_kind: string | null
          status: Database["public"]["Enums"]["calculation_status"]
          total_labor: number | null
          total_material: number | null
          total_price: number | null
          totals_snapshot: Json
          updated_at: string
          version_number: number
        }
        Insert: {
          ai_analysis?: Json | null
          attachments?: Json | null
          case_id?: string | null
          case_sort_order?: number | null
          case_system_key?: string | null
          commercial_case_id?: string | null
          company_id?: string | null
          contact_person_id?: string | null
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          external_tripletex_number?: string | null
          id?: string
          input_snapshot?: Json
          last_activity_at?: string | null
          lead_id?: string | null
          next_step?: string | null
          next_step_at?: string | null
          norm_table_id?: string | null
          package_id?: string | null
          parent_offer_id?: string | null
          project_title: string
          rate_table_id?: string | null
          responsible_user_id?: string | null
          show_discount_in_offer?: boolean
          source_case_id?: string | null
          source_case_item_id?: string | null
          source_kind?: string | null
          status?: Database["public"]["Enums"]["calculation_status"]
          total_labor?: number | null
          total_material?: number | null
          total_price?: number | null
          totals_snapshot?: Json
          updated_at?: string
          version_number?: number
        }
        Update: {
          ai_analysis?: Json | null
          attachments?: Json | null
          case_id?: string | null
          case_sort_order?: number | null
          case_system_key?: string | null
          commercial_case_id?: string | null
          company_id?: string | null
          contact_person_id?: string | null
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          external_tripletex_number?: string | null
          id?: string
          input_snapshot?: Json
          last_activity_at?: string | null
          lead_id?: string | null
          next_step?: string | null
          next_step_at?: string | null
          norm_table_id?: string | null
          package_id?: string | null
          parent_offer_id?: string | null
          project_title?: string
          rate_table_id?: string | null
          responsible_user_id?: string | null
          show_discount_in_offer?: boolean
          source_case_id?: string | null
          source_case_item_id?: string | null
          source_kind?: string | null
          status?: Database["public"]["Enums"]["calculation_status"]
          total_labor?: number | null
          total_material?: number | null
          total_price?: number | null
          totals_snapshot?: Json
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "calculations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "calc_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_commercial_case_id_fkey"
            columns: ["commercial_case_id"]
            isOneToOne: false
            referencedRelation: "commercial_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_contact_person_id_fkey"
            columns: ["contact_person_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_norm_table_id_fkey"
            columns: ["norm_table_id"]
            isOneToOne: false
            referencedRelation: "calc_norm_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "calc_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_parent_offer_id_fkey"
            columns: ["parent_offer_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_rate_table_id_fkey"
            columns: ["rate_table_id"]
            isOneToOne: false
            referencedRelation: "calc_rate_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_source_case_id_fkey"
            columns: ["source_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculations_source_case_item_id_fkey"
            columns: ["source_case_item_id"]
            isOneToOne: false
            referencedRelation: "case_items"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_delete_retry_queue: {
        Row: {
          attempts: number
          candidate_event_ids: Json
          created_at: string
          end_at: string | null
          event_id: string
          event_technician_id: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          mailbox: string | null
          next_attempt_at: string
          resolved_at: string | null
          start_at: string | null
          status: string
          technician_id: string
          technician_name: string | null
          technician_user_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          candidate_event_ids?: Json
          created_at?: string
          end_at?: string | null
          event_id: string
          event_technician_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          mailbox?: string | null
          next_attempt_at?: string
          resolved_at?: string | null
          start_at?: string | null
          status?: string
          technician_id: string
          technician_name?: string | null
          technician_user_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          candidate_event_ids?: Json
          created_at?: string
          end_at?: string | null
          event_id?: string
          event_technician_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          mailbox?: string | null
          next_attempt_at?: string
          resolved_at?: string | null
          start_at?: string | null
          status?: string
          technician_id?: string
          technician_name?: string | null
          technician_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_delete_retry_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_delete_retry_queue_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      case_items: {
        Row: {
          attachments_meta: Json | null
          body_html: string | null
          body_preview: string | null
          body_text: string | null
          case_id: string
          cc_emails: string[] | null
          company_id: string
          conversation_id: string | null
          created_at: string
          created_by: string | null
          external_id: string | null
          from_email: string | null
          from_name: string | null
          id: string
          in_reply_to: string | null
          internet_message_id: string | null
          is_read: boolean
          mention_parse_version: number
          mentioned_emails: string[]
          mentioned_user_ids: string[]
          received_at: string | null
          references_header: string | null
          sent_at: string | null
          subject: string | null
          subject_normalized: string | null
          to_emails: string[] | null
          type: string
        }
        Insert: {
          attachments_meta?: Json | null
          body_html?: string | null
          body_preview?: string | null
          body_text?: string | null
          case_id: string
          cc_emails?: string[] | null
          company_id: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          internet_message_id?: string | null
          is_read?: boolean
          mention_parse_version?: number
          mentioned_emails?: string[]
          mentioned_user_ids?: string[]
          received_at?: string | null
          references_header?: string | null
          sent_at?: string | null
          subject?: string | null
          subject_normalized?: string | null
          to_emails?: string[] | null
          type?: string
        }
        Update: {
          attachments_meta?: Json | null
          body_html?: string | null
          body_preview?: string | null
          body_text?: string | null
          case_id?: string
          cc_emails?: string[] | null
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          internet_message_id?: string | null
          is_read?: boolean
          mention_parse_version?: number
          mentioned_emails?: string[]
          mentioned_user_ids?: string[]
          received_at?: string | null
          references_header?: string | null
          sent_at?: string | null
          subject?: string | null
          subject_normalized?: string | null
          to_emails?: string[] | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      case_routing_rules: {
        Row: {
          ai_category_in: string[] | null
          body_contains: string | null
          company_id: string
          created_at: string
          from_contains: string | null
          id: string
          is_enabled: boolean
          mailbox_address: string | null
          name: string
          next_action_set:
            | Database["public"]["Enums"]["case_next_action"]
            | null
          owner_user_id_set: string | null
          priority_set: Database["public"]["Enums"]["case_priority"] | null
          scope_set: Database["public"]["Enums"]["case_scope"] | null
          status_set: Database["public"]["Enums"]["case_status"] | null
          subject_contains: string | null
        }
        Insert: {
          ai_category_in?: string[] | null
          body_contains?: string | null
          company_id: string
          created_at?: string
          from_contains?: string | null
          id?: string
          is_enabled?: boolean
          mailbox_address?: string | null
          name: string
          next_action_set?:
            | Database["public"]["Enums"]["case_next_action"]
            | null
          owner_user_id_set?: string | null
          priority_set?: Database["public"]["Enums"]["case_priority"] | null
          scope_set?: Database["public"]["Enums"]["case_scope"] | null
          status_set?: Database["public"]["Enums"]["case_status"] | null
          subject_contains?: string | null
        }
        Update: {
          ai_category_in?: string[] | null
          body_contains?: string | null
          company_id?: string
          created_at?: string
          from_contains?: string | null
          id?: string
          is_enabled?: boolean
          mailbox_address?: string | null
          name?: string
          next_action_set?:
            | Database["public"]["Enums"]["case_next_action"]
            | null
          owner_user_id_set?: string | null
          priority_set?: Database["public"]["Enums"]["case_priority"] | null
          scope_set?: Database["public"]["Enums"]["case_scope"] | null
          status_set?: Database["public"]["Enums"]["case_status"] | null
          subject_contains?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_routing_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assigned_at: string | null
          assigned_to_user_id: string | null
          case_number: string
          company_id: string
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          due_at: string | null
          id: string
          last_activity_at: string | null
          last_activity_by_user_id: string | null
          lead_id: string | null
          linked_lead_id: string | null
          linked_offer_id: string | null
          linked_order_submission_id: string | null
          linked_project_id: string | null
          linked_work_order_id: string | null
          mailbox_address: string | null
          next_action: Database["public"]["Enums"]["case_next_action"]
          offer_id: string | null
          owner_user_id: string | null
          participant_user_ids: string[] | null
          priority: Database["public"]["Enums"]["case_priority"]
          project_id: string | null
          resolution_type: string | null
          scope: Database["public"]["Enums"]["case_scope"]
          service_job_id: string | null
          source_order_form_id: string | null
          status: Database["public"]["Enums"]["case_status"]
          thread_id: string | null
          title: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          case_number?: string
          company_id: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_at?: string | null
          id?: string
          last_activity_at?: string | null
          last_activity_by_user_id?: string | null
          lead_id?: string | null
          linked_lead_id?: string | null
          linked_offer_id?: string | null
          linked_order_submission_id?: string | null
          linked_project_id?: string | null
          linked_work_order_id?: string | null
          mailbox_address?: string | null
          next_action?: Database["public"]["Enums"]["case_next_action"]
          offer_id?: string | null
          owner_user_id?: string | null
          participant_user_ids?: string[] | null
          priority?: Database["public"]["Enums"]["case_priority"]
          project_id?: string | null
          resolution_type?: string | null
          scope?: Database["public"]["Enums"]["case_scope"]
          service_job_id?: string | null
          source_order_form_id?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          thread_id?: string | null
          title?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          case_number?: string
          company_id?: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_at?: string | null
          id?: string
          last_activity_at?: string | null
          last_activity_by_user_id?: string | null
          lead_id?: string | null
          linked_lead_id?: string | null
          linked_offer_id?: string | null
          linked_order_submission_id?: string | null
          linked_project_id?: string | null
          linked_work_order_id?: string | null
          mailbox_address?: string | null
          next_action?: Database["public"]["Enums"]["case_next_action"]
          offer_id?: string | null
          owner_user_id?: string | null
          participant_user_ids?: string[] | null
          priority?: Database["public"]["Enums"]["case_priority"]
          project_id?: string | null
          resolution_type?: string | null
          scope?: Database["public"]["Enums"]["case_scope"]
          service_job_id?: string | null
          source_order_form_id?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          thread_id?: string | null
          title?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_linked_lead_id_fkey"
            columns: ["linked_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_linked_offer_id_fkey"
            columns: ["linked_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_linked_order_submission_id_fkey"
            columns: ["linked_order_submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_linked_project_id_fkey"
            columns: ["linked_project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_linked_work_order_id_fkey"
            columns: ["linked_work_order_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_service_job_id_fkey"
            columns: ["service_job_id"]
            isOneToOne: false
            referencedRelation: "service_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_source_order_form_id_fkey"
            columns: ["source_order_form_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_cases: {
        Row: {
          case_number: string | null
          company_id: string
          contact_person_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          expected_close_date: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          next_step: string | null
          next_step_due_at: string | null
          owner_user_id: string | null
          phase: string
          probability_pct: number | null
          source: string | null
          source_ref: string | null
          tags: string[] | null
          title: string
          updated_at: string
          value_estimate: number | null
          won_at: string | null
        }
        Insert: {
          case_number?: string | null
          company_id: string
          contact_person_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          expected_close_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          next_step?: string | null
          next_step_due_at?: string | null
          owner_user_id?: string | null
          phase?: string
          probability_pct?: number | null
          source?: string | null
          source_ref?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          value_estimate?: number | null
          won_at?: string | null
        }
        Update: {
          case_number?: string | null
          company_id?: string
          contact_person_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          expected_close_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          next_step?: string | null
          next_step_due_at?: string | null
          owner_user_id?: string | null
          phase?: string
          probability_pct?: number | null
          source?: string | null
          source_ref?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          value_estimate?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_cases_contact_person_id_fkey"
            columns: ["contact_person_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_logs: {
        Row: {
          bcc_recipients: Json | null
          body_preview: string | null
          cc_recipients: Json | null
          conversation_id: string | null
          created_at: string
          created_by: string
          direction: string
          entity_id: string
          entity_type: string
          graph_message_id: string | null
          id: string
          internet_message_id: string | null
          is_orphan: boolean
          last_error: Json | null
          last_operation_at: string | null
          last_operation_id: string | null
          mode: string
          orphan_detected_at: string | null
          orphan_reason: string | null
          outlook_weblink: string | null
          ref_code: string | null
          send_hash: string | null
          subject: string
          to_recipients: Json
          updated_at: string
        }
        Insert: {
          bcc_recipients?: Json | null
          body_preview?: string | null
          cc_recipients?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_by: string
          direction?: string
          entity_id: string
          entity_type: string
          graph_message_id?: string | null
          id?: string
          internet_message_id?: string | null
          is_orphan?: boolean
          last_error?: Json | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          mode?: string
          orphan_detected_at?: string | null
          orphan_reason?: string | null
          outlook_weblink?: string | null
          ref_code?: string | null
          send_hash?: string | null
          subject?: string
          to_recipients?: Json
          updated_at?: string
        }
        Update: {
          bcc_recipients?: Json | null
          body_preview?: string | null
          cc_recipients?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          direction?: string
          entity_id?: string
          entity_type?: string
          graph_message_id?: string | null
          id?: string
          internet_message_id?: string | null
          is_orphan?: boolean
          last_error?: Json | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          mode?: string
          orphan_detected_at?: string | null
          orphan_reason?: string | null
          outlook_weblink?: string | null
          ref_code?: string | null
          send_hash?: string | null
          subject?: string
          to_recipients?: Json
          updated_at?: string
        }
        Relationships: []
      }
      company_reminder_settings: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          escalation_delay_minutes: number
          id: string
          max_reminders: number
          notify_manager: boolean
          reminder_1_minutes: number
          reminder_2_minutes: number
          reminder_3_minutes: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          escalation_delay_minutes?: number
          id?: string
          max_reminders?: number
          notify_manager?: boolean
          reminder_1_minutes?: number
          reminder_2_minutes?: number
          reminder_3_minutes?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          escalation_delay_minutes?: number
          id?: string
          max_reminders?: number
          notify_manager?: boolean
          reminder_1_minutes?: number
          reminder_2_minutes?: number
          reminder_3_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_reminder_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          bank_account: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          default_offer_conditions: string | null
          default_offer_footer: string | null
          default_offer_valid_days: number | null
          default_payment_terms: string | null
          email: string | null
          iban: string | null
          id: string
          logo_url: string | null
          org_number: string | null
          phone: string | null
          postal_code: string | null
          primary_color: string | null
          secondary_color: string | null
          sharepoint_base_path: string | null
          sharepoint_drive_id: string | null
          sharepoint_site_id: string | null
          swift: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          default_offer_conditions?: string | null
          default_offer_footer?: string | null
          default_offer_valid_days?: number | null
          default_payment_terms?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          org_number?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          sharepoint_base_path?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_site_id?: string | null
          swift?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          default_offer_conditions?: string | null
          default_offer_footer?: string | null
          default_offer_valid_days?: number | null
          default_payment_terms?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          org_number?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          sharepoint_base_path?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_site_id?: string | null
          swift?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      compliance_audits: {
        Row: {
          areas: string[]
          audit_type: string
          company_id: string
          conclusion: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deviations: string | null
          findings: string | null
          id: string
          improvements: string | null
          participants: string[]
          performed_at: string | null
          planned_date: string | null
          responsible_person_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          areas?: string[]
          audit_type?: string
          company_id: string
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deviations?: string | null
          findings?: string | null
          id?: string
          improvements?: string | null
          participants?: string[]
          performed_at?: string | null
          planned_date?: string | null
          responsible_person_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          areas?: string[]
          audit_type?: string
          company_id?: string
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deviations?: string | null
          findings?: string | null
          id?: string
          improvements?: string | null
          participants?: string[]
          performed_at?: string | null
          planned_date?: string | null
          responsible_person_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_audits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_audits_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_audits_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_competence_requirements: {
        Row: {
          active: boolean
          company_id: string
          competence_type_id: string
          created_at: string
          created_by: string | null
          description: string | null
          document_required: boolean
          id: string
          reason: string | null
          required: boolean
          scope_id: string | null
          scope_type: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          validity_months: number | null
          warning_days: number | null
        }
        Insert: {
          active?: boolean
          company_id: string
          competence_type_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_required?: boolean
          id?: string
          reason?: string | null
          required?: boolean
          scope_id?: string | null
          scope_type: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          validity_months?: number | null
          warning_days?: number | null
        }
        Update: {
          active?: boolean
          company_id?: string
          competence_type_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_required?: boolean
          id?: string
          reason?: string | null
          required?: boolean
          scope_id?: string | null
          scope_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          validity_months?: number | null
          warning_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_competence_requirements_competence_type_id_fkey"
            columns: ["competence_type_id"]
            isOneToOne: false
            referencedRelation: "compliance_competence_types"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_competence_types: {
        Row: {
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          default_validity_months: number | null
          description: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          required_for_all: boolean
          requires_document: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          default_validity_months?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          required_for_all?: boolean
          requires_document?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          default_validity_months?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          required_for_all?: boolean
          requires_document?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_competence_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_competences: {
        Row: {
          comment: string | null
          company_id: string
          competence_type_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_id: string | null
          expires_at: string | null
          id: string
          issued_at: string | null
          issuer: string | null
          person_id: string
          reference_number: string | null
          type_label: string | null
          updated_at: string
          valid_from: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          comment?: string | null
          company_id: string
          competence_type_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_id?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          issuer?: string | null
          person_id: string
          reference_number?: string | null
          type_label?: string | null
          updated_at?: string
          valid_from?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          comment?: string | null
          company_id?: string
          competence_type_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_id?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          issuer?: string | null
          person_id?: string
          reference_number?: string | null
          type_label?: string | null
          updated_at?: string
          valid_from?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_competences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_competences_competence_type_id_fkey"
            columns: ["competence_type_id"]
            isOneToOne: false
            referencedRelation: "compliance_competence_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_competences_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_competences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_competences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_job_roles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_field_role: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_field_role?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_field_role?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      compliance_notification_queue: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          error: string | null
          id: string
          payload: Json
          recipient_email: string | null
          recipient_person_id: string | null
          sent_at: string | null
          status: string
          threshold_days: number | null
        }
        Insert: {
          channel?: string
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          error?: string | null
          id?: string
          payload?: Json
          recipient_email?: string | null
          recipient_person_id?: string | null
          sent_at?: string | null
          status?: string
          threshold_days?: number | null
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          error?: string | null
          id?: string
          payload?: Json
          recipient_email?: string | null
          recipient_person_id?: string | null
          sent_at?: string | null
          status?: string
          threshold_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_notification_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notification_queue_recipient_person_id_fkey"
            columns: ["recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notification_queue_recipient_person_id_fkey"
            columns: ["recipient_person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_org_roles: {
        Row: {
          authority: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          deputy_person_id: string | null
          id: string
          person_id: string | null
          reports_to_id: string | null
          responsibilities: string | null
          role_type: string
          sort_order: number
          tasks: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          authority?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          deputy_person_id?: string | null
          id?: string
          person_id?: string | null
          reports_to_id?: string | null
          responsibilities?: string | null
          role_type?: string
          sort_order?: number
          tasks?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          authority?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          deputy_person_id?: string | null
          id?: string
          person_id?: string | null
          reports_to_id?: string | null
          responsibilities?: string | null
          role_type?: string
          sort_order?: number
          tasks?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_org_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_org_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_org_roles_deputy_person_id_fkey"
            columns: ["deputy_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_org_roles_deputy_person_id_fkey"
            columns: ["deputy_person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_org_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_org_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_org_roles_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "compliance_org_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_regulations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          last_reviewed_at: string | null
          name: string
          next_review_at: string | null
          notes: string | null
          reg_type: string
          relevance: string | null
          responsible_person_id: string | null
          responsible_role: string | null
          review_interval_months: number | null
          short_name: string | null
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          last_reviewed_at?: string | null
          name: string
          next_review_at?: string | null
          notes?: string | null
          reg_type?: string
          relevance?: string | null
          responsible_person_id?: string | null
          responsible_role?: string | null
          review_interval_months?: number | null
          short_name?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          last_reviewed_at?: string | null
          name?: string
          next_review_at?: string | null
          notes?: string | null
          reg_type?: string
          relevance?: string | null
          responsible_person_id?: string | null
          responsible_role?: string | null
          review_interval_months?: number | null
          short_name?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_regulations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_regulations_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_regulations_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      confirmation_learnings: {
        Row: {
          alias_hits: string[] | null
          company_id: string
          confirmed_at: string
          customer_hits: string[] | null
          expires_at: string
          id: string
          project_id: string
          signal_tokens: string[]
          source_block_id: string | null
          technician_id: string
        }
        Insert: {
          alias_hits?: string[] | null
          company_id: string
          confirmed_at?: string
          customer_hits?: string[] | null
          expires_at?: string
          id?: string
          project_id: string
          signal_tokens?: string[]
          source_block_id?: string | null
          technician_id: string
        }
        Update: {
          alias_hits?: string[] | null
          company_id?: string
          confirmed_at?: string
          customer_hits?: string[] | null
          expires_at?: string
          id?: string
          project_id?: string
          signal_tokens?: string[]
          source_block_id?: string | null
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "confirmation_learnings_source_block_id_fkey"
            columns: ["source_block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_alerts: {
        Row: {
          alert_type: string
          company_id: string
          contract_id: string
          created_at: string
          due_date: string | null
          id: string
          is_read: boolean | null
          job_id: string | null
          message: string
          severity: string
          target_user_id: string | null
          title: string
        }
        Insert: {
          alert_type: string
          company_id: string
          contract_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_read?: boolean | null
          job_id?: string | null
          message: string
          severity: string
          target_user_id?: string | null
          title: string
        }
        Update: {
          alert_type?: string
          company_id?: string
          contract_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_read?: boolean | null
          job_id?: string | null
          message?: string
          severity?: string
          target_user_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_alerts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_alerts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_cron_runs: {
        Row: {
          created_alerts_count: number
          dry_run: boolean
          error_code: string | null
          error_message: string | null
          id: string
          notified_users_count: number
          ran_at: string
          scanned_deadlines_count: number
          status: string
        }
        Insert: {
          created_alerts_count?: number
          dry_run?: boolean
          error_code?: string | null
          error_message?: string | null
          id?: string
          notified_users_count?: number
          ran_at?: string
          scanned_deadlines_count?: number
          status?: string
        }
        Update: {
          created_alerts_count?: number
          dry_run?: boolean
          error_code?: string | null
          error_message?: string | null
          id?: string
          notified_users_count?: number
          ran_at?: string
          scanned_deadlines_count?: number
          status?: string
        }
        Relationships: []
      }
      contract_deadlines: {
        Row: {
          company_id: string
          contract_id: string
          created_at: string
          due_date: string
          id: string
          job_id: string | null
          notify_days_before: number[] | null
          owner_user_id: string | null
          severity: string | null
          status: string | null
          title: string
          type: string
        }
        Insert: {
          company_id: string
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          job_id?: string | null
          notify_days_before?: number[] | null
          owner_user_id?: string | null
          severity?: string | null
          status?: string | null
          title: string
          type: string
        }
        Update: {
          company_id?: string
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          job_id?: string | null
          notify_days_before?: number[] | null
          owner_user_id?: string | null
          severity?: string | null
          status?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_deadlines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deadlines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deadlines_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_documents: {
        Row: {
          company_id: string
          contract_id: string
          file_name: string
          file_path: string
          id: string
          is_primary: boolean | null
          mime_type: string
          uploaded_at: string
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          company_id: string
          contract_id: string
          file_name: string
          file_path: string
          id?: string
          is_primary?: boolean | null
          mime_type: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          company_id?: string
          contract_id?: string
          file_name?: string
          file_path?: string
          id?: string
          is_primary?: boolean | null
          mime_type?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          ai_confidence: number | null
          ai_summary_econ: string | null
          ai_summary_field: string | null
          ai_summary_pl: string | null
          company_id: string
          contract_type: string | null
          counterparty_name: string | null
          created_at: string
          created_by: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          end_date: string | null
          executing_company_ids: string[] | null
          id: string
          job_id: string | null
          last_analyzed_at: string | null
          last_analyzed_by: string | null
          lead_id: string | null
          penalty_rate: number | null
          penalty_type: string | null
          penalty_unit: string | null
          risk_level: string | null
          risk_score: number | null
          signed_date: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
          warranty_months: number | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_summary_econ?: string | null
          ai_summary_field?: string | null
          ai_summary_pl?: string | null
          company_id: string
          contract_type?: string | null
          counterparty_name?: string | null
          created_at?: string
          created_by: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          end_date?: string | null
          executing_company_ids?: string[] | null
          id?: string
          job_id?: string | null
          last_analyzed_at?: string | null
          last_analyzed_by?: string | null
          lead_id?: string | null
          penalty_rate?: number | null
          penalty_type?: string | null
          penalty_unit?: string | null
          risk_level?: string | null
          risk_score?: number | null
          signed_date?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          warranty_months?: number | null
        }
        Update: {
          ai_confidence?: number | null
          ai_summary_econ?: string | null
          ai_summary_field?: string | null
          ai_summary_pl?: string | null
          company_id?: string
          contract_type?: string | null
          counterparty_name?: string | null
          created_at?: string
          created_by?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          end_date?: string | null
          executing_company_ids?: string[] | null
          id?: string
          job_id?: string | null
          last_analyzed_at?: string | null
          last_analyzed_by?: string | null
          lead_id?: string | null
          penalty_rate?: number | null
          penalty_type?: string | null
          penalty_unit?: string | null
          risk_level?: string | null
          risk_score?: number | null
          signed_date?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          post_id: string
          sharepoint_drive_item_id: string | null
          sharepoint_web_url: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          post_id: string
          sharepoint_drive_item_id?: string | null
          sharepoint_web_url?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          post_id?: string
          sharepoint_drive_item_id?: string | null
          sharepoint_web_url?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "conversation_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_email_dead_letters: {
        Row: {
          attempt_count: number
          company_id: string | null
          created_at: string
          error: string | null
          graph_message_id: string | null
          headers: Json | null
          id: string
          internet_message_id: string | null
          raw_payload: Json
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          company_id?: string | null
          created_at?: string
          error?: string | null
          graph_message_id?: string | null
          headers?: Json | null
          id?: string
          internet_message_id?: string | null
          raw_payload: Json
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          company_id?: string | null
          created_at?: string
          error?: string | null
          graph_message_id?: string | null
          headers?: Json | null
          id?: string
          internet_message_id?: string | null
          raw_payload?: Json
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_email_dead_letters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_email_messages: {
        Row: {
          cc_emails: string[] | null
          company_id: string
          created_at: string
          direction: string
          error: string | null
          from_email: string | null
          id: string
          outlook_conversation_id: string | null
          outlook_internet_message_id: string | null
          outlook_message_id: string | null
          outlook_weblink: string | null
          post_id: string | null
          processed_at: string | null
          processing_duration_ms: number | null
          processing_status: string | null
          provider: string
          status: string
          subject: string | null
          thread_id: string
          to_emails: string[] | null
          verified: boolean | null
          webhook_received_at: string | null
        }
        Insert: {
          cc_emails?: string[] | null
          company_id: string
          created_at?: string
          direction: string
          error?: string | null
          from_email?: string | null
          id?: string
          outlook_conversation_id?: string | null
          outlook_internet_message_id?: string | null
          outlook_message_id?: string | null
          outlook_weblink?: string | null
          post_id?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_status?: string | null
          provider?: string
          status?: string
          subject?: string | null
          thread_id: string
          to_emails?: string[] | null
          verified?: boolean | null
          webhook_received_at?: string | null
        }
        Update: {
          cc_emails?: string[] | null
          company_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          from_email?: string | null
          id?: string
          outlook_conversation_id?: string | null
          outlook_internet_message_id?: string | null
          outlook_message_id?: string | null
          outlook_weblink?: string | null
          post_id?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_status?: string | null
          provider?: string
          status?: string
          subject?: string | null
          thread_id?: string
          to_emails?: string[] | null
          verified?: boolean | null
          webhook_received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_email_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_email_messages_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "conversation_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_inbox_items: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          post_id: string
          reason: string
          target_user_account_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          post_id: string
          reason?: string
          target_user_account_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          post_id?: string
          reason?: string
          target_user_account_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_inbox_items_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_inbox_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "conversation_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_inbox_items_target_user_account_id_fkey"
            columns: ["target_user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_inbox_items_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_posts: {
        Row: {
          author_id: string | null
          body_clean: string | null
          body_html: string | null
          body_raw: string | null
          body_text: string | null
          cc_emails: string[] | null
          company_id: string
          context_location_text: string | null
          context_object_ref: string | null
          context_object_type: string | null
          context_tags: string[] | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          direction: string | null
          from_email: string | null
          from_name: string | null
          id: string
          is_pinned: boolean
          outlook_message_id: string | null
          outlook_weblink: string | null
          post_type: Database["public"]["Enums"]["conversation_post_type"]
          reply_to_post_id: string | null
          sent_at: string | null
          subject: string | null
          thread_id: string
          to_emails: string[] | null
        }
        Insert: {
          author_id?: string | null
          body_clean?: string | null
          body_html?: string | null
          body_raw?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          company_id: string
          context_location_text?: string | null
          context_object_ref?: string | null
          context_object_type?: string | null
          context_tags?: string[] | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_pinned?: boolean
          outlook_message_id?: string | null
          outlook_weblink?: string | null
          post_type?: Database["public"]["Enums"]["conversation_post_type"]
          reply_to_post_id?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id: string
          to_emails?: string[] | null
        }
        Update: {
          author_id?: string | null
          body_clean?: string | null
          body_html?: string | null
          body_raw?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          company_id?: string
          context_location_text?: string | null
          context_object_ref?: string | null
          context_object_type?: string | null
          context_tags?: string[] | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_pinned?: boolean
          outlook_message_id?: string | null
          outlook_weblink?: string | null
          post_type?: Database["public"]["Enums"]["conversation_post_type"]
          reply_to_post_id?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string
          to_emails?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_posts_reply_to_post_id_fkey"
            columns: ["reply_to_post_id"]
            isOneToOne: false
            referencedRelation: "conversation_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_posts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_thread_invites: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string
          id: string
          invite_token: string
          invited_by_participant_id: string
          invited_email: string
          invited_name: string | null
          status: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invited_by_participant_id: string
          invited_email: string
          invited_name?: string | null
          status?: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invited_by_participant_id?: string
          invited_email?: string
          invited_name?: string | null
          status?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_thread_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_thread_invites_invited_by_participant_id_fkey"
            columns: ["invited_by_participant_id"]
            isOneToOne: false
            referencedRelation: "conversation_thread_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_thread_invites_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_thread_participants: {
        Row: {
          added_at: string
          added_by: string | null
          can_invite_external: boolean
          can_invite_internal: boolean
          company_id: string
          display_name: string | null
          email: string | null
          id: string
          participant_type: string
          project_id: string
          receive_email: boolean
          thread_id: string
          user_account_id: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          can_invite_external?: boolean
          can_invite_internal?: boolean
          company_id: string
          display_name?: string | null
          email?: string | null
          id?: string
          participant_type: string
          project_id: string
          receive_email?: boolean
          thread_id: string
          user_account_id?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          can_invite_external?: boolean
          can_invite_internal?: boolean
          company_id?: string
          display_name?: string | null
          email?: string | null
          id?: string
          participant_type?: string
          project_id?: string
          receive_email?: boolean
          thread_id?: string
          user_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_thread_participants_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_thread_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_thread_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_thread_participants_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_threads: {
        Row: {
          allow_participants_invite: boolean
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          decision_marked_at: string | null
          decision_marked_by: string | null
          decision_summary: string | null
          deleted_at: string | null
          deleted_by: string | null
          email_enabled: boolean
          email_subject: string | null
          email_thread_id: string | null
          id: string
          inbound_token: string | null
          is_archived: boolean
          is_formal_decision: boolean
          last_activity_at: string
          last_author_name: string | null
          last_emailed_at: string | null
          linked_offer_id: string | null
          linked_order_id: string | null
          linked_order_line_id: string | null
          participants_only: boolean
          post_count: number
          project_id: string
          status: string
          thread_category: string
          thread_type: string
          title: string
        }
        Insert: {
          allow_participants_invite?: boolean
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          decision_marked_at?: string | null
          decision_marked_by?: string | null
          decision_summary?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email_enabled?: boolean
          email_subject?: string | null
          email_thread_id?: string | null
          id?: string
          inbound_token?: string | null
          is_archived?: boolean
          is_formal_decision?: boolean
          last_activity_at?: string
          last_author_name?: string | null
          last_emailed_at?: string | null
          linked_offer_id?: string | null
          linked_order_id?: string | null
          linked_order_line_id?: string | null
          participants_only?: boolean
          post_count?: number
          project_id: string
          status?: string
          thread_category?: string
          thread_type?: string
          title: string
        }
        Update: {
          allow_participants_invite?: boolean
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          decision_marked_at?: string | null
          decision_marked_by?: string | null
          decision_summary?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email_enabled?: boolean
          email_subject?: string | null
          email_thread_id?: string | null
          id?: string
          inbound_token?: string | null
          is_archived?: boolean
          is_formal_decision?: boolean
          last_activity_at?: string
          last_author_name?: string | null
          last_emailed_at?: string | null
          linked_offer_id?: string | null
          linked_order_id?: string | null
          linked_order_line_id?: string | null
          participants_only?: boolean
          post_count?: number
          project_id?: string
          status?: string
          thread_category?: string
          thread_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_company_access_grants: {
        Row: {
          entity_id: string
          entity_type: string
          granted_at: string
          granted_by: string | null
          id: string
          reason: string
          revoked_at: string | null
          source_company_id: string | null
          user_id: string
        }
        Insert: {
          entity_id: string
          entity_type?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string
          revoked_at?: string | null
          source_company_id?: string | null
          user_id: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string
          revoked_at?: string | null
          source_company_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_company_access_grants_source_company_id_fkey"
            columns: ["source_company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          company_id: string | null
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          org_number: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          org_number?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          org_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contact_tag_relations: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contact_tag_relations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contact_tag_relations_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "customer_contact_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contact_tags: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contact_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_project_access: {
        Row: {
          account_id: string | null
          granted_at: string
          granted_by: string | null
          id: string
          portal_user_id: string
          project_id: string
        }
        Insert: {
          account_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          portal_user_id: string
          project_id: string
        }
        Update: {
          account_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          portal_user_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_project_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_project_access_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_users: {
        Row: {
          account_id: string | null
          activated_at: string | null
          auth_user_id: string | null
          company_id: string | null
          created_at: string
          customer_id: string | null
          email: string
          full_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          last_login_at: string | null
          phone: string | null
          portal_role: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          activated_at?: string | null
          auth_user_id?: string | null
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          email: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          phone?: string | null
          portal_role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          activated_at?: string | null
          auth_user_id?: string | null
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          phone?: string | null
          portal_role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tag_relations: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_relations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_relations_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_value_levels: {
        Row: {
          code: string
          color: string
          company_id: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          color?: string
          company_id: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_value_levels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: string | null
          billing_city: string | null
          billing_zip: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_value: string | null
          deleted_at: string | null
          deleted_by: string | null
          external_tripletex_id: string | null
          id: string
          main_email: string | null
          main_phone: string | null
          name: string
          notes: string | null
          org_number: string | null
          products_of_interest: string[] | null
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          billing_city?: string | null
          billing_zip?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_value?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          external_tripletex_id?: string | null
          id?: string
          main_email?: string | null
          main_phone?: string | null
          name: string
          notes?: string | null
          org_number?: string | null
          products_of_interest?: string[] | null
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          billing_city?: string | null
          billing_zip?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_value?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          external_tripletex_id?: string | null
          id?: string
          main_email?: string | null
          main_phone?: string | null
          name?: string
          notes?: string | null
          org_number?: string | null
          products_of_interest?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_module_configs: {
        Row: {
          column_placement: string
          created_at: string
          density: string
          enabled: boolean
          filter_config: Json | null
          id: string
          module_key: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          column_placement?: string
          created_at?: string
          density?: string
          enabled?: boolean
          filter_config?: Json | null
          id?: string
          module_key: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          column_placement?: string
          created_at?: string
          density?: string
          enabled?: boolean
          filter_config?: Json | null
          id?: string
          module_key?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_folders: {
        Row: {
          created_at: string
          created_by: string | null
          has_member_override: boolean
          icon: string | null
          id: string
          name: string
          parent_folder_id: string | null
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          has_member_override?: boolean
          icon?: string | null
          id?: string
          name: string
          parent_folder_id?: string | null
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          has_member_override?: boolean
          icon?: string | null
          id?: string
          name?: string
          parent_folder_id?: string | null
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_files: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          file_size: number | null
          folder_id: string | null
          id: string
          mime_type: string | null
          project_id: string
          source_meta: Json | null
          source_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_size?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          project_id: string
          source_meta?: Json | null
          source_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_size?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          project_id?: string
          source_meta?: Json | null
          source_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docs_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      document_analyses: {
        Row: {
          analysis_type: string
          analyzed_by: string | null
          confidence: number | null
          created_at: string
          document_id: string
          id: string
          job_id: string | null
          parsed_fields: Json
          raw_output: Json | null
          version: number
        }
        Insert: {
          analysis_type: string
          analyzed_by?: string | null
          confidence?: number | null
          created_at?: string
          document_id: string
          id?: string
          job_id?: string | null
          parsed_fields?: Json
          raw_output?: Json | null
          version?: number
        }
        Update: {
          analysis_type?: string
          analyzed_by?: string | null
          confidence?: number | null
          created_at?: string
          document_id?: string
          id?: string
          job_id?: string | null
          parsed_fields?: Json
          raw_output?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_analyses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_analyses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      document_category_mappings: {
        Row: {
          category_key: string
          company_id: string
          created_at: string
          display_name: string
          icon: string | null
          id: string
          read_only: boolean
          sharepoint_relative_path: string
          sort_order: number
        }
        Insert: {
          category_key: string
          company_id: string
          created_at?: string
          display_name?: string
          icon?: string | null
          id?: string
          read_only?: boolean
          sharepoint_relative_path: string
          sort_order?: number
        }
        Update: {
          category_key?: string
          company_id?: string
          created_at?: string
          display_name?: string
          icon?: string | null
          id?: string
          read_only?: boolean
          sharepoint_relative_path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_category_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_category: string | null
          ai_classified_at: string | null
          ai_confidence: number | null
          category: string
          company_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string
          public_url: string | null
          source_type: string
          storage_bucket: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_category?: string | null
          ai_classified_at?: string | null
          ai_confidence?: number | null
          category?: string
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string
          public_url?: string | null
          source_type?: string
          storage_bucket?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_category?: string | null
          ai_classified_at?: string | null
          ai_confidence?: number | null
          category?: string
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string
          public_url?: string | null
          source_type?: string
          storage_bucket?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_assets: {
        Row: {
          created_at: string
          drawing_type: string | null
          extracted_text: string | null
          file_id: string | null
          id: string
          key_entities: Json | null
          project_id: string
        }
        Insert: {
          created_at?: string
          drawing_type?: string | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          key_entities?: Json | null
          project_id: string
        }
        Update: {
          created_at?: string
          drawing_type?: string | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          key_entities?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_work_profiles: {
        Row: {
          active_from: string | null
          active_to: string | null
          averaging_enabled: boolean
          averaging_period_weeks: number | null
          company_id: string
          created_at: string
          daily_norm_hours: number
          external_employee_id: string | null
          fte_pct: number
          id: string
          notes: string | null
          overtime_requires_approval: boolean
          ruleset_id: string | null
          tariff_or_agreement: string | null
          updated_at: string
          user_id: string
          weekly_norm_hours: number
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          averaging_enabled?: boolean
          averaging_period_weeks?: number | null
          company_id: string
          created_at?: string
          daily_norm_hours?: number
          external_employee_id?: string | null
          fte_pct?: number
          id?: string
          notes?: string | null
          overtime_requires_approval?: boolean
          ruleset_id?: string | null
          tariff_or_agreement?: string | null
          updated_at?: string
          user_id: string
          weekly_norm_hours?: number
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          averaging_enabled?: boolean
          averaging_period_weeks?: number | null
          company_id?: string
          created_at?: string
          daily_norm_hours?: number
          external_employee_id?: string | null
          fte_pct?: number
          id?: string
          notes?: string | null
          overtime_requires_approval?: boolean
          ruleset_id?: string | null
          tariff_or_agreement?: string | null
          updated_at?: string
          user_id?: string
          weekly_norm_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_work_profiles_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "worktime_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_profiles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          birth_date: string | null
          color: string | null
          company_id: string
          created_at: string
          department_id: string | null
          driver_license_classes: string | null
          hms_card_expires_at: string | null
          hms_card_number: string | null
          id: string
          include_in_hms_people: boolean
          is_plannable_resource: boolean
          job_role_id: string | null
          notes: string | null
          person_id: string
          relationship_type: string
          trade_certificate_type: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          birth_date?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          department_id?: string | null
          driver_license_classes?: string | null
          hms_card_expires_at?: string | null
          hms_card_number?: string | null
          id?: string
          include_in_hms_people?: boolean
          is_plannable_resource?: boolean
          job_role_id?: string | null
          notes?: string | null
          person_id: string
          relationship_type?: string
          trade_certificate_type?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          birth_date?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          driver_license_classes?: string | null
          hms_card_expires_at?: string | null
          hms_card_number?: string | null
          id?: string
          include_in_hms_people?: boolean
          is_plannable_resource?: boolean
          job_role_id?: string | null
          notes?: string | null
          person_id?: string
          relationship_type?: string
          trade_certificate_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_profiles_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "compliance_job_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      event_logs: {
        Row: {
          action_type: string
          change_summary: string | null
          event_id: string
          id: string
          metadata: Json | null
          performed_by: string | null
          performer_name: string | null
          timestamp: string
        }
        Insert: {
          action_type: string
          change_summary?: string | null
          event_id: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          performer_name?: string | null
          timestamp?: string
        }
        Update: {
          action_type?: string
          change_summary?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          performer_name?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_technicians: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          end_at: string | null
          event_id: string
          id: string
          start_at: string | null
          technician_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          end_at?: string | null
          event_id: string
          id?: string
          start_at?: string | null
          technician_id: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          end_at?: string | null
          event_id?: string
          id?: string
          start_at?: string | null
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_technicians_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_technicians_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          access_notes: string | null
          address: string | null
          allow_clients: boolean
          archived_at: string | null
          archived_by: string | null
          assignment_notes: string | null
          attachments: Json | null
          calendar_dirty: boolean
          calendar_last_synced_at: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          city: string | null
          client_request_id: string | null
          commercial_case_id: string | null
          company_id: string | null
          contract_alert_count: number | null
          contract_risk_level: string | null
          created_at: string
          created_by: string | null
          customer: string | null
          customer_approval_status: string | null
          customer_approved_at: string | null
          customer_approved_by: string | null
          customer_id: string | null
          customer_practical_info: string | null
          customer_visible: boolean
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          documentation_status: string
          editing_by: string | null
          editing_started_at: string | null
          end_time: string
          external_project_id: string | null
          external_system: string | null
          external_tripletex_id: string | null
          id: string
          internal_number: string | null
          job_number: string | null
          location_details: string | null
          map_link: string | null
          meeting_created_at: string | null
          meeting_created_by: string | null
          meeting_id: string | null
          meeting_join_url: string | null
          merged_into_project_id: string | null
          microsoft_etag: string | null
          microsoft_event_id: string | null
          next_contract_deadline: string | null
          normalized_name: string | null
          offer_id: string | null
          outlook_deleted_at: string | null
          outlook_last_synced_at: string | null
          outlook_sync_status: string
          parent_project_id: string | null
          postal_code: string | null
          project_aliases: string[] | null
          project_number: string | null
          project_type: string
          proposed_end: string | null
          proposed_start: string | null
          sharepoint_connected_at: string | null
          sharepoint_drive_id: string | null
          sharepoint_folder_id: string | null
          sharepoint_folder_web_url: string | null
          sharepoint_project_code: string | null
          sharepoint_site_id: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          source_lead_id: string | null
          source_order_form_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["job_status"]
          task_id: string | null
          technician_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
          visibility_type: string
          work_package_type:
            | Database["public"]["Enums"]["work_package_type"]
            | null
        }
        Insert: {
          access_notes?: string | null
          address?: string | null
          allow_clients?: boolean
          archived_at?: string | null
          archived_by?: string | null
          assignment_notes?: string | null
          attachments?: Json | null
          calendar_dirty?: boolean
          calendar_last_synced_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city?: string | null
          client_request_id?: string | null
          commercial_case_id?: string | null
          company_id?: string | null
          contract_alert_count?: number | null
          contract_risk_level?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          customer_approval_status?: string | null
          customer_approved_at?: string | null
          customer_approved_by?: string | null
          customer_id?: string | null
          customer_practical_info?: string | null
          customer_visible?: boolean
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          documentation_status?: string
          editing_by?: string | null
          editing_started_at?: string | null
          end_time: string
          external_project_id?: string | null
          external_system?: string | null
          external_tripletex_id?: string | null
          id?: string
          internal_number?: string | null
          job_number?: string | null
          location_details?: string | null
          map_link?: string | null
          meeting_created_at?: string | null
          meeting_created_by?: string | null
          meeting_id?: string | null
          meeting_join_url?: string | null
          merged_into_project_id?: string | null
          microsoft_etag?: string | null
          microsoft_event_id?: string | null
          next_contract_deadline?: string | null
          normalized_name?: string | null
          offer_id?: string | null
          outlook_deleted_at?: string | null
          outlook_last_synced_at?: string | null
          outlook_sync_status?: string
          parent_project_id?: string | null
          postal_code?: string | null
          project_aliases?: string[] | null
          project_number?: string | null
          project_type?: string
          proposed_end?: string | null
          proposed_start?: string | null
          sharepoint_connected_at?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_folder_id?: string | null
          sharepoint_folder_web_url?: string | null
          sharepoint_project_code?: string | null
          sharepoint_site_id?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          source_lead_id?: string | null
          source_order_form_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["job_status"]
          task_id?: string | null
          technician_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          visibility_type?: string
          work_package_type?:
            | Database["public"]["Enums"]["work_package_type"]
            | null
        }
        Update: {
          access_notes?: string | null
          address?: string | null
          allow_clients?: boolean
          archived_at?: string | null
          archived_by?: string | null
          assignment_notes?: string | null
          attachments?: Json | null
          calendar_dirty?: boolean
          calendar_last_synced_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city?: string | null
          client_request_id?: string | null
          commercial_case_id?: string | null
          company_id?: string | null
          contract_alert_count?: number | null
          contract_risk_level?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          customer_approval_status?: string | null
          customer_approved_at?: string | null
          customer_approved_by?: string | null
          customer_id?: string | null
          customer_practical_info?: string | null
          customer_visible?: boolean
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          documentation_status?: string
          editing_by?: string | null
          editing_started_at?: string | null
          end_time?: string
          external_project_id?: string | null
          external_system?: string | null
          external_tripletex_id?: string | null
          id?: string
          internal_number?: string | null
          job_number?: string | null
          location_details?: string | null
          map_link?: string | null
          meeting_created_at?: string | null
          meeting_created_by?: string | null
          meeting_id?: string | null
          meeting_join_url?: string | null
          merged_into_project_id?: string | null
          microsoft_etag?: string | null
          microsoft_event_id?: string | null
          next_contract_deadline?: string | null
          normalized_name?: string | null
          offer_id?: string | null
          outlook_deleted_at?: string | null
          outlook_last_synced_at?: string | null
          outlook_sync_status?: string
          parent_project_id?: string | null
          postal_code?: string | null
          project_aliases?: string[] | null
          project_number?: string | null
          project_type?: string
          proposed_end?: string | null
          proposed_start?: string | null
          sharepoint_connected_at?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_folder_id?: string | null
          sharepoint_folder_web_url?: string | null
          sharepoint_project_code?: string | null
          sharepoint_site_id?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          source_lead_id?: string | null
          source_order_form_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["job_status"]
          task_id?: string | null
          technician_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          visibility_type?: string
          work_package_type?:
            | Database["public"]["Enums"]["work_package_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "events_commercial_case_id_fkey"
            columns: ["commercial_case_id"]
            isOneToOne: false
            referencedRelation: "commercial_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_merged_into_project_id_fkey"
            columns: ["merged_into_project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_source_order_form_id_fkey"
            columns: ["source_order_form_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      fag_answers: {
        Row: {
          answer_markdown: string
          company_id: string
          created_at: string
          created_by: string
          fag_request_id: string
          id: string
          model: string | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          answer_markdown: string
          company_id: string
          created_at?: string
          created_by?: string
          fag_request_id: string
          id?: string
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          answer_markdown?: string
          company_id?: string
          created_at?: string
          created_by?: string
          fag_request_id?: string
          id?: string
          model?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fag_answers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fag_answers_fag_request_id_fkey"
            columns: ["fag_request_id"]
            isOneToOne: false
            referencedRelation: "fag_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fag_company_profiles: {
        Row: {
          company_id: string
          created_at: string
          custom_system_prompt: string | null
          default_regime: string
          id: string
          primary_standards: string[]
          secondary_standards: string[]
          specialization: string[]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_system_prompt?: string | null
          default_regime?: string
          id?: string
          primary_standards?: string[]
          secondary_standards?: string[]
          specialization?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_system_prompt?: string | null
          default_regime?: string
          id?: string
          primary_standards?: string[]
          secondary_standards?: string[]
          specialization?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fag_company_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fag_requests: {
        Row: {
          ai_confidence: number | null
          ai_followup_questions: string[]
          ai_summary: string | null
          archived_at: string | null
          archived_by: string | null
          company_id: string
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          image_paths: string[]
          is_test: boolean
          last_activity_at: string
          linked_case_id: string | null
          linked_offer_id: string | null
          linked_project_id: string | null
          parent_request_id: string | null
          pinned_at: string | null
          priority: Database["public"]["Enums"]["fag_priority"]
          question: string
          regime: Database["public"]["Enums"]["fag_regime"]
          status: Database["public"]["Enums"]["fag_status"]
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_followup_questions?: string[]
          ai_summary?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id: string
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          image_paths?: string[]
          is_test?: boolean
          last_activity_at?: string
          linked_case_id?: string | null
          linked_offer_id?: string | null
          linked_project_id?: string | null
          parent_request_id?: string | null
          pinned_at?: string | null
          priority?: Database["public"]["Enums"]["fag_priority"]
          question: string
          regime: Database["public"]["Enums"]["fag_regime"]
          status?: Database["public"]["Enums"]["fag_status"]
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_followup_questions?: string[]
          ai_summary?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          image_paths?: string[]
          is_test?: boolean
          last_activity_at?: string
          linked_case_id?: string | null
          linked_offer_id?: string | null
          linked_project_id?: string | null
          parent_request_id?: string | null
          pinned_at?: string | null
          priority?: Database["public"]["Enums"]["fag_priority"]
          question?: string
          regime?: Database["public"]["Enums"]["fag_regime"]
          status?: Database["public"]["Enums"]["fag_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fag_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fag_requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "fag_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_members: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          user_account_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          user_account_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_members_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "doc_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_members_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      form_instances: {
        Row: {
          activity_id: string | null
          answers: Json
          assigned_to: string | null
          company_id: string | null
          created_at: string
          created_by: string
          id: string
          locked_at: string | null
          locked_by: string | null
          project_id: string | null
          status: string
          template_id: string
          unlock_reason: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          activity_id?: string | null
          answers?: Json
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          project_id?: string | null
          status?: string
          template_id: string
          unlock_reason?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          activity_id?: string | null
          answers?: Json
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          project_id?: string | null
          status?: string
          template_id?: string
          unlock_reason?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_instances_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_instances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_instances_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "form_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_pdf_imports: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string
          id: string
          parsed_json: Json
          source_document_id: string | null
          status: string
          template_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by: string
          id?: string
          parsed_json?: Json
          source_document_id?: string | null
          status?: string
          template_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string
          id?: string
          parsed_json?: Json
          source_document_id?: string | null
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_pdf_imports_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_pdf_imports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_signatures: {
        Row: {
          id: string
          instance_id: string
          ip_address: string | null
          signature_data: string
          signed_at: string
          signer_name: string
          signer_role: string | null
        }
        Insert: {
          id?: string
          instance_id: string
          ip_address?: string | null
          signature_data: string
          signed_at?: string
          signer_name: string
          signer_role?: string | null
        }
        Update: {
          id?: string
          instance_id?: string
          ip_address?: string | null
          signature_data?: string
          signed_at?: string
          signer_name?: string
          signer_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_signatures_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "form_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_versions: {
        Row: {
          created_at: string
          created_by: string
          fields: Json
          id: string
          rules: Json
          template_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          fields?: Json
          id?: string
          rules?: Json
          template_id: string
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          fields?: Json
          id?: string
          rules?: Json
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          active_version_id: string | null
          allowed_roles: string[]
          archived_at: string | null
          available_in_customer_portal: boolean
          available_in_documents: boolean
          available_in_my_day: boolean
          available_in_projects: boolean
          category: string | null
          company_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          form_type: string
          id: string
          internal_only: boolean
          is_active: boolean
          is_required: boolean
          required_before_billing: boolean
          required_before_completion: boolean
          required_for_job_types: string[]
          shareable_via_link: boolean
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          active_version_id?: string | null
          allowed_roles?: string[]
          archived_at?: string | null
          available_in_customer_portal?: boolean
          available_in_documents?: boolean
          available_in_my_day?: boolean
          available_in_projects?: boolean
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          form_type?: string
          id?: string
          internal_only?: boolean
          is_active?: boolean
          is_required?: boolean
          required_before_billing?: boolean
          required_before_completion?: boolean
          required_for_job_types?: string[]
          shareable_via_link?: boolean
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          active_version_id?: string | null
          allowed_roles?: string[]
          archived_at?: string | null
          available_in_customer_portal?: boolean
          available_in_documents?: boolean
          available_in_my_day?: boolean
          available_in_projects?: boolean
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          form_type?: string
          id?: string
          internal_only?: boolean
          is_active?: boolean
          is_required?: boolean
          required_before_billing?: boolean
          required_before_completion?: boolean
          required_for_job_types?: string[]
          shareable_via_link?: boolean
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_active_version_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "form_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_action_items: {
        Row: {
          alert_id: string | null
          assignee_user_id: string | null
          company_id: string
          completed_at: string | null
          completed_by: string | null
          compliance_audit_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_date: string | null
          id: string
          incident_id: string | null
          priority: string
          risk_item_id: string | null
          status: string
          submission_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          alert_id?: string | null
          assignee_user_id?: string | null
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          compliance_audit_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incident_id?: string | null
          priority?: string
          risk_item_id?: string | null
          status?: string
          submission_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          alert_id?: string | null
          assignee_user_id?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          compliance_audit_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incident_id?: string | null
          priority?: string
          risk_item_id?: string | null
          status?: string
          submission_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_action_items_alert_fk"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "worktime_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_action_items_compliance_audit_id_fkey"
            columns: ["compliance_audit_id"]
            isOneToOne: false
            referencedRelation: "compliance_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_action_items_incident_fk"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "hms_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_action_items_risk_item_id_fkey"
            columns: ["risk_item_id"]
            isOneToOne: false
            referencedRelation: "hms_risk_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_action_items_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "hms_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_area_catalog: {
        Row: {
          area_key: string
          category: string
          created_at: string
          description: string | null
          is_active: boolean
          label: string
          legal_reference: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          area_key: string
          category: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          label: string
          legal_reference?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          area_key?: string
          category?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          label?: string
          legal_reference?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      hms_area_suggestion_rules: {
        Row: {
          area_key: string
          building_types: string[] | null
          chemicals: boolean | null
          created_at: string
          ee_waste: boolean | null
          id: string
          is_active: boolean
          min_building_age_years: number | null
          near_electrical: boolean | null
          off_hours: boolean | null
          project_kinds: string[] | null
          rule_label: string
          score: number
          updated_at: string
          work_types: string[] | null
        }
        Insert: {
          area_key: string
          building_types?: string[] | null
          chemicals?: boolean | null
          created_at?: string
          ee_waste?: boolean | null
          id?: string
          is_active?: boolean
          min_building_age_years?: number | null
          near_electrical?: boolean | null
          off_hours?: boolean | null
          project_kinds?: string[] | null
          rule_label: string
          score?: number
          updated_at?: string
          work_types?: string[] | null
        }
        Update: {
          area_key?: string
          building_types?: string[] | null
          chemicals?: boolean | null
          created_at?: string
          ee_waste?: boolean | null
          id?: string
          is_active?: boolean
          min_building_age_years?: number | null
          near_electrical?: boolean | null
          off_hours?: boolean | null
          project_kinds?: string[] | null
          rule_label?: string
          score?: number
          updated_at?: string
          work_types?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "hms_area_suggestion_rules_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "hms_area_catalog"
            referencedColumns: ["area_key"]
          },
        ]
      }
      hms_audit_log: {
        Row: {
          action: string
          company_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json | null
          performed_at: string
          performed_by: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json | null
          performed_at?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json | null
          performed_at?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      hms_handbook_acknowledgements: {
        Row: {
          acknowledged_at: string
          company_id: string
          confirmation_text: string | null
          handbook_id: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
          version_id: string
        }
        Insert: {
          acknowledged_at?: string
          company_id: string
          confirmation_text?: string | null
          handbook_id: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
          version_id: string
        }
        Update: {
          acknowledged_at?: string
          company_id?: string
          confirmation_text?: string | null
          handbook_id?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_handbook_acknowledgements_handbook_id_fkey"
            columns: ["handbook_id"]
            isOneToOne: false
            referencedRelation: "hms_handbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_handbook_acknowledgements_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "hms_handbook_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_handbook_sections: {
        Row: {
          body: string | null
          created_at: string
          heading: string
          hms_areas: string[]
          id: string
          ordering: number
          parent_id: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          heading: string
          hms_areas?: string[]
          id?: string
          ordering?: number
          parent_id?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          heading?: string
          hms_areas?: string[]
          id?: string
          ordering?: number
          parent_id?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_handbook_sections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "hms_handbook_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_handbook_sections_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "hms_handbook_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_handbook_versions: {
        Row: {
          changelog: string | null
          company_id: string
          created_at: string
          created_by: string | null
          handbook_id: string
          id: string
          published_at: string | null
          published_by: string | null
          requires_acknowledgement: boolean
          status: string
          updated_at: string
          version_number: number
        }
        Insert: {
          changelog?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          handbook_id: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          requires_acknowledgement?: boolean
          status?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          changelog?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          handbook_id?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          requires_acknowledgement?: boolean
          status?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "hms_handbook_versions_handbook_id_fkey"
            columns: ["handbook_id"]
            isOneToOne: false
            referencedRelation: "hms_handbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_handbooks: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          current_version_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          handbook_type: string
          id: string
          kind: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          handbook_type?: string
          id?: string
          kind?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          handbook_type?: string
          id?: string
          kind?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_handbooks_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "hms_handbook_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_incident_comments: {
        Row: {
          attachments: Json | null
          author_id: string
          body: string
          company_id: string
          created_at: string
          id: string
          incident_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id: string
          body: string
          company_id: string
          created_at?: string
          id?: string
          incident_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          incident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_incident_comments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "hms_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_incident_status_log: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          from_status: string | null
          id: string
          incident_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          incident_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          incident_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_incident_status_log_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "hms_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_incidents: {
        Row: {
          assigned_to: string | null
          attachments: Json
          closed_at: string | null
          closed_by: string | null
          closed_reason: string | null
          closure_notes: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_date: string | null
          id: string
          incident_type: string
          location: string | null
          occurred_at: string
          project_id: string | null
          proposed_action: string | null
          reported_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
          closure_notes?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incident_type: string
          location?: string | null
          occurred_at?: string
          project_id?: string | null
          proposed_action?: string | null
          reported_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
          closure_notes?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incident_type?: string
          location?: string | null
          occurred_at?: string
          project_id?: string | null
          proposed_action?: string | null
          reported_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hms_risk_assessments: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          project_id: string | null
          status: string
          submission_id: string | null
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          project_id?: string | null
          status?: string
          submission_id?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          project_id?: string | null
          status?: string
          submission_id?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_risk_assessments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "hms_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_risk_assessments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_risk_items: {
        Row: {
          ai_generated: boolean
          assessment_id: string
          company_id: string
          consequence: number
          created_at: string
          description: string
          hms_areas: string[]
          id: string
          probability: number
          proposed_action: string | null
          score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          assessment_id: string
          company_id: string
          consequence?: number
          created_at?: string
          description: string
          hms_areas?: string[]
          id?: string
          probability?: number
          proposed_action?: string | null
          score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          assessment_id?: string
          company_id?: string
          consequence?: number
          created_at?: string
          description?: string
          hms_areas?: string[]
          id?: string
          probability?: number
          proposed_action?: string | null
          score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_risk_items_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "hms_risk_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_submission_answers: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          item_key: string | null
          photos: string[] | null
          submission_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_key?: string | null
          photos?: string[] | null
          submission_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_key?: string | null
          photos?: string[] | null
          submission_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "hms_submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "hms_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_submission_participants: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string | null
          signature_id: string | null
          signed_at: string | null
          submission_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          role?: string | null
          signature_id?: string | null
          signed_at?: string | null
          submission_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string | null
          signature_id?: string | null
          signed_at?: string | null
          submission_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hms_submission_participants_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "hms_submission_signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_submission_participants_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "hms_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_submission_signatures: {
        Row: {
          confirmation_text: string
          id: string
          ip_address: string | null
          participant_id: string | null
          role_label: string | null
          signature_data: string | null
          signature_type: string
          signed_at: string
          signer_name: string
          signer_user_id: string | null
          submission_id: string
          template_version: number
          user_agent: string | null
        }
        Insert: {
          confirmation_text?: string
          id?: string
          ip_address?: string | null
          participant_id?: string | null
          role_label?: string | null
          signature_data?: string | null
          signature_type?: string
          signed_at?: string
          signer_name: string
          signer_user_id?: string | null
          submission_id: string
          template_version?: number
          user_agent?: string | null
        }
        Update: {
          confirmation_text?: string
          id?: string
          ip_address?: string | null
          participant_id?: string | null
          role_label?: string | null
          signature_data?: string | null
          signature_type?: string
          signed_at?: string
          signer_name?: string
          signer_user_id?: string | null
          submission_id?: string
          template_version?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hms_submission_signatures_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hms_submission_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_submission_signatures_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "hms_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_submissions: {
        Row: {
          client_request_id: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          event_id: string | null
          gps_lat: number | null
          gps_lng: number | null
          hms_areas: string[]
          id: string
          kind: string | null
          location: string | null
          project_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          template_id: string | null
          template_snapshot: Json | null
          template_version: number
          title: string | null
          updated_at: string
        }
        Insert: {
          client_request_id?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          event_id?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          hms_areas?: string[]
          id?: string
          kind?: string | null
          location?: string | null
          project_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          template_version?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_request_id?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          event_id?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          hms_areas?: string[]
          id?: string
          kind?: string | null
          location?: string | null
          project_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          template_version?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_template_items: {
        Row: {
          ai_hint: string | null
          created_at: string
          help_text: string | null
          hms_areas: string[]
          id: string
          is_required: boolean
          item_type: string
          label: string
          options: Json | null
          ordering: number
          requires_chemicals: boolean | null
          requires_ee_waste: boolean | null
          requires_min_building_age_years: number | null
          requires_near_electrical: boolean | null
          requires_off_hours: boolean | null
          section_id: string
          suggested_building_types: string[]
          suggested_project_kinds: string[]
          suggested_work_types: string[]
          template_id: string
        }
        Insert: {
          ai_hint?: string | null
          created_at?: string
          help_text?: string | null
          hms_areas?: string[]
          id?: string
          is_required?: boolean
          item_type: string
          label: string
          options?: Json | null
          ordering?: number
          requires_chemicals?: boolean | null
          requires_ee_waste?: boolean | null
          requires_min_building_age_years?: number | null
          requires_near_electrical?: boolean | null
          requires_off_hours?: boolean | null
          section_id: string
          suggested_building_types?: string[]
          suggested_project_kinds?: string[]
          suggested_work_types?: string[]
          template_id: string
        }
        Update: {
          ai_hint?: string | null
          created_at?: string
          help_text?: string | null
          hms_areas?: string[]
          id?: string
          is_required?: boolean
          item_type?: string
          label?: string
          options?: Json | null
          ordering?: number
          requires_chemicals?: boolean | null
          requires_ee_waste?: boolean | null
          requires_min_building_age_years?: number | null
          requires_near_electrical?: boolean | null
          requires_off_hours?: boolean | null
          section_id?: string
          suggested_building_types?: string[]
          suggested_project_kinds?: string[]
          suggested_work_types?: string[]
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_template_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "hms_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hms_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_template_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          ordering: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          ordering?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          ordering?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hms_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hms_templates: {
        Row: {
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          hms_areas: string[]
          id: string
          is_active: boolean
          kind: string
          name: string
          requires_chemicals: boolean | null
          requires_ee_waste: boolean | null
          requires_min_building_age_years: number | null
          requires_near_electrical: boolean | null
          requires_off_hours: boolean | null
          suggested_building_types: string[]
          suggested_project_kinds: string[]
          suggested_work_types: string[]
          updated_at: string
          version: number
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          hms_areas?: string[]
          id?: string
          is_active?: boolean
          kind: string
          name: string
          requires_chemicals?: boolean | null
          requires_ee_waste?: boolean | null
          requires_min_building_age_years?: number | null
          requires_near_electrical?: boolean | null
          requires_off_hours?: boolean | null
          suggested_building_types?: string[]
          suggested_project_kinds?: string[]
          suggested_work_types?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          hms_areas?: string[]
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          requires_chemicals?: boolean | null
          requires_ee_waste?: boolean | null
          requires_min_building_age_years?: number | null
          requires_near_electrical?: boolean | null
          requires_off_hours?: boolean | null
          suggested_building_types?: string[]
          suggested_project_kinds?: string[]
          suggested_work_types?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      image_text_extracts: {
        Row: {
          created_at: string
          detected_entities: Json | null
          extracted_text: string | null
          file_id: string | null
          id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          detected_entities?: Json | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          post_id: string
        }
        Update: {
          created_at?: string
          detected_entities?: Json | null
          extracted_text?: string | null
          file_id?: string | null
          id?: string
          post_id?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          created_at: string
          created_count: number
          failed_count: number
          file_hash: string | null
          file_name: string
          id: string
          ignored_count: number
          import_type: string
          imported_at: string
          imported_by: string
          status: string
          summary_json: Json | null
          total_rows: number
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_count?: number
          failed_count?: number
          file_hash?: string | null
          file_name: string
          id?: string
          ignored_count?: number
          import_type: string
          imported_at?: string
          imported_by: string
          status?: string
          summary_json?: Json | null
          total_rows?: number
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_count?: number
          failed_count?: number
          file_hash?: string | null
          file_name?: string
          id?: string
          ignored_count?: number
          import_type?: string
          imported_at?: string
          imported_by?: string
          status?: string
          summary_json?: Json | null
          total_rows?: number
          updated_count?: number
        }
        Relationships: []
      }
      import_results: {
        Row: {
          action_taken: string
          created_at: string
          entity_type: string
          external_key: string | null
          id: string
          import_log_id: string
          message: string | null
          raw_payload_json: Json | null
          resolved_entity_id: string | null
          status: string
        }
        Insert: {
          action_taken: string
          created_at?: string
          entity_type: string
          external_key?: string | null
          id?: string
          import_log_id: string
          message?: string | null
          raw_payload_json?: Json | null
          resolved_entity_id?: string | null
          status?: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          entity_type?: string
          external_key?: string | null
          id?: string
          import_log_id?: string
          message?: string | null
          raw_payload_json?: Json | null
          resolved_entity_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_results_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          ai_category: string | null
          ai_confidence: number | null
          assigned_at: string | null
          assigned_user_id: string | null
          body_full: string | null
          body_preview: string | null
          company_id: string | null
          created_at: string
          external_id: string
          fetched_by: string | null
          from_email: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          linked_lead_id: string | null
          linked_project_id: string | null
          mailbox_address: string | null
          owner_user_id: string | null
          participant_user_ids: string[] | null
          received_at: string
          status: string
          subject: string
          visibility: string
        }
        Insert: {
          ai_category?: string | null
          ai_confidence?: number | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          body_full?: string | null
          body_preview?: string | null
          company_id?: string | null
          created_at?: string
          external_id: string
          fetched_by?: string | null
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          linked_lead_id?: string | null
          linked_project_id?: string | null
          mailbox_address?: string | null
          owner_user_id?: string | null
          participant_user_ids?: string[] | null
          received_at?: string
          status?: string
          subject?: string
          visibility?: string
        }
        Update: {
          ai_category?: string | null
          ai_confidence?: number | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          body_full?: string | null
          body_preview?: string | null
          company_id?: string | null
          created_at?: string
          external_id?: string
          fetched_by?: string | null
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          linked_lead_id?: string | null
          linked_project_id?: string | null
          mailbox_address?: string | null
          owner_user_id?: string | null
          participant_user_ids?: string[] | null
          received_at?: string
          status?: string
          subject?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_linked_lead_id_fkey"
            columns: ["linked_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_linked_project_id_fkey"
            columns: ["linked_project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          operating_profile: string
          org_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          operating_profile?: string
          org_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          operating_profile?: string
          org_number?: string | null
        }
        Relationships: []
      }
      invoice_basis: {
        Row: {
          approved_at: string
          approved_by_name: string | null
          approved_by_portal_user_id: string | null
          approved_version: number | null
          company_id: string
          created_at: string
          customer_id: string | null
          customer_name: string
          deviation_count: number | null
          deviation_notes: string | null
          id: string
          notes: string | null
          project_id: string
          report_count: number | null
          sent_to_billing_at: string | null
          sent_to_billing_by: string | null
          service_journal_id: string | null
          status: string
          technician_count: number | null
          technician_names: string[] | null
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          approved_at: string
          approved_by_name?: string | null
          approved_by_portal_user_id?: string | null
          approved_version?: number | null
          company_id: string
          created_at?: string
          customer_id?: string | null
          customer_name: string
          deviation_count?: number | null
          deviation_notes?: string | null
          id?: string
          notes?: string | null
          project_id: string
          report_count?: number | null
          sent_to_billing_at?: string | null
          sent_to_billing_by?: string | null
          service_journal_id?: string | null
          status?: string
          technician_count?: number | null
          technician_names?: string[] | null
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string
          approved_by_name?: string | null
          approved_by_portal_user_id?: string | null
          approved_version?: number | null
          company_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          deviation_count?: number | null
          deviation_notes?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          report_count?: number | null
          sent_to_billing_at?: string | null
          sent_to_billing_by?: string | null
          service_journal_id?: string | null
          status?: string
          technician_count?: number | null
          technician_names?: string[] | null
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_basis_approved_by_portal_user_id_fkey"
            columns: ["approved_by_portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_basis_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_basis_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_basis_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_basis_service_journal_id_fkey"
            columns: ["service_journal_id"]
            isOneToOne: true
            referencedRelation: "service_journals"
            referencedColumns: ["id"]
          },
        ]
      }
      job_approvals: {
        Row: {
          comment: string | null
          created_at: string
          expires_at: string
          id: string
          job_id: string
          last_reminded_at: string | null
          outlook_event_id: string | null
          proposed_end: string | null
          proposed_start: string | null
          reminder_config: Json | null
          reminder_count: number
          reminder_profile: string
          reminders_paused: boolean
          responded_at: string | null
          response_required: boolean
          status: string
          technician_user_id: string
          token: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id: string
          last_reminded_at?: string | null
          outlook_event_id?: string | null
          proposed_end?: string | null
          proposed_start?: string | null
          reminder_config?: Json | null
          reminder_count?: number
          reminder_profile?: string
          reminders_paused?: boolean
          responded_at?: string | null
          response_required?: boolean
          status?: string
          technician_user_id: string
          token?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id?: string
          last_reminded_at?: string | null
          outlook_event_id?: string | null
          proposed_end?: string | null
          proposed_start?: string | null
          reminder_config?: Json | null
          reminder_count?: number
          reminder_profile?: string
          reminders_paused?: boolean
          responded_at?: string | null
          response_required?: boolean
          status?: string
          technician_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_approvals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_calendar_audit: {
        Row: {
          action: string
          created_at: string
          failures_count: number
          finished_at: string | null
          id: string
          job_id: string
          operation_id: string
          override_conflicts: boolean
          performed_by: string
          started_at: string
          successes_count: number
          summary: Json | null
          technicians_count: number
        }
        Insert: {
          action: string
          created_at?: string
          failures_count?: number
          finished_at?: string | null
          id?: string
          job_id: string
          operation_id: string
          override_conflicts?: boolean
          performed_by: string
          started_at?: string
          successes_count?: number
          summary?: Json | null
          technicians_count?: number
        }
        Update: {
          action?: string
          created_at?: string
          failures_count?: number
          finished_at?: string | null
          id?: string
          job_id?: string
          operation_id?: string
          override_conflicts?: boolean
          performed_by?: string
          started_at?: string
          successes_count?: number
          summary?: Json | null
          technicians_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_calendar_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_calendar_links: {
        Row: {
          calendar_event_id: string | null
          calendar_event_url: string | null
          created_at: string
          id: string
          is_orphan: boolean
          job_id: string
          last_error: string | null
          last_operation_at: string | null
          last_operation_id: string | null
          last_sync_hash: string | null
          last_synced_at: string | null
          orphan_detected_at: string | null
          orphan_reason: string | null
          provider: string
          sync_status: string
          technician_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          calendar_event_url?: string | null
          created_at?: string
          id?: string
          is_orphan?: boolean
          job_id: string
          last_error?: string | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          last_sync_hash?: string | null
          last_synced_at?: string | null
          orphan_detected_at?: string | null
          orphan_reason?: string | null
          provider?: string
          sync_status?: string
          technician_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          calendar_event_url?: string | null
          created_at?: string
          id?: string
          is_orphan?: boolean
          job_id?: string
          last_error?: string | null
          last_operation_at?: string | null
          last_operation_id?: string | null
          last_sync_hash?: string | null
          last_synced_at?: string | null
          orphan_detected_at?: string | null
          orphan_reason?: string | null
          provider?: string
          sync_status?: string
          technician_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_calendar_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_calendar_links_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      job_change_order_events: {
        Row: {
          actor_email: string | null
          actor_name: string | null
          actor_type: string
          change_order_id: string
          created_at: string
          event_message: string | null
          event_type: string
          id: string
          job_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          change_order_id: string
          created_at?: string
          event_message?: string | null
          event_type: string
          id?: string
          job_id: string
        }
        Update: {
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          change_order_id?: string
          created_at?: string
          event_message?: string | null
          event_type?: string
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_change_order_events_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "job_change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_change_order_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_change_orders: {
        Row: {
          amount_ex_vat: number
          amount_inc_vat: number | null
          approval_expires_at: string | null
          approval_method: string | null
          approval_token_hash: string | null
          approved_by_email: string | null
          approved_by_name: string | null
          cost_labor_hours: number | null
          cost_labor_rate: number
          cost_material: number | null
          cost_total: number | null
          created_at: string
          created_by: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          description: string
          id: string
          job_id: string
          linked_risk_id: string | null
          margin_amount: number | null
          reason_type: string
          responded_at: string | null
          response_message: string | null
          schedule_impact: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          amount_ex_vat?: number
          amount_inc_vat?: number | null
          approval_expires_at?: string | null
          approval_method?: string | null
          approval_token_hash?: string | null
          approved_by_email?: string | null
          approved_by_name?: string | null
          cost_labor_hours?: number | null
          cost_labor_rate?: number
          cost_material?: number | null
          cost_total?: number | null
          created_at?: string
          created_by: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          description: string
          id?: string
          job_id: string
          linked_risk_id?: string | null
          margin_amount?: number | null
          reason_type?: string
          responded_at?: string | null
          response_message?: string | null
          schedule_impact?: string | null
          sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          amount_ex_vat?: number
          amount_inc_vat?: number | null
          approval_expires_at?: string | null
          approval_method?: string | null
          approval_token_hash?: string | null
          approved_by_email?: string | null
          approved_by_name?: string | null
          cost_labor_hours?: number | null
          cost_labor_rate?: number
          cost_material?: number | null
          cost_total?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          description?: string
          id?: string
          job_id?: string
          linked_risk_id?: string | null
          margin_amount?: number | null
          reason_type?: string
          responded_at?: string | null
          response_message?: string | null
          schedule_impact?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_change_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_change_orders_linked_risk_id_fkey"
            columns: ["linked_risk_id"]
            isOneToOne: false
            referencedRelation: "job_risk_items"
            referencedColumns: ["id"]
          },
        ]
      }
      job_document_links: {
        Row: {
          company_id: string
          created_at: string
          file_size: number | null
          id: string
          item_id: string
          job_id: string
          mime_type: string | null
          name: string
          source: string
          uploaded_by: string | null
          web_url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_size?: number | null
          id?: string
          item_id: string
          job_id: string
          mime_type?: string | null
          name: string
          source?: string
          uploaded_by?: string | null
          web_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_size?: number | null
          id?: string
          item_id?: string
          job_id?: string
          mime_type?: string | null
          name?: string
          source?: string
          uploaded_by?: string | null
          web_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_document_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_document_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_participants: {
        Row: {
          created_at: string
          id: string
          job_id: string
          role_label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          role_label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          role_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_participants_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_risk_items: {
        Row: {
          category: string
          created_at: string
          id: string
          job_id: string
          label: string
          severity: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          job_id: string
          label: string
          severity?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          job_id?: string
          label?: string
          severity?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_risk_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_summaries: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          job_id: string
          key_numbers: Json | null
          source: string
          summary_text: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          job_id: string
          key_numbers?: Json | null
          source?: string
          summary_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          job_id?: string
          key_numbers?: Json | null
          source?: string
          summary_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_summaries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      job_task_notes: {
        Row: {
          created_at: string
          created_by: string | null
          file_mime_type: string | null
          file_name: string | null
          file_path: string | null
          id: string
          note_text: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_mime_type?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          note_text?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_mime_type?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          note_text?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_task_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tasks: {
        Row: {
          assigned_technician_ids: string[] | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          id: string
          job_id: string
          scheduled_date: string | null
          sort_order: number
          start_time: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_technician_ids?: string[] | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          job_id: string
          scheduled_date?: string | null
          sort_order?: number
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_technician_ids?: string[] | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          job_id?: string
          scheduled_date?: string | null
          sort_order?: number
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_calendar_links: {
        Row: {
          attendee_emails: string[] | null
          created_at: string
          created_by: string | null
          event_end: string | null
          event_location: string | null
          event_start: string | null
          event_subject: string | null
          id: string
          last_synced_at: string | null
          lead_id: string
          outlook_event_id: string
        }
        Insert: {
          attendee_emails?: string[] | null
          created_at?: string
          created_by?: string | null
          event_end?: string | null
          event_location?: string | null
          event_start?: string | null
          event_subject?: string | null
          id?: string
          last_synced_at?: string | null
          lead_id: string
          outlook_event_id: string
        }
        Update: {
          attendee_emails?: string[] | null
          created_at?: string
          created_by?: string | null
          event_end?: string | null
          event_location?: string | null
          event_start?: string | null
          event_subject?: string | null
          id?: string
          last_synced_at?: string | null
          lead_id?: string
          outlook_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_calendar_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_history: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          lead_id: string
          metadata: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_participants: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          notify_enabled: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          notify_enabled?: boolean
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          notify_enabled?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_participants_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assigned_owner_user_id: string | null
          commercial_case_id: string | null
          company_id: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          email: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          lead_ref_code: string | null
          next_action_date: string | null
          next_action_note: string | null
          next_action_type:
            | Database["public"]["Enums"]["lead_next_action_type"]
            | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          probability: number | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_owner_user_id?: string | null
          commercial_case_id?: string | null
          company_id?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_ref_code?: string | null
          next_action_date?: string | null
          next_action_note?: string | null
          next_action_type?:
            | Database["public"]["Enums"]["lead_next_action_type"]
            | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_owner_user_id?: string | null
          commercial_case_id?: string | null
          company_id?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_ref_code?: string | null
          next_action_date?: string | null
          next_action_note?: string | null
          next_action_type?:
            | Database["public"]["Enums"]["lead_next_action_type"]
            | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_commercial_case_id_fkey"
            columns: ["commercial_case_id"]
            isOneToOne: false
            referencedRelation: "commercial_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          address: string
          created_at: string
          display_name: string
          graph_delta_link: string | null
          id: string
          is_enabled: boolean
          last_sync_at: string | null
          last_sync_count: number | null
          last_sync_error: string | null
        }
        Insert: {
          address: string
          created_at?: string
          display_name?: string
          graph_delta_link?: string | null
          id?: string
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_count?: number | null
          last_sync_error?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          display_name?: string
          graph_delta_link?: string | null
          id?: string
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_count?: number | null
          last_sync_error?: string | null
        }
        Relationships: []
      }
      material_activity_log: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_type: string
          created_at: string
          event_type: string
          id: string
          material_list_id: string
          message: string
          metadata: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_type?: string
          created_at?: string
          event_type: string
          id?: string
          material_list_id: string
          message: string
          metadata?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: string
          material_list_id?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "material_activity_log_material_list_id_fkey"
            columns: ["material_list_id"]
            isOneToOne: false
            referencedRelation: "material_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      material_external_suggestions: {
        Row: {
          comment: string | null
          created_at: string
          description: string | null
          elnr: string | null
          id: string
          material_list_id: string
          provided_by: string | null
          quantity: number
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          share_token: string | null
          status: string
          suggested_by_email: string | null
          suggested_by_name: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          description?: string | null
          elnr?: string | null
          id?: string
          material_list_id: string
          provided_by?: string | null
          quantity?: number
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          share_token?: string | null
          status?: string
          suggested_by_email?: string | null
          suggested_by_name?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          description?: string | null
          elnr?: string | null
          id?: string
          material_list_id?: string
          provided_by?: string | null
          quantity?: number
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          share_token?: string | null
          status?: string
          suggested_by_email?: string | null
          suggested_by_name?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_external_suggestions_material_list_id_fkey"
            columns: ["material_list_id"]
            isOneToOne: false
            referencedRelation: "material_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      material_list_items: {
        Row: {
          ai_component_reference: string | null
          ai_confidence: string | null
          ai_reason: string | null
          ai_source_file: string | null
          ai_source_label: string | null
          ai_source_page: string | null
          ai_source_type: string | null
          comment: string | null
          created_at: string
          description: string
          elnr: string | null
          id: string
          manufacturer: string | null
          material_list_id: string
          procurement_id: string | null
          provided_by: string | null
          quantity_ordered: number
          quantity_picked: number
          quantity_received: number
          quantity_returned: number
          quantity_used: number
          return_overridden: boolean
          sort_order: number
          source: string
          supplier: string | null
          supplier_sku: string | null
          unit: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          ai_component_reference?: string | null
          ai_confidence?: string | null
          ai_reason?: string | null
          ai_source_file?: string | null
          ai_source_label?: string | null
          ai_source_page?: string | null
          ai_source_type?: string | null
          comment?: string | null
          created_at?: string
          description: string
          elnr?: string | null
          id?: string
          manufacturer?: string | null
          material_list_id: string
          procurement_id?: string | null
          provided_by?: string | null
          quantity_ordered?: number
          quantity_picked?: number
          quantity_received?: number
          quantity_returned?: number
          quantity_used?: number
          return_overridden?: boolean
          sort_order?: number
          source?: string
          supplier?: string | null
          supplier_sku?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          ai_component_reference?: string | null
          ai_confidence?: string | null
          ai_reason?: string | null
          ai_source_file?: string | null
          ai_source_label?: string | null
          ai_source_page?: string | null
          ai_source_type?: string | null
          comment?: string | null
          created_at?: string
          description?: string
          elnr?: string | null
          id?: string
          manufacturer?: string | null
          material_list_id?: string
          procurement_id?: string | null
          provided_by?: string | null
          quantity_ordered?: number
          quantity_picked?: number
          quantity_received?: number
          quantity_returned?: number
          quantity_used?: number
          return_overridden?: boolean
          sort_order?: number
          source?: string
          supplier?: string | null
          supplier_sku?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_list_items_material_list_id_fkey"
            columns: ["material_list_id"]
            isOneToOne: false
            referencedRelation: "material_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      material_lists: {
        Row: {
          approved_by: string | null
          company_id: string
          completed_at: string | null
          consumption_registered_at: string | null
          crate_location: string | null
          created_at: string
          created_by: string | null
          delivered_to_job_at: string | null
          delivered_to_job_by: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          job_id: string | null
          notes: string | null
          order_id: string | null
          ordered_at: string | null
          picked_at: string | null
          picked_by: string | null
          picked_comment: string | null
          received_at: string | null
          sent_with_installer_at: string | null
          share_token: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          company_id: string
          completed_at?: string | null
          consumption_registered_at?: string | null
          crate_location?: string | null
          created_at?: string
          created_by?: string | null
          delivered_to_job_at?: string | null
          delivered_to_job_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          order_id?: string | null
          ordered_at?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picked_comment?: string | null
          received_at?: string | null
          sent_with_installer_at?: string | null
          share_token?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          company_id?: string
          completed_at?: string | null
          consumption_registered_at?: string | null
          crate_location?: string | null
          created_at?: string
          created_by?: string | null
          delivered_to_job_at?: string | null
          delivered_to_job_by?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          order_id?: string | null
          ordered_at?: string | null
          picked_at?: string | null
          picked_by?: string | null
          picked_comment?: string | null
          received_at?: string | null
          sent_with_installer_at?: string | null
          share_token?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_lists_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_lists_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      material_procurements: {
        Row: {
          comment: string | null
          created_at: string
          delivery_location: string | null
          delivery_method: string | null
          expected_delivery_at: string | null
          id: string
          material_list_id: string
          ordered_at: string | null
          ordered_by: string | null
          received_at: string | null
          received_by: string | null
          status: string
          supplier: string | null
          supplier_order_number: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          delivery_location?: string | null
          delivery_method?: string | null
          expected_delivery_at?: string | null
          id?: string
          material_list_id: string
          ordered_at?: string | null
          ordered_by?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier?: string | null
          supplier_order_number?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          delivery_location?: string | null
          delivery_method?: string | null
          expected_delivery_at?: string | null
          id?: string
          material_list_id?: string
          ordered_at?: string | null
          ordered_by?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier?: string | null
          supplier_order_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_procurements_material_list_id_fkey"
            columns: ["material_list_id"]
            isOneToOne: false
            referencedRelation: "material_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      material_products: {
        Row: {
          active: boolean
          category: string | null
          comment: string | null
          company_id: string
          created_at: string
          description: string
          elnr: string | null
          id: string
          supplier: string | null
          supplier_sku: string | null
          unit: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          comment?: string | null
          company_id: string
          created_at?: string
          description: string
          elnr?: string | null
          id?: string
          supplier?: string | null
          supplier_sku?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          comment?: string | null
          company_id?: string
          created_at?: string
          description?: string
          elnr?: string | null
          id?: string
          supplier?: string | null
          supplier_sku?: string | null
          unit?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      material_template_items: {
        Row: {
          comment: string | null
          created_at: string
          description: string
          elnr: string | null
          id: string
          quantity: number
          sort_order: number
          supplier: string | null
          template_id: string
          unit: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          description: string
          elnr?: string | null
          id?: string
          quantity?: number
          sort_order?: number
          supplier?: string | null
          template_id: string
          unit?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          description?: string
          elnr?: string | null
          id?: string
          quantity?: number
          sort_order?: number
          supplier?: string | null
          template_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "material_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      material_templates: {
        Row: {
          active: boolean
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      media_annotations: {
        Row: {
          annotated_file_id: string | null
          annotation_json: Json
          created_at: string
          created_by: string | null
          doc_type: string | null
          file_id: string | null
          id: string
          linked_object_label: string | null
          linked_object_ref: string | null
          linked_object_type: string | null
          post_id: string
        }
        Insert: {
          annotated_file_id?: string | null
          annotation_json?: Json
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          file_id?: string | null
          id?: string
          linked_object_label?: string | null
          linked_object_ref?: string | null
          linked_object_type?: string | null
          post_id: string
        }
        Update: {
          annotated_file_id?: string | null
          annotation_json?: Json
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          file_id?: string | null
          id?: string
          linked_object_label?: string | null
          linked_object_ref?: string | null
          linked_object_type?: string | null
          post_id?: string
        }
        Relationships: []
      }
      message_action_suggestions: {
        Row: {
          clicked_action_type: string | null
          clicked_at: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          post_id: string
          suggested_actions: Json
        }
        Insert: {
          clicked_action_type?: string | null
          clicked_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          post_id: string
          suggested_actions?: Json
        }
        Update: {
          clicked_action_type?: string | null
          clicked_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          post_id?: string
          suggested_actions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_action_suggestions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "conversation_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_account_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          user_account_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "conversation_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          post_id: string
          read_at: string
          user_account_id: string
        }
        Insert: {
          id?: string
          post_id: string
          read_at?: string
          user_account_id: string
        }
        Update: {
          id?: string
          post_id?: string
          read_at?: string
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "conversation_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      module_settings: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          label: string
          module_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          label: string
          module_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          label?: string
          module_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      module_user_overrides: {
        Row: {
          created_at: string
          id: string
          is_hidden: boolean
          module_key: string
          user_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          module_key: string
          user_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          module_key?: string
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_user_overrides_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "module_settings"
            referencedColumns: ["module_key"]
          },
          {
            foreignKeyName: "module_user_overrides_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ms_graph_subscriptions: {
        Row: {
          change_type: string
          client_state: string
          company_id: string
          created_at: string
          error_message: string | null
          expiration_at: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          last_renewed_at: string | null
          mailbox_email: string | null
          notification_url: string
          resource: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          change_type?: string
          client_state: string
          company_id: string
          created_at?: string
          error_message?: string | null
          expiration_at: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_renewed_at?: string | null
          mailbox_email?: string | null
          notification_url: string
          resource: string
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          change_type?: string
          client_state?: string
          company_id?: string
          created_at?: string
          error_message?: string | null
          expiration_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_renewed_at?: string | null
          mailbox_email?: string | null
          notification_url?: string
          resource?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ms_graph_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_name: string | null
          actor_user_id: string | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_id: string | null
          id: string
          link_url: string | null
          message: string | null
          priority: string
          push_sent_at: string | null
          push_status: string
          read: boolean
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_name?: string | null
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_id?: string | null
          id?: string
          link_url?: string | null
          message?: string | null
          priority?: string
          push_sent_at?: string | null
          push_status?: string
          read?: boolean
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_id?: string | null
          id?: string
          link_url?: string | null
          message?: string | null
          priority?: string
          push_sent_at?: string | null
          push_status?: string
          read?: boolean
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      objects_catalog: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          meta: Json | null
          object_type: string
          project_id: string
          synonyms: string[] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          meta?: Json | null
          object_type?: string
          project_id: string
          synonyms?: string[] | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          meta?: Json | null
          object_type?: string
          project_id?: string
          synonyms?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_catalog_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_activity_events: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["offer_activity_actor_type"]
          company_id: string | null
          event_at: string
          event_type: Database["public"]["Enums"]["offer_activity_event_type"]
          id: string
          meta: Json | null
          offer_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["offer_activity_actor_type"]
          company_id?: string | null
          event_at?: string
          event_type: Database["public"]["Enums"]["offer_activity_event_type"]
          id?: string
          meta?: Json | null
          offer_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["offer_activity_actor_type"]
          company_id?: string | null
          event_at?: string
          event_type?: Database["public"]["Enums"]["offer_activity_event_type"]
          id?: string
          meta?: Json | null
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_activity_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_activity_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_comments: {
        Row: {
          author_id: string | null
          calculation_id: string
          comment_type: string
          company_id: string | null
          content: string
          created_at: string
          id: string
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          calculation_id: string
          comment_type?: string
          company_id?: string | null
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          calculation_id?: string
          comment_type?: string
          company_id?: string | null
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_comments_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_comments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_followup_tasks: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          customer_name: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          meta: Json | null
          offer_id: string
          priority: Database["public"]["Enums"]["offer_followup_priority"]
          snoozed_until: string | null
          status: Database["public"]["Enums"]["offer_followup_status"]
          task_type: Database["public"]["Enums"]["offer_followup_type"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_name?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          meta?: Json | null
          offer_id: string
          priority?: Database["public"]["Enums"]["offer_followup_priority"]
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["offer_followup_status"]
          task_type: Database["public"]["Enums"]["offer_followup_type"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_name?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          meta?: Json | null
          offer_id?: string
          priority?: Database["public"]["Enums"]["offer_followup_priority"]
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["offer_followup_status"]
          task_type?: Database["public"]["Enums"]["offer_followup_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_followup_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_followup_tasks_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          accepted_at: string | null
          accepted_comment: string | null
          accepted_email: string | null
          accepted_ip: string | null
          accepted_name: string | null
          archived_at: string | null
          archived_by: string | null
          calculation_id: string
          company_id: string | null
          content_hash: string | null
          created_at: string
          created_by: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          external_tripletex_number: string | null
          generated_html_snapshot: string | null
          generated_pdf_url: string | null
          id: string
          lead_id: string | null
          offer_number: string
          public_token: string | null
          rejected_at: string | null
          rejected_comment: string | null
          sent_at: string | null
          sent_to_email: string | null
          source_case_id: string | null
          source_case_item_id: string | null
          status: Database["public"]["Enums"]["offer_status"]
          total_ex_vat: number
          total_inc_vat: number
          valid_until: string | null
          version: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_comment?: string | null
          accepted_email?: string | null
          accepted_ip?: string | null
          accepted_name?: string | null
          archived_at?: string | null
          archived_by?: string | null
          calculation_id: string
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          external_tripletex_number?: string | null
          generated_html_snapshot?: string | null
          generated_pdf_url?: string | null
          id?: string
          lead_id?: string | null
          offer_number: string
          public_token?: string | null
          rejected_at?: string | null
          rejected_comment?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          source_case_id?: string | null
          source_case_item_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          total_ex_vat?: number
          total_inc_vat?: number
          valid_until?: string | null
          version?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_comment?: string | null
          accepted_email?: string | null
          accepted_ip?: string | null
          accepted_name?: string | null
          archived_at?: string | null
          archived_by?: string | null
          calculation_id?: string
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          external_tripletex_number?: string | null
          generated_html_snapshot?: string | null
          generated_pdf_url?: string | null
          id?: string
          lead_id?: string | null
          offer_number?: string
          public_token?: string | null
          rejected_at?: string | null
          rejected_comment?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          source_case_id?: string | null
          source_case_item_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          total_ex_vat?: number
          total_inc_vat?: number
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_source_case_id_fkey"
            columns: ["source_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_source_case_item_id_fkey"
            columns: ["source_case_item_id"]
            isOneToOne: false
            referencedRelation: "case_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_activity_log: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json | null
          submission_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          submission_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_form_activity_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_catalog_settings: {
        Row: {
          company_id: string
          contact_info: string | null
          help_text: string | null
          id: string
          is_active: boolean | null
          subtitle: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          contact_info?: string | null
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          contact_info?: string | null
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_catalog_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_categories: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          show_in_catalog: boolean
          slug: string
          sort_order: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          show_in_catalog?: boolean
          slug: string
          sort_order?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          show_in_catalog?: boolean
          slug?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_comments: {
        Row: {
          author_name: string | null
          body: string
          comment_type: string
          created_at: string
          created_by: string | null
          id: string
          is_customer_reply: boolean | null
          submission_id: string
          visibility: string | null
        }
        Insert: {
          author_name?: string | null
          body: string
          comment_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_customer_reply?: boolean | null
          submission_id: string
          visibility?: string | null
        }
        Update: {
          author_name?: string | null
          body?: string
          comment_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_customer_reply?: boolean | null
          submission_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_field_requests: {
        Row: {
          answer_value: Json | null
          answered_at: string | null
          created_at: string
          field_key: string | null
          field_label: string
          field_type: string
          id: string
          is_free_text: boolean
          options: Json | null
          request_batch_id: string
          requested_at: string
          requested_by: string | null
          requested_by_name: string | null
          status: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          answer_value?: Json | null
          answered_at?: string | null
          created_at?: string
          field_key?: string | null
          field_label: string
          field_type?: string
          id?: string
          is_free_text?: boolean
          options?: Json | null
          request_batch_id: string
          requested_at?: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          answer_value?: Json | null
          answered_at?: string | null
          created_at?: string
          field_key?: string | null
          field_label?: string
          field_type?: string
          id?: string
          is_free_text?: boolean
          options?: Json | null
          request_batch_id?: string
          requested_at?: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_form_field_requests_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_message_reads: {
        Row: {
          id: string
          message_id: string
          participant_id: string
          read_at: string
          reader_type: string
          submission_id: string
          tracking_token_hash: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          message_id: string
          participant_id: string
          read_at?: string
          reader_type: string
          submission_id: string
          tracking_token_hash?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          message_id?: string
          participant_id?: string
          read_at?: string
          reader_type?: string
          submission_id?: string
          tracking_token_hash?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "order_form_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_message_reads_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "order_form_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_message_reads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_messages: {
        Row: {
          addressed_to_participant_id: string | null
          body: string
          client_request_id: string | null
          created_at: string
          email_notification_sent: boolean
          email_notification_sent_at: string | null
          id: string
          is_visible_to_customer: boolean
          message_type: string
          replied_at: string | null
          requires_reply: boolean
          review_status: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          sender_name: string | null
          sender_participant_id: string | null
          sender_type: string
          sender_user_id: string | null
          source: string
          submission_id: string
          visibility: string
        }
        Insert: {
          addressed_to_participant_id?: string | null
          body: string
          client_request_id?: string | null
          created_at?: string
          email_notification_sent?: boolean
          email_notification_sent_at?: string | null
          id?: string
          is_visible_to_customer?: boolean
          message_type?: string
          replied_at?: string | null
          requires_reply?: boolean
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          sender_name?: string | null
          sender_participant_id?: string | null
          sender_type: string
          sender_user_id?: string | null
          source?: string
          submission_id: string
          visibility?: string
        }
        Update: {
          addressed_to_participant_id?: string | null
          body?: string
          client_request_id?: string | null
          created_at?: string
          email_notification_sent?: boolean
          email_notification_sent_at?: string | null
          id?: string
          is_visible_to_customer?: boolean
          message_type?: string
          replied_at?: string | null
          requires_reply?: boolean
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          sender_name?: string | null
          sender_participant_id?: string | null
          sender_type?: string
          sender_user_id?: string | null
          source?: string
          submission_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_form_messages_addressed_to_participant_id_fkey"
            columns: ["addressed_to_participant_id"]
            isOneToOne: false
            referencedRelation: "order_form_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_messages_sender_participant_id_fkey"
            columns: ["sender_participant_id"]
            isOneToOne: false
            referencedRelation: "order_form_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_messages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_participants: {
        Row: {
          added_at: string
          added_by: string | null
          can_reply: boolean
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string | null
          id: string
          inbound_token: string | null
          is_active: boolean
          is_visible_to_customer: boolean
          last_seen_at: string | null
          last_seen_message_id: string | null
          name: string
          participant_type: string
          phone: string | null
          receives_notifications: boolean
          role_label: string | null
          submission_id: string
          technician_id: string | null
          user_id: string | null
          visibility: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          can_reply?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          inbound_token?: string | null
          is_active?: boolean
          is_visible_to_customer?: boolean
          last_seen_at?: string | null
          last_seen_message_id?: string | null
          name: string
          participant_type?: string
          phone?: string | null
          receives_notifications?: boolean
          role_label?: string | null
          submission_id: string
          technician_id?: string | null
          user_id?: string | null
          visibility?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          can_reply?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          inbound_token?: string | null
          is_active?: boolean
          is_visible_to_customer?: boolean
          last_seen_at?: string | null
          last_seen_message_id?: string | null
          name?: string
          participant_type?: string
          phone?: string | null
          receives_notifications?: boolean
          role_label?: string | null
          submission_id?: string
          technician_id?: string | null
          user_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_form_participants_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_submission_attachments: {
        Row: {
          category: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          description: string | null
          display_name: string | null
          field_key: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string | null
          mime_type: string | null
          original_filename: string | null
          renamed_at: string | null
          renamed_by: string | null
          submission_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description?: string | null
          display_name?: string | null
          field_key?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          original_filename?: string | null
          renamed_at?: string | null
          renamed_by?: string | null
          submission_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          description?: string | null
          display_name?: string | null
          field_key?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          original_filename?: string | null
          renamed_at?: string | null
          renamed_by?: string | null
          submission_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_submission_attachments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_submission_values: {
        Row: {
          created_at: string
          field_key: string
          id: string
          submission_id: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          submission_id: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          submission_id?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_submission_values_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "order_form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_submissions: {
        Row: {
          assigned_to: string | null
          auto_notify_on_status_change: boolean | null
          awaiting_customer_reply: boolean
          channel: string | null
          closed_at: string | null
          closed_by: string | null
          commercial_case_id: string | null
          company_id: string
          confirmation_sent_at: string | null
          converted_to_id: string | null
          converted_to_type: string | null
          created_at: string
          customer_last_reply_at: string | null
          customer_last_viewed_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          external_status: string | null
          external_status_updated_at: string | null
          id: string
          inbound_token: string
          last_activity_at: string | null
          last_admin_message_at: string | null
          last_customer_message_at: string | null
          linked_case_id: string | null
          linked_customer_id: string | null
          linked_event_id: string | null
          linked_project_id: string | null
          notification_error: string | null
          notification_recipient_email: string | null
          notification_recipient_name: string | null
          notification_recipient_phone: string | null
          notification_recipient_source: string | null
          notification_sent_at: string | null
          open_request_message_id: string | null
          priority: string
          public_tracking_token: string | null
          quality_issues: Json | null
          quality_score: string | null
          requester_type: string
          source: string
          source_lead_id: string | null
          status: string
          submission_no: string
          submitted_at: string
          submitted_by: string | null
          submitter_email: string | null
          submitter_name: string | null
          submitter_user_id: string | null
          summary: Json | null
          template_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_notify_on_status_change?: boolean | null
          awaiting_customer_reply?: boolean
          channel?: string | null
          closed_at?: string | null
          closed_by?: string | null
          commercial_case_id?: string | null
          company_id: string
          confirmation_sent_at?: string | null
          converted_to_id?: string | null
          converted_to_type?: string | null
          created_at?: string
          customer_last_reply_at?: string | null
          customer_last_viewed_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          external_status?: string | null
          external_status_updated_at?: string | null
          id?: string
          inbound_token: string
          last_activity_at?: string | null
          last_admin_message_at?: string | null
          last_customer_message_at?: string | null
          linked_case_id?: string | null
          linked_customer_id?: string | null
          linked_event_id?: string | null
          linked_project_id?: string | null
          notification_error?: string | null
          notification_recipient_email?: string | null
          notification_recipient_name?: string | null
          notification_recipient_phone?: string | null
          notification_recipient_source?: string | null
          notification_sent_at?: string | null
          open_request_message_id?: string | null
          priority?: string
          public_tracking_token?: string | null
          quality_issues?: Json | null
          quality_score?: string | null
          requester_type?: string
          source?: string
          source_lead_id?: string | null
          status?: string
          submission_no?: string
          submitted_at?: string
          submitted_by?: string | null
          submitter_email?: string | null
          submitter_name?: string | null
          submitter_user_id?: string | null
          summary?: Json | null
          template_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_notify_on_status_change?: boolean | null
          awaiting_customer_reply?: boolean
          channel?: string | null
          closed_at?: string | null
          closed_by?: string | null
          commercial_case_id?: string | null
          company_id?: string
          confirmation_sent_at?: string | null
          converted_to_id?: string | null
          converted_to_type?: string | null
          created_at?: string
          customer_last_reply_at?: string | null
          customer_last_viewed_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          external_status?: string | null
          external_status_updated_at?: string | null
          id?: string
          inbound_token?: string
          last_activity_at?: string | null
          last_admin_message_at?: string | null
          last_customer_message_at?: string | null
          linked_case_id?: string | null
          linked_customer_id?: string | null
          linked_event_id?: string | null
          linked_project_id?: string | null
          notification_error?: string | null
          notification_recipient_email?: string | null
          notification_recipient_name?: string | null
          notification_recipient_phone?: string | null
          notification_recipient_source?: string | null
          notification_sent_at?: string | null
          open_request_message_id?: string | null
          priority?: string
          public_tracking_token?: string | null
          quality_issues?: Json | null
          quality_score?: string | null
          requester_type?: string
          source?: string
          source_lead_id?: string | null
          status?: string
          submission_no?: string
          submitted_at?: string
          submitted_by?: string | null
          submitter_email?: string | null
          submitter_name?: string | null
          submitter_user_id?: string | null
          summary?: Json | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_form_submissions_commercial_case_id_fkey"
            columns: ["commercial_case_id"]
            isOneToOne: false
            referencedRelation: "commercial_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_submissions_linked_case_id_fkey"
            columns: ["linked_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_submissions_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_submissions_open_request_message_id_fkey"
            columns: ["open_request_message_id"]
            isOneToOne: false
            referencedRelation: "order_form_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_submissions_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_template_fields: {
        Row: {
          conditional_logic: Json | null
          created_at: string
          default_value: Json | null
          field_key: string
          field_type: string
          field_width: string
          help_text: string | null
          id: string
          is_active: boolean
          is_readonly: boolean
          is_required: boolean
          label: string
          options: Json | null
          placeholder: string | null
          section_id: string
          sort_order: number
          template_id: string
          validation: Json | null
        }
        Insert: {
          conditional_logic?: Json | null
          created_at?: string
          default_value?: Json | null
          field_key: string
          field_type: string
          field_width?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_readonly?: boolean
          is_required?: boolean
          label: string
          options?: Json | null
          placeholder?: string | null
          section_id: string
          sort_order?: number
          template_id: string
          validation?: Json | null
        }
        Update: {
          conditional_logic?: Json | null
          created_at?: string
          default_value?: Json | null
          field_key?: string
          field_type?: string
          field_width?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_readonly?: boolean
          is_required?: boolean
          label?: string
          options?: Json | null
          placeholder?: string | null
          section_id?: string
          sort_order?: number
          template_id?: string
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_template_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "order_form_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_template_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          sort_order: number
          template_id: string
          title: string
          visibility_rules: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          template_id: string
          title: string
          visibility_rules?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          template_id?: string
          title?: string
          visibility_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_form_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_form_templates: {
        Row: {
          audience_type: string
          category: string | null
          category_id: string | null
          company_id: string
          confirmation_text: string | null
          created_at: string
          created_by: string | null
          default_handling_rule: string | null
          default_priority: string | null
          default_status: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          external_help_text: string | null
          external_title: string | null
          id: string
          internal_help_text: string | null
          internal_title: string | null
          is_active: boolean
          name: string
          on_submit_action: string
          requires_login: boolean
          send_email_to: string[] | null
          show_in_catalog: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          audience_type?: string
          category?: string | null
          category_id?: string | null
          company_id: string
          confirmation_text?: string | null
          created_at?: string
          created_by?: string | null
          default_handling_rule?: string | null
          default_priority?: string | null
          default_status?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          external_help_text?: string | null
          external_title?: string | null
          id?: string
          internal_help_text?: string | null
          internal_title?: string | null
          is_active?: boolean
          name: string
          on_submit_action?: string
          requires_login?: boolean
          send_email_to?: string[] | null
          show_in_catalog?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          audience_type?: string
          category?: string | null
          category_id?: string | null
          company_id?: string
          confirmation_text?: string | null
          created_at?: string
          created_by?: string | null
          default_handling_rule?: string | null
          default_priority?: string | null
          default_status?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          external_help_text?: string | null
          external_title?: string | null
          id?: string
          internal_help_text?: string | null
          internal_title?: string | null
          is_active?: boolean
          name?: string
          on_submit_action?: string
          requires_login?: boolean
          send_email_to?: string[] | null
          show_in_catalog?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_form_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "order_form_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_form_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          calculation_id: string
          created_at: string
          description: string
          discount_percent: number
          id: string
          line_type: string
          quantity: number
          sort_order: number
          suggested_by_ai: boolean
          total_ex_vat: number | null
          total_inc_vat: number | null
          unit: string | null
          unit_price: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          calculation_id: string
          created_at?: string
          description?: string
          discount_percent?: number
          id?: string
          line_type?: string
          quantity?: number
          sort_order?: number
          suggested_by_ai?: boolean
          total_ex_vat?: number | null
          total_inc_vat?: number | null
          unit?: string | null
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          calculation_id?: string
          created_at?: string
          description?: string
          discount_percent?: number
          id?: string
          line_type?: string
          quantity?: number
          sort_order?: number
          suggested_by_ai?: boolean
          total_ex_vat?: number | null
          total_inc_vat?: number | null
          unit?: string | null
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_hours: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          period_end: string
          period_start: string
          reason: string | null
          reason_type: string | null
          status: string
          updated_at: string
          user_id: string
          worktime_entry_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_hours?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_end: string
          period_start: string
          reason?: string | null
          reason_type?: string | null
          status?: string
          updated_at?: string
          user_id: string
          worktime_entry_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_hours?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_end?: string
          period_start?: string
          reason?: string | null
          reason_type?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          worktime_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overtime_approvals_worktime_entry_id_fkey"
            columns: ["worktime_entry_id"]
            isOneToOne: false
            referencedRelation: "worktime_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          description: string | null
          id: string
          key: string
          module: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          module: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          module?: string
        }
        Relationships: []
      }
      person_customer_authorizations: {
        Row: {
          authorization_status: string
          created_at: string
          customer_name: string
          id: string
          interview_date: string | null
          notes: string | null
          person_id: string
          project_id: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          authorization_status?: string
          created_at?: string
          customer_name: string
          id?: string
          interview_date?: string | null
          notes?: string | null
          person_id: string
          project_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          authorization_status?: string
          created_at?: string
          customer_name?: string
          id?: string
          interview_date?: string | null
          notes?: string | null
          person_id?: string
          project_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_customer_authorizations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_customer_authorizations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_customer_authorizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      person_security_profiles: {
        Row: {
          clearance_level: string | null
          clearance_status: string
          clearance_valid_until: string | null
          created_at: string
          id: string
          nda_status: string
          person_id: string
          pob_status: string
          sensitive_note: string | null
          updated_at: string
        }
        Insert: {
          clearance_level?: string | null
          clearance_status?: string
          clearance_valid_until?: string | null
          created_at?: string
          id?: string
          nda_status?: string
          person_id: string
          pob_status?: string
          sensitive_note?: string | null
          updated_at?: string
        }
        Update: {
          clearance_level?: string | null
          clearance_status?: string
          clearance_valid_until?: string | null
          created_at?: string
          id?: string
          nda_status?: string
          person_id?: string
          pob_status?: string
          sensitive_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_security_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_security_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notification_preferences: {
        Row: {
          channel_email: boolean
          channel_portal: boolean
          channel_sms: boolean
          created_at: string
          id: string
          notify_new_document: boolean
          notify_new_message: boolean
          notify_new_report: boolean
          notify_pending_approval: boolean
          notify_project_update: boolean
          notify_weekly_summary: boolean
          portal_user_id: string
          updated_at: string
        }
        Insert: {
          channel_email?: boolean
          channel_portal?: boolean
          channel_sms?: boolean
          created_at?: string
          id?: string
          notify_new_document?: boolean
          notify_new_message?: boolean
          notify_new_report?: boolean
          notify_pending_approval?: boolean
          notify_project_update?: boolean
          notify_weekly_summary?: boolean
          portal_user_id: string
          updated_at?: string
        }
        Update: {
          channel_email?: boolean
          channel_portal?: boolean
          channel_sms?: boolean
          created_at?: string
          id?: string
          notify_new_document?: boolean
          notify_new_message?: boolean
          notify_new_report?: boolean
          notify_pending_approval?: boolean
          notify_project_update?: boolean
          notify_weekly_summary?: boolean
          portal_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_notification_preferences_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notifications: {
        Row: {
          body_preview: string | null
          channel: string
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          notification_type: string
          portal_link: string | null
          portal_user_id: string
          read_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          entity_id: string
          entity_type?: string
          error_message?: string | null
          id?: string
          notification_type: string
          portal_link?: string | null
          portal_user_id: string
          read_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          notification_type?: string
          portal_link?: string | null
          portal_user_id?: string
          read_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_notifications_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          default_unit: string
          default_unit_price: number
          default_vat_rate: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_unit?: string
          default_unit_price?: number
          default_vat_rate?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_unit?: string
          default_unit_price?: number
          default_vat_rate?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          member_type: string
          project_id: string
          role: string
          user_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_type?: string
          project_id: string
          role?: string
          user_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_type?: string
          project_id?: string
          role?: string
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_security_requirements: {
        Row: {
          created_at: string
          customer_name: string | null
          deadline: string | null
          id: string
          notes: string | null
          project_id: string
          requires_clearance: boolean
          requires_customer_authorization: boolean
          requires_nda: boolean
          requires_pob: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          deadline?: string | null
          id?: string
          notes?: string | null
          project_id: string
          requires_clearance?: boolean
          requires_customer_authorization?: boolean
          requires_nda?: boolean
          requires_pob?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          deadline?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          requires_clearance?: boolean
          requires_customer_authorization?: boolean
          requires_nda?: boolean
          requires_pob?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_security_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sharepoint_category_mappings: {
        Row: {
          category_key: string
          created_at: string
          display_name: string
          drive_id: string
          folder_id: string
          folder_path: string
          folder_web_url: string | null
          id: string
          project_id: string
          site_id: string | null
          updated_at: string
        }
        Insert: {
          category_key: string
          created_at?: string
          display_name: string
          drive_id: string
          folder_id: string
          folder_path: string
          folder_web_url?: string | null
          id?: string
          project_id: string
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          category_key?: string
          created_at?: string
          display_name?: string
          drive_id?: string
          folder_id?: string
          folder_path?: string
          folder_web_url?: string | null
          id?: string
          project_id?: string
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sharepoint_category_mappings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      project_spaces: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          project_id: string
          space_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          project_id: string
          space_key: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          project_id?: string
          space_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_spaces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      regulation_queries: {
        Row: {
          actions: Json | null
          answer_detail: string | null
          answer_summary: string | null
          company_id: string | null
          context_json: Json | null
          context_text: string | null
          created_at: string
          created_by: string
          id: string
          is_orphan: boolean
          orphan_detected_at: string | null
          orphan_reason: string | null
          parent_id: string | null
          pinned: boolean
          pitfalls: Json | null
          question: string
          references_to_check: string[] | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_status: string
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["regulation_scope_type"]
          suggested_calc_lines: Json | null
          suggested_reservations: string[] | null
          tags: string[] | null
          topic: Database["public"]["Enums"]["regulation_topic"]
          usage_count: number
          usefulness_rating: number | null
        }
        Insert: {
          actions?: Json | null
          answer_detail?: string | null
          answer_summary?: string | null
          company_id?: string | null
          context_json?: Json | null
          context_text?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_orphan?: boolean
          orphan_detected_at?: string | null
          orphan_reason?: string | null
          parent_id?: string | null
          pinned?: boolean
          pitfalls?: Json | null
          question: string
          references_to_check?: string[] | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_status?: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["regulation_scope_type"]
          suggested_calc_lines?: Json | null
          suggested_reservations?: string[] | null
          tags?: string[] | null
          topic?: Database["public"]["Enums"]["regulation_topic"]
          usage_count?: number
          usefulness_rating?: number | null
        }
        Update: {
          actions?: Json | null
          answer_detail?: string | null
          answer_summary?: string | null
          company_id?: string | null
          context_json?: Json | null
          context_text?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_orphan?: boolean
          orphan_detected_at?: string | null
          orphan_reason?: string | null
          parent_id?: string | null
          pinned?: boolean
          pitfalls?: Json | null
          question?: string
          references_to_check?: string[] | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_status?: string
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["regulation_scope_type"]
          suggested_calc_lines?: Json | null
          suggested_reservations?: string[] | null
          tags?: string[] | null
          topic?: Database["public"]["Enums"]["regulation_topic"]
          usage_count?: number
          usefulness_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regulation_queries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulation_queries_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "regulation_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          id: string
          permission_key: string
          role_id: string
        }
        Insert: {
          allowed?: boolean
          id?: string
          permission_key: string
          role_id: string
        }
        Update: {
          allowed?: boolean
          id?: string
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name?: string
        }
        Relationships: []
      }
      schedule_blocks: {
        Row: {
          ai_confidence: number | null
          ai_match_reason: string | null
          calendar_id: string | null
          client_request_id: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          description: string | null
          end_at: string
          id: string
          job_id: string | null
          last_modified: string | null
          location: string | null
          match_confidence: number | null
          match_reason: string | null
          match_state: string
          mcs_block_id: string | null
          outlook_etag: string | null
          outlook_event_id: string | null
          outlook_location: string | null
          outlook_organizer: string | null
          outlook_preview: string | null
          outlook_subject: string | null
          outlook_weblink: string | null
          project_id: string | null
          source: string
          start_at: string
          technician_id: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_match_reason?: string | null
          calendar_id?: string | null
          client_request_id?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          end_at: string
          id?: string
          job_id?: string | null
          last_modified?: string | null
          location?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          match_state?: string
          mcs_block_id?: string | null
          outlook_etag?: string | null
          outlook_event_id?: string | null
          outlook_location?: string | null
          outlook_organizer?: string | null
          outlook_preview?: string | null
          outlook_subject?: string | null
          outlook_weblink?: string | null
          project_id?: string | null
          source?: string
          start_at: string
          technician_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_match_reason?: string | null
          calendar_id?: string | null
          client_request_id?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          description?: string | null
          end_at?: string
          id?: string
          job_id?: string | null
          last_modified?: string | null
          location?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          match_state?: string
          mcs_block_id?: string | null
          outlook_etag?: string | null
          outlook_event_id?: string | null
          outlook_location?: string | null
          outlook_organizer?: string | null
          outlook_preview?: string | null
          outlook_subject?: string | null
          outlook_weblink?: string | null
          project_id?: string | null
          source?: string
          start_at?: string
          technician_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_sync_runs: {
        Row: {
          continuation_token: string | null
          errors: string[] | null
          events_fetched: number
          finished_at: string | null
          id: string
          needs_confirmation: number
          run_id: string
          started_at: string
          status: string
          techs_processed: number
          upserts: number
        }
        Insert: {
          continuation_token?: string | null
          errors?: string[] | null
          events_fetched?: number
          finished_at?: string | null
          id?: string
          needs_confirmation?: number
          run_id: string
          started_at?: string
          status?: string
          techs_processed?: number
          upserts?: number
        }
        Update: {
          continuation_token?: string | null
          errors?: string[] | null
          events_fetched?: number
          finished_at?: string | null
          id?: string
          needs_confirmation?: number
          run_id?: string
          started_at?: string
          status?: string
          techs_processed?: number
          upserts?: number
        }
        Relationships: []
      }
      schedule_sync_state: {
        Row: {
          calendar_id: string
          created_at: string
          delta_link: string | null
          id: string
          last_synced_at: string | null
          technician_id: string
          updated_at: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          delta_link?: string | null
          id?: string
          last_synced_at?: string | null
          technician_id: string
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          delta_link?: string | null
          id?: string
          last_synced_at?: string | null
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_sync_state_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      service_jobs: {
        Row: {
          address: string | null
          case_id: string | null
          client_request_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          project_id: string | null
          starts_at: string
          status: string
          technician_id: string
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          case_id?: string | null
          client_request_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          project_id?: string | null
          starts_at: string
          status?: string
          technician_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          case_id?: string | null
          client_request_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          project_id?: string | null
          starts_at?: string
          status?: string
          technician_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_jobs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_jobs_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      service_journal_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          journal_id: string
          pin_hash: string | null
          token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          journal_id: string
          pin_hash?: string | null
          token?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          journal_id?: string
          pin_hash?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_journal_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_journal_shares_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "service_journals"
            referencedColumns: ["id"]
          },
        ]
      }
      service_journals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_portal_user_id: string | null
          approved_version: number | null
          billing_status: string
          company_id: string | null
          content: Json
          created_at: string
          created_by: string | null
          id: string
          locked_at: string | null
          pdf_storage_path: string | null
          project_id: string
          report_type: string
          section_visibility: Json | null
          sent_at: string | null
          sent_to_email: string | null
          signatures: Json | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_portal_user_id?: string | null
          approved_version?: number | null
          billing_status?: string
          company_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          pdf_storage_path?: string | null
          project_id: string
          report_type?: string
          section_visibility?: Json | null
          sent_at?: string | null
          sent_to_email?: string | null
          signatures?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_portal_user_id?: string | null
          approved_version?: number | null
          billing_status?: string
          company_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          pdf_storage_path?: string | null
          project_id?: string
          report_type?: string
          section_visibility?: Json | null
          sent_at?: string | null
          sent_to_email?: string | null
          signatures?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_journals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_journals_approved_by_portal_user_id_fkey"
            columns: ["approved_by_portal_user_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_journals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_journals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_journals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      space_members: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          role: string
          space_id: string
          user_account_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          role?: string
          space_id: string
          user_account_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          role?: string
          space_id?: string
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "project_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      superoffice_settings: {
        Row: {
          auto_assign_enabled: boolean
          auto_assign_sales_user_id: string | null
          auto_assign_service_user_id: string | null
          auto_triage_enabled: boolean
          catchall_enabled: boolean
          catchall_mailbox_address: string | null
          company_id: string
          default_case_scope: string
          default_case_status: string
          default_mailbox_address: string | null
          default_priority: string
          updated_at: string
        }
        Insert: {
          auto_assign_enabled?: boolean
          auto_assign_sales_user_id?: string | null
          auto_assign_service_user_id?: string | null
          auto_triage_enabled?: boolean
          catchall_enabled?: boolean
          catchall_mailbox_address?: string | null
          company_id: string
          default_case_scope?: string
          default_case_status?: string
          default_mailbox_address?: string | null
          default_priority?: string
          updated_at?: string
        }
        Update: {
          auto_assign_enabled?: boolean
          auto_assign_sales_user_id?: string | null
          auto_assign_service_user_id?: string | null
          auto_triage_enabled?: boolean
          catchall_enabled?: boolean
          catchall_mailbox_address?: string | null
          company_id?: string
          default_case_scope?: string
          default_case_status?: string
          default_mailbox_address?: string | null
          default_priority?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "superoffice_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          id: string
          notified_at: string | null
          removed_at: string | null
          role: string
          task_id: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          notified_at?: string | null
          removed_at?: string | null
          role?: string
          task_id: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          notified_at?: string | null
          removed_at?: string | null
          role?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          document_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_message_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string
          mime_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_message_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      task_messages: {
        Row: {
          author_email: string | null
          author_name: string | null
          author_user_id: string | null
          body: string | null
          body_html: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          email_status: string | null
          external_in_reply_to: string | null
          external_message_id: string | null
          external_references: string[] | null
          id: string
          inbound_received_at: string | null
          message_type: string
          metadata: Json
          priority: string
          raw_headers: Json | null
          recipients: Json | null
          reply_to_address: string | null
          reply_to_message_id: string | null
          subject: string | null
          task_id: string
          thread_id: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          author_user_id?: string | null
          body?: string | null
          body_html?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          email_status?: string | null
          external_in_reply_to?: string | null
          external_message_id?: string | null
          external_references?: string[] | null
          id?: string
          inbound_received_at?: string | null
          message_type?: string
          metadata?: Json
          priority?: string
          raw_headers?: Json | null
          recipients?: Json | null
          reply_to_address?: string | null
          reply_to_message_id?: string | null
          subject?: string | null
          task_id: string
          thread_id: string
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          author_user_id?: string | null
          body?: string | null
          body_html?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          email_status?: string | null
          external_in_reply_to?: string | null
          external_message_id?: string | null
          external_references?: string[] | null
          id?: string
          inbound_received_at?: string | null
          message_type?: string
          metadata?: Json
          priority?: string
          raw_headers?: Json | null
          recipients?: Json | null
          reply_to_address?: string | null
          reply_to_message_id?: string | null
          subject?: string | null
          task_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "task_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      task_thread_digest_deliveries: {
        Row: {
          company_id: string | null
          digest_type: string
          id: string
          item_count: number
          metadata: Json | null
          sent_at: string
          summary_date: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          digest_type?: string
          id?: string
          item_count?: number
          metadata?: Json | null
          sent_at?: string
          summary_date: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          digest_type?: string
          id?: string
          item_count?: number
          metadata?: Json | null
          sent_at?: string
          summary_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_thread_digest_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_thread_escalations: {
        Row: {
          created_at: string
          id: string
          last_reminded_at: string
          message_id: string
          reminder_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_reminded_at?: string
          message_id: string
          reminder_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_reminded_at?: string
          message_id?: string
          reminder_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_thread_escalations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      task_thread_reads: {
        Row: {
          created_at: string
          id: string
          last_read_at: string
          last_read_message_id: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_thread_reads_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_thread_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "task_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      task_threads: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          task_id: string
          thread_token: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          task_id: string
          thread_token?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          task_id?: string
          thread_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_threads_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          ai_confidence: number | null
          ai_rationale: string | null
          ai_suggested: boolean
          assigned_user_id: string | null
          calendar_event_id: string | null
          calendar_provider: string | null
          client_request_id: string | null
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          estimated_minutes: number | null
          id: string
          linked_lead_id: string | null
          linked_offer_id: string | null
          linked_project_id: string | null
          linked_work_order_id: string | null
          owner_user_id: string | null
          planned_end_at: string | null
          planned_start_at: string | null
          priority: string
          source_case_id: string | null
          source_case_item_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_rationale?: string | null
          ai_suggested?: boolean
          assigned_user_id?: string | null
          calendar_event_id?: string | null
          calendar_provider?: string | null
          client_request_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          linked_lead_id?: string | null
          linked_offer_id?: string | null
          linked_project_id?: string | null
          linked_work_order_id?: string | null
          owner_user_id?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          priority?: string
          source_case_id?: string | null
          source_case_item_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_rationale?: string | null
          ai_suggested?: boolean
          assigned_user_id?: string | null
          calendar_event_id?: string | null
          calendar_provider?: string | null
          client_request_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          linked_lead_id?: string | null
          linked_offer_id?: string | null
          linked_project_id?: string | null
          linked_work_order_id?: string | null
          owner_user_id?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          priority?: string
          source_case_id?: string | null
          source_case_item_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_case_id_fkey"
            columns: ["source_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_case_item_id_fkey"
            columns: ["source_case_item_id"]
            isOneToOne: false
            referencedRelation: "case_items"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          avatar_id: string | null
          birth_date: string | null
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          driver_license_classes: string | null
          email: string
          hms_card_expires_at: string | null
          hms_card_number: string | null
          id: string
          is_plannable_resource: boolean
          microsoft_user_id: string | null
          name: string
          notes: string | null
          trade_certificate_type: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_id?: string | null
          birth_date?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          driver_license_classes?: string | null
          email: string
          hms_card_expires_at?: string | null
          hms_card_number?: string | null
          id?: string
          is_plannable_resource?: boolean
          microsoft_user_id?: string | null
          name: string
          notes?: string | null
          trade_certificate_type?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_id?: string | null
          birth_date?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          driver_license_classes?: string | null
          email?: string
          hms_card_expires_at?: string | null
          hms_card_number?: string | null
          id?: string
          is_plannable_resource?: boolean
          microsoft_user_id?: string | null
          name?: string
          notes?: string | null
          trade_certificate_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tenant_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tripletex_import_runs: {
        Row: {
          company_id: string
          counts: Json
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          mode: string
          preview_payload: Json | null
          source_filename: string | null
          started_at: string
          started_by: string | null
          status: string
          total_rows: number
          updated_at: string
        }
        Insert: {
          company_id: string
          counts?: Json
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mode: string
          preview_payload?: Json | null
          source_filename?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          counts?: Json
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          preview_payload?: Json | null
          source_filename?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Relationships: []
      }
      tripletex_project_mappings: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          last_imported_at: string | null
          last_payload_hash: string | null
          mcs_project_id: string
          tripletex_project_id: string
          tripletex_project_number: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_imported_at?: string | null
          last_payload_hash?: string | null
          mcs_project_id: string
          tripletex_project_id: string
          tripletex_project_number?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_imported_at?: string | null
          last_payload_hash?: string | null
          mcs_project_id?: string
          tripletex_project_id?: string
          tripletex_project_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tripletex_project_mappings_mcs_project_id_fkey"
            columns: ["mcs_project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_accounts: {
        Row: {
          auth_user_id: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          person_id: string
        }
        Insert: {
          auth_user_id: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          person_id: string
        }
        Update: {
          auth_user_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
      user_documents: {
        Row: {
          ai_processed_at: string | null
          category: string
          confidence_json: Json | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_fields_json: Json | null
          created_at: string
          doc_type: string
          expires_at: string | null
          extracted_fields_json: Json | null
          file_name: string
          file_path: string
          id: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          ai_processed_at?: string | null
          category?: string
          confidence_json?: Json | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_fields_json?: Json | null
          created_at?: string
          doc_type?: string
          expires_at?: string | null
          extracted_fields_json?: Json | null
          file_name: string
          file_path: string
          id?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          ai_processed_at?: string | null
          category?: string
          confidence_json?: Json | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_fields_json?: Json | null
          created_at?: string
          doc_type?: string
          expires_at?: string | null
          extracted_fields_json?: Json | null
          file_name?: string
          file_path?: string
          id?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memberships: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          is_active: boolean
          role_id: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          role_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          role_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memberships_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          allowed: boolean
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permission_overrides_v2: {
        Row: {
          created_at: string
          id: string
          mode: string
          permission_key: string
          scope_company_id: string | null
          scope_department_id: string | null
          user_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          permission_key: string
          scope_company_id?: string | null
          scope_department_id?: string | null
          user_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          permission_key?: string
          scope_company_id?: string | null
          scope_department_id?: string | null
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_v2_scope_company_id_fkey"
            columns: ["scope_company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_v2_scope_department_id_fkey"
            columns: ["scope_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_v2_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_assignments: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles_v2: {
        Row: {
          created_at: string
          id: string
          role_id: string
          scope_company_id: string | null
          scope_department_id: string | null
          user_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          scope_company_id?: string | null
          scope_department_id?: string | null
          user_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          scope_company_id?: string | null
          scope_department_id?: string | null
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_v2_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_v2_scope_company_id_fkey"
            columns: ["scope_company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_v2_scope_department_id_fkey"
            columns: ["scope_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_v2_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_scopes: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          user_account_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          user_account_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          user_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_scopes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_user_account_id_fkey"
            columns: ["user_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          case_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          project_id: string | null
          starts_at: string
          status: string
          technician_id: string
          title: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          project_id?: string | null
          starts_at: string
          status?: string
          technician_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          project_id?: string | null
          starts_at?: string
          status?: string
          technician_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      worktime_alert_actions: {
        Row: {
          action: string
          alert_id: string
          created_at: string
          id: string
          notes: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          alert_id: string
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          alert_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worktime_alert_actions_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "worktime_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      worktime_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          assigned_to: string | null
          company_id: string
          consequence: string
          created_at: string
          explanation: string | null
          id: string
          period_end: string
          period_start: string
          possible_company_consequence: string | null
          recommended_action: string | null
          resolution_comment: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_key: string
          severity: string
          source_import_batch_id: string | null
          status: string
          suggested_action: string
          threshold: number
          title: string | null
          updated_at: string
          user_id: string
          value: number
          why: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: string | null
          company_id: string
          consequence: string
          created_at?: string
          explanation?: string | null
          id?: string
          period_end: string
          period_start: string
          possible_company_consequence?: string | null
          recommended_action?: string | null
          resolution_comment?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_key: string
          severity?: string
          source_import_batch_id?: string | null
          status?: string
          suggested_action: string
          threshold: number
          title?: string | null
          updated_at?: string
          user_id: string
          value: number
          why: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          assigned_to?: string | null
          company_id?: string
          consequence?: string
          created_at?: string
          explanation?: string | null
          id?: string
          period_end?: string
          period_start?: string
          possible_company_consequence?: string | null
          recommended_action?: string | null
          resolution_comment?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_key?: string
          severity?: string
          source_import_batch_id?: string | null
          status?: string
          suggested_action?: string
          threshold?: number
          title?: string | null
          updated_at?: string
          user_id?: string
          value?: number
          why?: string
        }
        Relationships: [
          {
            foreignKeyName: "worktime_alerts_source_import_batch_id_fkey"
            columns: ["source_import_batch_id"]
            isOneToOne: false
            referencedRelation: "worktime_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      worktime_entries: {
        Row: {
          activity: string | null
          adjustment_reason: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          break_minutes: number
          company_id: string
          created_at: string
          created_manually: boolean
          description: string | null
          employee_name: string | null
          end_at: string | null
          external_employee_id: string | null
          hours: number
          hours_overtime: number
          id: string
          manually_adjusted: boolean
          ordinary_hours: number
          project_external_ref: string | null
          project_id: string | null
          project_number_raw: string | null
          raw_payload: Json | null
          source_external_id: string | null
          source_hash: string
          source_system: string
          start_at: string | null
          status: string
          time_type: string | null
          total_hours: number
          updated_at: string
          user_id: string | null
          work_date: string
        }
        Insert: {
          activity?: string | null
          adjustment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          break_minutes?: number
          company_id: string
          created_at?: string
          created_manually?: boolean
          description?: string | null
          employee_name?: string | null
          end_at?: string | null
          external_employee_id?: string | null
          hours?: number
          hours_overtime?: number
          id?: string
          manually_adjusted?: boolean
          ordinary_hours?: number
          project_external_ref?: string | null
          project_id?: string | null
          project_number_raw?: string | null
          raw_payload?: Json | null
          source_external_id?: string | null
          source_hash: string
          source_system?: string
          start_at?: string | null
          status?: string
          time_type?: string | null
          total_hours?: number
          updated_at?: string
          user_id?: string | null
          work_date: string
        }
        Update: {
          activity?: string | null
          adjustment_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          break_minutes?: number
          company_id?: string
          created_at?: string
          created_manually?: boolean
          description?: string | null
          employee_name?: string | null
          end_at?: string | null
          external_employee_id?: string | null
          hours?: number
          hours_overtime?: number
          id?: string
          manually_adjusted?: boolean
          ordinary_hours?: number
          project_external_ref?: string | null
          project_id?: string | null
          project_number_raw?: string | null
          raw_payload?: Json | null
          source_external_id?: string | null
          source_hash?: string
          source_system?: string
          start_at?: string | null
          status?: string
          time_type?: string | null
          total_hours?: number
          updated_at?: string
          user_id?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "worktime_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "worktime_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      worktime_import_batches: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          filename: string | null
          finished_at: string | null
          id: string
          imported_by: string | null
          mapping: Json | null
          new_rows: number | null
          skipped_rows: number | null
          source_system: string
          status: string
          total_rows: number | null
          unchanged_rows: number | null
          updated_rows: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          filename?: string | null
          finished_at?: string | null
          id?: string
          imported_by?: string | null
          mapping?: Json | null
          new_rows?: number | null
          skipped_rows?: number | null
          source_system?: string
          status?: string
          total_rows?: number | null
          unchanged_rows?: number | null
          updated_rows?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          filename?: string | null
          finished_at?: string | null
          id?: string
          imported_by?: string | null
          mapping?: Json | null
          new_rows?: number | null
          skipped_rows?: number | null
          source_system?: string
          status?: string
          total_rows?: number | null
          unchanged_rows?: number | null
          updated_rows?: number | null
        }
        Relationships: []
      }
      worktime_rule_checks: {
        Row: {
          checked_at: string
          company_id: string
          id: string
          period_end: string
          period_start: string
          rule_key: string
          status: string
          threshold: number
          user_id: string
          value: number
        }
        Insert: {
          checked_at?: string
          company_id: string
          id?: string
          period_end: string
          period_start: string
          rule_key: string
          status: string
          threshold: number
          user_id: string
          value: number
        }
        Update: {
          checked_at?: string
          company_id?: string
          id?: string
          period_end?: string
          period_start?: string
          rule_key?: string
          status?: string
          threshold?: number
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      worktime_rulesets: {
        Row: {
          active_from: string | null
          active_to: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          rules: Json
          updated_at: string
          version: number
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          rules?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          rules?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      technicians_v: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          birth_date: string | null
          color: string | null
          company_id: string | null
          created_at: string | null
          department_id: string | null
          driver_license_classes: string | null
          email: string | null
          hms_card_expires_at: string | null
          hms_card_number: string | null
          id: string | null
          is_plannable_resource: boolean | null
          name: string | null
          notes: string | null
          trade_certificate_type: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compliance_competence_status: {
        Row: {
          category: string | null
          company_id: string | null
          competence_type_id: string | null
          days_to_expiry: number | null
          expires_at: string | null
          has_document: boolean | null
          id: string | null
          person_id: string | null
          requires_document: boolean | null
          status: string | null
          type_name: string | null
          verified_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_competences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "internal_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_competences_competence_type_id_fkey"
            columns: ["competence_type_id"]
            isOneToOne: false
            referencedRelation: "compliance_competence_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_competences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_competences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "technicians_v"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _notif_admin_user_ids: { Args: never; Returns: string[] }
      answer_field_request_by_token: {
        Args: {
          _request_id: string
          _submitter_name?: string
          _token: string
          _value: Json
        }
        Returns: Json
      }
      apply_duplicate_schedule_blocks_cleanup: { Args: never; Returns: Json }
      backfill_commercial_cases_for_active: { Args: never; Returns: Json }
      can_access_record: {
        Args: {
          _record_company_id: string
          _record_created_by: string
          _record_department_id: string
          _record_id: string
          _user_id: string
        }
        Returns: boolean
      }
      can_access_record_v2: {
        Args: {
          _auth_user_id: string
          _record_company_id: string
          _record_created_by: string
          _record_department_id: string
          _record_id: string
        }
        Returns: boolean
      }
      check_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      check_permission_v2: {
        Args: { _auth_user_id: string; _perm: string }
        Returns: boolean
      }
      claim_calendar_sync: {
        Args: {
          _job_id: string
          _lock_window_seconds?: number
          _operation_id: string
          _provider: string
          _technician_id: string
          _user_id: string
        }
        Returns: Json
      }
      cleanup_empty_calculations: { Args: never; Returns: Json }
      compliance_competence_status: {
        Args: {
          _expires_at: string
          _has_document: boolean
          _requires_document: boolean
        }
        Returns: string
      }
      compliance_effective_requirements: {
        Args: { _company_id: string; _person_id?: string }
        Returns: {
          competence_type_id: string
          document_required: boolean
          person_id: string
          reason: string
          required: boolean
          requirement_id: string
          source_label: string
          source_scope: string
          validity_months: number
          warning_days: number
        }[]
      }
      compliance_requirement_impact: {
        Args: { _company_id: string }
        Returns: {
          affected_people: number
          requirement_id: string
        }[]
      }
      compliance_requirement_status: {
        Args: { _company_id: string; _person_id?: string }
        Returns: {
          competence_id: string
          competence_type_id: string
          days_until: number
          document_required: boolean
          expires_at: string
          has_document: boolean
          person_id: string
          reason: string
          required: boolean
          requirement_id: string
          source_label: string
          source_scope: string
          status: string
          validity_months: number
          warning_days: number
        }[]
      }
      compute_submission_summary: {
        Args: { _submission_id: string }
        Returns: Json
      }
      create_material_suggestion: {
        Args: {
          p_comment: string
          p_description: string
          p_elnr: string
          p_email: string
          p_name: string
          p_provided_by: string
          p_quantity: number
          p_token: string
          p_unit: string
        }
        Returns: string
      }
      create_work_visit_on_project: {
        Args: {
          p_client_request_id: string
          p_end: string
          p_extra?: Json
          p_parent_id: string
          p_start: string
          p_technician_ids: string[]
          p_title: string
        }
        Returns: Json
      }
      create_work_visits_on_project_batch:
        | {
            Args: {
              p_client_request_id: string
              p_dates: Json
              p_extra?: Json
              p_parent_id: string
              p_technician_ids: string[]
              p_title: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_dates: string[]
              p_end_time: string
              p_overnight?: boolean
              p_root_id: string
              p_start_time: string
              p_technician_ids: string[]
              p_title?: string
            }
            Returns: Json
          }
      deactivate_conversation_participant: {
        Args: { _participant_id: string }
        Returns: undefined
      }
      dry_run_duplicate_schedule_blocks: {
        Args: never
        Returns: {
          count: number
          duplicate_ids: string[]
          duplicate_key: string
          end_at: string
          job_id: string
          keep_id: string
          project_id: string
          source: string
          start_at: string
          technician_id: string
        }[]
      }
      event_technician_company_access: {
        Args: { _auth_user_id: string; _event_id: string }
        Returns: boolean
      }
      find_work_visit_conflicts: {
        Args: {
          p_end: string
          p_exclude_event_id?: string
          p_start: string
          p_technician_ids: string[]
        }
        Returns: {
          conflict_end: string
          conflict_start: string
          event_id: string
          event_title: string
          technician_id: string
          technician_name: string
        }[]
      }
      get_active_offer_for_source: {
        Args: { _source_id: string; _source_kind: string }
        Returns: string
      }
      get_attachment_by_token: {
        Args: { _attachment_id: string; _token: string }
        Returns: {
          category: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          description: string | null
          display_name: string | null
          field_key: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string | null
          mime_type: string | null
          original_filename: string | null
          renamed_at: string | null
          renamed_by: string | null
          submission_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "order_form_submission_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_field_requests_by_token: {
        Args: { _token: string }
        Returns: {
          answer_value: Json | null
          answered_at: string | null
          created_at: string
          field_key: string | null
          field_label: string
          field_type: string
          id: string
          is_free_text: boolean
          options: Json | null
          request_batch_id: string
          requested_at: string
          requested_by: string | null
          requested_by_name: string | null
          status: string
          submission_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "order_form_field_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_linked_event_for_tracking_token: {
        Args: { _token: string }
        Returns: {
          address: string
          end_time: string
          id: string
          start_time: string
          status: string
          title: string
        }[]
      }
      get_message_reads_by_token: {
        Args: { _tracking_token: string }
        Returns: {
          internal_first_read_at: string
          internal_read_count: number
          message_id: string
        }[]
      }
      get_order_company_id: {
        Args: { _submission_id: string }
        Returns: string
      }
      get_order_submission_by_inbound_token: {
        Args: { _token: string }
        Returns: {
          awaiting_customer_reply: boolean
          company_id: string
          id: string
          open_request_message_id: string
          status: string
          submission_no: string
        }[]
      }
      get_order_submission_by_no: {
        Args: { _submission_no: string }
        Returns: {
          awaiting_customer_reply: boolean
          company_id: string
          id: string
          inbound_token: string
          open_request_message_id: string
          status: string
          submission_no: string
        }[]
      }
      get_other_submissions_by_token: {
        Args: { _token: string }
        Returns: {
          adresse: string
          external_status: string
          id: string
          last_activity_at: string
          oppdragssted: string
          oppdragstittel: string
          postnummer: string
          poststed: string
          public_tracking_token: string
          status: string
          submission_no: string
          submitted_at: string
          template_name: string
        }[]
      }
      get_project_member_type: {
        Args: { _auth_user_id: string; _project_id: string }
        Returns: string
      }
      get_project_role: {
        Args: { _auth_user_id: string; _project_id: string }
        Returns: string
      }
      get_shared_material_list: { Args: { p_token: string }; Returns: Json }
      get_submission_activity_by_token: {
        Args: { _token: string }
        Returns: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json | null
          submission_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "order_form_activity_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_submission_attachments_by_token: {
        Args: { _token: string }
        Returns: {
          category: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          description: string | null
          display_name: string | null
          field_key: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string | null
          mime_type: string | null
          original_filename: string | null
          renamed_at: string | null
          renamed_by: string | null
          submission_id: string
          uploaded_at: string
          uploaded_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "order_form_submission_attachments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_submission_by_tracking_token: {
        Args: { _token: string }
        Returns: {
          assigned_to: string | null
          auto_notify_on_status_change: boolean | null
          awaiting_customer_reply: boolean
          channel: string | null
          closed_at: string | null
          closed_by: string | null
          commercial_case_id: string | null
          company_id: string
          confirmation_sent_at: string | null
          converted_to_id: string | null
          converted_to_type: string | null
          created_at: string
          customer_last_reply_at: string | null
          customer_last_viewed_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          external_status: string | null
          external_status_updated_at: string | null
          id: string
          inbound_token: string
          last_activity_at: string | null
          last_admin_message_at: string | null
          last_customer_message_at: string | null
          linked_case_id: string | null
          linked_customer_id: string | null
          linked_event_id: string | null
          linked_project_id: string | null
          notification_error: string | null
          notification_recipient_email: string | null
          notification_recipient_name: string | null
          notification_recipient_phone: string | null
          notification_recipient_source: string | null
          notification_sent_at: string | null
          open_request_message_id: string | null
          priority: string
          public_tracking_token: string | null
          quality_issues: Json | null
          quality_score: string | null
          requester_type: string
          source: string
          source_lead_id: string | null
          status: string
          submission_no: string
          submitted_at: string
          submitted_by: string | null
          submitter_email: string | null
          submitter_name: string | null
          submitter_user_id: string | null
          summary: Json | null
          template_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "order_form_submissions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_submission_comments_by_token: {
        Args: { _token: string }
        Returns: {
          author_name: string | null
          body: string
          comment_type: string
          created_at: string
          created_by: string | null
          id: string
          is_customer_reply: boolean | null
          submission_id: string
          visibility: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "order_form_comments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_submission_messages_by_token: {
        Args: { _token: string }
        Returns: {
          addressed_to_participant_id: string | null
          body: string
          client_request_id: string | null
          created_at: string
          email_notification_sent: boolean
          email_notification_sent_at: string | null
          id: string
          is_visible_to_customer: boolean
          message_type: string
          replied_at: string | null
          requires_reply: boolean
          review_status: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          sender_name: string | null
          sender_participant_id: string | null
          sender_type: string
          sender_user_id: string | null
          source: string
          submission_id: string
          visibility: string
        }[]
        SetofOptions: {
          from: "*"
          to: "order_form_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_submission_values_by_token: {
        Args: { _token: string }
        Returns: {
          created_at: string
          field_key: string
          id: string
          submission_id: string
          value: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "order_form_submission_values"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_account_id: { Args: { _auth_user_id: string }; Returns: string }
      get_user_scope: { Args: { _user_id: string }; Returns: string }
      get_user_scope_v2: { Args: { _auth_user_id: string }; Returns: string }
      has_cross_company_order_access: {
        Args: { _auth_user_id: string; _submission_id: string }
        Returns: boolean
      }
      has_docs_space_access: {
        Args: { _auth_user_id: string; _project_id: string }
        Returns: boolean
      }
      has_folder_access: {
        Args: { _auth_user_id: string; _folder_id: string }
        Returns: boolean
      }
      has_hms_attachment_access: {
        Args: { _auth_user_id: string; _name: string }
        Returns: boolean
      }
      has_hms_incident_access: {
        Args: { _auth_user_id: string; _incident_id: string }
        Returns: boolean
      }
      has_hms_manage: {
        Args: { _auth_user_id: string; _company_id: string }
        Returns: boolean
      }
      has_hms_view: {
        Args: { _auth_user_id: string; _company_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_samtaler_access: {
        Args: { _auth_user_id: string; _project_id: string }
        Returns: boolean
      }
      has_space_access: {
        Args: { _auth_user_id: string; _space_id: string }
        Returns: boolean
      }
      has_thread_access: {
        Args: { _auth_user_id: string; _thread_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_company_member: {
        Args: { _auth_user_id: string; _company_id: string }
        Returns: boolean
      }
      is_explicit_space_member: {
        Args: { _auth_user_id: string; _space_id: string }
        Returns: boolean
      }
      is_internal_nonfollow_member: {
        Args: { _auth_user_id: string; _project_id: string }
        Returns: boolean
      }
      is_order_participant: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_admin: {
        Args: { _auth_user_id: string; _project_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _auth_user_id: string; _project_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _auth_user_id: string }; Returns: boolean }
      mark_messages_read_by_token: {
        Args: {
          _message_ids: string[]
          _tracking_token: string
          _user_agent?: string
        }
        Returns: Json
      }
      mark_messages_read_internal: {
        Args: { _message_ids: string[]; _submission_id: string }
        Returns: Json
      }
      order_submission_allows_public_child_insert: {
        Args: { _submission_id: string }
        Returns: boolean
      }
      remove_work_visit_from_plan: {
        Args: {
          p_actor?: string
          p_event_id?: string
          p_remove_all?: boolean
          p_schedule_block_id?: string
          p_technician_id?: string
        }
        Returns: Json
      }
      rename_submission_attachment: {
        Args: {
          _attachment_id: string
          _description?: string
          _display_name: string
        }
        Returns: {
          category: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          description: string | null
          display_name: string | null
          field_key: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string | null
          mime_type: string | null
          original_filename: string | null
          renamed_at: string | null
          renamed_by: string | null
          submission_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "order_form_submission_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      repair_resource_plan_ghosts: { Args: never; Returns: Json }
      scan_resource_plan_ghosts: { Args: never; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submission_has_tracking_token: {
        Args: { _submission_id: string }
        Returns: boolean
      }
      submission_matches_token: {
        Args: { _submission_id: string; _token: string }
        Returns: boolean
      }
      suggest_hms_areas: {
        Args: {
          _building_age_years?: number
          _building_type?: string
          _chemicals?: boolean
          _ee_waste?: boolean
          _near_electrical?: boolean
          _off_hours?: boolean
          _project_kind?: string
          _work_types?: string[]
        }
        Returns: {
          area_key: string
          label: string
          reasons: string[]
          score: number
        }[]
      }
      sweep_orphan_schedule_blocks: { Args: never; Returns: Json }
      update_commercial_case_crm: {
        Args: {
          _case_id: string
          _description?: string
          _expected_close_date?: string
          _next_step?: string
          _next_step_due_at?: string
          _owner_user_id?: string
          _phase?: string
          _probability_pct?: number
          _value_estimate?: number
        }
        Returns: {
          case_number: string | null
          company_id: string
          contact_person_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          expected_close_date: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          next_step: string | null
          next_step_due_at: string | null
          owner_user_id: string | null
          phase: string
          probability_pct: number | null
          source: string | null
          source_ref: string | null
          tags: string[] | null
          title: string
          updated_at: string
          value_estimate: number | null
          won_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "commercial_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_internal_conversation_participant: {
        Args: {
          _display_name?: string
          _email?: string
          _phone?: string
          _role_label?: string
          _submission_id: string
          _technician_id?: string
          _user_id?: string
          _visibility?: string
        }
        Returns: string
      }
      user_has_company_access: {
        Args: { _auth_user_id: string; _company_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "montør" | "super_admin" | "customer_user"
      calculation_item_type: "material" | "labor"
      calculation_status:
        | "draft"
        | "generated"
        | "sent"
        | "in_dialogue"
        | "accepted"
        | "rejected"
        | "converted"
      case_next_action:
        | "call"
        | "quote"
        | "clarify"
        | "order"
        | "schedule"
        | "document"
        | "none"
      case_priority: "low" | "normal" | "high" | "critical"
      case_resolution_type:
        | "converted_to_offer"
        | "converted_to_project"
        | "converted_to_service"
        | "converted_to_lead"
        | "resolved_email_only"
        | "rejected"
        | "spam"
        | "duplicate"
      case_scope: "company" | "department" | "project" | "private"
      case_status:
        | "new"
        | "triage"
        | "assigned"
        | "waiting_customer"
        | "waiting_internal"
        | "converted"
        | "closed"
        | "archived"
        | "in_progress"
      conversation_post_type: "internal_message" | "email" | "system"
      event_status: "pending" | "accepted" | "declined" | "change_request"
      fag_priority: "normal" | "viktig"
      fag_regime: "nek" | "fel" | "fse" | "fsl" | "annet"
      fag_status: "new" | "analyzing" | "answered" | "needs_followup" | "error"
      job_status:
        | "requested"
        | "approved"
        | "time_change_proposed"
        | "rejected"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "ready_for_invoicing"
        | "invoiced"
        | "archived"
        | "cancelled"
      lead_next_action_type:
        | "call"
        | "email"
        | "meeting"
        | "site_visit"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "befaring"
        | "qualified"
        | "tilbud_sendt"
        | "forhandling"
        | "lost"
        | "won"
      offer_activity_actor_type: "system" | "user" | "customer"
      offer_activity_event_type:
        | "offer_created"
        | "offer_sent_email"
        | "offer_sent_link"
        | "offer_viewed"
        | "offer_pdf_downloaded"
        | "offer_email_opened"
        | "offer_link_clicked"
        | "offer_accepted"
        | "offer_rejected"
        | "offer_expired"
      offer_followup_priority: "low" | "medium" | "high" | "urgent"
      offer_followup_status: "open" | "snoozed" | "completed" | "cancelled"
      offer_followup_type:
        | "offer_follow_up"
        | "offer_hot_lead_follow_up"
        | "offer_expiry_warning"
        | "offer_next_step_missing"
        | "offer_active_customer_follow_up"
      offer_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "signed"
        | "archived"
      purchase_order_status:
        | "draft"
        | "confirmed"
        | "sent"
        | "partially_received"
        | "received"
        | "cancelled"
      regulation_scope_type: "global" | "lead" | "quote" | "job"
      regulation_topic: "NEK" | "FEL" | "FSE" | "FSL" | "Annet"
      supplier_integration_type: "ftp" | "ftps" | "sftp" | "manual" | "api"
      work_package_type:
        | "deviation"
        | "additional_work"
        | "change"
        | "internal_task"
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
      app_role: ["admin", "montør", "super_admin", "customer_user"],
      calculation_item_type: ["material", "labor"],
      calculation_status: [
        "draft",
        "generated",
        "sent",
        "in_dialogue",
        "accepted",
        "rejected",
        "converted",
      ],
      case_next_action: [
        "call",
        "quote",
        "clarify",
        "order",
        "schedule",
        "document",
        "none",
      ],
      case_priority: ["low", "normal", "high", "critical"],
      case_resolution_type: [
        "converted_to_offer",
        "converted_to_project",
        "converted_to_service",
        "converted_to_lead",
        "resolved_email_only",
        "rejected",
        "spam",
        "duplicate",
      ],
      case_scope: ["company", "department", "project", "private"],
      case_status: [
        "new",
        "triage",
        "assigned",
        "waiting_customer",
        "waiting_internal",
        "converted",
        "closed",
        "archived",
        "in_progress",
      ],
      conversation_post_type: ["internal_message", "email", "system"],
      event_status: ["pending", "accepted", "declined", "change_request"],
      fag_priority: ["normal", "viktig"],
      fag_regime: ["nek", "fel", "fse", "fsl", "annet"],
      fag_status: ["new", "analyzing", "answered", "needs_followup", "error"],
      job_status: [
        "requested",
        "approved",
        "time_change_proposed",
        "rejected",
        "scheduled",
        "in_progress",
        "completed",
        "ready_for_invoicing",
        "invoiced",
        "archived",
        "cancelled",
      ],
      lead_next_action_type: [
        "call",
        "email",
        "meeting",
        "site_visit",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "befaring",
        "qualified",
        "tilbud_sendt",
        "forhandling",
        "lost",
        "won",
      ],
      offer_activity_actor_type: ["system", "user", "customer"],
      offer_activity_event_type: [
        "offer_created",
        "offer_sent_email",
        "offer_sent_link",
        "offer_viewed",
        "offer_pdf_downloaded",
        "offer_email_opened",
        "offer_link_clicked",
        "offer_accepted",
        "offer_rejected",
        "offer_expired",
      ],
      offer_followup_priority: ["low", "medium", "high", "urgent"],
      offer_followup_status: ["open", "snoozed", "completed", "cancelled"],
      offer_followup_type: [
        "offer_follow_up",
        "offer_hot_lead_follow_up",
        "offer_expiry_warning",
        "offer_next_step_missing",
        "offer_active_customer_follow_up",
      ],
      offer_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "signed",
        "archived",
      ],
      purchase_order_status: [
        "draft",
        "confirmed",
        "sent",
        "partially_received",
        "received",
        "cancelled",
      ],
      regulation_scope_type: ["global", "lead", "quote", "job"],
      regulation_topic: ["NEK", "FEL", "FSE", "FSL", "Annet"],
      supplier_integration_type: ["ftp", "ftps", "sftp", "manual", "api"],
      work_package_type: [
        "deviation",
        "additional_work",
        "change",
        "internal_task",
      ],
    },
  },
} as const
