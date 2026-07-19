---
id: "reviewing-individual-observations-and-tracks"
title: Revisando uma Observação
slug: /reviewing-individual-observations-and-tracks
sidebar_label: Revisando uma Observação
pagination_label: Revisando uma Observação
custom_edit_url: "https://www.notion.so/3131b08162d5807bb3b4d792fa2e41c2"
source: notion
notion_page_id: "3131b081-62d5-807b-b3b4-d792fa2e41c2"
notion_last_edited_time: "2026-04-22T03:58:00.000Z"
content_hash: "sha256:602a9f4c758f983c1fade32d882ef062465afb1f9aa1d3eb06f0a36327c3c2e8"
status: draft
locale: pt
section: "30-Reviewing Observations & Tracks"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/22/2026
  author: Awana Digital
sidebar_position: 11
---

---

[image]

# Revisando uma Observação

Para CoMapeo Mobile v8

## O que é uma Observação?

Uma **Observação** é um dado vinculado a uma categoria e a um único conjunto de coordenadas, representando um ponto no mapa. Ela pode conter várias informações para ajudar a contar uma história ou servir como evidência. As observações são coletadas no CoMapeo e constituem as principais fontes de dados, juntamente com as trilhas.

:::note 💡 Dica
É possível abrir uma observação para revisão selecionando-a no <img src="/images/notion/c3a90bf1bbc7f33b79ebc8060e2591c37c754808d7c30e3f9b9c27848ae5c11a.png" alt="app-icon-map" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Mapa ou a partir da    <img src="/images/notion/7c21b40338d78f5d968200f5691ad728105ded9078c76d63513cb934f75f1dc9.png" alt="app-icon-comapeo-observation-list" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Lista de Observações.

:::

## Porque revisar uma Observação?

Revise uma observação para ver todas as informações que foram registradas com ela. A revisão pode ajudar a confirmar detalhes, verificar evidências e garantir que os dados estejam completos e precisos.

## Quais informações constam em uma Observação?

### Informações adicionadas automaticamente

Essas informações provêm dos sensores do dispositivo, das configurações do dispositivo e do uso do aplicativo, e não podem ser modificadas.

<img src="/images/notion/16ad368673fa5ccbab0930b79526b9168194d8b4af5d94145d2d0d1088a5100b.png" alt="app-icon-coordinates" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Coordenadas e precisão**
A localização da observação é exibida em uma pré-visualização do mapa. Esse costuma ser o detalhe mais importante a ser incluído ao falar sobre ou compartilhar uma observação, especialmente com autoridades e especialistas em SIG.

**Carimbo de data e hora**

Essas informações provêm das configurações do sistema do dispositivo, no momento em que a observação foi coletada.

**Metadados da observação**

Trata-se de metadados associados às coordenadas registradas. Quando o GPS está ligado, esses metadados são capturados diretamente dos sensores e adicionam informações técnicas que podem ser de interesse para quem estiver realizando uma análise jurídica de uma observação. Há uma tela dedicada para exibir essas informações.

**Trilha correspondente**

Se a observação foi coletada enquanto uma trilha estava sendo gravada, o identificador de trilha também aparecerá.

### Informações adicionadas manualmente

- **Nome e ícone da categoria**

- **Descrição**
Notas adicionadas à área de texto

- **Detalhes**
Respostas do formulário **Detalhes** (se preenchido), que inclui campos de texto ou perguntas estruturadas associadas à categoria escolhida.

:::note 💡 Dica
Verifique se as informações adicionadas descrevem corretamente o que foi observado. Se for necessário revisar ou esclarecer alguma coisa, é possível editá-las.

Acesse: 🔗 [Editando um Observação](/docs/editing-observation)   

:::

### Mídia

Se forem adicionadas fotos ou arquivos de áudio a uma observação, eles serão automaticamente anexados a ela.

**Miniaturas e visualizações de fotos**

Todas as miniaturas das fotos tiradas serão exibidas em um carrossel horizontal.

**Metadados das fotos**

Uma tela que exibe os metadados associados a uma foto tirada com o CoMapeo.

**Miniaturas e reprodução de áudio**

Uma miniatura de áudio será exibida para cada gravação.

## Validação de dados no CoMapeo

É importante poder confiar nos dados, na sua origem e na garantia de que não foram adulterados, a fim de construir confiança nas ferramentas e nas metodologias de coleta de dados. Isso também pode ser fundamental se os dados forem admitidos em processos judiciais; nesse caso, as evidências devem ser rastreáveis e verificáveis, o que significa que você deve ser capaz de confirmar como, quando e onde os dados foram coletados.

