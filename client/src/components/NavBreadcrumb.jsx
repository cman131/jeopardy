import { useNavigate } from 'react-router-dom';

export default function NavBreadcrumb() {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => navigate('/')}
        style={{
          background: '#1e293b',
          color: '#94a3b8',
          border: 'none',
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
