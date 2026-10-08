import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Termos de uso — ClickIT',
  description: 'Condições de uso da licença, do trial e dos recursos da ClickIT.',
  alternates: { canonical: '/termos' },
};

const SECTIONS = [
  {
    title: 'Licença de uso',
    body: 'A compra concede uso da ClickIT para o equipamento ativado. A ativação usa um identificador do dispositivo e pode ser refeita em caso de troca de máquina, dentro do limite de uso contratado.',
  },
  {
    title: 'Trial',
    body: 'O trial de 20 minutos é oferecido uma única vez por dispositivo. Ele libera o fluxo completo de análise e revisão para que você avalie o produto antes de comprar.',
  },
  {
    title: 'Seus arquivos',
    body: 'A ClickIT não reivindica propriedade sobre suas fotografias. A análise é local e os originais não são modificados: as alterações de seleção são registradas em um arquivo de sidecar (XMP).',
  },
  {
    title: 'Recursos em validação',
    body: 'Alguns formatos RAW (CR2, CR3, NEF, ARW) e a compatibilidade de exportação XMP com softwares de terceiros ainda passam por validação de runtime. DNG e JPEG estão validados. Recursos em validação podem mudar entre versões.',
  },
  {
    title: 'Uso aceitável',
    body: 'É proibido contornar a ativação, redistribuir a aplicação ou usar o trial de forma reiterada para evitar a compra.',
  },
  {
    title: 'Alterações',
    body: 'Estes termos podem ser atualizados a cada versão relevante do produto. O uso continuado após uma atualização implica concordância com a versão vigente.',
  },
  {
    title: 'Contato',
    body: 'Dúvidas sobre licença ou termos podem ser enviadas pelo canal de suporte indicado no rodapé.',
  },
];

export default function TermosPage(): ReactNode {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-200px] left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,77,255,0.12),transparent_75%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(155,166,183,0.25),transparent)]" />
      </div>

      <div className="mx-auto max-w-3xl px-5 py-24 md:px-8 md:py-32">
        <Link href="/#topo" className="inline-flex" aria-label="ClickIT — início">
          <Logo />
        </Link>

        <p className="eyebrow mt-12">termos</p>
        <h1 className="mt-4 text-[clamp(30px,5vw,46px)] leading-[1.05] font-semibold tracking-[-0.03em] text-cloud">
          Termos de uso
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-mist">
          Condições simples para o uso da licença, do trial e dos recursos da ClickIT. Documento informativo, sujeito a
          atualização a cada versão relevante do produto.
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
          <Link href="/privacidade" className="text-mist transition-colors hover:text-cloud">
            Privacidade
          </Link>
        </div>
      </div>
    </main>
  );
}
