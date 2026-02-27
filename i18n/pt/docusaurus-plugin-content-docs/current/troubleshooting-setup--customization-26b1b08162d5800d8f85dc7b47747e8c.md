<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


# Solução de Problemas: Configuração e Personalização (H1)


Conceito geral e uso desta página


Este guia de solução de problemas ajuda você a diagnosticar e resolver problemas comuns de forma sistemática. Siga as etapas em ordem para a resolução mais eficiente de problemas.


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


---


## Problemas de Instalação e Inicialização


### Não consigo iniciar o CoMapeo


✅ **Verifique se você tem** :comapeo_logo_circle: **CoMapeo instalado no seu telefone ou computador.** Siga as instruções para [Instalando o CoMapeo](/docs/installing-comapeo-and-onboarding).


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


### 🟩 **Solução: Limpar dados de cache do aplicativo (somente CoMapeo Mobile)**


No CoMapeo Mobile, você pode limpar o cache do aplicativo usando as configurações do sistema Android. Os aplicativos normalmente usam o cache para armazenar dados não permanentes para melhorar a experiência do aplicativo e geralmente é seguro remover esses dados. Limpar esse cache pode resolver problemas ao iniciar o CoMapeo.


> ⚠️ **Aviso:** Os dados do CoMapeo, incluindo personalizações e dados coletados, serão excluídos se os dados de armazenamento forem limpos. Tenha cuidado, garantindo selecionar **cache** ao limpar os dados em cache.

<details>
<summary>**👣 Instruções passo a passo**</summary>

_**Etapa 1:**_ Vá para as configurações do Android. Você pode encontrá-las indo ao menu principal do Android e pesquisando por “Configurações”. Geralmente tem um ícone de _engrenagem_ (⚙️).


![](/images/troubleshootingsetup_0.png)


_**Etapa 2:**_ Abra-as e, dentro delas, procure pela opção “Aplicativos”. Isso exibirá todos os aplicativos instalados no dispositivo. Geralmente há uma barra de pesquisa onde você pode digitar


![](/images/troubleshootingsetup_1.png)


_**Etapa 3:**_ Digite **CoMapeo** e clique nele


![](/images/troubleshootingsetup_2.png)


_**Etapa 4:**_ Uma vez dentro do menu _Informações do aplicativo_, selecione _Armazenamento e cache_


![](/images/troubleshootingsetup_3.png)


_**Etapa 5:**_ Dentro de _Armazenamento_, selecione _LIMPAR CACHE_, que tem um ícone de lixeira (🗑️). Como mencionado acima, **cuidado para selecionar apenas** _**LIMPAR CACHE**_ **e não** _**LIMPAR ARMAZENAMENTO**_, **pois isso excluirá todos os dados, basicamente redefinindo o CoMapeo como se você acabasse de instalá-lo.**


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


![](/images/troubleshootingsetup_4.png)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


_**Etapa 6:**_ Depois que os dados do cache forem limpos. Reinicie o aplicativo.


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


</details>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


### 🟩 **Solução: Veja** [Soluções Comuns - 🟩 Solução: Certifique-se de que seu dispositivo tenha espaço livre suficiente disponível](/docs/common-solutions/#solution-make-sure-your-device-has-enough-free-space-available)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


> 💣 **Ainda não está funcionando?**  
> **Desinstale e reinstale o aplicativo.**  
>   
> É importante observar que desinstalar o CoMapeo significa **perder todos os dados que você coletou até agora**. Você só pode recuperar esses dados se tiver trocado anteriormente com outro dispositivo.


---


## Problemas de Configuração do Aplicativo


### Não consigo iniciar o CoMapeo


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


### O nome do dispositivo não está aparecendo conforme o esperado


A única maneira de alterar um nome de dispositivo para uso no CoMapeo é usar o mesmo dispositivo e acessar :app-icon-app-settings: Configurações do CoMapeo → Nome do Dispositivo.  


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


Verifique a segurança física do seu dispositivo para identificar vulnerabilidades das quais você pode não estar ciente


🟩 **Solução: Confirmar a segurança do bloqueio do seu dispositivo**


Se você tem um dispositivo compartilhado, confirme com as pessoas ao seu redor quais aplicativos são compartilhados. Não é incomum que crianças curiosas brinquem com aplicativos fáceis de usar


🟩 **Solução: Adicionar um código de acesso seguro ao CoMapeo**


