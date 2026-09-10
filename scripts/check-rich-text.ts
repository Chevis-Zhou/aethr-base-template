import { sanitizeRichText, renderRichText, richTextToPlainText, hasMarkup, safeHref } from "../src/lib/rich-text";

const cases: [string, string][] = [
  ["<p>Hello <strong>world</strong></p>", "<p>Hello <strong>world</strong></p>"],
  ["<p onclick=\"alert(1)\">x</p>", "<p>x</p>"],
  ["<script>alert(1)</script><p>ok</p>", "<p>ok</p>"],
  ["<img src=x onerror=alert(1)>", ""],
  ["<a href=\"javascript:alert(1)\">x</a>", "x"],
  ["<a href=\"java&#115;cript:alert(1)\">x</a>", "x"],
  ["<a href=\"https://x.com\">go</a>", "<a href=\"https://x.com\" rel=\"noopener noreferrer\">go</a>"],
  ["<b>bold</b><i>it</i>", "<strong>bold</strong><em>it</em>"],
  ["<div>plain</div>", "plain"],
  ["<p><em>x</p>", "<p><em>x</em></p>"],
  ["scores < 60% are bad", "scores &lt; 60% are bad"],
  ["<ul><li>a</li><li>b</li></ul>", "<ul><li>a</li><li>b</li></ul>"],
  ["<p style=\"color:red\">x</p>", "<p>x</p>"],
  ["<a href=\"/about\">rel</a>", "<a href=\"/about\" rel=\"noopener noreferrer\">rel</a>"],
  ["<a href=\"http://x.com\">plain http</a>", "plain http"],
  ["<P>UPPER</P>", "<p>UPPER</p>"],
  ["<iframe src=\"x\">inner</iframe>tail", "tail"],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = sanitizeRichText(input);
  if (got !== want) { failed++; console.log(`FAIL  ${JSON.stringify(input)}\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`); }
}
console.log(`sanitize: ${cases.length - failed}/${cases.length} passed`);

console.log("plain->rich:", JSON.stringify(renderRichText("one\n\ntwo\nthree")));
console.log("rich passthrough:", JSON.stringify(renderRichText("<p>a</p><ul><li>b</li></ul>")));
console.log("toPlain:", JSON.stringify(richTextToPlainText("<p>a</p><ul><li>b</li><li>c</li></ul>")));
console.log("hasMarkup('a < b'):", hasMarkup("a < b"), "hasMarkup('<p>x</p>'):", hasMarkup("<p>x</p>"));
console.log("safeHref data:", safeHref("data:text/html,<script>"), "| tel:", safeHref("tel:+1555"), "| #anchor:", safeHref("#faq"));
process.exit(failed ? 1 : 0);
