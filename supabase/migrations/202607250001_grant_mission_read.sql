-- RLSは行単位の公開条件を絞る。Data APIからその条件を評価できるよう、
-- missionsの読取権限だけを公開クライアントへ付与する。
grant select on table public.missions to anon, authenticated;

-- answersには直接権限を付与しない。回答はsubmit_answer RPCだけを通す。
