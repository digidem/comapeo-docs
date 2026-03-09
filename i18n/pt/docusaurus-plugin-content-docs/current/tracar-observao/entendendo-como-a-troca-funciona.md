---
id: doc-entendendo-como-a-troca-funciona
title: Entendendo Como a Troca Funciona
sidebar_label: Entendendo Como a Troca Funciona
sidebar_position: 2
pagination_label: Entendendo Como a Troca Funciona
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/tracar-observao/entendendo-como-a-troca-funciona.md
keywords:
  - docs
  - comapeo
tags: []
slug: /entendendo-como-a-troca-funciona
last_update:
  date: 3/9/2026
  author: Awana Digital
---

---


[Insert content here]


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


---


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


# Entendendo Como a Troca Funciona


:::note 🖼️
static/images/understandinghowexch_0.jpg
:::
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


## O que é Exchange no CoMapeo?


**Exchange**é a característica principal do CoMapeo que permite que os dados viajem com segurança para todos os dispositivos conectados que fazem parte do mesmo projeto. Isso ajuda a garantir que todos em um projeto tenham as mesmas informações.


**Que dados são trocados?**


:::note 🖼️
static/images/understandinghowexch_1.jpg
:::
- informações do projeto (nome e descrição)
- dados da equipe
- observações (com mídia e metadados associados)
- faixas
- conjuntos de categorias atuais
- Configurações de arquivo remoto (se usado)

**E se houver um conflito de dados?**


Um conflito de dados ocorre quando dois ou mais colegas de equipe têm informações diferentes armazenadas em seus dispositivos sobre um item de dados específico. No**incomum e raro**caso que isso ocorra, o CoMapeo usa o**timestamp**associado ao item de dados em questão e seleciona o mais recente como a solução para o conflito de dados.

- Isso permite que as edições de observações sejam atualizadas com os colegas de equipe durante a troca.
- O conjunto de Categorias mais recente será trocado com os colegas de equipe para que todos estejam usando a versão mais recente disponível.

### Quais conexões o CoMapeo utiliza?


**Conexões offline são possíveis com um roteador que fornece Wi-Fi local.**


Esta funcionalidade foi projetada para pessoas em áreas remotas onde a conexão com a internet é limitada ou não está disponível. Isso significa que os colegas de equipe podem trocar dados quando estão juntos, não importa onde no mundo estejam.


