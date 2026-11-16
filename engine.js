/* Motor de cálculo de horas extras — independente da interface.
   Regra da casa: 50% nas horas extras comuns; 100% após a meia-noite (0h–5h), domingos e feriados.
   Piso legal opcional para o período noturno (22h–5h): hora reduzida de 52min30s + adicional de 20%. */
(function (root) {
'use strict';
const FONTES = {
  he: 'CF, art. 7º, XVI; CLT, art. 59; LC 150/2015, art. 2º (hora extra com no mínimo 50%)',
  hora: 'Salário mensal ÷ divisor (200 para 40 horas semanais; Súmula 431 do TST)',
  dobro: 'Lei 605/1949, art. 9º; Súmula 146 do TST (domingo e feriado trabalhados sem folga: em dobro)',
  noturno: 'CLT, art. 73; LC 150/2015, art. 14 (22h–5h: hora de 52min30s e adicional mínimo de 20%)',
  dsr: 'Lei 605/1949, art. 7º; Súmula 172 do TST (horas extras habituais refletem no repouso semanal)',
  limite: 'CLT, art. 59 (até 2 horas extras por dia)',
  casa: 'Regra definida pelo empregador'
};
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const hm = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const toUTC = d => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
const fromUTC = t => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
const addDays = (d, n) => fromUTC(toUTC(d) + n * 864e5);
const dow = d => new Date(toUTC(d)).getUTCDay();
const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); };
function fmtH(min) { const s = min < 0 ? '-' : ''; min = Math.round(Math.abs(min)); return s + Math.floor(min / 60) + 'h' + pad(min % 60); }

function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return y + '-' + pad(mes) + '-' + pad(dia);
}
function feriados(y, cfg) {
  const p = pascoa(y), f = {};
  const fix = { '01-01': 'Confraternização Universal', '01-25': 'Aniversário de São Paulo', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '07-09': 'Revolução Constitucionalista (SP)', '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal' };
  for (const k in fix) f[y + '-' + k] = fix[k];
  f[addDays(p, -2)] = 'Sexta-feira Santa'; f[addDays(p, 60)] = 'Corpus Christi';
  for (const x of (cfg && cfg.feriadosExtras) || []) if (x.date && x.date.slice(0, 4) == y) f[x.date] = x.nome || 'Feriado';
  for (const d of (cfg && cfg.feriadosRemovidos) || []) delete f[d];
  return f;
}
const _fc = {};
function ehFeriado(d, cfg) {
  const y = d.slice(0, 4), key = y + JSON.stringify([(cfg && cfg.feriadosExtras) || [], (cfg && cfg.feriadosRemovidos) || []]);
  return (_fc[key] || (_fc[key] = feriados(+y, cfg)))[d] || null;
}
function salarioEm(cfg, ym) {
  let v = 0;
  for (const s of [...(cfg.salarios || [])].sort((a, b) => a.desde < b.desde ? -1 : 1)) if (s.desde <= ym) v = s.valor;
  return v || ((cfg.salarios || [])[0] || {}).valor || 0;
}
const horaDe = (cfg, ym) => salarioEm(cfg, ym) / (+cfg.divisor || 200);
const PCT = cfg => Object.assign({ normal: 50, madrugada: 100, domingo: 100, feriado: 100 }, cfg.pct || {});
const ativo = r => r && !r.anulado;

