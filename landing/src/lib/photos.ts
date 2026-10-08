export type PhotoLabel =
  | { kind: 'pick' }
  | { kind: 'eyes' }
  | { kind: 'blur' }
  | { kind: 'stars'; value: number }
  | { kind: 'heart' };

export type Shot = {
  src: string;
  alt: string;
  name: string;
  flags?: PhotoLabel[];
};

export const HERO_GRID: Shot[] = [
  { src: '/photos/cmp-02.webp', alt: 'Retrato em estúdio, sequência analisada', name: 'DSC_4821' },
  { src: '/photos/por-04.webp', alt: 'Retrato com luz suave', name: 'DSC_4822' },
  { src: '/photos/land-01.webp', alt: 'Paisagem montanhosa ao amanhecer', name: 'DSC_4823' },
  { src: '/photos/cmp-05.webp', alt: 'Close de retrato', name: 'DSC_4824' },
  { src: '/photos/por-02.webp', alt: 'Retrato com olhos fechados', name: 'DSC_4825', flags: [{ kind: 'eyes' }] },
  { src: '/photos/cmp-01.webp', alt: 'Retrato em ambiente interno', name: 'DSC_4826' },
  { src: '/photos/obj-01.webp', alt: 'Câmara analógica sobre a mesa', name: 'DSC_4827' },
  { src: '/photos/cmp-07.webp', alt: 'Retrato em enquadramento aberto', name: 'DSC_4828', flags: [{ kind: 'pick' }] },
  { src: '/photos/por-01.webp', alt: 'Retrato em sequência', name: 'DSC_4829', flags: [{ kind: 'stars', value: 5 }] },
  { src: '/photos/cmp-04.webp', alt: 'Retrato em enquadramento fechado', name: 'DSC_4830' },
  { src: '/photos/seq-01.webp', alt: 'Sequência com dois sujeitos', name: 'DSC_4831', flags: [{ kind: 'stars', value: 4 }] },
  { src: '/photos/cmp-08.webp', alt: 'Retrato em plano médio', name: 'DSC_4832', flags: [{ kind: 'heart' }] },
];

export type PickCard = {
  src: string;
  alt: string;
  name: string;
  verdict: string;
  tone: 'neutral' | 'warn' | 'blur' | 'pick' | 'alt';
  note: string;
};

export const PICK_GROUP: PickCard[] = [
  {
    src: '/photos/por-01.webp',
    alt: 'Primeira foto da sequência',
    name: 'DSC_4821',
    verdict: 'Boa',
    tone: 'neutral',
    note: 'Foco e exposição consistentes com o restante da sequência.',
  },
  {
    src: '/photos/por-02.webp',
    alt: 'Segunda foto da sequência, olhos fechados',
    name: 'DSC_4822',
    verdict: 'Olhos fechados',
    tone: 'warn',
    note: 'Rosto detectado, olhos sinalizados como possivelmente fechados.',
  },
  {
    src: '/photos/por-03.webp',
    alt: 'Terceira foto da sequência, possível desfoque',
    name: 'DSC_4823',
    verdict: 'Possível desfoque',
    tone: 'blur',
    note: 'Nitidez regional abaixo do padrão das demais fotos do grupo.',
  },
  {
    src: '/photos/por-04.webp',
    alt: 'Quarta foto da sequência, escolhida como ClickIT Pick',
    name: 'DSC_4824',
    verdict: 'ClickIT Pick',
    tone: 'pick',
    note: 'Melhor candidata do grupo na leitura técnica e estética.',
  },
  {
    src: '/photos/por-05.webp',
    alt: 'Quinta foto da sequência, alternativa',
    name: 'DSC_4825',
    verdict: 'Alternativa',
    tone: 'alt',
    note: 'Recebeu ranking alto e continua disponível para comparação.',
  },
];

export const AUDIENCE = [
  { title: 'Casamentos', detail: 'Cerimônia, recepção e escolhas entre milhares de quadros parecidos.' },
  { title: 'Ensaios', detail: 'Sequências longas com pequenas variações de pose e enquadramento.' },
  { title: 'Eventos', detail: 'Cobertura contínua, luz mista e muitas decisões repetitivas.' },
  { title: 'Retratos', detail: 'Expressão, foco nos olhos e alternativas de cada clipe.' },
  { title: 'Estúdio', detail: 'Produção dirigida com comparações lado a lado.' },
  { title: 'Social', detail: 'Conteúdo recorrente que precisa sair do cardápio mais rápido.' },
];
