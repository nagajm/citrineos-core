// SPDX-FileCopyrightText: 2026 Zappo
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig, Call } from '@citrineos/base';
import { OCPP_CallAction } from '@citrineos/base';
import type { Logger } from 'tslog';
import type { ILogObj } from 'tslog';
import { getVendorForConnection, KNOWN_VENDOR_IDS } from './vendorRegistry.js';

interface StartTransactionPayload {
  connectorId?: number;
  idTag?: string;
  meterStart?: number;
  timestamp?: string;
  reservationId?: number;
}

/**
 * ZappoEarth/Bolt.Earth's card-tap StartTransaction omits both required fields entirely
 * (confirmed live 2026-07-11: FormatViolation, missing meterStart + timestamp) rather than
 * sending them under a different name — so unlike the MeterValues fix, there's nothing to
 * re-map, only a default to backfill before the message reaches standard validation.
 *   - timestamp: no billing impact — backfilled with the CSMS's own receipt time, since the
 *     charger isn't reporting its own clock here at all.
 *   - meterStart: billing-relevant, but this firmware's energy register is observed to reset
 *     near zero each session (same pattern already handled for EVerest — see
 *     driver-sessions.service.ts's getSessionKwh), confirmed by the one real session captured
 *     before this fix. Defaults to 0 on that basis; if a future vendor's meter does NOT reset
 *     between sessions, give that vendor a real lookup instead of changing this default.
 */
export async function preprocessStartTransaction(
  rpcMessage: Call,
  ocppConnectionName: string,
  config: BootstrapConfig,
  logger: Logger<ILogObj>,
): Promise<void> {
  if (rpcMessage[2] !== OCPP_CallAction.StartTransaction) return;

  const vendorId = await getVendorForConnection(ocppConnectionName, config, logger);
  if (!vendorId || !KNOWN_VENDOR_IDS.has(vendorId)) return;

  const payload = rpcMessage[3] as unknown as StartTransactionPayload;
  const missing: string[] = [];

  if (payload.timestamp === undefined) {
    payload.timestamp = new Date().toISOString();
    missing.push('timestamp');
  }
  if (payload.meterStart === undefined) {
    payload.meterStart = 0;
    missing.push('meterStart');
  }

  if (missing.length) {
    logger.warn(
      `preprocessStartTransaction: backfilled missing field(s) [${missing.join(', ')}] for ` +
        `vendor '${vendorId}' on ${ocppConnectionName} — firmware sent an incomplete ` +
        `StartTransaction.req.`,
    );
  }
}
