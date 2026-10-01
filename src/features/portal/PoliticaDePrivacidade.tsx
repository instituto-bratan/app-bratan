// POLÍTICA DE PRIVACIDADE DO MEU BRATAN (01/10/2026). A Apple exige a política em
// dois lugares — na ficha da loja e dentro do app (Diretriz 5.1.1(i)) — e ela
// tem que dizer o que o app coleta, para quê, com quem compartilha, por quanto
// tempo guarda e como o paciente apaga. Fica em /meu/privacidade, aberta sem
// login: é o mesmo endereço que vai na ficha da App Store.
//
// O texto de "o que se apaga" e "o que fica" vem do mesmo módulo que o servidor
// usa para apagar, para a promessa e a ação nunca desencontrarem.
import { Link } from "react-router-dom";
import bratanMark from "@/assets/bratan-mark.png";
import { O_QUE_FICA, O_QUE_SE_APAGA } from "../../../supabase/functions/_shared/contaDoPortal";
import "./portal.css";

export const ATUALIZADA_EM = "1º de outubro de 2026";

export function PoliticaDePrivacidade() {
  return (
    <div className="portal">
      <div className="p-wrap p-politica">
        <header className="p-cabeca">
          <img src={bratanMark} alt="" style={{ width: 48, height: 48, borderRadius: 12 }} />
          <h1 className="t-large">Política de privacidade</h1>
          <p className="t-sub t-2">Meu Bratan, o portal dos pacientes do Instituto Bratan. Atualizada em {ATUALIZADA_EM}.</p>
        </header>

        <section className="p-card">
          <h2 className="t-title3">Quem cuida dos seus dados</h2>
          <p className="t-body">
            O Meu Bratan é do INSTITUTO BRATAN RIBEIRO LTDA, a clínica onde você faz o seu acompanhamento. A clínica é a responsável pelos
            seus dados pessoais, nos termos da Lei Geral de Proteção de Dados, a Lei 13.709/2018.
          </p>
        </section>

        <section className="p-card">
          <h2 className="t-title3">O que o portal guarda</h2>
          <ul className="p-itens">
            <li>O seu nome e o seu contato, como estão na sua ficha da clínica.</li>
            <li>O seu login, a sua senha e o Face ID. A senha fica guardada só como um código, nunca como a senha que você digitou, e o Face ID fica no seu aparelho.</li>
            <li>O seu plano, as consultas, os passos do acompanhamento e o resumo do que você contratou e pagou.</li>
            <li>Os exames de bioimpedância feitos no Instituto.</li>
            <li>As pesagens e as fotos de evolução que você mesmo manda.</li>
            <li>O registro de cada acesso: o dia, o aparelho e o que foi feito.</li>
          </ul>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Para que usamos</h2>
          <ul className="p-itens">
            <li>Para acompanhar o seu tratamento e mostrar a sua evolução.</li>
            <li>Para avisar quando um exame chega ou lembrar de uma consulta, só se você ligar os avisos.</li>
            <li>Para cumprir o que a lei exige da clínica, como o prontuário e a nota fiscal.</li>
          </ul>
        </section>

        <section className="p-card">
          <h2 className="t-title3">O que nunca fazemos</h2>
          <ul className="p-itens">
            <li>Não vendemos os seus dados.</li>
            <li>Não usamos os seus dados de saúde em publicidade ou em campanha de marketing.</li>
            <li>As fotos de evolução só aparecem para você. Ninguém da equipe vê essas fotos pelo sistema da clínica.</li>
          </ul>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Com quem compartilhamos</h2>
          <p className="t-body">
            Só com os serviços que fazem o portal funcionar: a Supabase, onde ficam o banco de dados e os arquivos, e a Vercel, onde o portal
            está hospedado. Se você ligar os avisos no celular, eles passam pelo serviço de avisos da Apple ou do Google. Esses serviços tratam
            os dados só para atender o Instituto, e alguns guardam dados fora do Brasil, com as garantias da LGPD.
          </p>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Por quanto tempo guardamos</h2>
          <ul className="p-itens">
            <li>A sua conta do portal e o que você manda por ela ficam até você apagar a conta.</li>
            {O_QUE_FICA.map((item) => (
              <li key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}.</li>
            ))}
          </ul>
        </section>

        <section className="p-card" id="apagar">
          <h2 className="t-title3">Como apagar a sua conta</h2>
          <p className="t-body">
            No próprio portal, na aba Você, toque em "Apagar minha conta". A conta some na hora, sem precisar falar com ninguém. Saem:
          </p>
          <ul className="p-itens">
            {O_QUE_SE_APAGA.map((item) => (
              <li key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}.</li>
            ))}
          </ul>
          <p className="t-body">O que a lei manda a clínica guardar continua guardado, pelos prazos acima.</p>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Os seus direitos</h2>
          <p className="t-body">
            Pela LGPD, você pode confirmar se tratamos os seus dados, ver e corrigir esses dados, pedir que sejam apagados, saber com quem
            compartilhamos e retirar um consentimento. Para pedir, fale com a recepção do Instituto ou com a concierge pelo WhatsApp.
          </p>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Saúde</h2>
          <p className="t-body">
            O portal acompanha a sua evolução e não faz diagnóstico. A bioimpedância vem do exame feito no aparelho InBody do Instituto, e o
            peso da semana é o que você informa. Em qualquer dúvida sobre o seu tratamento, fale com o seu médico.
          </p>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Menores de idade</h2>
          <p className="t-body">O portal é para pacientes com 18 anos ou mais. O acompanhamento de quem tem menos de 18 anos é feito pelo responsável legal.</p>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Segurança</h2>
          <p className="t-body">
            A conexão é protegida, a senha nunca é guardada como foi digitada, o Face ID não sai do seu aparelho, as fotos ficam em arquivo
            privado e abrem por um link que vence em uma hora, e cada acesso fica registrado.
          </p>
        </section>

        <section className="p-card">
          <h2 className="t-title3">Mudanças nesta política</h2>
          <p className="t-body">Se esta política mudar, o portal avisa antes de a mudança valer.</p>
        </section>

        <Link to="/meu" className="p-btn full">Voltar ao portal</Link>
      </div>
    </div>
  );
}
