import { useNavigate } from 'react-router-dom';

export default function NavBreadcrumb() {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => navigate('/')}
        style={{
          background: 'var(--bg-panel)',
          color: 'var(--color-muted)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        ← Home
      </button>
    </div>
  );
}
