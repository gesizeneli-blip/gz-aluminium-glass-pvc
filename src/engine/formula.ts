/**
 * Safe arithmetic expression evaluator (no eval / Function).
 * Supports: numbers, variables, + - * / %, parentheses, comparisons,
 * && || !, and functions min max round floor ceil abs if(cond,a,b).
 */
type Tok = { t: 'num' | 'id' | 'op' | 'end'; v: string | number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (Number.isNaN(n)) throw new Error(`Numër i pavlefshëm "${src.slice(i, j)}"`);
      out.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/%(),<>!'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`Karakter i papritur "${c}"`);
  }
  out.push({ t: 'end', v: '' });
  return out;
}

export function evaluate(expr: string, vars: Record<string, number>): number {
  const toks = tokenize(expr);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = (v: string) => peek().t === 'op' && peek().v === v;

  function parseOr(): number {
    let l = parseAnd();
    while (isOp('||')) {
      next();
      const r = parseAnd();
      l = l || r ? 1 : 0;
    }
    return l;
  }
  function parseAnd(): number {
    let l = parseCmp();
    while (isOp('&&')) {
      next();
      const r = parseCmp();
      l = l && r ? 1 : 0;
    }
    return l;
  }
  function parseCmp(): number {
    let l = parseAdd();
    for (;;) {
      const t = peek();
      if (t.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v as string)) {
        next();
        const r = parseAdd();
        switch (t.v) {
          case '<': l = l < r ? 1 : 0; break;
          case '>': l = l > r ? 1 : 0; break;
          case '<=': l = l <= r ? 1 : 0; break;
          case '>=': l = l >= r ? 1 : 0; break;
          case '==': l = l === r ? 1 : 0; break;
          default: l = l !== r ? 1 : 0;
        }
      } else return l;
    }
  }
  function parseAdd(): number {
    let l = parseMul();
    while (isOp('+') || isOp('-')) {
      const o = next().v;
      const r = parseMul();
      l = o === '+' ? l + r : l - r;
    }
    return l;
  }
  function parseMul(): number {
    let l = parseUnary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const o = next().v;
      const r = parseUnary();
      if (o === '*') l = l * r;
      else if (o === '/') {
        if (r === 0) throw new Error('Pjesëtim me zero');
        l = l / r;
      } else l = l % r;
    }
    return l;
  }
  function parseUnary(): number {
    if (isOp('-')) {
      next();
      return -parseUnary();
    }
    if (isOp('+')) {
      next();
      return parseUnary();
    }
    if (isOp('!')) {
      next();
      return parseUnary() ? 0 : 1;
    }
    return parsePrimary();
  }
  function parsePrimary(): number {
    const t = next();
    if (t.t === 'num') return t.v as number;
    if (t.t === 'id') {
      const name = t.v as string;
      if (isOp('(')) {
        next();
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(parseOr());
          while (isOp(',')) {
            next();
            args.push(parseOr());
          }
        }
        if (!isOp(')')) throw new Error('Mungon ")"');
        next();
        return callFn(name, args);
      }
      if (!(name in vars)) throw new Error(`Ndryshore e panjohur "${name}"`);
      return vars[name];
    }
    if (t.t === 'op' && t.v === '(') {
      const v = parseOr();
      if (!isOp(')')) throw new Error('Mungon ")"');
      next();
      return v;
    }
    throw new Error('Shprehje e pavlefshme');
  }
  function callFn(name: string, a: number[]): number {
    switch (name) {
      case 'min': return Math.min(...a);
      case 'max': return Math.max(...a);
      case 'round': return Math.round(a[0]);
      case 'floor': return Math.floor(a[0]);
      case 'ceil': return Math.ceil(a[0]);
      case 'abs': return Math.abs(a[0]);
      case 'if': return a[0] ? a[1] : a[2];
      default: throw new Error(`Funksion i panjohur "${name}"`);
    }
  }

  if (!expr.trim()) throw new Error('Formulë boshe');
  const v = parseOr();
  if (peek().t !== 'end') throw new Error(`Tekst i papritur pas shprehjes`);
  if (!Number.isFinite(v)) throw new Error('Rezultat i pavlefshëm');
  return v;
}

export function tryEvaluate(expr: string, vars: Record<string, number>): { ok: true; value: number } | { ok: false; error: string } {
  try {
    return { ok: true, value: evaluate(expr, vars) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
