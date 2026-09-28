# Estação local da nutrição

Um servidor pequeno que roda no Mac da Dra. Géssica, ao lado do app. Ele faz três coisas que o navegador não consegue fazer sozinho:

1. **Transcreve o áudio da consulta no próprio Mac**, com o whisper.cpp. O áudio não sai do computador.
2. **Pede à IA (Claude) para organizar a transcrição** no formato do checkpoint dela. A chave da IA fica na estação, nunca no navegador.
3. **Imprime o plano alimentar em PDF com o Google Chrome instalado**, o mesmo motor da prévia na tela. O PDF sai igual ao que ela vê.

O app (rota `/nutricao`) fala com a estação em `http://127.0.0.1:8787`. Sem a estação ligada, o app continua funcionando, mas sem transcrição, sem organização por IA e com a impressão do navegador no lugar do PDF.

## O que precisa estar instalado

- **Homebrew** e, por ele, o ffmpeg e o whisper.cpp:

  ```sh
  brew install ffmpeg whisper-cpp node
  ```

  Os programas ficam em `/opt/homebrew/bin/ffmpeg` e `/opt/homebrew/bin/whisper-cli`.
- **Google Chrome** em `/Applications/Google Chrome.app`. A estação usa o Chrome que já está instalado; não baixa outro navegador.
- **Node.js** 22.18 ou mais novo (a estação é escrita em TypeScript e o Node roda os arquivos `.ts` direto, sem build). Neste Mac: Node 26.

## Modelo de transcrição

O modelo do whisper.cpp (574 MB) fica em:

```
~/Library/Application Support/EstacaoNutri/modelos/ggml-large-v3-turbo-q5_0.bin
```

Para baixar:

```sh
mkdir -p ~/Library/Application\ Support/EstacaoNutri/modelos
curl -L -o ~/Library/Application\ Support/EstacaoNutri/modelos/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

Se esse arquivo não existir, a estação usa um `ggml-small.bin` quando encontrar um (pior em português, mas funciona). Para usar outro modelo, defina `MODELO_WHISPER` no `.env.local`.

## Configuração (`.env.local`)

```sh
cd tools/estacao-nutri
cp .env.example .env.local
```

Abra o `.env.local` e preencha o que precisar. Tudo tem padrão; o único campo sem padrão é a chave da IA.

- `ANTHROPIC_API_KEY`: chave da API da Anthropic. **Antes de atender pessoas reais, a chave precisa ser de uma organização separada da Anthropic, com retenção zero de dados (ZDR).** Sem chave, a estação liga normalmente e só o "organizar com IA" fica desligado (responde 503).
- `ORIGENS_PERMITIDAS`: endereços do app que podem falar com a estação. O padrão cobre o app rodando em `127.0.0.1` e `localhost` nas portas 5173 e 5174. Para o app publicado, acrescente o endereço dele.
- `MODELO_IA` (padrão `claude-opus-5`), `PORTA` (8787), `PASTA_DADOS`, `MODELO_WHISPER`, `WHISPER_BIN`, `FFMPEG_BIN`, `DIAS_RETENCAO_AUDIO` (7): veja os comentários no `.env.example`.

O `.env.local` **nunca vai para o git** (está no `.gitignore`). Variáveis do ambiente ganham do arquivo.

## Como ligar

Pelo Terminal:

```sh
cd tools/estacao-nutri && npm install && npm start
```

Ou com dois cliques em **`Iniciar Estação.command`** (nesta pasta). Na primeira vez ele roda o `npm install` sozinho. Para desligar, feche a janela ou aperte Ctrl+C.

Ao ligar, a estação escreve uma linha dizendo o endereço e o que está pronto, por exemplo:

```
Estação local em http://127.0.0.1:8787 | transcrição: pronta (ggml-large-v3-turbo-q5_0.bin) | PDF: Chrome ok | IA: sem chave | áudios apagados após 7 dias
```

## Instalar no Mac da Géssica

`instalador/montar-pacote.sh` gera `instalador/dist/Estação Nutrição Bratan.zip` (fora do git). A pasta leva o `Instalar.command`, o `Desinstalar.command`, um `LEIA-ME.txt` e a estação, com os dois arquivos do app que ela importa (`roteiro.ts` e `esquemaOrganizacao.ts`) no mesmo caminho relativo.

Com dois cliques, o instalador:

1. instala o que falta com o Homebrew: Node, ffmpeg, whisper-cpp e o Google Chrome;
2. copia a estação para `~/Library/Application Support/EstacaoNutri/programa` e roda o `npm ci`;
3. baixa o modelo (574 MB) do repositório do whisper.cpp no Hugging Face e confere o SHA-256. Se o download cair, ele continua de onde parou;
4. escreve o `.env.local` com `ORIGENS_PERMITIDAS=https://app-bratan.vercel.app` e sem chave de IA. Ao rodar de novo, reescreve só as linhas dele;
5. cria o início automático (`~/Library/LaunchAgents/br.com.institutobratan.estacao-nutri.plist`, com `KeepAlive`), com o registro em `~/Library/Logs/EstacaoNutri`;
6. confere a estação pela rota `/saude` e cria o atalho `~/Applications/Nutrição Bratan.app`, que abre o módulo no Chrome.

