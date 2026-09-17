# Drops de Luxo — Frete PAC e SEDEX

Esta versão adiciona uma API local para calcular o frete pela SuperFrete sem expor o token no navegador.

## Arquivos novos

- `server.js` — backend que recebe o CEP e chama a SuperFrete.
- `.env.example` — modelo de configuração do token.
- `.gitignore` — impede que `.env` seja enviado ao Git.
- `package.json` — comando para iniciar o servidor.

## Configuração do token

1. Faça uma cópia de `.env.example` e renomeie a cópia para `.env`.
2. Abra `.env`.
3. Troque `COLE_SEU_TOKEN_AQUI` pelo token copiado do painel da SuperFrete.
4. Troque o e-mail de contato do `SUPERFRETE_USER_AGENT` pelo e-mail que você usa para suporte da loja.
5. Nunca envie o arquivo `.env` para o GitHub.

## Dados atuais

- CEP de origem: `60720-605`
- PAC: código `1`
- SEDEX: código `2`
- Peso de teste: `1 kg`
- Altura: `10 cm`
- Largura: `15 cm`
- Comprimento: `20 cm`

As dimensões acima são as dimensões de teste combinadas. Antes de colocar a loja em produção, ajuste-as para a embalagem real dos pedidos.

## Rodar no computador

É necessário ter Node.js 18 ou superior.

No terminal, dentro da pasta do projeto:

```bash
npm start
```

Depois abra:

`http://127.0.0.1:3000`

Para conferir se o servidor está ativo, abra:

`http://127.0.0.1:3000/api/health`

O resultado esperado é parecido com:

```json
{"ok":true,"superfreteConfigured":true}
```

## Importante sobre hospedagem

O GitHub Pages serve apenas arquivos estáticos e não executa `server.js`. Portanto, para o cálculo real do frete, o backend precisa ser hospedado em um serviço que execute Node.js (por exemplo, Render, Railway, Vercel Functions ou outro serviço equivalente). O endereço do backend deverá então ser configurado no frontend.
