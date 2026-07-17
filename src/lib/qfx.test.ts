import { describe, expect, it } from "vitest";
import { isQfx, parseQfx } from "./qfx";

const BANK_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260716120000
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>0
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>123456789
<ACCTID>987654321
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260601000000
<DTEND>20260716000000
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260605120000[-5:EST]
<TRNAMT>-45.67
<FITID>202606050001
<NAME>COFFEE SHOP
<MEMO>morning coffee
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260610
<TRNAMT>1500.00
<FITID>202606100002
<NAME>PAYCHECK
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const CC_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<CCSTMTRS>
<CCACCTFROM>
<ACCTID>4111111111111111
</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260701
<TRNAMT>-89.99
<FITID>cc-001
<NAME>ONLINE STORE
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>
`;

describe("isQfx", () => {
  it("detects an OFX/QFX file by its header", () => {
    expect(isQfx(BANK_OFX)).toBe(true);
  });

  it("does not misdetect a generic CSV", () => {
    expect(isQfx("Date,Payee,Amount,Memo\n2026-01-05,Coffee,-4.50,\n")).toBe(false);
  });
});

describe("parseQfx", () => {
  it("parses a bank statement with a debit and a credit, handling a timezone-suffixed date and a plain date", () => {
    const { rows, skipped } = parseQfx(BANK_OFX);
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { date: "2026-06-05", payee: "COFFEE SHOP", memo: "morning coffee", amountCents: -4567, externalId: "202606050001" },
      { date: "2026-06-10", payee: "PAYCHECK", memo: "", amountCents: 150000, externalId: "202606100002" },
    ]);
  });

  it("parses a credit-card statement (CCSTMTTRNRS wrapper) the same way, ignoring the surrounding structure", () => {
    const { rows } = parseQfx(CC_OFX);
    expect(rows).toEqual([{ date: "2026-07-01", payee: "ONLINE STORE", memo: "", amountCents: -8999, externalId: "cc-001" }]);
  });

  it("falls back to PAYEE when NAME is absent, and to null externalId when FITID is absent", () => {
    const ofx = `<OFX><BANKTRANLIST><STMTTRN>
<DTPOSTED>20260701
<TRNAMT>-10.00
<PAYEE>SOME VENDOR
</STMTTRN></BANKTRANLIST></OFX>`;
    const { rows } = parseQfx(ofx);
    expect(rows).toEqual([{ date: "2026-07-01", payee: "SOME VENDOR", memo: "", amountCents: -1000, externalId: null }]);
  });

  it("skips (and counts) a block missing TRNAMT or DTPOSTED", () => {
    const ofx = `<OFX><BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20260701
<NAME>NO AMOUNT
</STMTTRN>
<STMTTRN>
<TRNAMT>-5.00
<NAME>NO DATE
</STMTTRN>
</BANKTRANLIST></OFX>`;
    const { rows, skipped } = parseQfx(ofx);
    expect(rows).toEqual([]);
    expect(skipped).toBe(2);
  });
});
