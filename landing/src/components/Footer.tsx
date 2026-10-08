import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { SUPPORT_URL } from '@/lib/site';
import { PRODUCT_TAGLINE } from '@/config/product';

const LINKS = [
  { href: '/#recursos', label: 'Recursos' },
  { href: '/#editar', label: 'Editar' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/termos', label: 'Termos' },
  { href: SUPPORT_URL, label: 'Suporte' },
];

export function Footer(): ReactNode {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-[1240px] px-5 py-14 md:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <a href="/#topo" aria-label="ClickIT — início">
              <Logo />
            </a>
            <p className="mt-4 max-w-xs text-[14.5px] leading-relaxed text-mist">{PRODUCT_TAGLINE}</p>
            <p className="mt-5 text-[12.5px] text-fog">Processamento local · Windows</p>
          </div>

          <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-12 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[14px] text-mist transition-colors hover:text-cloud"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 text-[12.5px] text-fog sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} ClickIT. Todos os direitos reservados.</span>
          <span>Seleção inteligente para fotógrafos.</span>
        </div>
      </div>
    </footer>
  );
}
