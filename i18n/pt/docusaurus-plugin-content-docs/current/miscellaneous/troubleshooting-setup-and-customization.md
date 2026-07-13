---
id: "troubleshooting-setup-and-customization"
title: "Solução de Problemas: Configuração e Personalização"
slug: /troubleshooting-setup-and-customization
sidebar_label: "Solução de Problemas: Configuração e Personalização"
pagination_label: "Solução de Problemas: Configuração e Personalização"
custom_edit_url: "https://www.notion.so/3131b08162d580f8b77ec52b521a9119"
source: notion
notion_page_id: "3131b081-62d5-80f8-b77e-c52b521a9119"
notion_last_edited_time: "2026-04-22T03:58:00.000Z"
content_hash: "sha256:c4bcf757b8a3634c300f7557172f0a3ff382a3454ae1e9c19e147f37861073dd"
status: draft
locale: pt
section: "90+ - Miscellaneous"
keywords: [docs, comapeo]
tags: [comapeo]
last_update:
  date: 4/22/2026
  author: Awana Digital
sidebar_position: 39
---

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

Conceito geral e uso desta página

Este guia ajudará você a diagnosticar e resolver problemas comuns de forma sistemática. Siga as etapas em ordem para a resolução mais eficiente do problema.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

---

## Instalação e Problemas de Inicialização

### Não é possível iniciar o CoMapeo

✅**Verifique se você tem** <img src="/images/notion/3a40065bd081188fd54f3a2eea142a94ef06d828f89e0980a51391cb7aa347c9.png" alt="comapeo_logo_circle" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} />**CoMapeo instalado no seu telefone ou computador.** Siga as instruções em [Instalando o CoMapeo](/pt/docs/installing-comapeo-and-onboarding).

### 🟩**Solução: Limpar dados do cache do aplicativo (somente CoMapeo Mobile)**

No CoMapeo Mobile, você pode limpar o cache do aplicativo usando as configurações do sistema Android. Os aplicativos normalmente usam o cache para armazenar dados não permanentes para melhorar a experiência do aplicativo e geralmente é seguro remover esses dados. Limpar esse cache pode resolver problemas ao iniciar o CoMapeo.

:::note ⚠️ Aviso
Os dados do CoMapeo, incluindo personalizações e dados coletados, serão excluídos se os dados de armazenamento forem limpos. Tenha cuidado, certificando-se de selecionar apenas **cache** ao limpar dados em cache.

:::

<details>
<summary>**👣 Instruções passo a passo**</summary>

***Passo 1:*** Vá para as configurações do Android. Você pode encontrá-las indo para o menu principal do Android e procurar por "Configurações". Geralmente tem um ícone de *engrenagem* (⚙️).
:::note 🖼️
static/images/troubleshootingsetup_0.png

:::
***Passo 2:*** Abra-o e, dentro dele, procure pela opção "Apps". Isso exibirá todos os aplicativos instalados no dispositivo. Geralmente, há uma barra de pesquisa onde você pode digitar
:::note 🖼️
static/images/troubleshootingsetup_1.png

:::
***Passo 3:*** Digite **CoMapeo** e clique nele
:::note 🖼️
static/images/troubleshootingsetup_2.png

:::
***Passo 4:*** Uma vez dentro das *Informações do aplicativo*, selecione *Armazenamento & Cache*
:::note 🖼️
static/images/troubleshootingsetup_3.png

:::
***Passo 5:*** Dentro de *Armazenamento* selecionar *LIMPAR CACHE* que tem um ícone de lixeira (🗑️). Como dito acima, **cuidado nesse passo e selecione apenas** ***LIMPAR CACHE*** **e não** ***LIMPAR ARMAZENAMENTO*** **já que isso excluirá todos os dados, basicamente redefinindo o CoMapeo como se você acabasse de instalá-lo.**
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
:::note 🖼️
static/images/troubleshootingsetup_4.png

:::
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
***Passo 6:*** Uma vez que os dados do cache são limpos, abra o aplicativo novamente.
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

</details>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### 🟩**Solução: Ver** [Soluções Comuns - 🟩 Solução: Certifique-se de que seu dispositivo tenha espaço livre suficiente disponível](/pt/docs/common-solutions#solution-make-sure-your-device-has-enough-free-space-available)

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

:::note 💣
**Ainda não está funcionando?**

**Desinstale e reinstale o aplicativo.**

É importante observar que desinstalar o CoMapeo significa **perder todos os dados que você coletou até agora**. Você só pode recuperar esses dados se tiver trocado anteriormente com outro dispositivo.

:::

---

## Problemas de configuração do aplicativo

### Não é possível iniciar o CoMapeo

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

### O nome do dispositivo não está aparecendo conforme o esperado

A única maneira de alterar um nome de dispositivo para uso no CoMapeo é usar esse mesmo dispositivo e acessar <img src="/images/notion/2c4335fb69ab490d45c00fa57a40665ffeb87869bd446367c970909f95287356.png" alt="app-icon-app-settings" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> Configurações do CoMapeo → Nome do Dispositivo.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

Verifique a segurança física do seu dispositivo para identificar vulnerabilidades das quais você pode não estar ciente.

