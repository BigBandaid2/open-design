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
import { AmrLoginPill } from './AmrLoginPill';
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
// succeed, so the send is stopped BEFORE any run spawns — unlike the
// post-failure AMR_INSUFFICIENT_BALANCE error card which appears after a run
// already burned its startup. It fires at the moment of PEAK intent — the
// user just wrote a task and pressed send — so it must read as "one step from
// starting", never as an error. Two variants with distinct copy AND CTAs:
//
//   insufficient — signed in, wallet definitively empty. CTA opens the
//     console WALLET page (not the plans modal directly: free users landing
//     on the wallet already get the subscription modal auto-opened, while
//     paying users see top-up options in place). Balance badge shown.
//
//   signed_out — Open Design Cloud selected but no account session. The CTA
//     is the in-app sign-in (AmrLoginPill: spawns vela login, surfaces the
//     activation link when the browser doesn't auto-open, polls until done);
//     sending the user to the wallet website would be a dead end. On a
//     successful sign-in the dialog closes itself.
//
// Both variants keep the benefits list (they sell the service to exactly the
// not-yet-committed cohort). The caller preserves the payload (home keeps
// the composer draft; chat parks the full send in the queue). The softer
// low-balance reminder lives in AmrLowBalanceDialog; this hard tier is never
// subject to its opt-out.
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
  const signedOut = reason === 'signed_out';
  const signInEntrySource =
    entrySource === 'home_balance_gate_upgrade'
      ? ('home_balance_gate_sign_in' as const)
      : ('chat_balance_gate_sign_in' as const);
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
      ariaLabel={signedOut ? t('chat.amrBalanceGate.signedOutTitle') : t('chat.amrBalanceGate.title')}
      onClose={onClose}
      closeOnEscape
      className={styles.panel}
      data-testid="amr-balance-dialog"
    >
      <div className={styles.iconBadge} aria-hidden>
        <Icon name="sparkles" size={22} />
      </div>
      <h2 className={styles.title}>
        {signedOut ? t('chat.amrBalanceGate.signedOutTitle') : t('chat.amrBalanceGate.title')}
      </h2>
      <p className={styles.message}>
        {signedOut
          ? t('chat.amrBalanceGate.signedOutMessage')
          : t('chat.amrBalanceGate.message')}
      </p>
      {!signedOut && formattedBalance ? (
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
        {signedOut ? (
          <AmrLoginPill
            className={styles.signInPill}
            signInLabel={t('chat.amrBalanceGate.signInCta')}
            amrEntrySourceDetail={signInEntrySource}
            metricsConsent={metricsConsent}
            installationId={installationId}
            showActivationDetails
            hideSignedOutStatus
            revealPendingCancelAction
            onStatusChange={(loginStatus) => {
              // Signed in — the gate's reason is gone; close so the user can
              // resend (or run the parked queue item) straight away.
              if (loginStatus?.loggedIn === true) onClose();
            }}
          />
        ) : (
          <Button
            variant="primary"
            className={styles.cta}
            onClick={openWallet}
            data-testid="amr-balance-dialog-plans"
          >
            {t('chat.amrBalanceGate.plansCta')}
          </Button>
        )}
        <Button variant="ghost" className={styles.later} onClick={onClose}>
          {t('chat.amrBalanceGate.laterCta')}
        </Button>
      </div>
    </Dialog>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
