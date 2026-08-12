import { toCsv, csvFilename } from './csv.helper';

describe('toCsv', () => {
  it('writes headers and rows with BOM and CRLF', () => {
    const csv = toCsv(['name', 'age'], [{ name: 'Ada', age: 36 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFname,age\r\nAda,36');
  });

  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        { a: 'x,y', b: 'say "hi"' },
        { a: 'multi\nline', b: 'ok' },
      ],
    );
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"multi\nline"');
  });

  it('renders null/undefined as empty and dates as ISO', () => {
    const csv = toCsv(
      ['a', 'b', 'c'],
      [{ a: null, b: undefined, c: new Date('2026-01-02T03:04:05.000Z') }],
    );
    expect(csv).toContain('\uFEFFa,b,c\r\n,,2026-01-02T03:04:05.000Z');
  });

  it('neutralizes formula injection prefixes', () => {
    const csv = toCsv(['a'], [{ a: '=SUM(A1:A9)' }]);
    expect(csv).toContain("'=SUM(A1:A9)");
  });

  it('quotes injection-prefixed cells containing commas', () => {
    const csv = toCsv(['a'], [{ a: '=x,y' }]);
    expect(csv).toContain('"\'=x,y"');
  });

  it.each(['+SUM(A1:A9)', '-1+2', '@SUM(A1:A9)', '\t=1+1', '\r=1+1'])(
    'neutralizes %j',
    (value) => {
      const csv = toCsv(['a'], [{ a: value }]);
      expect(csv).toContain(`'${value}`);
    },
  );
});

describe('csvFilename', () => {
  it('produces resource-date.csv', () => {
    expect(csvFilename('users')).toMatch(/^users-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
