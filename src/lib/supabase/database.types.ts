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
      app_settings: {
        Row: {
          schluessel: string
          updated_at: string
          updated_by: string | null
          wert: Json
        }
        Insert: {
          schluessel: string
          updated_at?: string
          updated_by?: string | null
          wert: Json
        }
        Update: {
          schluessel?: string
          updated_at?: string
          updated_by?: string | null
          wert?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_members: {
        Row: {
          appointment_id: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_members_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          archiviert_am: string | null
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
          notiz: string | null
          ort: string | null
          project_id: string | null
          titel: string
          updated_at: string
          zeit: string | null
        }
        Insert: {
          archiviert_am?: string | null
          created_at?: string
          datum: string
          erstellt_von?: string | null
          id?: string
          notiz?: string | null
          ort?: string | null
          project_id?: string | null
          titel: string
          updated_at?: string
          zeit?: string | null
        }
        Update: {
          archiviert_am?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          notiz?: string | null
          ort?: string | null
          project_id?: string | null
          titel?: string
          updated_at?: string
          zeit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_members: {
        Row: {
          assignment_id: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_stops: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          notiz: string | null
          project_id: string
          sortierung: number
          updated_at: string
          zeit: string | null
          zeit_art: Database["public"]["Enums"]["stopp_zeit_art"] | null
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          notiz?: string | null
          project_id: string
          sortierung?: number
          updated_at?: string
          zeit?: string | null
          zeit_art?: Database["public"]["Enums"]["stopp_zeit_art"] | null
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          notiz?: string | null
          project_id?: string
          sortierung?: number
          updated_at?: string
          zeit?: string | null
          zeit_art?: Database["public"]["Enums"]["stopp_zeit_art"] | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_stops_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_stops_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          created_by: string | null
          datum: string
          id: string
          notiz: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          datum: string
          id?: string
          notiz?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          datum?: string
          id?: string
          notiz?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      leave_requests: {
        Row: {
          antwort: string | null
          art: Database["public"]["Enums"]["zeit_art"]
          bemerkung: string | null
          bis: string
          created_at: string
          entschieden_am: string | null
          entschieden_von: string | null
          id: string
          status: Database["public"]["Enums"]["urlaub_status"]
          updated_at: string
          user_id: string
          von: string
        }
        Insert: {
          antwort?: string | null
          art?: Database["public"]["Enums"]["zeit_art"]
          bemerkung?: string | null
          bis: string
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          id?: string
          status?: Database["public"]["Enums"]["urlaub_status"]
          updated_at?: string
          user_id?: string
          von: string
        }
        Update: {
          antwort?: string | null
          art?: Database["public"]["Enums"]["zeit_art"]
          bemerkung?: string | null
          bis?: string
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          id?: string
          status?: Database["public"]["Enums"]["urlaub_status"]
          updated_at?: string
          user_id?: string
          von?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_entschieden_von_fkey"
            columns: ["entschieden_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_usage: {
        Row: {
          archiviert_am: string | null
          bemerkung: string | null
          created_at: string
          einheit: string
          erledigt_am: string | null
          erstellt_von: string | null
          id: string
          material: string
          material_id: string | null
          menge: number
          project_id: string
          updated_at: string
        }
        Insert: {
          archiviert_am?: string | null
          bemerkung?: string | null
          created_at?: string
          einheit: string
          erledigt_am?: string | null
          erstellt_von?: string | null
          id?: string
          material: string
          material_id?: string | null
          menge: number
          project_id: string
          updated_at?: string
        }
        Update: {
          archiviert_am?: string | null
          bemerkung?: string | null
          created_at?: string
          einheit?: string
          erledigt_am?: string | null
          erstellt_von?: string | null
          id?: string
          material?: string
          material_id?: string | null
          menge?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_usage_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_usage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_deductions: {
        Row: {
          anzahl: number
          bezeichnung: string
          breite: number
          created_at: string
          hoehe: number
          id: string
          measurement_id: string
          updated_at: string
        }
        Insert: {
          anzahl?: number
          bezeichnung?: string
          breite: number
          created_at?: string
          hoehe: number
          id?: string
          measurement_id: string
          updated_at?: string
        }
        Update: {
          anzahl?: number
          bezeichnung?: string
          breite?: number
          created_at?: string
          hoehe?: number
          id?: string
          measurement_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_deductions_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          anzahl: number
          archiviert_am: string | null
          bemerkung: string | null
          created_at: string
          einheit: Database["public"]["Enums"]["aufmass_einheit"]
          erstellt_von: string | null
          hoehe: number | null
          id: string
          laenge: number | null
          menge: number
          position: string
          project_id: string
          raum: string
          updated_at: string
        }
        Insert: {
          anzahl?: number
          archiviert_am?: string | null
          bemerkung?: string | null
          created_at?: string
          einheit?: Database["public"]["Enums"]["aufmass_einheit"]
          erstellt_von?: string | null
          hoehe?: number | null
          id?: string
          laenge?: number | null
          menge?: number
          position: string
          project_id: string
          raum: string
          updated_at?: string
        }
        Update: {
          anzahl?: number
          archiviert_am?: string | null
          bemerkung?: string | null
          created_at?: string
          einheit?: Database["public"]["Enums"]["aufmass_einheit"]
          erstellt_von?: string | null
          hoehe?: number | null
          id?: string
          laenge?: number | null
          menge?: number
          position?: string
          project_id?: string
          raum?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurements_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          ausgeloest_von: string | null
          created_at: string
          gelesen_am: string | null
          id: number
          project_id: string | null
          text: string
          typ: string
        }
        Insert: {
          ausgeloest_von?: string | null
          created_at?: string
          gelesen_am?: string | null
          id?: never
          project_id?: string | null
          text: string
          typ: string
        }
        Update: {
          ausgeloest_von?: string | null
          created_at?: string
          gelesen_am?: string | null
          id?: never
          project_id?: string | null
          text?: string
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ausgeloest_von_fkey"
            columns: ["ausgeloest_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          urlaubstage_jahr: number | null
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
          urlaubstage_jahr?: number | null
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
          urlaubstage_jahr?: number | null
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
      project_notes: {
        Row: {
          archiviert_am: string | null
          created_at: string
          erstellt_von: string | null
          id: string
          project_id: string
          text: string
          updated_at: string
        }
        Insert: {
          archiviert_am?: string | null
          created_at?: string
          erstellt_von?: string | null
          id?: string
          project_id: string
          text: string
          updated_at?: string
        }
        Update: {
          archiviert_am?: string | null
          created_at?: string
          erstellt_von?: string | null
          id?: string
          project_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_photos: {
        Row: {
          archiviert_am: string | null
          breite: number | null
          created_at: string
          erstellt_von: string | null
          groesse_bytes: number | null
          hoehe: number | null
          id: string
          kategorie: Database["public"]["Enums"]["foto_kategorie"]
          kommentar: string | null
          project_id: string
          storage_pfad: string
          updated_at: string
        }
        Insert: {
          archiviert_am?: string | null
          breite?: number | null
          created_at?: string
          erstellt_von?: string | null
          groesse_bytes?: number | null
          hoehe?: number | null
          id?: string
          kategorie?: Database["public"]["Enums"]["foto_kategorie"]
          kommentar?: string | null
          project_id: string
          storage_pfad: string
          updated_at?: string
        }
        Update: {
          archiviert_am?: string | null
          breite?: number | null
          created_at?: string
          erstellt_von?: string | null
          groesse_bytes?: number | null
          hoehe?: number | null
          id?: string
          kategorie?: Database["public"]["Enums"]["foto_kategorie"]
          kommentar?: string | null
          project_id?: string
          storage_pfad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_photos_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      time_entries: {
        Row: {
          archiviert_am: string | null
          art: Database["public"]["Enums"]["zeit_art"]
          bearbeitet_von: string | null
          beschreibung: string | null
          bis: string | null
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
          leave_request_id: string | null
          pause_min: number
          project_id: string | null
          stunden: number
          updated_at: string
          user_id: string
          von: string | null
        }
        Insert: {
          archiviert_am?: string | null
          art?: Database["public"]["Enums"]["zeit_art"]
          bearbeitet_von?: string | null
          beschreibung?: string | null
          bis?: string | null
          created_at?: string
          datum: string
          erstellt_von?: string | null
          id?: string
          leave_request_id?: string | null
          pause_min?: number
          project_id?: string | null
          stunden: number
          updated_at?: string
          user_id?: string
          von?: string | null
        }
        Update: {
          archiviert_am?: string | null
          art?: Database["public"]["Enums"]["zeit_art"]
          bearbeitet_von?: string | null
          beschreibung?: string | null
          bis?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          leave_request_id?: string | null
          pause_min?: number
          project_id?: string | null
          stunden?: number
          updated_at?: string
          user_id?: string
          von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_bearbeitet_von_fkey"
            columns: ["bearbeitet_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      aufmass_bearbeitbar: {
        Args: { p_measurement_id: string }
        Returns: boolean
      }
      aufmass_sichtbar: { Args: { p_measurement_id: string }; Returns: boolean }
      ist_admin: { Args: never; Returns: boolean }
      ist_aktiv: { Args: never; Returns: boolean }
      ist_aktiver_nutzer: { Args: { p_user_id: string }; Returns: boolean }
      ist_buero_oder_admin: { Args: never; Returns: boolean }
      ist_im_einsatz: { Args: { p_assignment_id: string }; Returns: boolean }
      ist_im_termin: { Args: { p_termin_id: string }; Returns: boolean }
      ist_mitglied_von: {
        Args: { p_projekt_id: string; p_user_id: string }
        Returns: boolean
      }
      ist_projektmitglied: { Args: { p_projekt_id: string }; Returns: boolean }
      ist_termin_ersteller: { Args: { p_termin_id: string }; Returns: boolean }
      kollegen: {
        Args: never
        Returns: {
          id: string
          nachname: string
          telefon: string
          vorname: string
        }[]
      }
      nutzer_sessions_beenden: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      projekt_aus_pfad: { Args: { p_pfad: string }; Returns: string }
      zeit_art_erlaubt: {
        Args: { p_art: Database["public"]["Enums"]["zeit_art"] }
        Returns: boolean
      }
      zeit_noch_aenderbar: {
        Args: { p_datum: string; p_heute?: string }
        Returns: boolean
      }
    }
    Enums: {
      app_rolle: "admin" | "buero" | "mitarbeiter"
      aufmass_einheit: "m2" | "m" | "stk"
      foto_kategorie: "vorher" | "nachher" | "mangel" | "sonstiges"
      kontakt_typ: "firma" | "privat"
      stopp_zeit_art: "um" | "ab"
      urlaub_status: "offen" | "genehmigt" | "abgelehnt" | "zurueckgezogen"
      zeit_art:
        | "arbeitszeit"
        | "fahrtzeit"
        | "urlaub"
        | "unbezahlter_urlaub"
        | "krank"
        | "schlechtwetter"
        | "kurzarbeit"
        | "sonstiges"
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
      aufmass_einheit: ["m2", "m", "stk"],
      foto_kategorie: ["vorher", "nachher", "mangel", "sonstiges"],
      kontakt_typ: ["firma", "privat"],
      stopp_zeit_art: ["um", "ab"],
      urlaub_status: ["offen", "genehmigt", "abgelehnt", "zurueckgezogen"],
      zeit_art: [
        "arbeitszeit",
        "fahrtzeit",
        "urlaub",
        "unbezahlter_urlaub",
        "krank",
        "schlechtwetter",
        "kurzarbeit",
        "sonstiges",
      ],
    },
  },
} as const
