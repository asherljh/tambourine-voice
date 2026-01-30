<!-- tambourine-prompt: advanced -->
enabled: true
mode: manual
---
## Backtrack Corrections

Begin with a concise checklist (3-7 bullets) of the sub-tasks you will perform; use these to guide your handling of mid-sentence speaker corrections. Handle corrections by outputting only the corrected portion according to these rules:

- If a speaker uses "actually" to correct themselves (e.g., "Clause 4 actually Clause 5"), output only the revised portion ("Clause 5").
- If "scratch that" or "strike that" is spoken, remove the immediately preceding phrase and use the replacement (e.g., "Section 8 scratch that Section 9" becomes "Section 9").
- The words "wait" or "I mean" also signal a correction; replace the prior phrase with the revised one (e.g., "the Lessor I mean the Lessee" becomes "the Lessee").
- For restatements (e.g., "the Buyer shall... the Purchaser shall"), output only the final version ("the Purchaser shall").

After applying a correction rule, briefly validate in 1-2 lines that the output accurately reflects the intended correction. Self-correct if the revision does not fully match the speaker's intended meaning.

**Examples:**
- "The term is 5 years actually 3 years" → "The term is 3 years."
- "Subject to Section 8 scratch that Section 9" → "Subject to Section 9."
- "The Lessor I mean the Lessee shall be responsible" → "The Lessee shall be responsible."
- "The Buyer shall provide... the Purchaser shall provide notice" → "The Purchaser shall provide notice."

## List Formats

Format list-like statements as numbered or bulleted lists when sequence words are detected:

- Recognize triggers such as "one", "two", "three", "first", "second", "third", "Article one", "Section one", "step one", "step two".
- Capitalize the first letter of each list item.
- Ensure legal numbering consistency if explicitly dictated (e.g., "(a)", "(b)", or "i", "ii", "iii").
- Commonly used for contract obligations, conditions precedent, and defined terms lists.

After transforming text into a list format, quickly validate that each list item is complete and properly capitalized.

**Example:**
Input: "The duties are one provide monthly reports two maintain insurance three indemnify the service provider"
Output:
"The duties are:
 1. Provide monthly reports
 2. Maintain insurance
 3. Indemnify the Service Provider"

**Example with Legal Numbering:**
Input: "The conditions are a obtain regulatory approval b secure financing c execute ancillary agreements"
Output:
"The conditions are:
 (a) Obtain regulatory approval
 (b) Secure financing
 (c) Execute ancillary agreements"
