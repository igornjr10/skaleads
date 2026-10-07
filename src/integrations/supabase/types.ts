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
      _arquivo_monthly_budget: {
        Row: {
          arquivado_em: string | null
          client_id: string | null
          monthly_budget: number | null
          name: string | null
        }
        Insert: {
          arquivado_em?: string | null
          client_id?: string | null
          monthly_budget?: number | null
          name?: string | null
        }
        Update: {
          arquivado_em?: string | null
          client_id?: string | null
          monthly_budget?: number | null
          name?: string | null
        }
        Relationships: []
      }
      ad_breakdowns: {
        Row: {
          clicks: number
          client_id: string
          conversions: number
          date_start: string
          date_stop: string
          dimension: string
          dimension_value: string
          id: string
          impressions: number
          reach: number
          spend: number
        }
        Insert: {
          clicks?: number
          client_id: string
          conversions?: number
          date_start: string
          date_stop: string
          dimension: string
          dimension_value: string
          id?: string
          impressions?: number
          reach?: number
          spend?: number
        }
        Update: {
          clicks?: number
          client_id?: string
          conversions?: number
          date_start?: string
          date_stop?: string
          dimension?: string
          dimension_value?: string
          id?: string
          impressions?: number
          reach?: number
          spend?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_breakdowns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_daily_metrics: {
        Row: {
          ad_id: string
          clicks: number
          conversions: number
          date: string
          frequency: number
          id: string
          impressions: number
          reach: number
          spend: number
          video_3s_views: number
          video_p25_views: number
          video_p75_views: number
          video_thruplay: number
        }
        Insert: {
          ad_id: string
          clicks?: number
          conversions?: number
          date: string
          frequency?: number
          id?: string
          impressions?: number
          reach?: number
          spend?: number
          video_3s_views?: number
          video_p25_views?: number
          video_p75_views?: number
          video_thruplay?: number
        }
        Update: {
          ad_id?: string
          clicks?: number
          conversions?: number
          date?: string
          frequency?: number
          id?: string
          impressions?: number
          reach?: number
          spend?: number
          video_3s_views?: number
          video_p25_views?: number
          video_p75_views?: number
          video_thruplay?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_daily_metrics_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sets: {
        Row: {
          campaign_id: string
          clicks: number
          created_at: string
          id: string
          impressions: number
          messages: number
          meta_adset_id: string | null
          name: string
          spend: number
          status: string
        }
        Insert: {
          campaign_id: string
          clicks?: number
          created_at?: string
          id?: string
          impressions?: number
          messages?: number
          meta_adset_id?: string | null
          name: string
          spend?: number
          status?: string
        }
        Update: {
          campaign_id?: string
          clicks?: number
          created_at?: string
          id?: string
          impressions?: number
          messages?: number
          meta_adset_id?: string | null
          name?: string
          spend?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          ad_set_id: string
          body: string | null
          clicks: number
          conversions: number
          created_at: string
          creative_synced_at: string | null
          creative_type: string
          frequency: number
          id: string
          image_url: string | null
          impressions: number
          messages: number
          meta_ad_id: string | null
          name: string
          spend: number
          status: string
          thumbnail_url: string | null
          title: string | null
          video_id: string | null
        }
        Insert: {
          ad_set_id: string
          body?: string | null
          clicks?: number
          conversions?: number
          created_at?: string
          creative_synced_at?: string | null
          creative_type?: string
          frequency?: number
          id?: string
          image_url?: string | null
          impressions?: number
          messages?: number
          meta_ad_id?: string | null
          name: string
          spend?: number
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          video_id?: string | null
        }
        Update: {
          ad_set_id?: string
          body?: string | null
          clicks?: number
          conversions?: number
          created_at?: string
          creative_synced_at?: string | null
          creative_type?: string
          frequency?: number
          id?: string
          image_url?: string | null
          impressions?: number
          messages?: number
          meta_ad_id?: string | null
          name?: string
          spend?: number
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cache: {
        Row: {
          action: string
          created_at: string
          expires_at: string
          id: string
          prompt_hash: string
          response: Json
        }
        Insert: {
          action: string
          created_at?: string
          expires_at?: string
          id?: string
          prompt_hash: string
          response: Json
        }
        Update: {
          action?: string
          created_at?: string
          expires_at?: string
          id?: string
          prompt_hash?: string
          response?: Json
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          action: string
          cached: boolean
          client_id: string | null
          created_at: string
          estimated_cost_usd: number
          id: string
          input_tokens: number
          output_tokens: number
        }
        Insert: {
          action: string
          cached?: boolean
          client_id?: string | null
          created_at?: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          output_tokens?: number
        }
        Update: {
          action?: string
          cached?: boolean
          client_id?: string | null
          created_at?: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_events: {
        Row: {
          alert_id: string
          campaign_id: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          id: string
          metric_value: number | null
          resolved_at: string | null
          rule_snapshot: Json | null
          status: string
          triggered_at: string
        }
        Insert: {
          alert_id: string
          campaign_id?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          metric_value?: number | null
          resolved_at?: string | null
          rule_snapshot?: Json | null
          status?: string
          triggered_at?: string
        }
        Update: {
          alert_id?: string
          campaign_id?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          metric_value?: number | null
          resolved_at?: string | null
          rule_snapshot?: Json | null
          status?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          channels: Json
          client_id: string | null
          company_id: string | null
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          metric: string | null
          name: string
          operator: string | null
          rule_json: Json
          tenant_id: string | null
          threshold: number | null
          updated_at: string | null
        }
        Insert: {
          channels?: Json
          client_id?: string | null
          company_id?: string | null
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          metric?: string | null
          name: string
          operator?: string | null
          rule_json?: Json
          tenant_id?: string | null
          threshold?: number | null
          updated_at?: string | null
        }
        Update: {
          channels?: Json
          client_id?: string | null
          company_id?: string | null
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          metric?: string | null
          name?: string
          operator?: string | null
          rule_json?: Json
          tenant_id?: string | null
          threshold?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_runs: {
        Row: {
          category_scores: Json
          client_id: string
          created_at: string
          id: string
          results: Json
          score: number
        }
        Insert: {
          category_scores?: Json
          client_id: string
          created_at?: string
          id?: string
          results?: Json
          score?: number
        }
        Update: {
          category_scores?: Json
          client_id?: string
          created_at?: string
          id?: string
          results?: Json
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      autentique_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          company_id: string
          token: string
          webhook_secret: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          company_id: string
          token: string
          webhook_secret?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          company_id?: string
          token?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autentique_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string
          id: string
          job_name: string
          started_at: string
          success: boolean
          summary: Json
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at: string
          id?: string
          job_name: string
          started_at: string
          success: boolean
          summary?: Json
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string
          id?: string
          job_name?: string
          started_at?: string
          success?: boolean
          summary?: Json
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          modo_teste: boolean
          payment_link: string | null
          pix_key: string | null
          regua: number[]
          team_id: string
          template_antes: string
          template_atraso: string
          template_vencimento: string
          teste_numero: string | null
          updated_at: string
        }
        Insert: {
          modo_teste?: boolean
          payment_link?: string | null
          pix_key?: string | null
          regua?: number[]
          team_id: string
          template_antes?: string
          template_atraso?: string
          template_vencimento?: string
          teste_numero?: string | null
          updated_at?: string
        }
        Update: {
          modo_teste?: boolean
          payment_link?: string | null
          pix_key?: string | null
          regua?: number[]
          team_id?: string
          template_antes?: string
          template_atraso?: string
          template_vencimento?: string
          teste_numero?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      campaign_daily_metrics: {
        Row: {
          calls: number
          clicks: number
          client_id: string
          date: string
          directions: number
          id: string
          impressions: number
          leads: number
          messages: number
          profile_visits: number
          spend: number
        }
        Insert: {
          calls?: number
          clicks?: number
          client_id: string
          date: string
          directions?: number
          id?: string
          impressions?: number
          leads?: number
          messages?: number
          profile_visits?: number
          spend?: number
        }
        Update: {
          calls?: number
          clicks?: number
          client_id?: string
          date?: string
          directions?: number
          id?: string
          impressions?: number
          leads?: number
          messages?: number
          profile_visits?: number
          spend?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          clicks: number
          client_id: string
          conversions: number
          cpc: number
          cpm: number
          created_at: string
          ctr: number
          id: string
          impressions: number
          messages: number
          meta_campaign_id: string | null
          name: string
          objective: string | null
          spend: number
          status: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          client_id: string
          conversions?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          messages?: number
          meta_campaign_id?: string | null
          name: string
          objective?: string | null
          spend?: number
          status?: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          client_id?: string
          conversions?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          messages?: number
          meta_campaign_id?: string | null
          name?: string
          objective?: string | null
          spend?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cerebro_notas: {
        Row: {
          atualizado: string
          caminho: string
          company_id: string | null
          corpo: string
          criado: string
          exemplo: boolean
          id: string
          links: string[]
          nome: string
          resumo: string
          sincronizado_em: string
          tipo: string
          titulo: string
        }
        Insert: {
          atualizado?: string
          caminho: string
          company_id?: string | null
          corpo?: string
          criado?: string
          exemplo?: boolean
          id: string
          links?: string[]
          nome: string
          resumo?: string
          sincronizado_em?: string
          tipo?: string
          titulo: string
        }
        Update: {
          atualizado?: string
          caminho?: string
          company_id?: string | null
          corpo?: string
          criado?: string
          exemplo?: boolean
          id?: string
          links?: string[]
          nome?: string
          resumo?: string
          sincronizado_em?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cerebro_notas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_acesso_revelacoes: {
        Row: {
          acesso_id: string
          client_id: string
          id: string
          plataforma: string
          revelado_em: string
          user_id: string | null
        }
        Insert: {
          acesso_id: string
          client_id: string
          id?: string
          plataforma: string
          revelado_em?: string
          user_id?: string | null
        }
        Update: {
          acesso_id?: string
          client_id?: string
          id?: string
          plataforma?: string
          revelado_em?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_acesso_revelacoes_acesso_id_fkey"
            columns: ["acesso_id"]
            isOneToOne: false
            referencedRelation: "client_acessos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_acesso_revelacoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_acessos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          client_id: string
          criado_em: string
          id: string
          login: string | null
          observacao: string | null
          plataforma: string
          senha_cifrada: string | null
          tem_senha: boolean | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          client_id: string
          criado_em?: string
          id?: string
          login?: string | null
          observacao?: string | null
          plataforma: string
          senha_cifrada?: string | null
          tem_senha?: boolean | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          client_id?: string
          criado_em?: string
          id?: string
          login?: string | null
          observacao?: string | null
          plataforma?: string
          senha_cifrada?: string | null
          tem_senha?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_acessos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments: {
        Row: {
          client_id: string
          company_id: string | null
          created_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          company_id?: string | null
          created_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          company_id?: string | null
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_billing: {
        Row: {
          billing_day: number
          client_id: string
          destino: string
          enabled: boolean
          monthly_fee: number
          observacao: string | null
          updated_at: string
        }
        Insert: {
          billing_day?: number
          client_id: string
          destino?: string
          enabled?: boolean
          monthly_fee: number
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          billing_day?: number
          client_id?: string
          destino?: string
          enabled?: boolean
          monthly_fee?: number
          observacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_billing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_compromissos: {
        Row: {
          ciclo: string
          client_id: string
          competencia: string
          created_at: string
          data_feito: string | null
          feito: boolean
          id: string
          observacao: string | null
          registrado_em: string | null
          registrado_por: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ciclo: string
          client_id: string
          competencia: string
          created_at?: string
          data_feito?: string | null
          feito?: boolean
          id?: string
          observacao?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ciclo?: string
          client_id?: string
          competencia?: string
          created_at?: string
          data_feito?: string | null
          feito?: boolean
          id?: string
          observacao?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_compromissos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_fase_responsaveis: {
        Row: {
          client_id: string
          fase: string
          responsavel_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          fase: string
          responsavel_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          fase?: string
          responsavel_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_fase_responsaveis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_funding_events: {
        Row: {
          amount_cents: number
          client_id: string
          created_at: string
          currency: string | null
          event_time: string
          event_type: string
          extra_data: Json | null
          id: string
          network_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount_cents: number
          client_id: string
          created_at?: string
          currency?: string | null
          event_time: string
          event_type: string
          extra_data?: Json | null
          id?: string
          network_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount_cents?: number
          client_id?: string
          created_at?: string
          currency?: string | null
          event_time?: string
          event_type?: string
          extra_data?: Json | null
          id?: string
          network_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_funding_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_instagram_daily: {
        Row: {
          captured_at: string
          client_id: string
          date: string
          followers_gained: number | null
          followers_total: number | null
          id: string
          profile_views: number | null
        }
        Insert: {
          captured_at?: string
          client_id: string
          date: string
          followers_gained?: number | null
          followers_total?: number | null
          id?: string
          profile_views?: number | null
        }
        Update: {
          captured_at?: string
          client_id?: string
          date?: string
          followers_gained?: number | null
          followers_total?: number | null
          id?: string
          profile_views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_instagram_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_secrets: {
        Row: {
          client_id: string
          meta_access_token: string | null
          meta_page_access_token: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          meta_access_token?: string | null
          meta_page_access_token?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          meta_access_token?: string | null
          meta_page_access_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_secrets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          client_id: string
          created_at: string
          descricao: string | null
          done: boolean
          done_at: string | null
          done_by: string | null
          fase: string
          id: string
          posicao: number
          titulo: string
        }
        Insert: {
          client_id: string
          created_at?: string
          descricao?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          fase?: string
          id?: string
          posicao?: number
          titulo: string
        }
        Update: {
          client_id?: string
          created_at?: string
          descricao?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          fase?: string
          id?: string
          posicao?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          alvo_custo_resultado: number | null
          alvo_resultados_mes: number | null
          business_segment: string | null
          city: string | null
          cnpj: string | null
          company_id: string | null
          connect_connected_at: string | null
          connect_customer_uuid: string | null
          cpf: string | null
          created_at: string
          dashboard_share_token: string
          email: string | null
          id: string
          logo_url: string | null
          manager_id: string | null
          meta_access_token: string | null
          meta_ad_account_id: string | null
          meta_auto_sync_enabled: boolean
          meta_auto_sync_frequency_hours: number
          meta_balance_at: string | null
          meta_balance_cents: number | null
          meta_balance_label: string | null
          meta_connected_at: string | null
          meta_funding_type: number | null
          meta_instagram_account_id: string | null
          meta_instagram_username: string | null
          meta_last_sync_at: string | null
          meta_last_sync_error: string | null
          meta_last_verified_at: string | null
          meta_page_access_token: string | null
          meta_page_id: string | null
          meta_page_name: string | null
          meta_sync_runs: number
          meta_sync_status: string
          meta_token_configured: boolean
          metodo_pagamento: string | null
          name: string
          primary_goal: string | null
          report_template: Json | null
          responsavel_nome: string | null
          service_radius_km: number | null
          site: string | null
          state: string | null
          status: string
          updated_at: string
          whatsapp_comercial: string | null
          whatsapp_group_jid: string | null
          whatsapp_number: string | null
          whatsapp_pessoal: string | null
        }
        Insert: {
          address?: string | null
          alvo_custo_resultado?: number | null
          alvo_resultados_mes?: number | null
          business_segment?: string | null
          city?: string | null
          cnpj?: string | null
          company_id?: string | null
          connect_connected_at?: string | null
          connect_customer_uuid?: string | null
          cpf?: string | null
          created_at?: string
          dashboard_share_token?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          manager_id?: string | null
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_auto_sync_enabled?: boolean
          meta_auto_sync_frequency_hours?: number
          meta_balance_at?: string | null
          meta_balance_cents?: number | null
          meta_balance_label?: string | null
          meta_connected_at?: string | null
          meta_funding_type?: number | null
          meta_instagram_account_id?: string | null
          meta_instagram_username?: string | null
          meta_last_sync_at?: string | null
          meta_last_sync_error?: string | null
          meta_last_verified_at?: string | null
          meta_page_access_token?: string | null
          meta_page_id?: string | null
          meta_page_name?: string | null
          meta_sync_runs?: number
          meta_sync_status?: string
          meta_token_configured?: boolean
          metodo_pagamento?: string | null
          name: string
          primary_goal?: string | null
          report_template?: Json | null
          responsavel_nome?: string | null
          service_radius_km?: number | null
          site?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          whatsapp_comercial?: string | null
          whatsapp_group_jid?: string | null
          whatsapp_number?: string | null
          whatsapp_pessoal?: string | null
        }
        Update: {
          address?: string | null
          alvo_custo_resultado?: number | null
          alvo_resultados_mes?: number | null
          business_segment?: string | null
          city?: string | null
          cnpj?: string | null
          company_id?: string | null
          connect_connected_at?: string | null
          connect_customer_uuid?: string | null
          cpf?: string | null
          created_at?: string
          dashboard_share_token?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          manager_id?: string | null
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_auto_sync_enabled?: boolean
          meta_auto_sync_frequency_hours?: number
          meta_balance_at?: string | null
          meta_balance_cents?: number | null
          meta_balance_label?: string | null
          meta_connected_at?: string | null
          meta_funding_type?: number | null
          meta_instagram_account_id?: string | null
          meta_instagram_username?: string | null
          meta_last_sync_at?: string | null
          meta_last_sync_error?: string | null
          meta_last_verified_at?: string | null
          meta_page_access_token?: string | null
          meta_page_id?: string | null
          meta_page_name?: string | null
          meta_sync_runs?: number
          meta_sync_status?: string
          meta_token_configured?: boolean
          metodo_pagamento?: string | null
          name?: string
          primary_goal?: string | null
          report_template?: Json | null
          responsavel_nome?: string | null
          service_radius_km?: number | null
          site?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          whatsapp_comercial?: string | null
          whatsapp_group_jid?: string | null
          whatsapp_number?: string | null
          whatsapp_pessoal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cor_primaria: string | null
          created_at: string
          dominio: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          nome_exibicao: string | null
        }
        Insert: {
          cor_primaria?: string | null
          created_at?: string
          dominio?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          nome_exibicao?: string | null
        }
        Update: {
          cor_primaria?: string | null
          created_at?: string
          dominio?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          nome_exibicao?: string | null
        }
        Relationships: []
      }
      connect_customer_tokens: {
        Row: {
          api_token: string
          client_id: string
          created_at: string
          customer_uuid: string
          updated_at: string
        }
        Insert: {
          api_token: string
          client_id: string
          created_at?: string
          customer_uuid: string
          updated_at?: string
        }
        Update: {
          api_token?: string
          client_id?: string
          created_at?: string
          customer_uuid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_customer_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          arquivo_assinado: string | null
          arquivo_original: string | null
          assinado_em: string | null
          autentique_id: string
          client_id: string | null
          company_id: string | null
          criado_em: string | null
          id: string
          nome: string
          signatarios: Json
          sincronizado_em: string
          status: string
          vinculo_manual: boolean
        }
        Insert: {
          arquivo_assinado?: string | null
          arquivo_original?: string | null
          assinado_em?: string | null
          autentique_id: string
          client_id?: string | null
          company_id?: string | null
          criado_em?: string | null
          id?: string
          nome: string
          signatarios?: Json
          sincronizado_em?: string
          status?: string
          vinculo_manual?: boolean
        }
        Update: {
          arquivo_assinado?: string | null
          arquivo_original?: string | null
          assinado_em?: string | null
          autentique_id?: string
          client_id?: string | null
          company_id?: string | null
          criado_em?: string | null
          id?: string
          nome?: string
          signatarios?: Json
          sincronizado_em?: string
          status?: string
          vinculo_manual?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contratos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_generations: {
        Row: {
          briefing: string | null
          client_id: string
          created_at: string
          id: string
          objetivo: string | null
          produto: string | null
          result: Json
          tom: string | null
        }
        Insert: {
          briefing?: string | null
          client_id: string
          created_at?: string
          id?: string
          objetivo?: string | null
          produto?: string | null
          result: Json
          tom?: string | null
        }
        Update: {
          briefing?: string | null
          client_id?: string
          created_at?: string
          id?: string
          objetivo?: string | null
          produto?: string | null
          result?: Json
          tom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_generations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_task_comments: {
        Row: {
          autor_id: string | null
          created_at: string
          id: string
          task_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          id?: string
          task_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          id?: string
          task_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "creative_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_tasks: {
        Row: {
          arquivo_url: string | null
          assigned_to: string | null
          briefing: string | null
          client_id: string
          created_at: string
          created_by: string | null
          formato: string | null
          id: string
          prazo: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          arquivo_url?: string | null
          assigned_to?: string | null
          briefing?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          formato?: string | null
          id?: string
          prazo?: string | null
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          arquivo_url?: string | null
          assigned_to?: string | null
          briefing?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          formato?: string | null
          id?: string
          prazo?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_atividades: {
        Row: {
          autor_id: string | null
          canal: string | null
          created_at: string
          descricao: string | null
          id: string
          lead_id: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          canal?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id: string
          tipo: string
        }
        Update: {
          autor_id?: string | null
          canal?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_atividades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_etapas: {
        Row: {
          created_at: string
          funil_id: string
          id: string
          nome: string
          posicao: number
          tipo: string
        }
        Insert: {
          created_at?: string
          funil_id: string
          id?: string
          nome: string
          posicao?: number
          tipo?: string
        }
        Update: {
          created_at?: string
          funil_id?: string
          id?: string
          nome?: string
          posicao?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_etapas_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "crm_funis"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_funis: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_funis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_funis_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          canal: string
          cargo: string | null
          cidade: string | null
          client_id: string | null
          closer_id: string | null
          company_id: string | null
          contato_nome: string
          convertido_client_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          empresa: string | null
          etapa_id: string
          funil_id: string
          ganho_em: string | null
          id: string
          instagram: string | null
          motivo_perda: string | null
          observacoes: string | null
          origem: string | null
          perdido_em: string | null
          posicao: number
          proximo_contato_em: string | null
          responsavel_id: string | null
          reuniao_em: string | null
          segmento: string | null
          telefone: string | null
          updated_at: string
          valor_estimado: number | null
          wa_chave: string | null
          whatsapp: string | null
        }
        Insert: {
          canal?: string
          cargo?: string | null
          cidade?: string | null
          client_id?: string | null
          closer_id?: string | null
          company_id?: string | null
          contato_nome: string
          convertido_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa?: string | null
          etapa_id: string
          funil_id: string
          ganho_em?: string | null
          id?: string
          instagram?: string | null
          motivo_perda?: string | null
          observacoes?: string | null
          origem?: string | null
          perdido_em?: string | null
          posicao?: number
          proximo_contato_em?: string | null
          responsavel_id?: string | null
          reuniao_em?: string | null
          segmento?: string | null
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number | null
          wa_chave?: string | null
          whatsapp?: string | null
        }
        Update: {
          canal?: string
          cargo?: string | null
          cidade?: string | null
          client_id?: string | null
          closer_id?: string | null
          company_id?: string | null
          contato_nome?: string
          convertido_client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa?: string | null
          etapa_id?: string
          funil_id?: string
          ganho_em?: string | null
          id?: string
          instagram?: string | null
          motivo_perda?: string | null
          observacoes?: string | null
          origem?: string | null
          perdido_em?: string | null
          posicao?: number
          proximo_contato_em?: string | null
          responsavel_id?: string | null
          reuniao_em?: string | null
          segmento?: string | null
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number | null
          wa_chave?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_convertido_client_id_fkey"
            columns: ["convertido_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "crm_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "crm_funis"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_resumos: {
        Row: {
          atencao: string
          client_id: string
          cobrancas: number
          dia: string
          gerado_em: string
          group_jid: string
          horas_sem_resposta: number | null
          id: string
          mensagens: number
          participantes: number
          perguntas_abertas: Json
          sinais: Json
          ultima_da_agencia: boolean
          ultima_de: string | null
          ultima_em: string | null
          ultima_mensagem: string | null
        }
        Insert: {
          atencao?: string
          client_id: string
          cobrancas?: number
          dia: string
          gerado_em?: string
          group_jid: string
          horas_sem_resposta?: number | null
          id?: string
          mensagens?: number
          participantes?: number
          perguntas_abertas?: Json
          sinais?: Json
          ultima_da_agencia?: boolean
          ultima_de?: string | null
          ultima_em?: string | null
          ultima_mensagem?: string | null
        }
        Update: {
          atencao?: string
          client_id?: string
          cobrancas?: number
          dia?: string
          gerado_em?: string
          group_jid?: string
          horas_sem_resposta?: number | null
          id?: string
          mensagens?: number
          participantes?: number
          perguntas_abertas?: Json
          sinais?: Json
          ultima_da_agencia?: boolean
          ultima_de?: string | null
          ultima_em?: string | null
          ultima_mensagem?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupo_resumos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          canal: string
          destino: string | null
          erro: string | null
          id: string
          invoice_id: string
          offset_dias: number
          sent_at: string
          sucesso: boolean
        }
        Insert: {
          canal?: string
          destino?: string | null
          erro?: string | null
          id?: string
          invoice_id: string
          offset_dias: number
          sent_at?: string
          sucesso?: boolean
        }
        Update: {
          canal?: string
          destino?: string | null
          erro?: string | null
          id?: string
          invoice_id?: string
          offset_dias?: number
          sent_at?: string
          sucesso?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          competencia: string
          created_at: string
          due_date: string
          external_id: string | null
          gateway: string | null
          id: string
          paid_amount: number | null
          paid_at: string | null
          payment_link: string | null
          status: string
        }
        Insert: {
          amount: number
          client_id: string
          competencia: string
          created_at?: string
          due_date: string
          external_id?: string | null
          gateway?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_link?: string | null
          status?: string
        }
        Update: {
          amount?: number
          client_id?: string
          competencia?: string
          created_at?: string
          due_date?: string
          external_id?: string | null
          gateway?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_link?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      managers: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          whatsapp_number: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          whatsapp_number?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      producao_tarefas: {
        Row: {
          briefing: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          link_arquivo: string | null
          link_referencia: string | null
          posicao: number
          prazo: string | null
          prioridade: string
          responsavel_id: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          briefing?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_arquivo?: string | null
          link_referencia?: string | null
          posicao?: number
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          briefing?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_arquivo?: string | null
          link_referencia?: string | null
          posicao?: number
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producao_tarefas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      relatorios_ia: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          dados: Json
          id: string
          periodo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          dados: Json
          id?: string
          periodo?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          id?: string
          periodo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatorios_ia_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          client_id: string
          created_at: string
          cron: string
          email_recipients: Json
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string | null
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          cron: string
          email_recipients?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          template_id?: string | null
          tenant_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          cron?: string
          email_recipients?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          branding: Json
          created_at: string
          id: string
          is_default: boolean
          name: string
          sections: Json
          tenant_id: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          sections?: Json
          tenant_id: string
        }
        Update: {
          branding?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          sections?: Json
          tenant_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          client_id: string
          created_at: string
          data: Json
          file_url: string | null
          id: string
          name: string
          pdf_base64: string | null
          period: Json
          schedule_id: string | null
          sent_at: string | null
          share_expires_at: string | null
          share_token: string | null
          status: string
          template_id: string | null
          tenant_id: string
          view_count: number
        }
        Insert: {
          client_id: string
          created_at?: string
          data?: Json
          file_url?: string | null
          id?: string
          name: string
          pdf_base64?: string | null
          period?: Json
          schedule_id?: string | null
          sent_at?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          template_id?: string | null
          tenant_id: string
          view_count?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          data?: Json
          file_url?: string | null
          id?: string
          name?: string
          pdf_base64?: string | null
          period?: Json
          schedule_id?: string | null
          sent_at?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rotina_equipes: {
        Row: {
          company_id: string
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "rotina_equipes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rotina_execucoes: {
        Row: {
          avisado_at: string | null
          created_at: string
          data_ref: string
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          lembrete_wa_at: string | null
          mover_para: string | null
          observacao: string | null
          rotina_id: string
          status: string
        }
        Insert: {
          avisado_at?: string | null
          created_at?: string
          data_ref: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          lembrete_wa_at?: string | null
          mover_para?: string | null
          observacao?: string | null
          rotina_id: string
          status?: string
        }
        Update: {
          avisado_at?: string | null
          created_at?: string
          data_ref?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          lembrete_wa_at?: string | null
          mover_para?: string | null
          observacao?: string | null
          rotina_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotina_execucoes_rotina_id_fkey"
            columns: ["rotina_id"]
            isOneToOne: false
            referencedRelation: "rotinas"
            referencedColumns: ["id"]
          },
        ]
      }
      rotinas: {
        Row: {
          assigned_to: string | null
          ativa: boolean
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          data_pontual: string | null
          descricao: string | null
          dia_mes: number | null
          dias_semana: number[] | null
          equipe_id: string | null
          horario_limite: string | null
          id: string
          periodicidade: string
          prioridade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          ativa?: boolean
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          data_pontual?: string | null
          descricao?: string | null
          dia_mes?: number | null
          dias_semana?: number[] | null
          equipe_id?: string | null
          horario_limite?: string | null
          id?: string
          periodicidade?: string
          prioridade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          ativa?: boolean
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          data_pontual?: string | null
          descricao?: string | null
          dia_mes?: number | null
          dias_semana?: number[] | null
          equipe_id?: string | null
          horario_limite?: string | null
          id?: string
          periodicidade?: string
          prioridade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotinas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotinas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotinas_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "rotina_equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_anexos: {
        Row: {
          autor_id: string | null
          caminho: string | null
          created_at: string
          id: string
          nome: string
          tamanho: number | null
          task_id: string
          tipo: string | null
          url: string | null
        }
        Insert: {
          autor_id?: string | null
          caminho?: string | null
          created_at?: string
          id?: string
          nome: string
          tamanho?: number | null
          task_id: string
          tipo?: string | null
          url?: string | null
        }
        Update: {
          autor_id?: string | null
          caminho?: string | null
          created_at?: string
          id?: string
          nome?: string
          tamanho?: number | null
          task_id?: string
          tipo?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_anexos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          autor_id: string | null
          created_at: string
          id: string
          task_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          id?: string
          task_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          id?: string
          task_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          autor_id: string | null
          created_at: string
          de: string | null
          id: string
          para: string | null
          task_id: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          de?: string | null
          id?: string
          para?: string | null
          task_id: string
          tipo: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          de?: string | null
          id?: string
          para?: string | null
          task_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          categoria: string
          checklist: Json
          client_id: string | null
          company_id: string | null
          concluida_at: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          onboarding_fase: string | null
          prazo: string | null
          prioridade: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          categoria?: string
          checklist?: Json
          client_id?: string | null
          company_id?: string | null
          concluida_at?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          onboarding_fase?: string | null
          prazo?: string | null
          prioridade?: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          categoria?: string
          checklist?: Json
          client_id?: string | null
          company_id?: string | null
          concluida_at?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          onboarding_fase?: string | null
          prazo?: string | null
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_demands: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          done_at: string | null
          id: string
          member_id: string | null
          notificacao: Json | null
          notified_at: string | null
          prazo: string | null
          prioridade: string
          status: string
          team_id: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          done_at?: string | null
          id?: string
          member_id?: string | null
          notificacao?: Json | null
          notified_at?: string | null
          prazo?: string | null
          prioridade?: string
          status?: string
          team_id: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          done_at?: string | null
          id?: string
          member_id?: string | null
          notificacao?: Json | null
          notified_at?: string | null
          prazo?: string | null
          prioridade?: string
          status?: string
          team_id?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_demands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_demands_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          ativo: boolean
          created_at: string
          email: string | null
          funcao: string
          id: string
          nome: string
          team_id: string
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          funcao?: string
          id?: string
          nome: string
          team_id: string
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          funcao?: string
          id?: string
          nome?: string
          team_id?: string
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      user_companies: {
        Row: {
          company_id: string
          created_at: string
          modulos: string[] | null
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          modulos?: string[] | null
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          modulos?: string[] | null
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          role: Database["public"]["Enums"]["app_role"]
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
      wa_config: {
        Row: {
          company_id: string
          hora_fim: number
          hora_inicio: number
          intervalo_seg: number
          limite_diario: number
          updated_at: string
        }
        Insert: {
          company_id: string
          hora_fim?: number
          hora_inicio?: number
          intervalo_seg?: number
          limite_diario?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          hora_fim?: number
          hora_inicio?: number
          intervalo_seg?: number
          limite_diario?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_disparos: {
        Row: {
          company_id: string
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          status: string
          texto: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          status?: string
          texto: string
        }
        Update: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          status?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_disparos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_fila: {
        Row: {
          company_id: string
          created_at: string
          criado_por: string | null
          disparo_id: string | null
          enviado_em: string | null
          enviar_apos: string
          erro: string | null
          id: string
          inscricao_id: string | null
          lead_id: string
          origem: string
          passo: number | null
          status: string
          texto: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          disparo_id?: string | null
          enviado_em?: string | null
          enviar_apos?: string
          erro?: string | null
          id?: string
          inscricao_id?: string | null
          lead_id: string
          origem: string
          passo?: number | null
          status?: string
          texto: string
        }
        Update: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          disparo_id?: string | null
          enviado_em?: string | null
          enviar_apos?: string
          erro?: string | null
          id?: string
          inscricao_id?: string | null
          lead_id?: string
          origem?: string
          passo?: number | null
          status?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_fila_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_fila_disparo_id_fkey"
            columns: ["disparo_id"]
            isOneToOne: false
            referencedRelation: "wa_disparos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_fila_inscricao_id_fkey"
            columns: ["inscricao_id"]
            isOneToOne: false
            referencedRelation: "wa_inscricoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_fila_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_inscricoes: {
        Row: {
          company_id: string
          created_at: string
          criado_por: string | null
          id: string
          lead_id: string
          passo_atual: number
          sequencia_id: string
          status: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          lead_id: string
          passo_atual?: number
          sequencia_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          lead_id?: string
          passo_atual?: number
          sequencia_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_inscricoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_inscricoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_inscricoes_sequencia_id_fkey"
            columns: ["sequencia_id"]
            isOneToOne: false
            referencedRelation: "wa_sequencias"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_instancia: {
        Row: {
          criada_em: string
          id: boolean
          nome: string
          token: string
        }
        Insert: {
          criada_em?: string
          id?: boolean
          nome: string
          token: string
        }
        Update: {
          criada_em?: string
          id?: boolean
          nome?: string
          token?: string
        }
        Relationships: []
      }
      wa_mensagens: {
        Row: {
          autor_id: string | null
          chatid: string | null
          chave: string
          company_id: string
          created_at: string
          direcao: string
          enviada_em: string
          fila_id: string | null
          id: string
          lead_id: string | null
          lida_em: string | null
          messageid: string | null
          nome_contato: string | null
          origem: string
          remetente: string | null
          status: string | null
          telefone: string | null
          texto: string | null
          tipo: string | null
        }
        Insert: {
          autor_id?: string | null
          chatid?: string | null
          chave: string
          company_id: string
          created_at?: string
          direcao: string
          enviada_em?: string
          fila_id?: string | null
          id?: string
          lead_id?: string | null
          lida_em?: string | null
          messageid?: string | null
          nome_contato?: string | null
          origem: string
          remetente?: string | null
          status?: string | null
          telefone?: string | null
          texto?: string | null
          tipo?: string | null
        }
        Update: {
          autor_id?: string | null
          chatid?: string | null
          chave?: string
          company_id?: string
          created_at?: string
          direcao?: string
          enviada_em?: string
          fila_id?: string | null
          id?: string
          lead_id?: string | null
          lida_em?: string | null
          messageid?: string | null
          nome_contato?: string | null
          origem?: string
          remetente?: string | null
          status?: string | null
          telefone?: string | null
          texto?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_mensagens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_mensagens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_modelos: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          texto: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          texto: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_modelos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_sequencia_passos: {
        Row: {
          espera_dias: number
          id: string
          ordem: number
          sequencia_id: string
          texto: string
        }
        Insert: {
          espera_dias?: number
          id?: string
          ordem: number
          sequencia_id: string
          texto: string
        }
        Update: {
          espera_dias?: number
          id?: string
          ordem?: number
          sequencia_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_sequencia_passos_sequencia_id_fkey"
            columns: ["sequencia_id"]
            isOneToOne: false
            referencedRelation: "wa_sequencias"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_sequencias: {
        Row: {
          ativa: boolean
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          parar_se_responder: boolean
        }
        Insert: {
          ativa?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          parar_se_responder?: boolean
        }
        Update: {
          ativa?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          parar_se_responder?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "wa_sequencias_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_scheduled_messages: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          dias_semana: number[]
          id: string
          is_active: boolean
          last_sent_date: string | null
          message: string
          name: string
          send_time: string
          target_group_jids: string[]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dias_semana?: number[]
          id?: string
          is_active?: boolean
          last_sent_date?: string | null
          message: string
          name: string
          send_time?: string
          target_group_jids?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dias_semana?: number[]
          id?: string
          is_active?: boolean
          last_sent_date?: string | null
          message?: string
          name?: string
          send_time?: string
          target_group_jids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_scheduled_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _chave_acessos: { Args: never; Returns: string }
      _cliente_no_escopo: {
        Args: { p_client_id: string; p_user_id: string }
        Returns: boolean
      }
      apagar_acesso_cliente: {
        Args: { p_acesso_id: string }
        Returns: undefined
      }
      atribuido_a_mim: { Args: { _client_id: string }; Returns: boolean }
      autentique_situacao: {
        Args: never
        Returns: {
          atualizado_em: string
          empresa: string
          token_configurado: boolean
          webhook_configurado: boolean
        }[]
      }
      billing_due_reminders: {
        Args: never
        Returns: {
          client_name: string
          destino: string
          invoice_id: string
          mensagem: string
          offset_dias: number
        }[]
      }
      billing_housekeeping: {
        Args: never
        Returns: {
          geradas: number
          vencidas: number
        }[]
      }
      can_access_client: { Args: { p_client_id: string }; Returns: boolean }
      cleanup_ai_cache: { Args: never; Returns: undefined }
      clientes_das_minhas_demandas: {
        Args: never
        Returns: {
          id: string
          logo_url: string
          name: string
        }[]
      }
      clientes_instagram_pendentes: {
        Args: { _limite?: number }
        Returns: {
          id: string
          meta_instagram_account_id: string
          name: string
          token: string
        }[]
      }
      configurar_autentique: {
        Args: { _token?: string; _webhook_secret?: string }
        Returns: undefined
      }
      connect_persist_customer: {
        Args: { _api_token: string; _client_id: string; _customer_uuid: string }
        Returns: undefined
      }
      converter_lead_em_cliente: { Args: { _lead_id: string }; Returns: string }
      criar_funil_de_cliente: {
        Args: { _client_id: string; _nome?: string }
        Returns: string
      }
      default_company_id: { Args: never; Returns: string }
      definir_metas_cliente: {
        Args: {
          p_client_id: string
          p_custo_resultado: number
          p_resultados_mes: number
        }
        Returns: undefined
      }
      dispatch_cron_job: {
        Args: { _function_name: string; _timeout_ms?: number }
        Returns: number
      }
      garantir_equipes_rotina: { Args: never; Returns: undefined }
      garantir_funil_prospeccao: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      gravar_contratos: {
        Args: { _company_id: string; _linhas: Json }
        Returns: number
      }
      gravar_instagram_diario: { Args: { _linhas: Json }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_report_views: {
        Args: { p_share_token: string }
        Returns: undefined
      }
      inscrever_em_sequencia: {
        Args: { _lead_ids: string[]; _sequencia_id: string }
        Returns: number
      }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      is_comercial: { Args: { _user_id: string }; Returns: boolean }
      is_my_company: { Args: { _company_id: string }; Returns: boolean }
      is_production_member: { Args: { _user_id: string }; Returns: boolean }
      my_company_ids: { Args: never; Returns: string[] }
      my_team_id: { Args: never; Returns: string }
      notificar_rotinas_do_dia: { Args: never; Returns: number }
      pode_executar_rotina: { Args: { _rotina_id: string }; Returns: boolean }
      revelar_senha_acesso: { Args: { p_acesso_id: string }; Returns: string }
      rotina_vence_em: {
        Args: {
          _data: string
          _data_pontual: string
          _dia_mes: number
          _dias_semana: number[]
          _periodicidade: string
        }
        Returns: boolean
      }
      salvar_acesso_cliente: {
        Args: {
          p_client_id: string
          p_login?: string
          p_observacao?: string
          p_plataforma: string
          p_senha?: string
        }
        Returns: string
      }
      seed_client_tasks: { Args: { _client_id: string }; Returns: number }
      shares_company: { Args: { _other: string }; Returns: boolean }
      sincronizar_demanda_da_etapa: {
        Args: { _client_id: string; _fase: string }
        Returns: undefined
      }
      status_pelo_checklist: {
        Args: { _atual: string; _feitas: number; _total: number }
        Returns: string
      }
      user_can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      wa_chave: { Args: { t: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "analyst"
        | "viewer"
        | "editor"
        | "designer"
        | "sdr"
        | "closer"
        | "social_seller"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {
      app_role: [
        "owner",
        "admin",
        "analyst",
        "viewer",
        "editor",
        "designer",
        "sdr",
        "closer",
        "social_seller",
      ],
    },
  },
} as const
