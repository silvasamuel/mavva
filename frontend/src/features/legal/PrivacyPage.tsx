import { Link } from 'react-router-dom'
import { ControllerDetails } from './ControllerDetails'
import { LegalPage } from './LegalPage'

export function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        Esta política explica como o Mavva trata dados pessoais, em conformidade com a Lei nº
        13.709/2018 (LGPD). Ela deve ser lida junto com os{' '}
        <Link to="/termos" className="font-extrabold text-leaf-700 underline">
          Termos de Uso
        </Link>
        .
      </p>

      <h2>1. Controlador</h2>
      <ControllerDetails />
      <p>Pedidos do titular e da ANPD devem ir para o e-mail do encarregado acima.</p>

      <h2>2. Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail e senha (a senha é armazenada só como hash).
        </li>
        <li>
          <strong>Perfil público:</strong> nome, nome de usuário, nível, elo e placar de duelos —
          o e-mail não é mostrado a outros jogadores.
        </li>
        <li>
          <strong>Uso do app:</strong> respostas de quizzes e duelos, tempo de estudo, revisões,
          amizades, denúncias, sugestões de perguntas e de melhorias do aplicativo.
        </li>
        <li>
          <strong>Técnicos:</strong> cookie httpOnly de sessão e endereço IP para limitar abuso.
          Métricas da Vercel (Analytics e Speed Insights) só rodam se você aceitar no aviso de
          cookies.
        </li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>
          <strong>Execução de contrato (art. 7º, V):</strong> criar a conta, autenticar, enviar
          e-mail de confirmação e de recuperação de senha, operar quizzes, duelos e ranking.
        </li>
        <li>
          <strong>Consentimento (art. 7º, I):</strong> o aceite no cadastro registra que você foi
          informado e autorizou esse tratamento. O consentimento pode ser revogado, o que em
          regra implica o encerramento da conta.
        </li>
        <li>
          <strong>Obrigação legal (art. 7º, II):</strong> cumprir ordens de autoridade ou prazos
          de guarda quando a lei exigir.
        </li>
        <li>
          <strong>Prevenção a fraude (art. 7º, X):</strong> limitar tentativas de cadastro, login e
          reenvio de e-mail.
        </li>
      </ul>
      <p>Não vendemos dados pessoais e não fazemos publicidade comportamental de terceiros.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Usamos operadores que processam dados em nosso nome:</p>
      <ul>
        <li>Vercel — hospedagem do site, analytics e medições de desempenho;</li>
        <li>Resend — envio de e-mails transacionais (confirmação e redefinição de senha);</li>
        <li>provedor do banco de dados em que a aplicação está hospedada.</li>
      </ul>
      <p>
        Alguns desses operadores podem armazenar dados fora do Brasil. Nessas transferências
        internacionais observamos o art. 33 da LGPD (cláusulas contratuais e destinos com grau de
        proteção adequado, quando aplicável).
      </p>

      <h2>5. Cookies</h2>
      <p>
        Usamos um cookie essencial <code className="font-extrabold">refresh_token</code>, httpOnly,
        para manter a sessão. Sem ele o login não funciona. Métricas da Vercel só são ligadas depois
        que você clica em Aceitar métricas no aviso. Quem escolhe Só o essencial continua jogando
        normalmente, sem essas medições.
      </p>

      <h2>6. Seus direitos (art. 18 da LGPD)</h2>
      <p>
        No perfil você apaga a conta a qualquer momento (com a senha). A cópia dos seus dados
        pode ser pedida ao encarregado por e-mail; o download direto no perfil está
        temporariamente desativado. Também pode escrever ao encarregado para:
      </p>
      <ul>
        <li>acesso e cópia dos seus dados;</li>
        <li>confirmação da existência de tratamento;</li>
        <li>correção de dados incompletos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários;</li>
        <li>informação sobre compartilhamentos;</li>
        <li>revogação do consentimento, se preferir não usar o fluxo do perfil.</li>
      </ul>
      <p>
        Também é possível reclamar à Autoridade Nacional de Proteção de Dados (ANPD). Respondemos
        pedidos em prazo razoável, em regra em até 15 dias.
      </p>

      <h2>7. Por quanto tempo guardamos</h2>
      <p>
        Mantemos a conta enquanto ela estiver ativa. Após um pedido de exclusão, apagamos ou
        anonimizamos os dados pessoais, salvo o que a lei exigir conservar (por exemplo, registros
        mínimos de segurança). Tokens de verificação e de senha expiram sozinhos.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Senhas são armazenadas com hash, o token de acesso fica só na memória do navegador e o
        cookie de sessão é httpOnly. Nenhum controle elimina todo o risco; avise-nos se identificar
        um incidente.
      </p>

      <h2>9. Crianças e adolescentes</h2>
      <p>
        O Mavva é um jogo para todas as idades. Não pedimos data de nascimento e não impedimos o
        cadastro de crianças ou adolescentes. Nos termos do art. 14 da LGPD, o tratamento de dados
        de criança deve ser feito no melhor interesse dela: coletamos só o necessário para jogar,
        não fazemos publicidade com esses dados e o responsável pode baixar ou apagar os dados no
        perfil, ou pelo e-mail do encarregado. Quem autoriza a criança a jogar consente em nome
        dela.
      </p>

      <h2>10. Alterações</h2>
      <p>
        Esta política pode mudar. A data no topo indica a versão vigente. Mudanças relevantes serão
        comunicadas no próprio serviço ou por e-mail quando o impacto exigir novo aceite.
      </p>
    </LegalPage>
  )
}
