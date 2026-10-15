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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          aktion: string
          alt: Json | null
          datensatz_id: string
          geaendert_am: string
          geaendert_von: string | null
          id: number
          neu: Json | null
          tabelle: string
        }
        Insert: {
          aktion: string
          alt?: Json | null
          datensatz_id: string
          geaendert_am?: string
          geaendert_von?: string | null
          id?: never
          neu?: Json | null
          tabelle: string
        }
        Update: {
          aktion?: string
          alt?: Json | null
          datensatz_id?: string
          geaendert_am?: string
          geaendert_von?: string | null
          id?: never
          neu?: Json | null
          tabelle?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          anrede: string | null
          ansprechpartner: string | null
          archiviert_am: string | null
          created_at: string
          created_by: string | null
          email: string | null
          firmenname: string | null
          id: string
          kundennummer: string | null
          lexware_contact_id: string | null
          mobil: string | null
          nachname: string | null
          notizen: string | null
          ort: string | null
          plz: string | null
          strasse: string | null
          telefon: string | null
          typ: Database["public"]["Enums"]["kontakt_typ"]
          updated_at: string
          vorname: string | null
        }
        Insert: {
          anrede?: string | null
          ansprechpartner?: string | null
          archiviert_am?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          firmenname?: string | null
          id?: string
          kundennummer?: string | null
          lexware_contact_id?: string | null
          mobil?: string | null
          nachname?: string | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          strasse?: string | null
          telefon?: string | null
          typ?: Database["public"]["Enums"]["kontakt_typ"]
          updated_at?: string
          vorname?: string | null
        }
        Update: {
          anrede?: string | null
          ansprechpartner?: string | null
          archiviert_am?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          firmenname?: string | null
          id?: string
          kundennummer?: string | null
          lexware_contact_id?: string | null
          mobil?: string | null
          nachname?: string | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          strasse?: string | null
          telefon?: string | null
          typ?: Database["public"]["Enums"]["kontakt_typ"]
          updated_at?: string
          vorname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aktiv: boolean
          arbeitszeitmodell: string | null
          benutzername: string
          created_at: string
          email: string | null
          id: string
          muss_passwort_aendern: boolean
          nachname: string
          rolle: Database["public"]["Enums"]["app_rolle"]
          telefon: string | null
          updated_at: string
          vorname: string
        }
        Insert: {
          aktiv?: boolean
          arbeitszeitmodell?: string | null
          benutzername: string
          created_at?: string
          email?: string | null
          id: string
          muss_passwort_aendern?: boolean
          nachname?: string
          rolle?: Database["public"]["Enums"]["app_rolle"]
          telefon?: string | null
          updated_at?: string
          vorname: string
        }
        Update: {
          aktiv?: boolean
          arbeitszeitmodell?: string | null
          benutzername?: string
          created_at?: string
          email?: string | null
          id?: string
          muss_passwort_aendern?: boolean
          nachname?: string
          rolle?: Database["public"]["Enums"]["app_rolle"]
          telefon?: string | null
          updated_at?: string
          vorname?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          added_at: string
          added_by: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_statuses: {
        Row: {
          aktiv: boolean
          created_at: string
          farbe: string
          id: string
          name: string
          sortierung: number
          updated_at: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          farbe?: string
          id?: string
          name: string
          sortierung?: number
          updated_at?: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          farbe?: string
          id?: string
          name?: string
          sortierung?: number
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archiviert_am: string | null
          baustelle_ort: string | null
          baustelle_plz: string | null
          baustelle_strasse: string | null
          beschreibung: string | null
          buero_ansprechpartner_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          end_datum: string | null
          id: string
          name: string
          projektnummer: string
          start_datum: string | null
          status_id: string
          updated_at: string
        }
        Insert: {
          archiviert_am?: string | null
          baustelle_ort?: string | null
          baustelle_plz?: string | null
          baustelle_strasse?: string | null
          beschreibung?: string | null
          buero_ansprechpartner_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          end_datum?: string | null
          id?: string
          name: string
          projektnummer: string
          start_datum?: string | null
          status_id: string
          updated_at?: string
        }
        Update: {
          archiviert_am?: string | null
          baustelle_ort?: string | null
          baustelle_plz?: string | null
          baustelle_strasse?: string | null
          beschreibung?: string | null
          buero_ansprechpartner_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          end_datum?: string | null
          id?: string
          name?: string
          projektnummer?: string
          start_datum?: string | null
          status_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_buero_ansprechpartner_id_fkey"
            columns: ["buero_ansprechpartner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "project_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          aktiv: boolean
          created_at: string
          id: string
          kennzeichen: string | null
          name: string
          updated_at: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          id?: string
          kennzeichen?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          id?: string
          kennzeichen?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ist_admin: { Args: never; Returns: boolean }
      ist_aktiv: { Args: never; Returns: boolean }
      ist_buero_oder_admin: { Args: never; Returns: boolean }
      ist_projektmitglied: { Args: { p_projekt_id: string }; Returns: boolean }
      nutzer_sessions_beenden: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_rolle: "admin" | "buero" | "mitarbeiter"
      kontakt_typ: "firma" | "privat"
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
  public: {
    Enums: {
      app_rolle: ["admin", "buero", "mitarbeiter"],
      kontakt_typ: ["firma", "privat"],
    },
  },
} as const
