
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "board_tiles": {
                  Row: {
                    "game_id": string,"picture_id": string,"rotation": number,"scale": number,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"picture_id": string,"rotation": number,"scale": number,"x": number,"y": number
                  }
                  Update: {
                    "game_id"?: string,"picture_id"?: string,"rotation"?: number,"scale"?: number,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "board_tiles_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "board_tiles_picture_id_fkey"
      columns: ["picture_id"]
isOneToOne: false
      referencedRelation: "pictures"
      referencedColumns: ["id"]
    }
                  ]
                },"game_players": {
                  Row: {
                    "board_unlocked_at": string | null,"game_id": string,"joined_at": string,"seat": number | null,"status": Database["public"]['Enums']["player_status"],"total_ms": number,"turns_done": number,"user_id": string,"wrong_taps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "board_unlocked_at"?: string | null,"game_id": string,"joined_at"?: string,"seat"?: number | null,"status"?: Database["public"]['Enums']["player_status"],"total_ms"?: number,"turns_done"?: number,"user_id": string,"wrong_taps"?: number
                  }
                  Update: {
                    "board_unlocked_at"?: string | null,"game_id"?: string,"joined_at"?: string,"seat"?: number | null,"status"?: Database["public"]['Enums']["player_status"],"total_ms"?: number,"turns_done"?: number,"user_id"?: string,"wrong_taps"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_players_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "board_size": number,"cap_ms": number,"created_at": string,"current_turn_id": string | null,"finished_at": string | null,"host_id": string,"id": string,"last_activity_at": string,"layout": string,"monochrome": boolean,"penalty_ms": number,"rounds_per_player": number,"started_at": string | null,"status": Database["public"]['Enums']["game_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "board_size": number,"cap_ms"?: number,"created_at"?: string,"current_turn_id"?: string | null,"finished_at"?: string | null,"host_id": string,"id"?: string,"last_activity_at"?: string,"layout"?: string,"monochrome"?: boolean,"penalty_ms"?: number,"rounds_per_player": number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["game_status"]
                  }
                  Update: {
                    "board_size"?: number,"cap_ms"?: number,"created_at"?: string,"current_turn_id"?: string | null,"finished_at"?: string | null,"host_id"?: string,"id"?: string,"last_activity_at"?: string,"layout"?: string,"monochrome"?: boolean,"penalty_ms"?: number,"rounds_per_player"?: number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["game_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_current_turn_fk"
      columns: ["current_turn_id"]
isOneToOne: false
      referencedRelation: "turns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_current_turn_fk"
      columns: ["current_turn_id"]
isOneToOne: false
      referencedRelation: "turns_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_host_id_fkey"
      columns: ["host_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "expires_at": string,"game_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at": string,"game_id": string,"token": string
                  }
                  Update: {
                    "expires_at"?: string,"game_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"created_at": string,"game_id": string,"id": number,"kind": Database["public"]['Enums']["outbox_kind"],"last_attempt_at": string | null,"payload": NonNullable<Json>,"sent_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"game_id": string,"id"?: never,"kind": Database["public"]['Enums']["outbox_kind"],"last_attempt_at"?: string | null,"payload"?: NonNullable<Json>,"sent_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["outbox_kind"],"last_attempt_at"?: string | null,"payload"?: NonNullable<Json>,"sent_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_prefs": {
                  Row: {
                    "email": boolean,"push": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "email"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"picture_confusables": {
                  Row: {
                    "picture_a": string,"picture_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "picture_a": string,"picture_b": string
                  }
                  Update: {
                    "picture_a"?: string,"picture_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "picture_confusables_picture_a_fkey"
      columns: ["picture_a"]
isOneToOne: false
      referencedRelation: "pictures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "picture_confusables_picture_b_fkey"
      columns: ["picture_b"]
isOneToOne: false
      referencedRelation: "pictures"
      referencedColumns: ["id"]
    }
                  ]
                },"pictures": {
                  Row: {
                    "category": string,"file_path": string,"id": string,"library_version": number,"name": string,"review_status": Database["public"]['Enums']["review_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"file_path": string,"id": string,"library_version"?: number,"name": string,"review_status"?: Database["public"]['Enums']["review_status"]
                  }
                  Update: {
                    "category"?: string,"file_path"?: string,"id"?: string,"library_version"?: number,"name"?: string,"review_status"?: Database["public"]['Enums']["review_status"]
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name": string,"id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"endpoint": string,"id"?: string,"p256dh": string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"taps": {
                  Row: {
                    "client_elapsed_ms": number | null,"client_seq": number,"correct": boolean,"counted": boolean,"picture_id": string,"server_at": string,"turn_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_elapsed_ms"?: number | null,"client_seq": number,"correct": boolean,"counted"?: boolean,"picture_id": string,"server_at": string,"turn_id": string
                  }
                  Update: {
                    "client_elapsed_ms"?: number | null,"client_seq"?: number,"correct"?: boolean,"counted"?: boolean,"picture_id"?: string,"server_at"?: string,"turn_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "taps_turn_id_fkey"
      columns: ["turn_id"]
isOneToOne: false
      referencedRelation: "turns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "taps_turn_id_fkey"
      columns: ["turn_id"]
isOneToOne: false
      referencedRelation: "turns_public"
      referencedColumns: ["id"]
    }
                  ]
                },"turns": {
                  Row: {
                    "became_current_at": string,"deadline_at": string | null,"drawn_at": string | null,"ended_at": string | null,"game_id": string,"id": string,"reminded_at": string | null,"round": number,"score_ms": number | null,"seq": number,"status": Database["public"]['Enums']["turn_status"],"target_picture_id": string | null,"user_id": string,"wrong_taps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "became_current_at"?: string,"deadline_at"?: string | null,"drawn_at"?: string | null,"ended_at"?: string | null,"game_id": string,"id"?: string,"reminded_at"?: string | null,"round": number,"score_ms"?: number | null,"seq": number,"status"?: Database["public"]['Enums']["turn_status"],"target_picture_id"?: string | null,"user_id": string,"wrong_taps"?: number
                  }
                  Update: {
                    "became_current_at"?: string,"deadline_at"?: string | null,"drawn_at"?: string | null,"ended_at"?: string | null,"game_id"?: string,"id"?: string,"reminded_at"?: string | null,"round"?: number,"score_ms"?: number | null,"seq"?: number,"status"?: Database["public"]['Enums']["turn_status"],"target_picture_id"?: string | null,"user_id"?: string,"wrong_taps"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "turns_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "turns_target_picture_id_fkey"
      columns: ["target_picture_id"]
isOneToOne: false
      referencedRelation: "pictures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "turns_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "turns_public": {
                  Row: {
                    "became_current_at": string | null,"deadline_at": string | null,"drawn_at": string | null,"ended_at": string | null,"game_id": string | null,"id": string | null,"reminded_at": string | null,"round": number | null,"score_ms": number | null,"seq": number | null,"status": Database["public"]['Enums']["turn_status"] | null,"target_picture_id": string | null,"user_id": string | null,"wrong_taps": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "became_current_at"?: string | null,"deadline_at"?: string | null,"drawn_at"?: string | null,"ended_at"?: string | null,"game_id"?: string | null,"id"?: string | null,"reminded_at"?: string | null,"round"?: number | null,"score_ms"?: number | null,"seq"?: number | null,"status"?: Database["public"]['Enums']["turn_status"] | null,"target_picture_id"?: never,"user_id"?: string | null,"wrong_taps"?: number | null
                         }
                        Update: {
                           "became_current_at"?: string | null,"deadline_at"?: string | null,"drawn_at"?: string | null,"ended_at"?: string | null,"game_id"?: string | null,"id"?: string | null,"reminded_at"?: string | null,"round"?: number | null,"score_ms"?: number | null,"seq"?: number | null,"status"?: Database["public"]['Enums']["turn_status"] | null,"target_picture_id"?: never,"user_id"?: string | null,"wrong_taps"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "turns_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "turns_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "create_game":
{ Args: { "board_size": number,"layout"?: string,"monochrome"?: boolean,"rounds": number }; Returns: Json
                           },
"delete_push_subscription":
{ Args: { "endpoint": string }; Returns: undefined
                           },
"draw_target":
{ Args: { "game_id": string }; Returns: Json
                           },
"game_state":
{ Args: { "game_id": string }; Returns: Json
                           },
"join_game":
{ Args: { "token": string }; Returns: Json
                           },
"rematch":
{ Args: { "game_id": string }; Returns: Json
                           },
"retire":
{ Args: { "game_id": string }; Returns: Json
                           },
"save_push_subscription":
{ Args: { "auth": string,"endpoint": string,"p256dh": string }; Returns: undefined
                           },
"set_notification_prefs":
{ Args: { "email"?: boolean,"push"?: boolean }; Returns: Json
                           },
"start_game_internal":
{ Args: { "game_id": string,"tiles": Json }; Returns: Json
                           },
"submit_tap":
{ Args: { "client_elapsed_ms": number,"client_seq": number,"picture_id": string,"turn_id": string }; Returns: Json
                           },
"sweep_turns":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"update_profile":
{ Args: { "avatar_url"?: string,"display_name"?: string }; Returns: Json
                           }
          }
          Enums: {
            "game_status": "lobby"|"in_progress"|"finished"|"abandoned","outbox_kind": "your_turn"|"reminder"|"game_finished","player_status": "active"|"retired","review_status": "draft"|"approved"|"rejected","turn_status": "pending"|"live"|"found"|"capped"|"forfeited"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "game_status": ["lobby", "in_progress", "finished", "abandoned"],"outbox_kind": ["your_turn", "reminder", "game_finished"],"player_status": ["active", "retired"],"review_status": ["draft", "approved", "rejected"],"turn_status": ["pending", "live", "found", "capped", "forfeited"]
          }
        }
} as const
