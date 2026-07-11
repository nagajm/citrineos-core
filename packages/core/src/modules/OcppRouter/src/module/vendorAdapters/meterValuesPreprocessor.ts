// SPDX-FileCopyrightText: 2026 Zappo
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig, Call } from '@citrineos/base';
import { OCPP_CallAction } from '@citrineos/base';
import type { Logger } from 'tslog';
import type { ILogObj } from 'tslog';
import {
  getMeasurandMappings,
  getVendorForConnection,
  insertVendorDiagnostic,
  KNOWN_VENDOR_IDS,
} from './vendorRegistry.js';

// The full OCPP 1.6 MeterValuesRequestMeasurand enum (schemas/MeterValuesRequest.json) — kept
// as a literal constant here since it's a fixed part of the spec, not something that varies
// per vendor. Anything NOT in this set is either re-mapped or side-channeled below.
const STANDARD_MEASURANDS = new Set([
  'Energy.Active.Export.Register',
  'Energy.Active.Import.Register',
  'Energy.Reactive.Export.Register',
  'Energy.Reactive.Import.Register',
  'Energy.Active.Export.Interval',
  'Energy.Active.Import.Interval',
  'Energy.Reactive.Export.Interval',
  'Energy.Reactive.Import.Interval',
  'Power.Active.Export',
  'Power.Active.Import',
  'Power.Offered',
  'Power.Reactive.Export',
  'Power.Reactive.Import',
  'Power.Factor',
  'Current.Import',
  'Current.Export',
  'Current.Offered',
  'Voltage',
  'Frequency',
  'Temperature',
  'SoC',
  'RPM',
]);

interface SampledValue {
  measurand?: string;
  value: string;
  unit?: string;
  phase?: string;
  context?: string;
  [key: string]: unknown;
}

interface MeterValueEntry {
  timestamp: string;
  sampledValue?: SampledValue[];
}

interface MeterValuesPayload {
  transactionId?: number;
  meterValue?: MeterValueEntry[];
}

/**
 * Only engages for known non-standard vendors (vendorRegistry.KNOWN_VENDOR_IDS) and only for
 * MeterValues — every other action, and every other vendor, passes through byte-for-byte
 * unchanged. Mutates the Call's payload in place so whatever reaches standard OCPP schema
 * validation downstream (and every consumer after it) only ever sees standard-shaped
 * measurands. This is the single point every future vendor's quirks get classified at —
 * nothing else in the OCPP pipeline needs to change to onboard one.
 */
export async function preprocessMeterValues(
  rpcMessage: Call,
  ocppConnectionName: string,
  config: BootstrapConfig,
  logger: Logger<ILogObj>,
): Promise<void> {
  if (rpcMessage[2] !== OCPP_CallAction.MeterValues) return;

  const vendorId = await getVendorForConnection(ocppConnectionName, config, logger);
  if (!vendorId || !KNOWN_VENDOR_IDS.has(vendorId)) return;

  const payload = rpcMessage[3] as unknown as MeterValuesPayload;
  const meterValues = payload?.meterValue;
  if (!Array.isArray(meterValues)) return;

  const mappings = await getMeasurandMappings(vendorId, config, logger);
  const mappingByMeasurand = new Map(mappings.map((m) => [m.vendorMeasurand, m]));
  const diagnostics: Array<{ type: string; payload: unknown; recordedAt: Date }> = [];

  for (const mv of meterValues) {
    if (!Array.isArray(mv.sampledValue)) continue;
    const kept: SampledValue[] = [];

    for (const sv of mv.sampledValue) {
      const measurand = sv?.measurand;
      if (!measurand || STANDARD_MEASURANDS.has(measurand)) {
        kept.push(sv);
        continue;
      }

      const mapping = mappingByMeasurand.get(measurand);
      if (mapping?.standardMeasurand) {
        // Job #1 — this vendor's field IS a standard OCPP concept, just expressed oddly
        // (e.g. phase baked into the measurand name). Rewrite it and let it flow through
        // the unmodified standard pipeline exactly like any other standard reading.
        const rewritten: SampledValue = { ...sv, measurand: mapping.standardMeasurand };
        if (mapping.targetPhase) rewritten.phase = mapping.targetPhase;
        if (mapping.targetUnit) rewritten.unit = mapping.targetUnit;
        if (mapping.valueMultiplier && Number(mapping.valueMultiplier) !== 1) {
          const numeric = Number(sv.value);
          if (!Number.isNaN(numeric)) {
            rewritten.value = String(numeric * Number(mapping.valueMultiplier));
          }
        }
        kept.push(rewritten);
      } else {
        // Job #2 — no standard equivalent (explicitly classified, or not yet classified at
        // all). Either way: never silently drop it, side-channel it instead of letting one
        // non-standard measurand fail the entire MeterValues message.
        if (!mapping) {
          logger.warn(
            `preprocessMeterValues: unrecognized measurand '${measurand}' from vendor ` +
              `'${vendorId}' on ${ocppConnectionName} — captured to vendor_diagnostics as ` +
              `unclassified. Add a vendor_measurand_mappings row to classify it properly ` +
              `(remap to a standard measurand, or explicit strip).`,
          );
        }
        diagnostics.push({
          type: mapping ? `measurand_${measurand}` : `unclassified_${measurand}`,
          payload: { measurand, value: sv.value, unit: sv.unit, context: sv.context },
          recordedAt: new Date(mv.timestamp),
        });
      }
    }

    mv.sampledValue = kept;
  }

  for (const d of diagnostics) {
    await insertVendorDiagnostic(
      {
        ocppConnectionName,
        vendorId,
        source: 'meter',
        type: d.type,
        transactionId: payload.transactionId,
        payload: d.payload,
        recordedAt: d.recordedAt,
      },
      config,
      logger,
    );
  }
}