🟩**Solução: Confirme a segurança do bloqueio do seu dispositivo**

Se você tem um dispositivo compartilhado, confirme com as pessoas ao seu redor quais aplicativos são compartilhados. Não é incomum que crianças curiosas brinquem com aplicativos fáceis de usar.

🟩**Solução: Adicionar um Código de Acesso seguro ao CoMapeo**

Acesse: 🔗[Usando um Código de Acesso do Aplicativo para Segurança](/pt/docs/using-an-app-passcode-for-security)

---

## Problemas de Conjunto de Categoria Personalizada

### 🟩**Solução: Verifique se você está carregando o arquivo correto**

Ao carregar um conjunto de categorias personalizado, o aplicativo pode falhar ao carregá-lo. Isso pode acontecer por vários motivos

Os arquivos de categorias do **CoMapeo** têm uma extensão chamada ***.comapeocat.*** Então você precisa  garantir que está carregando o arquivo correto.

<details>
<summary>**👣 Instruções passo a passo**</summary>

**Passo 1:** Depois de selecionar o botão *Importar Categorias*, o navegador Android aparecerá para você selecionar o arquivo de categoria pretendido. Mas pode acontecer que o nome do arquivo seja cortado, então você pode não conseguir ver o nome completo.
:::note 🖼️
static/images/troubleshootingsetup_5.png

:::
**Passo 2:** Se você quiser ter certeza de que está selecionando o arquivo correto, pode selecionar e segurar o dedo em cima do arquivo desejado, o que mostrará o nome correto e selecionará esse arquivo.
:::note 🖼️
static/images/troubleshootingsetup_6.png

:::
**Passo 3:** Se o arquivo selecionado for o desejado, pressione selecionar no canto superior direito
:::note 🖼️
static/images/troubleshootingsetup_7.png

:::
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

</details>

### 🟩**Solução: Certifique-se de ter um arquivo de categorias compatível com a versão instalada do CoMapeo**

De outubro a novembro de 2025, lançamos uma versão do CoMapeo (**v7**) que alterou o formato para conjuntos de categorias personalizados. Isso significa que se você criou um arquivo de categorias antes de outubro de 2025 e tentou carregá-lo na **v7** do CoMapeo ou outra versão mais recente,  o aplicativo pode falhar ao carregar o arquivo.

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<details>
<summary>**👣 Instruções passo a passo**</summary>

***Passo 1:*** Abra o **CoMapeo,** e vá para o menu **Configurações do Comapeo** e escolha **Sobre o CoMapeo** no menu.
:::note 🖼️
static/images/troubleshootingsetup_8.png

:::
***Passo 2:*** Verifique a **Versão do CoMapeo** e identifique se a versão é maior ou igual a **7.0**
:::note 🖼️
static/images/troubleshootingsetup_9.png

:::
***Passo 3:*** Verifique a data em que o arquivo de categorias foi criado. Isso pode ser feito a partir de um computador desktop verificando as propriedades do arquivo.
***Passo 4:*** Se o arquivo foi criado **antes de** Outubro de 2025, então é possível que o arquivo de categorias seja incompatível com sua versão atual do **CoMapeo**
***Passo 5:*** Crie um novo arquivo de categorias que seja compatível com a versão atual do **CoMapeo.** Para isso, acesse: [Construindo um Conjunto de Categorias Personalizado](https://notion.so/docs/building-a-custom-categories-set)
👉 Uma alternativa, mas um problema similar que pode ocorrer é ter uma versão mais antiga do **CoMapeo** (mais antigo que **v7**) e tentar carregar um arquivo de categorias personalizado que é mais recente do que essa versão, o que também falhará. A melhor solução para esse caso é atualizar a versão instalada do **CoMapeo**
<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

</details>

---

## 🔗 Site do CoMapeo

---

:::note Acesse [comapeo.app](http
//comapeo.app/) para obter informações gerais, inscrever-se na newsletter e acessar blogs sobre o CoMapeo.

:::

:::note
## 📨 **Entre em contato** com a equipe de suporte do CoMapeo

Se você não conseguiu resolver os problemas com os recursos compartilhados nas <img src="/images/notion/0ea453a2d19c6722e498a75251d069c71146a686530c750722b0ac1d5cbb75d1.svg" alt="comapeo-docs" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> [Páginas de Ajuda do CoMapeo](/pt/docs/introduction), entre em contato conosco. Alguém da Awana Digital terá prazer em receber detalhes sobre sua experiência, incluindo capturas de tela, para ajudar a explicar o que não está funcionando como esperado
📧 Envie-nos um e-mail para [help@comapeo.app](mailto:help@comapeo.app)

💬 Você também pode conversar conosco no <img src="/images/notion/5521cc1569f933e664890dc0bcacc292ffcf07160b08e4d46145d2c8f3928db3.png" alt="discord-color-icon" className="emoji" style={{display:"inline",height:"1.2em",width:"auto",verticalAlign:"text-bottom",margin:"0 0.1em"}} /> [Discord](https://discord.gg/kWp34am3)!

:::

---

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<div class="notion-spacer" aria-hidden="true" role="presentation"></div>
