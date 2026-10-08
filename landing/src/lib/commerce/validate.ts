import { CommerceError, type CustomerInput } from './types.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Valida o formulário de compra. Nada de preço aqui: o cliente jamais
 * envia valor — apenas identificação.
 */
export function validateCustomer(input: unknown): CustomerInput {
  if (typeof input !== 'object' || input === null) {
    throw new CommerceError('INVALID_CUSTOMER', 'Corpo inválido.');
  }
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const phone = typeof raw.phone === 'string' ? raw.phone.trim() : '';

  if (name.length < 2 || name.length > 120) {
    throw new CommerceError('INVALID_CUSTOMER', 'Nome inválido.');
  }
  if (email.length > 160 || !EMAIL.test(email)) {
    throw new CommerceError('INVALID_CUSTOMER', 'E-mail inválido.');
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    throw new CommerceError('INVALID_CUSTOMER', 'WhatsApp inválido.');
  }

  return { name, email, phone: phone.startsWith('+') ? `+${digits}` : digits };
}
