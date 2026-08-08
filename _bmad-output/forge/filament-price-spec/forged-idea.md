# Filament Price — Forged MVP

Fonte da verdade do MVP. `docs/raw_plan.md` = rascunho técnico a cortar.

## Produto
- Busca geral multi-loja de filamento no Brasil (BRL, pt-BR).
- Valor: lojas especializadas fora do ML + taxonomia (tipo, R$/kg) — não frete, não vitrine.
- Dia-1 = ofertas pesquisáveis; catálogo canônico maduro = direção, não barreira.
- ML fora do MVP. Mínimo lançável: 5 lojas especializadas BR.

## Merge / taxonomia
- Chave: marca + tipo específico + peso. Cor fora.
- Tipos separados (PETG ≠ PETG HF ≠ Rapid PETG).
- Busca na família-pai (ex. PETG) inclui todos os subtipos; tipo específico visível/filtrável.
- Sem AI no match do MVP.

## Preço / UI
- Frete 100% fora; ranking = preço do anúncio + disclaimer.
- Sem imagens de produto. Loja = só nome (sem logos). UI direta, objetiva, densa.

## Scrape
- Engine determinística + mapa/playbook por loja versionado no repo.
- AI só offline (gera/atualiza mapa). Zero LLM no job de scrape.
- Loja ativa só após homologação (fixtures). Quebrou → unsupported; sem bypass anti-bot (§81).

## Rejeitado
- Catálogo canônico maduro como requisito de lançamento.
- Frete no ranking; imagens/logos; ML no MVP.
- Adapter artesanal como único modelo; LLM em runtime; auto-reparo de mapa em produção.

## Ainda aberto
- Diâmetro na chave de merge.
- Lista das 5 lojas; formato exato do mapa; monetização/afiliado.
