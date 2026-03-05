import {
  RuleNode,
  ExpressionNode,
  ComparisonNode,
  LogicalNode,
  NotNode,
  Action,
  MissingPolicy,
  Operator,
  LogicalOp,
} from './ast';

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`ParseError at line ${line}, column ${column}: ${message}`);
    this.name = 'ParseError';
  }
}

interface Token {
  type: string;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS = new Set([
  'RULE', 'WHEN', 'THEN', 'WEIGHT', 'MISSING',
  'AND', 'OR', 'NOT', 'NOT_IN', 'IN',
  'BLOCK', 'REVIEW', 'ALLOW',
  'SKIP', 'DEFAULT_HIGH', 'DEFAULT_LOW',
  'true', 'false',
]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  while (i < source.length) {
    const ch = source[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }

    // Newline
    if (ch === '\n') {
      line++;
      lineStart = i + 1;
      i++;
      continue;
    }

    const col = i - lineStart + 1;

    // String literal
    if (ch === '"') {
      let str = '';
      i++; // consume opening quote
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\n') {
          throw new ParseError('Unterminated string literal', line, col);
        }
        str += source[i];
        i++;
      }
      if (i >= source.length) {
        throw new ParseError('Unterminated string literal', line, col);
      }
      i++; // consume closing quote
      tokens.push({ type: 'STRING', value: str, line, column: col });
      continue;
    }

