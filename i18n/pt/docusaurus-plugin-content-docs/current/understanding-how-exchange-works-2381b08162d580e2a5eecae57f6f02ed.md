# Entendendo Como o Exchange Funciona

![](/images/understandinghowexch_0.jpg)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

## O que é o Exchange no CoMapeo?

**Exchange** é o recurso principal do CoMapeo que permite que os dados viajem com segurança para todos os dispositivos conectados que fazem parte do mesmo projeto. Isso ajuda a garantir que todos em um projeto tenham as mesmas informações.

**Quais dados são trocados?**

![](/images/understandinghowexch_1.jpg)

- informações do projeto (nome e descrição)
- dados da equipe
- observações (com mídia e metadados associados)
- trilhas
- conjuntos de categorias atuais
- configurações de arquivo remoto (se usado)

**E se houver um conflito de dados?**

Um conflito de dados ocorre quando dois ou mais colegas de equipe têm informações diferentes armazenadas em seus dispositivos sobre um item de dados específico. No **caso incomum e raro** em que isso ocorre, o CoMapeo usa o **timestamp** associado ao item de dados em questão e escolhe o mais recente como solução para o conflito de dados.

- Isso permite que as edições de observações sejam atualizadas com os colegas de equipe durante a troca.
- O conjunto de categorias mais recente será trocado com os colegas de equipe para que todos usem a versão mais recente disponível.

### Quais conexões o CoMapeo usa?

**Conexões offline são possíveis com um roteador que fornece Wi-Fi local.**

Essa funcionalidade foi projetada para pessoas em áreas remotas onde a conexão com a internet é limitada ou não está disponível. Isso significa que os colegas de equipe podem trocar dados quando estão juntos, não importa onde no mundo estejam.

> 💡 Um roteador serve como uma ponte sem fio entre dispositivos conectados a ele, mesmo quando não está conectado à internet.

Vá para 🔗 [**Usando o Exchange offline**](/docs/using-exchange-offline)

**Conexões online são possíveis com a configuração de um servidor local**

Para aqueles projetos que exigem Exchange com mais frequência do que as atividades presenciais são possíveis, introduzimos o _Arquivamento Remoto_ que permite adicionar um endereço de servidor às configurações específicas do projeto no CoMapeo.

Vá para 🔗 [**Usando um Arquivo Remoto**](/docs/using-a-remote-archive)

### Entendendo Como o Exchange Funciona

O Exchange funciona detectando dispositivos pares que estão conectados à mesma rede e fazem parte dos mesmos projetos no CoMapeo. Ele permite que os dados do projeto sejam transferidos entre vários dispositivos, uma vez que um usuário toca em "iniciar". No final do processo, todos aqueles que trocaram dados poderão ver novas observações e trilhas coletadas por seus colegas de equipe na tela do mapa e na lista de observações.

> 💡 **Dica:** Os dados coletados com o CoMapeo só viajam para dispositivos que são membros dos respectivos projetos.

> 👉🏽 **Mais:** Saiba como a associação a projetos é gerenciada
> Vá para 🔗 [**Gerenciando uma Equipe**](/docs/managing-a-team)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

Não há um servidor central hospedado pela Awana Digital ou por terceiros usado para fazer upload nem download de dados coletados pelo CoMapeo (entre outros dados do Projeto). (Saiba mais sobre a Política de Privacidade de Dados do CoMapeo {Link}).

Em vez disso, os dados do projeto são distribuídos para cada colega de equipe que usa o recurso Exchange. O que isso significa é que os dados coletados como parte de uma equipe são dados coletivos visíveis a todos que são membros do mesmo projeto, juntamente com quaisquer configurações atualizadas do projeto. Esse tipo de distribuição descentralizada de dados em uma equipe oferece o benefício de ter um backup das informações em todos os dispositivos que trocam regularmente.

> 💡 **Dica:** Existem configurações de troca que permitem selecionar entre o recebimento de imagens em tamanho completo ou imagens em tamanho de visualização para gerenciar a quantidade de mídia armazenada em um dispositivo.
> Vá para 🔗 [**Ajustando as Configurações do Exchange**](#ajustando-as-configurações-do-exchange)[ ](#ajustando-as-configurações-do-exchange)para instruções

O Exchange permite que colaboradores transfiram dados com segurança entre si, desde que façam parte do mesmo projeto.

Vá para 🔗 [**Criptografia e Segurança**](/docs/encryption-and-security)  **para** saber mais sobre os mecanismos técnicos que tornam o Exchange seguro no CoMapeo

## Ajustando as Configurações do Exchange

O Exchange no CoMapeo cria redundância intencional de informações ao clonar os dados coletados em todos os dispositivos que participam do Exchange. Um dispositivo sempre receberá miniaturas e imagens em tamanho de visualização com as observações às quais estão associadas para visualizá-las no aplicativo. A **Configuração do Exchange** determina se as imagens em tamanho completo são incluídas na "solicitação" quando o Exchange começa.

**Exchange Apenas Visualizações**

O armazenamento de mídia pode ser uma preocupação para indivíduos com armazenamento limitado no dispositivo ou para todos em projetos onde uma equipe está coletando um grande volume de observações. Nesses casos, manter as configurações de troca como "apenas visualizações" ajudará a reduzir a quantidade de armazenamento que o CoMapeo usa em dispositivos individuais.

> 👁️ ![](/images/understandinghowexch_2.jpg)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

**Exchange Tudo**

No entanto, em alguns casos, pode ser essencial que alguns dispositivos tenham acesso às imagens em resolução completa. Isso é importante para pessoas com funções que envolvem apresentar evidências ou relatar de volta às suas comunidades ou autoridades locais.

Miniaturas e visualizações de fotos em observações ainda são trocadas quando essa configuração é selecionada.

> 👁️ ![](/images/understandinghowexch_3.jpg)

![](/images/understandinghowexch_4.jpg)

> ### 👣 Passo a passo  
>   
> _**Passo 1:**_ Na tela do Exchange, toque em **Alterar Configurações**  
>   
> ---  
>   
> _**Passo 2:**_ Selecione entre **Exchange Tudo** ou **Exchange Apenas Visualizações**  
>   
> ---  
>   
> _**Passo 3:**_ Toque em **Salvar** para retornar à tela do Exchange  
>   
> ---

## Múltiplos Projetos e Exchange

![](/images/understandinghowexch_5.gif)

**O Exchange funciona com segurança com Múltiplos Projetos.**

O CoMapeo é projetado para manter os dados seguros e organizados, mesmo ao usar um único dispositivo para mais de um projeto.

Os dados não são transferidos entre projetos e não serão misturados ou modificados se vários projetos estiverem sendo usados em qualquer dispositivo.

Vá para 🔗 [**Entendendo Projetos → Múltiplos projetos**](/docs/understanding-projects/#multiple-projects)

---

## Conteúdo Relacionado

Vá para 🔗 [**Usando o Exchange offline**](/docs/using-exchange-offline)

Vá para 🔗 [**Usando um Arquivo Remoto**](/docs/using-a-remote-archive)

Vá para 🔗 [**Criptografia e Segurança**](/docs/encryption-and-security)

### **Com problemas?**

Vá para 🔗 [**Solução de Problemas: Mapeamento com Colaboradores**](/docs/troubleshooting-mapping-with-collaborators)

Vá para 🔗 [**Solução de Problemas: Mapeamento com Colaboradores -> Problemas de Exchange**](/docs/troubleshooting-mapping-with-collaborators#exchange-problems)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>