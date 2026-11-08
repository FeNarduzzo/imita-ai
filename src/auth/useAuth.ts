// Login, cadastro, sessão e punições. Ninguém entra no jogo sem passar por aqui.
// O login é por nome de usuário: por trás, o Supabase usa um endereço interno
// (nome@imita-ai.fenarduzzo.github.io) que nunca recebe e-mail.
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Look } from '../game/character';
import type { XpCategory } from '../game/levels';
import { TERMS_VERSION } from '../legal/texts';
import { friendlyError, isNetworkError, rpc, supabase } from '../net/supabase';

export interface MeXp { xp: number; level: number; title: string }
export interface Me {
  id: string;
  username: string;
  role: 'player' | 'admin';
  coins: number;
  look: Look | null;
  level: number;
  title: string;
  total_xp: number;
  minor: boolean;
  xp: Record<XpCategory, MeXp>;
  items: string[];
}
export interface Block { kind: 'suspension' | 'ban' | 'ip_block'; reason: string; ends_at: string | null }
export interface Warning { id: string; reason: string; at: string }
export type AuthStatus = 'loading' | 'signedOut' | 'blocked' | 'ready';

export interface SignUpData {
  username: string;
  password: string;
  birthdate: string; // AAAA-MM-DD
  guardianName?: string;
  guardianEmail?: string;
  guardianConsent?: boolean;
  acceptedTerms: boolean;
}

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,16}$/;
export const MIN_AGE = 12;
const EMAIL_DOMAIN = 'imita-ai.fenarduzzo.github.io';
const DEVICE_KEY = 'imita.device.v1';
const ME_KEY = 'imita.me.v1';

export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export function ageFrom(birthdate: string, today = new Date()): number {
  const b = new Date(`${birthdate}T12:00:00`);
  if (Number.isNaN(b.getTime())) return NaN;
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

/** Identificador aleatório deste aparelho (para as punições valerem no aparelho, não só na conta). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'sem-armazenamento';
  }
}

const readMe = (): Me | null => { try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch { return null; } };
const writeMe = (m: Me | null) => { try { if (m) localStorage.setItem(ME_KEY, JSON.stringify(m)); else localStorage.removeItem(ME_KEY); } catch { /* ok */ } };

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [block, setBlock] = useState<Block | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [offline, setOffline] = useState(false);
  const entering = useRef(false);

  const signedOut = useCallback(() => {
    writeMe(null);
    setMe(null);
    setBlock(null);
    setWarnings([]);
    setStatus('signedOut');
  }, []);

  /** Depois do login (ou ao abrir o app com sessão salva): registra o acesso e carrega o perfil. */
  const enter = useCallback(async (session: Session | null) => {
    if (!session) { signedOut(); return; }
    if (entering.current) return;
    entering.current = true;
    try {
      const acc = await rpc<{ blocked: boolean; block: Block | null; warnings: Warning[] }>('register_access', {
        p_device: deviceId(), p_user_agent: navigator.userAgent.slice(0, 300),
      });
      if (acc.blocked && acc.block) { setBlock(acc.block); setStatus('blocked'); return; }
      setWarnings(acc.warnings || []);
      const m = await rpc<Me | null>('me');
      if (!m) { await supabase.auth.signOut({ scope: 'local' }); signedOut(); return; }
      writeMe(m);
      setMe(m);
      setOffline(false);
      setStatus('ready');
    } catch (e) {
      // Sem internet: deixa jogar com o perfil guardado deste aparelho.
      const cached = readMe();
      if (isNetworkError(e) && cached && cached.id === session.user.id) {
        setMe(cached);
        setOffline(true);
        setStatus('ready');
      } else {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        signedOut();
        throw e;
      }
    } finally {
      entering.current = false;
    }
  }, [signedOut]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) return enter(data.session); })
      .catch(() => { if (alive) signedOut(); });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') signedOut();
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [enter, signedOut]);

  const signIn = useCallback(async (username: string, password: string) => {
    if (!USERNAME_RE.test(username.trim())) throw new Error('Nome de usuário inválido.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) throw new Error(friendlyError(error));
    await enter(data.session);
  }, [enter]);

  const signUp = useCallback(async (d: SignUpData) => {
    const username = d.username.trim();
    if (!USERNAME_RE.test(username)) throw new Error('Nome de usuário: 3 a 16 letras, números, _ ou ponto.');
    if (d.password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    const age = ageFrom(d.birthdate);
    if (!Number.isFinite(age) || age > 120 || age < 0) throw new Error('Data de nascimento inválida.');
    if (age < MIN_AGE) throw new Error(`É preciso ter pelo menos ${MIN_AGE} anos para criar conta.`);
    const minor = age < 18;
    if (minor && (!d.guardianName || d.guardianName.trim().length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.guardianEmail || '') || !d.guardianConsent)) {
      throw new Error('Menores de 18 anos precisam do nome, do e-mail e da autorização de um responsável.');
    }
    if (!d.acceptedTerms) throw new Error('É preciso aceitar os Termos de Uso e a Política de Privacidade.');
    const free = await rpc<boolean>('username_available', { p_username: username });
    if (!free) throw new Error('Esse nome já está em uso. Escolha outro.');
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password: d.password,
      options: {
        data: {
          username, birthdate: d.birthdate, terms_version: TERMS_VERSION,
          ...(minor ? { guardian_name: d.guardianName!.trim(), guardian_email: d.guardianEmail!.trim(), guardian_consent: true } : {}),
        },
      },
    });
    if (error) throw new Error(friendlyError(error));
    if (!data.session) throw new Error('A conta foi criada, mas o servidor ainda pede confirmação de e-mail. Avise o admin.');
    await enter(data.session);
  }, [enter]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    signedOut();
  }, [signedOut]);

  const deleteAccount = useCallback(async () => {
    await rpc('delete_my_account');
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    signedOut();
  }, [signedOut]);

  const changePassword = useCallback(async (password: string) => {
    if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(friendlyError(error));
  }, []);

  const refresh = useCallback(async () => {
    const m = await rpc<Me | null>('me');
    if (m) { writeMe(m); setMe(m); }
    return m;
  }, []);

  const ackWarning = useCallback(async (id: string) => {
    await rpc('ack_warning', { p_id: id }).catch(() => {});
    setWarnings((w) => w.filter((x) => x.id !== id));
  }, []);

  return { status, me, block, warnings, offline, signIn, signUp, signOut, deleteAccount, changePassword, refresh, ackWarning };
}

export type AuthApi = ReturnType<typeof useAuth>;
