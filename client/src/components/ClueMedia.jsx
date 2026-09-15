function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function ClueMedia({ type, mediaUrl, compact = false, mediaReady = true }) {
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

    if (!mediaReady) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: compact ? 480 : 640,
          height: compact ? 270 : 360,
          background: '#111',
          borderRadius: 8,
          margin: '12px auto 0',
        }}>
          <span style={{ color: '#555', fontSize: 14 }}>▶ Video ready — host will start playback</span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <iframe
          width={compact ? 480 : 640}
          height={compact ? 270 : 360}
          src={`https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 8, border: 'none' }}
        />
      </div>
    );
  }

  if (type === 'audio') {
    if (!mediaReady) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 64,
          maxWidth: compact ? 480 : 640,
          background: '#111',
          borderRadius: 8,
          margin: '12px auto 0',
        }}>
          <span style={{ color: '#555', fontSize: 14 }}>♪ Audio ready — host will start playback</span>
        </div>
      );
    }

    return (
      <audio
        autoPlay
        controls
        src={mediaUrl}
        style={{ display: 'block', margin: '12px auto 0', maxWidth: '100%' }}
      />
    );
  }

  return null;
}
