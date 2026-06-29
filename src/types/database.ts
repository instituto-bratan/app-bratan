export type Cargo =
  | "dr_daniel"
  | "ceo"
  | "gestor"
  | "gestor_financeiro"
  | "marketing"
  | "secretaria_executiva"
  | "recepcionista"
  | "enfermeira"
  | "nutricionista"
  | "limpeza";

export type Colaborador = {
  id: string;
  auth_id: string | null;
  nome: string;
  email: string;
  cargo: Cargo;
  ativo: boolean;
  created_at: string;
  updated_at: string | null;
};

export type Pessoa = Colaborador;

export type ComprovanteTipo = "entrada" | "estorno";

export type FormaPagamento = "pix" | "cartao_credito" | "cartao_debito" | "dinheiro" | "boleto" | "transferencia" | "outro";

export type PrioridadeAviso = "info" | "importante";

export type PagamentoLembreteStatus = "aberto" | "pago" | "cancelado";

export type EstalecaTransactionType =
  | "earn"
  | "spend"
  | "adjustment"
  | "cashback"
  | "checkin"
  | "reward"
  | "reversal"
  | "expiration";

export type EstalecaTransactionSource =
  | "church_checkin"
  | "gym_checkin"
  | "cashback"
  | "admin_bonus"
  | "streak_bonus"
  | "monthly_winner"
  | "milestone_500"
  | "manual_adjustment";

export type EstalecaTransactionStatus = "approved" | "pending" | "rejected" | "expired" | "reversed";

export type CheckinType = "church" | "gym";

export type CheckinStatus = "valid" | "pending" | "invalid" | "cancelled";

export type CheckinValidationMethod = "self" | "qr_code" | "geofence" | "admin" | "event_code";

export type RewardCampaignType = "monthly_ranking" | "milestone" | "cashback" | "checkin_bonus";

export type RewardStatus = "pending" | "confirmed" | "delivered" | "cancelled";

export type RewardType = "monthly_winner" | "milestone_500" | "cashback_bonus" | "checkin_bonus" | "manual_prize";

export type ChecklistTemplate = {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
};

export type ChecklistItemTemplate = {
  id: string;
  template_id: string;
  grupo: string;
  descricao: string;
  responsavel: string;
  ordem: number;
};

export type ChecklistRun = {
  id: string;
  template_id: string;
  data_ref: string;
  created_at: string;
};

export type ChecklistItemRun = {
  id: string;
  run_id: string;
  grupo: string;
  descricao: string;
  responsavel: string;
  ordem: number;
  concluido: boolean;
  concluido_por: string | null;
  concluido_em: string | null;
};

export type AvisoRow = {
  id: string;
  autor_id: string;
  corpo: string;
  prioridade: PrioridadeAviso;
  publicado_em: string;
  deleted_at: string | null;
};

