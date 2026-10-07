# Beta 01 — fotógrafo real

Estado: **preparado; coleta não iniciada**. Nenhum resultado humano foi medido.

Dependência registrada: o usuário informou que não possui as imagens. Próximo passo: obter a participação de um fotógrafo com um ensaio/casamento real de 500–2000 fotos e disponibilidade para fazer as duas seleções. O teste pode ocorrer no computador do fotógrafo, preservando o acervo local; coletar listas de IDs, tempos e anotações. Nenhum contato foi realizado.

Texto sugerido para convite: “Estamos preparando o primeiro beta da ClickIT com um fotógrafo e um trabalho real de 500–2000 fotos. Você faria primeiro sua seleção habitual, sem ver a ClickIT, e depois revisaria a seleção do aplicativo. Vamos registrar concordâncias, erros, trocas e tempo gasto, sem mudar o algoritmo durante a rodada. As fotos podem permanecer no seu computador. Você teria um trabalho e disponibilidade para participar?”

Objetivo: comparar a seleção independente de um fotógrafo com a seleção original da ClickIT em um único ensaio ou casamento real de 500–2000 fotos. Primeiro coletar evidência; não alterar algoritmo durante o teste.

## 1. Preparação e congelamento

- Identificar fotógrafo, trabalho, pasta, data, quantidade de fotos únicas e formatos. Não completar o lote com réplicas ou imagens sintéticas.
- Definir o objetivo da seleção e eventual quantidade desejada antes das duas seleções. Usar o mesmo conjunto de arquivos e o mesmo objetivo.
- Atribuir a cada foto um ID estável (caminho relativo e SHA-256). Registrar falhas de leitura; não excluir silenciosamente arquivos do denominador.
- Arquivar versão da aplicação, configurações, modelos e seus hashes, código e build usados. Nesta pasta não há repositório Git disponível: registrar hashes e uma cópia do código/build, sem inventar um commit.
- Congelar ranking, pesos, thresholds, modelos, agrupamento e configurações. Registrar o estado do cache e o computador usado.
- Definir antes da execução qual saída da ClickIT representa a seleção sugerida. Salvar essa lista e o ranking completo por grupo antes de qualquer interação do fotógrafo. Não escolher posteriormente a variante que melhor coincida com o humano.
- Guardar os artefatos em uma pasta própria do ensaio, mantendo os arquivos originais. A ficha abaixo é um modelo, não evidência de execução.

## 2. Ordem do teste

1. O fotógrafo faz sua seleção normal sem ver sugestões, scores ou agrupamentos da ClickIT. Cronometrar do início da revisão até a seleção final; registrar pausas, software e critério de conclusão.
2. Salvar e fechar a lista humana independente **H** antes de mostrar qualquer resultado da ClickIT. Registrar horário e hash do arquivo. Nenhuma anotação humana alimenta a análise.
3. Executar a ClickIT separadamente sobre o mesmo lote. Salvar a seleção original **C**, scores, alertas, grupos, ranking completo, falhas e tempos de processamento. Registrar horário e hashes.
4. O fotógrafo revisa as sugestões até chegar à seleção final assistida **F**. Cronometrar revisão e registrar cada inclusão, remoção e troca, com IDs e motivo. Não sobrescrever C ou H.
5. Auditar todas as fotos, inclusive as não sugeridas, para identificar boas omitidas e ruins incluídas. Registrar qualidade como boa, ruim ou incerta e o motivo. Não inferir qualidade apenas pela ausência em H.
6. Anotar sequências reais e a melhor foto humana de cada sequência, sem consultar ranking ou grupos automáticos. Preferencialmente fazer isso após fechar H e antes de revelar C, com cronômetro separado da seleção normal.
7. Comparar as listas e consolidar os incidentes. Encerrar e arquivar o relatório antes de propor ajustes.

Se um defeito impedir o teste, registrar a falha e interromper a rodada. Uma correção exige nova versão e nova rodada identificada; preservar a evidência anterior.

## 3. Métricas e denominadores

Usar conjuntos de IDs únicos; duplicações de registro não contam como novas escolhas. Reportar contagem e percentual. Denominador zero ou anotação ausente produz **N/A**, nunca zero fabricado.

| Medida | Definição |
| --- | --- |
| Escolhas coincidentes | quantidade de fotos em H ∩ C |
| Escolhas humanas omitidas | quantidade em H − C |
| Sugestões fora da seleção humana | quantidade em C − H; discordância não implica foto ruim |
| Recall das escolhas humanas | tamanho de H ∩ C / tamanho de H |
| Precisão das sugestões | tamanho de H ∩ C / tamanho de C |
| Boas fotos omitidas | fotos avaliadas como boas fora de C, mesmo que não estejam em H |
| Ruins incluídas | fotos avaliadas como ruins dentro de C |
| Erros confirmados de seleção | união das boas omitidas e ruins incluídas; reportar os dois componentes |
| Ajustes finais | inclusões F − C e remoções C − F |
| Trocas realizadas | eventos explícitos de substituição com ID retirado e ID incluído; não estimar pelo mínimo de inclusões e remoções |

Qualidade incerta fica em contagem separada. Incidentes de olhos, foco e agrupamento podem afetar a mesma foto: não somar categorias como se fossem fotos distintas. Reportar também a quantidade de fotos únicas afetadas.

### Top 1 e Top 3 por sequência

