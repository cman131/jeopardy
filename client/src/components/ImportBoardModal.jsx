import { useState, useRef } from 'react';
import { validateBoardJson, parseBuzzingaCsv } from '../utils/boardImportUtils.js';

export default function ImportBoardModal({ onImport, onClose }) {
  const [format, setFormat] = useState('json');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  function handleFormatChange(newFormat) {
    setFormat(newFormat);
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFileChange(e) {
    setFile(e.target.files[0] || null);
    setError(null);
  }

  function handleImport() {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      try {
        if (format === 'json') {
          const data = JSON.parse(text);
          if (!validateBoardJson(data)) {
            setError(
              'Invalid board JSON. Must contain round1, round2, and finalJeopardy sections. Old single-round boards are not supported.',
            );
            return;
          }
          onImport(data, 0);
        } else {
          const { board, warnings } = parseBuzzingaCsv(text);
          onImport(board, warnings);
        }
      } catch {
        setError(format === 'json' ? 'Invalid JSON file.' : 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 10, padding: 24, width: 380,
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--color-white)', marginBottom: 16 }}>
          Import Board
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 8, letterSpacing: 1 }}>
            FORMAT
          </div>
          {[
            { value: 'json', label: 'Our JSON format' },
            { value: 'buzzinga', label: 'Buzzinga CSV' },
          ].map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                cursor: 'pointer', color: 'var(--color-muted)', fontSize: 13,
              }}
            >
              <input
                type="radio"
                name="importFormat"
                value={opt.value}
                checked={format === opt.value}
                onChange={() => handleFormatChange(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={format === 'json' ? '.json' : '.csv'}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', padding: '8px 12px', background: 'var(--bg-panel)',
              border: '1px dashed var(--border-subtle)', borderRadius: 6,
              color: file ? 'var(--color-white)' : 'var(--color-muted)',
              fontSize: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            {file ? file.name : `Choose ${format === 'json' ? '.json' : '.csv'} file…`}
          </button>
        </div>

        {error && (
          <div style={{
            background: '#450a0a', border: '1px solid #b91c1c', borderRadius: 6,
            padding: '8px 12px', marginBottom: 16, fontSize: 12, color: 'var(--color-red)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', background: 'var(--bg-panel)', border: 'none',
              color: 'var(--color-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file}
            style={{
              padding: '8px 16px', background: file ? '#1d4ed8' : 'var(--bg-panel)',
              border: 'none', color: file ? '#fff' : 'var(--color-muted)',
              borderRadius: 6, cursor: file ? 'pointer' : 'not-allowed',
              fontWeight: 'bold', fontSize: 12,
            }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
