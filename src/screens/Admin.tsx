// Menu de admin: jogadores (ver, dar/tirar, punir, nova senha), códigos promocionais e histórico.
// Tudo passa pelas funções admin_* do banco, que conferem se quem chama é admin.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { sfx } from '../audio/engine';
import type { AuthApi } from '../auth/useAuth';
import { Seg } from '../components/ui';
import { CATEGORIES, ITEMS } from '../game/character';
import { CAT_K, progress, XP_CATEGORIES, type XpCategory } from '../game/levels';
import { rpc } from '../net/supabase';

interface UserRow { id: string; username: string; role: string; level: number; title: string; coins: number; last_seen_at: string | null; created_at: string; minor: boolean; blocked: string | null }
interface Punishment { id: string; kind: Kind; reason: string; starts_at: string; ends_at: string | null; seen_at: string | null; revoked_at: string | null; ip: string | null; created_at: string }
interface UserDetail {
  profile: { id: string; username: string; role: string; coins: number; level: number; title: string; birthdate: string; guardian_name: string | null; guardian_email: string | null; created_at: string; last_seen_at: string | null };
  xp: Partial<Record<XpCategory, number>>;
  items: string[];
  access: { ip: string | null; device_id: string | null; user_agent: string | null; created_at: string }[];
  ips: { ip: string; times: number; last: string }[];
  same_device: string[];
  punishments: Punishment[];
  ledger: { delta: number; balance: number; reason: string; created_at: string }[];
}
interface CodeRow { id: string; code: string; coins: number; xp: Partial<Record<XpCategory, number>>; item_id: string | null; max_uses: number | null; uses: number; expires_at: string | null; active: boolean; note: string | null; created_at: string }
interface AuditRow { admin_name: string | null; action: string; target_name: string | null; details: Record<string, unknown>; created_at: string }
type Kind = 'warning' | 'suspension' | 'ban' | 'ip_block';

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const KIND: Record<Kind, string> = { warning: '⚠️ Advertência', suspension: '⏸️ Suspensão', ban: '⛔ Banimento', ip_block: '🌐 Bloqueio de IP' };
const DURATIONS = [{ v: 60, t: '1 hora' }, { v: 1440, t: '24 h' }, { v: 10080, t: '7 dias' }, { v: 43200, t: '30 dias' }];
const SPECIAL_ITEMS = ITEMS.filter((i) => i.price > 0 || (i as { exclusive?: string }).exclusive);
const itemName = (id: string | null) => (id ? ITEMS.find((i) => i.id === id)?.name ?? id : '');
const CAT_PT: Record<string, string> = { skin: 'pele', hairColor: 'cor do cabelo', hair: 'cabelo', face: 'rosto', top: 'parte de cima', bottom: 'parte de baixo', shoes: 'calçado', hat: 'chapéu', acc: 'acessório' };
const itemLabel = (i: (typeof ITEMS)[number]) => `${i.name} (${CATEGORIES.find((c) => c.cat === i.cat)?.label.toLowerCase() ?? CAT_PT[i.cat] ?? i.cat})`;
const isActive = (p: Punishment) => !p.revoked_at && (!p.ends_at || new Date(p.ends_at) > new Date());
const errText = (e: unknown) => (e as Error)?.message || 'Algo deu errado.';

function Box({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="card admin-box" open={open}>
      <summary>{title}</summary>
      <div className="stack" style={{ gap: 10, marginTop: 10 }}>{children}</div>
    </details>
  );
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return <div className={m.ok ? 'admin-ok' : 'error'} role={m.ok ? 'status' : 'alert'}>{m.text}</div>;
}

// ---------------------------------------------------------------- jogadores

function PlayersTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      rpc<UserRow[]>('admin_find_users', { p_query: q.trim() })
        .then((r) => { if (alive) { setRows(r); setErr(null); } })
        .catch((e) => { if (alive) setErr(errText(e)); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="stack">
      <input className="auth-input" placeholder="Buscar pelo nome de usuário" value={q} onChange={(e) => setQ(e.target.value)}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Buscar jogador" />
      {err && <div className="error">{err}</div>}
      {!rows && !err && <div className="spinner" style={{ alignSelf: 'center' }} />}
      {rows && !rows.length && <p className="muted" style={{ textAlign: 'center' }}>Ninguém encontrado.</p>}
      {rows?.map((u) => (
        <button key={u.id} className="admin-row" onClick={() => { sfx('click'); onOpen(u.id); }}>
          <div className="row between" style={{ gap: 8 }}>
            <b className="admin-name">{u.username}</b>
            <span className="row" style={{ gap: 4 }}>
              {u.role === 'admin' && <span className="badge yellow">🛡️ admin</span>}
              {u.minor && <span className="badge cyan">menor</span>}
              {u.blocked && <span className="badge red">{u.blocked === 'ban' ? 'banido' : 'suspenso'}</span>}
            </span>
          </div>
          <span className="small faint">nv {u.level} {u.title} · 🪙 {u.coins} · visto {fmt(u.last_seen_at)}</span>
        </button>
      ))}
    </div>
  );
}

