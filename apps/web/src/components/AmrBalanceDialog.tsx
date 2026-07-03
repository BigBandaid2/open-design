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
import { amrConsoleUrlForProfile } from '../runtime/amr-guidance';
import { formatVelaBalanceUsd } from '../providers/daemon';
import { Icon } from './Icon';
import styles from './AmrBalanceDialog.module.css';

interface Props {
  /** Why the send was hard-blocked: empty wallet, or not signed in at all. */
  reason: 'insufficient' | 'signed_out';
  /** Raw wallet balance string from the blocking snapshot; null hides the badge. */
  balanceUsd: string | null;
  /** Open Design Cloud profile from the blocking snapshot; picks the console origin. */
  profile: string | null;
  /** Which surface blocked the send — keys the amr_entry attribution. */
  entrySource: 'home_balance_gate_upgrade' | 'chat_balance_gate_upgrade';
  metricsConsent: boolean;
  installationId: string | null | undefined;
  onClose: () => void;
}

// HARD pre-run blocker for Open Design Cloud tasks: the run cannot possibly
// succeed (empty wallet or signed out), so the send is stopped BEFORE any run
// spawns — unlike the post-failure AMR_INSUFFICIENT_BALANCE error card which
// appears after a run already burned its startup. It fires at the moment of
// PEAK intent — the user just wrote a task and pressed send — so it must read
// as "one step from starting", never as an error:
//   - the title sells the outcome (keep creating), not the problem;
//   - three short benefits lower the subscription hesitation;
//   - one full-width CTA opens the console WALLET page (not the plans modal
//     directly: free users landing on the wallet already get the subscription
//     modal auto-opened, while paying users see top-up options in place);
//   - the balance is a quiet badge under the message — explanatory context
//     for why the gate fired, not the star.
// The caller preserves the payload (home keeps the composer draft; chat parks
// the full send in the queue), which is what makes the "this task can start
// right away" promise true. The softer low-balance reminder lives in
// AmrLowBalanceDialog; this hard tier is never subject to its opt-out.
export function AmrBalanceDialog({
  reason,
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
  const openWallet = () => {
    // Same attribution handshake as the other Open Design Cloud handoffs
    // (ChatPane recharge, AvatarMenu upgrade): record the amr_entry, forward
    // the consent-gated device id, and open the console for the profile.
    const attribution = recordAmrEntry(analytics.track, entrySource, new Date(), {
      metricsConsent,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(amrConsoleUrlForProfile(profile), attribution, deviceId),
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
      <p className={styles.message}>
        {reason === 'signed_out'
          ? t('chat.amrBalanceGate.signedOutMessage')
          : t('chat.amrBalanceGate.message')}
      </p>
      {reason === 'insufficient' && formattedBalance ? (
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
          onClick={openWallet}
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
