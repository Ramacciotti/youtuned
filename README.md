# youtuned

Extensão para remover blocos de Shorts do YouTube em navegadores compatíveis com extensões.

## Instalação no Chrome Desktop e Firefox Desktop

1. Abra o gerenciador de extensões do navegador.
2. Ative o modo de desenvolvedor.
3. Escolha a opção para carregar a extensão sem compactar.
4. Selecione esta pasta do projeto.

## Uso no Android

- O Chrome Android não suporta extensões MV3 da mesma forma que o desktop.
- No Firefox Android, a instalação pode depender da compatibilidade da build do navegador.
- Como alternativa, use o arquivo userscript.js com um gerenciador de userscripts, como Tampermonkey ou Violentmonkey, quando disponível.

## Arquivos principais

- manifest.json: configura a extensão para Chrome e Firefox desktop.
- content.js: remove os elementos de Shorts e acompanha mudanças na página.
- userscript.js: versão compatível com userscripts para Android e outros cenários.