Uma observação **validada pelo CoMapeo** possui coordenadas GPS e fotos registradas usando o CoMapeo, utilizadas como meio de reforçar sua prova. Para isso, o CoMapeo requer permissões relacionadas à localização e ao uso da câmera do dispositivo. Sem essas duas permissões, o CoMapeo ainda é capaz de coletar dados por meio de opções de entrada manual, mas eles são marcados como **observações não validadas**, pois o CoMapeo não pode garantir que tenham sido inseridos corretamente.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

[image]

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

**Metadados de observação** exibidos no CoMapeo sempre incluirão data e hora, coordenadas GPS, latitude e longitude

<img src="/images/notion/40312d1ed97f2d34a239df3607d553b3ec114c6e152b3d965f83622f610f41c9.jpg" alt="app-icon-comapeo-validated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Os metadados **validados** também exibirão precisão, altitude, precisão da altitude e velocidade.

<img src="/images/notion/ce98428d7b5a95769e79f2d5d6b604c49080d6a44cddc3d5675343022a06635f.jpg" alt="app-icon-comapeo-unvalidated" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Os metadados **não validados** exibirão *“ Esses dados foram inseridos manualmente”*, para garantir que fique claro que as coordenadas provêm de uma inserção manual, e não do GPS automático e verificável do telefone.

:::note
👉🏽 **Mais:** Se a inserção manual de coordenadas foi usada ao salvar, a maioria dos metadados de GPS não estará disponível e haverá uma indicação de que a observação não está validada

:::

:::note
👉🏽 **Dica**:  Para compartilhar os metadados da observação com alguém que esteja auxiliando sua equipe, use <img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Compartilhar.**  Escolha entre E-mail e WhatsApp para abrir um rascunho de mensagem formatado, pronto para enviar.

:::

**Os metadados da foto** são informações capturadas por um smartphone e são específicas para cada foto tirada. Eles são exibidos abaixo da foto.

Se houver dúvida sobre a validade de uma foto em uma observação, os metadados da foto podem ser incluídos como prova. Esses metadados incluem:

- Data e hora

- Coordenadas GPS da fotografia

- Metadados do dispositivo: tipo de dispositivo, detalhes da câmera, incluindo abertura, e tamanho da foto

- ID da observação

- ID do dispositivo

[image]

Abrir <img src="/images/notion/b35b1e92faac791f33d53e95647b72bb9970dfb3f28c0e19e429a897532d0c71.png" alt="down-toggle" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> **Validado pelo CoMapeo** para visualizar detalhes adicionais que indicam a proximidade, em tempo e distância, entre o momento em que a foto foi tirada e o momento em que a observação foi salva. 

[image]

:::note 💡 Dica
Para capturar todas as informações disponíveis em uma única imagem, use a opção, <img src="/images/notion/e032792d505125862bdd6fb70de0c69b6df8b7cd3868d6da3f02b057599ab84a.jpg" alt="android-extend-capture" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> e role para baixo, que aparece temporariamente após fazer uma captura de tela.

![image](assets/a70160a1f2769c2b393189235d4d5c30e10bb1a201a422946f8a71586bd0948d.png)

:::

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

## Mais ações disponíveis

<img src="/images/notion/1e513871ec012d90a9f11451bb7284263ceb07cbf1ed7d13991db190473acf23.png" alt="app-icon-edit" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Editar uma observação

<img src="/images/notion/17a190b42457d2770b82a1091bb0781e974210318bd801fccb29ac1c3e10ed6a.svg" alt="app-icon-delete" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Deletar uma observação

<img src="/images/notion/a419d3830b128d8df965e5057ab5ad45c01336f9ea2bead41c8ac4a2971ceef4.png" alt="app-icon-share" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Compartilhar uma observação

## Conteúdo relacionado

Acesse 🔗 [Editando uma observação](https://www.notion.so/docs/editing-observation)

Ir para 🔗 [Compartilhamento de uma única observação e metadados](/pt/docs/sharing-a-single-observation-and-metadata)

Ir para 🔗 [Solução de problemas: Observações e trilhas](/pt/docs/troubleshooting-observations-and-tracks)

Ir para 🔗 [Solução: Verificar permissões do aplicativo](https://www.notion.so/Reviewing-an-Observation-26a1b08162d58074948dd100af9095aa)

### **Está tendo problemas?**

Acesse 🔗[Solução de problemas: Observações e trilhas](/pt/docs/troubleshooting-observations-and-tracks)

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
