function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function ClueMedia({ type, mediaUrl, compact = false }) {
  const maxHeight = compact ? 220 : 400;

  if (!type || type === 'regular' || !mediaUrl) return null;

  if (type === 'image') {
    return (
      <img
        src={mediaUrl}
        alt="clue"
        style={{ maxWidth: '100%', maxHeight, borderRadius: 8, display: 'block', margin: '12px auto 0' }}
      />
    );
  }

  if (type === 'video') {
    const videoId = extractYouTubeId(mediaUrl);
    if (!videoId) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <iframe
          width={compact ? 480 : 640}
          height={compact ? 270 : 360}
          src={`https://www.youtube.com/embed/${videoId}?rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 8, border: 'none' }}
        />
      </div>
    );
  }

  return null;
}
