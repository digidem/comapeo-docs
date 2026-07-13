---
id: "understanding-how-exchange-works"
title: Entendendo Como a Troca Funciona
slug: /understanding-how-exchange-works
sidebar_label: Entendendo Como a Troca Funciona
pagination_label: Entendendo Como a Troca Funciona
custom_edit_url: "https://www.notion.so/2621b08162d58197a344ffe20d8a8ecc"
source: notion
notion_page_id: "2621b081-62d5-8197-a344-ffe20d8a8ecc"
notion_last_edited_time: "2026-04-22T03:58:00.000Z"
content_hash: "sha256:db3f5776a3e5e9829871dfa359c556fa839b19cc6ae431b530298738bfb7cd0b"
status: draft
locale: pt
section: "60-Exchanging Observations"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/22/2026
  author: Awana Digital
sidebar_position: 1
---
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

:::note 🖼️
static/images/understandinghowexch_0.jpg

:::

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

## O que é Trocar no CoMapeo?

**Trocar** é a característica principal do CoMapeo, que permite que os dados viajem com segurança para todos os dispositivos conectados que fazem parte do mesmo projeto. Isso ajuda a garantir que todos em um projeto tenham as mesmas informações.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

- Isso permite que as edições nas observações e nos registros sejam atualizadas para todos os colegas de equipe.

- As informações atualizadas do projeto, incluindo o conjunto de categorias mais recente, serão compartilhadas com os colegas de equipe para que todos utilizem as mesmas categorias e modelos de detalhes.

**Que tipo de dados são trocados?**

:::note 🖼️
static/images/understandinghowexch_1.jpg

:::

- Informação do Projeto
  - Nome e descrição
  - Equipe (Nomes dos dispositivos e funções)
  - Conjunto de categorias atuais
  - Configurações de arquivo remoto (se utilizado)

- Informações coletadas
  - Observações (com mídia associada e metadados)
  - Trilhas

**E se houver um conflito de dados?**

Um conflito de dados ocorre quando dois ou mais colegas de equipe fazem uma edição na mesma observação ou trilha. Por exemplo, uma pessoa altera a categoria de uma observação ou trilha, enquanto a outra responde a uma pergunta adicional nos detalhes da observação.

Isso também pode acontecer se dois coordenadores de projeto diferentes importarem categorias personalizadas distintas. No caso **incomum e raro** de isso ocorrer, a última edição feita será a alteração que aparecerá após a sincronização.

:::note ⚠️ Aviso
A edição anterior será perdida.

:::

### Quais conexões o CoMapeo utiliza?

**Conexões offline são possíveis com um roteador que fornece Wi-Fi local.**

Esta funcionalidade foi projetada para pessoas em áreas remotas onde a conexão com a internet é limitada ou não está disponível. Isso significa que os colegas de equipe podem trocar dados quando estão juntos, não importando em qual lugar do mundo estejam.

:::note 💡
Um roteador serve como uma ponte sem fio entre dispositivos conectados a ele, mesmo quando não está conectado à internet.

:::

Acesse: 🔗[Usando o Exchange offline](/pt/docs/using-exchange-offline)

**Conexões online são possíveis com a configuração de um servidor local**

Para projetos que exigem trocas mais frequentes do que atividades presenciais são possíveis, introduzimos o *Arquivo Remoto* que permite adicionar um endereço de servidor a configurações específicas do projeto no CoMapeo.