/* Um dia: cada período é fatiado nas viradas de 5h, 22h e meia-noite e classificado pelo dia real do calendário. */
function calcDia(rec, cfg) {
  const res = { date: rec.date, min: 0, min50: 0, min100: 0, minNot: 0, v50: 0, v100: 0, compl: 0, total: 0, comp: +rec.comp || 0, faixas: [], memoria: [], alertas: [] };
  if (!ativo(rec)) return res;
  const hora = horaDe(cfg, rec.date.slice(0, 7)), p = PCT(cfg), usados = [];
  const n4 = x => x.toFixed(2).replace('.', ','), brl = x => 'R$ ' + r2(x).toFixed(2).replace('.', ',');
  const grupos = {};
  for (const per of rec.periodos || []) {
    if (!per.ini || !per.fim) continue;
    const a = hm(per.ini); let b = hm(per.fim); if (b <= a) b += 1440;
    if (usados.some(([x, y]) => a < y && b > x)) res.alertas.push({ nivel: 'vermelho', txt: 'Períodos sobrepostos: confira os horários.' });
    usados.push([a, b]);
    const cortes = [a, b]; for (const c of [300, 1320, 1440, 1740, 2760]) if (c > a && c < b) cortes.push(c);
    cortes.sort((x, y) => x - y);
    for (let i = 0; i < cortes.length - 1; i++) {
      const s = cortes[i], e = cortes[i + 1], mid = (s + e) / 2, d = addDays(rec.date, Math.floor(mid / 1440)), mod = mid % 1440;
      const noite = mod < 300 || mod >= 1320, madru = mod < 300, dom = dow(d) === 0, fer = ehFeriado(d, cfg);
      const tipo = dom ? 'domingo' : fer ? 'feriado' : madru ? 'madrugada' : 'normal', pct = p[tipo] / 100, min = e - s, h = min / 60;
      const casa = h * hora * (1 + pct);
      let legal = 0;
      if (noite && cfg.pisoNoturno === true) legal = h * (60 / 52.5) * hora * 1.2 * (dom || fer ? 2 : 1.5);
      const valor = Math.max(casa, legal), k = tipo + (noite ? 'N' : 'D');
      const g = grupos[k] || (grupos[k] = { tipo, noite, pct, min: 0, casa: 0, valor: 0, legal: 0 });
      g.min += min; g.casa += casa; g.valor += valor; g.legal += legal;
      res.min += min; if (noite) res.minNot += min;
      if (pct >= 1) { res.min100 += min; res.v100 += casa; } else { res.min50 += min; res.v50 += casa; }
      res.compl += valor - casa;
    }
  }
  const NOME = { normal: 'Hora extra', madrugada: 'Após a meia-noite', domingo: 'Domingo', feriado: 'Feriado' };
  for (const k in grupos) {
    const g = grupos[k], rot = NOME[g.tipo] + ' ' + Math.round(g.pct * 100) + '%' + (g.noite && g.tipo !== 'madrugada' ? ' (noturna, 22h–5h)' : '');
    res.faixas.push({ rot, min: g.min, valor: r2(g.valor) });
    res.memoria.push({ rub: rot, formula: n4(g.min / 60) + ' h × ' + brl(hora) + ' × ' + (1 + g.pct).toFixed(1).replace('.', ',') + ' = ' + brl(g.casa), valor: r2(g.casa), fonte: g.tipo === 'normal' ? FONTES.he : g.tipo === 'madrugada' ? FONTES.casa : FONTES.dobro });
    if (g.valor - g.casa > 0.004) res.memoria.push({ rub: 'Complemento do piso noturno legal', formula: n4(g.min / 60) + ' h × 60/52,5 × ' + brl(hora) + ' × 1,2 × ' + (g.tipo === 'domingo' || g.tipo === 'feriado' ? '2,0' : '1,5') + ' = ' + brl(g.legal) + '; diferença ' + brl(g.valor - g.casa), valor: r2(g.valor - g.casa), fonte: FONTES.noturno });
  }
  res.total = res.v50 + res.v100 + res.compl;
  const d0 = dow(rec.date);
  if (d0 >= 1 && d0 <= 5 && !ehFeriado(rec.date, cfg) && res.min > 120) res.alertas.push({ nivel: 'amarelo', txt: fmtH(res.min) + ' extras no dia: acima do limite de 2 horas.', fonte: FONTES.limite });
  if (res.min >= 600) res.alertas.push({ nivel: 'amarelo', txt: 'Período de ' + fmtH(res.min) + ' sem intervalo registrado. Se houve pausa para refeição, lance em dois períodos.' });
  return res;
}

function calcMes(ym, regs, cfg) {
  const n = daysInMonth(ym), hora = horaDe(cfg, ym), p = PCT(cfg), dias = [];
  const t = { min: 0, min50: 0, min100: 0, minNot: 0, v50: 0, v100: 0, compl: 0, comp: 0, lanc: 0, pend: 0, acima2h: 0 };
  let descanso = 0;
  for (let i = 1; i <= n; i++) {
    const d = ym + '-' + pad(i), rec = regs[d];
    if (dow(d) === 0 || ehFeriado(d, cfg)) descanso++;
    if (!ativo(rec)) { dias.push({ date: d, rec: rec || null, res: null }); continue; }
    const res = calcDia(rec, cfg); dias.push({ date: d, rec, res });
    for (const k of ['min', 'min50', 'min100', 'minNot', 'v50', 'v100', 'compl', 'comp']) t[k] += res[k];
    if (res.min || res.comp) t.lanc++;
    if (rec.status === 'pendente') t.pend++;
    if (res.alertas.some(a => /limite de 2/.test(a.txt))) t.acima2h++;
  }
  const compUsado = Math.min(t.comp, t.min50), vComp = compUsado / 60 * hora * (1 + p.normal / 100);
  const base = t.v50 + t.v100 + t.compl - vComp, uteis = n - descanso;
  const dsr = cfg.dsr !== true || !uteis ? 0 : base / uteis * descanso;
  return { ym, dias, t, hora, salario: salarioEm(cfg, ym), compUsado, compSobra: t.comp - compUsado, vComp: r2(vComp),
    v50: r2(t.v50), v100: r2(t.v100), compl: r2(t.compl), base: r2(base), dsr: r2(dsr), total: r2(base + dsr), uteis, descanso,
    dsrMemoria: 'R$ ' + r2(base).toFixed(2).replace('.', ',') + ' ÷ ' + uteis + ' dias úteis × ' + descanso + ' domingos e feriados' };
}

/* Trilha de auditoria: toda alteração guarda o valor anterior, o autor, a data e a justificativa. */
function registrarAlteracao(antigo, novo, por, justificativa, quando) {
  const rec = Object.assign({}, novo, { hist: antigo && antigo.hist ? antigo.hist.slice() : [] });
  if (antigo && antigo.origem && !rec.origem) rec.origem = antigo.origem;
  if (antigo) {
    if (antigo.status === 'aprovado' && !antigo.anulado && !String(justificativa || '').trim()) throw new Error('Informe a justificativa para alterar um lançamento aprovado.');
    const antes = {}; for (const c of ['periodos', 'comp', 'motivo', 'obs', 'status', 'anulado']) if (antigo[c] !== undefined) antes[c] = antigo[c];
    rec.hist.push({ em: quando, por, justificativa: justificativa || '', antes });
  } else rec.hist.push({ em: quando, por, justificativa: 'Lançamento criado', antes: null });
  return rec;
}

const API = { FONTES, feriados, ehFeriado, pascoa, salarioEm, horaDe, PCT, calcDia, calcMes, registrarAlteracao, ativo, fmtH, r2, addDays, addMonths, dow, daysInMonth, hm, pad };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.HE = API;
})(typeof window !== 'undefined' ? window : globalThis);
