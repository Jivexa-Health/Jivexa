import React from 'react';

interface MarkdownTextProps {
  content: string;
  isUser?: boolean;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, isUser = false }) => {
  if (!content) return null;

  // Split into raw blocks by double newline
  const rawBlocks = content.split(/\n\n+/);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rawBlocks.map((rawBlock, bIdx) => {
        const trimmed = rawBlock.trim();
        if (!trimmed) return null;

        // 1. Horizontal Rule (--- or ***)
        if (/^[-*_]{3,}$/.test(trimmed)) {
          return (
            <hr 
              key={bIdx} 
              style={{ 
                border: 'none', 
                borderTop: isUser ? '1px solid rgba(255,255,255,0.2)' : '1px solid #e2e8f0', 
                margin: '8px 0' 
              }} 
            />
          );
        }

        // 2. Headings (# to ####)
        if (trimmed.startsWith('#')) {
          const match = trimmed.match(/^(#{1,4})\s*(.*)$/s);
          if (match) {
            const level = match[1].length;
            const headingText = match[2];
            const fontSize = level === 1 ? '1.18rem' : level === 2 ? '1.08rem' : level === 3 ? '0.98rem' : '0.90rem';
            return (
              <h4
                key={bIdx}
                style={{
                  fontSize,
                  fontWeight: 800,
                  marginTop: bIdx === 0 ? '0' : '6px',
                  marginBottom: '2px',
                  color: isUser ? 'white' : '#0f172a',
                  lineHeight: '1.35',
                  letterSpacing: '-0.01em'
                }}
              >
                {parseInlineMarkdown(headingText, isUser)}
              </h4>
            );
          }
        }

        // 3. Code Blocks (```code```)
        if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
          const codeContent = trimmed.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
          return (
            <pre
              key={bIdx}
              style={{
                backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : '#f8fafc',
                border: isUser ? 'none' : '1px solid #e2e8f0',
                color: isUser ? 'white' : '#0f172a',
                padding: '10px 14px',
                borderRadius: '8px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.84rem',
                overflowX: 'auto',
                margin: '4px 0'
              }}
            >
              <code>{codeContent}</code>
            </pre>
          );
        }

        // 4. Markdown Tables (| Header | Header |)
        const lines = trimmed.split('\n');
        const isTable = lines.length >= 2 && lines[0].startsWith('|') && lines[0].endsWith('|');
        if (isTable) {
          const headers = lines[0].split('|').map(s => s.trim()).filter(Boolean);
          const bodyRows = lines.slice(1).filter(row => !row.includes('---')).map(row => 
            row.split('|').map(s => s.trim()).filter(Boolean)
          );

          return (
            <div key={bIdx} style={{ overflowX: 'auto', margin: '6px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <thead>
                  <tr style={{ backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    {headers.map((h, hIdx) => (
                      <th key={hIdx} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700 }}>
                        {parseInlineMarkdown(h, isUser)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: '6px 10px' }}>
                          {parseInlineMarkdown(cell, isUser)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // 5. Blockquotes (> text)
        if (trimmed.startsWith('>')) {
          const quoteText = trimmed.replace(/^>\s*/gm, '');
          return (
            <blockquote
              key={bIdx}
              style={{
                borderLeft: isUser ? '3px solid rgba(255,255,255,0.8)' : '3px solid #059669',
                backgroundColor: isUser ? 'rgba(255,255,255,0.08)' : '#f0fdf4',
                padding: '6px 12px',
                borderRadius: '0 6px 6px 0',
                margin: '4px 0',
                fontStyle: 'italic',
                fontSize: '0.86rem'
              }}
            >
              {parseInlineMarkdown(quoteText, isUser)}
            </blockquote>
          );
        }

        // 6. Mixed Line-by-Line Parsing: Handles paragraphs, bullet lists, and numbered lists seamlessly
        const groups: { type: 'p' | 'ul' | 'ol'; items: string[] }[] = [];
        let currentGroup: { type: 'p' | 'ul' | 'ol'; items: string[] } | null = null;

        for (const line of lines) {
          const lTrim = line.trim();
          if (!lTrim) continue;

          const isUl = lTrim.startsWith('- ') || lTrim.startsWith('* ') || lTrim.startsWith('• ');
          const isOl = /^\d+[\.\)]\s/.test(lTrim);

          if (isUl) {
            const itemText = lTrim.replace(/^[-*•]\s*/, '');
            if (currentGroup && currentGroup.type === 'ul') {
              currentGroup.items.push(itemText);
            } else {
              currentGroup = { type: 'ul', items: [itemText] };
              groups.push(currentGroup);
            }
          } else if (isOl) {
            const itemText = lTrim.replace(/^\d+[\.\)]\s*/, '');
            if (currentGroup && currentGroup.type === 'ol') {
              currentGroup.items.push(itemText);
            } else {
              currentGroup = { type: 'ol', items: [itemText] };
              groups.push(currentGroup);
            }
          } else {
            if (currentGroup && currentGroup.type === 'p') {
              currentGroup.items.push(lTrim);
            } else {
              currentGroup = { type: 'p', items: [lTrim] };
              groups.push(currentGroup);
            }
          }
        }

        return (
          <div key={bIdx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {groups.map((grp, gIdx) => {
              if (grp.type === 'ul') {
                return (
                  <ul
                    key={gIdx}
                    style={{
                      margin: '2px 0 2px 20px',
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      listStyleType: 'disc'
                    }}
                  >
                    {grp.items.map((item, iIdx) => (
                      <li key={iIdx} style={{ lineHeight: '1.55', fontSize: '0.88rem' }}>
                        {parseInlineMarkdown(item, isUser)}
                      </li>
                    ))}
                  </ul>
                );
              }
              if (grp.type === 'ol') {
                return (
                  <ol
                    key={gIdx}
                    style={{
                      margin: '2px 0 2px 20px',
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      listStyleType: 'decimal'
                    }}
                  >
                    {grp.items.map((item, iIdx) => (
                      <li key={iIdx} style={{ lineHeight: '1.55', fontSize: '0.88rem' }}>
                        {parseInlineMarkdown(item, isUser)}
                      </li>
                    ))}
                  </ol>
                );
              }
              return (
                <p key={gIdx} style={{ margin: 0, lineHeight: '1.6', fontSize: '0.88rem' }}>
                  {parseInlineMarkdown(grp.items.join(' '), isUser)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Parse inline **bold**, *italic*, `code`, and [link text](url) formatting
 */
function parseInlineMarkdown(text: string, isUser: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // 1. Links: [Label](URL)
    const linkMatch = remaining.match(/^(.*?)\[(.*?)\]\((https?:\/\/[^\s\)]+)\)(.*)/s);
    // 2. Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.*?)\*\*(.*)/s);
    // 3. Code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.*?)`(.*)/s);

    // Determine which token appears earliest
    const matchCandidates = [
      linkMatch ? { type: 'link', pos: linkMatch[1].length, match: linkMatch } : null,
      boldMatch ? { type: 'bold', pos: boldMatch[1].length, match: boldMatch } : null,
      codeMatch ? { type: 'code', pos: codeMatch[1].length, match: codeMatch } : null
    ].filter(Boolean) as { type: string; pos: number; match: RegExpMatchArray }[];

    if (matchCandidates.length === 0) {
      parts.push(remaining);
      break;
    }

    matchCandidates.sort((a, b) => a.pos - b.pos);
    const earliest = matchCandidates[0];

    if (earliest.type === 'link') {
      const m = earliest.match;
      if (m[1]) parts.push(m[1]);
      parts.push(
        <a
          key={`l_${keyIdx++}`}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: isUser ? '#bfdbfe' : '#0284c7',
            textDecoration: 'underline',
            fontWeight: 600
          }}
        >
          {m[2]}
        </a>
      );
      remaining = m[4];
    } else if (earliest.type === 'bold') {
      const m = earliest.match;
      if (m[1]) parts.push(m[1]);
      parts.push(
        <strong key={`b_${keyIdx++}`} style={{ fontWeight: 800 }}>
          {m[2]}
        </strong>
      );
      remaining = m[3];
    } else if (earliest.type === 'code') {
      const m = earliest.match;
      if (m[1]) parts.push(m[1]);
      parts.push(
        <code
          key={`c_${keyIdx++}`}
          style={{
            backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
            color: isUser ? 'white' : '#0f172a',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.82rem'
          }}
        >
          {m[2]}
        </code>
      );
      remaining = m[3];
    }
  }

  return parts;
}
