// Cliente do Supabase (contas, moedas, XP, códigos, admin). Só usa a chave pública.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'imita.auth.v1' },
});

/** Mensagens do servidor em português e sem jargão. */
export function friendlyError(raw: unknown): string {
  const msg = String((raw as { message?: string })?.message ?? raw ?? '');
  if (msg.includes('IMITA:')) return msg.slice(msg.indexOf('IMITA:') + 6).trim();
  if (/invalid login credentials/i.test(msg)) return 'Usuário ou senha incorretos.';
  if (/already registered|already been registered|user_already_exists/i.test(msg)) return 'Esse nome já está em uso.';
  if (/password should be at least|weak.?password/i.test(msg)) return 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.';
  if (/database error saving new user/i.test(msg)) return 'Não deu para criar a conta. Confira os dados e tente de novo.';
  if (/rate limit|too many|over_request_rate_limit/i.test(msg)) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
  if (/failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/jwt|session|not authenticated|refresh token/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  return msg || 'Algo deu errado. Tente de novo.';
}

export const isNetworkError = (e: unknown) => /internet|conexão|fetch|network/i.test(String((e as Error)?.message ?? e));

/** Chama uma função do banco (RPC) e devolve o resultado, ou lança um erro já traduzido. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await supabase.rpc(fn, args);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data as T;
}