    // Numbers (including negative)
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      // Make sure '-' is actually a negative number, not something else
      if (ch === '-' && (i + 1 >= source.length || !(source[i + 1] >= '0' && source[i + 1] <= '9'))) {
        throw new ParseError(`Unexpected character '-'`, line, col);
      }
      let num = ch;
      i++;
      while (i < source.length && source[i] >= '0' && source[i] <= '9') {
        num += source[i];
        i++;
      }
      if (i < source.length && source[i] === '.') {
        num += '.';
        i++;
        while (i < source.length && source[i] >= '0' && source[i] <= '9') {
          num += source[i];
          i++;
        }
      }
      tokens.push({ type: 'NUMBER', value: num, line, column: col });
      continue;
    }

    // Operators
    if (ch === '>') {
      if (source[i + 1] === '=') {
        tokens.push({ type: 'OP', value: '>=', line, column: col });
        i += 2;
      } else {
        tokens.push({ type: 'OP', value: '>', line, column: col });
        i++;
      }
      continue;
    }

    if (ch === '<') {
      if (source[i + 1] === '=') {
        tokens.push({ type: 'OP', value: '<=', line, column: col });
        i += 2;
      } else {
        tokens.push({ type: 'OP', value: '<', line, column: col });
        i++;
      }
      continue;
    }

    if (ch === '=' && source[i + 1] === '=') {
      tokens.push({ type: 'OP', value: '==', line, column: col });
      i += 2;
      continue;
    }

    if (ch === '!' && source[i + 1] === '=') {
      tokens.push({ type: 'OP', value: '!=', line, column: col });
      i += 2;
      continue;
    }

    // Punctuation
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', line, column: col });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', line, column: col });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: 'LBRACKET', value: '[', line, column: col });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'RBRACKET', value: ']', line, column: col });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',', line, column: col });
      i++;
      continue;
    }

    // Identifiers / keywords
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let ident = '';
      while (
        i < source.length &&
        ((source[i] >= 'a' && source[i] <= 'z') ||
          (source[i] >= 'A' && source[i] <= 'Z') ||
          (source[i] >= '0' && source[i] <= '9') ||
          source[i] === '_' ||
          source[i] === '.')
      ) {
        ident += source[i];
        i++;
      }

      // Check for NOT_IN (already handled as single identifier due to '_')
      if (KEYWORDS.has(ident)) {
        tokens.push({ type: 'KEYWORD', value: ident, line, column: col });
      } else {
        tokens.push({ type: 'IDENT', value: ident, line, column: col });
      }
      continue;
    }

    throw new ParseError(`Unexpected character '${ch}'`, line, col);
  }

  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  private expect(type: string, value?: string): Token {
    const tok = this.peek();
    if (!tok) {
      throw new ParseError(
        `Expected ${value ?? type} but reached end of input`,
        0,
        0,
      );
    }
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new ParseError(
        `Expected '${value ?? type}' but got '${tok.value}'`,
        tok.line,
        tok.column,
      );
    }
    return this.advance();
  }

  private check(type: string, value?: string): boolean {
    const tok = this.peek();
    if (!tok) return false;
    if (tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  }

  parseRule(): RuleNode {
    this.expect('KEYWORD', 'RULE');
    const idTok = this.peek();
    if (!idTok || idTok.type !== 'IDENT') {
      const t = idTok ?? { line: 0, column: 0, value: 'end of input' };
      throw new ParseError(
        `Expected rule identifier but got '${t.value}'`,
        t.line,
        t.column,
      );
    }
    const id = this.advance().value;

    this.expect('KEYWORD', 'WHEN');
    const condition = this.parseExpression();

    this.expect('KEYWORD', 'THEN');
    const actionTok = this.peek();
    if (
      !actionTok ||
      !['BLOCK', 'REVIEW', 'ALLOW'].includes(actionTok.value)
    ) {
      const t = actionTok ?? { line: 0, column: 0, value: 'end of input' };
      throw new ParseError(
        `Expected BLOCK, REVIEW, or ALLOW but got '${t.value}'`,
        t.line,
        t.column,
      );
    }
    const action = this.advance().value as Action;

    let weight = 1.0;
    let missingPolicy: MissingPolicy = 'SKIP';

    // Optional WEIGHT
    if (this.check('KEYWORD', 'WEIGHT')) {
      this.advance();
      const numTok = this.peek();
      if (!numTok || numTok.type !== 'NUMBER') {
        const t = numTok ?? { line: 0, column: 0, value: 'end of input' };
        throw new ParseError(
          `Expected number after WEIGHT but got '${t.value}'`,
          t.line,
          t.column,
        );
      }
      weight = parseFloat(this.advance().value);
    }

    // Optional MISSING
    if (this.check('KEYWORD', 'MISSING')) {
      this.advance();
      const policyTok = this.peek();
      if (
        !policyTok ||
        !['SKIP', 'DEFAULT_HIGH', 'DEFAULT_LOW'].includes(policyTok.value)
      ) {
        const t = policyTok ?? { line: 0, column: 0, value: 'end of input' };
        throw new ParseError(
          `Expected SKIP, DEFAULT_HIGH, or DEFAULT_LOW but got '${t.value}'`,
          t.line,
          t.column,
        );
      }
      missingPolicy = this.advance().value as MissingPolicy;
    }

    return { type: 'rule', id, condition, action, weight, missingPolicy };
  }

  private parseExpression(): ExpressionNode {
    return this.parseOr();
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();

    while (this.check('KEYWORD', 'OR')) {
      this.advance();
      const right = this.parseAnd();
      const node: LogicalNode = { type: 'logical', op: 'OR' as LogicalOp, left, right };
      left = node;
    }

    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseTerm();

    while (this.check('KEYWORD', 'AND')) {
      this.advance();
      const right = this.parseTerm();
      const node: LogicalNode = { type: 'logical', op: 'AND' as LogicalOp, left, right };
      left = node;
    }

    return left;
  }

  private parseTerm(): ExpressionNode {
    if (this.check('KEYWORD', 'NOT')) {
      this.advance();
      const operand = this.parseTerm();
      const node: NotNode = { type: 'not', operand };
      return node;
    }

    if (this.check('LPAREN')) {
      this.advance();
      const expr = this.parseExpression();
      this.expect('RPAREN');
      return expr;
    }

    return this.parseComparison();
  }

  private parseComparison(): ComparisonNode {
    const fieldTok = this.peek();
    if (!fieldTok || fieldTok.type !== 'IDENT') {
      const t = fieldTok ?? { line: 0, column: 0, value: 'end of input' };
      throw new ParseError(
        `Expected field (e.g. device.trustScore) but got '${t.value}'`,
        t.line,
        t.column,
      );
    }
    const field = this.advance().value;

    // Validate field has a dot (signal_prefix.identifier)
    if (!field.includes('.')) {
      throw new ParseError(
        `Field must be in format 'signal.property', got '${field}'`,
        fieldTok.line,
        fieldTok.column,
      );
    }

    const opTok = this.peek();
    if (!opTok) {
      throw new ParseError('Expected operator but reached end of input', 0, 0);
    }

    let operator: Operator;
    if (opTok.type === 'OP') {
      operator = this.advance().value as Operator;
    } else if (opTok.type === 'KEYWORD' && opTok.value === 'IN') {
      operator = 'IN';
      this.advance();
    } else if (opTok.type === 'KEYWORD' && opTok.value === 'NOT_IN') {
      operator = 'NOT_IN';
      this.advance();
    } else {
      throw new ParseError(
        `Expected operator but got '${opTok.value}'`,
        opTok.line,
        opTok.column,
      );
    }

    const value = this.parseValue();

    return { type: 'comparison', field, operator, value };
  }

  private parseValue(): number | string | boolean | (number | string)[] {
    const tok = this.peek();
    if (!tok) {
      throw new ParseError('Expected value but reached end of input', 0, 0);
    }

    if (tok.type === 'NUMBER') {
      this.advance();
      return parseFloat(tok.value);
    }

    if (tok.type === 'STRING') {
      this.advance();
      return tok.value;
    }

    if (tok.type === 'KEYWORD' && (tok.value === 'true' || tok.value === 'false')) {
      this.advance();
      return tok.value === 'true';
    }

    if (tok.type === 'LBRACKET') {
      return this.parseList();
    }

    throw new ParseError(
      `Expected value (number, string, boolean, or list) but got '${tok.value}'`,
      tok.line,
      tok.column,
    );
  }

  private parseList(): (number | string)[] {
    this.expect('LBRACKET');
    const items: (number | string)[] = [];

    // Allow empty list
    if (this.check('RBRACKET')) {
      this.advance();
      return items;
    }

    const first = this.parseListItem();
    items.push(first);

    while (this.check('COMMA')) {
      this.advance();
      items.push(this.parseListItem());
    }

    this.expect('RBRACKET');
    return items;
  }

  private parseListItem(): number | string {
    const tok = this.peek();
    if (!tok) {
      throw new ParseError('Expected list item but reached end of input', 0, 0);
    }

    if (tok.type === 'NUMBER') {
      this.advance();
      return parseFloat(tok.value);
    }

    if (tok.type === 'STRING') {
      this.advance();
      return tok.value;
    }

    throw new ParseError(
      `Expected number or string in list but got '${tok.value}'`,
      tok.line,
      tok.column,
    );
  }

  hasMore(): boolean {
    return this.pos < this.tokens.length;
  }
}

/**
 * Parse a single rule from a DSL source string.
 */
export function parse(source: string): RuleNode {
  const tokens = tokenize(source.trim());
  const parser = new Parser(tokens);
  const rule = parser.parseRule();
  if (parser.hasMore()) {
    const remaining = tokens[0];
    throw new ParseError(
      'Unexpected tokens after rule definition',
      remaining.line,
      remaining.column,
    );
  }
  return rule;
}

/**
 * Parse multiple rules from a source string.
 * Rules are separated by newlines; blank lines are ignored.
 */
export function parseAll(source: string): RuleNode[] {
  const lines = source.split('\n');
  const rules: RuleNode[] = [];

  // Merge lines into rule chunks: each chunk starts with RULE
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('RULE ') || trimmed === 'RULE') {
      if (current) {
        chunks.push(current.trim());
      }
      current = trimmed;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  for (const chunk of chunks) {
    rules.push(parse(chunk));
  }

  return rules;
}
