/**
 * Component pour prévisualiser des images/SVG depuis une URL
 */

import { useState, useRef } from 'react';
import { X, Link, AlertCircle } from 'lucide-react';
import './ImagePreviewModal.css';

export default function ImagePreviewModal({ onInsert, onClose }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const imageRef = useRef(null);

  const isValidImageUrl = (urlStr) => {
    try {
      const parsed = new URL(urlStr);
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.heic'];
      const pathname = parsed.pathname.toLowerCase();
      return validExtensions.some(ext => pathname.endsWith(ext));
    } catch {
      return false;
    }
  };

  const loadImage = async (urlStr) => {
    if (!urlStr.trim()) {
      setError('Veuillez entrer une URL');
      return;
    }

    if (!isValidImageUrl(urlStr)) {
      setError('URL invalide ou format non supporté (JPG, JPEG, PNG, GIF, WebP, SVG, BMP, ICO, HEIC)');
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setPreview({
          url: urlStr,
          type: urlStr.toLowerCase().endsWith('.svg') ? 'svg' : 'image',
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setLoading(false);
      };
      img.onerror = () => {
        setError('Impossible de charger l\'image. Vérifiez l\'URL et les permissions CORS.');
        setLoading(false);
      };
      img.src = urlStr;
    } catch (err) {
      setError(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (preview && onInsert) {
      onInsert({
        type: 'image',
        url: preview.url,
        alt: `Image ${preview.width}x${preview.height}`,
      });
      onClose();
    }
  };

  return (
    <div className="image-preview-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="image-preview-modal">
        <div className="image-preview-header">
          <h3>Insérer une image depuis URL</h3>
          <button className="image-preview-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="image-preview-content">
          <div className="image-preview-input-group">
            <input
              type="url"
              placeholder="https://example.com/image.png"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadImage(url)}
            />
            <button onClick={() => loadImage(url)} disabled={loading}>
              {loading ? 'Chargement…' : 'Charger'}
            </button>
          </div>

          {error && (
            <div className="image-preview-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {preview && (
            <div className="image-preview-container">
              {preview.type === 'svg' ? (
                <embed src={preview.url} type="image/svg+xml" alt={preview.alt} />
              ) : (
                <img src={preview.url} alt={preview.alt} />
              )}
              <p className="image-preview-info">
                {preview.width}×{preview.height}px
              </p>
              <button className="image-preview-insert-btn" onClick={handleInsert}>
                <Link size={16} />
                Insérer l'image
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