Acesse: 🔗[Usando um Arquivo Remoto](https://notion.so/docs/using-a-remote-archive)

### Entendendo Como a Troca Funciona

A função de Troca acontece detectando dispositivos pares que estão conectados *à mesma rede* e fazem parte *dos mesmos projetos* no CoMapeo. Ele permite que os dados do projeto sejam transferidos entre vários dispositivos, assim que um usuário toca em "iniciar". Ao final do processo, todos aqueles que trocaram dados poderão ver novas observações e trilhas coletadas por seus colegas de equipe na tela do mapa e na lista de observações.

:::note 💡 Dica
Os dados coletados com o CoMapeo só são transferidos para dispositivos que são membros dos respectivos projetos.

:::

:::note 👉🏽 Mais
Aprenda sobre como a associação a projetos é gerenciada

Acesse: 🔗[Gerenciando uma Equipe](https://notion.so/docs/managing-a-team)

:::

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

Não há nenhum servidor central hospedado pela Awana Digital ou por terceiros utilizado para fazer upload ou download dos dados coletados pelo CoMapeo nem de outros dados do Projeto.

Consulte 🔗 [Política de Privacidade de Dados do CoMapeo](https://www.notion.so/CoMapeo-Data-Privacy-d8f413bbbf374a2092655b89b9ceb2b0)  para saber mais

Em vez disso, os dados do projeto são distribuídos a todos os membros da equipe que utilizam o recurso Trocar. Isso significa que os dados coletados como parte de uma equipe são dados coletivos visíveis a todos os membros do mesmo projeto, juntamente com quaisquer configurações atualizadas do projeto. Esse tipo de distribuição descentralizada de dados em uma equipe oferece a vantagem de ter um backup das informações em todos os dispositivos que trocam dados regularmente.

:::note 💡 Dica
Existem configurações de troca que permitem selecionar entre o recebimento de imagens em tamanho completo ou em tamanho de pré-visualização para gerenciar a quantidade de mídia armazenada em um dispositivo.

Acesse: 🔗[Ajustando Configurações de Troca](/pt/docs/understanding-how-exchange-works) para instruções

:::

A Troca permite que os membros da equipe transfiram dados de forma segura entre si, desde que façam parte do mesmo projeto.

Acesse: 🔗[Criptografia & Segurança](/pt/docs/encryption-and-security) para aprender mais sobre os mecanismos técnicos que tornam a Troca dos dados segura no CoMapeo.

## Ajustando Configurações de Troca

A função de Troca no CoMapeo cria uma redundância intencional de informações ao clonar os dados coletados em todos os dispositivos que participam dessa troca. Um dispositivo sempre receberá miniaturas e imagens em tamanho de visualização associadas às observações para visualizá-las no aplicativo. A **Configuração de Troca** determina se as imagens em tamanho real estão incluídas ou não na "solicitação" quando a Troca começa.

**“Apenas Visualizações” na Troca**

O armazenamento de arquivos de mídia pode ser uma preocupação para pessoas com espaço de armazenamento limitado no dispositivo ou para todos os participantes de projetos em que uma equipe está coletando um grande volume de observações. Nesses casos, manter as configurações da Troca como “apenas visualizações” ajudará a reduzir a quantidade de espaço de armazenamento que o CoMapeo utiliza nos dispositivos individuais.

::::note 👁️
:::note 🖼️
static/images/understandinghowexch_2.jpg

:::

::::

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

**Trocar Tudo**

No entanto, em alguns casos, pode ser essencial que alguns dispositivos tenham acesso às imagens em resolução completa. Isso é importante para pessoas com funções que envolvem o envio de evidências ou o relato de volta às suas comunidades ou autoridades locais.

Miniaturas e visualizações de fotos em observações ainda são trocadas quando esta configuração é selecionada

::::note 👁️
:::note 🖼️
static/images/understandinghowexch_3.jpg

:::

::::

:::note 🖼️
static/images/understandinghowexch_4.jpg

:::

:::note 👣
### Passo a passo

***Passo 1:*** Na tela de Trocar, toque em **Mudar Configurações**

---

***Passo 2:*** Selecione **Trocar Tudo** ou **Trocar Apenas Visualizações**

---

***Passo 3:*** Toque em **Salvar** para retornar à tela de Trocar

---

:::

## Múltiplos Projetos & Troca

:::note 🖼️
static/images/understandinghowexch_5.gif

:::

**A Troca funciona de forma segura com Múltiplos Projetos.**

O CoMapeo foi projetado para manter os dados seguros e organizados, mesmo ao usar um único dispositivo para mais de um projeto.

Os dados não são transferidos entre projetos e não serão misturados ou modificados se vários projetos estiverem sendo usados em qualquer dispositivo.

Acesse: 🔗[Entendendo Projetos → Múltiplos projetos](/pt/docs/understanding-projects#multiple-projects)

---

## Conteúdo Relacionado

Acesse: 🔗[Usando o Exchange offline](/pt/docs/using-exchange-offline)

Acesse: 🔗[Usando um Arquivo Remoto](https://notion.so/docs/using-a-remote-archive)

Acesse: 🔗[Criptografia & Segurança](/pt/docs/encryption-and-security)

### **Tendo problemas?**

Acesse: 🔗[Solução de Problemas: Mapeamento com Colaboradores](/pt/docs/troubleshooting-mapping-with-collaborators)

Vá para 🔗[Solução de Problemas: Mapeamento com Colaboradores -> Problemas de Troca](/pt/docs/troubleshooting-mapping-with-collaborators#exchange-problems)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