Vá para 🔗 [**Usando um Código de Acesso do Aplicativo para Segurança**](/docs/using-an-app-passcode-for-security) 


---


## Problemas de Conjunto de Categorias Personalizadas


### 🟩 **Solução: Verifique se você está carregando o arquivo correto**


Ao carregar um conjunto de categorias personalizado, o aplicativo pode falhar ao carregá-lo. Isso pode acontecer por vários motivos


Os arquivos de categorias do **CoMapeo** têm uma extensão _**comapeocat**_. Portanto, você precisa garantir que está carregando o correto.

<details>
<summary>**👣 Instruções passo a passo**</summary>

**Etapa 1:** Depois de selecionar o botão _Importar Categorias_, o navegador Android aparecerá para permitir que você selecione o arquivo de categoria pretendido. Mas pode acontecer que o nome do arquivo seja cortado, então você não consegue ver o nome completo. 


![](/images/troubleshootingsetup_5.png)


**Etapa 2:** Se você quiser ter certeza de que está selecionando o arquivo correto, pode selecionar e segurar o dedo em cima do arquivo desejado, o que mostrará o nome correto do arquivo e selecionará esse arquivo


![](/images/troubleshootingsetup_6.png)


**Etapa 3:** Se o arquivo selecionado for o pretendido, pressione selecionar no canto superior direito


![](/images/troubleshootingsetup_7.png)


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


</details>


### 🟩 **Solução: Certifique-se de ter um arquivo de categorias compatível com a versão instalada do CoMapeo**


De outubro a novembro de 2025, lançamos uma versão do CoMapeo (**v7**) que alterou o formato para conjuntos de categorias personalizadas. Isso significa que se você criou um arquivo de categorias antes de outubro de 2025 e tentou carregá-lo na **v7** do CoMapeo ou mais recente, o aplicativo falharia ao carregar o arquivo.


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>

<details>
<summary>**👣 Instruções passo a passo**</summary>

_**Etapa 1:**_ Abra o **CoMapeo** e vá para o menu **Sobre o CoMapeo** no menu **Configurações do CoMapeo**


![](/images/troubleshootingsetup_8.png)


_**Etapa 2:**_ Verifique o campo **Versão do CoMapeo** e veja se a versão é maior ou igual a **7.0**


![](/images/troubleshootingsetup_9.png)


_**Etapa 3:**_ Verifique a data em que o arquivo de categorias foi criado. Isso pode ser feito a partir de um computador desktop verificando as propriedades do arquivo.


_**Etapa 4:**_ Se o arquivo foi criado **antes** de outubro de 2025, então é possível que o arquivo de categorias seja incompatível com sua versão atual do **CoMapeo**


_**Etapa 5:**_ Crie um novo arquivo de categorias que seja compatível com a versão atual do **CoMapeo.** Para isso, veja: [Criando um Conjunto de Categorias Personalizado](/docs/building-a-custom-categories-set)


👉 Uma alternativa, mas problema semelhante que pode acontecer é ter uma versão mais antiga do **CoMapeo** (mais antiga que a **v7**) e tentar carregar um arquivo de categorias personalizado mais recente que essa versão, o que também falhará. A melhor solução para esse caso é atualizar a versão instalada do **CoMapeo**


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>


</details>


---


## Problemas de Mapa Personalizado


---


---


> ## 🔗 Site do CoMapeo  
>   
> Visite [comapeo.app](http://comapeo.app/) para informações gerais, inscrição na newsletter e acesso a blogs sobre o CoMapeo


---


> ## 📨 **Entre em contato** com a Equipe de Ajuda do CoMapeo   
>   
> Se você não conseguiu resolver problemas com os recursos compartilhados nas :comapeo-docs:[**Páginas de Ajuda do CoMapeo**](/docs/introduction)**,** entre em contato conosco. Alguém da Awana Digital ficará feliz em receber detalhes sobre sua experiência, incluindo capturas de tela para ajudar a explicar o que não está funcionando conforme o esperado  
> 📧 Envie-nos um e-mail para [**help@comapeo.app**](mailto:help@comapeo.app)  
>   
> 💬 Você também pode conversar conosco no :discord-color-icon: [**Discord**](https://discord.gg/kWp34am3)**!**  
>   
> <div class="notion-spacer" aria-hidden="true" role="presentation"></div>


<div class="notion-spacer" aria-hidden="true" role="presentation"></div>