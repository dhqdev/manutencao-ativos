@AGENTS.md

# Padrão do projeto

Antes de criar ou mudar qualquer coisa (telas, server actions, SQL, permissões,
stack, backup, testes), carregue a skill `padrao-manutencao`
(`.claude/skills/padrao-manutencao/SKILL.md`) e siga o que ela diz.
Se a mudança criar um padrão novo, atualize a skill no mesmo commit.

Entrega: rode `npm run verificar` e faça push direto na `main` (sem branch);
o Actions roda só na main.
