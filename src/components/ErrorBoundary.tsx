import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/errors';
import { t } from '../lib/i18n';

/** If a screen crashes, report it and offer a reload instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error, 'render');
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="app" style={{ justifyContent: 'center', padding: 24, gap: 16 }}>
        <h1 className="title" style={{ fontSize: 40, lineHeight: 0.95 }}>
          Makan <span style={{ color: 'var(--accent)' }}>apa?</span>
        </h1>
        <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--muted)' }}>{t("Something went wrong on this screen. We've noted it. Reloading usually fixes it.")}</p>
        <button type="button" className="btn btn--primary press" onClick={() => location.reload()}>
          {t('Reload')}
        </button>
      </div>
    );
  }
}