:::note 💡
Um roteador serve como uma ponte sem fio entre dispositivos conectados a ele, mesmo quando não está conectado à internet.
:::
Vá para 🔗[**Usando o Exchange offline**](https://notion.so/docs/using-exchange-offline)


**Conexões online são possíveis com a configuração de um servidor local**


Para projetos que exigem trocas mais frequentes do que atividades presenciais são possíveis, introduzimos_Arquivamento Remoto_que permite adicionar um endereço de servidor a configurações específicas do projeto no CoMapeo


Vá para 🔗[**Usando um Arquivo Remoto**](https://notion.so/docs/using-a-remote-archive)


### Entendendo Como a Troca Funciona


O Exchange funciona detectando dispositivos pares que estão conectados à mesma rede e fazem parte dos mesmos projetos no CoMapeo. Ele permite que os dados do projeto sejam transferidos entre vários dispositivos, assim que um usuário toca em "iniciar". Ao final do processo, todos aqueles que trocaram dados poderão ver novas observações e trilhas coletadas por seus colegas de equipe na tela do mapa e na lista de observações.


> 💡 **Dica:**Os dados coletados com o CoMapeo só são transferidos para dispositivos que são membros dos respectivos projetos.


> 👉🏽 **Mais:**Aprenda sobre como a associação a projetos é gerenciada  
> Vá para 🔗[**Gerenciando uma Equipe**](https://notion.so/docs/managing-a-team)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


Não há um servidor central hospedado pela Awana Digital ou por terceiros usado para fazer upload nem download dos dados coletados pelo CoMapeo (entre outros dados do Projeto). (Saiba mais sobre a Política de Privacidade de Dados do CoMapeo Link).


Em vez disso, os dados do projeto são distribuídos para cada colega de equipe que usa o recurso Exchange. Isso significa que os dados coletados como parte de uma equipe são dados coletivos visíveis para todos os membros do mesmo projeto, juntamente com quaisquer configurações atualizadas do projeto. Esse tipo de distribuição descentralizada de dados em uma equipe oferece o benefício de ter um backup das informações em todos os dispositivos que fazem troca regularmente.


> 💡 **Dica:**Existem configurações de troca que permitem selecionar entre o recebimento de imagens em tamanho completo ou em tamanho de pré-visualização para gerenciar a quantidade de mídia armazenada em um dispositivo.  
> Vá para 🔗**Ajustando Configurações de Troca**para instruções


O Exchange permite que colaboradores transfiram dados de forma segura entre si, desde que façam parte do mesmo projeto.


Vá para 🔗[**Criptografia & Segurança**](https://notion.so/docs/encryption-and-security)**t**para aprender mais sobre os mecanismos técnicos que tornam o Exchange seguro no CoMapeo


## Ajustando Configurações de Troca


O Exchange no CoMapeo cria redundância intencional de informações ao clonar os dados coletados em todos os dispositivos que participam do Exchange. Um dispositivo sempre receberá miniaturas e imagens em tamanho de visualização associadas às observações para visualizá-las no aplicativo.**Configuração de Troca**determina se as imagens em tamanho real estão incluídas na "solicitação" quando a Troca começa.


**Exchange Previews Only**


O armazenamento de mídia pode ser uma preocupação para indivíduos com armazenamento limitado no dispositivo, ou para todos em projetos onde uma equipe está coletando um grande volume de observações. Nesses casos, manter as configurações de troca como "somente visualizações" ajudará a reduzir a quantidade de armazenamento que o CoMapeo usa nos dispositivos individuais.


:::note 🖼️
👁️ > 🖼️ static/images/understandinghowexch_2.jpg
:::
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


**Troque Tudo**


No entanto, em alguns casos, pode ser essencial que alguns dispositivos tenham acesso às imagens em resolução completa. Isso é importante para pessoas com funções que envolvem o envio de evidências ou o relato de volta às suas comunidades ou autoridades locais.


Miniaturas e visualizações de fotos em observações ainda são trocadas quando esta configuração é selecionada


:::note 🖼️
👁️ > 🖼️ static/images/understandinghowexch_3.jpg


🖼️ static/images/understandinghowexch_4.jpg


### 👣 Passo a passo

_**Passo 1:**_Na tela de Exchange, toque em**Alterar Configurações**

---

_**Passo 2:**_Selecione de**Troque Tudo**ou**Exchange Previews Only**

---

_**Passo 3:**_Toque**Salvar**para retornar à tela de Exchange

---
:::
## Múltiplos Projetos & Troca


:::note 🖼️
static/images/understandinghowexch_5.gif
:::
**O Exchange funciona de forma segura com Múltiplos Projetos.**


O CoMapeo foi projetado para manter os dados seguros e organizados, mesmo ao usar um único dispositivo para mais de um projeto.


Os dados não são transferidos entre projetos e não serão misturados ou modificados se vários projetos estiverem sendo usados em qualquer dispositivo.


Vá para 🔗[**Entendendo Projetos → Múltiplos projetos**](https://notion.so/docs/understanding-projects/#multiple-projects)


---


## Conteúdo Relacionado


Vá para 🔗[**Usando o Exchange offline**](https://notion.so/docs/using-exchange-offline)


Vá para 🔗[**Usando um Arquivo Remoto**](https://notion.so/docs/using-a-remote-archive)


Vá para 🔗[**Criptografia & Segurança**](https://notion.so/docs/encryption-and-security)


### **Tendo problemas?**


Vá para 🔗[**Solução de Problemas: Mapeamento com Colaboradores**](https://notion.so/docs/troubleshooting-mapping-with-collaborators)


Vá para 🔗[**Solução de Problemas: Mapeamento com Colaboradores -> Problemas de Troca**](https://notion.so/docs/troubleshooting-mapping-with-collaborators#exchange-problems)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

