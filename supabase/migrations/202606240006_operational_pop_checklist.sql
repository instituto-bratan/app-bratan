update public.checklist_template
set nome = 'Rotina operacional diária',
    ativo = true
where id = '10000000-0000-0000-0000-000000000001';

delete from public.checklist_item_template
where template_id = '10000000-0000-0000-0000-000000000001';

insert into public.checklist_item_template (id, template_id, grupo, descricao, responsavel, ordem)
values
  ('10000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000001', 'Recepção / Comercial', 'Confirmar consultas D-2/D-1 e atualizar iClinic/PDCA Comercial', 'Recepção', 1),
  ('10000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000001', 'Recepção / Comercial', 'Preparar acolhimento: questionário, bioimpedância, café/lanche e encaminhamento', 'Recepção', 2),
  ('10000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000001', 'Recepção / Comercial', 'Conferir contratos SuperSign: modelo, ordem, WhatsApp e campos obrigatórios', 'Recepção', 3),
  ('10000000-0000-0000-0000-000000000204', '10000000-0000-0000-0000-000000000001', 'Recepção / Comercial', 'Registrar adesão/não adesão, presente e responsável pelo paciente', 'Recepção', 4),
  ('10000000-0000-0000-0000-000000000205', '10000000-0000-0000-0000-000000000001', 'Gestão', 'Validar pré-consulta: cadastro, assinatura, documentos e bioimpedância', 'Gestão', 5),
  ('10000000-0000-0000-0000-000000000206', '10000000-0000-0000-0000-000000000001', 'Gestão', 'Conferir contrato, prontuário físico e entrega final antes da liberação', 'Gestão', 6),
  ('10000000-0000-0000-0000-000000000207', '10000000-0000-0000-0000-000000000001', 'Gestão', 'Acompanhar não adesões e direcionar receitas conforme regra interna', 'Gestão', 7),
  ('10000000-0000-0000-0000-000000000208', '10000000-0000-0000-0000-000000000001', 'Enfermagem', 'Conferir prescrições, materiais, EPIs, sala e identificação do paciente', 'Enfermagem', 8),
  ('10000000-0000-0000-0000-000000000209', '10000000-0000-0000-0000-000000000001', 'Enfermagem', 'Registrar medicações, procedimentos, intercorrências e descartes nos sistemas corretos', 'Enfermagem', 9),
  ('10000000-0000-0000-0000-000000000210', '10000000-0000-0000-0000-000000000001', 'Enfermagem', 'Atualizar acompanhamento de pacientes em tratamento, doses e bioimpedância', 'Enfermagem', 10),
  ('10000000-0000-0000-0000-000000000211', '10000000-0000-0000-0000-000000000001', 'Enfermagem', 'Conferir estoque de medicamentos: mínimos, vencimentos, compras e entrada no iClinic', 'Enfermagem', 11),
  ('10000000-0000-0000-0000-000000000212', '10000000-0000-0000-0000-000000000001', 'Enfermagem', 'Garantir instrumental esterilizado, descarte correto e DEA disponível', 'Enfermagem', 12),
  ('10000000-0000-0000-0000-000000000213', '10000000-0000-0000-0000-000000000001', 'Higienização / Limpeza', 'Classificar ambientes e executar limpeza concorrente ou terminal conforme criticidade', 'Limpeza', 13),
  ('10000000-0000-0000-0000-000000000214', '10000000-0000-0000-0000-000000000001', 'Higienização / Limpeza', 'Usar EPIs e saneantes corretos, inspecionar resultado e registrar checklist', 'Limpeza', 14),
  ('10000000-0000-0000-0000-000000000215', '10000000-0000-0000-0000-000000000001', 'Higienização / Limpeza', 'Conferir temperatura da geladeira e agir se houver leitura fora da faixa', 'Limpeza', 15),
  ('10000000-0000-0000-0000-000000000216', '10000000-0000-0000-0000-000000000001', 'Copa / Nutrição', 'Conferir validade, temperatura, bancada, mãos, luvas e insumos antes da oferta', 'Copa', 16),
  ('10000000-0000-0000-0000-000000000217', '10000000-0000-0000-0000-000000000001', 'Copa / Nutrição', 'Higienizar, montar, embalar, etiquetar e refrigerar alimentos imediatamente', 'Copa', 17),
  ('10000000-0000-0000-0000-000000000218', '10000000-0000-0000-0000-000000000001', 'Financeiro / Administrativo', 'Coletar comandas, receitas, comprovantes, contratos e documentos do crediário', 'Financeiro', 18),
  ('10000000-0000-0000-0000-000000000219', '10000000-0000-0000-0000-000000000001', 'Financeiro / Administrativo', 'Conferir valores, meios de pagamento, taxas, rendimentos e trava de caixa', 'Financeiro', 19),
  ('10000000-0000-0000-0000-000000000220', '10000000-0000-0000-0000-000000000001', 'Financeiro / Administrativo', 'Atualizar planilhas, PDCA Comercial, P12, NFS-e e arquivos no SharePoint', 'Financeiro', 20),
  ('10000000-0000-0000-0000-000000000221', '10000000-0000-0000-0000-000000000001', 'Financeiro / Administrativo', 'Validar compras institucionais: NF/invoice, comprovante, formulário, reembolso e destino', 'Financeiro', 21)
on conflict (id) do update
set grupo = excluded.grupo,
    descricao = excluded.descricao,
    responsavel = excluded.responsavel,
    ordem = excluded.ordem;
