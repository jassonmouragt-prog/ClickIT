'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { TRIAL_MINUTES } from '@/config/product';

const QUESTIONS = [
  {
    q: 'A ClickIT escolhe minhas fotos automaticamente?',
    a: 'Ela sugere ClickIT Picks e prioridades. Você continua responsável pela seleção final.',
  },
  {
    q: 'Minhas imagens vão para a nuvem?',
    a: 'O processamento principal é local. O ensaio é analisado no seu computador.',
  },
  {
    q: 'A ClickIT altera os meus arquivos?',
    a: 'Não. Os originais são preservados. A análise é feita em leitura e a exportação copia os escolhidos.',
  },
  {
    q: 'Posso trocar um ClickIT Pick?',
    a: 'Sim. Você pode trocar o Pick, favoritar, reavaliar e rejeitar qualquer fotografia.',
  },
  {
    q: 'Ela funciona com grandes volumes?',
    a: 'O pipeline foi validado em lotes de até 1.000 imagens, com cache e retomada.',
  },
  {
    q: 'Ela trabalha com RAW?',
    a: 'DNG já foi validado. Outros formatos RAW continuam em validação.',
  },
  {
    q: 'A edição já funciona?',
    a: 'A ClickIT já possui perfil de estilo, plano de edição, preview não destrutivo e exportação XMP.',
  },
  {
    q: 'Preciso de Lightroom?',
    a: 'A seleção não. A exportação XMP foi criada para integrar-se a fluxos compatíveis; validação de runtime Adobe ainda está pendente.',
  },
  {
    q: 'Preciso estar conectado à internet?',
    a: 'A ativação e o trial precisam de validação. Depois, o sistema possui funcionamento offline conforme o tipo de licença.',
  },
  {
    q: 'Como funciona o teste?',
    a: `Você recebe ${TRIAL_MINUTES} minutos completos no dispositivo. Depois, pode ativar sua licença paga sem reinstalar.`,
  },
];

export function Faq(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-faq]'), {
      scrollTrigger: { trigger: scope, start: 'top 80%', once: true },
      y: 18,
      opacity: 0,
      duration: 0.6,
      stagger: 0.05,
      ease: 'power3.out',
    });
  });

  return (
    <section id="faq" ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader eyebrow="perguntas frequentes" title={['O que fotógrafos', 'costumam perguntar.']} align="center" />

        <div className="mx-auto mt-12 max-w-3xl">
          {QUESTIONS.map((item) => (
            <details key={item.q} data-faq className="group border-b border-hairline py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16.5px] font-medium text-cloud marker:hidden">
                {item.q}
                <span className="relative h-4 w-4 shrink-0 text-mist">
                  <span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-current" />
                  <span className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:rotate-90" />
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-mist">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
