// Telas de conta: entrar, criar conta, termos, conta bloqueada, advertência e "Minha conta".
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { sfx, unlockAudio } from '../audio/engine';
import { ageFrom, MIN_AGE, USERNAME_RE, type AuthApi } from '../auth/useAuth';
import { Logo, Seg, Sheet } from '../components/ui';
import { CAT_K, progress, TOTAL_K, XP_CATEGORIES } from '../game/levels';
import { CONTACT_EMAIL, PRIVACY, TERMS, type LegalDoc } from '../legal/texts';
import { rpc } from '../net/supabase';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const errMsg = (e: unknown) => (e as Error)?.message || 'Algo deu errado. Tente de novo.';

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="auth-field">
      <span className="auth-label">{label}</span>
      {children}
      {hint && <span className="small faint">{hint}</span>}
    </label>
  );
}

function PasswordInput({ value, onChange, autoComplete, invalid }: { value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`auth-pass ${invalid ? 'bad' : ''}`}>
      <input className="auth-input" type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} maxLength={72} />
      <button type="button" className="auth-eye" aria-label={show ? 'Esconder a senha' : 'Mostrar a senha'} onClick={() => setShow((s) => !s)}>
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- textos legais

function Lines({ lines }: { lines: string[] }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul-${out.length}`}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  lines.forEach((l, i) => {
    if (l.startsWith('• ')) list.push(l.slice(2));
    else { flush(); out.push(<p key={`p-${i}`}>{l}</p>); }
  });
  flush();
  return <>{out}</>;
}

export function LegalSheet({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <h2 className="title-m" style={{ margin: 0 }}>{doc.title}</h2>
      <span className="small faint">Atualizado em {doc.updated}</span>
      <div className="legal-doc">
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            <Lines lines={s.lines} />
          </section>
        ))}
      </div>
      <button className="btn cyan" onClick={onClose}>Fechar</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- entrar / criar conta

function LoginForm({ auth }: { auth: AuthApi }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    setErr(null);
    setBusy(true);
    try {
      await auth.signIn(u, p);
      sfx('go');
    } catch (x) {
      setErr(errMsg(x));
      sfx('bad');
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label="Nome de usuário">
        <input className="auth-input" value={u} onChange={(e) => setU(e.target.value.replace(/\s/g, ''))} autoComplete="username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={16} />
      </Field>
      <Field label="Senha">
        <PasswordInput value={p} onChange={setP} autoComplete="current-password" />
      </Field>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="btn big pink" disabled={busy || u.length < 3 || !p}>{busy ? 'Entrando…' : 'Entrar'}</button>
      <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setForgot((f) => !f)}>Esqueci a senha</button>
      {forgot && (
        <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>
          O jogo não envia e-mail. Escreva para <b>{CONTACT_EMAIL}</b> com o seu nome de usuário: depois de confirmar que a conta é sua, o admin define uma senha nova.
        </p>
      )}
    </form>
  );
}

type Avail = null | 'checking' | 'free' | 'taken' | 'invalid' | 'offline';

function SignupForm({ auth, onLegal }: { auth: AuthApi; onLegal: (d: LegalDoc) => void }) {
  const [u, setU] = useState('');
  const [avail, setAvail] = useState<Avail>(null);
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [birth, setBirth] = useState('');
  const [gName, setGName] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [gOk, setGOk] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!u) { setAvail(null); return; }
    if (!USERNAME_RE.test(u)) { setAvail('invalid'); return; }
    setAvail('checking');
    let alive = true;
    const t = setTimeout(() => {
      rpc<boolean>('username_available', { p_username: u })
        .then((ok) => { if (alive) setAvail(ok ? 'free' : 'taken'); })
        .catch(() => { if (alive) setAvail('offline'); });
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [u]);

  const today = new Date().toISOString().slice(0, 10);
  const age = birth ? ageFrom(birth) : NaN;
  const validAge = Number.isFinite(age) && age >= 0 && age <= 120;
  const tooYoung = validAge && age < MIN_AGE;
  const minor = validAge && age >= MIN_AGE && age < 18;
  const guardianOk = !minor || (gName.trim().length >= 3 && EMAIL_RE.test(gEmail.trim()) && gOk);
  const canSubmit = (avail === 'free' || avail === 'offline') && p.length >= 8 && p === p2 && validAge && !tooYoung && guardianOk && terms && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    unlockAudio();
    setErr(null);
    setBusy(true);
    try {
      await auth.signUp({ username: u, password: p, birthdate: birth, guardianName: gName, guardianEmail: gEmail, guardianConsent: gOk, acceptedTerms: terms });
      sfx('go');
    } catch (x) {
      setErr(errMsg(x));
      sfx('bad');
      setBusy(false);
    }
  };

  const availText: Record<Exclude<Avail, null>, ReactNode> = {
    checking: <span className="faint">Conferindo…</span>,
    free: <span className="ok-text">✓ Esse nome está livre</span>,
    taken: <span className="bad-text">✗ Esse nome já está em uso</span>,
    invalid: <span className="bad-text">Use 3 a 16 letras, números, _ ou ponto (sem espaço nem acento)</span>,
    offline: <span className="faint">Não deu para conferir agora; vamos tentar ao criar.</span>,
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label="Nome de usuário" hint={avail ? availText[avail] : 'É assim que os outros vão te ver. Não dá para trocar depois.'}>
        <input className={`auth-input ${avail === 'taken' || avail === 'invalid' ? 'bad' : ''}`} value={u}
          onChange={(e) => setU(e.target.value.replace(/\s/g, ''))} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={16} />
      </Field>
      <Field label="Senha" hint={p && p.length < 8 ? <span className="bad-text">Pelo menos 8 caracteres</span> : 'Pelo menos 8 caracteres. Não use a mesma senha de outros sites.'}>
        <PasswordInput value={p} onChange={setP} autoComplete="new-password" invalid={!!p && p.length < 8} />
      </Field>
      <Field label="Repita a senha" hint={p2 && p !== p2 ? <span className="bad-text">As senhas não são iguais</span> : undefined}>
        <PasswordInput value={p2} onChange={setP2} autoComplete="new-password" invalid={!!p2 && p !== p2} />
      </Field>
      <Field label="Data de nascimento" hint="Usada só para conferir a idade mínima (12 anos).">
        <input className="auth-input" type="date" value={birth} max={today} min="1900-01-01" onChange={(e) => setBirth(e.target.value)} />
      </Field>
      {tooYoung && <div className="error" role="alert">É preciso ter pelo menos {MIN_AGE} anos para criar conta.</div>}

      {minor && (
        <div className="auth-guardian stack">
          <div className="caps">Autorização do responsável</div>
          <p className="small muted" style={{ margin: 0 }}>
            Como você tem menos de 18 anos, um responsável (pai, mãe ou responsável legal) precisa autorizar. Preencham juntos.
          </p>
          <Field label="Nome do responsável">
            <input className="auth-input" value={gName} onChange={(e) => setGName(e.target.value)} autoComplete="off" maxLength={80} />
          </Field>
          <Field label="E-mail do responsável" hint="Só para falar sobre esta conta. Nunca para propaganda.">
            <input className="auth-input" type="email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} autoComplete="off" autoCapitalize="none" maxLength={120} />
          </Field>
          <label className="check-row">
            <input type="checkbox" checked={gOk} onChange={(e) => setGOk(e.target.checked)} />
            <span>Sou o responsável por este menor e autorizo a criação da conta, de acordo com os Termos de Uso e a Política de Privacidade.</span>
          </label>
        </div>
      )}

      <label className="check-row">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>
          Li e aceito os <button type="button" className="link-btn inline" onClick={() => onLegal(TERMS)}>Termos de Uso</button> e
          a <button type="button" className="link-btn inline" onClick={() => onLegal(PRIVACY)}>Política de Privacidade</button>.
        </span>
      </label>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="btn big pink" disabled={!canSubmit}>{busy ? 'Criando a conta…' : 'Criar conta'}</button>
    </form>
  );
}

export function AuthScreen({ auth }: { auth: AuthApi }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [legal, setLegal] = useState<LegalDoc | null>(null);
  return (
    <div className="screen auth-screen">
      <div className="auth-hero">
        <Logo big />
        <p className="muted" style={{ margin: 0 }}>Entre na sua conta para jogar.</p>
      </div>
      <section className="card stack auth-card">
        <Seg label="Entrar ou criar conta" value={mode} onChange={setMode} options={[{ v: 'login', t: 'Entrar' }, { v: 'signup', t: 'Criar conta' }]} />
        {mode === 'login' ? <LoginForm auth={auth} /> : <SignupForm auth={auth} onLegal={setLegal} />}
      </section>
      <footer className="auth-legal small">
        <div>
          <button className="link-btn inline" onClick={() => setLegal(TERMS)}>Termos de Uso</button>
          {' · '}
          <button className="link-btn inline" onClick={() => setLegal(PRIVACY)}>Política de Privacidade</button>
        </div>
        <div className="faint">Contato: {CONTACT_EMAIL}</div>
      </footer>
      {legal && <LegalSheet doc={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- bloqueio e advertência

const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function BlockedScreen({ auth }: { auth: AuthApi }) {
  const b = auth.block!;
  const title = b.kind === 'ban' ? 'Conta banida' : b.kind === 'ip_block' ? 'Acesso bloqueado nesta rede' : 'Conta suspensa';
  return (
    <div className="screen center auth-screen">
      <div className="card stack blocked-card">
        <div className="blocked-icon" aria-hidden>{b.kind === 'ban' ? '⛔' : '⏸️'}</div>
        <h1 className="title-l" style={{ margin: 0 }}>{title}</h1>
        <p style={{ margin: 0 }}><b>Motivo:</b> {b.reason}</p>
        <p className="muted" style={{ margin: 0 }}>{b.ends_at ? `Termina em ${fmtDate(b.ends_at)}.` : 'Não tem data para terminar.'}</p>
        <p className="small faint" style={{ margin: 0 }}>Se você acha que foi um engano, escreva para {CONTACT_EMAIL}.</p>
        <div className="row">
          <button className="btn ghost grow" onClick={() => auth.signOut()}>Sair da conta</button>
          {b.ends_at && <button className="btn cyan grow" onClick={() => location.reload()}>Tentar de novo</button>}
        </div>
      </div>
    </div>
  );
}

export function WarningSheet({ auth }: { auth: AuthApi }) {
  const w = auth.warnings[0];
  if (!w) return null;
  return (
    <Sheet onClose={() => {}}>
      <h2 className="title-m" style={{ margin: 0 }}>⚠️ Advertência do admin</h2>
      <p style={{ margin: 0 }}>{w.reason}</p>
      <p className="small faint" style={{ margin: 0 }}>
        Recebida em {fmtDate(w.at)}. Se continuar, a conta pode ser suspensa. Dúvidas: {CONTACT_EMAIL}.
      </p>
      <button className="btn pink" onClick={() => auth.ackWarning(w.id)}>Entendi</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- minha conta

function ChangePassword({ auth }: { auth: AuthApi }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setOpen(true)}>Trocar senha</button>;
  const go = async () => {
    setBusy(true);
    setM(null);
    try {
      await auth.changePassword(p);
      setM({ ok: true, text: 'Senha trocada!' });
      setP(''); setP2('');
    } catch (x) {
      setM({ ok: false, text: errMsg(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <b>Trocar senha</b>
      <Field label="Senha nova" hint="Pelo menos 8 caracteres.">
        <PasswordInput value={p} onChange={setP} autoComplete="new-password" invalid={!!p && p.length < 8} />
      </Field>
      <Field label="Repita a senha nova" hint={p2 && p !== p2 ? <span className="bad-text">As senhas não são iguais</span> : undefined}>
        <PasswordInput value={p2} onChange={setP2} autoComplete="new-password" invalid={!!p2 && p !== p2} />
      </Field>
      {m && <div className={m.ok ? 'admin-ok' : 'error'} role={m.ok ? 'status' : 'alert'}>{m.text}</div>}
      <div className="row">
        <button className="btn ghost grow" onClick={() => { setOpen(false); setM(null); }}>Fechar</button>
        <button className="btn cyan grow" disabled={busy || p.length < 8 || p !== p2} onClick={go}>{busy ? 'Trocando…' : 'Trocar'}</button>
      </div>
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div className="lvl-bar"><div style={{ width: `${Math.round(pct * 100)}%`, background: color }} /></div>;
}

export function AccountSheet({ auth, onClose, onAdmin }: { auth: AuthApi; onClose: () => void; onAdmin?: () => void }) {
  const me = auth.me!;
  const [legal, setLegal] = useState<LegalDoc | null>(null);
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { auth.refresh().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = progress(me.total_xp, TOTAL_K);
  const remove = async () => {
    setErr(null);
    setBusy(true);
    try {
      await auth.deleteAccount();
    } catch (x) {
      setErr(errMsg(x));
      setBusy(false);
    }
  };

  if (legal) return <LegalSheet doc={legal} onClose={() => setLegal(null)} />;
  return (
    <Sheet onClose={onClose}>
      <div className="row between">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="caps">Minha conta</span>
          <b className="title-m" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.username}</b>
        </div>
        {me.role === 'admin' && <span className="badge yellow">🛡️ Admin</span>}
      </div>
      {auth.offline && <div className="small faint">Sem internet: mostrando os dados guardados neste aparelho.</div>}

      <div className="lvl-card" style={{ ['--tc' as string]: total.title.color }}>
        <div className="row between">
          <b>{total.title.emoji} {total.title.name} · nível {total.level}</b>
          <span className="small">🪙 {me.coins}</span>
        </div>
        <Bar pct={total.pct} color={total.title.color} />
        <span className="small faint">{total.level >= 50 ? 'Nível máximo!' : `Faltam ${total.xpToNext} XP para o nível ${total.level + 1}`}</span>
      </div>

      <div className="lvl-grid">
        {XP_CATEGORIES.map((c) => {
          const pr = progress(me.xp?.[c.id]?.xp ?? 0, CAT_K);
          return (
            <div key={c.id} className="lvl-cat">
              <div className="row between small"><b>{c.emoji} {c.label}</b><span>nv {pr.level}</span></div>
              <Bar pct={pr.pct} color={pr.title.color} />
              <span className="small faint">{pr.title.emoji} {pr.title.name}</span>
            </div>
          );
        })}
      </div>

      {onAdmin && me.role === 'admin' && <button className="btn yellow" onClick={onAdmin}>🛡️ Menu de admin</button>}

      <div className="row wrap" style={{ justifyContent: 'center', gap: 12 }}>
        <button className="link-btn" onClick={() => setLegal(TERMS)}>Termos de Uso</button>
        <button className="link-btn" onClick={() => setLegal(PRIVACY)}>Política de Privacidade</button>
      </div>
      <ChangePassword auth={auth} />
      <button className="btn ghost" onClick={() => auth.signOut()}>Sair da conta</button>

      {!del ? (
        <button className="link-btn danger" style={{ alignSelf: 'center' }} onClick={() => setDel(true)}>Excluir minha conta</button>
      ) : (
        <div className="danger-box stack">
          <b>Excluir a conta para sempre?</b>
          <p className="small" style={{ margin: 0 }}>
            Apaga na hora o seu perfil, moedas, XP, níveis, roupas e extratos. Não dá para desfazer.
            Por segurança, os registros de acesso ficam guardados por até 6 meses e punições continuam valendo.
          </p>
          <Field label={`Para confirmar, digite: ${me.username}`}>
            <input className="auth-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </Field>
          {err && <div className="error" role="alert">{err}</div>}
          <div className="row">
            <button className="btn ghost grow" onClick={() => { setDel(false); setTyped(''); }}>Cancelar</button>
            <button className="btn red grow" disabled={busy || typed.trim() !== me.username} onClick={remove}>{busy ? 'Excluindo…' : 'Excluir para sempre'}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
