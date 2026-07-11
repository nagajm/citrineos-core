// SPDX-FileCopyrightText: 2026 Zappo
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig } from '@citrineos/base';
import type { Logger } from 'tslog';
import type { ILogObj } from 'tslog';
import { insertVendorDiagnostic } from '../../../../OcppRouter/src/module/vendorAdapters/vendorRegistry.js';

// ZappoEarth/Bolt.Earth push these three DataTransfer sub-types (embedded as a JSON string in
// the `data` field, keyed by their own `type`), never using OCPP's messageId field to route
// within the vendor namespace. Captured as-is — this is device/fleet health telemetry with no
// standard OCPP equivalent at all, not something to remap.
export async function handleBoltDataTransfer(
  ocppConnectionName: string,
  vendorId: string,
  rawData: string | undefined,
  config: BootstrapConfig,
  logger: Logger<ILogObj>,
): Promise<void> {
  if (!rawData) return;
  let parsed: { type?: string; [key: string]: unknown };
  try {
    parsed = JSON.parse(rawData);
  } catch (error) {
    logger.warn(`handleBoltDataTransfer: unparseable data field from ${ocppConnectionName}`, error);
    return;
  }

  const { type, ...rest } = parsed;
  await insertVendorDiagnostic(
    {
      ocppConnectionName,
      vendorId,
      source: 'datatransfer',
      type: type ?? 'unknown',
      payload: rest,
      recordedAt: new Date(),
    },
    config,
    logger,
  );
}