Usar sequências de referência definidas pelo fotógrafo, com IDs e uma melhor foto humana por sequência. Se houver empate humano, registrar previamente o conjunto de melhores aceitas.

Para cada sequência de referência, mapear os grupos automáticos pela participação de suas fotos. Uma correspondência válida exige um único grupo contendo exatamente os mesmos IDs. Dentro desse grupo, usar a ordem original da ClickIT, com o desempate original preservado.

- **Top 1:** sequências cuja primeira sugestão é uma das melhores humanas / sequências elegíveis.
- **Top 3:** sequências em que ao menos uma melhor humana está entre as primeiras min(3, tamanho da sequência) sugestões / sequências elegíveis.
- Sequências elegíveis têm pelo menos duas fotos e preferência humana anotada. Reportar isoladas e sem anotação separadamente.
- No resultado principal, grupo fundido, sequência quebrada ou análise ausente conta como falha para a sequência elegível, preservando o denominador humano.
- Reportar adicionalmente Top 1/Top 3 apenas nas correspondências válidas, com denominador explícito, e a cobertura de agrupamento (correspondências válidas / elegíveis). Isso permite interpretar ranking e agrupamento separadamente.
- Mostrar os acertos sobre sequências de 2–3 fotos separadamente: Top 3 pode ser trivial nesses casos.

## 4. Diagnóstico de erros

Auditar olhos e desfoque com rótulo humano independente e alerta original da ClickIT. Para cada categoria registrar verdadeiro positivo, falso positivo, falso negativo e verdadeiro negativo. Usar “não avaliável” quando rosto/olhos não forem visíveis ou a imagem não permitir julgar; reportar a cobertura. Em retratos de grupo, registrar pessoa/rosto afetado e contar também fotos únicas.

| Categoria | Evidência por incidente |
| --- | --- |
| Olhos fechados | ID, rosto, rótulo humano, alerta original, acerto/FP/FN/TN/não avaliável |
| Desfoque | ID, foco esperado, rótulo humano, alerta original, movimento intencional ou falha técnica |
| Falso positivo | ID, categoria do alerta e motivo pelo qual o fotógrafo o considera incorreto |
| Agrupamento errado | grupo automático que fundiu sequências distintas; IDs dos grupos e sequências afetados |
| Sequência quebrada | sequência humana distribuída em vários grupos; IDs de todos os fragmentos |
| Foto artística penalizada | ID, intenção artística, alerta/score/posição original, julgamento humano e efeito observado na seleção |

Uma foto artística com score baixo é um caso a investigar; registrar a penalização observada sem atribuir causa não demonstrada. Se a auditoria for parcial, declarar amostra e cobertura; não apresentar totais da amostra como totais do ensaio.

## 5. Tempos

- **Sem ClickIT:** tempo ativo da seleção normal, excluindo pausas documentadas.
- **Com ClickIT — trabalho humano:** tempo ativo de preparação/importação e revisão até F.
- **Com ClickIT — decorrido:** tempo do início da preparação até F, incluindo processamento e espera; registrar sobreposições para não somar intervalos duas vezes.
- Registrar processamento automático, pausas e auditoria posterior separadamente.
- Economia de trabalho humano = 1 − tempo humano com ClickIT / tempo sem ClickIT. Reportar também a comparação de tempo decorrido; valores negativos significam aumento.

O fotógrafo verá o mesmo trabalho pela segunda vez na etapa assistida. Registrar o intervalo entre etapas e essa limitação de memória/familiaridade; o Beta 01 não isola sozinho o efeito causal sobre velocidade.

## 6. Ficha do ensaio (preencher ao executar)

| Campo | Registro |
| --- | --- |
| ID da rodada / data / responsável | PENDENTE |
| Fotógrafo / ensaio ou casamento / pasta | PENDENTE |
| Total único / formatos / falhas de leitura | PENDENTE |
| Objetivo e tamanho desejado da seleção | PENDENTE |
| Versão, hashes, configurações, modelos e computador | PENDENTE |
| Caminhos e hashes de manifesto, H, C e F | PENDENTE |
| Início/fim/pausas da seleção normal | PENDENTE |
| Início/fim/pausas da preparação, processamento e revisão assistida | PENDENTE |
| Intervalo entre etapas / interrupções | PENDENTE |
| Sequências humanas / grupos automáticos / ranking original | PENDENTE |
| Log de inclusões, remoções e trocas com horários e motivos | PENDENTE |
| Auditoria por foto e por rosto, qualidade e incidentes | PENDENTE |
| Totais H / C / F / coincidências / omissões / discordâncias | PENDENTE |
| Recall / precisão (numerador e denominador) | PENDENTE |
| Top 1 / Top 3 principais e condicionais / cobertura | PENDENTE |
| Boas omitidas / ruins incluídas / qualidade incerta | PENDENTE |
| Inclusões / remoções / eventos de troca | PENDENTE |
| Olhos e desfoque: TP / FP / FN / TN / não avaliáveis | PENDENTE |
| Grupos fundidos / sequências quebradas / fotos artísticas penalizadas | PENDENTE |
| Tempos normal, humano assistido, decorrido e economia | PENDENTE |
| Limitações / falhas / observações do fotógrafo | PENDENTE |

Fechamento: confirmar que H foi salva antes da exposição, C antes da revisão, o lote é real e independente, e a versão permaneceu congelada. Sem esses registros, declarar a limitação. Não há limiar de aprovação definido: publicar resultados observados e exemplos rastreáveis, sem declarar sucesso antecipadamente.