export type ComprovanteRow = {
  id: string;
  tipo: ComprovanteTipo;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
  valor: number | null;
  forma_pagamento: FormaPagamento | null;
  observacao: string | null;
  estorno_de: string | null;
  deleted_at: string | null;
  sharepoint_status: string;
  sharepoint_job_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type PagamentoLembreteRow = {
  id: string;
  paciente_nome: string;
  contato: string | null;
  valor_pendente: number;
  data_prevista: string;
  observacao: string | null;
  status: PagamentoLembreteStatus;
  criado_por: string;
  criado_em: string;
  updated_at: string | null;
  pago_em: string | null;
  deleted_at: string | null;
};

export type GamificationProfileRow = {
  user_id: string;
  display_name: string | null;
  ranking_opt_in: boolean;
  checkins_consent_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type EstalecaConfigRow = {
  id: boolean;
  church_checkin_estalecas: number;
  gym_checkin_estalecas: number;
  gym_checkin_checkpoints: number;
  streak_bonus_estalecas: number;
  milestone_500_estalecas: number;
  default_cashback_percent: number;
  max_cashback_estalecas: number;
  cashback_approval_days: number;
  estalecas_expiration_days: number | null;
  eligible_categories: string[];
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type EstalecaTransactionRow = {
  id: string;
  user_id: string;
  type: EstalecaTransactionType;
  source: EstalecaTransactionSource;
  amount: number;
  status: EstalecaTransactionStatus;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
  created_by: string | null;
};

export type CheckinRow = {
  id: string;
  user_id: string;
  checkin_type: CheckinType;
  checkin_date: string;
  status: CheckinStatus;
  validation_method: CheckinValidationMethod;
  reward_transaction_id: string | null;
  checkpoints_awarded: number;
  estalecas_awarded: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  invalidated_by: string | null;
  invalidation_reason: string | null;
};

export type RewardCampaignRow = {
  id: string;
  name: string;
  type: RewardCampaignType;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  rules: Record<string, unknown>;
  reward_description: string;
  created_at: string;
  updated_at: string | null;
};

export type RewardRow = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  reward_type: RewardType;
  title: string;
  description: string;
  status: RewardStatus;
  month: number | null;
  year: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  delivered_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      colaborador: {
        Row: {
          id: string;
          auth_id: string | null;
          nome: string;
          email: string;
          ativo: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          nome: string;
          email: string;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<{
          auth_id: string | null;
          nome: string;
          email: string;
          ativo: boolean;
          updated_at: string | null;
        }>;
      };
      colaborador_cargo: {
        Row: {
          colaborador_id: string;
          auth_id: string | null;
          cargo: Cargo;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          colaborador_id: string;
          auth_id?: string | null;
          cargo: Cargo;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<{
          auth_id: string | null;
          cargo: Cargo;
          updated_at: string | null;
        }>;
      };
      colaborador_app: {
        Row: Colaborador;
        Insert: never;
        Update: never;
      };
      checklist_template: {
        Row: ChecklistTemplate;
        Insert: {
          id?: string;
          nome?: string;
          ativo?: boolean;
          created_at?: string;
        };
        Update: Partial<Omit<ChecklistTemplate, "id" | "created_at">>;
      };
      checklist_item_template: {
        Row: ChecklistItemTemplate;
        Insert: {
          id?: string;
          template_id: string;
          grupo: string;
          descricao: string;
          responsavel: string;
          ordem?: number;
        };
        Update: Partial<Omit<ChecklistItemTemplate, "id" | "template_id">>;
      };
      checklist_run: {
        Row: ChecklistRun;
        Insert: {
          id?: string;
          template_id: string;
          data_ref: string;
          created_at?: string;
        };
        Update: Partial<Omit<ChecklistRun, "id" | "created_at">>;
      };
      checklist_item_run: {
        Row: ChecklistItemRun;
        Insert: {
          id?: string;
          run_id: string;
          grupo: string;
          descricao: string;
          responsavel: string;
          ordem?: number;
          concluido?: boolean;
          concluido_por?: string | null;
          concluido_em?: string | null;
        };
        Update: Partial<Omit<ChecklistItemRun, "id" | "run_id">>;
      };
      aviso: {
        Row: AvisoRow;
        Insert: {
          id?: string;
          autor_id: string;
          corpo: string;
          prioridade?: PrioridadeAviso;
          publicado_em?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Omit<AvisoRow, "id" | "autor_id" | "publicado_em">>;
      };
      comprovante: {
        Row: ComprovanteRow;
        Insert: {
          id?: string;
          tipo?: ComprovanteTipo;
          storage_bucket?: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          file_size_bytes: number;
          uploaded_by: string;
          uploaded_at?: string;
          valor?: number | null;
          forma_pagamento?: FormaPagamento | null;
          observacao?: string | null;
          estorno_de?: string | null;
          deleted_at?: string | null;
          sharepoint_status?: string;
          sharepoint_job_payload?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Omit<ComprovanteRow, "id" | "created_at">>;
      };
      pagamento_lembrete: {
        Row: PagamentoLembreteRow;
        Insert: {
          id?: string;
          paciente_nome: string;
          contato?: string | null;
          valor_pendente: number;
          data_prevista: string;
          observacao?: string | null;
          status?: PagamentoLembreteStatus;
          criado_por: string;
          criado_em?: string;
          updated_at?: string | null;
          pago_em?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<Omit<PagamentoLembreteRow, "id" | "criado_em">>;
      };
      gamification_profile: {
        Row: GamificationProfileRow;
        Insert: {
          user_id: string;
          display_name?: string | null;
          ranking_opt_in?: boolean;
          checkins_consent_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Omit<GamificationProfileRow, "user_id" | "created_at">>;
      };
      estaleca_config: {
        Row: EstalecaConfigRow;
        Insert: Partial<EstalecaConfigRow>;
        Update: Partial<Omit<EstalecaConfigRow, "id" | "created_at">>;
      };
      estaleca_transactions: {
        Row: EstalecaTransactionRow;
        Insert: {
          id?: string;
          user_id: string;
          type: EstalecaTransactionType;
          source: EstalecaTransactionSource;
          amount: number;
          status?: EstalecaTransactionStatus;
          description: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string | null;
          expires_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Omit<EstalecaTransactionRow, "id" | "user_id" | "created_at">>;
      };
      checkins: {
        Row: CheckinRow;
        Insert: {
          id?: string;
          user_id: string;
          checkin_type: CheckinType;
          checkin_date: string;
          status?: CheckinStatus;
          validation_method?: CheckinValidationMethod;
          reward_transaction_id?: string | null;
          checkpoints_awarded?: number;
          estalecas_awarded?: number;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string | null;
          invalidated_by?: string | null;
          invalidation_reason?: string | null;
        };
        Update: Partial<Omit<CheckinRow, "id" | "user_id" | "created_at">>;
      };
      reward_campaigns: {
        Row: RewardCampaignRow;
        Insert: {
          id?: string;
          name: string;
          type: RewardCampaignType;
          active?: boolean;
          start_date?: string | null;
          end_date?: string | null;
          rules?: Record<string, unknown>;
          reward_description: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Omit<RewardCampaignRow, "id" | "created_at">>;
      };
      rewards: {
        Row: RewardRow;
        Insert: {
          id?: string;
          user_id: string;
          campaign_id?: string | null;
          reward_type: RewardType;
          title: string;
          description: string;
          status?: RewardStatus;
          month?: number | null;
          year?: number | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string | null;
          delivered_at?: string | null;
        };
        Update: Partial<Omit<RewardRow, "id" | "user_id" | "created_at">>;
      };
    };
    Enums: {
      cargo: Cargo;
      prioridade_aviso: PrioridadeAviso;
      comprovante_tipo: ComprovanteTipo;
      forma_pagamento: FormaPagamento;
      pagamento_lembrete_status: PagamentoLembreteStatus;
      estaleca_transaction_type: EstalecaTransactionType;
      estaleca_transaction_source: EstalecaTransactionSource;
      estaleca_transaction_status: EstalecaTransactionStatus;
      checkin_type: CheckinType;
      checkin_status: CheckinStatus;
      checkin_validation_method: CheckinValidationMethod;
      reward_campaign_type: RewardCampaignType;
      reward_status: RewardStatus;
      reward_type: RewardType;
    };
  };
};
