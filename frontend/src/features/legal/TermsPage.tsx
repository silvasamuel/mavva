import { Link } from 'react-router-dom'
import { ControllerDetails } from './ControllerDetails'
import { LegalPage } from './LegalPage'

export function TermsPage() {
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes Termos regulam o uso do Mavva, aplicativo gratuito de estudo bíblico disponível em
        mavva.com.br. Ao criar uma conta, você declara que leu e aceita estas regras.
      </p>

      <h2>1. Quem oferece o serviço</h2>
      <ControllerDetails />

      <h2>2. O que o Mavva faz</h2>
      <p>
        O Mavva oferece quizzes, revisão espaçada, duelos, ranking, sugestão de perguntas sobre a
        Bíblia e sugestão de melhorias do aplicativo. O conteúdo é educativo e de entretenimento.
        Não substitui aconselhamento pastoral, teológico ou jurídico.
      </p>

      <h2>3. Idade e conta</h2>
      <p>
        O Mavva é um jogo educativo aberto a todas as idades. Não pedimos data de nascimento e não
        bloqueamos o cadastro por idade.
      </p>
      <p>
        Quando uma criança joga, o tratamento dos dados dela deve ocorrer no melhor interesse da
        criança (art. 14 da LGPD). Quem cria ou autoriza a conta — em geral o pai, a mãe ou o
        responsável — consente em nome dela. Coletamos só o necessário para jogar. Não usamos esses
        dados para publicidade. O responsável pode pedir acesso, correção ou exclusão a qualquer
        momento pelo e-mail do encarregado.
      </p>
      <ul>
        <li>Você é responsável por manter a senha em sigilo e pelas ações feitas na sua conta.</li>
        <li>Uma conta por pessoa. Dados cadastrais devem ser verdadeiros.</li>
      </ul>

      <h2>4. Regras de convivência</h2>
      <p>É proibido usar o Mavva para:</p>
      <ul>
        <li>ofender, assediar ou expor outros jogadores;</li>
        <li>enviar conteúdo ilícito, enganoso ou que viole direitos de terceiros;</li>
        <li>tentar burlar pontuação, duelos ou o sistema de contas;</li>
        <li>explorar falhas técnicas ou acessar dados de outras pessoas.</li>
      </ul>
      <p>
        Podemos inativar contas que violem estas regras, sem prejuízo de outras medidas cabíveis.
      </p>

      <h2>5. Conteúdo que você envia</h2>
      <p>
        Relatos de erro em perguntas, sugestões de novas questões e ideias de melhoria ou correção
        do aplicativo podem ser revisados, editados ou
        recusados. Ao enviar, você autoriza o Mavva a usar esse material no próprio serviço.
      </p>

      <h2>6. Propriedade intelectual</h2>
      <p>
        Marca, interface, textos originais e organização do banco de perguntas pertencem ao Mavva.
        Referências bíblicas são de domínio público ou usadas de forma educacional. Você não pode
        copiar o banco de questões para um produto concorrente sem autorização.
      </p>

      <h2>7. Disponibilidade</h2>
      <p>
        O Mavva é oferecido como está, sem garantia de disponibilidade contínua. Podemos corrigir
        erros, alterar regras de pontuação ou encerrar funcionalidades com aviso razoável quando
        possível.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        Na medida permitida pela lei brasileira, o Mavva não responde por danos indiretos,
        perda de pontuação, interrupções de rede ou uso indevido da conta por terceiros. Isso não
        exclui direitos do consumidor que não possam ser afastados.
      </p>

      <h2>9. Encerramento</h2>
      <p>
        Você pode apagar a conta no perfil, confirmando com a senha, ou pelo e-mail do
        encarregado. Nós podemos encerrar o acesso em caso de violação destes Termos ou exigência
        legal.
      </p>

      <h2>10. Privacidade</h2>
      <p>
        O tratamento de dados pessoais está descrito na{' '}
        <Link to="/privacidade" className="font-extrabold text-leaf-700 underline">
          Política de Privacidade
        </Link>
        , parte integrante destes Termos.
      </p>

      <h2>11. Alterações e foro</h2>
      <p>
        Podemos atualizar estes Termos. A versão vigente será publicada nesta página, com a data no
        topo. O uso continuado após a mudança, quando exigido um novo aceite, dependerá de
        consentimento renovado no cadastro ou no acesso. Aplica-se a legislação brasileira, com foro
        do domicílio do usuário quando a lei do consumidor assim determinar.
      </p>
    </LegalPage>
  )
}