function GrantBox({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const [coins, setCoins] = useState('');
  const [cat, setCat] = useState<XpCategory>('imitacao');
  const [xp, setXp] = useState('');
  const [item, setItem] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const c = parseInt(coins, 10) || 0;
  const x = parseInt(xp, 10) || 0;
  const go = async () => {
    setBusy(true);
    setM(null);
    try {
      await rpc('admin_grant', { p_user: user.profile.id, p_coins: c, p_category: cat, p_xp: x, p_item: item || null, p_reason: reason.trim() });
      sfx('win');
      setM({ ok: true, text: 'Feito! Já está na conta do jogador.' });
      setCoins(''); setXp(''); setItem(''); setReason('');
      onDone();
    } catch (e) {
      setM({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="🎁 Dar ou tirar moedas, XP e itens">
      <label className="auth-field"><span className="auth-label">Moedas (use – para tirar)</span>
        <input className="auth-input" inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value.replace(/[^\d-]/g, ''))} placeholder="ex.: 100 ou -50" />
      </label>
      <div className="auth-field"><span className="auth-label">XP</span>
        <Seg label="Categoria de XP" value={cat} onChange={setCat} options={XP_CATEGORIES.map((k) => ({ v: k.id, t: k.emoji }))} />
        <input className="auth-input" inputMode="numeric" value={xp} onChange={(e) => setXp(e.target.value.replace(/\D/g, ''))} placeholder={`XP de ${XP_CATEGORIES.find((k) => k.id === cat)?.label}`} />
      </div>
      <label className="auth-field"><span className="auth-label">Item</span>
        <select className="auth-input" value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">Nenhum</option>
          {SPECIAL_ITEMS.map((i) => <option key={i.id} value={i.id}>{itemLabel(i)}{user.items.includes(i.id) ? ' — já tem' : ''}</option>)}
        </select>
      </label>
      <label className="auth-field"><span className="auth-label">Motivo (fica no histórico)</span>
        <input className="auth-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="ex.: prêmio do campeonato" />
      </label>
      <Msg m={m} />
      <button className="btn yellow" disabled={busy || reason.trim().length < 3 || (!c && !x && !item)} onClick={go}>{busy ? 'Enviando…' : 'Confirmar'}</button>
    </Box>
  );
}

function PunishBox({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>('warning');
  const [minutes, setMinutes] = useState(1440);
  const [ip, setIp] = useState(user.ips[0]?.ip ?? '');
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const isAdmin = user.profile.role === 'admin';
  const needsTime = kind === 'suspension' || kind === 'ip_block';
  useEffect(() => { setSure(false); }, [kind, minutes, ip]);
  const go = async () => {
    if (!sure) { setSure(true); return; }
    setBusy(true);
    setM(null);
    try {
      await rpc('admin_punish', { p_user: user.profile.id, p_kind: kind, p_reason: reason.trim(), p_minutes: needsTime ? minutes : null, p_ip: kind === 'ip_block' ? ip : null });
      sfx('bad');
      setM({ ok: true, text: `${KIND[kind]} aplicada.` });
      setReason('');
      setSure(false);
      onDone();
    } catch (e) {
      setM({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  if (isAdmin && kind !== 'ip_block') {
    return <Box title="🚫 Punir"><p className="small muted" style={{ margin: 0 }}>Admins não podem ser punidos.</p></Box>;
  }
  return (
    <Box title="🚫 Punir">
      <Seg label="Tipo de punição" value={kind} onChange={setKind} options={[
        { v: 'warning', t: '⚠️ Avisar' }, { v: 'suspension', t: '⏸️ Suspender' }, { v: 'ban', t: '⛔ Banir' }, { v: 'ip_block', t: '🌐 IP' },
      ]} />
      <p className="small faint" style={{ margin: 0 }}>
        {kind === 'warning' && 'A pessoa vê o aviso ao entrar e continua jogando.'}
        {kind === 'suspension' && 'Bloqueia a conta e os aparelhos dela até o prazo acabar.'}
        {kind === 'ban' && 'Bloqueia a conta e os aparelhos dela sem prazo para acabar (dá para desfazer depois).'}
        {kind === 'ip_block' && 'Bloqueia um IP por um tempo. Cuidado: no Brasil muita gente divide o mesmo IP (CGNAT), então isso pode pegar inocentes.'}
      </p>
      {needsTime && <Seg label="Prazo" value={minutes} onChange={setMinutes} options={DURATIONS} />}
      {kind === 'ip_block' && (
        user.ips.length
          ? <select className="auth-input" value={ip} onChange={(e) => setIp(e.target.value)} aria-label="IP para bloquear">
              {user.ips.map((x) => <option key={x.ip} value={x.ip}>{x.ip} ({x.times}× · {fmt(x.last)})</option>)}
            </select>
          : <p className="small muted" style={{ margin: 0 }}>Esse jogador não tem IP registrado.</p>
      )}
      <label className="auth-field"><span className="auth-label">Motivo (a pessoa vai ver)</span>
        <input className="auth-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="ex.: xingou outros jogadores na sala" />
      </label>
      <Msg m={m} />
      <button className={`btn ${sure ? 'red' : 'pink'}`} disabled={busy || reason.trim().length < 3 || (kind === 'ip_block' && !ip)} onClick={go}>
        {busy ? 'Aplicando…' : sure ? `Confirmar: ${KIND[kind].slice(2)}` : 'Aplicar'}
      </button>
    </Box>
  );
}

function PasswordBox({ user }: { user: UserDetail }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true);
    setM(null);
    try {
      await rpc('admin_reset_password', { p_user: user.profile.id, p_password: pw });
      setM({ ok: true, text: 'Senha trocada. Passe para a pessoa por um canal seguro e peça para ela trocar em "Minha conta".' });
      setPw('');
    } catch (e) {
      setM({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="🔑 Nova senha (esqueceu a senha)">
      <p className="small faint" style={{ margin: 0 }}>Antes, confirme que a conta é mesmo da pessoa que pediu.</p>
      <input className="auth-input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Senha nova (8 ou mais caracteres)" autoComplete="new-password" />
      <Msg m={m} />
      <button className="btn ghost" disabled={busy || pw.length < 8} onClick={go}>{busy ? 'Trocando…' : 'Definir senha nova'}</button>
    </Box>
  );
}

function UserPanel({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc<UserDetail>('admin_user', { p_user: id }).then((r) => { setD(r); setErr(null); }).catch((e) => setErr(errText(e)));
  }, [id]);
  useEffect(load, [load]);
  const revoke = async (pid: string) => {
    try { await rpc('admin_revoke', { p_id: pid }); sfx('click'); load(); } catch (e) { setErr(errText(e)); }
  };
  if (err) return <div className="stack"><button className="link-btn" onClick={onBack}>← Voltar</button><div className="error">{err}</div></div>;
  if (!d) return <div className="spinner" style={{ alignSelf: 'center' }} />;
  const p = d.profile;
  const age = p.birthdate ? Math.floor((Date.now() - new Date(`${p.birthdate}T12:00:00`).getTime()) / 31_557_600_000) : null;
  return (
    <div className="stack">
      <button className="link-btn" onClick={onBack}>← Todos os jogadores</button>
      <div className="card stack" style={{ gap: 6 }}>
        <div className="row between">
          <b className="title-m admin-name">{p.username}</b>
          {p.role === 'admin' && <span className="badge yellow">🛡️ admin</span>}
        </div>
        <span className="small">nv {p.level} {p.title} · 🪙 {p.coins}</span>
        <span className="small faint">Conta criada {fmt(p.created_at)} · visto {fmt(p.last_seen_at)}{age != null ? ` · ${age} anos` : ''}</span>
        {p.guardian_name && <span className="small">Responsável: {p.guardian_name} ({p.guardian_email})</span>}
        <div className="lvl-grid">
          {XP_CATEGORIES.map((c) => {
            const pr = progress(d.xp[c.id] ?? 0, CAT_K);
            return <span key={c.id} className="small">{c.emoji} {c.label}: nv {pr.level} ({d.xp[c.id] ?? 0} XP)</span>;
          })}
        </div>
      </div>

      <GrantBox user={d} onDone={load} />
      <PunishBox user={d} onDone={load} />

      <Box title={`📋 Punições (${d.punishments.length})`} open={d.punishments.some(isActive)}>
        {!d.punishments.length && <span className="small muted">Nenhuma.</span>}
        {d.punishments.map((x) => (
          <div key={x.id} className="admin-item">
            <div className="row between"><b>{KIND[x.kind]}</b>{isActive(x) ? <span className="badge red">valendo</span> : <span className="badge">{x.revoked_at ? 'desfeita' : 'terminou'}</span>}</div>
            <span className="small">{x.reason}</span>
            <span className="small faint">{fmt(x.created_at)}{x.ends_at ? ` → ${fmt(x.ends_at)}` : x.kind === 'ban' ? ' · sem prazo' : ''}{x.ip ? ` · IP ${x.ip}` : ''}{x.kind === 'warning' ? (x.seen_at ? ' · vista' : ' · ainda não vista') : ''}</span>
            {isActive(x) && <button className="link-btn" onClick={() => revoke(x.id)}>Desfazer</button>}
          </div>
        ))}
      </Box>

      <Box title={`🌐 Acessos e IPs (${d.ips.length} IPs)`}>
        {d.same_device.length > 0 && <div className="error">Mesmo aparelho usado por: {d.same_device.join(', ')}</div>}
        {d.ips.map((x) => <span key={x.ip} className="small mono">{x.ip} · {x.times}× · último {fmt(x.last)}</span>)}
        <div className="caps" style={{ marginTop: 6 }}>Últimos acessos</div>
        {d.access.slice(0, 15).map((a, i) => (
          <span key={i} className="small faint">{fmt(a.created_at)} · {a.ip ?? 'sem IP'} · aparelho {a.device_id?.slice(0, 8) ?? '—'} · {(a.user_agent ?? '').replace(/^Mozilla\/5\.0 \(/, '').slice(0, 40)}</span>
        ))}
        <span className="small faint">Registros de acesso são apagados sozinhos depois de 6 meses.</span>
      </Box>

      <Box title="🧾 Extrato de moedas">
        {d.ledger.map((l, i) => (
          <span key={i} className="small"><b style={{ color: l.delta >= 0 ? 'var(--lime)' : '#ff8a8a' }}>{l.delta >= 0 ? '+' : ''}{l.delta}</b> → {l.balance} · {l.reason} · <span className="faint">{fmt(l.created_at)}</span></span>
        ))}
      </Box>

      <Box title={`👕 Itens (${d.items.length})`}>
        <span className="small">{d.items.length ? d.items.map(itemName).join(', ') : 'Só os itens grátis.'}</span>
      </Box>

      <PasswordBox user={d} />
    </div>
  );
}

// ---------------------------------------------------------------- códigos

const VALIDITY = [{ v: 0, t: 'Sem prazo' }, { v: 1, t: '1 dia' }, { v: 7, t: '7 dias' }, { v: 30, t: '30 dias' }];

function CodesTab() {
  const [rows, setRows] = useState<CodeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [coins, setCoins] = useState('');
  const [xp, setXp] = useState<Partial<Record<XpCategory, string>>>({});
  const [item, setItem] = useState('');
  const [uses, setUses] = useState('');
  const [days, setDays] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const load = useCallback(() => { rpc<CodeRow[]>('admin_codes').then(setRows).catch((e) => setErr(errText(e))); }, []);
  useEffect(load, [load]);

  const xpObj = Object.fromEntries(Object.entries(xp).map(([k, v]) => [k, parseInt(v || '', 10) || 0]).filter(([, v]) => (v as number) > 0));
  const c = parseInt(coins, 10) || 0;
  const create = async () => {
    setBusy(true);
    setM(null);
    try {
      const r = await rpc<CodeRow>('admin_create_code', {
        p_code: code.trim(), p_coins: c, p_xp: xpObj, p_item: item || null, p_max_uses: parseInt(uses, 10) || null,
        p_expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null, p_note: note.trim() || null,
      });
      sfx('win');
      setMade(r.code);
      setCode(''); setCoins(''); setXp({}); setItem(''); setUses(''); setDays(0); setNote('');
      load();
    } catch (e) {
      setM({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (r: CodeRow) => {
    try { await rpc('admin_set_code_active', { p_id: r.id, p_active: !r.active }); load(); } catch (e) { setErr(errText(e)); }
  };
  const summary = (r: CodeRow) => [
    r.coins ? `🪙 ${r.coins}` : '',
    ...Object.entries(r.xp || {}).map(([k, v]) => `${XP_CATEGORIES.find((x) => x.id === k)?.emoji ?? ''} ${v} XP`),
    r.item_id ? `👕 ${itemName(r.item_id)}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="stack">
      <Box title="✨ Criar código" open>
        <label className="auth-field"><span className="auth-label">Código (deixe vazio para sortear)</span>
          <input className="auth-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={20} placeholder="ex.: NATAL2026" />
        </label>
        <label className="auth-field"><span className="auth-label">Moedas</span>
          <input className="auth-input" inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value.replace(/\D/g, ''))} placeholder="0" />
        </label>
        <div className="auth-field"><span className="auth-label">XP por categoria</span>
          <div className="lvl-grid">
            {XP_CATEGORIES.map((k) => (
              <input key={k.id} className="auth-input" inputMode="numeric" value={xp[k.id] ?? ''} placeholder={`${k.emoji} ${k.label}`}
                onChange={(e) => setXp((o) => ({ ...o, [k.id]: e.target.value.replace(/\D/g, '') }))} aria-label={`XP de ${k.label}`} />
            ))}
          </div>
        </div>
        <label className="auth-field"><span className="auth-label">Item</span>
          <select className="auth-input" value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">Nenhum</option>
            {SPECIAL_ITEMS.map((i) => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
          </select>
        </label>
        <label className="auth-field"><span className="auth-label">Quantas pessoas podem usar (vazio = sem limite)</span>
          <input className="auth-input" inputMode="numeric" value={uses} onChange={(e) => setUses(e.target.value.replace(/\D/g, ''))} placeholder="ex.: 10" />
        </label>
        <div className="auth-field"><span className="auth-label">Validade</span>
          <Seg label="Validade" value={days} onChange={setDays} options={VALIDITY} />
        </div>
        <label className="auth-field"><span className="auth-label">Anotação (só você vê)</span>
          <input className="auth-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="ex.: sorteio do grupo" />
        </label>
        <p className="small faint" style={{ margin: 0 }}>Cada pessoa usa o código uma vez só.</p>
        <Msg m={m} />
        {made && <div className="admin-made">Código criado: <b className="mono">{made}</b> <button className="link-btn inline" onClick={() => navigator.clipboard?.writeText(made).catch(() => {})}>copiar</button></div>}
        <button className="btn yellow" disabled={busy || (!c && !Object.keys(xpObj).length && !item)} onClick={create}>{busy ? 'Criando…' : 'Criar código'}</button>
      </Box>
      {err && <div className="error">{err}</div>}
      <div className="caps">Códigos ({rows?.length ?? '…'})</div>
      {rows?.map((r) => (
        <div key={r.id} className="admin-item">
          <div className="row between"><b className="mono">{r.code}</b>{r.active ? <span className="badge lime">ativo</span> : <span className="badge">desativado</span>}</div>
          <span className="small">{summary(r) || '—'}</span>
          <span className="small faint">usado {r.uses}{r.max_uses ? `/${r.max_uses}` : ''}× · {r.expires_at ? `vale até ${fmt(r.expires_at)}` : 'sem prazo'}{r.note ? ` · ${r.note}` : ''}</span>
          <button className="link-btn" onClick={() => toggle(r)}>{r.active ? 'Desativar' : 'Ativar de novo'}</button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- histórico

function LogTab() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { rpc<AuditRow[]>('admin_audit_log', { p_limit: 150 }).then(setRows).catch((e) => setErr(errText(e))); }, []);
  if (err) return <div className="error">{err}</div>;
  if (!rows) return <div className="spinner" style={{ alignSelf: 'center' }} />;
  if (!rows.length) return <p className="muted" style={{ textAlign: 'center' }}>Nada por aqui ainda.</p>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map((a, i) => {
        const reason = typeof a.details?.reason === 'string' ? a.details.reason : typeof a.details?.motivo === 'string' ? a.details.motivo : '';
        return (
          <div key={i} className="admin-item">
            <span className="small"><b>{a.action}</b>{a.target_name ? ` · ${a.target_name}` : ''}{typeof a.details?.code === 'string' ? ` · ${a.details.code}` : ''}</span>
            <span className="small faint">{fmt(a.created_at)} · por {a.admin_name ?? '—'}{reason ? ` · “${reason}”` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- tela

export function AdminScreen({ auth, onClose }: { auth: AuthApi; onClose: () => void }) {
  const [tab, setTab] = useState<'players' | 'codes' | 'log'>('players');
  const [userId, setUserId] = useState<string | null>(null);
  if (auth.me?.role !== 'admin') {
    return (
      <div className="screen center"><p>Só o admin pode abrir este menu.</p><button className="btn ghost" onClick={onClose}>Voltar</button></div>
    );
  }
  return (
    <div className="screen admin-screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Fechar o menu de admin" onClick={onClose}>✕</button>
        <span className="round-chip">🛡️ Menu de admin</span>
        <span style={{ width: 44 }} />
      </div>
      {userId ? (
        <UserPanel id={userId} onBack={() => setUserId(null)} />
      ) : (
        <>
          <Seg label="Seção do menu de admin" value={tab} onChange={setTab} options={[{ v: 'players', t: '👥 Jogadores' }, { v: 'codes', t: '🎁 Códigos' }, { v: 'log', t: '📜 Histórico' }]} />
          {tab === 'players' && <PlayersTab onOpen={setUserId} />}
          {tab === 'codes' && <CodesTab />}
          {tab === 'log' && <LogTab />}
        </>
      )}
    </div>
  );
}
