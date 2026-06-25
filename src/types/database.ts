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
    };
    Enums: {
      cargo: Cargo;
      prioridade_aviso: PrioridadeAviso;
      comprovante_tipo: ComprovanteTipo;
      forma_pagamento: FormaPagamento;
      pagamento_lembrete_status: PagamentoLembreteStatus;
    };
  };
};
