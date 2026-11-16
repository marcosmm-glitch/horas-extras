(function () {
'use strict';
const E = window.HE;
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const num = v => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const H = E.fmtH, pad = E.pad;
const dBR = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const mesNome = ym => MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4);
const mesCurto = ym => MESES[+ym.slice(5, 7) - 1].slice(0, 3) + '/' + ym.slice(2, 4);
const DS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function agora() {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  return { date: p.slice(0, 10), time: p.slice(11, 16), iso: p };
}
const clone = o => JSON.parse(JSON.stringify(o));
const CFG0 = { empregado: '', salarios: [{ desde: '2000-01', valor: 0 }], divisor: 200, fimExpediente: '16:00',
  pct: { normal: 50, madrugada: 100, domingo: 100, feriado: 100 }, pisoNoturno: false, dsr: false, feriadosExtras: [], feriadosRemovidos: [], pagamentos: {} };
const merge = c => { const m = Object.assign(clone(CFG0), c || {}); m.pct = Object.assign(clone(CFG0.pct), (c && c.pct) || {}); return m; };

const hoje0 = agora();
const S = { cfg: merge(null), regs: {}, view: 'inicio', ym: hoje0.date.slice(0, 7), date: hoje0.date, perfil: 'empregador', draft: null, dirty: false, aviso: '', carregando: false, aberto: null };
let _m = {};
const M = ym => _m[ym] || (_m[ym] = E.calcMes(ym, S.regs, S.cfg));
const invalidate = () => { _m = {}; };
const moto = () => S.perfil === 'motorista';
const nome1 = () => (S.cfg.empregado || '').trim().split(' ')[0] || 'Motorista';

const Store = {
  nuvem: true, dono: false, escreve: true, fase: 'carregando', user: null, acesso: null, pedidos: [], subs: [], dados: null, erroMsg: '',
  dl: { save({ filename, data }) { const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return Promise.resolve({ status: 'saved' }); } },
  init() {
    const c = window.FIREBASE_CONFIG;
    if (!c || !c.apiKey || !window.firebase) { this.fase = 'semconfig'; return render(); }
    window.firebase.initializeApp(c); this.auth = window.firebase.auth(); this.fs = window.firebase.firestore();
    render();
    this.auth.onAuthStateChanged(u => {
      this.parar(); this.user = u; this.acesso = null; this.dono = false; S.regs = {}; S.cfg = merge(null); invalidate(); S.view = 'inicio'; S.draft = null; S.dirty = false; try { if (location.hash && location.hash !== '#inicio') location.hash = 'inicio'; } catch (e) { }
      if (!u) { this.fase = 'login'; return render(); }
      this.fase = 'carregando'; render();
      this.subs.push(this.fs.doc('config/acesso').onSnapshot(s => { this.acesso = s.exists ? s.data() : null; this.papel(); }, e => this.falha(e)));
    });
  },
  falha(e) { this.erroMsg = 'Não foi possível acessar os dados (' + ((e && e.code) || 'erro') + ').'; S.aviso = this.erroMsg; render(); },
  parar() { [...this.subs, ...(this.dados || [])].forEach(f => { try { f(); } catch (e) { } }); this.subs = []; this.dados = null; this.pedidos = []; },
  papel() {
    const a = this.acesso, u = this.user.uid;
    if (!a) this.fase = 'primeiro';
    else if (a.empregador === u) { if (!this.dono) S.perfil = 'empregador'; this.dono = true; this.fase = 'ok'; this.iniciar(); }
    else if ((a.motoristas || []).includes(u)) { this.dono = false; S.perfil = 'motorista'; this.fase = 'ok'; this.iniciar(); }
    else { this.fase = 'aguardando'; if (this.dados) { this.dados.forEach(f => f()); this.dados = null; } if (this.pediu !== u) { this.pediu = u; this.fs.doc('pedidos/' + u).set({ email: this.user.email || '', em: agora().iso }).then(() => { this.pedOk = true; refresh(); }).catch(e => { this.pedErro = (e && e.code) || 'erro'; refresh(); }); } }
    refresh();
  },
  iniciar() {
    if (this.dados) return;
    S.carregando = true;
    this.dados = [
      this.fs.doc('config/he').onSnapshot(s => { if (s.exists) S.cfg = merge(clone(s.data())); invalidate(); refresh(); }, e => this.falha(e)),
      this.fs.collection('he').orderBy('date', 'desc').limit(1500).onSnapshot(q => { const m = {}; q.forEach(d => { m[d.id] = clone(d.data()); }); S.regs = m; S.carregando = false; S.aviso = ''; invalidate(); refresh(); }, e => this.falha(e))
    ];
    if (this.dono) this.dados.push(this.fs.collection('pedidos').onSnapshot(q => { const l = []; q.forEach(d => l.push(Object.assign({ uid: d.id }, d.data()))); this.pedidos = l; this.pedErro = ''; refresh(); }, e => { this.pedErro = (e && e.code) || 'erro'; refresh(); }));
  },
  write(path, data) { return this.fs.doc(path).set(clone(data)).catch(e => { toast(e && e.code === 'permission-denied' ? 'Este acesso não tem permissão para esta alteração.' : 'Não foi possível salvar. Verifique a conexão.'); }); },
  saveReg(rec) { S.regs[rec.date] = rec; invalidate(); return this.write('he/' + rec.date, rec); },
  saveCfg() { invalidate(); return this.write('config/he', S.cfg); }
};
const ERR = { 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.', 'auth/invalid-email': 'E-mail inválido.', 'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Toque em Entrar.', 'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.', 'auth/network-request-failed': 'Sem conexão com a internet.', 'auth/operation-not-allowed': 'O login por e-mail e senha ainda não foi ativado no Firebase.' };
function vPortao() {
  const f = Store.fase, cx = h => `<div class="card" style="margin-top:8vh">${h}</div>`;
  if (f === 'semconfig') return cx('<h2>Configuração pendente</h2><p>O app ainda não está ligado ao banco de dados. Falta preencher o arquivo <b>config.js</b> com os dados do projeto Firebase.</p>');
  if (f === 'carregando') return cx('<p class="muted" style="margin:0">Carregando…</p>');
  if (f === 'primeiro') return cx(`<h2>Primeiro acesso</h2><p>Este app ainda não tem um responsável. Se você é o empregador, assuma o controle agora. Depois disso, só você libera outros acessos.</p><button class="btn full" data-act="assumir">Sou o empregador: assumir o controle</button><button class="btn sec full" data-act="sair" style="margin-top:8px">Sair</button>`);
  if (f === 'aguardando') return cx(`<h2>Aguardando liberação</h2><p>Sua conta <b>${esc(Store.user.email || '')}</b> foi criada. Avise o empregador para liberar o seu acesso; esta tela abre sozinha quando ele liberar.</p>${Store.pedErro ? alerta({ nivel: 'vermelho', txt: 'O pedido de acesso não foi enviado (' + Store.pedErro + ').' }) : Store.pedOk ? '<p class="muted">Pedido de acesso enviado.</p>' : ''}<button class="btn sec full" data-act="repedir" style="margin-bottom:8px">Enviar o pedido de novo</button><button class="btn sec full" data-act="sair">Sair</button>`);
  return cx(`<h2>Entrar</h2><form id="form-login"><div class="f"><label for="a-email">E-mail</label><input id="a-email" type="email" autocomplete="username" inputmode="email"></div><div class="f"><label for="a-senha">Senha</label><input id="a-senha" type="password" autocomplete="current-password"></div>
    <button class="btn full" data-act="entrar">Entrar</button><button class="btn sec full" data-act="criar" style="margin-top:8px">Criar conta</button><button class="btn sec full sm" data-act="reset" style="margin-top:8px;border:0">Esqueci a senha</button></form>`);
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }
function modal(html) { $('#modal .box').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
function refresh() { if (S.dirty) return; render(); }

const navMes = () => `<div class="nav-mes"><button class="ib" data-act="mes" data-n="-1" aria-label="Mês anterior">‹</button><b>${mesNome(S.ym)}</b><button class="ib" data-act="mes" data-n="1" aria-label="Próximo mês">›</button></div>`;
const lin = (a, b, cls) => `<div class="lin ${cls || ''}"><span>${a}</span><b>${b}</b></div>`;
const alerta = a => `<div class="al ${a.nivel || ''}"><div>${esc(a.txt)}${a.fonte ? '<small>' + esc(a.fonte) + '</small>' : ''}</div></div>`;
const memoriaHTML = res => '<div class="mem">' + res.memoria.map(m => `<div><b>${esc(m.rub)}</b><br><code>${esc(m.formula)}</code><small>${esc(m.fonte)}</small></div>`).join('') + '</div>';
const pers = r => (r.periodos || []).filter(p => p.ini && p.fim).map(p => p.ini + '–' + p.fim).join(', ');
const stChip = r => r.anulado ? '<span class="chip rd">Anulado</span>' : r.status === 'pendente' ? '<span class="chip am">Aguardando aprovação</span>' : '<span class="chip">Aprovado</span>';
function itemReg(r, comAcoes) {
  const res = E.calcDia(r, S.cfg);
  return `<div class="item"><button data-act="abrir" data-d="${r.date}" style="flex:1;background:none;border:0;color:inherit;text-align:left;padding:0"><b>${dBR(r.date).slice(0, 5)} · ${DS[E.dow(r.date)]}</b><small>${esc(pers(r) || (r.comp ? 'Desconto de ' + H(r.comp) : 'Sem horário'))}${r.obs ? ' · ' + esc(r.obs) : ''}</small></button>
    <div class="v">${H(res.min)}<small>${brl(res.total)}</small>${comAcoes ? `<button class="btn sm" data-act="aprovar" data-d="${r.date}" style="margin-top:6px">Aprovar</button>` : ''}</div></div>`;
}
const APP_URL = location.origin + location.pathname;
const pgTxt = pg => pg.data ? dBR(pg.data) : (pg.em && /^\d\d\//.test(pg.em) ? pg.em : 'data não informada');
const pendentes = () => Object.values(S.regs).filter(r => E.ativo(r) && r.status === 'pendente').sort((a, b) => a.date < b.date ? -1 : 1);

function grafico(m) {
  const n = m.dias.length, W = n * 11, max = Math.max(360, ...m.dias.map(x => x.res ? x.res.min : 0)), y = v => 70 - v / max * 64; let s = '';
  m.dias.forEach((x, i) => {
    const px = i * 11 + 1.5;
    if (x.res && x.res.min) {
      const a = x.res.min50, b = x.res.min100;
      if (a) s += `<rect x="${px}" y="${y(a)}" width="8" height="${70 - y(a)}" rx="1.5" fill="var(--acc)"><title>${dBR(x.date)}: ${H(a)} a 50%</title></rect>`;
      if (b) s += `<rect x="${px}" y="${y(a + b)}" width="8" height="${y(a) - y(a + b)}" rx="1.5" fill="var(--am)"><title>${dBR(x.date)}: ${H(b)} a 100%</title></rect>`;
    }
    if ((i + 1) % 5 === 0 || i === 0) s += `<text x="${px + 4}" y="80" font-size="6" text-anchor="middle" fill="var(--mut)">${i + 1}</text>`;
  });
  return `<svg viewBox="0 0 ${W} 82" role="img" aria-label="Horas extras por dia em ${mesNome(S.ym)}" style="width:100%;height:auto"><line x1="0" x2="${W}" y1="${y(120)}" y2="${y(120)}" stroke="var(--mut)" stroke-dasharray="2 2" stroke-width=".5"/><text x="${W}" y="${y(120) - 2}" font-size="5.5" text-anchor="end" fill="var(--mut)">2h</text><line x1="0" x2="${W}" y1="70" y2="70" stroke="var(--line)" stroke-width=".6"/>${s}</svg>
  <div class="leg"><span style="--c:var(--acc)">50%</span><span style="--c:var(--am)">100%</span></div>`;
}
function resumoLinhas(m) {
  const p = E.PCT(S.cfg);
  return `${lin('Horas a ' + p.normal + '% · ' + H(m.t.min50), brl(m.v50))}${lin('Horas a 100% · ' + H(m.t.min100), brl(m.v100))}
    ${m.compl ? lin('Complemento do piso noturno legal', brl(m.compl)) : ''}${m.compUsado ? lin('(−) Horas compensadas · ' + H(m.compUsado), brl(-m.vComp)) : ''}
    ${S.cfg.dsr ? lin('DSR sobre horas extras', brl(m.dsr)) : ''}${lin('Total a pagar', brl(m.total), 'tot')}`;
}
function difLegal(ym) { const c = Object.assign({}, S.cfg, { pisoNoturno: true, dsr: true }); return E.r2(E.calcMes(ym, S.regs, c).total - M(ym).total); }

function vInicio() {
  const m = M(S.ym), t = agora(), pg = S.cfg.pagamentos[S.ym], pend = pendentes(), rHoje = S.regs[t.date];
  const cartaoHoje = `<div class="card"><h2>Hoje · ${dBR(t.date)}</h2>${E.ativo(rHoje) ? `<p style="margin:0 0 10px"><b>${esc(pers(rHoje) || 'Sem horário')}</b> ${stChip(rHoje)}</p>` : '<p class="muted" style="margin:0 0 10px">Nenhuma hora extra lançada hoje.</p>'}
    ${Store.escreve ? `<button class="btn full" data-act="abrir" data-d="${t.date}">${E.ativo(rHoje) ? 'Ver ou ajustar o lançamento de hoje' : 'Lançar hora extra de hoje'}</button>` : ''}</div>`;
  if (moto()) {
    const meus = m.dias.filter(x => x.res && (x.res.min || x.res.comp)).reverse();
    return `${cartaoHoje}${navMes()}<div class="grid" style="margin-bottom:12px"><div class="kpi"><span>Horas extras no mês</span><b>${H(m.t.min)}</b></div><div class="kpi"><span>Valor estimado</span><b>${brl(m.total)}</b></div><div class="kpi"><span>Aguardando aprovação</span><b>${m.t.pend}</b></div></div>
      <div class="card"><h2>Meus lançamentos</h2>${meus.length ? meus.map(x => `<div class="item"><button data-act="abrir" data-d="${x.date}" style="flex:1;background:none;border:0;color:inherit;text-align:left;padding:0"><b>${dBR(x.date).slice(0, 5)} · ${DS[E.dow(x.date)]}</b><small>${esc(pers(x.rec))} ${x.rec.status === 'pendente' ? '· aguardando aprovação' : '· aprovado'}</small></button><div class="v">${H(x.res.min)}</div></div>`).join('') : '<p class="muted">Nenhum lançamento neste mês.</p>'}</div>`;
  }
  const meses = [5, 4, 3, 2, 1, 0].map(k => E.addMonths(S.ym, -k)), mx = Math.max(1, ...meses.map(y => M(y).total)), dif = difLegal(S.ym);
  const aberto = Object.keys(S.regs).map(d => d.slice(0, 7)).filter((v, i, a) => a.indexOf(v) === i && !S.cfg.pagamentos[v] && M(v).total > 0);
  return `${navMes()}
  <div class="card hero"><h2>Horas extras a pagar</h2><div class="big">${brl(m.total)}</div>
    <div class="sub"><div>A 50%<b>${H(m.t.min50)}</b></div><div>A 100%<b>${H(m.t.min100)}</b></div><div>Dias com extra<b>${m.t.lanc}</b></div></div></div>
  ${pend.length ? `<div class="al azul"><div><b>${pend.length} hora(s) extra(s) aguardando sua aprovação.</b><br><button class="btn sm" data-act="ir" data-v="gestao" style="margin-top:8px">Abrir Gestão</button></div></div>` : ''}
  <div class="card"><h2>Resumo de ${mesNome(S.ym)}</h2>${resumoLinhas(m)}
    <div class="mem"><div><b>Valor da hora</b><br><code>${brl(m.salario)} ÷ ${S.cfg.divisor} = ${brl(m.hora)} · 50% = ${brl(m.hora * 1.5)} · 100% = ${brl(m.hora * 2)}</code><small>${E.FONTES.hora}</small></div></div>
    <div style="margin-top:12px">${pg ? `<span class="chip">Pago em ${esc(pgTxt(pg))} · ${brl(pg.valor)}</span>` : m.total > 0 ? '<span class="chip am">Pagamento em aberto</span> <button class="btn sec sm" data-act="ir" data-v="gestao">Confirmar em Gestão</button>' : ''}</div></div>
  ${dif > 0.009 ? `<div class="al azul"><div>Pelo cálculo legal completo, este mês teria mais <b>${brl(dif)}</b>: adicional noturno das 22h às 5h e reflexo no descanso semanal (DSR). Hoje o app aplica só a sua regra de 50% e 100%. Para incluir, ative em Ajustes.<small>${E.FONTES.noturno} · ${E.FONTES.dsr}</small></div></div>` : ''}
  ${m.t.acima2h ? alerta({ nivel: 'amarelo', txt: m.t.acima2h + ' dia(s) úteis com mais de 2 horas extras neste mês.', fonte: E.FONTES.limite }) : ''}
  <div class="card"><h2>Horas extras por dia</h2>${m.t.min ? grafico(m) : '<p class="muted">Nenhuma hora extra lançada neste mês.</p>'}</div>
  <div class="card"><h2>Últimos 6 meses</h2>${meses.map(y => { const x = M(y); return `<div class="bars"><span>${mesCurto(y)}</span><i style="width:${Math.max(1, x.total / mx * 42)}%"></i><b>${brl(x.total)} · ${H(x.t.min)}${S.cfg.pagamentos[y] ? ' · pago' : ''}</b></div>`; }).join('')}
    ${aberto.length ? lin('Em aberto (meses não pagos)', brl(aberto.reduce((s, y) => s + M(y).total, 0)), 'tot') : ''}</div>
  ${cartaoHoje}`;
}

function draftDe(date) {
  const r = S.regs[date], ok = E.ativo(r), dw = E.dow(date), util = dw >= 1 && dw <= 5 && !E.ehFeriado(date, S.cfg);
  const ps = ok && r.periodos && r.periodos.length ? clone(r.periodos) : [{ ini: !ok && util ? S.cfg.fimExpediente : '', fim: '' }];
  return { date, periodos: ps, comp: ok && r.comp ? pad(Math.floor(r.comp / 60)) + ':' + pad(r.comp % 60) : '', motivo: ok ? r.motivo || '' : '', obs: ok ? r.obs || '' : '', just: '' };
}
const recDe = d => ({ date: d.date, periodos: d.periodos.filter(p => p.ini || p.fim).map(p => ({ ini: p.ini, fim: p.fim })), comp: E.hm(d.comp) || 0, motivo: d.motivo.trim(), obs: d.obs.trim() });
function previewHTML(d) {
  const rec = recDe(d), res = E.calcDia(rec, S.cfg);
  if (!res.min && !res.comp) return '<p class="muted">Informe o início e o término da hora extra para ver o cálculo.</p>';
  return `<h2 style="margin-top:6px">Cálculo do dia</h2>${res.faixas.map(f => lin(esc(f.rot) + ' · ' + H(f.min), brl(f.valor))).join('')}
    ${res.comp ? lin('Horas a descontar (compensadas)', H(res.comp)) : ''}${lin('Total do dia · ' + H(res.min), brl(res.total), 'tot')}
    ${res.alertas.map(alerta).join('')}${res.memoria.length ? '<details><summary>Memória de cálculo <span class="muted">ver</span></summary>' + memoriaHTML(res) + '</details>' : ''}`;
}
function vLancar() {
  if (!S.draft || S.draft.date !== S.date) { S.draft = draftDe(S.date); S.dirty = false; }
  const d = S.draft, rec = S.regs[S.date], fer = E.ehFeriado(S.date, S.cfg), dw = E.dow(S.date), aprovado = E.ativo(rec) && rec.status === 'aprovado';
  const ro = !Store.escreve || (moto() && aprovado), p = E.PCT(S.cfg);
  const tin = (k, lab, v) => `<div class="f"><label for="l-${k}">${lab}</label><input type="time" id="l-${k}" data-k="${k}" value="${esc(v)}" ${ro ? 'disabled' : ''}></div>`;
  return `<div class="nav-mes"><button class="ib" data-act="dia" data-n="-1" aria-label="Dia anterior">‹</button>
    <div style="text-align:center"><b>${DS[dw]}, ${dBR(S.date)}</b><br><input type="date" id="l-data" value="${S.date}" style="min-height:32px;padding:4px 8px;width:auto;margin-top:4px" aria-label="Escolher data"></div>
    <button class="ib" data-act="dia" data-n="1" aria-label="Próximo dia">›</button></div>
  <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">${fer ? `<span class="chip am">Feriado: ${esc(fer)} · ${p.feriado}%</span>` : dw === 0 ? `<span class="chip am">Domingo · ${p.domingo}%</span>` : dw === 6 ? `<span class="chip mu">Sábado · ${p.normal}%</span>` : `<span class="chip mu">Dia útil · ${p.normal}%, após 0h ${p.madrugada}%</span>`}${rec ? stChip(rec) : '<span class="chip mu">Sem lançamento</span>'}</div>
  ${rec && rec.pedido ? `<div class="card"><h2>Pedido de correção de ${esc(nome1())}</h2><p style="margin:0 0 6px">${esc(rec.pedido.texto)}</p><p class="muted" style="margin:0 0 10px">Enviado em ${esc(rec.pedido.em)}</p>${moto() ? '' : '<button class="btn sec sm" data-act="pedido-fim">Marcar como resolvido</button>'}</div>` : ''}
  <form class="card" id="form-he" autocomplete="off">
    ${d.periodos.map((x, i) => `<div class="per">${tin('p' + i + 'i', i ? 'Início ' + (i + 1) : 'Início da hora extra', x.ini)}${tin('p' + i + 'f', i ? 'Término ' + (i + 1) : 'Término', x.fim)}${i && !ro ? `<button type="button" class="ib" data-act="per-del" data-i="${i}" aria-label="Remover período">×</button>` : ''}</div>`).join('')}
    ${ro ? '' : `<div class="row" style="margin-bottom:12px"><button type="button" class="btn sec sm" data-act="fim-agora">Término agora (${agora().time})</button><button type="button" class="btn sec sm" data-act="per-add">+ Outro período</button></div>`}
    <div class="f"><label for="l-obs">O que foi feito</label><textarea id="l-obs" data-k="obs" placeholder="Ex.: levei a família ao aeroporto" ${ro ? 'disabled' : ''}>${esc(d.obs)}</textarea></div>
    <div class="row"><div class="f"><label for="l-mot">Motivo ou marcação</label><input id="l-mot" data-k="motivo" value="${esc(d.motivo)}" placeholder="Ex.: viagem, evento" ${ro ? 'disabled' : ''}></div>
    ${tin('comp', 'Horas a descontar', d.comp)}</div>
    <p class="muted" style="margin:-6px 0 12px">Em sábado, domingo e feriado, lance todo o período trabalhado. "Horas a descontar" abate horas extras do mês (saída antecipada, folga).</p>
    ${rec && !ro && aprovado ? `<div class="f"><label for="l-just">Justificativa da alteração (obrigatória)</label><input id="l-just" data-k="just" value="${esc(d.just)}" placeholder="Ex.: horário lançado errado"></div>` : ''}
    <div id="preview">${previewHTML(d)}</div>
    ${ro ? (moto() && aprovado ? `<div class="f" style="margin-top:12px"><label for="l-ped">Este lançamento já foi aprovado. Precisa corrigir? Explique:</label><input id="l-ped" placeholder="Ex.: saí às 20h, não às 19h"></div><button type="button" class="btn sec full" data-act="pedir">Pedir correção</button>` : '')
      : `<button type="button" class="btn full" data-act="salvar" style="margin-top:12px">${rec && E.ativo(rec) ? 'Salvar alteração' : 'Salvar lançamento'}</button>
      ${!moto() && E.ativo(rec) && rec.status === 'pendente' ? `<button type="button" class="btn sec full" data-act="aprovar" data-d="${S.date}" style="margin-top:8px">Aprovar como está</button>` : ''}
      ${E.ativo(rec) && (!moto() || rec.status === 'pendente') ? '<button type="button" class="btn pg full" data-act="anular" style="margin-top:8px">Anular lançamento</button>' : ''}`}
  </form>
  ${rec && ((rec.hist && rec.hist.length) || rec.origem) ? `<div class="card"><h2>Histórico de alterações</h2>${rec.origem === 'planilha' ? lin('Importado da planilha de controle', 'abr–ago/2026') : ''}${(rec.hist || []).slice().reverse().map(h => `<div class="lin"><span>${esc(h.em)} · ${esc(h.por)}<br>${esc(h.justificativa)}</span><b>${h.antes ? esc(pers(h.antes) || '–') + '<br><span class="muted">antes</span>' : ''}</b></div>`).join('')}<p class="nota">Nada é apagado: cada alteração guarda o valor anterior, quem alterou e quando.</p></div>` : ''}`;
}

function vCalendario() {
  const m = M(S.ym), off = (E.dow(S.ym + '-01') + 6) % 7, hj = agora().date; let cells = '';
  for (let i = 0; i < off; i++) cells += '<span></span>';
  for (const x of m.dias) {
    const r = x.rec, res = x.res, dw = E.dow(x.date), fer = E.ehFeriado(x.date, S.cfg);
    const cls = !res ? '' : r.status === 'pendente' ? 'azul' : res.min100 ? 'amarelo' : res.min ? 'verde' : '';
    const txt = res && res.min ? `<span>${H(res.min)}</span>${moto() ? '' : '<i>' + num(res.total) + '</i>'}` : res && res.comp ? `<i>−${H(res.comp)}</i>` : fer ? '<i>Feriado</i>' : res && r.obs ? '<i>nota</i>' : '';
    cells += `<button class="dia ${cls} ${x.date === hj ? 'hoje' : ''} ${dw === 0 || dw === 6 || fer ? 'fds' : ''}" data-act="abrir" data-d="${x.date}" aria-label="${dBR(x.date)}"><b>${+x.date.slice(8)}</b>${txt}</button>`;
  }
  return `${navMes()}<div class="card"><div class="cal">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(h => '<div class="h">' + h + '</div>').join('')}${cells}</div>
    <div class="leg"><span style="--c:var(--acc2)">Extras a 50%</span><span style="--c:var(--am2)">Inclui horas a 100%</span><span style="--c:var(--bl2)">Aguardando aprovação</span></div></div>
    <div class="card"><h2>Resumo de ${mesNome(S.ym)}</h2>${lin('Dias com hora extra', m.t.lanc)}${lin('Total de horas extras', H(m.t.min))}${moto() ? '' : lin('Total a pagar', brl(m.total), 'tot')}</div>`;
}

function mesesComDados() {
  const ds = Object.keys(S.regs).sort(); const out = []; if (!ds.length) return out;
  const fim = agora().date.slice(0, 7); for (let ym = ds[0].slice(0, 7); ym <= fim && out.length < 120; ym = E.addMonths(ym, 1)) out.push(ym);
  return out.reverse();
}
function tabelaDias(m) {
  return `<div class="scroll"><table><thead><tr><th>Data</th><th>Período</th><th>50%</th><th>100%</th>${moto() ? '' : '<th>Valor</th>'}</tr></thead><tbody>${m.dias.filter(x => x.res && (x.res.min || x.res.comp)).map(x => `<tr data-act="abrir" data-d="${x.date}" style="cursor:pointer"><td>${dBR(x.date).slice(0, 5)} ${DS[E.dow(x.date)].slice(0, 3)}${x.rec.status === 'pendente' ? ' ⏳' : ''}</td><td>${esc(pers(x.rec) || '−' + H(x.res.comp))}</td><td>${H(x.res.min50)}</td><td>${H(x.res.min100)}</td>${moto() ? '' : '<td>' + brl(x.res.total) + '</td>'}</tr>`).join('')}</tbody></table></div>`;
}
function vHistorico() {
  const ms = mesesComDados(), pdf = !!(window.jspdf && Store.dl), hj = agora().date;
  if (moto()) {
    if (!ms.length) return '<div class="card"><h2>Histórico</h2><p class="muted">Ainda não há lançamentos.</p></div>';
    return `<div class="card"><h2>Meus meses</h2>${ms.map(ym => { const m = M(ym), ab = S.aberto === ym;
      return `<details ${ab ? 'open' : ''} data-mes="${ym}"><summary>${mesNome(ym)} <span>${H(m.t.min)} ${S.cfg.pagamentos[ym] ? '<span class="chip">Pago</span>' : ''}</span></summary>${ab ? lin('Horas a 50%', H(m.t.min50)) + lin('Horas a 100%', H(m.t.min100)) + (m.t.pend ? lin('Aguardando aprovação', m.t.pend) : '') + tabelaDias(m) : ''}</details>`; }).join('')}</div>`;
  }
  const pend = pendentes(), comValor = ms.filter(ym => M(ym).total > 0 || S.cfg.pagamentos[ym]);
  const tot = comValor.reduce((a, ym) => { const m = M(ym), pg = S.cfg.pagamentos[ym]; if (pg) a.pago += pg.valor; else a.aberto += m.total; return a; }, { pago: 0, aberto: 0 });
  return `<div class="card hero"><h2>Em aberto para pagar</h2><div class="big">${brl(tot.aberto)}</div><div class="sub"><div>Já pago<b>${brl(tot.pago)}</b></div><div>Aguardando aprovação<b>${pend.length}</b></div></div></div>
  <div class="card"><h2>1 · Aprovar horas extras</h2>${pend.length ? pend.map(r => { const res = E.calcDia(r, S.cfg), cri = (r.hist || [])[0];
    return `<div style="padding:12px 0;border-bottom:1px solid var(--line)"><div class="lin" style="border:0;padding:0"><span style="color:var(--ink)"><b>${DS[E.dow(r.date)]}, ${dBR(r.date)}</b></span><b>${brl(res.total)}</b></div>
      <p style="margin:4px 0">${esc(pers(r) || 'Sem horário')} · ${H(res.min)}${res.min100 ? ' (' + H(res.min100) + ' a 100%)' : ''}${res.comp ? ' · descontar ' + H(res.comp) : ''}</p>
      ${r.obs || r.motivo ? `<p class="muted" style="margin:0 0 4px">${esc([r.motivo, r.obs].filter(Boolean).join(' · '))}</p>` : ''}${cri ? `<p class="muted" style="margin:0 0 8px">Lançado por ${esc(cri.por)} em ${esc(cri.em.slice(8, 10) + '/' + cri.em.slice(5, 7) + ' às ' + cri.em.slice(11))}</p>` : ''}
      ${res.alertas.map(alerta).join('')}<div class="row"><button class="btn sm" data-act="aprovar" data-d="${r.date}">Aprovar</button><button class="btn sec sm" data-act="abrir" data-d="${r.date}">Abrir e corrigir</button></div></div>`; }).join('') + (pend.length > 1 ? '<button class="btn sec full" data-act="aprovar-todos" style="margin-top:12px">Aprovar todos (' + pend.length + ')</button>' : '')
    : '<p class="muted" style="margin:0">Nada aguardando aprovação.</p>'}</div>
  <div class="card"><h2>2 · Confirmar pagamentos</h2>${comValor.length ? comValor.map(ym => { const m = M(ym), pg = S.cfg.pagamentos[ym], ab = S.aberto === ym, dif = pg ? E.r2(m.total - pg.valor) : 0;
    return `<details ${ab ? 'open' : ''} data-mes="${ym}"><summary>${mesNome(ym)} <span>${brl(m.total)} ${pg ? '<span class="chip">Pago' + (pg.data ? ' em ' + dBR(pg.data).slice(0, 5) : '') + '</span>' : '<span class="chip am">Em aberto</span>'}</span></summary>
      ${ab ? `<div style="margin-top:8px">${resumoLinhas(m)}</div>
      ${pg ? `${lin('Pago em', esc(pgTxt(pg)))}${lin('Valor pago', brl(pg.valor))}${Math.abs(dif) > 0.009 ? alerta({ nivel: 'amarelo', txt: 'O total do mês mudou depois do pagamento. Diferença: ' + brl(dif) + '.' }) : ''}
        <div class="row" style="align-items:flex-end;margin-top:8px"><div class="f" style="margin:0"><label for="pg-${ym}">Data do pagamento</label><input type="date" id="pg-${ym}" value="${pg.data || ''}" max="${hj}"></div><button class="btn sec" data-act="pagar" data-ym="${ym}" data-manter="1">Salvar data</button></div>
        <button class="btn pg sm" data-act="despagar" data-ym="${ym}" style="margin-top:8px">Desfazer pagamento</button>`
      : `<div class="row" style="align-items:flex-end;margin-top:8px"><div class="f" style="margin:0"><label for="pg-${ym}">Data do pagamento</label><input type="date" id="pg-${ym}" value="${hj}" max="${hj}"></div><button class="btn" data-act="pagar" data-ym="${ym}" ${m.t.pend ? 'disabled' : ''}>Confirmar ${brl(m.total)}</button></div>${m.t.pend ? '<p class="nota">Aprove os ' + m.t.pend + ' lançamento(s) pendentes deste mês antes de confirmar.</p>' : ''}`}
      <h2 style="margin-top:14px">Dia a dia</h2>${tabelaDias(m)}
      <div class="row" style="margin-top:10px">${pdf ? `<button class="btn sec sm" data-act="rel" data-ym="${ym}" data-f="pdf">Extrato em PDF</button>` : ''}<button class="btn sec sm" data-act="rel" data-ym="${ym}" data-f="csv">Extrato em CSV</button></div>` : ''}</details>`; }).join('') : '<p class="muted" style="margin:0">Ainda não há horas extras lançadas.</p>'}</div>
  ${comValor.length ? '<button class="btn sec full" data-act="rel" data-ym="todos" data-f="csv">Exportar histórico completo (CSV)</button><p class="nota">Toque em um mês para ver os dias e confirmar o pagamento. Toque em um dia para abrir o lançamento.</p>' : ''}`;
}

function vAjustes() {
  const c = S.cfg, y = +S.ym.slice(0, 4), fer = E.feriados(y, c);
  const chk = (k, t, sub) => `<div class="chk"><input type="checkbox" id="c-${k}" data-cfg="${k}" ${c[k] ? 'checked' : ''}><label for="c-${k}">${t}<small>${sub}</small></label></div>`;
  const pin = (k, lab) => `<div class="f"><label for="c-p${k}">${lab}</label><input id="c-p${k}" inputmode="numeric" data-pct="${k}" value="${c.pct[k]}"></div>`;
  const perfil = `<div class="card"><h2>Perfil e aparência</h2>${lin('Perfil em uso', moto() ? esc(nome1()) + ' (motorista)' : 'Empregador')}
    ${Store.dono ? `<button class="btn sec full" data-act="perfil" style="margin:10px 0">${moto() ? 'Voltar ao perfil do empregador' : 'Ver como ' + esc(nome1()) + ' neste aparelho'}</button>` : ''}
    <button class="btn sec full" data-act="tema">Alternar modo claro / escuro</button>
    <button class="btn sec full" data-act="sair" style="margin-top:10px">Sair da conta (${esc((Store.user && Store.user.email) || '')})</button>
    <p class="nota">O motorista lança e acompanha as horas; só o empregador aprova, altera regras e confirma pagamentos.</p></div>`;
  if (moto()) return perfil;
  return `<div class="card" id="form-cfg"><h2>Base de cálculo</h2>
    <div class="f"><label for="c-emp">Nome do motorista</label><input id="c-emp" data-cfg="empregado" value="${esc(c.empregado)}"></div>
    <div class="row"><div class="f"><label for="c-sal">Salário mensal (R$)</label><input id="c-sal" inputmode="decimal" value="${num(E.salarioEm(c, S.ym))}"></div><div class="f"><label for="c-sald">Vigente desde</label><input type="month" id="c-sald" value="${S.ym}"></div></div>
    ${c.salarios.length > 1 ? '<p class="muted">Histórico: ' + c.salarios.map(s => (s.desde === '2000-01' ? 'inicial' : s.desde.slice(5) + '/' + s.desde.slice(0, 4)) + ' ' + brl(s.valor)).join(' · ') + '</p>' : ''}
    <div class="row"><div class="f"><label for="c-div">Divisor mensal</label><input id="c-div" inputmode="numeric" data-cfg="divisor" value="${c.divisor}"></div><div class="f"><label for="c-fim">Fim do expediente normal</label><input type="time" id="c-fim" data-cfg="fimExpediente" value="${esc(c.fimExpediente)}"></div></div>
    <p class="muted">Divisor 200 = 40 horas semanais. Hora normal em ${mesNome(S.ym).toLowerCase()}: ${brl(E.horaDe(c, S.ym))}.</p>
    <h2 style="margin-top:14px">Adicionais (%)</h2>
    <div class="row">${pin('normal', 'Hora extra comum')}${pin('madrugada', 'Após a meia-noite (0h–5h)')}</div><div class="row">${pin('domingo', 'Domingo')}${pin('feriado', 'Feriado')}</div>
    <h2 style="margin-top:6px">Itens legais opcionais</h2>
    ${chk('pisoNoturno', 'Garantir o adicional noturno legal das 22h às 5h', 'Paga o maior valor entre a sua regra e a hora noturna reduzida com 20% de adicional.')}
    ${chk('dsr', 'Incluir o reflexo das horas extras no descanso semanal (DSR)', 'Horas extras habituais refletem no repouso remunerado.')}
    <button class="btn full" data-act="salvar-cfg">Salvar ajustes</button></div>
  <div class="card"><h2>Feriados de ${y}</h2>${Object.keys(fer).sort().map(d => `<div class="lin"><span style="color:var(--ink)">${dBR(d).slice(0, 5)} · ${esc(fer[d])}</span><b><button class="btn sec sm" data-act="fer-del" data-d="${d}">Remover</button></b></div>`).join('')}
    <div class="row" style="margin-top:10px"><div class="f"><label for="f-d">Data</label><input type="date" id="f-d"></div><div class="f"><label for="f-n">Nome</label><input id="f-n" placeholder="Ex.: feriado municipal"></div></div>
    <button class="btn sec full" data-act="fer-add">Adicionar feriado</button><p class="nota">Nacionais, 9 de julho (SP) e os municipais de São Paulo. Pontos facultativos não entram.</p></div>
  <div class="card"><h2>Acessos</h2>
    <p class="muted" style="margin:0 0 10px">Você está como <b>${esc((Store.user && Store.user.email) || '')}</b> (empregador).</p>
    ${Store.pedErro ? alerta({ nivel: 'vermelho', txt: 'Não foi possível ler os pedidos de acesso (' + Store.pedErro + '). Confira se as regras de segurança foram publicadas no Firestore.' }) : ''}
    ${Store.pedidos.length ? Store.pedidos.map(p => `<div class="lin"><span style="color:var(--ink)">${esc(p.email)}<br><span class="muted">pediu acesso em ${esc(p.em || '')}</span></span><b><button class="btn sm" data-act="liberar" data-u="${esc(p.uid)}" data-e="${esc(p.email)}">Liberar como motorista</button></b></div>`).join('') : '<p class="muted" style="margin:0 0 8px">Nenhum pedido de acesso pendente.</p>'}
    ${((Store.acesso || {}).motoristas || []).map(u => `<div class="lin"><span style="color:var(--ink)">${esc(((Store.acesso.emails || {})[u]) || u)}<br><span class="muted">motorista com acesso</span></span><b><button class="btn pg sm" data-act="revogar" data-u="${esc(u)}">Remover</button></b></div>`).join('')}
    <button class="btn sec sm" data-act="ver-pedidos" style="margin-top:10px">Verificar pedidos agora</button>
    <h2 style="margin-top:14px">Enviar o app ao motorista</h2>
    <div class="f"><label for="w-tel">WhatsApp (opcional, com DDD)</label><input id="w-tel" inputmode="tel" placeholder="11 99999-9999"></div>
    <div class="row"><a class="btn" id="w-link" target="_blank" rel="noopener" href="${zap('')}">Enviar por WhatsApp</a><button class="btn sec" data-act="copiar-link">Copiar link</button></div>
    <p class="muted" style="margin:10px 0 0;word-break:break-all">${esc(APP_URL)}</p>
    <p class="nota">Ele abre o link, toca em "Criar conta" com e-mail e senha, e o pedido aparece aqui para você liberar.</p></div>
  <div class="card"><h2>Backup e importação</h2>
    <div class="row"><button class="btn sec" data-act="backup">Baixar backup</button><label class="btn sec" style="margin:0;color:var(--ink);font-size:15px">Importar arquivo<input type="file" id="imp" accept=".json,application/json" style="display:none"></label></div>
    <p class="nota">A importação aceita o arquivo de histórico (JSON) e acrescenta os lançamentos e pagamentos sem apagar os existentes de outras datas.</p></div>
  ${perfil}
  <div class="card"><h2>Regras aplicadas</h2>${Object.values(E.FONTES).filter(f => f !== E.FONTES.casa).map(f => '<div class="lin"><span>' + esc(f) + '</span></div>').join('')}
    <p class="nota">O app calcula só as horas extras, pelos horários lançados. Não desconta intervalo dentro do período. Valores para gestão: confirme com contador ou advogado antes de fechar pagamentos.</p></div>`;
}

function zap(tel) { const n = String(tel || '').replace(/\D/g, ''), full = n ? (n.length <= 11 ? '55' + n : n) : ''; return 'https://wa.me/' + full + '?text=' + encodeURIComponent('Este é o app para lançar suas horas extras todos os dias: ' + APP_URL); }
const ICON = { inicio: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', lancar: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', gestao: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10"/>', ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>' };
const VIEWS = { inicio: ['Início', vInicio], lancar: ['Lançar', vLancar], calendario: ['Calendário', vCalendario], gestao: ['Gestão', vHistorico], ajustes: ['Ajustes', vAjustes] };
function render() {
  if (Store.fase !== 'ok') { $('#app').innerHTML = `<header class="top"><h1>Horas extras<small>Controle de horas extras</small></h1></header>${Store.erroMsg ? alerta({ nivel: 'vermelho', txt: Store.erroMsg }) : ''}${vPortao()}`; $('nav.bot').style.display = 'none'; return; }
  $('nav.bot').style.display = '';
  const v = VIEWS[S.view] || VIEWS.inicio;
  $('#app').innerHTML = `<header class="top"><h1>Horas extras<small>${esc(S.cfg.empregado)}</small></h1><span class="chip ${moto() ? 'bl' : ''}">${moto() ? esc(nome1()) : 'Empregador'}</span></header>
    ${S.aviso ? alerta({ nivel: 'vermelho', txt: S.aviso }) : ''}${S.carregando ? '<p class="muted">Carregando dados…</p>' : ''}${v[1]()}`;
  $('nav.bot div').innerHTML = Object.keys(VIEWS).map(k => `<button data-act="ir" data-v="${k}" class="${S.view === k ? 'on' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>${k === 'gestao' && moto() ? 'Histórico' : VIEWS[k][0]}${k === 'gestao' && !moto() && pendentes().length ? ' (' + pendentes().length + ')' : ''}</button>`).join('');
}
const _render = render; render = function () { _render(); ofereceImport(); };
function ir(v) { S.view = v; S.dirty = false; if (v !== 'lancar') S.draft = null; try { if (location.hash !== '#' + v) location.hash = v; } catch (e) { } render(); window.scrollTo(0, 0); }

async function exportar(ym, fmt) {
  const t = agora(), todos = ym === 'todos', ms = todos ? mesesComDados().reverse() : [ym], p = E.PCT(S.cfg);
  const titulo = todos ? 'Histórico de horas extras' : 'Extrato de horas extras - ' + mesNome(ym);
  const cab = [[titulo], ['Motorista', S.cfg.empregado], ['Gerado em', dBR(t.date) + ' ' + t.time], ['Parâmetros', 'Salário ' + brl(E.salarioEm(S.cfg, ms[ms.length - 1])) + '; divisor ' + S.cfg.divisor + '; extra ' + p.normal + '%; após 0h ' + p.madrugada + '%; domingo ' + p.domingo + '%; feriado ' + p.feriado + '%; piso noturno legal: ' + (S.cfg.pisoNoturno ? 'sim' : 'não') + '; DSR: ' + (S.cfg.dsr ? 'sim' : 'não')], []];
  const head = ['Data', 'Dia', 'Períodos', 'Horas 50%', 'Horas 100%', 'Descontar', 'Valor (R$)', 'Situação', 'Motivo', 'O que foi feito'], rows = [];
  for (const y of ms) { const m = M(y);
    for (const x of m.dias) if (x.res && (x.res.min || x.res.comp)) rows.push([dBR(x.date), DS[E.dow(x.date)], pers(x.rec), H(x.res.min50), H(x.res.min100), x.res.comp ? H(x.res.comp) : '', num(x.res.total), x.rec.status === 'pendente' ? 'Pendente' : 'Aprovado', x.rec.motivo || '', x.rec.obs || '']);
    rows.push(['Total ' + mesNome(y), '', '', H(m.t.min50), H(m.t.min100), m.compUsado ? H(m.compUsado) : '', num(m.total), S.cfg.pagamentos[y] ? 'Pago em ' + pgTxt(S.cfg.pagamentos[y]) : 'Em aberto', m.dsr ? 'inclui DSR de ' + num(m.dsr) : '', '']); }
  const q = v => { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = '﻿' + [...cab, head, ...rows].map(l => l.map(q).join(';')).join('\r\n'), arq = 'horas-extras-' + (todos ? 'historico' : ym);
  try {
    if (fmt === 'pdf' && window.jspdf) {
      const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }), w = doc.internal.pageSize.getWidth();
      doc.setFontSize(14); doc.text(titulo, 40, 40); doc.setFontSize(9);
      cab.slice(1, 4).forEach((l, i) => doc.text(doc.splitTextToSize(l[0] + ': ' + l[1], w - 80), 40, 58 + i * 13));
      doc.autoTable({ head: [head], body: rows, startY: 105, styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: [20, 33, 61] }, margin: { left: 40, right: 40 }, columnStyles: { 9: { cellWidth: 220 } } });
      const yy = Math.min(doc.lastAutoTable.finalY + 50, doc.internal.pageSize.getHeight() - 40); doc.line(40, yy, 240, yy); doc.line(w - 240, yy, w - 40, yy); doc.text('Empregador', 40, yy + 12); doc.text(S.cfg.empregado, w - 240, yy + 12);
      await Store.dl.save({ filename: arq + '.pdf', data: doc.output('arraybuffer') }); return toast('PDF gerado.');
    }
    if (Store.dl) { await Store.dl.save({ filename: arq + '.csv', data: csv }); return toast('Arquivo gerado.'); }
  } catch (e) { if (e && e.code === 'declined') return; }
  modal(`<h2 style="margin:0 0 10px">${esc(titulo)}</h2><textarea id="cp" style="min-height:240px;font:12px ui-monospace,monospace" readonly>${esc(csv.slice(1))}</textarea><div class="row" style="margin-top:10px"><button class="btn" data-act="copiar">Copiar</button><button class="btn sec" data-act="fechar">Fechar</button></div>`);
}

function auth(m) { const e = $('#a-email').value.trim(), p = $('#a-senha').value; if (!e || !p) return toast('Informe e-mail e senha.'); Store.auth[m](e, p).catch(x => toast(ERR[x.code] || 'Não foi possível entrar (' + (x.code || 'erro') + ').')); }
async function importarDados(j) {
  const regs = j.regs || [], lote = [];
  for (const r of regs) if (r && /^\d{4}-\d\d-\d\d$/.test(r.date)) lote.push(r);
  for (let i = 0; i < lote.length; i += 400) { const b = Store.fs.batch(); lote.slice(i, i + 400).forEach(r => b.set(Store.fs.doc('he/' + r.date), r)); await b.commit(); }
  if (j.cfg) { const c = merge(Object.assign({}, S.cfg, j.cfg)); c.pct = Object.assign({}, S.cfg.pct, j.cfg.pct || {}); c.pagamentos = Object.assign({}, S.cfg.pagamentos, j.cfg.pagamentos || {}); S.cfg = c; await Store.saveCfg(); }
  return lote.length;
}
async function importar(file) {
  try { const n = await importarDados(JSON.parse(await file.text())); toast(n + ' lançamentos importados.'); render(); } catch (e) { toast('Arquivo inválido ou sem permissão para importar.'); }
}
// Importação por link: o histórico fica cifrado (AES-256-GCM) e a chave vem só no link, que não é enviado a nenhum servidor.
let IMP_KEY = (location.hash.match(/^#imp-([A-Za-z0-9_-]{40,})$/) || [])[1] || '';
function ofereceImport() {
  if (!IMP_KEY || Store.fase !== 'ok' || !Store.dono || $('#modal').classList.contains('on')) return;
  modal('<h2 style="margin:0 0 10px">Importar o histórico</h2><p>Importar os lançamentos e pagamentos de abril a agosto de 2026 para este app?</p><div class="row"><button class="btn" data-act="imp-link">Importar agora</button><button class="btn sec" data-act="imp-nao">Agora não</button></div>');
}
async function importarLink() {
  const k = IMP_KEY; IMP_KEY = ''; closeModal(); toast('Importando…');
  try {
    const raw = Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const buf = new Uint8Array(await (await fetch('historico.enc', { cache: 'no-store' })).arrayBuffer());
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const txt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)));
    const n = await importarDados(JSON.parse(txt)); toast(n + ' lançamentos importados.'); S.view = 'gestao'; render();
  } catch (e) { toast('Não foi possível importar por este link.'); }
}
const dec = v => { v = String(v || '').trim().replace(/\./g, '').replace(',', '.'); const x = parseFloat(v); return isFinite(x) ? x : 0; };
function lerForm() {
  const d = S.draft, f = $('#form-he'); if (!f || !d) return;
  f.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k, m = /^p(\d+)([if])$/.exec(k); if (m) d.periodos[+m[1]][m[2] === 'i' ? 'ini' : 'fim'] = el.value; else d[k] = el.value; });
}
function gravar(novo, just) {
  const antigo = S.regs[novo.date] || null;
  try { Store.saveReg(E.registrarAlteracao(antigo, novo, moto() ? nome1() : 'empregador', just, agora().iso)); return true; } catch (e) { toast(e.message); return false; }
}
const semHist = r => { const c = clone(r); delete c.hist; return c; };
const ACT = {
  ir: el => ir(el.dataset.v),
  mes: el => { S.ym = E.addMonths(S.ym, +el.dataset.n); render(); },
  dia: el => { S.date = E.addDays(S.date, +el.dataset.n); S.draft = null; S.dirty = false; render(); },
  abrir: el => { S.date = el.dataset.d; S.draft = null; ir('lancar'); },
  'per-add': () => { lerForm(); S.draft.periodos.push({ ini: '', fim: '' }); S.dirty = true; render(); },
  'per-del': el => { lerForm(); S.draft.periodos.splice(+el.dataset.i, 1); S.dirty = true; render(); },
  'fim-agora': () => { lerForm(); const p = S.draft.periodos[S.draft.periodos.length - 1]; p.fim = agora().time; S.dirty = true; render(); },
  salvar: () => {
    lerForm(); const d = S.draft, novo = recDe(d), t = agora(), old = S.regs[d.date];
    if (novo.periodos.some(p => !p.ini || !p.fim)) return toast('Preencha o início e o término de cada período.');
    if (!novo.periodos.length && !novo.comp && !novo.obs) return toast('Informe o horário da hora extra.');
    if (d.date > t.date) return toast('Não é possível lançar em data futura.');
    novo.status = moto() ? 'pendente' : 'aprovado';
    if (!gravar(novo, d.just || (old && old.anulado ? 'Relançado' : old && old.status !== 'aprovado' ? 'Ajuste antes da aprovação' : ''))) return;
    toast(moto() ? 'Lançado. Aguardando aprovação.' : 'Lançamento salvo.'); S.dirty = false; S.draft = null; S.ym = d.date.slice(0, 7); ir(moto() ? 'inicio' : 'gestao');
  },
  aprovar: el => { const r = semHist(S.regs[el.dataset.d]); r.status = 'aprovado'; if (gravar(r, 'Aprovado pelo empregador')) { toast('Aprovado.'); S.draft = null; S.dirty = false; render(); } },
  'aprovar-todos': () => { const ps = pendentes(); ps.forEach(x => { const r = semHist(x); r.status = 'aprovado'; gravar(r, 'Aprovado pelo empregador'); }); toast(ps.length + ' lançamentos aprovados.'); render(); },
  anular: () => { lerForm(); const old = S.regs[S.date]; if (old.status === 'aprovado' && !S.draft.just.trim()) return toast('Informe a justificativa para anular.'); const r = semHist(old); r.anulado = true; if (gravar(r, 'Anulado' + (S.draft.just ? ': ' + S.draft.just : ''))) { toast('Lançamento anulado. O histórico foi preservado.'); S.draft = null; S.dirty = false; render(); } },
  pedir: () => { const tx = $('#l-ped').value.trim(); if (!tx) return toast('Explique o que precisa ser corrigido.'); const r = clone(S.regs[S.date]), t = agora(); r.pedido = { texto: tx, em: t.iso }; r.hist = r.hist || []; r.hist.push({ em: t.iso, por: nome1(), justificativa: 'Pedido de correção: ' + tx, antes: null }); Store.saveReg(r); toast('Pedido enviado.'); render(); },
  'pedido-fim': () => { const r = clone(S.regs[S.date]); delete r.pedido; Store.saveReg(r); render(); },
  pagar: el => { const ym = el.dataset.ym, inp = $('#pg-' + ym), d = inp && inp.value, t = agora(), old = S.cfg.pagamentos[ym]; if (!d) return toast('Informe a data do pagamento.'); if (d > t.date) return toast('A data do pagamento não pode ser futura.'); S.cfg.pagamentos[ym] = { data: d, valor: el.dataset.manter && old ? old.valor : M(ym).total, registradoEm: t.iso }; Store.saveCfg(); toast(el.dataset.manter ? 'Data do pagamento salva.' : 'Pagamento de ' + mesNome(ym).toLowerCase() + ' confirmado.'); render(); },
  despagar: el => { delete S.cfg.pagamentos[el.dataset.ym]; Store.saveCfg(); toast('Pagamento desfeito.'); render(); },
  rel: el => exportar(el.dataset.ym, el.dataset.f),
  copiar: async () => { const ta = $('#cp'); try { await navigator.clipboard.writeText(ta.value); toast('Copiado.'); } catch (e) { ta.select(); toast('Selecione e copie o texto.'); } },
  fechar: closeModal,
  entrar: () => auth('signInWithEmailAndPassword'), criar: () => auth('createUserWithEmailAndPassword'),
  reset: () => { const e = $('#a-email').value.trim(); if (!e) return toast('Informe o e-mail.'); Store.auth.sendPasswordResetEmail(e).then(() => toast('Enviamos um e-mail para redefinir a senha.')).catch(x => toast(ERR[x.code] || 'Não foi possível enviar.')); },
  sair: () => Store.auth.signOut(),
  repedir: () => Store.fs.doc('pedidos/' + Store.user.uid).set({ email: Store.user.email || '', em: agora().iso }).then(() => { Store.pedOk = true; Store.pedErro = ''; toast('Pedido enviado.'); render(); }).catch(e => { Store.pedErro = (e && e.code) || 'erro'; render(); }),
  assumir: () => Store.fs.doc('config/acesso').set({ empregador: Store.user.uid, motoristas: [], emails: {}, criadoEm: agora().iso }).catch(() => toast('Não foi possível assumir. Outra conta já é a responsável.')),
  liberar: el => { const a = clone(Store.acesso), u = el.dataset.u; a.motoristas = [...new Set([...(a.motoristas || []), u])]; a.emails = Object.assign({}, a.emails, { [u]: el.dataset.e }); Store.fs.doc('config/acesso').set(a).then(() => Store.fs.doc('pedidos/' + u).delete()).then(() => toast('Acesso liberado.')).catch(() => toast('Não foi possível liberar.')); },
  revogar: el => { const a = clone(Store.acesso), u = el.dataset.u; a.motoristas = (a.motoristas || []).filter(x => x !== u); Store.fs.doc('config/acesso').set(a).then(() => toast('Acesso removido.')); },
  'ver-pedidos': () => Store.fs.collection('pedidos').get().then(q => { const l = []; q.forEach(d => l.push(Object.assign({ uid: d.id }, d.data()))); Store.pedidos = l; Store.pedErro = ''; toast(l.length ? l.length + ' pedido(s) encontrado(s).' : 'Nenhum pedido de acesso encontrado.'); render(); }).catch(e => { Store.pedErro = (e && e.code) || 'erro'; toast('Erro ao ler pedidos: ' + Store.pedErro); render(); }),
  'imp-link': importarLink, 'imp-nao': () => { IMP_KEY = ''; closeModal(); },
  backup: () => Store.dl.save({ filename: 'horas-extras-backup-' + agora().date + '.json', data: JSON.stringify({ cfg: S.cfg, regs: Object.values(S.regs) }) }),
  'copiar-link': async () => { try { await navigator.clipboard.writeText(APP_URL); toast('Link copiado.'); } catch (e) { toast('Copie o link mostrado abaixo.'); } },
  perfil: () => { S.perfil = moto() ? 'empregador' : 'motorista'; ir('inicio'); },
  tema: () => { const n = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro'; document.documentElement.dataset.tema = n; try { localStorage.setItem('he.tema', n); } catch (e) { } },
  'salvar-cfg': () => {
    const c = S.cfg, antes = E.salarioEm(c, S.ym);
    document.querySelectorAll('#form-cfg [data-cfg]').forEach(el => { const k = el.dataset.cfg; c[k] = el.type === 'checkbox' ? el.checked : k === 'divisor' ? Math.max(1, parseInt(el.value, 10) || 200) : el.value; });
    document.querySelectorAll('#form-cfg [data-pct]').forEach(el => { c.pct[el.dataset.pct] = Math.max(0, dec(el.value)); });
    if (c.pct.normal < 50) { c.pct.normal = 50; toast('O adicional mínimo legal de hora extra é 50%.'); }
    const sal = dec($('#c-sal').value), desde = $('#c-sald').value || S.ym;
    if (sal > 0 && Math.abs(sal - antes) > 0.004) { c.salarios = c.salarios.filter(s => s.desde !== desde); c.salarios.push({ desde, valor: sal }); if (!c.salarios.some(s => s.desde === '2000-01')) c.salarios.push({ desde: '2000-01', valor: antes }); }
    Store.saveCfg(); toast('Ajustes salvos.'); render();
  },
  'fer-add': () => { const d = $('#f-d').value, n = $('#f-n').value.trim(); if (!d) return toast('Informe a data do feriado.'); S.cfg.feriadosRemovidos = S.cfg.feriadosRemovidos.filter(x => x !== d); S.cfg.feriadosExtras.push({ date: d, nome: n || 'Feriado' }); Store.saveCfg(); render(); },
  'fer-del': el => { const d = el.dataset.d; S.cfg.feriadosExtras = S.cfg.feriadosExtras.filter(x => x.date !== d); if (!S.cfg.feriadosRemovidos.includes(d)) S.cfg.feriadosRemovidos.push(d); Store.saveCfg(); render(); }
};
document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const sm = e.target.closest('summary'); if (sm && sm.parentElement.dataset.mes) { e.preventDefault(); const ym = sm.parentElement.dataset.mes; S.aberto = S.aberto === ym ? null : ym; return render(); }
  const el = e.target.closest('[data-act]'); if (!el) return;
  e.preventDefault(); const f = ACT[el.dataset.act]; if (f) f(el);
});
document.addEventListener('submit', e => e.preventDefault());
const onInput = e => {
  const el = e.target;
  if (el.id === 'l-data' && e.type === 'change') { if (el.value) { S.date = el.value; S.draft = null; S.dirty = false; render(); } return; }
  if (el.id === 'imp' && e.type === 'change') { if (el.files[0]) importar(el.files[0]); return; }
  if (el.id === 'w-tel') { const a = $('#w-link'); if (a) a.href = zap(el.value); return; }
  if (el.dataset.k) { lerForm(); S.dirty = true; const p = $('#preview'); if (p) p.innerHTML = previewHTML(S.draft); }
};
document.addEventListener('input', onInput); document.addEventListener('change', onInput);
window.addEventListener('hashchange', () => { const mk = location.hash.match(/^#imp-([A-Za-z0-9_-]{40,})$/); if (mk) { IMP_KEY = mk[1]; try { location.hash = 'inicio'; } catch (e) { } return render(); } const v = location.hash.slice(1); if (VIEWS[v] && v !== S.view) { S.view = v; S.dirty = false; render(); } });
try { const t = localStorage.getItem('he.tema'); document.documentElement.dataset.tema = t || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'); } catch (e) { }
{ const v = location.hash.slice(1); if (VIEWS[v]) S.view = v; else if (v === 'historico') S.view = 'gestao'; }
window.__he = { S, Store, render, invalidate };
Store.init();
})();
