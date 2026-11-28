import React from 'react';

interface MarkdownTextProps {
  content: string;
  isUser?: boolean;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({ content, isUser = false }) => {
  if (!content) return null;

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
                borderTop: isUser ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border)',
                margin: '6px 0'
              }}
            />
          );
        }

        // 2. Code Blocks (```code```)
        if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
          const codeContent = trimmed.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
          return (
            <pre
              key={bIdx}
              style={{
                backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : 'var(--surface-raised)',
                border: isUser ? 'none' : '1px solid var(--border)',
                color: isUser ? 'white' : 'var(--text-main)',
                padding: '10px 14px',
                borderRadius: '10px',
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

        // 3. Markdown Tables (| Header | Header |)
        const lines = trimmed.split('\n');
        const isTable = lines.length >= 2 && lines[0].trim().startsWith('|') && lines[0].trim().endsWith('|');
        if (isTable) {
          const headers = lines[0].split('|').map(s => s.trim()).filter(Boolean);
          const bodyRows = lines.slice(1).filter(row => !/^\|?[\s:-]+\|/.test(row.trim()) && !row.includes('---')).map(row =>
            row.split('|').map(s => s.trim()).filter(Boolean)
          );

          return (
            <div key={bIdx} style={{ overflowX: 'auto', margin: '4px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <thead>
                  <tr style={{ backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : 'var(--surface-raised)', borderBottom: '2px solid var(--border)' }}>
                    {headers.map((h, hIdx) => (
                      <th key={hIdx} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: isUser ? 'white' : 'var(--text-main)' }}>
                        {parseInlineMarkdown(h, isUser)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: '7px 10px', color: isUser ? 'white' : 'var(--text-main)' }}>
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

        // 4. Blockquotes (> text)
        if (lines.every(l => l.trim().startsWith('>'))) {
          const quoteText = lines.map(l => l.trim().replace(/^>\s*/, '')).join(' ');
          return (
            <blockquote
              key={bIdx}
              style={{
                borderLeft: isUser ? '3px solid rgba(255,255,255,0.8)' : '3px solid var(--primary)',
                backgroundColor: isUser ? 'rgba(255,255,255,0.08)' : 'var(--secondary-light)',
                padding: '8px 12px',
                borderRadius: '0 8px 8px 0',
                margin: '2px 0',
                fontSize: '0.88rem',
                lineHeight: '1.55'
              }}
            >
              {parseInlineMarkdown(quoteText, isUser)}
            </blockquote>
          );
        }

        // 5. Mixed Line-by-Line Parsing: headings, paragraphs, bullet lists, numbered lists
        const groups: { type: 'h' | 'p' | 'ul' | 'ol'; level?: number; items: string[] }[] = [];
        let currentGroup: { type: 'h' | 'p' | 'ul' | 'ol'; level?: number; items: string[] } | null = null;

        for (const line of lines) {
          const lTrim = line.trim();
          if (!lTrim) continue;

          const headingMatch = lTrim.match(/^(#{1,4})\s+(.+)$/);
          const isUl = lTrim.startsWith('- ') || lTrim.startsWith('* ') || lTrim.startsWith('• ');
          const isOl = /^\d+[.)]\s/.test(lTrim);

          if (headingMatch) {
            currentGroup = { type: 'h', level: headingMatch[1].length, items: [headingMatch[2].trim()] };
            groups.push(currentGroup);
            currentGroup = null;
          } else if (isUl) {
            const itemText = lTrim.replace(/^[-*•]\s*/, '');
            if (currentGroup && currentGroup.type === 'ul') {
              currentGroup.items.push(itemText);
            } else {
              currentGroup = { type: 'ul', items: [itemText] };
              groups.push(currentGroup);
            }
          } else if (isOl) {
            const itemText = lTrim.replace(/^\d+[.)]\s*/, '');
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
              if (grp.type === 'h') {
                const level = grp.level || 3;
                const fontSize = level === 1 ? '1.12rem' : level === 2 ? '1.03rem' : level === 3 ? '0.96rem' : '0.90rem';
                return (
                  <h4
                    key={gIdx}
                    style={{
                      fontSize,
                      fontWeight: 750,
                      marginTop: bIdx === 0 && gIdx === 0 ? '0' : '4px',
                      marginBottom: '1px',
                      color: isUser ? 'white' : 'var(--secondary)',
                      lineHeight: '1.35',
                      letterSpacing: '-0.01em'
                    }}
                  >
                    {parseInlineMarkdown(grp.items[0], isUser)}
                  </h4>
                );
              }
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
                      <li key={iIdx} style={{ lineHeight: '1.6', fontSize: '0.90rem' }}>
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
                      <li key={iIdx} style={{ lineHeight: '1.6', fontSize: '0.90rem' }}>
                        {parseInlineMarkdown(item, isUser)}
                      </li>
                    ))}
                  </ol>
                );
              }
              return (
                <p key={gIdx} style={{ margin: 0, lineHeight: '1.65', fontSize: '0.91rem' }}>
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
    const linkMatch = remaining.match(/^(.*?)\[(.*?)\]\((https?:\/\/[^\s\)]+)\)(.*)/s);
    const boldMatch = remaining.match(/^(.*?)\*\*([^\*]+?)\*\*(.*)/s);
    const italicMatch = remaining.match(/^(.*?)\*([^\*\n]+?)\*(.*)/s);
    const codeMatch = remaining.match(/^(.*?)`([^`]+?)`(.*)/s);

    const matchCandidates = [
      linkMatch ? { type: 'link', pos: linkMatch[1].length, match: linkMatch } : null,
      boldMatch ? { type: 'bold', pos: boldMatch[1].length, match: boldMatch } : null,
      italicMatch && (!boldMatch || italicMatch[1].length < boldMatch[1].length)
        ? { type: 'italic', pos: italicMatch[1].length, match: italicMatch }
        : null,
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
            color: isUser ? '#d1fae5' : 'var(--secondary)',
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
        <strong key={`b_${keyIdx++}`} style={{ fontWeight: 700 }}>
          {m[2]}
        </strong>
      );
      remaining = m[3];
    } else if (earliest.type === 'italic') {
      const m = earliest.match;
      if (m[1]) parts.push(m[1]);
      parts.push(
        <em key={`i_${keyIdx++}`} style={{ fontStyle: 'italic' }}>
          {m[2]}
        </em>
      );
      remaining = m[3];
    } else if (earliest.type === 'code') {
      const m = earliest.match;
      if (m[1]) parts.push(m[1]);
      parts.push(
        <code
          key={`c_${keyIdx++}`}
          style={{
            backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : 'var(--surface-raised)',
            color: isUser ? 'white' : 'var(--text-main)',
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
