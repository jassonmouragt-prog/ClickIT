import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Privacidade — ClickIT',
  description: 'Como a ClickIT trata arquivos, dados de ativação e informações do seu computador.',
  alternates: { canonical: '/privacidade' },
};

const SECTIONS = [
  {
    title: 'Suas fotografias ficam no seu computador',
    body: 'O processamento principal da ClickIT é local. Seus arquivos de imagem são lidos no seu equipamento para análise e não são enviados para a nuvem para que a triagem aconteça.',
  },
  {
    title: 'O que sai do seu computador',
    body: 'Apenas as etapas que dependem de validação: ativação da licença e início do trial. Nesses casos é usado um identificador do dispositivo, em forma de hash, para impedir uso duplicado.',
  },
  {
    title: 'Trial',
    body: 'O trial de 20 minutos registra o hash do dispositivo para garantir que seja utilizado uma única vez. Não coletamos o conteúdo das suas fotografias.',
  },
  {
    title: 'Projetos e cache',
    body: 'Projetos, resultados de análise e cache ficam armazenados localmente, no seu ambiente. Você pode apagá-los a qualquer momento excluindo o projeto.',
  },
  {
    title: 'Esta página',
    body: 'A página institucional não usa cookies de rastreamento nem ferramentas de terceiros para perfilar visitantes.',
  },
  {
    title: 'Contato',
    body: 'Dúvidas sobre privacidade podem ser enviadas pelo canal de suporte indicado no rodapé.',
  },
];

export default function PrivacidadePage(): ReactNode {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-200px] left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(57,139,255,0.12),transparent_75%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(155,166,183,0.25),transparent)]" />
      </div>

      <div className="mx-auto max-w-3xl px-5 py-24 md:px-8 md:py-32">
        <Link href="/#topo" className="inline-flex" aria-label="ClickIT — início">
          <Logo />
        </Link>

        <p className="eyebrow mt-12">privacidade</p>
        <h1 className="mt-4 text-[clamp(30px,5vw,46px)] leading-[1.05] font-semibold tracking-[-0.03em] text-cloud">
          Privacidade
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-mist">
          A ClickIT foi desenhada para que o trabalho pesado aconteça no seu computador. Este documento explica, em
          linguagem direta, o que é processado localmente e o que depende de validação.
        </p>

        <div className="mt-12 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="border-t border-hairline pt-6">
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-cloud">{section.title}</h2>
              <p className="mt-3 text-[15.5px] leading-relaxed text-mist">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-6 border-t border-hairline pt-6 text-[14px]">
          <Link href="/#faq" className="text-mist transition-colors hover:text-cloud">
            Voltar para a página
          </Link>
          <Link href="/termos" className="text-mist transition-colors hover:text-cloud">
            Termos de uso
          </Link>
        </div>
      </div>
    </main>
  );
}
