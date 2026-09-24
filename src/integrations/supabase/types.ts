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
          clicks: number
          created_at: string
          id: string
          impressions: number
          messages: number
          meta_ad_id: string | null
          name: string
          spend: number
          status: string
        }
        Insert: {
          ad_set_id: string
          clicks?: number
          created_at?: string
          id?: string
          impressions?: number
          messages?: number
          meta_ad_id?: string | null
          name: string
          spend?: number
          status?: string
        }
        Update: {
          ad_set_id?: string
          clicks?: number
          created_at?: string
          id?: string
          impressions?: number
          messages?: number
          meta_ad_id?: string | null
          name?: string
          spend?: number
          status?: string
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
      alert_events: {
        Row: {
          alert_id: string
          campaign_id: string | null
          id: string
          metric_value: number
          status: string
          triggered_at: string
        }
        Insert: {
          alert_id: string
          campaign_id?: string | null
          id?: string
          metric_value: number
          status?: string
          triggered_at?: string
        }
        Update: {
          alert_id?: string
          campaign_id?: string | null
          id?: string
          metric_value?: number
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
          client_id: string | null
          created_at: string
          id: string
          is_active: boolean
          metric: string
          name: string
          operator: string
          threshold: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metric: string
          name: string
          operator: string
          threshold: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metric?: string
          name?: string
          operator?: string
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "alerts_client_id_fkey"
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
        Relationships: []
      }
      clients: {
          Row: {
            address: string | null
            business_segment: string | null
            city: string | null
            created_at: string
            id: string
            logo_url: string | null
            company_id: string | null
            manager_id: string | null
            meta_access_token: string | null
            meta_ad_account_id: string | null
            meta_auto_sync_enabled: boolean
            meta_auto_sync_frequency_hours: number
            meta_connected_at: string | null
            meta_instagram_account_id: string | null
            meta_instagram_username: string | null
            meta_last_sync_at: string | null
            meta_last_sync_error: string | null
            meta_last_verified_at: string | null
            meta_balance_at: string | null
            meta_balance_cents: number | null
            meta_balance_label: string | null
            meta_funding_type: number | null
            meta_page_id: string | null
            meta_page_access_token: string | null
            meta_page_name: string | null
            meta_sync_runs: number
            meta_sync_status: string
            name: string
            primary_goal: string | null
            report_template: Json | null
            service_radius_km: number | null
            state: string | null
            status: string
            cnpj: string | null
            cpf: string | null
            email: string | null
            site: string | null
            responsavel_nome: string | null
            whatsapp_comercial: string | null
            whatsapp_pessoal: string | null
            metodo_pagamento: string | null
            whatsapp_number: string | null
            whatsapp_group_jid: string | null
            updated_at: string
        }
        Insert: {
          address?: string | null
          business_segment?: string | null
          city?: string | null
          created_at?: string
          id?: string
            logo_url?: string | null
            company_id?: string | null
            manager_id?: string | null
            meta_access_token?: string | null
            meta_ad_account_id?: string | null
            meta_auto_sync_enabled?: boolean
            meta_auto_sync_frequency_hours?: number
            meta_connected_at?: string | null
            meta_instagram_account_id?: string | null
            meta_instagram_username?: string | null
            meta_last_sync_at?: string | null
            meta_last_sync_error?: string | null
            meta_last_verified_at?: string | null
            meta_balance_at?: string | null
            meta_balance_cents?: number | null
            meta_balance_label?: string | null
            meta_funding_type?: number | null
            meta_page_id?: string | null
            meta_page_access_token?: string | null
            meta_page_name?: string | null
            meta_sync_runs?: number
            meta_sync_status?: string
            name: string
            primary_goal?: string | null
            report_template?: Json | null
            service_radius_km?: number | null
            state?: string | null
            status?: string
            cnpj?: string | null
            cpf?: string | null
            email?: string | null
            site?: string | null
            responsavel_nome?: string | null
            whatsapp_comercial?: string | null
            whatsapp_pessoal?: string | null
            metodo_pagamento?: string | null
            whatsapp_number?: string | null
            whatsapp_group_jid?: string | null
            updated_at?: string
        }
        Update: {
          address?: string | null
          business_segment?: string | null
          city?: string | null
          created_at?: string
          id?: string
            logo_url?: string | null
            company_id?: string | null
            manager_id?: string | null
            meta_access_token?: string | null
            meta_ad_account_id?: string | null
            meta_auto_sync_enabled?: boolean
            meta_auto_sync_frequency_hours?: number
            meta_connected_at?: string | null
            meta_instagram_account_id?: string | null
            meta_instagram_username?: string | null
            meta_last_sync_at?: string | null
            meta_last_sync_error?: string | null
            meta_last_verified_at?: string | null
            meta_balance_at?: string | null
            meta_balance_cents?: number | null
            meta_balance_label?: string | null
            meta_funding_type?: number | null
            meta_page_id?: string | null
            meta_page_access_token?: string | null
            meta_page_name?: string | null
            meta_sync_runs?: number
            meta_sync_status?: string
            name?: string
            primary_goal?: string | null
            report_template?: Json | null
            service_radius_km?: number | null
            state?: string | null
            status?: string
            cnpj?: string | null
            cpf?: string | null
            email?: string | null
            site?: string | null
            responsavel_nome?: string | null
            whatsapp_comercial?: string | null
            whatsapp_pessoal?: string | null
            metodo_pagamento?: string | null
            whatsapp_number?: string | null
            whatsapp_group_jid?: string | null
            updated_at?: string
        }
        Relationships: []
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
          tem_senha: boolean
        }
        Insert: never
        Update: never
        Relationships: []
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
        Insert: never
        Update: never
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          concluida_at: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          prazo: string | null
          prioridade: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          concluida_at?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          concluida_at?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      rotinas: {
        Row: {
          assigned_to: string | null
          ativa: boolean
          client_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          dia_mes: number | null
          dias_semana: number[] | null
          horario_limite: string | null
          id: string
          periodicidade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          ativa?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dia_mes?: number | null
          dias_semana?: number[] | null
          horario_limite?: string | null
          id?: string
          periodicidade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          ativa?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dia_mes?: number | null
          dias_semana?: number[] | null
          horario_limite?: string | null
          id?: string
          periodicidade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
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
          observacao: string | null
          rotina_id: string
        }
        Insert: {
          avisado_at?: string | null
          created_at?: string
          data_ref: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          observacao?: string | null
          rotina_id: string
        }
        Update: {
          avisado_at?: string | null
          created_at?: string
          data_ref?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          observacao?: string | null
          rotina_id?: string
        }
        Relationships: []
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
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      user_companies: {
        Row: {
          company_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      managers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          whatsapp_number?: string | null
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      get_my_role: { Args: Record<string, never>; Returns: Database["public"]["Enums"]["app_role"] }
      is_production_member: { Args: { _user_id: string }; Returns: boolean }
      seed_client_tasks: { Args: { _client_id: string }; Returns: number }
      salvar_acesso_cliente: {
        Args: {
          p_client_id: string
          p_plataforma: string
          p_login?: string | null
          p_senha?: string | null
          p_observacao?: string | null
        }
        Returns: string
      }
      apagar_acesso_cliente: { Args: { p_acesso_id: string }; Returns: undefined }
      revelar_senha_acesso: { Args: { p_acesso_id: string }; Returns: string | null }
    }
    Enums: {
      app_role: "owner" | "admin" | "analyst" | "viewer" | "editor" | "designer"
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
      app_role: ["owner", "admin", "analyst", "viewer"],
    },
  },
} as const
