# Horas Extras

App web para lançar e controlar horas extras. O motorista lança os horários todos os dias; o empregador aprova e confirma os pagamentos.

- **Hospedagem:** GitHub Pages (pasta raiz deste repositório).
- **Dados e login:** Firebase (Authentication por e-mail e senha + Cloud Firestore).
- Este repositório contém apenas o código. Nenhum dado pessoal fica aqui.

## Configuração do Firebase (uma vez)

1. Em <https://console.firebase.google.com>, crie um projeto (o Google Analytics pode ficar desligado).
2. **Authentication > Método de login:** ative **E-mail/senha**.
3. **Authentication > Configurações > Domínios autorizados:** adicione o domínio do site (`SEU-USUARIO.github.io`).
4. **Firestore Database > Criar banco de dados:** modo de produção, região `southamerica-east1`.
5. **Firestore Database > Regras:** cole o conteúdo de [`firestore.rules`](firestore.rules) e publique.
6. **Configurações do projeto > Seus apps > Web (`</>`):** registre um app e copie o `firebaseConfig` para [`config.js`](config.js).

## Primeiro uso

1. O empregador abre o site, toca em **Criar conta** e depois em **Assumir o controle**. A primeira conta a fazer isso passa a ser a responsável.
2. O motorista abre o mesmo link e cria a própria conta. O pedido aparece em **Ajustes > Acessos** para o empregador liberar.
3. Histórico anterior: **Ajustes > Backup e importação > Importar arquivo**.

## Regras de cálculo

- Hora normal = salário mensal ÷ divisor (200 para 40 horas semanais).
- Hora extra comum: 50%. Após a meia-noite (0h às 5h), domingos e feriados: 100%. Percentuais ajustáveis.
- Opcionais: piso do adicional noturno legal (22h às 5h) e reflexo no descanso semanal (DSR).
- Os valores são estimativas para gestão e não substituem contador ou advogado.

## Desenvolvimento

`engine.js` (motor de cálculo, com testes em `test.js`), `ui.js` (telas) e `style.css` são montados em `index.html` por `python3 build.py`.
