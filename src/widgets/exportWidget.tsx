import { usePlugin, renderWidget, useTracker } from '@remnote/plugin-sdk';
import { useState, useEffect } from 'react';
import { buildRemXml, xmlGetRemText } from './xmlExportUtils';

function ExportWidget() {
  const plugin = usePlugin();
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [remName, setRemName] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const [xmlContent, setXmlContent] = useState('');

  const focusedRem = useTracker(async (reactPlugin) => {
    return await reactPlugin.focus.getFocusedRem();
  });

  useEffect(() => {
    if (!focusedRem) { setRemName(''); setStatus(''); return; }
    xmlGetRemText(plugin, focusedRem).then(n => setRemName(n || '(unnamed)'));
  }, [focusedRem?._id]);

  const handleExport = async () => {
    if (!focusedRem || exporting) return;
    setExporting(true);
    setXmlContent('');
    setStatus('Building…');
    try {
      const xml = await buildRemXml(plugin, focusedRem, new Set(), 0, maxDepth);
      setXmlContent(xml);

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(xml);
        } else {
          throw new Error('Clipboard API unavailable');
        }
        setStatus('Ready – copied to clipboard');
        await plugin.app.toast('XML copied to clipboard!');
      } catch {
        const fallback = (): boolean => {
          const ta = document.createElement('textarea');
          ta.value = xml;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          ta.style.top = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        };
        const ok = fallback();
        if (ok) {
          setStatus('Ready – copied to clipboard');
          await plugin.app.toast('XML copied to clipboard!');
        } else {
          setStatus('Clipboard failed – use the text field below');
        }
      }
    } catch (err) {
      console.error('XML export error:', err);
      setStatus('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyTextarea = async () => {
    if (!xmlContent) return;
    try {
      await navigator.clipboard.writeText(xmlContent);
      setStatus('Ready – copied to clipboard');
    } catch {
      setStatus('Clipboard failed – select all and copy manually');
    }
  };

  const canExport = !!focusedRem && !exporting;

  return (
    <div style={{
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      fontFamily: 'inherit',
      boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: '0.82em', opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {focusedRem ? `Rem: ${remName}` : 'Focus a rem to export'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em' }}>
        <label htmlFor="max-depth-input" style={{ whiteSpace: 'nowrap' }}>Max Depth</label>
        <select
          id="max-depth-input"
          value={maxDepth}
          onChange={e => setMaxDepth(parseInt(e.target.value, 10))}
          style={{
            padding: '3px 5px',
            borderRadius: '4px',
            border: '1px solid var(--border-color, #ccc)',
            background: 'var(--background-color, #fff)',
            color: 'var(--main-text-color, #111)',
            fontFamily: 'inherit',
            fontSize: '1em',
          }}
        >
          <option value={0}>Unlimited</option>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleExport}
        disabled={!canExport}
        style={{
          padding: '7px 14px',
          borderRadius: '6px',
          border: '1px solid var(--border-color, #ccc)',
          background: canExport ? 'var(--interactive-color, #0066cc)' : 'transparent',
          color: canExport ? '#fff' : 'inherit',
          cursor: canExport ? 'pointer' : 'not-allowed',
          fontSize: '0.9em',
          fontFamily: 'inherit',
          opacity: canExport ? 1 : 0.4,
          transition: 'opacity 0.15s',
        }}
      >
        {exporting ? 'Exporting…' : 'Export Hierarchy to XML'}
      </button>

      {status && (
        <div style={{ fontSize: '0.78em', opacity: 0.75 }}>
          {status}
        </div>
      )}

      {xmlContent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleCopyTextarea}
              style={{
                padding: '3px 10px',
                borderRadius: '4px',
                border: '1px solid var(--border-color, #ccc)',
                background: 'var(--interactive-color, #0066cc)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.78em',
                fontFamily: 'inherit',
              }}
            >
              Copy
            </button>
          </div>
          <textarea
            readOnly
            value={xmlContent}
            style={{
              width: '100%',
              height: '450px',
              fontFamily: 'monospace',
              fontSize: '0.78em',
              whiteSpace: 'pre',
              overflow: 'auto',
              resize: 'vertical',
              boxSizing: 'border-box',
              padding: '8px',
              border: '1px solid var(--border-color, #ccc)',
              borderRadius: '4px',
              background: 'var(--background-color, #fff)',
              color: 'var(--main-text-color, #111)',
            }}
          />
        </div>
      )}
    </div>
  );
}

renderWidget(ExportWidget);