Rodar o instalador de novo atualiza a estação sem baixar o modelo outra vez. O desinstalador remove o início automático, o programa e o atalho, e só apaga as gravações e o modelo se ela pedir.

`instalador/testar.sh` testa tudo isso neste Mac, de ponta a ponta. Ele usa uma pasta temporária, a porta 8788, um início automático próprio e um download interrompido 3 MB antes do fim. Não dá para testar a instalação do Homebrew e dos programas do zero num Mac que já tem tudo.

## Como conferir

```sh
curl http://127.0.0.1:8787/saude
```

Resposta esperada:

```json
{"ok":true,"versao":"0.1.0","whisper":{"pronto":true,"modelo":"ggml-large-v3-turbo-q5_0.bin"},"ffmpeg":true,"chrome":true,"ia":{"configurada":false,"modelo":"claude-opus-5"}}
```

`whisper.pronto` falso quer dizer que falta o whisper-cli ou o modelo; `ia.configurada` falso quer dizer que falta a chave.

## Rotas

| Rota | O que faz |
| --- | --- |
| `GET /saude` | O que está pronto na estação. |
| `POST /transcricoes?gravacao=<id>` | Recebe o áudio (corpo cru, até 400 MB; webm, ogg, mp4/m4a, wav ou mp3) e começa a transcrever. Responde 202 `{ jobId }`. |
| `GET /transcricoes/<jobId>` | `{ estado, progresso, erro, resultado }`. Estados: `convertendo`, `transcrevendo`, `pronta`, `erro`. |
| `DELETE /audios/<gravacao>` | Apaga o áudio da gravação e os arquivos intermediários. Responde 204. |
| `POST /organizar` | Manda a transcrição para a IA e devolve `{ resposta, modelo, uso: { entrada, saida, custoUsd }, duracaoMs }`. |
| `POST /pdf` | Recebe `{ html }` e devolve o PDF (`application/pdf`). |

Uma transcrição roda por vez (o whisper usa quase todos os núcleos). Neste Mac (M4), 30 segundos de áudio levam cerca de 3 segundos.

## Onde ficam os arquivos e quando são apagados

Tudo fica em `~/Library/Application Support/EstacaoNutri/` (pastas só do usuário):

- `audios/`: o áudio enviado pelo app, como `<gravacao>.<extensão>`.
- `trabalho/`: WAV e JSON intermediários do whisper. São apagados assim que a transcrição termina.
- `transcricoes/<jobId>.json`: o resultado da transcrição, para o app buscar mesmo se a estação for reiniciada.
- `modelos/`: o modelo do whisper.cpp.

Áudios e transcrições com mais de `DIAS_RETENCAO_AUDIO` dias (padrão 7) são apagados. A estação confere ao ligar e depois a cada hora. O app pode apagar um áudio antes disso com `DELETE /audios/<gravacao>`.

## Privacidade e segurança

- A estação escuta **só em 127.0.0.1**. Não aceita conexões de outros computadores da rede, mesmo que alguém configure `HOST=0.0.0.0` (o valor é ignorado e a estação avisa).
- Só as origens da lista `ORIGENS_PERMITIDAS` são atendidas. Pedido vindo de outro site recebe 403. O cabeçalho `Host` também é conferido (só `127.0.0.1` ou `localhost` na porta da estação), para que um site com DNS apontando para o Mac não consiga ler a estação.
- A estação responde ao preflight de rede privada do Chrome (`Access-Control-Allow-Private-Network`) só para origem permitida.
- O áudio é transcrito no Mac. Para a IA vão só o texto da transcrição, o nome da pessoa, a data, a lista de suplementos registrados e as linhas do checkpoint anterior.
- O PDF é gerado com o JavaScript da página desligado; a marcação já chega pronta do app.
- Os logs não guardam conteúdo das consultas.

## Testes

Da raiz do projeto:

```sh
node --test tests/estacao-*.test.mjs
```

Os testes não chamam a IA de verdade (usam um cliente falso) nem o whisper de verdade (usam programas falsos). O teste de erros do SDK é pulado se o `npm install` desta pasta não tiver sido feito.
