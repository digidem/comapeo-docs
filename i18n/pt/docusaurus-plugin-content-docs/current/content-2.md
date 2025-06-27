### [Para desenvolvedores](https://docs.mapeo.app/for-developers)LocalizaçãoA página descreve como traduzir o mapeo para o seu idioma.

1. [Para desenvolvedores](https://docs.mapeo.app/for-developers)

O Mapeo usa a [plataforma Crowdin](https://crowdin.com/) para gerenciar suas traduções. Você é encorajado a contribuir com a localização criando uma conta gratuita na Crowdin. Por favor, nos informe se o seu idioma não estiver atualmente listado usando as informações de contato na página de [suporte](https://docs.mapeo.app/support).

### Projetos de Tradução

Você pode visualizar o status atual das traduções para vários projetos do Mapeo aqui.

- [Mapeo-mobile](https://crowdin.com/project/mapeo-mobile)
- [Mapeo-desktop](https://crowdin.com/project/mapeo-desktop)

### Começando com Crowdin

Para começar, faça login na sua conta Crowdin ou [registre-se](https://crowdin.com/join) para uma nova conta. Uma vez logado no Crowdin, você pode visitar a página do projeto [mapeo-mobile](https://crowdin.com/project/mapeo-mobile) ou [mapeo-desktop](https://crowdin.com/project/mapeo-desktop). A página do projeto lista todos os idiomas disponíveis para tradução. Para começar a traduzir, clique no idioma e depois no botão `Join` para participar da equipe de tradução.

Você pode iniciar a tradução clicando no botão `Translate All`. Isso abrirá a interface de usuário de tradução web do CrowdIn. A tela de tradução é dividida em três partes: com as strings de tradução no painel esquerdo, a string de origem e as caixas de texto de tradução no centro e comentários no painel direito. A `Source String` é uma string em inglês que você irá traduzir para o seu idioma e depois clicar em `save`.

Você também pode baixar os arquivos do projeto para tradução offline em formato XLIFF. O formato XLIFF é suportado por ferramentas de localização de desktop, como [Poedit](https://poedit.net/vi) e [Virtaal](https://virtaal.translatehouse.org/).

## Gerenciando Traduções

Antes que as traduções possam ser incluídas no projeto Mapeo, elas precisam ser aprovadas pelos revisores do idioma. Geralmente, os revisores são localizadores experientes que ajudam a garantir a qualidade e consistência das traduções.

Esse processo garante que a tradução atenda ao padrão e siga as convenções aceitas. Os revisores podem resolver quaisquer problemas com múltiplas traduções e escolher a tradução mais adequada.

Para melhorar as traduções existentes, use sugestões de tradução e comentários. Você é encorajado a usar o recurso de discussão do Crowdin para falar sobre questões de localização e interagir com outros membros da comunidade de localização.

### Convenções de Tradução

Aqui estão algumas convenções de tradução recomendadas a seguir durante a tradução.

- Seja breve, traduza em uma linguagem conversacional simples. Em caso de dúvida, peça feedback a um amigo ou familiar.
- Nomes de produtos, nomes de marcas e palavras técnicas nunca devem ser traduzidos.
- Variáveis com caracteres especiais nunca devem ser traduzidas. Você pode reconhecer uma variável dentro de uma string pelo seu início com um caractere especial (por exemplo, $, #, %, etc.) seguido por uma combinação de palavras sem espaços. Por exemplo, $BrandShortName e %S são variáveis. Você pode mover uma variável dentro de uma string, se a tradução da string exigir.

Você é encorajado a consultar o [Guia de Estilo de Localização da Mozilla](https://mozilla-l10n.github.io/styleguides/mozilla_general/) para obter mais informações sobre as melhores práticas de tradução.

## Mais Informações

- [Introdução ao Crowdin para Tradutores](https://support.crowdin.com/crowdin-intro/)
- [Guia de Estilo de Localização da Mozilla](https://wiki.mozilla.org/L10n:Teams:tl/Style_Guide)