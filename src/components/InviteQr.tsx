import { useEffect, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { t } from '../lib/i18n';
import { inviteUrl } from '../lib/invite';

/** A QR code of the room's invite link, for friends sitting next to you to scan and join. */
export function InviteQrSheet({ code, title, onClose }: { code: string; title: string; onClose: () => void }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(inviteUrl(code));
    qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }, [code]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="qr-invite-title" onClick={(e) => e.stopPropagation()} style={{ alignItems: 'center' }}>
        <h2 id="qr-invite-title" className="title title--sm" style={{ fontSize: 22, alignSelf: 'stretch' }}>
          {t('Scan to join {room}', { room: title })}
        </h2>
        {/* Always dark on white so phone cameras can read it, in dark mode too. */}
        <div
          role="img"
          aria-label={t('QR code to join room {code}', { code })}
          style={{ width: '100%', maxWidth: 280, padding: 12, borderRadius: 16, background: '#FFFFFF', color: '#000000' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, letterSpacing: '0.14em' }}>{code}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{t('Point a phone camera at it. It opens Makan apa? with the code filled in.')}</span>
        <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ alignSelf: 'stretch', height: 48 }}>
          {t('Close')}
        </button>
      </div>
    </div>
  );
}
