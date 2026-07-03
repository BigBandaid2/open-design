import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { amrPlansUrlForProfile } from '../runtime/amr-guidance';
import { formatVelaBalanceUsd } from '../providers/daemon';
import { Icon } from './Icon';
import styles from './AmrBalanceDialog.module.css';

interface Props {
  /** Raw wallet balance string from the blocking snapshot; null hides the caption. */
  balanceUsd: string | null;
  /** Open Design Cloud profile from the blocking snapshot; picks the plans origin. */
  profile: string | null;
  /** Which surface blocked the send — keys the amr_entry attribution. */
  entrySource: 'home_balance_gate_upgrade' | 'chat_balance_gate_upgrade';
  metricsConsent: boolean;
  installationId: string | null | undefined;
  onClose: () => void;
}

// Subscription invitation shown when an Open Design Cloud task is blocked by
// an empty wallet (see checkAmrBalanceGate). It fires at the moment of PEAK
// intent — the user just wrote a task and pressed send — so it must read as
// "one step from starting", never as an error:
//   - the title sells the outcome (keep creating), not the problem;
//   - three short benefits lower the subscription hesitation;
//   - one full-width CTA to the plans view; dismissal is a quiet text button;
//   - the balance is a quiet badge under the message — explanatory context
//     for why the gate fired, not the star.
// The caller preserves the draft (home keeps the composer text; chat restores
// it), which is what makes the "this task can start right away" promise true.
export function AmrBalanceDialog({
  balanceUsd,
  profile,
  entrySource,
  metricsConsent,
  installationId,
  onClose,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const formattedBalance = formatVelaBalanceUsd(balanceUsd);
  const openPlans = () => {
    // Same attribution handshake as the other Open Design Cloud handoffs
    // (ChatPane recharge, AvatarMenu upgrade): record the amr_entry, forward
    // the consent-gated device id, open the plans view for the profile.
    const attribution = recordAmrEntry(analytics.track, entrySource, new Date(), {
      metricsConsent,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(amrPlansUrlForProfile(profile), attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  };
  const benefits = [
    t('chat.amrBalanceGate.benefit1'),
    t('chat.amrBalanceGate.benefit2'),
    t('chat.amrBalanceGate.benefit3'),
    t('chat.amrBalanceGate.benefit4'),
  ];
  const dialog = (
    <Dialog
      role="alertdialog"
      ariaLabel={t('chat.amrBalanceGate.title')}
      onClose={onClose}
      closeOnEscape
      className={styles.panel}
      data-testid="amr-balance-dialog"
    >
      <div className={styles.iconBadge} aria-hidden>
        <Icon name="sparkles" size={22} />
      </div>
      <h2 className={styles.title}>{t('chat.amrBalanceGate.title')}</h2>
      <p className={styles.message}>{t('chat.amrBalanceGate.message')}</p>
      {formattedBalance ? (
        <span className={styles.balancePill}>
          {t('chat.amrBalanceGate.balanceLabel')} {formattedBalance}
        </span>
      ) : null}
      <ul className={styles.benefits}>
        {benefits.map((benefit) => (
          <li key={benefit} className={styles.benefit}>
            <span className={styles.benefitIcon} aria-hidden>
              <Icon name="check" size={14} />
            </span>
            {benefit}
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Button
          variant="primary"
          className={styles.cta}
          onClick={openPlans}
          data-testid="amr-balance-dialog-plans"
        >
          {t('chat.amrBalanceGate.plansCta')}
        </Button>
        <Button variant="ghost" className={styles.later} onClick={onClose}>
          {t('chat.amrBalanceGate.laterCta')}
        </Button>
      </div>
    </Dialog>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
